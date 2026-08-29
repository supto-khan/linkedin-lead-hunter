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

  function detectAndProcessPosts() {
    if (!isRadarActive) return;

    // Method 1: Find text boxes directly (100% reliable across all LinkedIn layouts)
    const textBoxes = document.querySelectorAll("[data-testid='expandable-text-box'], .update-components-text, .feed-shared-update-v2__description, .feed-shared-text, [data-ad-preview='message']");
    
    textBoxes.forEach(textBox => {
      // Find closest card container
      const card = textBox.closest("div[role='listitem'], div[id^='expanded'], div[componentkey*='FeedType'], .feed-shared-update-v2, li.reusable-search__result-container, div[data-urn], div.artdeco-card") || textBox.parentElement?.parentElement;
      if (card) {
        processPostCard(card, textBox);
      }
    });

    // Method 2: Standard container query
    for (const selector of POST_CONTAINER_SELECTORS) {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(card => {
          const textBox = card.querySelector("[data-testid='expandable-text-box'], .update-components-text, .feed-shared-update-v2__description, .feed-shared-text");
          processPostCard(card, textBox);
        });
      } catch (e) {}
    }
  }

  function processPostCard(cardEl, textBoxEl = null) {
    if (!cardEl || cardEl.dataset.leadhunterProcessed === "true") return;

    // Extract text from text box or whole card
    const postText = (textBoxEl ? textBoxEl.innerText : extractText(cardEl)).trim();
    if (!postText || postText.length < 25) return;

    // Resolve post unique key/URN
    const postKey = resolvePostKey(cardEl, postText);
    if (postKey && processedUrns.has(postKey)) {
      cardEl.dataset.leadhunterProcessed = "true";
      return;
    }

    // Mark as processed
    cardEl.dataset.leadhunterProcessed = "true";
    if (postKey) processedUrns.add(postKey);

    // Notify background stats
    notifyBackground({ type: "POST_SCANNED" });

    // Deterministic Evaluation
    const result = evaluatePostText(postText, currentSettings);

    console.log(`%c🎯 LeadHunter Evaluated: [${result.score}% - ${result.label.toUpperCase()}]`, "color: #00A878; font-weight: bold;", {
      role: result.detectedRole,
      score: result.score,
      signals: result.matchedSignals,
      emails: result.emails,
      preview: postText.slice(0, 80)
    });

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

      console.log(`%c🔥 LeadHunter Captured Lead! (${lead.score}%) -> ${lead.detectedRole}`, "background: #00C896; color: #FFFFFF; font-weight: bold; padding: 4px 8px; border-radius: 4px;", lead);

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

  function resolvePostKey(cardEl, text) {
    let key = cardEl.getAttribute("componentkey") ||
              cardEl.getAttribute("data-urn") ||
              cardEl.getAttribute("data-id") ||
              cardEl.getAttribute("id");

    if (!key) {
      const childWithKey = cardEl.querySelector("[componentkey], [data-urn], [data-id]");
      if (childWithKey) {
        key = childWithKey.getAttribute("componentkey") || childWithKey.getAttribute("data-urn");
      }
    }

    if (!key) {
      const postLink = cardEl.querySelector("a[href*='urn:li:activity:'], a[href*='/feed/update/']");
      if (postLink) {
        const href = postLink.getAttribute("href");
        const match = href.match(/urn:li:activity:(\d+)/);
        if (match) key = `urn:li:activity:${match[1]}`;
      }
    }

    return key || `lead-hash-${Math.abs(hashString(text.slice(0, 100)))}`;
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
    if (activityUrn.startsWith("expanded")) {
      activityUrn = activityUrn.replace("expanded", "").replace("FeedType_FLAGSHIP_SEARCH", "");
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

    // Post URL
    let postUrl = "";
    if (activityUrn.includes("activity:")) {
      const id = activityUrn.split("activity:")[1];
      postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${id}`;
    } else {
      const linkEl = cardEl.querySelector("a[href*='/feed/update/'], a[href*='/jobs/view/'], a[href*='/posts/']");
      postUrl = linkEl ? linkEl.getAttribute("href") : window.location.href;
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
      "Senior Angular Developer", "Angular Developer", "Frontend Developer",
      "Full Stack Developer", "Laravel Developer", "PHP Developer", "Node.js Developer"
    ];

    for (const role of targetRoles) {
      const escaped = role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
      const regex = new RegExp(`\\b${escaped}\\b`, "i");
      if (regex.test(text)) {
        detectedRole = role;
        score += 25;
        matchedSignals.push(`Target Role: "${role}" (+25)`);
        break;
      }
    }

    // Tech Stack
    const techStack = settings.techStack || [
      "Angular", "TypeScript", "JavaScript", "RxJS", "NgRx", "Laravel", "PHP", "Node.js", "MySQL"
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

    return {
      score,
      label,
      detectedRole: detectedRole || (techMatches.length > 0 ? `${techMatches[0]} Developer` : "Opportunity"),
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
          showToast(`Copied "${lead.detectedRole}" lead to clipboard!`, SVG_ICONS.copy);
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

    const template = currentSettings.emailTemplate || {
      subject: "Application for {role} - {user_name}",
      body: `Hi,\n\nI'm making an application for the job of {role}. Please find my CV attached as stated in the job description.\n\nI describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.\n\nYou can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).\n\nRegards,\n{user_name}`
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

    const subject = replaceVars(template.subject);
    const body = replaceVars(template.body);

    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, "_blank");

    // Update lead status to Contacted in storage
    notifyBackground({ type: "UPDATE_STATUS", id: lead.id, status: "contacted" });

    showToast(`Gmail opened with pre-filled pitch! (Attach CV & MailSuite active)`, SVG_ICONS.send);
  }

  function formatStructuredLead(lead) {
    return [
      `Role: ${lead.detectedRole || "Developer"}`,
      `Company: ${lead.company || lead.authorHeadline || "LinkedIn Posting"}`,
      `Score: ${lead.score}% (${lead.label.toUpperCase()})`,
      lead.emails && lead.emails.length > 0 ? `Email: ${lead.emails.join(", ")}` : null,
      lead.applicationUrls && lead.applicationUrls.length > 0 ? `Apply URL: ${lead.applicationUrls[0]}` : null,
      lead.requiresDm ? `Contact: DM on LinkedIn` : null,
      `Recruiter: ${lead.authorName} (${lead.authorHeadline || ""})`,
      lead.authorProfile ? `Profile: ${lead.authorProfile}` : null,
      lead.postUrl ? `Post: ${lead.postUrl}` : null,
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

  let debounceTimer = null;
  function triggerDebouncedScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(detectAndProcessPosts, 200);
  }

  // 1. MutationObserver for dynamically added DOM nodes
  const observer = new MutationObserver(triggerDebouncedScan);
  observer.observe(document.body, { childList: true, subtree: true });

  // 2. Passive scroll listener
  window.addEventListener("scroll", triggerDebouncedScan, { passive: true });

  // 3. SPA Navigation listener (URL changes)
  let lastUrl = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      console.log("%c🎯 LeadHunter: Navigation Detected", "color: #00A878;", lastUrl);
      detectAndProcessPosts();
    }
  }, 1000);

  // Initial scanning passes
  setTimeout(detectAndProcessPosts, 500);
  setTimeout(detectAndProcessPosts, 1500);
  setTimeout(detectAndProcessPosts, 3000);

})();
