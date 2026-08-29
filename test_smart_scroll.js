/**
 * test_smart_scroll.js
 * Unit tests for Smart Scroll deterministic engine modules.
 */

// Mock browser environment for Node.js
global.window = {
  innerWidth: 1200,
  innerHeight: 800,
  scrollY: 0,
  scrollBy: function ({ top }) {
    this.scrollY = (this.scrollY || 0) + top;
  },
  getComputedStyle: function () {
    return { display: "block", visibility: "visible", opacity: "1", overflowY: "auto" };
  },
  dispatchEvent: function () {}
};
global.document = {
  documentElement: {
    scrollTop: 0,
    scrollHeight: 3000,
    clientHeight: 800,
    offsetHeight: 3000
  },
  body: {
    scrollHeight: 3000,
    offsetHeight: 3000
  },
  elementFromPoint: function () {
    return {
      nodeType: 1,
      scrollHeight: 4000,
      clientHeight: 800,
      clientWidth: 800,
      scrollTop: 0,
      getBoundingClientRect: () => ({ top: 0, left: 200, width: 800, height: 800, right: 1000, bottom: 800 }),
      parentElement: null,
      scrollBy: function ({ top }) {
        this.scrollTop = (this.scrollTop || 0) + top;
      }
    };
  },
  querySelector: function () { return null; }
};
global.Node = { ELEMENT_NODE: 1 };
global.MutationObserver = class {
  constructor(cb) { this.cb = cb; }
  observe() {}
  disconnect() {}
};

const { ContainerDetector } = require("./src/content/containerDetector.js");
const { ScrollController } = require("./src/content/scrollController.js");
const { SettlementDetector } = require("./src/content/settlementDetector.js");
const { StopConditions } = require("./src/content/stopConditions.js");
const { ScrollEngine } = require("./src/content/scrollEngine.js");

console.log("==================================================");
console.log("  Running Smart Scroll Engine Unit Tests         ");
console.log("==================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// 1. Test ContainerDetector
console.log("Test 1: ContainerDetector Candidate Scoring");
const candidate = ContainerDetector.findBestScrollContainer();
assert(candidate !== null, "Found scrollable container candidate");
const isCandidate = ContainerDetector.isScrollCandidate(candidate);
assert(isCandidate === true, "Identified container as valid scroll candidate");

// 2. Test ScrollController
console.log("\nTest 2: ScrollController Smooth Execution");
const controller = new ScrollController(global.window);
const metricsBefore = controller.getMetrics();
assert(metricsBefore.clientHeight === 800, "Initial clientHeight is 800");
controller.scroll(400, false).then(res => {
  assert(res.scrolledDelta === 400, "Scrolled by 400px delta");
  assert(res.afterTop === 400, "New scroll top is 400px");
});

// 3. Test StopConditions
console.log("\nTest 3: StopConditions Evaluation");
const stopRules = new StopConditions({
  maxScrolls: 5,
  maxDurationMinutes: 1,
  stopOnBottom: true,
  noActivityTimeoutSec: 5
});

assert(stopRules.evaluate({ scrollsCount: 2, isStopped: false }).shouldStop === false, "Does not stop when within limits");
assert(stopRules.evaluate({ scrollsCount: 5, isStopped: false }).shouldStop === true, "Stops when maxScrolls (5) is reached");
assert(stopRules.evaluate({ scrollsCount: 1, isStopped: true }).shouldStop === true, "Stops when manual stop is requested");

// 4. Test SettlementDetector
console.log("\nTest 4: SettlementDetector addedNodes Filter");
const settlement = new SettlementDetector(global.document.body);
assert(settlement.minThreshold === 2, "Threshold set to 2 to filter noise");
assert(settlement.activityEventsCount === 0, "Initial activity count is 0");

// 5. Test ScrollEngine State & Config
console.log("\nTest 5: ScrollEngine Initialization");
const engine = new ScrollEngine();
const state = engine.getState();
assert(state.isRunning === false, "Engine initially idle");
assert(state.config.stepPx === 500, "Default scroll step is 500px");
assert(state.config.delayMs === 2000, "Default delay is 2000ms");

setTimeout(() => {
  console.log("\n==================================================");
  console.log(` Test Results: ${passed} passed, ${failed} failed `);
  console.log("==================================================");
  if (failed > 0) process.exit(1);
}, 300);
