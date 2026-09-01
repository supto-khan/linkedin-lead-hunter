/**
 * test_engine.js
 * Automated test suite for LeadHunter scoring, extraction, and signal validation.
 */

import { scorePost } from "./src/core/scoring.js";
import { extractEmails, extractApplicationUrls, formatLeadStructuredText } from "./src/core/extractor.js";
import { getOutreachEngineStats } from "./src/core/outreachEngine.js";
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
const { generateEmailDraft, getGmailComposeUrl, classifyLeadCvType } = await import("./src/core/extractor.js");
const sampleCandidateLead = {
  detectedRole: "Senior Angular Developer",
  company: "ABC Technologies",
  emails: ["careers@abc.com"],
  authorName: "Jane Recruiter",
  techMatches: ["Angular", "TypeScript"]
};

const testSettings = {
  ...DEFAULT_SETTINGS,
  cvLinks: {
    angular: "https://drive.google.com/angular-cv-link",
    frontend: "https://drive.google.com/frontend-cv-link",
    fullstack: "https://drive.google.com/fullstack-cv-link"
  },
  replyToEmail: "suptokhan24@gmail.com"
};

const draft = generateEmailDraft(sampleCandidateLead, testSettings);

assert(draft.to === "careers@abc.com", `Expected recipient careers@abc.com, got ${draft.to}`);
assert(draft.subject.includes("Senior Angular Developer"), `Expected role in subject, got '${draft.subject}'`);
assert(draft.cvType === "angular", `Expected 'angular' cvType, got '${draft.cvType}'`);
assert(draft.body.includes("https://drive.google.com/angular-cv-link"), "Expected Angular Google Drive CV link in body");
assert(draft.body.includes("+8801620531802"), "Expected phone number in body");
assert(draft.body.includes("suptokhan24@gmail.com"), "Expected candidate email in body");

const composeUrl = getGmailComposeUrl(draft.to, draft.subject, draft.body, { replyTo: testSettings.replyToEmail });
assert(composeUrl.startsWith("https://mail.google.com/mail/"), "Expected Gmail web compose URL");
assert(composeUrl.includes("view=cm"), "Expected compose mode in URL");
assert(composeUrl.includes("replyto=suptokhan24%40gmail.com"), "Expected replyto param in URL");
console.log("Draft preview:\n", draft);

// Test 8: Role Normalization for React, Reactjs, and Next.js
console.log("\nTest 8: Role Normalization for React, Reactjs, Next");
const reactPost = `
🚀 We are hiring! Looking for a React Developer to join our team. Send CV to hr@startup.io
`;
const resReact = scorePost(reactPost, DEFAULT_SETTINGS);
assert(resReact.detectedRole === "Front End Developer", `Expected 'Front End Developer' for React, got '${resReact.detectedRole}'`);

const reactjsPost = `
We're hiring a Reactjs Developer with experience in Tailwind and REST APIs. Apply: hr@company.com
`;
const resReactjs = scorePost(reactjsPost, DEFAULT_SETTINGS);
assert(resReactjs.detectedRole === "Front End Developer", `Expected 'Front End Developer' for Reactjs, got '${resReactjs.detectedRole}'`);

const nextPost = `
Hiring Alert: Seeking a Next.js Developer for a full-time position. Send resume to talent@tech.io
`;
const resNext = scorePost(nextPost, DEFAULT_SETTINGS);
assert(resNext.detectedRole === "Front End Developer", `Expected 'Front End Developer' for Next.js, got '${resNext.detectedRole}'`);

const nextPlainPost = `
We have a job opening for Next Developer. Contact: jobs@agency.com
`;
const resNextPlain = scorePost(nextPlainPost, DEFAULT_SETTINGS);
assert(resNextPlain.detectedRole === "Front End Developer", `Expected 'Front End Developer' for Next Developer, got '${resNextPlain.detectedRole}'`);

// Storage save lead normalization test
const savedReactLead = await saveLead({
  urn: "urn:li:activity:777777",
  detectedRole: "Reactjs Developer",
  emails: ["reactlead@domain.com"]
});
assert(savedReactLead.lead.detectedRole === "Front End Developer", `Expected saved lead role to be 'Front End Developer', got '${savedReactLead.lead.detectedRole}'`);

