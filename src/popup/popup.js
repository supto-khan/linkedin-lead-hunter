/**
 * popup.js
 * Controls the extension popup menu, metrics, live radar, smart scroll,
 * and the 24h Multi-Keyword Auto-Queue Runner.
 */

import { getStats, getLeads, isRadarActive, setRadarActive } from "../core/storage.js";
import { PRESET_MATRICES, parseKeywords, getQueueState } from "../core/queueManager.js";

document.addEventListener("DOMContentLoaded", async () => {
  // Top elements
  const statLeads = document.getElementById("statLeads");
  const statHot = document.getElementById("statHot");
  const statEmails = document.getElementById("statEmails");
  const statScanned = document.getElementById("statScanned");
  const newLeadsCount = document.getElementById("newLeadsCount");
  const recentLeadsList = document.getElementById("recentLeadsList");
  const radarToggle = document.getElementById("radarToggle");
  const radarPulse = document.getElementById("radarPulse");
  const openDashboardBtn = document.getElementById("openDashboardBtn");

  // Tab switching
  const tabBtnRadar = document.getElementById("tabBtnRadar");
  const tabBtnQueue = document.getElementById("tabBtnQueue");
  const radarTab = document.getElementById("radarTab");
  const queueTab = document.getElementById("queueTab");

  function switchTab(target) {
    if (target === "queueTab") {
      tabBtnQueue.classList.add("active");
      tabBtnRadar.classList.remove("active");
      queueTab.style.display = "block";
      radarTab.style.display = "none";
    } else {
      tabBtnRadar.classList.add("active");
      tabBtnQueue.classList.remove("active");
      radarTab.style.display = "block";
      queueTab.style.display = "none";
    }
  }

  if (tabBtnRadar) tabBtnRadar.addEventListener("click", () => switchTab("radarTab"));
  if (tabBtnQueue) tabBtnQueue.addEventListener("click", () => switchTab("queueTab"));

  // Load and populate stats in parallel
  async function refreshUI() {
    const [stats, leads, active] = await Promise.all([
      getStats(),
      getLeads({ skipDeduplication: true }),
      isRadarActive()
    ]);

    const newCount = leads.filter(l => l.status === "new").length;
    const hotCount = leads.filter(l => l.score >= 80).length;
    const emailCount = leads.reduce((acc, l) => acc + (l.emails ? l.emails.length : 0), 0);

    statLeads.textContent = String(leads.length);
    statHot.textContent = String(hotCount);
    statEmails.textContent = String(emailCount);
    statScanned.textContent = String(stats.scannedCount || 0);
    newLeadsCount.textContent = `${newCount} new`;

    radarToggle.checked = active;
    if (active) {
      radarPulse.classList.remove("paused");
    } else {
      radarPulse.classList.add("paused");
    }

    renderRecentLeads(leads.slice(0, 4));
  }

  function renderRecentLeads(leads) {
    if (!leads || leads.length === 0) {
      recentLeadsList.innerHTML = `
        <div class="empty-state">
          <p>No leads detected yet.</p>
          <small>Scroll your LinkedIn feed to start catching leads automatically!</small>
        </div>
      `;
      return;
    }

    const mailIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`;
    const linkIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>`;
    const dmIcon = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>`;

    recentLeadsList.innerHTML = leads.map(lead => {
      let contactChip = "";
      if (lead.emails && lead.emails.length > 0) {
        contactChip = `<span class="lead-email-tag">${mailIcon}<span>${lead.emails[0]}</span></span>`;
      } else if (lead.applicationUrls && lead.applicationUrls.length > 0) {
        contactChip = `<span class="lead-email-tag">${linkIcon}<span>Apply Link</span></span>`;
      } else if (lead.requiresDm) {
        contactChip = `<span class="lead-email-tag">${dmIcon}<span>DM Poster</span></span>`;
      }

      return `
        <div class="lead-item" data-id="${lead.id}">
          <div class="lead-item-top">
            <span class="lead-role" title="${lead.detectedRole}">${lead.detectedRole}</span>
            <span class="lead-score">${lead.score}%</span>
          </div>
          <div class="lead-item-bottom">
            <span>${lead.company || lead.authorName}</span>
            ${contactChip}
          </div>
        </div>
      `;
    }).join("");

    recentLeadsList.querySelectorAll(".lead-item").forEach(item => {
      item.addEventListener("click", () => openDashboard());
    });
  }

  // Toggle Radar switch
  radarToggle.addEventListener("change", async () => {
    const active = radarToggle.checked;
    await setRadarActive(active);
    if (active) {
      radarPulse.classList.remove("paused");
    } else {
      radarPulse.classList.add("paused");
    }
  });

  // Open Full Dashboard CRM
  function openDashboard() {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: chrome.runtime.getURL("src/dashboard/dashboard.html") });
    } else if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ type: "OPEN_DASHBOARD" });
    } else {
      window.open("../dashboard/dashboard.html", "_blank");
    }
  }

  if (openDashboardBtn) {
    openDashboardBtn.addEventListener("click", openDashboard);
  }

  // ── SMART SCROLL CONTROLLER ────────────────────────────
  const scrollDistance = document.getElementById("scrollDistance");
  const scrollDistanceVal = document.getElementById("scrollDistanceVal");
  const scrollDelay = document.getElementById("scrollDelay");
  const scrollDelayVal = document.getElementById("scrollDelayVal");
  const modeInfinite = document.getElementById("modeInfinite");
  const modeSingle = document.getElementById("modeSingle");
  const stopOnBottom = document.getElementById("stopOnBottom");
  const maxScrollsInput = document.getElementById("maxScrollsInput");
  const scrollStatusBadge = document.getElementById("scrollStatusBadge");
  const scrollToggleBtn = document.getElementById("scrollToggleBtn");
  const scrollToggleText = document.getElementById("scrollToggleText");
  const iconPlay = scrollToggleBtn ? scrollToggleBtn.querySelector(".icon-play") : null;
  const iconStop = scrollToggleBtn ? scrollToggleBtn.querySelector(".icon-stop") : null;
  const scrollStepBtn = document.getElementById("scrollStepBtn");
  const scrollTelemetry = document.getElementById("scrollTelemetry");
  const telemetryScrolls = document.getElementById("telemetryScrolls");
  const telemetryMutations = document.getElementById("telemetryMutations");
  const telemetryElapsed = document.getElementById("telemetryElapsed");

  let isScrollRunning = false;
  let activeTabId = null;

  async function getActiveTab() {
    if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      return tabs && tabs.length > 0 ? tabs[0] : null;
    }
    return null;
  }

  function sendMessageWithFallback(tabId, message, callback) {
    if (!tabId || typeof chrome === "undefined" || !chrome.tabs) return;
    chrome.tabs.sendMessage(tabId, message, async (res) => {
      if (chrome.runtime.lastError || !res) {
        try {
          await chrome.runtime.sendMessage({ type: "ENSURE_SCROLL_ENGINE", tabId });
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, message, (retryRes) => {
              if (chrome.runtime.lastError) return;
              if (callback && retryRes) callback(retryRes);
            });
          }, 80);
        } catch (e) {}
      } else if (callback) {
        callback(res);
      }
    });
  }

  async function initSmartScrollUI() {
    const tab = await getActiveTab();
    if (tab) {
      activeTabId = tab.id;
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.sendMessage) {
        chrome.tabs.sendMessage(activeTabId, { type: "SMART_SCROLL_GET_STATE" }, (res) => {
          if (chrome.runtime.lastError) return;
          if (res && res.ok && res.state) {
            applyScrollState(res.state);
          }
        });
      }
    }

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["smartScrollSettings"], (res) => {
        const cfg = res.smartScrollSettings || {
          stepPx: 500,
          delayMs: 2000,
          mode: "infinite",
          stopOnBottom: false,
          maxScrolls: 0
        };

        if (scrollDistance) {
          scrollDistance.value = cfg.stepPx;
          scrollDistanceVal.textContent = `${cfg.stepPx} px`;
        }
        if (scrollDelay) {
          const sec = (cfg.delayMs / 1000).toFixed(1);
          scrollDelay.value = sec;
          scrollDelayVal.textContent = `${sec} s`;
        }
        if (cfg.mode === "single" && modeSingle) {
          modeSingle.checked = true;
        } else if (modeInfinite) {
          modeInfinite.checked = true;
        }
        if (stopOnBottom) stopOnBottom.checked = Boolean(cfg.stopOnBottom);
        if (maxScrollsInput) maxScrollsInput.value = cfg.maxScrolls || "";
      });
    }
  }

  function saveScrollSettings() {
    const stepPx = Number(scrollDistance ? scrollDistance.value : 500);
    const delayMs = Math.round(Number(scrollDelay ? scrollDelay.value : 2.0) * 1000);
    const mode = modeSingle && modeSingle.checked ? "single" : "infinite";
    const stopBottom = stopOnBottom ? stopOnBottom.checked : false;
    const maxScrolls = Number(maxScrollsInput ? maxScrollsInput.value : 0) || 0;

    const smartScrollSettings = {
      stepPx,
      delayMs,
      mode,
      stopOnBottom: stopBottom,
      maxScrolls
    };

    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ smartScrollSettings });
    }

    return smartScrollSettings;
  }

  function applyScrollState(state) {
    if (!state) return;
    isScrollRunning = Boolean(state.isRunning);

    if (isScrollRunning) {
      scrollStatusBadge.textContent = "Scrolling...";
      scrollStatusBadge.classList.add("active");
      scrollToggleBtn.classList.add("running");
      scrollToggleText.textContent = "Stop Auto-Scroll";
      if (iconPlay) iconPlay.style.display = "none";
      if (iconStop) iconStop.style.display = "inline-block";
      if (scrollTelemetry) scrollTelemetry.style.display = "grid";
    } else {
      scrollStatusBadge.textContent = state.telemetry?.status === "finished" ? "Finished" : "Idle";
      scrollStatusBadge.classList.remove("active");
      scrollToggleBtn.classList.remove("running");
      scrollToggleText.textContent = "Start Smart Scroll";
      if (iconPlay) iconPlay.style.display = "inline-block";
      if (iconStop) iconStop.style.display = "none";
      if (!state.telemetry?.scrollsCount && scrollTelemetry) {
        scrollTelemetry.style.display = "none";
      }
    }

    if (state.telemetry) {
      if (telemetryScrolls) telemetryScrolls.textContent = String(state.telemetry.scrollsCount || 0);
      if (telemetryMutations) telemetryMutations.textContent = String(state.telemetry.mutationsDetected || 0);
      if (telemetryElapsed) {
        const secs = state.telemetry.elapsedSeconds || 0;
        const m = Math.floor(secs / 60).toString().padStart(2, "0");
        const s = (secs % 60).toString().padStart(2, "0");
        telemetryElapsed.textContent = `${m}:${s}`;
      }
    }
  }

  if (scrollDistance) {
    scrollDistance.addEventListener("input", () => {
      scrollDistanceVal.textContent = `${scrollDistance.value} px`;
      saveScrollSettings();
    });
  }

  if (scrollDelay) {
    scrollDelay.addEventListener("input", () => {
      scrollDelayVal.textContent = `${Number(scrollDelay.value).toFixed(1)} s`;
      saveScrollSettings();
    });
  }

  if (modeInfinite) modeInfinite.addEventListener("change", saveScrollSettings);
  if (modeSingle) modeSingle.addEventListener("change", saveScrollSettings);
  if (stopOnBottom) stopOnBottom.addEventListener("change", saveScrollSettings);
  if (maxScrollsInput) maxScrollsInput.addEventListener("input", saveScrollSettings);

  if (scrollToggleBtn) {
    scrollToggleBtn.addEventListener("click", async () => {
      const tab = await getActiveTab();
      if (!tab || !tab.id) return;

      const cfg = saveScrollSettings();

      if (isScrollRunning) {
        sendMessageWithFallback(tab.id, { type: "SMART_SCROLL_STOP", reason: "User clicked Stop" }, (res) => {
          if (res && res.state) applyScrollState(res.state);
        });
      } else {
        const payload = {
          stepPx: cfg.stepPx,
          delayMs: cfg.delayMs,
          mode: cfg.mode,
          stopConditions: {
            stopOnBottom: cfg.stopOnBottom,
            maxScrolls: cfg.maxScrolls,
            noActivityTimeoutSec: 0
          }
        };

        sendMessageWithFallback(tab.id, { type: "SMART_SCROLL_START", config: payload }, (res) => {
          if (res && res.state) applyScrollState(res.state);
        });
      }
    });
  }

  if (scrollStepBtn) {
    scrollStepBtn.addEventListener("click", async () => {
      const tab = await getActiveTab();
      if (!tab || !tab.id) return;

      const cfg = saveScrollSettings();
      sendMessageWithFallback(tab.id, { type: "SMART_SCROLL_STEP", stepPx: cfg.stepPx }, (res) => {
        if (res && res.state) applyScrollState(res.state);
      });
    });
  }

  // ── 24H AUTO-QUEUE RUNNER CONTROLLER ───────────────────────────
  const popupQueueStatusBadge = document.getElementById("popupQueueStatusBadge");
  const queueLiveBanner = document.getElementById("queueLiveBanner");
  const popupQueueProgressText = document.getElementById("popupQueueProgressText");
  const popupQueueLeadsCount = document.getElementById("popupQueueLeadsCount");
  const popupQueueCurrentKeyword = document.getElementById("popupQueueCurrentKeyword");
  const popupQueueProgressBar = document.getElementById("popupQueueProgressBar");
  const popupQueuePauseBtn = document.getElementById("popupQueuePauseBtn");
  const popupQueueSkipBtn = document.getElementById("popupQueueSkipBtn");
  const popupQueueStopBtn = document.getElementById("popupQueueStopBtn");

  const presetAll24h = document.getElementById("presetAll24h");
  const presetAngular24h = document.getElementById("presetAngular24h");
  const presetFrontend24h = document.getElementById("presetFrontend24h");
  const presetTechStack = document.getElementById("presetTechStack");
  const presetClear = document.getElementById("presetClear");
  const queueKeywordsInput = document.getElementById("queueKeywordsInput");
  const keywordCountHint = document.getElementById("keywordCountHint");
  const queueSafetyMode = document.getElementById("queueSafetyMode");
  const queueDateFilter = document.getElementById("queueDateFilter");
  const queueMaxScrolls = document.getElementById("queueMaxScrolls");
  const queueStartBtn = document.getElementById("queueStartBtn");
  const queueStartBtnText = document.getElementById("queueStartBtnText");

  function updateKeywordCountDisplay() {
    const list = parseKeywords(queueKeywordsInput.value);
    keywordCountHint.textContent = `${list.length} queries`;
  }

  function setPresetKeywords(keywordsList, activeBtn) {
    queueKeywordsInput.value = (keywordsList || []).join("\n");
    document.querySelectorAll(".preset-btn").forEach(b => b.classList.remove("active"));
    if (activeBtn) activeBtn.classList.add("active");
    updateKeywordCountDisplay();
  }

  // Set default Angular 24h Preset on first load
  if (queueKeywordsInput && !queueKeywordsInput.value) {
    setPresetKeywords(PRESET_MATRICES.ANGULAR_24H, presetAngular24h);
  }

  if (presetAll24h) {
    presetAll24h.addEventListener("click", () => {
      setPresetKeywords(PRESET_MATRICES.ALL_24H, presetAll24h);
    });
  }

  if (presetAngular24h) {
    presetAngular24h.addEventListener("click", () => {
      setPresetKeywords(PRESET_MATRICES.ANGULAR_24H, presetAngular24h);
    });
  }

  if (presetFrontend24h) {
    presetFrontend24h.addEventListener("click", () => {
      setPresetKeywords(PRESET_MATRICES.FRONTEND_24H, presetFrontend24h);
    });
  }

  if (presetTechStack) {
    presetTechStack.addEventListener("click", () => {
      setPresetKeywords(PRESET_MATRICES.TECH_STACK_RECOVERY_24H, presetTechStack);
    });
  }

  if (presetClear) {
    presetClear.addEventListener("click", () => {
      setPresetKeywords([], null);
    });
  }

  if (queueKeywordsInput) {
    queueKeywordsInput.addEventListener("input", updateKeywordCountDisplay);
  }

  function fmtTime(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  }

  function applyQueueState(qState) {
    if (!qState) return;

    if (qState.isRunning) {
      if (queueLiveBanner) queueLiveBanner.style.display = "block";
      const total = qState.keywords?.length || 0;
      const current = Math.min(qState.currentIndex + 1, total);
      const pct = total > 0 ? Math.round((current / total) * 100) : 0;

      if (popupQueueProgressText) popupQueueProgressText.textContent = `Keyword ${current} of ${total}`;
      if (popupQueueLeadsCount) popupQueueLeadsCount.textContent = `${qState.leadsFoundInSession || 0} leads caught`;
      if (popupQueueCurrentKeyword) popupQueueCurrentKeyword.textContent = qState.currentKeyword || "(None)";
      if (popupQueueProgressBar) popupQueueProgressBar.style.width = `${pct}%`;

      if (qState.isPaused) {
        if (popupQueueStatusBadge) {
          popupQueueStatusBadge.textContent = "Paused";
          popupQueueStatusBadge.className = "queue-status-pill paused";
        }
        if (popupQueuePauseBtn) popupQueuePauseBtn.textContent = "Resume";
      } else if (qState.isCoolingDown) {
        if (popupQueueStatusBadge) {
          popupQueueStatusBadge.textContent = `☕ Rest (${fmtTime(qState.cooldownSecondsLeft)})`;
          popupQueueStatusBadge.className = "queue-status-pill cooldown";
        }
        if (popupQueuePauseBtn) popupQueuePauseBtn.textContent = "Pause";
        if (popupQueueSkipBtn) popupQueueSkipBtn.textContent = "Skip Rest";
      } else {
        if (popupQueueStatusBadge) {
          popupQueueStatusBadge.textContent = "Running";
          popupQueueStatusBadge.className = "queue-status-pill running";
        }
        if (popupQueuePauseBtn) popupQueuePauseBtn.textContent = "Pause";
        if (popupQueueSkipBtn) popupQueueSkipBtn.textContent = "Skip";
      }

      if (queueStartBtnText) queueStartBtnText.textContent = "Queue In Progress...";
      if (queueStartBtn) queueStartBtn.disabled = true;
    } else {
      if (queueLiveBanner) queueLiveBanner.style.display = "none";
      if (popupQueueStatusBadge) {
        popupQueueStatusBadge.textContent = "Idle";
        popupQueueStatusBadge.className = "queue-status-pill";
      }
      if (queueStartBtnText) queueStartBtnText.textContent = "Start 24h Auto-Queue";
      if (queueStartBtn) queueStartBtn.disabled = false;
      if (popupQueueSkipBtn) popupQueueSkipBtn.textContent = "Skip";
    }
  }

  // Start Queue Runner
  if (queueStartBtn) {
    queueStartBtn.addEventListener("click", async () => {
      const keywords = parseKeywords(queueKeywordsInput.value);
      if (keywords.length === 0) {
        alert("Please enter at least one keyword or select a preset query matrix.");
        return;
      }

      const tab = await getActiveTab();
      if (!tab || !tab.id) {
        alert("Please open LinkedIn in an active tab before starting the queue.");
        return;
      }

      const modeKey = queueSafetyMode ? queueSafetyMode.value : "STEALTH_HUMAN";
      let minSec = 300;
      let maxSec = 600;

      if (modeKey === "SAFE_PACED") {
        minSec = 120;
        maxSec = 240;
      } else if (modeKey === "QUICK_SCAN") {
        minSec = 30;
        maxSec = 60;
      }

      const config = {
        dateFilter: queueDateFilter ? queueDateFilter.value : "past-24h",
        sortBy: "date_posted",
        safetyMode: modeKey,
        minCooldownSec: minSec,
        maxCooldownSec: maxSec,
        maxScrollsPerKeyword: Number(queueMaxScrolls ? queueMaxScrolls.value : 20) || 20,
        scrollDelaySec: 2.5
      };

      chrome.runtime.sendMessage({
        type: "QUEUE_START",
        keywords,
        config,
        tabId: tab.id
      }, (res) => {
        if (res && res.state) {
          applyQueueState(res.state);
        }
      });
    });
  }

  if (popupQueuePauseBtn) {
    popupQueuePauseBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "QUEUE_TOGGLE_PAUSE" });
    });
  }

  if (popupQueueSkipBtn) {
    popupQueueSkipBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "QUEUE_SKIP_KEYWORD" });
    });
  }

  if (popupQueueStopBtn) {
    popupQueueStopBtn.addEventListener("click", () => {
      chrome.runtime.sendMessage({ type: "QUEUE_STOP" });
    });
  }

  // Listen for storage changes
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.leadHunterQueueState) {
          applyQueueState(changes.leadHunterQueueState.newValue);
        }
      }
    });
  }

  // Listen for broadcast telemetry from active tab
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "SMART_SCROLL_STATE_CHANGED" && msg.state) {
        applyScrollState(msg.state);
      }
    });
  }

  // Initial load
  await refreshUI();
  await initSmartScrollUI();

  const initialQueueState = await getQueueState();
  applyQueueState(initialQueueState);
  if (initialQueueState && initialQueueState.isRunning) {
    switchTab("queueTab");
  }
});
