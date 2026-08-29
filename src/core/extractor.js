/**
 * extractor.js
 * Extracts structured metadata, text, emails, URLs, and recruiter info from LinkedIn post DOM nodes or raw text.
 */

// Comprehensive email regex
export const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;

// URL extractor regex
export const URL_REGEX = /\bhttps?:\/\/[^\s<>"{}|\^~\[\]`]+[^\s<>"{}|\^~\[\]`.,:;!]/gi;

// DM instruction indicators
export const DM_PATTERNS = [
  /\bdm\s+(me|your\s+cv|your\s+resume|for\s+details|to\s+apply)\b/i,
  /\bdrop\s+a\s+dm\b/i,
  /\bmessage\s+me\s+directly\b/i,
  /\binbox\s+me\b/i,
  /\bsend\s+a\s+direct\s+message\b/i,
  /\bconnect\s+and\s+dm\b/i,
];

/**
 * Clean and normalize text
 */
export function cleanText(text) {
  if (!text) return "";
  return text
    .replace(/\r\n|\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/**
 * Extract all valid email addresses from text
 */
export function extractEmails(text) {
  if (!text) return [];
  const matches = text.match(EMAIL_REGEX) || [];
  const validEmails = new Set();

  for (const raw of matches) {
    const cleaned = raw.toLowerCase().trim();
    // Filter out common false positives
    if (!cleaned.endsWith(".png") &&
        !cleaned.endsWith(".jpg") &&
        !cleaned.endsWith(".webp") &&
        !cleaned.includes("example.com") &&
        !cleaned.includes("linkedin.com") &&
        !cleaned.includes("domain.com") &&
        cleaned.length > 5) {
      validEmails.add(cleaned);
    }
  }

  return Array.from(validEmails);
}

/**
 * Extract potential application URLs from text and anchor tags
 */
export function extractApplicationUrls(text, postElement = null) {
  const urls = new Set();

  // Extract from raw text
  if (text) {
    const matches = text.match(URL_REGEX) || [];
    for (const url of matches) {
      if (isLikelyJobUrl(url)) {
        urls.add(url);
      }
    }
  }

  // Extract from DOM anchors if present
  if (postElement && typeof postElement.querySelectorAll === "function") {
    const anchors = postElement.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = a.getAttribute("href");
      if (href && href.startsWith("http") && isLikelyJobUrl(href)) {
        urls.add(href);
      }
    }
  }

  return Array.from(urls);
}

/**
 * Filter for relevant job / application / career URLs
 */
function isLikelyJobUrl(url) {
  const lower = url.toLowerCase();
  // Filter out internal non-job LinkedIn routes
  if (lower.includes("linkedin.com/feed") ||
      lower.includes("linkedin.com/in/") ||
      lower.includes("linkedin.com/posts/")) {
    return false;
  }

  const jobIndicators = [
    "career", "job", "apply", "greenhouse.io", "lever.co", "workable.com",
    "ashbyhq.com", "bamboohr.com", "notion.site", "forms.gle", "typeform.com",
    "docs.google.com/forms", "smartrecruiters.com", "recruitee.com",
    "hire", "position", "join", "team", "opening", "vacancy"
  ];

  return jobIndicators.some(indicator => lower.includes(indicator)) ||
         lower.includes("forms.gle") ||
         lower.includes("bit.ly") ||
         lower.includes("linktr.ee");
}

/**
 * Detect if post requires DM
 */
export function extractDmInstruction(text) {
  if (!text) return false;
  return DM_PATTERNS.some(pattern => pattern.test(text));
}

/**
 * Extract author, title/headline, and post link from LinkedIn feed element
 */
export function extractPostMetadata(postEl) {
  if (!postEl) return { authorName: "", authorHeadline: "", authorProfile: "", postUrl: "", urn: "" };

  const urn = postEl.getAttribute("data-urn") ||
              postEl.getAttribute("data-id") ||
              postEl.getAttribute("data-activity-id") ||
              `lead-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Author Name
  const authorNameEl = postEl.querySelector(
    ".update-components-actor__name span[aria-hidden='true'], " +
    ".update-components-actor__title span, " +
    ".feed-shared-actor__name, " +
    "a.app-aware-link span[dir='ltr']"
  );
  const authorName = authorNameEl ? authorNameEl.innerText.trim() : "LinkedIn User";

  // Author Headline / Company
  const headlineEl = postEl.querySelector(
    ".update-components-actor__description, " +
    ".update-components-actor__sub-description, " +
    ".feed-shared-actor__description"
  );
  const authorHeadline = headlineEl ? headlineEl.innerText.trim() : "";

  // Author Profile Link
  const profileLinkEl = postEl.querySelector(
    "a.update-components-actor__meta-link, " +
    "a.app-aware-link[href*='/in/'], " +
    ".feed-shared-actor__container-link"
  );
  let authorProfile = profileLinkEl ? profileLinkEl.getAttribute("href") : "";
  if (authorProfile && authorProfile.startsWith("/")) {
    authorProfile = `https://www.linkedin.com${authorProfile.split("?")[0]}`;
  }

  // Post Permalink
  let postUrl = "";
  if (urn && urn.includes("activity:")) {
    const activityId = urn.split("activity:")[1];
    postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
  } else {
    const linkEl = postEl.querySelector("a[href*='/feed/update/urn:li:activity:']");
    postUrl = linkEl ? linkEl.getAttribute("href") : window.location.href;
  }

  return {
    urn,
    authorName,
    authorHeadline,
    authorProfile,
    postUrl
  };
}