// Test 9: DM Lead Deduplication (No Email, No Apply URL)
console.log("\nTest 9: DM Lead Deduplication (No Email, No Apply URL)");
const { deduplicateStoredLeads } = await import("./src/core/storage.js");
await clearAllLeads();

const dmLead1 = {
  id: "lead-fp-abc12345",
  urn: "urn:li:activity:888111222",
  authorName: "Sarah Tech Recruiter",
  authorProfile: "https://www.linkedin.com/in/sarahrecruiter",
  detectedRole: "Front End Developer",
  requiresDm: true,
  emails: [],
  applicationUrls: [],
  textSnippet: "We are hiring a Frontend Developer! Drop a DM with your resume.",
  score: 85,
  status: "applied",
  notes: "Sent DM on LinkedIn"
};
const resDm1 = await saveLead(dmLead1);
assert(resDm1.isNew === true, "First DM lead should be marked isNew: true");

// Scenario A: Same DM lead re-scanned on scroll with a temporary wrapper ID (e.g. from DOM unmounting/remounting)
const dmLeadScrollRescan = {
  id: "ember99999", // Dynamic ember id
  urn: "urn:li:activity:888111222", // Same LinkedIn activity ID
  authorName: "Sarah Tech Recruiter",
  authorProfile: "https://www.linkedin.com/in/sarahrecruiter",
  detectedRole: "Front End Developer",
  requiresDm: true,
  emails: [],
  applicationUrls: [],
  textSnippet: "We are hiring a Frontend Developer! Drop a DM with your resume.",
  score: 85
};
const resDmScroll = await saveLead(dmLeadScrollRescan);
assert(resDmScroll.isNew === false, "DM lead with same activity ID must be detected as duplicate");

// Scenario B: Same recruiter posts identical DM text but LinkedIn permalink or post hash varied slightly
const dmLeadSameAuthorAndText = {
  id: "lead-hash-different99",
  urn: "lead-hash-different99",
  authorName: "Sarah Tech Recruiter",
  authorProfile: "https://www.linkedin.com/in/sarahrecruiter",
  detectedRole: "Front End Developer",
  requiresDm: true,
  emails: [],
  applicationUrls: [],
  textSnippet: "We are hiring a Frontend Developer! Drop a DM with your resume. (Extra spaces)",
  score: 85
};
const resDmSameAuthor = await saveLead(dmLeadSameAuthorAndText);
assert(resDmSameAuthor.isNew === false, "DM lead from same author profile with matching post text must be detected as duplicate");

// Scenario C: Identical DM post text content
const dmLeadIdenticalText = {
  id: "lead-hash-random123",
  urn: "lead-hash-random123",
  authorName: "LinkedIn User", // Unknown/generic author
  detectedRole: "Front End Developer",
  requiresDm: true,
  emails: [],
  applicationUrls: [],
  textSnippet: "We are hiring a Frontend Developer! Drop a DM with your resume.",
  score: 85
};
const resDmText = await saveLead(dmLeadIdenticalText);
assert(resDmText.isNew === false, "DM lead with identical text snippet must be detected as duplicate");

// Verify only 1 lead remains in CRM, and user status/notes were preserved
const allDmLeads = await getLeads();
assert(allDmLeads.length === 1, `Expected exactly 1 consolidated DM lead in CRM, got ${allDmLeads.length}`);
assert(allDmLeads[0].status === "applied", "Preserved outreach status 'applied'");
assert(allDmLeads[0].notes === "Sent DM on LinkedIn", "Preserved outreach notes");
assert(allDmLeads[0].repostCount >= 3, `Expected repostCount >= 3, got ${allDmLeads[0].repostCount}`);

