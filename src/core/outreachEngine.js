/**
 * outreachEngine.js
 * Multi-Account Email Dispatcher & Safe Queue Scheduling Manager.
 * 
 * Manages:
 * 1. Safe operating window (6:00 AM - 2:00 PM).
 * 2. Multi-Account sender rotation with daily quotas (60/60/60 + 20 fallback = 200/day).
 * 3. Daily quota resets at midnight.
 * 4. Human-like jitter delays and queue state.
 */

import { getSettings, saveSettings } from "./storage.js";

/**
 * Check if the current time is within the configured operating window (e.g. 6:00 AM - 2:00 PM)
 * @param {Object} schedule 
 * @returns {Object} { isWithin: boolean, currentHour: number, startHour: number, endHour: number, message: string }
 */
export function checkScheduleWindow(schedule = {}) {
  const now = new Date();
  const currentHour = now.getHours();
  const startHour = schedule.startHour !== undefined ? schedule.startHour : 6;
  const endHour = schedule.endHour !== undefined ? schedule.endHour : 14;

  const isWithin = currentHour >= startHour && currentHour < endHour;

  let message = "";
  if (isWithin) {
    message = `Active Window (${startHour}:00 AM - ${endHour > 12 ? endHour - 12 : endHour}:00 PM)`;
  } else if (currentHour < startHour) {
    message = `Sleeping until ${startHour}:00 AM`;
  } else {
    message = `Completed for today (resumes tomorrow at ${startHour}:00 AM)`;
  }

  return {
    isWithin,
    currentHour,
    startHour,
    endHour,
    message
  };
}

/**
 * Reset daily sent counters if the day has changed
 * @param {Object} settings 
 * @returns {Object} updated settings
 */
export function resetDailyQuotasIfNeeded(settings) {
  if (!settings) return settings;
  const todayStr = new Date().toISOString().split("T")[0];
  const schedule = settings.autoOutreachSchedule || {};

  if (schedule.lastSentDate && schedule.lastSentDate !== todayStr) {
    const updatedAccounts = (settings.senderAccounts || []).map(acc => ({
      ...acc,
      sentToday: 0
    }));

    const updatedSchedule = {
      ...schedule,
      lastSentDate: todayStr
    };

    const newSettings = {
      ...settings,
      senderAccounts: updatedAccounts,
      autoOutreachSchedule: updatedSchedule
    };

    saveSettings(newSettings).catch(() => {});
    return newSettings;
  }

  return settings;
}

/**
 * Select the next available sender account according to priority and daily quota
 * Non-fallback accounts (60 each) are used first.
 * If all primary accounts reach 60, the fallback account (suptokhan24@gmail.com, 20 max) is used.
 * @param {Array} senderAccounts 
 * @returns {Object|null} next sender account object or null if all quotas exhausted
 */
export function getNextAvailableSender(senderAccounts = []) {
  const enabledAccounts = senderAccounts.filter(acc => acc.enabled !== false);

  // 1. Check primary (non-fallback) accounts
  const primaryAccounts = enabledAccounts.filter(acc => !acc.isFallback);
  for (const acc of primaryAccounts) {
    const quota = acc.dailyQuota !== undefined ? acc.dailyQuota : 60;
    const sent = acc.sentToday || 0;
    if (sent < quota) {
      return { ...acc, remaining: quota - sent };
    }
  }

  // 2. If primary accounts exhausted, check fallback account (e.g. suptokhan24@gmail.com)
  const fallbackAccounts = enabledAccounts.filter(acc => acc.isFallback);
  for (const acc of fallbackAccounts) {
    const quota = acc.dailyQuota !== undefined ? acc.dailyQuota : 20;
    const sent = acc.sentToday || 0;
    if (sent < quota) {
      return { ...acc, remaining: quota - sent, isUsingFallback: true };
    }
  }

  return null; // All quotas exhausted for today (200/200 reached)
}

