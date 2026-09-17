/**
 * service-worker.js
 * Background service worker (Manifest V3) for LeadHunter.
 * Handles storage coordination, action badge updates, CRM tab management,
 * and the automated Multi-Keyword Search Queue Orchestrator with memory reset.
 */

import { initStorage, saveLead, recordPostScan, getLeads, updateLeadStatus } from "../core/storage.js";
import { getQueueState, saveQueueState, buildSearchUrl } from "../core/queueManager.js";

// Cooldown interval timer reference
let cooldownIntervalId = null;

// Keep-alive port references from active content scripts
const activeKeepAlivePorts = new Set();
if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onConnect) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name === "leadhunter-keepalive") {
      activeKeepAlivePorts.add(port);
      port.onDisconnect.addListener(() => {
        activeKeepAlivePorts.delete(port);
      });
      // Respond to heartbeat pings to keep service worker alive
      port.onMessage.addListener((msg) => {
        if (msg && msg.type === "PING") {
          try { port.postMessage({ type: "PONG", timestamp: Date.now() }); } catch (e) {}
        }
      });
    }
  });
}

// Alarm listener for reliable cooldown wakeup in Manifest V3
if (typeof chrome !== "undefined" && chrome.alarms) {
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === "queueCooldownAlarm") {
      console.log("⏰ LeadHunter: Cooldown alarm triggered");
      await advanceQueueIfCooldownComplete();
    }
  });
}
chrome.runtime.onInstalled.addListener(async () => {
  console.log("🎯 LeadHunter Extension Installed");
  await initStorage();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBadge();
});

// Update extension action badge count with active new leads only
export async function updateBadge() {
  if (typeof chrome === "undefined" || !chrome.action || !chrome.action.setBadgeText) return;
  try {
    const leads = await getLeads({ status: "new" });
    const count = leads.length;
    const badgeText = count > 0 ? (count > 99 ? "99+" : String(count)) : "";
    await chrome.action.setBadgeText({ text: badgeText });
    await chrome.action.setBadgeBackgroundColor({ color: "#00C896" });
  } catch (err) {
    console.error("Error updating badge:", err);
  }
}

// Reactive badge listener: automatically recounts whenever leads list or lead statuses change in storage
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "local" && changes.leads) {
      updateBadge();
    }
  });
}

// ── QUEUE RUNNER / ORCHESTRATOR ──────────────────────────────────────────

/**
 * Helper to safely resolve the LinkedIn tab ID
 */
async function getOrFindLinkedInTabId(state) {
  if (state.targetTabId) {
    try {
      const tab = await chrome.tabs.get(state.targetTabId);
      if (tab && tab.id) return tab.id;
    } catch (e) {}
  }
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs && tabs.length > 0) {
    state.targetTabId = tabs[0].id;
    await saveQueueState(state);
    return tabs[0].id;
  }
  return null;
}

/**
 * Start or resume the keyword search queue
 */
async function startQueue(keywords, config = {}, targetTabId = null) {
  if (cooldownIntervalId) {
    clearInterval(cooldownIntervalId);
    cooldownIntervalId = null;
  }

  let tabId = targetTabId;
  if (!tabId) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs && tabs.length > 0) tabId = tabs[0].id;
  }

  if (!tabId) {
    throw new Error("No active LinkedIn tab found to run the search queue.");
  }

  const state = {
    isRunning: true,
    isPaused: false,
    isCoolingDown: false,
    keywords,
    currentIndex: 0,
    currentKeyword: keywords[0],
    targetTabId: tabId,
    cooldownSecondsLeft: 0,
    cooldownTotalSeconds: 0,
    cooldownEndsAt: null,
    leadsFoundInSession: 0,
    startedAt: Date.now(),
    config: {
      dateFilter: config.dateFilter || "past-24h",
      sortBy: config.sortBy || "date_posted",
      safetyMode: config.safetyMode || "NATURAL_HUMAN",
      minCooldownSec: config.minCooldownSec !== undefined ? Number(config.minCooldownSec) : 60,
      maxCooldownSec: config.maxCooldownSec !== undefined ? Number(config.maxCooldownSec) : 300,
      maxScrollsPerKeyword: config.maxScrollsPerKeyword !== undefined ? Number(config.maxScrollsPerKeyword) : 20,
      scrollDelaySec: config.scrollDelaySec || 2.5
    }
  };

  await saveQueueState(state);

  // Navigate tab to first keyword (hard page reload to ensure fresh DOM & zero memory leaks)
  if (state.currentKeyword) {
    const url = buildSearchUrl(state.currentKeyword, state.config);
    await chrome.tabs.update(tabId, { url });
  }

  return state;
}