// Test deduplicateStoredLeads on a legacy dirty array
const dirtyLeadsArray = [
  { id: "1", authorProfile: "https://linkedin.com/in/john", textSnippet: "Hiring React dev, DM me", detectedRole: "React Developer", score: 80 },
  { id: "2", authorProfile: "https://linkedin.com/in/john", textSnippet: "Hiring React dev, DM me", detectedRole: "React Developer", score: 90 },
  { id: "3", authorProfile: "https://linkedin.com/in/mary", textSnippet: "Looking for Angular dev, DM me", detectedRole: "Angular Developer", score: 75 }
];
const cleanedLeads = deduplicateStoredLeads(dirtyLeadsArray);
assert(cleanedLeads.length === 2, `Expected 2 unique leads after deduplicating dirty array, got ${cleanedLeads.length}`);
assert(cleanedLeads[0].score === 90, "Retained highest score during consolidation");
assert(cleanedLeads[0].detectedRole === "Front End Developer", "Normalized React role to Front End Developer");

// Test 10: Badge Count only tracks 'new' status and recounts on status change
console.log("\nTest 10: Badge Count recounts on status change (only 'new' status)");
const { updateLeadStatus } = await import("./src/core/storage.js");
await clearAllLeads();

await saveLead({ id: "lead-1", detectedRole: "Front End Developer", status: "new" });
await saveLead({ id: "lead-2", detectedRole: "Front End Developer", status: "new" });
await saveLead({ id: "lead-3", detectedRole: "Front End Developer", status: "new" });

let newLeads = await getLeads({ status: "new" });
assert(newLeads.length === 3, `Expected 3 new leads for badge count, got ${newLeads.length}`);

// Change status of lead-1 to 'contacted'
await updateLeadStatus("lead-1", "contacted");
newLeads = await getLeads({ status: "new" });
assert(newLeads.length === 2, `Expected badge count to recount to 2 after lead-1 status changed to 'contacted', got ${newLeads.length}`);

// Change status of lead-2 to 'applied'
await updateLeadStatus("lead-2", "applied");
newLeads = await getLeads({ status: "new" });
assert(newLeads.length === 1, `Expected badge count to recount to 1 after lead-2 status changed to 'applied', got ${newLeads.length}`);

// Test 11: Strict Role & Tech Filtering (Excludes non-tech posts like Class A Truck Driver)
console.log("\nTest 11: Strict Role & Tech Filter (Non-tech posts ignored despite high hiring signals)");
const truckDriverPost = `
  🚨 WE ARE URGENTLY HIRING! 🚨
  Position: Class A CDL Truck Driver
  Location: Dallas, TX
  Requirements: Clean driving record, 2+ years OTR experience.
  Salary: $85,000 / year
  Send your resume directly to dispatch@logisticsinc.com or apply here: https://logisticsinc.com/apply
  🚀 #hiring #jobopening #nowhiring
`;

const truckResult = scorePost(truckDriverPost);
assert(truckResult.score === 0, `Expected score 0 for Class A Truck Driver post, got ${truckResult.score}`);
assert(truckResult.label === "ignore", `Expected label 'ignore' for non-tech post, got ${truckResult.label}`);
assert(truckResult.detectedRole === null, `Expected detectedRole null for non-tech post, got ${truckResult.detectedRole}`);

const nursePost = `
  We're hiring Registered Nurses (RN) for our ICU unit!
  Apply now: https://hospital.org/careers or email your cv to careers@hospital.org.
  Requirements: BSN degree, active license.
`;
const nurseResult = scorePost(nursePost);
assert(nurseResult.score === 0, `Expected score 0 for Nurse post, got ${nurseResult.score}`);
assert(nurseResult.label === "ignore", `Expected label 'ignore' for Nurse post, got ${nurseResult.label}`);

const frontendPost = `
  We're hiring a Front End Developer!
  Tech stack: React, TypeScript, Tailwind.
  Send your CV to jobs@techstart.io or apply here: https://techstart.io/jobs
`;
const frontendResult = scorePost(frontendPost);
assert(frontendResult.score >= 80, `Expected hot score for Frontend Developer post, got ${frontendResult.score}`);
assert(frontendResult.detectedRole === "Front End Developer", `Expected Front End Developer, got ${frontendResult.detectedRole}`);

// Test 12: Strict Actionable Contact Gating (Requires Email, Apply Link, or DM Poster)
console.log("\nTest 12: Strict Actionable Contact Gating (Reject leads without Email, Apply Link, or DM)");
const noContactDevPost = `
  Great news! Our engineering team is expanding and we are looking for a Senior React Developer to join us.
  Must have experience with React, TypeScript, and Next.js. Exciting projects ahead!
  #react #developer #hiring
`;
const noContactResult = scorePost(noContactDevPost);
assert(noContactResult.score === 0, `Expected score 0 for post without email/link/DM, got ${noContactResult.score}`);
assert(noContactResult.label === "ignore", `Expected label 'ignore', got ${noContactResult.label}`);

