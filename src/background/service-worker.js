/**
 * service-worker.js
 * Background service worker (Manifest V3) for LeadHunter.
 * Handles storage coordination, action badge count updates, and CRM tab management.
 */

import { initStorage, saveLead, recordPostScan, getLeads, updateLeadStatus } from "../core/storage.js";

// Initialize on install or startup
chrome.runtime.onInstalled.addListener(async () => {
  console.log("🎯 LeadHunter Extension Installed");
  await initStorage();
  await updateBadge();
});

chrome.runtime.onStartup.addListener(async () => {
  await updateBadge();
});

// Update extension action badge count with active new hot leads
async function updateBadge() {
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

// Message passing handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return false;

  (async () => {
    try {
      if (message.type === "POST_SCANNED") {
        await recordPostScan();
        sendResponse({ ok: true });
      } else if (message.type === "SAVE_LEAD") {
        const result = await saveLead(message.lead);
        await updateBadge();
        sendResponse({ ok: true, isNew: result.isNew, lead: result.lead });
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
      }
    } catch (err) {
      console.error("Error in service-worker message handler:", err);
      sendResponse({ error: err.message });
    }
  })();

  return true; // Keep message channel open for async response
});
