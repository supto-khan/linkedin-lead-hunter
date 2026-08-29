/**
 * stopConditions.js
 * Evaluates whether the scrolling loop should terminate based on configured rules.
 */

(function (global) {
  class StopConditions {
    constructor(config = {}) {
      this.maxScrolls = config.maxScrolls || 0; // 0 = unlimited
      this.maxDurationMs = (config.maxDurationMinutes || 0) * 60 * 1000; // 0 = unlimited
      this.stopOnBottom = config.stopOnBottom !== false;
      this.noActivityTimeoutMs = (config.noActivityTimeoutSec || 0) * 1000;
      this.consecutiveBottomChecks = 0;
    }

    updateConfig(config = {}) {
      if (config.maxScrolls !== undefined) this.maxScrolls = Number(config.maxScrolls) || 0;
      if (config.maxDurationMinutes !== undefined) this.maxDurationMs = (Number(config.maxDurationMinutes) || 0) * 60 * 1000;
      if (config.stopOnBottom !== undefined) this.stopOnBottom = Boolean(config.stopOnBottom);
      if (config.noActivityTimeoutSec !== undefined) this.noActivityTimeoutMs = (Number(config.noActivityTimeoutSec) || 0) * 1000;
    }

    /**
     * Evaluates all stop conditions against the current engine telemetry state.
     * @param {Object} state Telemetry state: { scrollsCount, startTime, atBottom, lastActivityTime, isStopped }
     * @returns {{ shouldStop: boolean, reason: string | null }}
     */
    evaluate(state) {
      if (state.isStopped) {
        return { shouldStop: true, reason: "Manual stop requested" };
      }

      // 1. Max Scroll Count Limit
      if (this.maxScrolls > 0 && state.scrollsCount >= this.maxScrolls) {
        return { shouldStop: true, reason: `Reached maximum scroll count (${this.maxScrolls})` };
      }

      // 2. Max Duration Limit
      if (this.maxDurationMs > 0 && (Date.now() - state.startTime) >= this.maxDurationMs) {
        const mins = Math.round(this.maxDurationMs / 60000);
        return { shouldStop: true, reason: `Reached maximum duration (${mins} min)` };
      }

      // 3. Bottom Reached Limit (Resilient for infinite scrolling SPAs)
      if (this.stopOnBottom && state.atBottom) {
        this.consecutiveBottomChecks++;
        // Require at least 6 consecutive checks (~10+ seconds of confirmed zero growth)
        // to ensure infinite-scroll network requests have had plenty of time to append new posts
        if (this.consecutiveBottomChecks >= 6) {
          return { shouldStop: true, reason: "End of page reached (no new items loaded)" };
        }
      } else {
        this.consecutiveBottomChecks = 0;
      }

      // 4. No Activity Timeout (only if explicitly configured > 0)
      if (this.noActivityTimeoutMs > 0 && state.lastActivityTime) {
        const idleTime = Date.now() - state.lastActivityTime;
        if (idleTime >= this.noActivityTimeoutMs && state.scrollsCount >= 10) {
          return { shouldStop: true, reason: `No new activity detected for ${Math.round(this.noActivityTimeoutMs / 1000)}s` };
        }
      }

      return { shouldStop: false, reason: null };
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { StopConditions };
  }
  global.StopConditions = StopConditions;
})(typeof window !== "undefined" ? window : globalThis);