/**
 * Increment the sent counter for a specific sender account
 * @param {string} senderEmail 
 * @param {Object} settings 
 */
export async function incrementSenderQuota(senderEmail, settings) {
  const todayStr = new Date().toISOString().split("T")[0];
  const accounts = (settings.senderAccounts || []).map(acc => {
    if (acc.email.toLowerCase() === senderEmail.toLowerCase()) {
      return {
        ...acc,
        sentToday: (acc.sentToday || 0) + 1
      };
    }
    return acc;
  });

  const updatedSchedule = {
    ...(settings.autoOutreachSchedule || {}),
    lastSentDate: todayStr
  };

  const newSettings = {
    ...settings,
    senderAccounts: accounts,
    autoOutreachSchedule: updatedSchedule
  };

  await saveSettings(newSettings);
  return newSettings;
}

/**
 * Get comprehensive outreach progress and queue statistics
 * @param {Object} settings 
 * @returns {Object} statistics summary
 */
export function getOutreachEngineStats(settings) {
  const accounts = settings.senderAccounts || [];
  const schedule = settings.autoOutreachSchedule || {};
  const windowStatus = checkScheduleWindow(schedule);

  const totalSentToday = accounts.reduce((acc, a) => acc + (a.sentToday || 0), 0);
  const dailyGoal = schedule.dailyGoal || 200;
  const totalCapacity = accounts.reduce((acc, a) => acc + (a.dailyQuota || 0), 0);
  const remainingToday = Math.max(0, dailyGoal - totalSentToday);

  return {
    totalSentToday,
    dailyGoal,
    totalCapacity,
    remainingToday,
    percentComplete: Math.min(100, Math.round((totalSentToday / (dailyGoal || 1)) * 100)),
    windowStatus,
    accountsSummary: accounts.map(a => ({
      email: a.email,
      sent: a.sentToday || 0,
      quota: a.dailyQuota || 0,
      isFallback: !!a.isFallback,
      isExhausted: (a.sentToday || 0) >= (a.dailyQuota || 0)
    }))
  };
}

/**
 * Check if the SMTP Bridge server is running
 * @param {string} [customUrl]
 * @returns {Promise<boolean>}
 */
export async function checkBridgeStatus(customUrl) {
  const baseUrl = (customUrl || "http://localhost:3000").replace(/\/+$/, "");
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${baseUrl}/health`, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res.ok;
  } catch (e) {
    return false;
  }
}

/**
 * Send an email directly through the SMTP bridge server using App Passwords
 * @param {Object} options
 * @returns {Promise<Object>}
 */
export async function sendSilentEmailViaBridge({ senderAccount, to, replyTo, subject, body, attachments, bridgeUrl }) {
  if (!senderAccount || !senderAccount.appPassword || senderAccount.appPassword.trim().length < 8) {
    return {
      success: false,
      reason: "NO_APP_PASSWORD",
      error: `Please enter the 16-character App Password for ${senderAccount ? senderAccount.email : "sender"} in Settings.`
    };
  }

  const baseUrl = (bridgeUrl || "http://localhost:3000").replace(/\/+$/, "");

  try {
    const payload = {
      senderEmail: senderAccount.email,
      appPassword: senderAccount.appPassword.trim(),
      provider: senderAccount.provider || (senderAccount.email.includes("hotmail") || senderAccount.email.includes("outlook") ? "outlook" : "gmail"),
      to,
      replyTo: replyTo || "suptokhan24@gmail.com",
      subject,
      body,
      attachments: attachments || []
    };

    const res = await fetch(`${baseUrl}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const json = await res.json();
    if (res.ok && json.success) {
      return { success: true, messageId: json.messageId };
    } else {
      return { success: false, error: json.error || "SMTP Error" };
    }
  } catch (err) {
    return {
      success: false,
      isOffline: true,
      error: `SMTP Bridge server at ${baseUrl} is unreachable. Check your server status.`
    };
  }
}