/**
 * Handle completion of current search query in content script
 */
/**
 * Check if cooldown has finished and advance to the next keyword
 */
async function advanceQueueIfCooldownComplete() {
  const state = await getQueueState();
  if (!state || !state.isRunning || state.isPaused || !state.isCoolingDown) return;

  const now = Date.now();
  if (state.cooldownEndsAt && now >= state.cooldownEndsAt) {
    if (cooldownIntervalId) {
      clearInterval(cooldownIntervalId);
      cooldownIntervalId = null;
    }
    if (typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.clear("queueCooldownAlarm").catch(() => {});
    }

    const nextIndex = state.currentIndex + 1;
    if (nextIndex < state.keywords.length) {
      state.isCoolingDown = false;
      state.currentIndex = nextIndex;
      state.currentKeyword = state.keywords[nextIndex];
      state.cooldownSecondsLeft = 0;
      state.cooldownTotalSeconds = 0;
      state.cooldownEndsAt = null;
      await saveQueueState(state);

      const nextUrl = buildSearchUrl(state.currentKeyword, state.config);
      const tabId = await getOrFindLinkedInTabId(state);
      if (tabId) {
        try {
          await chrome.tabs.update(tabId, { url: nextUrl });
        } catch (tabErr) {
          console.error("Error updating tab for next keyword:", tabErr);
        }
      }
    } else {
      // All keywords finished!
      state.isRunning = false;
      state.isCoolingDown = false;
      state.cooldownSecondsLeft = 0;
      state.cooldownTotalSeconds = 0;
      state.cooldownEndsAt = null;
      await saveQueueState(state);
      console.log("🎯 Multi-keyword search queue completed!");
    }
  }
}

/**
 * Handle completion of current search query in content script
 */
async function onKeywordSearchCompleted() {
  const state = await getQueueState();
  if (!state || !state.isRunning || state.isPaused) return;

  const nextIndex = state.currentIndex + 1;

  if (nextIndex < state.keywords.length) {
    // Realistic organic random gap between keywords (default 1 - 5 mins with natural jitter)
    const minSec = state.config?.minCooldownSec !== undefined ? Number(state.config.minCooldownSec) : 60;
    const maxSec = state.config?.maxCooldownSec !== undefined ? Number(state.config.maxCooldownSec) : 300;
    const cooldownDuration = Math.max(15, Math.floor(minSec + Math.random() * (maxSec - minSec + 1)));
    const endsAt = Date.now() + (cooldownDuration * 1000);

    state.isCoolingDown = true;
    state.cooldownTotalSeconds = cooldownDuration;
    state.cooldownSecondsLeft = cooldownDuration;
    state.cooldownEndsAt = endsAt;
    await saveQueueState(state);

    if (cooldownIntervalId) clearInterval(cooldownIntervalId);

    // Register alarm as fallback for service worker wakeup in MV3
    if (typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.create("queueCooldownAlarm", { when: endsAt });
    }

    cooldownIntervalId = setInterval(async () => {
      const currentState = await getQueueState();
      
      if (!currentState.isRunning || currentState.isPaused) {
        clearInterval(cooldownIntervalId);
        cooldownIntervalId = null;
        return;
      }

      const remaining = Math.max(0, Math.ceil(((currentState.cooldownEndsAt || endsAt) - Date.now()) / 1000));

      if (remaining <= 0) {
        clearInterval(cooldownIntervalId);
        cooldownIntervalId = null;
        await advanceQueueIfCooldownComplete();
      } else {
        currentState.cooldownSecondsLeft = remaining;
        await saveQueueState(currentState);
      }
    }, 1000);

  } else {
    // All keywords finished!
    state.isRunning = false;
    state.isCoolingDown = false;
    state.cooldownSecondsLeft = 0;
    state.cooldownTotalSeconds = 0;
    state.cooldownEndsAt = null;
    await saveQueueState(state);
    console.log("🎯 Multi-keyword search queue completed!");
  }
}