/**
 * Extract the full post body text from LinkedIn element
 */
export function extractPostBodyText(postEl) {
  if (!postEl) return "";

  // Try to find the description container
  const descEl = postEl.querySelector(
    ".update-components-text, " +
    ".feed-shared-update-v2__description, " +
    ".feed-shared-inline-show-more-text, " +
    ".feed-shared-text, " +
    "[data-ad-preview='message']"
  );

  if (descEl) {
    return cleanText(descEl.innerText);
  }

  return cleanText(postEl.innerText);
}

/**
 * Formats a lead as structured text for 1-click clipboard export
 */
export function formatLeadStructuredText(lead) {
  return [
    `Role: ${lead.detectedRole || "Software Developer / Engineer"}`,
    `Company: ${lead.company || lead.authorName || "Unknown"}`,
    `Score: ${lead.score}% (${lead.label.toUpperCase()})`,
    lead.emails && lead.emails.length > 0 ? `Email: ${lead.emails.join(", ")}` : null,
    lead.applicationUrls && lead.applicationUrls.length > 0 ? `Application URL: ${lead.applicationUrls[0]}` : null,
    lead.requiresDm ? `Contact: DM on LinkedIn` : null,
    `Recruiter/Poster: ${lead.authorName || "N/A"}${lead.authorHeadline ? ` (${lead.authorHeadline})` : ""}`,
    lead.authorProfile ? `Profile: ${lead.authorProfile}` : null,
    lead.postUrl ? `Post: ${lead.postUrl}` : null,
    `Source: LinkedIn Radar`,
    `Date: ${new Date(lead.detectedAt || Date.now()).toLocaleDateString()}`,
    `\nSnippet:\n"${(lead.textSnippet || "").slice(0, 300)}..."`
  ].filter(Boolean).join("\n");
}

/**
 * Generate a pre-filled cold outreach email draft from template and lead metadata
 * @param {Object} lead - Lead object
 * @param {Object} settings - Extension settings containing emailTemplate and userProfile
 * @returns {Object} { to, subject, body }
 */
export function generateEmailDraft(lead, settings = {}) {
  const profile = settings.userProfile || {
    name: "Supto",
    email: "suptokhan24@gmail.com",
    phone: "+8801620531802"
  };

  const template = settings.emailTemplate || {
    subject: "Application for {role} - {user_name}",
    body: `Hi {recruiter},\n\nI'm making an application for the job of {role}. Please find my CV attached as stated in the job description.\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
  };

  const to = lead.emails && lead.emails.length > 0 ? lead.emails[0] : "";
  const role = lead.detectedRole || "Developer";
  const company = lead.company || "Your Company";
  const recruiter = lead.authorName && !lead.authorName.includes("User") ? lead.authorName : "Hiring Team";
  const tech = (lead.techMatches || []).slice(0, 3).join(", ") || "software development";

  const replaceVars = (str) => {
    if (!str) return "";
    return str
      .replace(/\{role\}/gi, role)
      .replace(/\{company\}/gi, company)
      .replace(/\{recruiter\}/gi, recruiter)
      .replace(/\{tech\}/gi, tech)
      .replace(/\{user_name\}/gi, profile.name || "Supto")
      .replace(/\{user_email\}/gi, profile.email || "suptokhan24@gmail.com")
      .replace(/\{user_phone\}/gi, profile.phone || "+8801620531802");
  };

  return {
    to,
    subject: replaceVars(template.subject),
    body: replaceVars(template.body)
  };
}

/**
 * Generate standard web Gmail Compose URL
 * Compatible with MailSuite / Mailtrack Chrome extension for open tracking
 */
export function getGmailComposeUrl(to, subject, body) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to || "",
    su: subject || "",
    body: body || ""
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

