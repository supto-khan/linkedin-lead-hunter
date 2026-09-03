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

  // 1. Author Name
  const authorNameEl = postEl.querySelector(
    ".update-components-actor__name span[aria-hidden='true'], " +
    ".update-components-actor__title span, " +
    ".feed-shared-actor__name, " +
    "a.app-aware-link span[dir='ltr']"
  );
  const authorName = authorNameEl ? authorNameEl.innerText.trim() : "LinkedIn User";

  // 2. Author Headline / Company
  const headlineEl = postEl.querySelector(
    ".update-components-actor__description, " +
    ".update-components-actor__sub-description, " +
    ".feed-shared-actor__description"
  );
  const authorHeadline = headlineEl ? headlineEl.innerText.trim() : "";

  // 3. Author Profile Link
  const profileLinkEl = postEl.querySelector(
    "a.update-components-actor__meta-link, " +
    "a.app-aware-link[href*='/in/'], " +
    "a.app-aware-link[href*='/company/'], " +
    ".feed-shared-actor__container-link"
  );
  let authorProfile = profileLinkEl ? profileLinkEl.getAttribute("href") : "";
  if (authorProfile && authorProfile.startsWith("/")) {
    authorProfile = `https://www.linkedin.com${authorProfile.split("?")[0]}`;
  }

  // 4. Extract Real Activity URN
  let urn = postEl.getAttribute("data-urn") ||
            postEl.getAttribute("data-id") ||
            postEl.getAttribute("data-activity-id");

  if (!urn || urn.startsWith("ember") || urn.startsWith("expanded")) {
    const childWithUrn = postEl.querySelector("[data-urn*='activity'], [data-urn*='ugcPost'], [data-urn*='share'], [data-id*='activity']");
    if (childWithUrn) {
      urn = childWithUrn.getAttribute("data-urn") || childWithUrn.getAttribute("data-id");
    }
  }

  if (!urn || urn.startsWith("ember") || urn.startsWith("expanded")) {
    const linkEl = postEl.querySelector("a[href*='urn:li:activity:'], a[href*='/feed/update/urn:li:activity:'], a[href*='activity:']");
    if (linkEl) {
      const href = linkEl.getAttribute("href") || "";
      const match = href.match(/urn:li:(activity|ugcPost|share):(\d+)/i) || href.match(/activity:(\d+)/i);
      if (match) {
        urn = `urn:li:activity:${match[2] || match[1]}`;
      }
    }
  }

  // Deterministic fallback based on author + text content instead of random number
  if (!urn || urn.startsWith("ember") || urn.startsWith("expanded")) {
    const bodyText = postEl.innerText || "";
    const cleanSample = bodyText.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
    let hash = 0;
    const str = `${authorProfile || authorName}:${cleanSample}`;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    urn = `lead-fp-${Math.abs(hash).toString(36)}`;
  }

  // 5. Post Permalink
  let postUrl = "";
  if (urn && urn.includes("activity:")) {
    const activityId = urn.split("activity:")[1];
    postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${activityId}`;
  } else {
    const linkEl = postEl.querySelector("a[href*='/feed/update/'], a[href*='/jobs/view/'], a[href*='/posts/']");
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
  const postUrl = lead.postUrl || (lead.urn && lead.urn.includes("activity:") ? `https://www.linkedin.com/feed/update/urn:li:activity:${lead.urn.split("activity:")[1].replace(/[^0-9]/g, "")}` : null);
  return [
    `Role: ${lead.detectedRole || "Software Developer / Engineer"}`,
    `Company: ${lead.company || lead.authorName || "Unknown"}`,
    `Score: ${lead.score}% (${lead.label.toUpperCase()})`,
    lead.emails && lead.emails.length > 0 ? `Email: ${lead.emails.join(", ")}` : null,
    lead.applicationUrls && lead.applicationUrls.length > 0 ? `Application URL: ${lead.applicationUrls[0]}` : null,
    lead.requiresDm ? `Contact: DM on LinkedIn` : null,
    postUrl ? `Post URL: ${postUrl}` : null,
    `Recruiter/Poster: ${lead.authorName || "N/A"}${lead.authorHeadline ? ` (${lead.authorHeadline})` : ""}`,
    `Source: LinkedIn Radar`,
    `Date: ${new Date(lead.detectedAt || Date.now()).toLocaleDateString()}`,
    `\nSnippet:\n"${(lead.textSnippet || "").slice(0, 300)}..."`
  ].filter(Boolean).join("\n");
}

/**
 * Automatically classify the lead to one of the 3 CV categories:
 * - 'angular' (Angular Specialist CV)
 * - 'frontend' (Frontend Generalist / React / Next.js / Vue CV)
 * - 'fullstack' (Full Stack / Backend / Node / Python / Laravel CV)
 * @param {Object} lead 
 * @returns {Object} { type: string, label: string }
 */