/**
 * Skip current keyword or current cooldown immediately
 */
async function skipKeyword(preferredTabId = null) {
  if (cooldownIntervalId) {
    clearInterval(cooldownIntervalId);
    cooldownIntervalId = null;
  }
  if (typeof chrome !== "undefined" && chrome.alarms) {
    chrome.alarms.clear("queueCooldownAlarm").catch(() => {});
  }

  const state = await getQueueState();
  if (!state || !state.isRunning) return;

  if (preferredTabId) {
    state.targetTabId = preferredTabId;
  }

  const nextIndex = state.currentIndex + 1;
  if (nextIndex < state.keywords.length) {
    state.isCoolingDown = false;
    state.currentIndex = nextIndex;
    state.currentKeyword = state.keywords[nextIndex];
    state.cooldownSecondsLeft = 0;
    state.cooldownTotalSeconds = 0;
    state.cooldownEndsAt = null;
    await saveQueueState(state);

    const nextUrl = buildSearchUrl(state.currentKeyword, state.config);
    const tabId = await getOrFindLinkedInTabId(state);
    if (tabId) {
      try {
        await chrome.tabs.update(tabId, { url: nextUrl });
      } catch (err) {
        console.error("Error updating tab on skip:", err);
      }
    }
  } else {
    state.isRunning = false;
    state.isCoolingDown = false;
    state.cooldownSecondsLeft = 0;
    state.cooldownTotalSeconds = 0;
    state.cooldownEndsAt = null;
    await saveQueueState(state);
  }
}

/**
 * Toggle Pause / Resume
 */
async function togglePauseQueue() {
  const state = await getQueueState();
  if (!state || !state.isRunning) return;

  state.isPaused = !state.isPaused;
  await saveQueueState(state);

  const tabId = await getOrFindLinkedInTabId(state);
  if (tabId) {
    const msgType = state.isPaused ? "SMART_SCROLL_PAUSE" : "SMART_SCROLL_RESUME";
    chrome.tabs.sendMessage(tabId, { type: msgType }).catch(() => {});
  }

  if (state.isPaused) {
    if (cooldownIntervalId) {
      clearInterval(cooldownIntervalId);
      cooldownIntervalId = null;
    }
    if (typeof chrome !== "undefined" && chrome.alarms) {
      chrome.alarms.clear("queueCooldownAlarm").catch(() => {});
    }
  } else {
    // Resuming
    if (state.isCoolingDown && state.cooldownSecondsLeft > 0) {
      const endsAt = Date.now() + (state.cooldownSecondsLeft * 1000);
      state.cooldownEndsAt = endsAt;
      await saveQueueState(state);

      if (typeof chrome !== "undefined" && chrome.alarms) {
        chrome.alarms.create("queueCooldownAlarm", { when: endsAt });
      }

      cooldownIntervalId = setInterval(async () => {
        const cur = await getQueueState();
        if (!cur.isRunning || cur.isPaused) {
          clearInterval(cooldownIntervalId);
          cooldownIntervalId = null;
          return;
        }
        const remaining = Math.max(0, Math.ceil(((cur.cooldownEndsAt || endsAt) - Date.now()) / 1000));
        if (remaining <= 0) {
          clearInterval(cooldownIntervalId);
          cooldownIntervalId = null;
          await advanceQueueIfCooldownComplete();
        } else {
          cur.cooldownSecondsLeft = remaining;
          await saveQueueState(cur);
        }
      }, 1000);
    }
  }
}

/**
 * Stop Queue
 */
