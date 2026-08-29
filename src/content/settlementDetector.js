/**
 * settlementDetector.js
 * Observes DOM mutations on the scroll container.
 * Specifically monitors addedNodes (>2 threshold) and filters out removals & timer noise.
 */

(function (global) {
  class SettlementDetector {
    constructor(target = document.body) {
      this.target = target && target !== window ? target : document.body;
      this.observer = null;
      this.totalAddedNodes = 0;
      this.activityEventsCount = 0;
      this.lastActivityTime = Date.now();
      this.minThreshold = 2; // Require at least 2 added nodes to treat as genuine content
      this._initObserver();
    }

    setTarget(target) {
      if (this.observer) {
        this.observer.disconnect();
      }
      this.target = target && target !== window ? target : document.body;
      this._initObserver();
    }

    _initObserver() {
      if (!this.target || typeof MutationObserver === "undefined") return;

      this.observer = new MutationObserver((mutations) => {
        let addedCount = 0;

        for (const mut of mutations) {
          if (mut.type === "childList" && mut.addedNodes && mut.addedNodes.length > 0) {
            for (const node of mut.addedNodes) {
              // Ignore comments and empty text nodes
              if (node.nodeType === Node.ELEMENT_NODE) {
                addedCount++;
              }
            }
          }
        }

        if (addedCount >= this.minThreshold) {
          this.totalAddedNodes += addedCount;
          this.activityEventsCount++;
          this.lastActivityTime = Date.now();
        }
      });

      try {
        this.observer.observe(this.target, {
          childList: true,
          subtree: true
        });
      } catch (err) {
        // Fallback to document.body if target cannot be observed
        if (this.target !== document.body && document.body) {
          this.observer.observe(document.body, { childList: true, subtree: true });
        }
      }
    }

    /**
     * Waits for either DOM settlement (new added nodes) or a timeout to elapse.
     * @param {number} timeoutMs Max wait time in milliseconds
     * @returns {Promise<{activityDetected: boolean, addedNodes: number, elapsedMs: number}>}
     */
    async waitForSettlement(timeoutMs = 1500) {
      const startTime = Date.now();
      const initialCount = this.activityEventsCount;
      const initialNodes = this.totalAddedNodes;

      // Poll interval for quick resolution if activity occurs early
      const checkInterval = 100;
      let elapsed = 0;

      while (elapsed < timeoutMs) {
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        elapsed = Date.now() - startTime;

        // If new content was added after a minimum pause (e.g. 200ms to let render finish)
        if (this.activityEventsCount > initialCount && elapsed >= 250) {
          return {
            activityDetected: true,
            addedNodes: this.totalAddedNodes - initialNodes,
            elapsedMs: elapsed
          };
        }
      }

      return {
        activityDetected: this.activityEventsCount > initialCount,
        addedNodes: this.totalAddedNodes - initialNodes,
        elapsedMs: elapsed
      };
    }

    destroy() {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { SettlementDetector };
  }
  global.SettlementDetector = SettlementDetector;
})(typeof window !== "undefined" ? window : globalThis);
