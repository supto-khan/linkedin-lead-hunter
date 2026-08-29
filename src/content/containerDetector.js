/**
 * containerDetector.js
 * Deterministically finds the real scrollable container element.
 * Uses point-based center probe (elementFromPoint) + upward walk + candidate scoring.
 */

(function (global) {
  class ContainerDetector {
    /**
     * Finds the best scrollable container on the page.
     * @returns {HTMLElement|Window} The detected scrollable element or window.
     */
    static findBestScrollContainer() {
      const centerX = Math.max(10, Math.floor(window.innerWidth / 2));
      const centerY = Math.max(10, Math.floor(window.innerHeight / 2));

      // 1. Probe element at viewport center
      let probeEl = document.elementFromPoint(centerX, centerY) || document.body;
      const candidates = new Set();

      // Also probe standard main / feed areas if available
      const commonProbes = [
        probeEl,
        document.querySelector("main"),
        document.querySelector("[role='main']"),
        document.querySelector(".scaffold-layout__main"),
        document.querySelector("[data-testid='feed-container']"),
        document.body
      ].filter(Boolean);

      // 2. Walk up parent hierarchy for all probe points
      for (const startEl of commonProbes) {
        let curr = startEl;
        while (curr && curr !== document.documentElement && curr !== document) {
          if (this.isScrollCandidate(curr)) {
            candidates.add(curr);
          }
          curr = curr.parentElement;
        }
      }

      // 3. Score all candidates
      let bestContainer = null;
      let highestScore = -1;

      for (const el of candidates) {
        const score = this.scoreCandidate(el);
        if (score > highestScore) {
          highestScore = score;
          bestContainer = el;
        }
      }

      // 4. If a strong container candidate is found, return it
      if (bestContainer && highestScore > 50) {
        return bestContainer;
      }

      // 5. Fallback to document / window
      const docScrollable = (document.documentElement && document.documentElement.scrollHeight > window.innerHeight) ||
                            (document.body && document.body.scrollHeight > window.innerHeight);

      if (docScrollable) {
        return window;
      }

      return bestContainer || window;
    }

    /**
     * Checks if element can potentially scroll.
     */
    static isScrollCandidate(el) {
      if (!el || el.nodeType !== Node.ELEMENT_NODE) return false;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;

      const overflowY = style.overflowY || "";
      const isScrollStyle = overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
      const hasScrollRange = el.scrollHeight > el.clientHeight + 10;

      // Rendered dimensions must be reasonable (ignore tiny 10px widgets/tooltips)
      const rect = el.getBoundingClientRect();
      const hasSize = rect.width >= 100 && rect.height >= 100;

      return hasSize && (isScrollStyle || hasScrollRange);
    }

    /**
     * Calculates candidate score based on scrollable range, rendered area, and visibility.
     */
    static scoreCandidate(el) {
      try {
        const rect = el.getBoundingClientRect();
        const winW = window.innerWidth || 1;
        const winH = window.innerHeight || 1;

        // Viewport coverage ratio
        const area = (rect.width * rect.height);
        const viewportArea = winW * winH;
        const areaCoverage = Math.min(area / viewportArea, 1.0);

        // Scrollable pixel range
        const scrollableRange = el.scrollHeight - el.clientHeight;
        if (scrollableRange <= 5) return 0;

        // Penalty for elements completely offscreen or tiny
        if (rect.bottom < 0 || rect.top > winH || rect.right < 0 || rect.left > winW) {
          return 0;
        }

        // Score formula: ScrollableRange * AreaCoverage
        return scrollableRange * (0.3 + (areaCoverage * 0.7));
      } catch (err) {
        return 0;
      }
    }
  }

  // Export for module/global access
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ContainerDetector };
  }
  global.ContainerDetector = ContainerDetector;
})(typeof window !== "undefined" ? window : globalThis);