async function stopQueue(preferredTabId = null) {
  if (cooldownIntervalId) {
    clearInterval(cooldownIntervalId);
    cooldownIntervalId = null;
  }
  if (typeof chrome !== "undefined" && chrome.alarms) {
    chrome.alarms.clear("queueCooldownAlarm").catch(() => {});
  }

  const state = await getQueueState();
  if (preferredTabId) {
    state.targetTabId = preferredTabId;
  }

  state.isRunning = false;
  state.isPaused = false;
  state.isCoolingDown = false;
  state.cooldownSecondsLeft = 0;
  state.cooldownTotalSeconds = 0;
  state.cooldownEndsAt = null;
  await saveQueueState(state);

  const tabId = await getOrFindLinkedInTabId(state);
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: "SMART_SCROLL_STOP", reason: "Queue stopped" }).catch(() => {});
  }
}

// In-flight queue to serialize incoming SAVE_LEAD events
let serviceWorkerSaveLeadQueue = Promise.resolve();

// ── MESSAGE PASSING HANDLER ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  (async () => {
    try {
      if (message.type === "POST_SCANNED") {
        await recordPostScan();
        sendResponse({ ok: true });
      } else if (message.type === "SAVE_LEAD") {
        serviceWorkerSaveLeadQueue = serviceWorkerSaveLeadQueue.catch(() => {}).then(async () => {
          const result = await saveLead(message.lead);
          await updateBadge();

          const qState = await getQueueState();
          if (qState && qState.isRunning && result.isNew) {
            qState.leadsFoundInSession = (qState.leadsFoundInSession || 0) + 1;
            await saveQueueState(qState);
          }

          sendResponse({ ok: true, isNew: result.isNew, lead: result.lead });
        });
      } else if (message.type === "UPDATE_STATUS") {
        await updateLeadStatus(message.id, message.status);
        await updateBadge();
        sendResponse({ ok: true });
      } else if (message.type === "OPEN_DASHBOARD") {
        const dashboardUrl = chrome.runtime.getURL("src/dashboard/dashboard.html");
        await chrome.tabs.create({ url: dashboardUrl });
        sendResponse({ ok: true });
      } else if (message.type === "GET_STATS") {
        const leads = await getLeads();
        const newCount = leads.filter(l => l.status === "new").length;
        const hotCount = leads.filter(l => l.score >= 80).length;
        sendResponse({ totalLeads: leads.length, newLeads: newCount, hotLeads: hotCount });
      } else if (message.type === "QUEUE_START") {
        const newState = await startQueue(message.keywords, message.config, message.tabId);
        sendResponse({ ok: true, state: newState });
      } else if (message.type === "QUEUE_KEYWORD_COMPLETED") {
        await onKeywordSearchCompleted();
        sendResponse({ ok: true });
      } else if (message.type === "QUEUE_SKIP_KEYWORD") {
        const senderTabId = sender?.tab?.id || message.tabId;
        await skipKeyword(senderTabId);
        sendResponse({ ok: true });
      } else if (message.type === "QUEUE_TOGGLE_PAUSE") {
        await togglePauseQueue();
        sendResponse({ ok: true });
      } else if (message.type === "QUEUE_STOP") {
        const senderTabId = sender?.tab?.id || message.tabId;
        await stopQueue(senderTabId);
        sendResponse({ ok: true });
      } else if (message.type === "QUEUE_GET_STATE") {
        const state = await getQueueState();
        sendResponse({ ok: true, state });
      } else if (message.type === "ENSURE_SCROLL_ENGINE") {
        const tabId = message.tabId;
        if (tabId && chrome.scripting) {
          try {
            await chrome.scripting.executeScript({
              target: { tabId },
              files: [
                "src/content/containerDetector.js",
                "src/content/scrollController.js",
                "src/content/settlementDetector.js",
                "src/content/stopConditions.js",
                "src/content/scrollEngine.js",
                "src/content/queueHUD.js"
              ]
            });
            sendResponse({ ok: true });
          } catch (injectErr) {
            sendResponse({ ok: false, error: injectErr.message });
          }
        } else {
          sendResponse({ ok: true });
        }
      }
    } catch (err) {
      console.error("Error in service-worker message handler:", err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