export function classifyLeadCvType(lead) {
  const detectedRole = (lead.detectedRole || "").trim().toLowerCase();
  const techMatches = (lead.techMatches || []).map(t => String(t).toLowerCase());
  const snippet = (lead.textSnippet || "").toLowerCase();

  // 1. PRIMARY: Match against explicitly detected role title first
  if (detectedRole && !["job opportunity", "software engineer", "developer", "engineer"].includes(detectedRole)) {
    // Angular specific role
    if (detectedRole.includes("angular")) {
      return { type: "angular", label: "Angular Developer CV" };
    }

    // Frontend / UI / React / Next.js / Vue role
    if (
      detectedRole.includes("front end") ||
      detectedRole.includes("frontend") ||
      detectedRole.includes("react") ||
      detectedRole.includes("next") ||
      detectedRole.includes("vue") ||
      detectedRole.includes("ui") ||
      detectedRole.includes("web developer") ||
      detectedRole.includes("javascript developer")
    ) {
      return { type: "frontend", label: "Frontend Developer CV" };
    }

    // Full Stack / Backend / API / Node / Laravel / Python role
    if (
      detectedRole.includes("full stack") ||
      detectedRole.includes("fullstack") ||
      detectedRole.includes("backend") ||
      detectedRole.includes("back end") ||
      detectedRole.includes("node") ||
      detectedRole.includes("laravel") ||
      detectedRole.includes("php") ||
      detectedRole.includes("python") ||
      detectedRole.includes("api")
    ) {
      return { type: "fullstack", label: "Full Stack Developer CV" };
    }
  }

  // 2. SECONDARY: If role title is generic or missing, evaluate techMatches and content signals
  let angularScore = 0;
  let frontendScore = 0;
  let fullstackScore = 0;

  techMatches.forEach(t => {
    if (t.includes("angular") || t.includes("rxjs") || t.includes("ngrx")) angularScore += 2;
    if (t.includes("react") || t.includes("next") || t.includes("vue") || t.includes("tailwind")) frontendScore += 2;
    if (t.includes("node") || t.includes("express") || t.includes("python") || t.includes("laravel") || t.includes("mysql") || t.includes("mongodb") || t.includes("fullstack") || t.includes("full stack")) fullstackScore += 2;
  });

  if (snippet.includes("angular")) angularScore += 1;
  if (snippet.includes("react") || snippet.includes("frontend") || snippet.includes("front end")) frontendScore += 1;
  if (snippet.includes("full stack") || snippet.includes("fullstack") || snippet.includes("backend")) fullstackScore += 1;

  if (angularScore > frontendScore && angularScore > fullstackScore) {
    return { type: "angular", label: "Angular Developer CV" };
  }
  if (fullstackScore > frontendScore && fullstackScore > angularScore) {
    return { type: "fullstack", label: "Full Stack Developer CV" };
  }

  return { type: "frontend", label: "Frontend Developer CV" };
}

/**
 * Generate a pre-filled cold outreach email draft from template, lead metadata, and smart CV routing
 * @param {Object} lead - Lead object
 * @param {Object} settings - Extension settings containing emailTemplate, userProfile, and cvLinks
 * @returns {Object} { to, subject, body, cvType, cvLabel, cvLink }
 */
export function generateEmailDraft(lead, settings = {}) {
  const profile = settings.userProfile || {
    name: "Supto Khan",
    email: "suptokhan24@gmail.com",
    phone: "+8801620531802"
  };

  const cvRouting = classifyLeadCvType(lead);
  const cvLinks = settings.cvLinks || {};
  const cvLink = cvLinks[cvRouting.type] || cvLinks.frontend || cvLinks.angular || cvLinks.fullstack || "https://drive.google.com";

  const template = settings.emailTemplate || {
    subject: "Application for {role} Position - {user_name}",
    body: `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
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
      .replace(/\{cv_type\}/gi, cvRouting.label)
      .replace(/\{cv_link\}/gi, cvLink)
      .replace(/\{user_name\}/gi, profile.name || "Supto Khan")
      .replace(/\{user_email\}/gi, profile.email || "suptokhan24@gmail.com")
      .replace(/\{user_phone\}/gi, profile.phone || "+8801620531802");
  };

  let rawBody = template.body || `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`;

  // Handle legacy template phrasing or missing {cv_link} placeholder
  if (!rawBody.includes("{cv_link}")) {
    if (/Please find my CV attached( as stated in the job description)?\.?/i.test(rawBody)) {
      rawBody = rawBody.replace(
        /Please find my CV attached( as stated in the job description)?\.?/i,
        "Please find my {cv_type} via Google Drive here:\n{cv_link}"
      );
    } else {
      rawBody = rawBody.trim() + "\n\nPlease find my {cv_type} via Google Drive here:\n{cv_link}";
    }
  }

  let finalBody = replaceVars(rawBody);
  if (cvLink && !finalBody.includes(cvLink)) {
    finalBody += `\n\nGoogle Drive CV (${cvRouting.label}):\n${cvLink}`;
  }

  return {
    to,
    subject: replaceVars(template.subject),
    body: finalBody,
    cvType: cvRouting.type,
    cvLabel: cvRouting.label,
    cvLink
  };
}

/**
 * Generate standard web Gmail Compose URL
 * Compatible with MailSuite / Mailtrack Chrome extension for open tracking
 */
export function getGmailComposeUrl(to, subject, body, options = {}) {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: to || "",
    su: subject || "",
    body: body || ""
  });
  if (options.replyTo) {
    params.set("replyto", options.replyTo);
  }
  return `https://mail.google.com/mail/?${params.toString()}`;
}


