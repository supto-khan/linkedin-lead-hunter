/**
 * scrollEngine.js
 * Core orchestrator for the deterministic Smart Scroll engine.
 * Handles LinkedIn infinite-scroll loaders, intersection sentinels, auto-clicking load more,
 * and reliable bottom detection.
 */

(function (global) {
  const ContainerDetector = global.ContainerDetector;
  const ScrollController = global.ScrollController;
  const SettlementDetector = global.SettlementDetector;
  const StopConditions = global.StopConditions;

  const LOADER_SELECTORS = [
    ".artdeco-loader",
    ".artdeco-spinner",
    "[role='progressbar']",
    ".scaffold-finite-scroll__loader",
    ".inline-feedback--loading",
    "[data-testid='search-results-loader']",
    "div.feed-shared-update-v2__loader",
    "div.scaffold-layout__list-loader",
    ".feed-shared-main-content--loading",
    ".search-results-loader"
  ].join(", ");

  const LOAD_MORE_SELECTORS = [
    "button.scaffold-finite-scroll__load-button",
    "button.search-results-container__load-more-button",
    "button[aria-label*='more results' i]",
    "button[aria-label*='load more' i]",
    "button[aria-label*='see more results' i]",
    "button[aria-label*='show more results' i]",
    "button[data-test-id*='load-more' i]",
    "button[data-control-name*='load_more' i]",
    ".scaffold-finite-scroll button",
    "[data-finite-scroll-hotkey] button"
  ].join(", ");

  class ScrollEngine {
    constructor() {
      this.isRunning = false;
      this.isPaused = false;
      this.loopPromise = null;
      this._completionResolver = null;

      this.container = null;
      this.controller = ScrollController ? new ScrollController(typeof window !== "undefined" ? window : global) : null;
      this.settlement = null;
      this.stopConditions = StopConditions ? new StopConditions() : null;

      this.config = {
        stepPx: 500,
        delayMs: 2000,
        mode: "infinite", // "infinite" | "single"
        stopConditions: {
          maxScrolls: 0,
          maxDurationMinutes: 0,
          stopOnBottom: true,
          noActivityTimeoutSec: 15
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
        if (this.isPaused) {
          return this.resume();
        }
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
     * Pause scrolling engine without terminating state
     */
    pause() {
      if (!this.isRunning || this.isPaused) return this.getState();
      this.isPaused = true;
      this.telemetry.status = "paused";
      this._broadcastState();
      return this.getState();
    }

    /**
     * Resume scrolling engine from paused state
     */
    resume() {
      if (!this.isRunning || !this.isPaused) return this.getState();
      this.isPaused = false;
      this.telemetry.status = "running";
      this._broadcastState();
      return this.getState();
    }

    /**
     * Stop scrolling engine
     */
    stop(reason = "User stopped") {
      if (!this.isRunning) return this.getState();

      this.isRunning = false;
      this.isPaused = false;
      this.telemetry.status = "stopped";
      this.telemetry.stopReason = reason;
      this.telemetry.elapsedSeconds = Math.floor((Date.now() - this.telemetry.startTime) / 1000);

      if (this.settlement) {
        this.settlement.destroy();
      }

      this._broadcastState();

      if (this._completionResolver) {
        this._completionResolver(this.getState());
        this._completionResolver = null;
      }

      return this.getState();
    }

    /**
     * Wait until the scrolling loop completes or stops
     */
    waitForCompletion() {
      if (!this.isRunning) return Promise.resolve(this.getState());
      return new Promise(resolve => {
        this._completionResolver = resolve;
      });
    }

    /**
     * Check if a loader or spinner is actively mounted in the DOM
     */
    _isLoaderActive() {
      try {
        const loaders = document.querySelectorAll(LOADER_SELECTORS);
        for (let i = 0; i < loaders.length; i++) {
          const el = loaders[i];
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            return true;
          }
        }
      } catch (e) {}
      return false;
    }

    /**
     * Helper to verify if an element is visible and interactive
     */
    _isInteractiveElement(el) {
      if (!el || el.disabled) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const style = window.getComputedStyle ? window.getComputedStyle(el) : null;
      if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) {
        return false;
      }
      return true;
    }

    /**
     * Robust synthetic event dispatcher for modern React / LinkedIn SPAs
     */
    _dispatchClick(btn) {
      if (!btn) return false;

      // 1. Scroll button directly into center view so viewport intersection triggers fire
      try {
        btn.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
      } catch (e) {
        try { btn.scrollIntoView(true); } catch (e2) {}
      }

      // 2. Focus element
      try { btn.focus(); } catch (e) {}

      // 3. Find innermost text node / span (which often holds the synthetic click handler in React)
      const innerTarget = btn.querySelector("span:not(:has(span))") || btn.querySelector("span") || btn;

      // 4. Dispatch full pointer/mouse sequence to both inner target and button
      const targets = [innerTarget, btn];
      const eventTypes = ["pointerdown", "mousedown", "pointerup", "mouseup", "click"];

      targets.forEach(target => {
        if (!target) return;
        eventTypes.forEach(evtType => {
          try {
            const event = new MouseEvent(evtType, {
              bubbles: true,
              cancelable: true,
              view: window,
              detail: 1,
              buttons: 1
            });
            target.dispatchEvent(event);
          } catch (e) {}
        });

        if (typeof target.click === "function") {
          try { target.click(); } catch (e) {}
        }
      });

      return true;
    }

    /**
     * Locate active "Load more" button in DOM across standard and obfuscated class names
     */
    _findLoadMoreButton() {
      try {
        // 1. Check known selectors
        const buttons = document.querySelectorAll(LOAD_MORE_SELECTORS);
        for (let i = 0; i < buttons.length; i++) {
          const btn = buttons[i];
          if (this._isInteractiveElement(btn)) {
            return { element: btn, reason: "selector" };
          }
        }

        // 2. Comprehensive text and aria search across all button candidates
        const allCandidates = document.querySelectorAll("button, [role='button'], .artdeco-button, a[role='button']");
        const loadMoreRegex = /\b(load\s*more|show\s*more\s*results|see\s*more\s*results|load\s*more\s*results|show\s*more|see\s*more\s*posts|load\s*more\s*posts)\b/i;

        for (let i = 0; i < allCandidates.length; i++) {
          const b = allCandidates[i];
          if (!this._isInteractiveElement(b)) continue;

          // Check aria-label
          const ariaLabel = (b.getAttribute("aria-label") || "").trim().toLowerCase();
          if (ariaLabel && loadMoreRegex.test(ariaLabel)) {
            return { element: b, reason: `aria-label: "${ariaLabel}"` };
          }

          // Check normalized text content
          const text = (b.innerText || b.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
          if (text && text.length < 60 && loadMoreRegex.test(text)) {
            return { element: b, reason: `text: "${text}"` };
          }
        }
      } catch (e) {
        console.warn("⚠️ LeadHunter: Error searching for load more button:", e);
      }
      return null;
    }

    /**
     * Returns true if a visible "Load more" button is detected in the DOM
     */
    _isLoadMoreButtonPresent() {
      return Boolean(this._findLoadMoreButton());
    }

    /**
     * Check and click any "Load more" / "Show more results" button if present
     */
    _clickLoadMoreIfPresent() {
      const match = this._findLoadMoreButton();
      if (!match) return false;

      console.log(`🎯 Auto-clicking LinkedIn 'Load more' button (${match.reason})...`);
      this._dispatchClick(match.element);
      if (this.settlement) {
        this.settlement.lastActivityTime = Date.now();
        this.settlement.activityEventsCount++;
      }
      return true;
    }

    /**
     * Single step scroll execution
     */
    async stepOnce(stepPx = null) {
      const px = stepPx || this.config.stepPx || 600;
      if (!this.container) {
        this.container = ContainerDetector ? ContainerDetector.findBestScrollContainer() : window;
        this.controller.setTarget(this.container);
      }

      this._clickLoadMoreIfPresent();
      const res = await this.controller.scroll(px, true);
      this.telemetry.scrollsCount++;

      this._clickLoadMoreIfPresent();

      if (typeof window.detectAndProcessPosts === "function") {
        try { window.detectAndProcessPosts(); } catch (e) {}
      }

      this._broadcastState();
      return res;
    }

    /**
     * Async Control Loop with Infinite Scroll Handling
     */
    async _runAsyncLoop() {
      while (this.isRunning) {
        if (this.isPaused) {
          await new Promise(resolve => setTimeout(resolve, 300));
          continue;
        }

        // 1. Check and click any "Load more" button
        const clickedLoadMore = this._clickLoadMoreIfPresent();
        if (clickedLoadMore) {
          console.log("🎯 'Load more' clicked! Pausing briefly for network response and new posts...");
          await new Promise(resolve => setTimeout(resolve, 1500));
          if (this.settlement) this.settlement.lastActivityTime = Date.now();
        }

        // 2. Variable humanized scroll distance (350px - 650px)
        const baseStep = this.config.stepPx || 500;
        const naturalStep = Math.round(baseStep * (0.75 + Math.random() * 0.45));
        const scrollRes = await this.controller.scroll(naturalStep, true);
        this.telemetry.scrollsCount++;
        this.telemetry.elapsedSeconds = Math.floor((Date.now() - this.telemetry.startTime) / 1000);

        // 3. Occasional subtle human micro-jitter (mimic re-reading post title)
        if (this.telemetry.scrollsCount > 1 && Math.random() < 0.22) {
          await this.controller.microJitter(18 + Math.floor(Math.random() * 14));
        }

        // 4. Wait for settlement (DOM additions)
        const settleResult = await this.settlement.waitForSettlement(Math.max(300, this.config.delayMs));
        this.telemetry.mutationsDetected = this.settlement.activityEventsCount;

        if (Math.abs(scrollRes.scrolledDelta) > 10 || settleResult.activityDetected) {
          if (this.settlement) this.settlement.lastActivityTime = Date.now();
        }

        // 5. Trigger radar post detection
        if (typeof window.detectAndProcessPosts === "function") {
          try { window.detectAndProcessPosts(); } catch (e) {}
        }

        // 6. Human "Reading Pause" (every 3–5 scrolls, pause 2.5s–4.5s to mimic human reading)
        if (this.telemetry.scrollsCount > 0 && (this.telemetry.scrollsCount % (3 + Math.floor(Math.random() * 2)) === 0)) {
          const readingTime = 2400 + Math.floor(Math.random() * 2200);
          console.log(`👀 Stealth Mode: Taking human reading pause (${(readingTime / 1000).toFixed(1)}s)...`);
          await new Promise(resolve => setTimeout(resolve, readingTime));
        }

        // 7. Infinite scroll loader & sentinel handling when near bottom
        let activeLoading = this._isLoaderActive();
        if (activeLoading) {
          console.log("🎯 Infinite scroll loader active, waiting for network response...");
          await this.settlement.waitForSettlement(2500);
          if (this.settlement) this.settlement.lastActivityTime = Date.now();
        }

        // If at bottom, do a small bounce to trip LinkedIn's lazy loading sentinels
        if (scrollRes.atBottom) {
          const atBottomClicked = this._clickLoadMoreIfPresent();
          if (atBottomClicked) {
            console.log("🎯 'Load more' clicked at bottom! Waiting for settlement...");
            await this.settlement.waitForSettlement(2500);
            if (this.settlement) this.settlement.lastActivityTime = Date.now();
          } else {
            await this.controller.bounce(160);
            await this.settlement.waitForSettlement(1500);
            activeLoading = this._isLoaderActive();
            if (activeLoading) {
              if (this.settlement) this.settlement.lastActivityTime = Date.now();
            }
          }
        }

        // 8. Evaluate stop conditions
        const evalState = {
          scrollsCount: this.telemetry.scrollsCount,
          startTime: this.telemetry.startTime,
          atBottom: scrollRes.atBottom,
          lastActivityTime: this.settlement ? this.settlement.lastActivityTime : Date.now(),
          isStopped: !this.isRunning,
          isLoading: activeLoading,
          isLoadMorePresent: this._isLoadMoreButtonPresent()
        };

        const stopCheck = this.stopConditions.evaluate(evalState);
        if (stopCheck.shouldStop) {
          console.log("🎯 SmartScroll reached end:", stopCheck.reason);
          this.stop(stopCheck.reason || "Finished");
          break;
        }

        // 9. Broadcast live telemetry
        this._broadcastState();

        // 10. Pacing delay pause before next step
        const remainingDelay = Math.max(100, this.config.delayMs - settleResult.elapsedMs);
        const naturalDelay = Math.floor(remainingDelay * (0.9 + Math.random() * 0.25));
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
        isPaused: this.isPaused,
        config: this.config,
        telemetry: { ...this.telemetry }
      };
    }

    /**
     * Broadcast telemetry to popup & extension runtime
     */
    _broadcastState() {
      const state = this.getState();

      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            type: "SMART_SCROLL_STATE_CHANGED",
            state
          });
        } catch (e) {}
      }

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
          return true;
        } else if (message.type === "SMART_SCROLL_PAUSE") {
          const state = this.pause();
          sendResponse({ ok: true, state });
        } else if (message.type === "SMART_SCROLL_RESUME") {
          const state = this.resume();
          sendResponse({ ok: true, state });
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
  global.ScrollEngine = ScrollEngine;
  global.smartScrollEngine = global.smartScrollEngine || new ScrollEngine();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ScrollEngine, smartScrollEngine: global.smartScrollEngine };
  }
})(typeof window !== "undefined" ? window : globalThis);
