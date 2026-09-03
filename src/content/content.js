/**
 * content.js
 * Injected into LinkedIn feed pages to passively detect new posts as the user scrolls.
 * Non-intrusive, zero automation/bot clicks, 100% deterministic local evaluation.
 */

(function () {
  // Guard against multiple script injections
  if (window.__LEADHUNTER_LOADED__) return;
  window.__LEADHUNTER_LOADED__ = true;

  console.log("%c🎯 LeadHunter Radar Active", "background: #00A878; color: #FFFFFF; font-weight: bold; padding: 4px 8px; border-radius: 4px;");

  const processedUrns = new Set();
  let currentSettings = {
    minScoreThreshold: 60,
    hotLeadThreshold: 80,
    autoSaveLeads: true,
    showInFeedBadge: true,
    highlightHotPosts: true
  };
  let isRadarActive = true;

  // Sync settings and state from storage
  function loadSettings() {
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["settings", "radarActive"], (res) => {
        if (res.settings) currentSettings = { ...currentSettings, ...res.settings };
        if (res.radarActive !== undefined) isRadarActive = res.radarActive;
      });
    }
  }
  loadSettings();

  // Listen for settings or state changes from popup/dashboard
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        if (changes.settings) currentSettings = { ...currentSettings, ...changes.settings.newValue };
        if (changes.radarActive) isRadarActive = changes.radarActive.newValue;
      }
    });
  }

  // ── UNIVERSAL POST & SDUI SEARCH RESULT SELECTORS ────────────────

  const POST_CONTAINER_SELECTORS = [
    // SDUI Search Results (Modern LinkedIn Search DOM)
    "div[role='listitem']",
    "div[id^='expanded']",
    "div[componentkey*='FeedType']",
    "div[data-testid='lazy-column'] > div > div",
    // Standard LinkedIn Feed
    "div[data-urn*='activity']",
    "div[data-urn*='ugcPost']",
    "div[data-id*='activity']",
    ".feed-shared-update-v2",
    ".occludable-update",
    "li.reusable-search__result-container",
    "div.search-results-container .feed-shared-update-v2"
  ];

  const UNPROCESSED_TEXT_BOX_SELECTOR = [
    "[data-testid='expandable-text-box']:not([data-lh-done])",
    ".update-components-text:not([data-lh-done])",
    ".feed-shared-update-v2__description:not([data-lh-done])",
    ".feed-shared-text:not([data-lh-done])",
    "[data-ad-preview='message']:not([data-lh-done])"
  ].join(", ");

  const CARD_CONTAINER_SELECTOR = [
    "div[role='listitem']",
    "div[id^='expanded']",
    "div[componentkey*='FeedType']",
    ".feed-shared-update-v2",
    "li.reusable-search__result-container",
    "div[data-urn]",
    "div.artdeco-card"
  ].join(", ");

  function detectAndProcessPosts() {
    if (!isRadarActive) return;

    // Fast query: target only new, unvisited text containers
    const textBoxes = document.querySelectorAll(UNPROCESSED_TEXT_BOX_SELECTOR);
    
    for (let i = 0; i < textBoxes.length; i++) {
      const textBox = textBoxes[i];
      textBox.dataset.lhDone = "true";

      // Find closest card container
      const card = textBox.closest(CARD_CONTAINER_SELECTOR) || textBox.parentElement?.parentElement;
      if (card && card.dataset.leadhunterProcessed !== "true") {
        processPostCard(card, textBox);
      }
    }
  }
  window.detectAndProcessPosts = detectAndProcessPosts;

  function processPostCard(cardEl, textBoxEl = null) {
    if (!cardEl || cardEl.dataset.leadhunterProcessed === "true") return;
    cardEl.dataset.leadhunterProcessed = "true";

    // Extract text from text box or card
    const postText = (textBoxEl ? textBoxEl.innerText : extractText(cardEl)).trim();
    if (!postText || postText.length < 25) return;

    // Resolve post unique key/URN
    const postKey = resolvePostKey(cardEl, postText);
    if (postKey && processedUrns.has(postKey)) {
      return;
    }

    // Add to bounded set (prevent memory leaks)
    if (postKey) {
      processedUrns.add(postKey);
      if (processedUrns.size > 500) {
        const oldest = processedUrns.values().next().value;
        processedUrns.delete(oldest);
      }
    }

    // Notify background stats (lightweight message)
    notifyBackground({ type: "POST_SCANNED" });

    // Deterministic Evaluation
    const result = evaluatePostText(postText, currentSettings);

    if (result.score >= currentSettings.minScoreThreshold) {
      const metadata = extractMetadata(cardEl, postKey, postText);
      const lead = {
        id: metadata.urn,
        urn: metadata.urn,
        detectedRole: result.detectedRole,
        company: metadata.company || metadata.authorHeadline || "LinkedIn Opportunity",
        authorName: metadata.authorName,
        authorHeadline: metadata.authorHeadline,
        authorProfile: metadata.authorProfile,
        postUrl: metadata.postUrl,
        score: result.score,
        label: result.label,
        matchedSignals: result.matchedSignals,
        techMatches: result.techMatches,
        emails: result.emails,
        applicationUrls: result.applicationUrls,
        requiresDm: result.requiresDm,
        textSnippet: postText.slice(0, 400),
        status: "new",
        detectedAt: Date.now()
      };

      console.log(`%c🔥 LeadHunter Captured Lead! (${lead.score}%) -> ${lead.detectedRole}`, "background: #00C896; color: #FFFFFF; font-weight: bold; padding: 4px 8px; border-radius: 4px;", lead.company);

      // Inject visual in-feed badge
      if (currentSettings.showInFeedBadge) {
        injectInFeedBadge(cardEl, lead);
      }

      // Highlight post card if hot lead
      if (lead.score >= currentSettings.hotLeadThreshold && currentSettings.highlightHotPosts) {
        cardEl.classList.add("leadhunter-post-highlight");
      }

      // Auto-save to CRM
      if (currentSettings.autoSaveLeads) {
        notifyBackground({ type: "SAVE_LEAD", lead });
      }
    }
  }

  // ── KEY & METADATA RESOLVERS ──────────────────────────────────────

  function normalizeTextFingerprint(text) {
    if (!text || typeof text !== "string") return "";
    return text
      .toLowerCase()
      .replace(/https?:\/\/[^\s]+/g, "")
      .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g, "")
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 200);
  }

  function resolvePostKey(cardEl, text) {
    // 1. Direct attribute check (filter out transient Ember / expanded IDs)
    let key = cardEl.getAttribute("data-urn") ||
              cardEl.getAttribute("data-activity-id") ||
              cardEl.getAttribute("data-id") ||
              cardEl.getAttribute("componentkey");

    if (key && (key.startsWith("ember") || key.startsWith("expanded") || key.includes("FeedType_FLAGSHIP_SEARCH"))) {
      key = null;
    }

    // 2. Search child elements for true LinkedIn URNs
    if (!key) {
      const childWithUrn = cardEl.querySelector("[data-urn*='activity'], [data-urn*='ugcPost'], [data-urn*='share'], [data-id*='activity']");
      if (childWithUrn) {
        key = childWithUrn.getAttribute("data-urn") || childWithUrn.getAttribute("data-id");
      }
    }

    // 3. Search child links for activity ID in href
    if (!key) {
      const postLink = cardEl.querySelector("a[href*='activity:'], a[href*='/feed/update/urn:li:activity:'], a[href*='urn:li:ugcPost:'], a[href*='urn:li:share:']");
      if (postLink) {
        const href = postLink.getAttribute("href") || "";
        const match = href.match(/urn:li:(activity|ugcPost|share):(\d+)/i) || href.match(/activity:(\d+)/i);
        if (match) {
          key = `urn:li:activity:${match[2] || match[1]}`;
        }
      }
    }

    // 4. Stable deterministic fingerprint based on author + text content (Never random Date.now())
    if (!key) {
      const profileLink = cardEl.querySelector("a[href*='/in/'], a[href*='/company/']");
      const authorProfile = profileLink ? profileLink.getAttribute("href") || "" : "";
      const fingerprint = normalizeTextFingerprint(text);
      key = `lead-fp-${Math.abs(hashString(authorProfile + ":" + fingerprint))}`;
    }

    return key;
  }

  function extractText(cardEl) {
    const descEl = cardEl.querySelector(
      "[data-testid='expandable-text-box'], " +
      ".update-components-text, " +
      ".feed-shared-update-v2__description, " +
      ".feed-shared-inline-show-more-text, " +
      ".feed-shared-text, " +
      "span.break-words"
    );

    if (descEl) return descEl.innerText.trim();
    return (cardEl.innerText || "").trim();
  }

  function extractMetadata(cardEl, postKey, postText = "") {
    let activityUrn = postKey;
    if (activityUrn && (activityUrn.startsWith("expanded") || activityUrn.startsWith("ember"))) {
      activityUrn = resolvePostKey(cardEl, postText);
    }

    // Author link & name (handles both users and company pages)
    const profileLink = cardEl.querySelector(
      "a[href*='/in/'], a[href*='/company/']"
    );
    let authorProfile = profileLink ? profileLink.getAttribute("href") : "";
    if (authorProfile && authorProfile.startsWith("/")) {
      authorProfile = `https://www.linkedin.com${authorProfile.split("?")[0]}`;
    }

    let authorName = "LinkedIn Poster";
    const nameEl = cardEl.querySelector(
      "a[href*='/in/'] span, a[href*='/company/'] span, " +
      ".update-components-actor__name span, " +
      ".entity-result__title-text, " +
      "h2 span"
    );
    if (nameEl && nameEl.innerText && !nameEl.innerText.includes("Feed post")) {
      authorName = nameEl.innerText.trim();
    } else if (profileLink) {
      const aria = profileLink.getAttribute("aria-label");
      if (aria) authorName = aria.replace("View ", "").replace("’s profile", "").trim();
    }

    // Headline / Company
    let authorHeadline = "";
    const headlineEl = cardEl.querySelector(
      ".update-components-actor__description, " +
      ".update-components-actor__sub-description, " +
      ".entity-result__primary-subtitle, " +
      "p span[class*='401ea029']"
    );
    if (headlineEl) {
      authorHeadline = headlineEl.innerText.trim();
    }

    // Post Exact Permalink
    let postUrl = "";
    if (activityUrn && activityUrn.includes("activity:")) {
      const id = activityUrn.split("activity:")[1].replace(/[^0-9]/g, "");
      postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${id}`;
    } else {
      const linkEl = cardEl.querySelector("a[href*='/feed/update/urn:li:activity:'], a[href*='urn:li:activity:'], a[href*='/posts/'], a[href*='/jobs/view/'], a[href*='/feed/update/']");
      if (linkEl) {
        const href = linkEl.getAttribute("href") || "";
        const actMatch = href.match(/urn:li:(activity|ugcPost|share):(\d+)/i) || href.match(/activity:(\d+)/i) || href.match(/activity\/(\d+)/i);
        if (actMatch) {
          postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${actMatch[2] || actMatch[1]}`;
        } else if (href.startsWith("/")) {
          postUrl = `https://www.linkedin.com${href.split("?")[0]}`;
        } else {
          postUrl = href.split("?")[0];
        }
      }
    }

    return {
      urn: activityUrn,
      authorName,
      authorHeadline,
      authorProfile,
      postUrl,
      company: authorHeadline ? authorHeadline.split(" at ")[1] || authorHeadline.split("@")[1] || "" : ""
    };
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // ── INLINE DETERMINISTIC SCORING ───────────────────────────────────

  const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/gi;
  const URL_REGEX = /\bhttps?:\/\/[^\s<>"{}|\^~\[\]`]+[^\s<>"{}|\^~\[\]`.,:;!]/gi;

  function normalizeRole(role, techMatches = []) {
    if (role) {
      const trimmed = role.trim();
      if (/\b(react(\.?js)?|next(\.?js)?)\b/i.test(trimmed)) {
        return "Front End Developer";
      }
      return trimmed;
    }
    if (techMatches && techMatches.length > 0) {
      const topTech = techMatches[0];
      if (/\b(react(\.?js)?|next(\.?js)?)\b/i.test(topTech)) {
        return "Front End Developer";
      }
      return `${topTech} Developer`;
    }
    return "Opportunity";
  }

  function evaluatePostText(text, settings) {
    const lower = text.toLowerCase();
    let score = 0;
    const matchedSignals = [];
    const techMatches = [];
    let detectedRole = null;

    // Hard exclusions
    const exclusions = settings.exclusions || ["unpaid", "volunteer", "mlm", "no experience required"];
    for (const ex of exclusions) {
      if (lower.includes(ex.toLowerCase())) {
        return { score: 0, label: "excluded", detectedRole: null, matchedSignals: [`Exclude: ${ex}`], techMatches: [], emails: [], applicationUrls: [], requiresDm: false };
      }
    }

    // Emails
    const rawEmails = text.match(EMAIL_REGEX) || [];
    const emails = [...new Set(rawEmails.map(e => e.toLowerCase()).filter(e => !e.endsWith(".png") && !e.includes("example.com") && !e.includes("linkedin.com")))];
    if (emails.length > 0) {
      score += 30;
      matchedSignals.push(`Direct Email: ${emails[0]} (+30)`);
    }

    // URLs
    const rawUrls = text.match(URL_REGEX) || [];
    const applicationUrls = [...new Set(rawUrls.filter(u => {
      const l = u.toLowerCase();
      return !l.includes("linkedin.com/feed") && !l.includes("linkedin.com/in/") && (l.includes("apply") || l.includes("job") || l.includes("career") || l.includes("forms.gle") || l.includes("greenhouse") || l.includes("lever"));
    }))];
    if (applicationUrls.length > 0) {
      score += 25;
      matchedSignals.push("Apply URL detected (+25)");
    }

    // DM instruction
    const requiresDm = /\bdm\s+(me|your\s+cv|your\s+resume|for\s+details)\b/i.test(text) || /\bdrop\s+a\s+dm\b/i.test(text);
    if (requiresDm && emails.length === 0) {
      score += 20;
      matchedSignals.push("DM to Apply detected (+20)");
    }

    // Hiring Intent
    const intentPhrases = [
      { phrase: "we're hiring", score: 30 },
      { phrase: "we are hiring", score: 30 },
      { phrase: "i'm hiring", score: 30 },
      { phrase: "i am hiring", score: 30 },
      { phrase: "our team is hiring", score: 30 },
      { phrase: "now hiring", score: 30 },
      { phrase: "actively hiring", score: 30 },
      { phrase: "we are looking for", score: 25 },
      { phrase: "we're looking for", score: 25 },
      { phrase: "looking to hire", score: 30 },
      { phrase: "job opening", score: 25 },
      { phrase: "job opportunity", score: 20 },
      { phrase: "vacancy", score: 25 },
      { phrase: "vacancies", score: 25 },
      { phrase: "join our team", score: 20 },
      { phrase: "send your cv", score: 30 },
      { phrase: "send your resume", score: 30 },
      { phrase: "apply now", score: 25 },
      { phrase: "apply here", score: 25 }
    ];

    let intentHits = 0;
    for (const { phrase, score: s } of intentPhrases) {
      if (lower.includes(phrase)) {
        score += s;
        matchedSignals.push(`Phrase "${phrase}" (+${s})`);
        intentHits++;
        if (intentHits >= 3) break;
      }
    }

    // Target Roles
    const targetRoles = settings.targetRoles || [
      "Senior Angular Developer", "Angular Developer", "Senior Frontend Engineer", "Front End Developer",
      "Frontend Developer", "React Developer", "Next.js Developer", "Full Stack Developer", "Laravel Developer", "PHP Developer", "Node.js Developer"
    ];

    for (const role of targetRoles) {
      const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(text)) {
        detectedRole = normalizeRole(role);
        score += 25;
        matchedSignals.push(`Target Role: "${detectedRole}" (+25)`);
        break;
      }
    }

    if (!detectedRole && /\b(react(\.?js)?|next(\.?js)?)\s*(developer|engineer|dev|programmer|specialist)?\b/i.test(text)) {
      detectedRole = "Front End Developer";
      score += 20;
      matchedSignals.push(`Target Role: "Front End Developer" (+20)`);
    }

    // Tech Stack
    const techStack = settings.techStack || [
      "React", "Reactjs", "React.js", "Next", "Next.js", "Nextjs", "Angular", "TypeScript", "JavaScript", "RxJS", "NgRx", "Laravel", "PHP", "Node.js", "MySQL"
    ];
    for (const tech of techStack) {
      const reg = new RegExp(`\\b${tech.toLowerCase()}\\b`, "i");
      if (reg.test(lower)) {
        if (!techMatches.includes(tech)) techMatches.push(tech);
      }
    }
    if (techMatches.length > 0) {
      const techScore = Math.min(techMatches.length * 8, 24);
      score += techScore;
      matchedSignals.push(`Tech Stack (${techMatches.slice(0, 3).join(", ")}): (+${techScore})`);
    }

    // Negative Penalties
    const penalties = [
      { phrase: "i'm looking for a job", score: -40 },
      { phrase: "i am looking for a job", score: -40 },
      { phrase: "open to work", score: -35 },
      { phrase: "#opentowork", score: -35 },
      { phrase: "hire me", score: -35 },
      { phrase: "check out my portfolio", score: -25 },
      { phrase: "just published", score: -20 },
      { phrase: "new blog post", score: -25 },
      { phrase: "happy to share that i", score: -20 },
      { phrase: "tutorial", score: -15 }
    ];
    for (const { phrase, score: s } of penalties) {
      if (lower.includes(phrase)) {
        score += s;
        matchedSignals.push(`Penalty: "${phrase}" (${s})`);
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));
    const label = score >= 80 ? "hot" : score >= 60 ? "relevant" : score >= 30 ? "maybe" : "ignore";

    // Strict Role & Tech Filter: Reject non-tech/unrelated jobs even if hiring intent is high
    const strictRoleMatch = settings.strictRoleMatch !== false;
    if (strictRoleMatch && !detectedRole && techMatches.length === 0) {
      return {
        score: 0,
        label: "ignore",
        detectedRole: null,
        matchedSignals: ["Filtered: No Target Role or Tech Stack Match"],
        techMatches: [],
        emails,
        applicationUrls,
        requiresDm
      };
    }

    // Strict Actionable Contact Filter: Require at least one contact route (Email, Apply Link, or DM)
    const hasActionableContact = (emails && emails.length > 0) || (applicationUrls && applicationUrls.length > 0) || Boolean(requiresDm);
    if (!hasActionableContact) {
      return {
        score: 0,
        label: "ignore",
        detectedRole: null,
        matchedSignals: ["Filtered: No Actionable Contact (No direct email, apply link, or DM instruction found)"],
        techMatches: [],
        emails: [],
        applicationUrls: [],
        requiresDm: false
      };
    }

    return {
      score,
      label,
      detectedRole: normalizeRole(detectedRole, techMatches),
      matchedSignals,
      techMatches,
      emails,
      applicationUrls,
      requiresDm
    };
  }

  // ── IN-FEED BADGE INJECTION ────────────────────────────────────────

  // ── INLINE SVG ICONS ──────────────────────────────────────────────
  const SVG_ICONS = {
    flame: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"></path></svg>`,
    target: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>`,
    mail: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path></svg>`,
    send: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg>`,
    message: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"></path></svg>`,
    copy: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path></svg>`,
    zap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
    check: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="m9 12 2 2 4-4"></path></svg>`
  };

  function injectInFeedBadge(postEl, lead) {
    if (postEl.querySelector(".leadhunter-badge-container")) return;

    const badge = document.createElement("div");
    badge.className = "leadhunter-badge-container";

    const isHot = lead.score >= 80;
    const scoreClass = isHot ? "leadhunter-score-hot" : "leadhunter-score-relevant";
    const scoreIcon = isHot ? SVG_ICONS.flame : SVG_ICONS.target;
    const scoreLabel = isHot ? `${lead.score}% HOT LEAD` : `${lead.score}% MATCH`;

    let contactHtml = "";
    if (lead.emails && lead.emails.length > 0) {
      contactHtml = `<span class="leadhunter-email-chip">${SVG_ICONS.mail}<span>${lead.emails[0]}</span></span>`;
    } else if (lead.applicationUrls && lead.applicationUrls.length > 0) {
      contactHtml = `<a href="${lead.applicationUrls[0]}" target="_blank" rel="noopener noreferrer" class="leadhunter-email-chip">${SVG_ICONS.zap}<span>Apply Link</span></a>`;
    } else if (lead.requiresDm) {
      contactHtml = `<span class="leadhunter-email-chip">${SVG_ICONS.message}<span>DM Poster</span></span>`;
    }

    badge.innerHTML = `
      <div class="leadhunter-badge-left">
        <span class="leadhunter-score-pill ${scoreClass}">
          ${scoreIcon}
          <span>${scoreLabel}</span>
        </span>
        <span class="leadhunter-role-tag">${lead.detectedRole}</span>
        ${contactHtml}
      </div>
      <div class="leadhunter-badge-actions">
        ${lead.emails && lead.emails.length > 0 ? `<button class="leadhunter-btn leadhunter-btn-primary send-email-btn" title="Open in Gmail (Pre-filled)">${SVG_ICONS.send}<span>Send Email</span></button>` : ""}
        ${lead.applicationUrls && lead.applicationUrls.length > 0 && (!lead.emails || lead.emails.length === 0) ? `<a href="${lead.applicationUrls[0]}" target="_blank" rel="noopener noreferrer" class="leadhunter-btn leadhunter-btn-primary" style="text-decoration:none;">${SVG_ICONS.zap}<span>Open Link</span></a>` : ""}
        <button class="leadhunter-btn leadhunter-btn-secondary copy-lead-btn" title="Copy Lead Details">${SVG_ICONS.copy}<span>Copy</span></button>
      </div>
    `;

    // Event listeners
    const sendEmailBtn = badge.querySelector(".send-email-btn");
    if (sendEmailBtn && lead.emails && lead.emails.length > 0) {
      sendEmailBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        openPreFilledGmail(lead);
      });
    }

    const copyLeadBtn = badge.querySelector(".copy-lead-btn");
    if (copyLeadBtn) {
      copyLeadBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        const formatted = formatStructuredLead(lead);
        navigator.clipboard.writeText(formatted).then(() => {
          showToast(`Copied "${lead.detectedRole}" post link & lead to clipboard!`, SVG_ICONS.copy);
        });
      });
    }

    // Insert at top of post card
    postEl.insertBefore(badge, postEl.firstChild);
  }

  function openPreFilledGmail(lead) {
    const profile = currentSettings.userProfile || {
      name: "Supto",
      email: "suptokhan24@gmail.com",
      phone: "+8801620531802"
    };

    const cvLinks = currentSettings.cvLinks || {};
    const roleLower = (lead.detectedRole || "").trim().toLowerCase();
    const techLower = (lead.techMatches || []).map(t => String(t).toLowerCase());
    const snippet = (lead.textSnippet || "").toLowerCase();

    let cvType = "frontend";
    let cvLabel = "Frontend Developer CV";

    // Primary: Role title matching
    if (roleLower && !["job opportunity", "software engineer", "developer", "engineer"].includes(roleLower)) {
      if (roleLower.includes("angular")) {
        cvType = "angular";
        cvLabel = "Angular Developer CV";
      } else if (
        roleLower.includes("front end") ||
        roleLower.includes("frontend") ||
        roleLower.includes("react") ||
        roleLower.includes("next") ||
        roleLower.includes("vue") ||
        roleLower.includes("ui") ||
        roleLower.includes("web developer") ||
        roleLower.includes("javascript developer")
      ) {
        cvType = "frontend";
        cvLabel = "Frontend Developer CV";
      } else if (
        roleLower.includes("full stack") ||
        roleLower.includes("fullstack") ||
        roleLower.includes("backend") ||
        roleLower.includes("back end") ||
        roleLower.includes("node") ||
        roleLower.includes("laravel") ||
        roleLower.includes("php") ||
        roleLower.includes("python")
      ) {
        cvType = "fullstack";
        cvLabel = "Full Stack Developer CV";
      }
    } else {
      // Secondary: Tech scoring
      let angularScore = 0;
      let frontendScore = 0;
      let fullstackScore = 0;

      techLower.forEach(t => {
        if (t.includes("angular") || t.includes("rxjs") || t.includes("ngrx")) angularScore += 2;
        if (t.includes("react") || t.includes("next") || t.includes("vue") || t.includes("tailwind")) frontendScore += 2;
        if (t.includes("node") || t.includes("express") || t.includes("python") || t.includes("laravel") || t.includes("mysql") || t.includes("mongodb") || t.includes("fullstack") || t.includes("full stack")) fullstackScore += 2;
      });

      if (snippet.includes("angular")) angularScore += 1;
      if (snippet.includes("react") || snippet.includes("frontend") || snippet.includes("front end")) frontendScore += 1;
      if (snippet.includes("full stack") || snippet.includes("fullstack") || snippet.includes("backend")) fullstackScore += 1;

      if (angularScore > frontendScore && angularScore > fullstackScore) {
        cvType = "angular";
        cvLabel = "Angular Developer CV";
      } else if (fullstackScore > frontendScore && fullstackScore > angularScore) {
        cvType = "fullstack";
        cvLabel = "Full Stack Developer CV";
      }
    }
    const cvLink = cvLinks[cvType] || cvLinks.frontend || cvLinks.angular || cvLinks.fullstack || "https://drive.google.com";

    const template = currentSettings.emailTemplate || {
      subject: "Application for {role} - {user_name}",
      body: `Hi,\n\nI'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:\n{cv_link}\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
    };

    const to = lead.emails && lead.emails.length > 0 ? lead.emails[0] : "";
    const role = lead.detectedRole || "Developer";
    const company = lead.company || "Your Company";
    const recruiter = lead.authorName && !lead.authorName.includes("User") ? lead.authorName : "Hiring Team";
    const tech = (lead.techMatches || []).slice(0, 3).join(", ") || "software development";

    let rawBody = template.body || "";
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

    const replaceVars = (str) => {
      if (!str) return "";
      return str
        .replace(/\{role\}/gi, role)
        .replace(/\{company\}/gi, company)
        .replace(/\{recruiter\}/gi, recruiter)
        .replace(/\{tech\}/gi, tech)
        .replace(/\{cv_type\}/gi, cvLabel)
        .replace(/\{cv_link\}/gi, cvLink)
        .replace(/\{user_name\}/gi, profile.name || "Supto")
        .replace(/\{user_email\}/gi, profile.email || "suptokhan24@gmail.com")
        .replace(/\{user_phone\}/gi, profile.phone || "+8801620531802");
    };

    const subject = replaceVars(template.subject);
    let body = replaceVars(rawBody);
    if (cvLink && !body.includes(cvLink)) {
      body += `\n\nGoogle Drive CV (${cvLabel}):\n${cvLink}`;
    }

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, "_blank");

    // Update lead status to Contacted in storage
    notifyBackground({ type: "UPDATE_STATUS", id: lead.id, status: "contacted" });

    showToast(`Gmail opened with pre-filled pitch! (Attach CV & MailSuite active)`, SVG_ICONS.send);
  }

  function formatStructuredLead(lead) {
    const postUrl = lead.postUrl || (lead.urn && lead.urn.includes("activity:") ? `https://www.linkedin.com/feed/update/urn:li:activity:${lead.urn.split("activity:")[1].replace(/[^0-9]/g, "")}` : null);
    return [
      `Role: ${lead.detectedRole || "Developer"}`,
      `Company: ${lead.company || lead.authorHeadline || "LinkedIn Posting"}`,
      `Score: ${lead.score}% (${lead.label.toUpperCase()})`,
      lead.emails && lead.emails.length > 0 ? `Email: ${lead.emails.join(", ")}` : null,
      lead.applicationUrls && lead.applicationUrls.length > 0 ? `Apply URL: ${lead.applicationUrls[0]}` : null,
      lead.requiresDm ? `Contact: DM on LinkedIn` : null,
      postUrl ? `Post URL: ${postUrl}` : null,
      `Recruiter: ${lead.authorName} (${lead.authorHeadline || ""})`,
      lead.authorProfile ? `Profile: ${lead.authorProfile}` : null,
      `Source: LinkedIn Radar`,
      `Date: ${new Date().toLocaleDateString()}`
    ].filter(Boolean).join("\n");
  }

  function showToast(message, iconSvg = SVG_ICONS.check) {
    const existing = document.querySelector(".leadhunter-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.className = "leadhunter-toast";
    toast.innerHTML = `<span class="toast-icon">${iconSvg}</span><span>${message}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast && toast.parentNode) toast.remove();
    }, 3000);
  }

  function notifyBackground(msg) {
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage(msg);
      } catch (err) {
        // Extension context might be reloaded
      }
    }
  }

  // ── OBSERVERS & EVENT LISTENERS ──────────────────────────────────

  let isScanning = false;
  let scanScheduled = false;

  function triggerOptimizedScan() {
    if (scanScheduled || !isRadarActive) return;
    scanScheduled = true;

    const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 120));
    schedule(() => {
      scanScheduled = false;
      if (!isScanning) {
        isScanning = true;
        try {
          detectAndProcessPosts();
        } finally {
          isScanning = false;
        }
      }
    }, { timeout: 350 });
  }

  // 1. MutationObserver: filters genuine element node additions (ignores text/comment mutations)
  const observer = new MutationObserver((mutations) => {
    for (let i = 0; i < mutations.length; i++) {
      const mut = mutations[i];
      if (mut.addedNodes && mut.addedNodes.length > 0) {
        for (let j = 0; j < mut.addedNodes.length; j++) {
          if (mut.addedNodes[j].nodeType === 1) { // ELEMENT_NODE
            triggerOptimizedScan();
            return;
          }
        }
      }
    }
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // 2. Throttled scroll listener (fires at most once per 250ms during smooth scroll)
  let lastScrollTime = 0;
  window.addEventListener("scroll", () => {
    const now = Date.now();
    if (now - lastScrollTime > 250) {
      lastScrollTime = now;
      triggerOptimizedScan();
    }
  }, { passive: true });

  // 3. SPA Navigation listener (URL changes)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      detectAndProcessPosts();
    }
  }, 1200);

  // Initial scanning passes
  setTimeout(triggerOptimizedScan, 400);
  setTimeout(triggerOptimizedScan, 1200);

  // ── AUTOMATED KEYWORD QUEUE RUNNER ────────────────────────────
  let queueSearchStarted = false;

  async function checkAndRunQueueSearch() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(["leadHunterQueueState"], async (res) => {
      const qState = res.leadHunterQueueState;
      if (!qState || !qState.isRunning || qState.isPaused || qState.isCoolingDown) return;

      // Ensure HUD is initialized and visible
      if (window.leadHunterQueueHUD) {
        window.leadHunterQueueHUD.init();
        window.leadHunterQueueHUD.update(qState);
      }

      // Check if we are on a search result page
      if (window.location.pathname.includes("/search/results/content") || window.location.search.includes("keywords=")) {
        if (queueSearchStarted) return;
        queueSearchStarted = true;

        console.log(`🎯 Auto-Queue: Preparing Smart Scroll for "${qState.currentKeyword}"...`);

        // Wait 2.5 seconds for LinkedIn search DOM to settle
        await new Promise(r => setTimeout(r, 2500));

        // Re-check state in case user paused/stopped during initial delay
        const freshCheck = await new Promise(resolve => {
          chrome.storage.local.get(["leadHunterQueueState"], r => resolve(r.leadHunterQueueState));
        });
        if (!freshCheck || !freshCheck.isRunning || freshCheck.isPaused || freshCheck.isCoolingDown) {
          queueSearchStarted = false;
          return;
        }

        const engine = window.smartScrollEngine;
        if (engine) {
          const maxScrolls = Number(freshCheck.config?.maxScrollsPerKeyword) || 0;
          const config = {
            stepPx: 600,
            delayMs: Math.round((freshCheck.config?.scrollDelaySec || 2.0) * 1000),
            mode: "infinite",
            stopConditions: {
              maxScrolls: maxScrolls, // 0 = unlimited, scrolls until end of results
              stopOnBottom: true,
              noActivityTimeoutSec: 15
            }
          };

          console.log(`🎯 Auto-Queue: Starting scroll engine (maxScrolls: ${maxScrolls === 0 ? "Unlimited" : maxScrolls})...`);
          await engine.start(config);
          
          // CRITICAL FIX: Await until engine genuinely finishes scrolling all results!
          await engine.waitForCompletion();

          console.log("🎯 Auto-Queue: Smart Scroll completed for current keyword.");

          // Check if queue is still running and unpaused before advancing
          const endState = await new Promise(resolve => {
            chrome.storage.local.get(["leadHunterQueueState"], r => resolve(r.leadHunterQueueState));
          });

          if (endState && endState.isRunning && !endState.isPaused && !endState.isCoolingDown) {
            console.log("🎯 Auto-Queue: Advancing to next keyword...");
            if (typeof chrome !== "undefined" && chrome.runtime) {
              chrome.runtime.sendMessage({ type: "QUEUE_KEYWORD_COMPLETED" });
            }
          }
        }
      }
    });
  }

  // Run queue check on load
  setTimeout(checkAndRunQueueSearch, 1000);

  // Also react to storage state changes (Pause / Resume / Stop)
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.leadHunterQueueState) {
        const newVal = changes.leadHunterQueueState.newValue;
        if (!newVal) return;

        if (window.leadHunterQueueHUD) {
          window.leadHunterQueueHUD.update(newVal);
        }

        const engine = window.smartScrollEngine;
        if (newVal.isRunning) {
          if (newVal.isPaused) {
            if (engine && engine.isRunning && !engine.isPaused) {
              console.log("🎯 Auto-Queue: Pausing scroll engine...");
              engine.pause();
            }
          } else if (!newVal.isCoolingDown) {
            if (engine && engine.isRunning && engine.isPaused) {
              console.log("🎯 Auto-Queue: Resuming scroll engine...");
              engine.resume();
            } else if (!queueSearchStarted) {
              checkAndRunQueueSearch();
            }
          }
        } else {
          // Stopped
          queueSearchStarted = false;
          if (engine && engine.isRunning) {
            console.log("🎯 Auto-Queue: Stopping scroll engine...");
            engine.stop("Queue stopped");
          }
        }
      }
    });
  }

})();


