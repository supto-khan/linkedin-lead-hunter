/**
 * scrollController.js
 * Executes scroll movements smoothly on the target container or window.
 * Calculates scroll metrics, bounds, and bottom-reached state.
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
      if (this.isWindow) {
        const scrollTop = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
        const clientHeight = window.innerHeight || document.documentElement.clientHeight;
        const scrollHeight = Math.max(
          document.body.scrollHeight || 0,
          document.documentElement.scrollHeight || 0,
          document.body.offsetHeight || 0,
          document.documentElement.offsetHeight || 0
        );
        const atBottom = (scrollTop + clientHeight) >= (scrollHeight - 40);
        return { scrollTop, clientHeight, scrollHeight, atBottom };
      } else {
        const scrollTop = this.target.scrollTop || 0;
        const clientHeight = this.target.clientHeight || 0;
        const scrollHeight = this.target.scrollHeight || 0;
        const atBottom = (scrollTop + clientHeight) >= (scrollHeight - 40);
        return { scrollTop, clientHeight, scrollHeight, atBottom };
      }
    }

    /**
     * Executes a scroll action by deltaPx
     * @param {number} deltaPx Pixels to scroll downwards (positive) or upwards (negative)
     * @param {boolean} smooth Whether to animate smoothly
     * @returns {Promise<{beforeTop: number, afterTop: number, scrolledDelta: number, atBottom: boolean}>}
     */
    async scroll(deltaPx = 500, smooth = true) {
      const before = this.getMetrics();
      const behavior = smooth ? "smooth" : "auto";

      if (this.isWindow) {
        window.scrollBy({
          top: deltaPx,
          left: 0,
          behavior
        });
      } else {
        this.target.scrollBy({
          top: deltaPx,
          left: 0,
          behavior
        });
      }

      // Small tick to allow browser smooth scroll animation to proceed
      await new Promise(resolve => setTimeout(resolve, 150));

      const after = this.getMetrics();
      return {
        beforeTop: before.scrollTop,
        afterTop: after.scrollTop,
        scrolledDelta: after.scrollTop - before.scrollTop,
        atBottom: after.atBottom
      };
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ScrollController };
  }
  global.ScrollController = ScrollController;
})(typeof window !== "undefined" ? window : globalThis);
