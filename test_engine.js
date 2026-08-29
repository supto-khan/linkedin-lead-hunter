/**
 * test_engine.js
 * Automated test suite for LeadHunter scoring, extraction, and signal validation.
 */

import { scorePost } from "./src/core/scoring.js";
import { extractEmails, extractApplicationUrls, formatLeadStructuredText } from "./src/core/extractor.js";
import { DEFAULT_SETTINGS } from "./src/config/defaults.js";

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

console.log("==================================================");
console.log(" running LeadHunter Deterministic Engine Tests   ");
console.log("==================================================\n");

// Test 1: Hot Lead with Direct Email & Senior Angular Role
console.log("Test 1: Hot Lead (Senior Angular + Email + Intent)");
const post1 = `
🚀 We're hiring!
We are looking for a Senior Angular Developer to join our engineering team.
Requirements:
- 5+ years of experience with Angular 17/18, TypeScript, RxJS, NgRx
- Experience with REST APIs and Tailwind CSS
If you're interested, please send your CV to careers@abctech.com or apply here: https://abctech.com/careers/angular-dev
`;
const result1 = scorePost(post1, DEFAULT_SETTINGS);
assert(result1.score >= 80, `Expected hot score (>=80), got ${result1.score}`);
assert(result1.label === "hot", `Expected label 'hot', got ${result1.label}`);
assert(result1.detectedRole.includes("Angular"), `Expected Angular role, got ${result1.detectedRole}`);
assert(result1.emails.includes("careers@abctech.com"), `Expected email careers@abctech.com, got ${JSON.stringify(result1.emails)}`);
assert(result1.applicationUrls.length > 0, `Expected apply URLs, got ${result1.applicationUrls.length}`);
console.log("Signals:", result1.matchedSignals);
console.log("");

// Test 2: Laravel + PHP Role
console.log("Test 2: Laravel Role with DM Contact");
const post2 = `
We have a new job opening for a Full Stack Laravel Developer (PHP, MySQL, Livewire).
Interested candidates kindly drop a DM with your resume for details! #hiring #jobopening
`;
const result2 = scorePost(post2, DEFAULT_SETTINGS);
assert(result2.score >= 60, `Expected relevant score (>=60), got ${result2.score}`);
assert(result2.requiresDm === true, `Expected requiresDm to be true`);
assert(result2.techMatches.includes("Laravel"), `Expected Laravel in techMatches`);
console.log("Signals:", result2.matchedSignals);
console.log("");

// Test 3: Negative Penalty (Job Seeker / OpenToWork)
console.log("Test 3: Job Seeker Post (#opentowork penalty)");
const post3 = `
Hello network, I am open to work and looking for a job as a Senior Angular Developer.
Check out my portfolio and hire me! #opentowork
`;
const result3 = scorePost(post3, DEFAULT_SETTINGS);
assert(result3.score < 30, `Expected low/ignore score (<30), got ${result3.score}`);
assert(result3.label === "ignore", `Expected label 'ignore', got ${result3.label}`);
console.log("Signals:", result3.matchedSignals);
console.log("");

// Test 4: Hard Exclusions (Unpaid / Volunteer)
console.log("Test 4: Hard Exclusion (Unpaid opportunity)");
const post4 = `
We're hiring an Angular Developer for an unpaid volunteer project. Send CV to jobs@volunteer.org
`;
const result4 = scorePost(post4, DEFAULT_SETTINGS);
assert(result4.score === 0, `Expected 0 score due to hard exclusion, got ${result4.score}`);
assert(result4.label === "excluded", `Expected label 'excluded', got ${result4.label}`);
console.log("Signals:", result4.matchedSignals);
console.log("");

// Test 5: Structured Lead Clipboard Formatter
console.log("Test 5: Structured Lead Clipboard Formatting");
const formatted = formatLeadStructuredText({
  detectedRole: "Senior Angular Developer",
  company: "ABC Technologies",
  score: 95,
  label: "hot",
  emails: ["careers@abc.com"],
  applicationUrls: ["https://abc.com/careers"],
  requiresDm: false,
  authorName: "Jane Recruiter",
  authorHeadline: "Tech Talent Lead at ABC",
  authorProfile: "https://linkedin.com/in/janerecruiter",
  postUrl: "https://linkedin.com/feed/update/urn:li:activity:12345",
  textSnippet: "We are looking for a Senior Angular Developer..."
});
assert(formatted.includes("Senior Angular Developer"), "Formatted text contains role");
assert(formatted.includes("careers@abc.com"), "Formatted text contains email");
assert(formatted.includes("Source: LinkedIn Radar"), "Formatted text contains Source");
console.log(formatted);

// Test 6: Duplicate Check by Email
console.log("Test 6: Duplicate Check by Email");
import { saveLead, getLeads, clearAllLeads } from "./src/core/storage.js";
await clearAllLeads();

const leadA = {
  urn: "urn:li:activity:111111",
  detectedRole: "Senior Angular Developer",
  company: "ABC Tech",
  emails: ["jobs@abctech.com"],
  score: 90,
  label: "hot",
  status: "applied" // User applied
};
const resA = await saveLead(leadA);
assert(resA.isNew === true, "First lead with jobs@abctech.com should be marked as isNew: true");

// Reposted by a different recruiter / agency with different URN but same email
const leadB = {
  urn: "urn:li:activity:999999", // Different post URN
  detectedRole: "Angular Engineer",
  company: "ABC Tech Recruiter",
  emails: ["jobs@abctech.com"], // Exact same email
  score: 95,
  label: "hot",
  status: "new"
};
const resB = await saveLead(leadB);
assert(resB.isNew === false, "Second post with same email should be detected as duplicate (isNew: false)");
assert(resB.duplicateReason === "email", `Expected duplicateReason 'email', got '${resB.duplicateReason}'`);
assert(resB.lead.status === "applied", "Existing user outreach status ('applied') should be preserved across duplicate posts");
assert(resB.lead.repostCount === 1, `Expected repostCount 1, got ${resB.lead.repostCount}`);

const storedLeads = await getLeads();
assert(storedLeads.length === 1, `Expected exactly 1 consolidated lead in CRM, got ${storedLeads.length}`);

// Test 7: Cold Email Draft & Gmail URL Generation
console.log("\nTest 7: Cold Email Draft & Gmail URL Generation");
const { generateEmailDraft, getGmailComposeUrl } = await import("./src/core/extractor.js");
const sampleCandidateLead = {
  detectedRole: "Senior Angular Developer",
  company: "ABC Technologies",
  emails: ["careers@abc.com"],
  authorName: "Jane Recruiter",
  techMatches: ["Angular", "TypeScript"]
};
const draft = generateEmailDraft(sampleCandidateLead, DEFAULT_SETTINGS);

assert(draft.to === "careers@abc.com", `Expected recipient careers@abc.com, got ${draft.to}`);
assert(draft.subject === "Application for Senior Angular Developer Position", `Expected 'Application for Senior Angular Developer Position', got '${draft.subject}'`);
assert(draft.body.includes("CV attached"), "Expected CV mention in body");
assert(draft.body.includes("+8801620531802"), "Expected phone number in body");
assert(draft.body.includes("suptokhan24@gmail.com"), "Expected candidate email in body");

const composeUrl = getGmailComposeUrl(draft.to, draft.subject, draft.body);
assert(composeUrl.startsWith("https://mail.google.com/mail/"), "Expected Gmail web compose URL");
assert(composeUrl.includes("view=cm"), "Expected compose mode in URL");
console.log("Draft preview:\n", draft);

console.log("\n==================================================");
console.log(` Test Results: ${passed} passed, ${failed} failed `);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
}

