/**
 * scrollEngine.js
 * Core orchestrator for the deterministic Smart Scroll engine.
 * Uses an async control loop (scroll -> settle -> evaluate -> delay) with live telemetry.
 */

(function (global) {
  const ContainerDetector = global.ContainerDetector;
  const ScrollController = global.ScrollController;
  const SettlementDetector = global.SettlementDetector;
  const StopConditions = global.StopConditions;

  class ScrollEngine {
    constructor() {
      this.isRunning = false;
      this.isPaused = false;
      this.loopPromise = null;

      this.container = null;
      this.controller = new ScrollController(window);
      this.settlement = null;
      this.stopConditions = new StopConditions();

      this.config = {
        stepPx: 500,
        delayMs: 2000,
        mode: "infinite", // "infinite" | "single"
        stopConditions: {
          maxScrolls: 0,
          maxDurationMinutes: 0,
          stopOnBottom: true,
          noActivityTimeoutSec: 10
        }
      };

      this.telemetry = {
        scrollsCount: 0,
        startTime: 0,
        elapsedSeconds: 0,
        mutationsDetected: 0,
        status: "idle", // "idle" | "running" | "paused" | "stopped" | "finished"
        stopReason: null
      };

      this._initMessageListeners();
    }

    /**
     * Start scrolling engine with options
     */
    async start(options = {}) {
      if (this.isRunning) {
        console.warn("🎯 SmartScroll is already running.");
        return this.getState();
      }

      this.config = {
        ...this.config,
        ...options,
        stopConditions: {
          ...this.config.stopConditions,
          ...(options.stopConditions || {})
        }
      };

      // 1. Detect scrollable container
      this.container = ContainerDetector ? ContainerDetector.findBestScrollContainer() : window;
      this.controller.setTarget(this.container);

      // 2. Initialize settlement detector
      if (this.settlement) this.settlement.destroy();
      this.settlement = new SettlementDetector(this.container);

      // 3. Configure stop rules
      this.stopConditions.updateConfig(this.config.stopConditions);

      // 4. Initialize telemetry
      this.isRunning = true;
      this.isPaused = false;
      this.telemetry = {
        scrollsCount: 0,
        startTime: Date.now(),
        elapsedSeconds: 0,
        mutationsDetected: 0,
        status: "running",
        stopReason: null
      };

      this._broadcastState();

      // 5. Execute Single Step or Loop
      if (this.config.mode === "single") {
        await this.stepOnce();
        this.stop("Single scroll step completed");
      } else {
        this.loopPromise = this._runAsyncLoop();
      }

      return this.getState();
    }

    /**
     * Stop scrolling engine
     */
    stop(reason = "User stopped") {
      if (!this.isRunning) return this.getState();

      this.isRunning = false;
      this.telemetry.status = "stopped";
      this.telemetry.stopReason = reason;
      this.telemetry.elapsedSeconds = Math.floor((Date.now() - this.telemetry.startTime) / 1000);

      if (this.settlement) {
        this.settlement.destroy();
      }

      this._broadcastState();
      return this.getState();
    }

    /**
     * Single step scroll execution
     */
    async stepOnce(stepPx = null) {
      const px = stepPx || this.config.stepPx || 500;
      if (!this.container) {
        this.container = ContainerDetector ? ContainerDetector.findBestScrollContainer() : window;
        this.controller.setTarget(this.container);
      }

      const res = await this.controller.scroll(px, true);
      this.telemetry.scrollsCount++;

      // Trigger passive scanners if LeadHunter is active on page
      if (typeof window.detectAndProcessPosts === "function") {
        try { window.detectAndProcessPosts(); } catch (e) {}
      }

      this._broadcastState();
      return res;
    }

    /**
     * Async Control Loop (scroll -> settle -> check stop -> delay -> repeat)
     */
    async _runAsyncLoop() {
      while (this.isRunning) {
        // 1. Execute smooth scroll
        const scrollRes = await this.controller.scroll(this.config.stepPx, true);
        this.telemetry.scrollsCount++;
        this.telemetry.elapsedSeconds = Math.floor((Date.now() - this.telemetry.startTime) / 1000);

        // 2. Wait for settlement (DOM additions) with configured delay
        const settleResult = await this.settlement.waitForSettlement(Math.max(300, this.config.delayMs));
        this.telemetry.mutationsDetected = this.settlement.activityEventsCount;

        // If position changed or new nodes were found, refresh activity timestamp
        if (Math.abs(scrollRes.scrolledDelta) > 10 || settleResult.activityDetected) {
          if (this.settlement) this.settlement.lastActivityTime = Date.now();
        }

        // 3. Trigger radar detection if available
        if (typeof window.detectAndProcessPosts === "function") {
          try { window.detectAndProcessPosts(); } catch (e) {}
        }

        // 4. Evaluate stop conditions
        const evalState = {
          scrollsCount: this.telemetry.scrollsCount,
          startTime: this.telemetry.startTime,
          atBottom: scrollRes.atBottom,
          lastActivityTime: this.settlement ? this.settlement.lastActivityTime : Date.now(),
          isStopped: !this.isRunning
        };

        const stopCheck = this.stopConditions.evaluate(evalState);
        if (stopCheck.shouldStop) {
          console.log("🎯 SmartScroll stopping:", stopCheck.reason);
          this.stop(stopCheck.reason || "Finished");
          break;
        }

        // 5. Broadcast live telemetry
        this._broadcastState();

        // 6. Remaining delay pause before next step (with slight 5% natural variation)
        const remainingDelay = Math.max(100, this.config.delayMs - settleResult.elapsedMs);
        const naturalDelay = Math.floor(remainingDelay * (0.95 + Math.random() * 0.1));
        await new Promise(resolve => setTimeout(resolve, naturalDelay));
      }
    }

    /**
     * Current state getter
     */
    getState() {
      if (this.isRunning && this.telemetry.startTime) {
        this.telemetry.elapsedSeconds = Math.floor((Date.now() - this.telemetry.startTime) / 1000);
      }
      return {
        isRunning: this.isRunning,
        config: this.config,
        telemetry: { ...this.telemetry }
      };
    }

    /**
     * Broadcast telemetry to popup & extension runtime
     */
    _broadcastState() {
      const state = this.getState();

      // Send to extension runtime if available
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: "SMART_SCROLL_STATE_CHANGED",
            state
          });
        } catch (e) {}
      }

      // Dispatch custom DOM event on window for on-page scripts
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("smartscroll:telemetry", { detail: state }));
      }
    }

    /**
     * Handle incoming Chrome runtime messages
     */
    _initMessageListeners() {
      if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.onMessage) return;

      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message || !message.type) return;

        if (message.type === "SMART_SCROLL_START") {
          this.start(message.config || {}).then(state => sendResponse({ ok: true, state }));
          return true; // Keep channel open for async response
        } else if (message.type === "SMART_SCROLL_STOP") {
          const state = this.stop(message.reason || "User stopped");
          sendResponse({ ok: true, state });
        } else if (message.type === "SMART_SCROLL_STEP") {
          this.stepOnce(message.stepPx).then(res => sendResponse({ ok: true, res, state: this.getState() }));
          return true;
        } else if (message.type === "SMART_SCROLL_GET_STATE") {
          sendResponse({ ok: true, state: this.getState() });
        }
      });
    }
  }

  // Singleton instance on window
  global.smartScrollEngine = global.smartScrollEngine || new ScrollEngine();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ScrollEngine, smartScrollEngine: global.smartScrollEngine };
  }
})(typeof window !== "undefined" ? window : globalThis);