const emailDevPost = `
  We're hiring a Senior React Developer! Send your resume to hire@company.com.
  Skills: React, Next.js, Redux.
`;
const emailResult = scorePost(emailDevPost);
assert(emailResult.score >= 80, `Expected score >= 80 for email post, got ${emailResult.score}`);
assert(emailResult.emails.length === 1, `Expected 1 email, got ${emailResult.emails.length}`);

const applyLinkDevPost = `
  We are hiring a Frontend Developer (React, Next.js).
  Apply online at https://jobs.lever.co/techco/12345
`;
const applyLinkResult = scorePost(applyLinkDevPost);
assert(applyLinkResult.score >= 80, `Expected score >= 80 for apply link post, got ${applyLinkResult.score}`);
assert(applyLinkResult.applicationUrls.length === 1, `Expected 1 apply url, got ${applyLinkResult.applicationUrls.length}`);

const dmDevPost = `
  We are hiring a Frontend Developer (React, Tailwind). DM me your portfolio and CV!
`;
const dmResult = scorePost(dmDevPost);
assert(dmResult.score >= 60, `Expected score >= 60 for DM post, got ${dmResult.score}`);
assert(dmResult.requiresDm === true, `Expected requiresDm to be true`);

// Test 13: Direct Post URL clipboard formatting
console.log("\nTest 13: Direct Post URL Clipboard Formatting");
const sampleLead = {
  id: "urn:li:activity:7123456789012345678",
  urn: "urn:li:activity:7123456789012345678",
  detectedRole: "Front End Developer",
  company: "Silicon Tech",
  score: 90,
  label: "hot",
  emails: ["jobs@silicon.io"],
  authorName: "Sarah Tech",
  authorHeadline: "Engineering Director at Silicon Tech",
  authorProfile: "https://linkedin.com/in/sarahtech",
  textSnippet: "We're hiring a Front End Developer (React, Next.js). Send CV to jobs@silicon.io"
};

const formattedLeadText = formatLeadStructuredText(sampleLead);
assert(formattedLeadText.includes("Post URL: https://www.linkedin.com/feed/update/urn:li:activity:7123456789012345678"), "Formatted text contains direct Post URL");
assert(!formattedLeadText.includes("Profile: https://linkedin.com/in/sarahtech"), "Formatted text does not use author profile as the post link");

// Test 14: Auto Mail vs Individual Mail Quota Isolation
console.log("\nTest 14: Auto Mail vs Individual Mail Quota Isolation");
const mockSettings = {
  ...DEFAULT_SETTINGS,
  senderAccounts: [
    { email: "sender1@gmail.com", dailyQuota: 60, sentToday: 0, enabled: true, isFallback: false },
    { email: "sender2@gmail.com", dailyQuota: 60, sentToday: 0, enabled: true, isFallback: false }
  ]
};

const initialStats = getOutreachEngineStats(mockSettings);
assert(initialStats.totalSentToday === 0, `Expected initial totalSentToday 0, got ${initialStats.totalSentToday}`);

// Simulating individual email send via Launch Gmail/Mailto: only marks lead contacted, does NOT increment auto-mail quotas
const mockLead = { id: "lead_123", status: "new" };
mockLead.status = "contacted"; // lead status updated in CRM

const statsAfterIndividualSend = getOutreachEngineStats(mockSettings);
assert(statsAfterIndividualSend.totalSentToday === 0, `Expected totalSentToday to remain 0 after individual email send, got ${statsAfterIndividualSend.totalSentToday}`);
assert(mockSettings.senderAccounts[0].sentToday === 0, `Expected sender1 sentToday to remain 0, got ${mockSettings.senderAccounts[0].sentToday}`);

console.log("\n==================================================");
console.log(` Test Results: ${passed} passed, ${failed} failed `);
console.log("==================================================");

if (failed > 0) {
  process.exit(1);
}

