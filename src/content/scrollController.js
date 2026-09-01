/**
 * scrollController.js
 * Executes scroll movements smoothly on the target container or window.
 * Calculates scroll metrics, bounds, and bottom-reached state with dual-dispatch support
 * and humanized scrolling dynamics.
 */

(function (global) {
  class ScrollController {
    constructor(target = window) {
      this.setTarget(target);
    }

    setTarget(target) {
      this.target = target || window;
      this.isWindow = (this.target === window || this.target === document || this.target === document.documentElement || this.target === document.body);
    }

    /**
     * Get current scroll position metrics
     */
    getMetrics() {
      const windowScrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
      const windowClientHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const windowScrollHeight = Math.max(
        document.body.scrollHeight || 0,
        document.documentElement.scrollHeight || 0,
        document.body.offsetHeight || 0,
        document.documentElement.offsetHeight || 0
      );

      if (this.isWindow || !this.target || typeof this.target.scrollTop === "undefined") {
        const atBottom = (windowScrollTop + windowClientHeight) >= (windowScrollHeight - 80);
        return {
          scrollTop: windowScrollTop,
          clientHeight: windowClientHeight,
          scrollHeight: windowScrollHeight,
          atBottom
        };
      } else {
        const scrollTop = this.target.scrollTop || 0;
        const clientHeight = this.target.clientHeight || 0;
        const scrollHeight = this.target.scrollHeight || 0;
        const targetAtBottom = (scrollTop + clientHeight) >= (scrollHeight - 80);
        const winAtBottom = (windowScrollTop + windowClientHeight) >= (windowScrollHeight - 80);
        const atBottom = targetAtBottom || winAtBottom;

        return {
          scrollTop: Math.max(scrollTop, windowScrollTop),
          clientHeight: Math.max(clientHeight, windowClientHeight),
          scrollHeight: Math.max(scrollHeight, windowScrollHeight),
          atBottom
        };
      }
    }

    /**
     * Executes a scroll action by deltaPx
     * @param {number} deltaPx Pixels to scroll downwards (positive) or upwards (negative)
     * @param {boolean} smooth Whether to animate smoothly
     */
    async scroll(deltaPx = 500, smooth = true) {
      const before = this.getMetrics();
      const behavior = smooth ? "smooth" : "auto";

      // Always scroll window
      window.scrollBy({
        top: deltaPx,
        left: 0,
        behavior
      });

      // Also scroll internal container if distinct
      if (!this.isWindow && this.target && typeof this.target.scrollBy === "function") {
        try {
          this.target.scrollBy({
            top: deltaPx,
            left: 0,
            behavior
          });
        } catch (e) {}
      }

      // Small tick to allow browser smooth scroll animation to proceed
      await new Promise(resolve => setTimeout(resolve, 180));

      const after = this.getMetrics();
      return {
        beforeTop: before.scrollTop,
        afterTop: after.scrollTop,
        scrollHeight: after.scrollHeight,
        scrolledDelta: after.scrollTop - before.scrollTop,
        atBottom: after.atBottom
      };
    }

    /**
     * Performs a subtle human micro-jitter (slight upward scroll to mimic re-reading)
     */
    async microJitter(offsetPx = 25) {
      await this.scroll(-offsetPx, true);
      await new Promise(resolve => setTimeout(resolve, 200 + Math.floor(Math.random() * 200)));
      await this.scroll(offsetPx + 10, true);
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    /**
     * Intersection bounce: scrolls up slightly and back down to trip LinkedIn's IntersectionObserver sentinels
     */
    async bounce(offsetPx = 180) {
      await this.scroll(-offsetPx, false);
      await new Promise(resolve => setTimeout(resolve, 120));
      await this.scroll(offsetPx + 100, true);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ScrollController };
  }
  global.ScrollController = ScrollController;
})(typeof window !== "undefined" ? window : globalThis);
