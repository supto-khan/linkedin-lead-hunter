/**
 * scoring.js
 * Deterministic rule-based scoring engine for LinkedIn posts.
 * Computes hiring intent score, role matches, tech matches, negative penalties, and exclusions.
 */

import { DEFAULT_SIGNALS } from "../config/signals.js";
import { extractEmails, extractApplicationUrls, extractDmInstruction } from "./extractor.js";

/**
 * Normalizes detected role/title.
 * If a position/role is identified as Reactjs, React, Next, Nextjs, Next.js, or matches React/Next patterns,
 * returns "Front End Developer".
 *
 * @param {string} role - The detected role or raw title
 * @param {Array<string>} [techMatches=[]] - Matched technologies
 * @returns {string} Normalized role title
 */
export function normalizeRole(role, techMatches = []) {
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
    return `${topTech} Opportunity`;
  }

  return "Job Opportunity";
}

/**
 * Score a single LinkedIn post
 * @param {string} text - Raw post body text
 * @param {Object} customConfig - Optional custom signal/settings configuration
 * @returns {Object} Evaluation details { score, label, detectedRole, matchedSignals, techMatches, emails, applicationUrls, requiresDm }
 */
export function scorePost(text, customConfig = {}) {
  if (!text || typeof text !== "string") {
    return {
      score: 0,
      label: "ignore",
      detectedRole: null,
      matchedSignals: ["Empty text"],
      techMatches: [],
      emails: [],
      applicationUrls: [],
      requiresDm: false
    };
  }

  const config = { ...DEFAULT_SIGNALS, ...customConfig };
  const lower = text.toLowerCase();
  let score = 0;
  const matchedSignals = [];
  const techMatches = [];
  let detectedRole = null;

  // 1. Check Hard Exclusions (Immediate 0 score)
  const hardExcludes = customConfig.exclusions || config.hardExcludes || [];
  for (const term of hardExcludes) {
    if (lower.includes(term.toLowerCase())) {
      return {
        score: 0,
        label: "excluded",
        detectedRole: null,
        matchedSignals: [`Hard Exclusion: "${term}"`],
        techMatches: [],
        emails: [],
        applicationUrls: [],
        requiresDm: false
      };
    }
  }

  // 2. Extract Key Contact Entities
  const emails = extractEmails(text);
  const applicationUrls = extractApplicationUrls(text);
  const requiresDm = extractDmInstruction(text);

  if (emails.length > 0) {
    score += 30;
    matchedSignals.push(`Direct Email Detected: ${emails[0]} (+30)`);
  }

  if (applicationUrls.length > 0) {
    score += 25;
    matchedSignals.push(`Application URL Detected (+25)`);
  }

  if (requiresDm && emails.length === 0) {
    score += 20;
    matchedSignals.push(`DM to Apply Detected (+20)`);
  }

  // 3. Positive Hiring Intent Phrases
  const hiringPhrases = config.hiringPhrases || [];
  let intentPhraseCount = 0;
  for (const { phrase, score: s } of hiringPhrases) {
    if (lower.includes(phrase.toLowerCase())) {
      score += s;
      matchedSignals.push(`Hiring phrase: "${phrase}" (+${s})`);
      intentPhraseCount++;
      if (intentPhraseCount >= 3) break; // Cap repetitive phrases
    }
  }

  // 4. Contact / Application Instruction Phrases
  const contactInstructions = config.contactInstructions || [];
  let contactPhraseCount = 0;
  for (const { phrase, score: s } of contactInstructions) {
    if (lower.includes(phrase.toLowerCase())) {
      score += s;
      matchedSignals.push(`Contact instruction: "${phrase}" (+${s})`);
      contactPhraseCount++;
      if (contactPhraseCount >= 2) break;
    }
  }

  // 5. Structural & Format Patterns
  const structuralPatterns = config.structuralPatterns || [];
  for (const item of structuralPatterns) {
    const regex = item.regex instanceof RegExp ? item.regex : new RegExp(item.regex, "i");
    if (regex.test(text)) {
      score += item.score;
      matchedSignals.push(`${item.label} (+${item.score})`);
    }
  }

  // 6. Emoji Signals
  const emojiSignals = config.emojiSignals || [];
  let emojiHitCount = 0;
  for (const { char, score: s } of emojiSignals) {
    if (text.includes(char)) {
      score += s;
      matchedSignals.push(`Emoji ${char} (+${s})`);
      emojiHitCount++;
      if (emojiHitCount >= 3) break;
    }
  }

  // 7. Role / Title Matching
  const targetRoles = customConfig.targetRoles || config.rolePatterns || [];
  for (const roleItem of targetRoles) {
    let pattern;
    let roleName;
    let roleScore = 20;

    if (typeof roleItem === "string") {
      roleName = roleItem;
      // Convert plain role string to flexible regex
      const escaped = roleItem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\ /g, "\\s+");
      pattern = new RegExp(escaped, "i");
    } else if (roleItem.regex) {
      pattern = roleItem.regex instanceof RegExp ? roleItem.regex : new RegExp(roleItem.regex, "i");
      roleName = roleItem.name || "Target Role";
      roleScore = roleItem.score || 20;
    } else if (roleItem.pattern) {
      pattern = new RegExp(roleItem.pattern, "i");
      roleName = roleItem.name || "Target Role";
      roleScore = roleItem.score || 20;
    }

    if (pattern && pattern.test(text)) {
      detectedRole = normalizeRole(roleName);
      score += roleScore;
      matchedSignals.push(`Target Role: "${detectedRole}" (+${roleScore})`);
      break; // Match most specific first role to prevent runaway double-scoring
    }
  }

  // 8. Technology Stack Matches
  const techKeywords = customConfig.techStack || config.techKeywords || [];
  for (const tech of techKeywords) {
    const techLower = tech.toLowerCase();
    // Word boundary check for short words like PHP, JS
    const wordBoundaryRegex = new RegExp(`\\b${techLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (wordBoundaryRegex.test(text) || lower.includes(techLower)) {
      if (!techMatches.includes(tech)) {
        techMatches.push(tech);
      }
    }
  }

  if (techMatches.length > 0) {
    // 8 points per matched technology, capped at 24 points max
    const techScore = Math.min(techMatches.length * 8, 24);
    score += techScore;
    matchedSignals.push(`Tech Stack (${techMatches.slice(0, 3).join(", ")}${techMatches.length > 3 ? "..." : ""}): (+${techScore})`);
  }

  // 9. Negative Signals (Penalties)
  const negativeSignals = config.negativeSignals || [];
  for (const { phrase, score: s } of negativeSignals) {
    if (lower.includes(phrase.toLowerCase())) {
      score += s; // Negative value
      matchedSignals.push(`Penalty: "${phrase}" (${s})`);
    }
  }

  // Clamp final score between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

    // Determine score band
  const bands = config.scoreBands || DEFAULT_SIGNALS.scoreBands;
  let band = bands.find(b => score >= b.min && score <= b.max);
  if (!band) {
    band = { label: score >= 80 ? "hot" : score >= 60 ? "relevant" : score >= 30 ? "maybe" : "ignore" };
  }

  // 10. Strict Role & Tech Gating Filter
  // If strictRoleMatch is enabled (default), reject posts with 0 role matches and 0 tech keywords
  const strictRoleMatch = customConfig.strictRoleMatch !== false;
  if (strictRoleMatch && !detectedRole && techMatches.length === 0) {
    return {
      score: 0,
      label: "ignore",
      detectedRole: null,
      matchedSignals: [...matchedSignals, "Filtered: No Target Role or Tech Match (Strict Role Match active)"],
      techMatches: [],
      emails,
      applicationUrls,
      requiresDm
    };
  }

  return {
    score,
    label: band.label,
    detectedRole: normalizeRole(detectedRole, techMatches),
    matchedSignals,
    techMatches,
    emails,
    applicationUrls,
    requiresDm
  };
}
