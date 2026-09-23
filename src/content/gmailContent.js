/**
 * gmailContent.js
 * Injected into Gmail (https://mail.google.com/*) to automatically convert LeadHunter CV Drive links
 * from plain text into active, clickable rich hyperlinks attached directly to the CV text.
 */

(function () {
  if (window.__LEADHUNTER_GMAIL_LOADED__) return;
  window.__LEADHUNTER_GMAIL_LOADED__ = true;

  console.log("%c🎯 LeadHunter Gmail Link Enhancer Active", "background: #00A878; color: #FFFFFF; font-weight: bold; padding: 3px 6px; border-radius: 3px;");

  const PROCESSED_ATTR = "data-lh-link-enhanced";

  function findComposeBoxes() {
    return Array.from(document.querySelectorAll(
      'div[role="textbox"][contenteditable="true"], div[aria-label*="Message Body" i], div.Am.Al.editable'
    ));
  }

  function enhanceComposeBox(box, pendingDraft) {
    if (!box || box.getAttribute(PROCESSED_ATTR) === "true") return false;

    const html = box.innerHTML || "";
    const text = box.innerText || "";

    // Check if box has contents from LeadHunter
    const hasDriveLink = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s<]+/i.test(text);
    const hasCvMention = /\b(?:Angular|Frontend|Front End|Full Stack|Fullstack)?\s*Developer CV\b/i.test(text) || /\bin my CV\b/i.test(text) || /\bGoogle Drive CV\b/i.test(text);
    const isLeadHunterDraft = pendingDraft || (hasDriveLink && hasCvMention);

    if (!isLeadHunterDraft) return false;

    // Determine CV link and CV label
    let cvLink = pendingDraft ? pendingDraft.cvLink : null;
    let cvLabel = pendingDraft ? pendingDraft.cvLabel : "Google Drive CV";

    if (!cvLink) {
      const match = text.match(/https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s<"']+/i);
      if (match) cvLink = match[0];
    }

    if (!cvLink) return false;

    // Check if already hyperlinked
    if (html.includes(`href="${cvLink}"`)) {
      box.setAttribute(PROCESSED_ATTR, "true");
      return true;
    }

    // Convert raw text into rich HTML with link attached to CV
    let newHtml = html;

    // 1. Replace raw drive url with styled anchor
    const escapedLinkRegex = new RegExp(cvLink.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    newHtml = newHtml.replace(escapedLinkRegex, `<a href="${cvLink}" target="_blank" style="color: #0a66c2; text-decoration: underline; font-weight: 600;">${cvLabel} (Google Drive)</a>`);

    // 2. Attach link to "in my CV" -> "in my <a href="...">CV</a>"
    newHtml = newHtml.replace(/\bin my CV\b/gi, `in my <a href="${cvLink}" target="_blank" style="color: #0a66c2; text-decoration: underline; font-weight: 600;">CV</a>`);

    // 3. Attach link to CV Label if mentioned in text and not already linked
    if (cvLabel && newHtml.includes(cvLabel) && !newHtml.includes(`>${cvLabel}</a>`)) {
      newHtml = newHtml.replace(new RegExp(`\\b${cvLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), `<a href="${cvLink}" target="_blank" style="color: #0a66c2; text-decoration: underline; font-weight: 600;">${cvLabel}</a>`);
    }

    // 4. Attach link to "Please find my CV"
    newHtml = newHtml.replace(/\bPlease find my CV\b/i, `Please find my <a href="${cvLink}" target="_blank" style="color: #0a66c2; text-decoration: underline; font-weight: 600;">CV</a>`);

    // Apply to box
    box.innerHTML = newHtml;
    box.setAttribute(PROCESSED_ATTR, "true");

    // Trigger Gmail input events to persist draft
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.dispatchEvent(new Event("change", { bubbles: true }));

    console.log("✅ LeadHunter: Attached CV Drive link as clickable link in Gmail compose box!");
    return true;
  }

  function checkAndEnhance() {
    if (typeof chrome === "undefined" || !chrome.storage || !chrome.storage.local) {
      findComposeBoxes().forEach(box => enhanceComposeBox(box, null));
      return;
    }

    chrome.storage.local.get(["leadhunterPendingGmailDraft"], (res) => {
      const draft = res.leadhunterPendingGmailDraft;
      const isFresh = draft && (Date.now() - draft.timestamp < 180000); // within 3 minutes
      const pendingDraft = isFresh ? draft : null;

      const boxes = findComposeBoxes();
      let enhanced = false;
      boxes.forEach(box => {
        if (enhanceComposeBox(box, pendingDraft)) {
          enhanced = true;
        }
      });

      if (enhanced && isFresh) {
        chrome.storage.local.remove(["leadhunterPendingGmailDraft"]);
      }
    });
  }

  // Poll for compose box up to 15 seconds after page load
  let attempts = 0;
  const pollInterval = setInterval(() => {
    attempts++;
    checkAndEnhance();
    if (attempts > 30) {
      clearInterval(pollInterval);
    }
  }, 400);

  // Also observe DOM for dynamically opened compose windows
  const observer = new MutationObserver(() => {
    checkAndEnhance();
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true
  });
})();
