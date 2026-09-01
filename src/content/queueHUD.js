/**
 * queueHUD.js
 * In-page floating Heads-Up Display for the LeadHunter Automated Keyword Search Queue.
 * Displays progress, cooldown timers, session stats, and controls (Pause/Skip/Stop).
 */

(function (global) {
  class QueueHUD {
    constructor() {
      this.element = null;
      this.isCollapsed = false;
      this.unsubscribe = null;
    }

    init() {
      if (document.getElementById("leadhunter-queue-hud")) return;
      this.render();
      this.attachListeners();
    }

    render() {
      const container = document.createElement("div");
      container.id = "leadhunter-queue-hud";
      container.className = "lh-queue-hud hidden";

      container.innerHTML = `
        <div class="lh-hud-card">
          <!-- Header Bar -->
          <div class="lh-hud-header" id="lhHudDragHandle">
            <div class="lh-hud-brand">
              <span class="lh-hud-pulse"></span>
              <span class="lh-hud-title">LeadHunter Auto-Queue</span>
            </div>
            <div class="lh-hud-actions-top">
              <button class="lh-hud-icon-btn" id="lhHudMinimizeBtn" title="Minimize / Expand">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              </button>
            </div>
          </div>

          <!-- Body Content -->
          <div class="lh-hud-body" id="lhHudBody">
            <div class="lh-hud-progress-info">
              <div class="lh-hud-step-badge" id="lhHudStepBadge">Keyword 1 of 1</div>
              <div class="lh-hud-status-badge" id="lhHudStatusBadge">Scanning...</div>
            </div>

            <div class="lh-hud-keyword" id="lhHudKeyword" title="Current Keyword">
              "Angular Developer" "we're hiring"
            </div>

            <div class="lh-hud-progress-bar-wrap">
              <div class="lh-hud-progress-bar" id="lhHudProgressBar" style="width: 0%;"></div>
            </div>

            <div class="lh-hud-metrics">
              <div class="lh-hud-metric">
                <span class="lh-hud-metric-val" id="lhHudLeadsVal">0</span>
                <span class="lh-hud-metric-lbl">Leads Caught</span>
              </div>
              <div class="lh-hud-metric">
                <span class="lh-hud-metric-val" id="lhHudTimerVal">--</span>
                <span class="lh-hud-metric-lbl">Next Query In</span>
              </div>
            </div>

            <!-- Control Buttons -->
            <div class="lh-hud-controls">
              <button class="lh-hud-btn lh-hud-pause" id="lhHudPauseBtn">
                <svg class="icon-pause" width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
                <svg class="icon-play" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                <span id="lhHudPauseText">Pause</span>
              </button>
              <button class="lh-hud-btn lh-hud-skip" id="lhHudSkipBtn" title="Skip to next keyword">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>
                <span>Skip</span>
              </button>
              <button class="lh-hud-btn lh-hud-stop" id="lhHudStopBtn" title="Stop Queue Runner">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"></rect></svg>
                <span>Stop</span>
              </button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(container);
      this.element = container;
    }

    attachListeners() {
      if (!this.element) return;

      const minBtn = this.element.querySelector("#lhHudMinimizeBtn");
      const body = this.element.querySelector("#lhHudBody");
      const pauseBtn = this.element.querySelector("#lhHudPauseBtn");
      const skipBtn = this.element.querySelector("#lhHudSkipBtn");
      const stopBtn = this.element.querySelector("#lhHudStopBtn");

      if (minBtn && body) {
        minBtn.addEventListener("click", () => {
          this.isCollapsed = !this.isCollapsed;
          body.style.display = this.isCollapsed ? "none" : "block";
          this.element.classList.toggle("collapsed", this.isCollapsed);
        });
      }

      if (pauseBtn) {
        pauseBtn.addEventListener("click", () => {
          if (typeof chrome !== "undefined" && chrome.runtime) {
            chrome.runtime.sendMessage({ type: "QUEUE_TOGGLE_PAUSE" });
          }
        });
      }

      if (skipBtn) {
        skipBtn.addEventListener("click", () => {
          if (typeof chrome !== "undefined" && chrome.runtime) {
            chrome.runtime.sendMessage({ type: "QUEUE_SKIP_KEYWORD" });
          }
        });
      }

      if (stopBtn) {
        stopBtn.addEventListener("click", () => {
          if (typeof chrome !== "undefined" && chrome.runtime) {
            chrome.runtime.sendMessage({ type: "QUEUE_STOP" });
          }
        });
      }
    }

    update(state) {
      if (!this.element) this.init();
      if (!state || !state.isRunning) {
        if (this.element) this.element.classList.add("hidden");
        return;
      }

      this.element.classList.remove("hidden");

      const stepBadge = this.element.querySelector("#lhHudStepBadge");
      const statusBadge = this.element.querySelector("#lhHudStatusBadge");
      const kwElem = this.element.querySelector("#lhHudKeyword");
      const pBar = this.element.querySelector("#lhHudProgressBar");
      const leadsVal = this.element.querySelector("#lhHudLeadsVal");
      const timerVal = this.element.querySelector("#lhHudTimerVal");
      const pauseText = this.element.querySelector("#lhHudPauseText");
      const pauseIcon = this.element.querySelector(".icon-pause");
      const playIcon = this.element.querySelector(".icon-play");

      const total = state.keywords?.length || 0;
      const current = Math.min(state.currentIndex + 1, total);
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;

      if (stepBadge) stepBadge.textContent = `Keyword ${current} of ${total}`;
      if (kwElem) kwElem.textContent = state.currentKeyword || "(None)";
      if (pBar) pBar.style.width = `${pct}%`;
      if (leadsVal) leadsVal.textContent = String(state.leadsFoundInSession || 0);

      function fmtTime(sec) {
        const s = Math.max(0, Math.floor(sec || 0));
        const m = Math.floor(s / 60);
        const rem = s % 60;
        return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
      }

      if (state.isPaused) {
        if (statusBadge) {
          statusBadge.textContent = "Paused";
          statusBadge.className = "lh-hud-status-badge paused";
        }
        if (pauseText) pauseText.textContent = "Resume";
        if (pauseIcon) pauseIcon.style.display = "none";
        if (playIcon) playIcon.style.display = "inline-block";
        if (timerVal) timerVal.textContent = "Paused";
      } else if (state.isCoolingDown) {
        if (statusBadge) {
          statusBadge.textContent = "☕ Stealth Rest";
          statusBadge.className = "lh-hud-status-badge cooldown";
        }
        if (pauseText) pauseText.textContent = "Pause";
        if (pauseIcon) pauseIcon.style.display = "inline-block";
        if (playIcon) playIcon.style.display = "none";
        if (timerVal) timerVal.textContent = fmtTime(state.cooldownSecondsLeft);
      } else {
        if (statusBadge) {
          statusBadge.textContent = "Scanning 24h...";
          statusBadge.className = "lh-hud-status-badge scanning";
        }
        if (pauseText) pauseText.textContent = "Pause";
        if (pauseIcon) pauseIcon.style.display = "inline-block";
        if (playIcon) playIcon.style.display = "none";
        if (timerVal) timerVal.textContent = "Scanning";
      }
    }

    destroy() {
      if (this.element && this.element.parentNode) {
        this.element.parentNode.removeChild(this.element);
      }
      this.element = null;
    }
  }

  global.leadHunterQueueHUD = global.leadHunterQueueHUD || new QueueHUD();

  // Storage listener to update HUD reactively
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.leadHunterQueueState) {
        global.leadHunterQueueHUD.update(changes.leadHunterQueueState.newValue);
      }
    });
  }

  // Initial check on load
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["leadHunterQueueState"], (res) => {
      if (res && res.leadHunterQueueState && res.leadHunterQueueState.isRunning) {
        global.leadHunterQueueHUD.init();
        global.leadHunterQueueHUD.update(res.leadHunterQueueState);
      }
    });
  }
})(typeof window !== "undefined" ? window : globalThis);
