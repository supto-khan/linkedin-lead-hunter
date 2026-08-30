/**
 * signals.js
 * Central signal configuration for the LinkedIn hiring-post detector.
 * Supports configurable weights, positive intent phrases, structural markers,
 * tech keywords, negative penalties, and hard exclusions.
 */

export const DEFAULT_SIGNALS = {
  // ── 1. HIRING INTENT PHRASES (positive) ─────────────────────────
  hiringPhrases: [
    // Direct hiring statements
    { phrase: "we're hiring", score: 30 },
    { phrase: "we are hiring", score: 30 },
    { phrase: "i'm hiring", score: 30 },
    { phrase: "i am hiring", score: 30 },
    { phrase: "our team is hiring", score: 30 },
    { phrase: "now hiring", score: 30 },
    { phrase: "currently hiring", score: 30 },
    { phrase: "actively hiring", score: 30 },
    { phrase: "hiring alert", score: 25 },
    { phrase: "job alert", score: 25 },

    // Looking-for phrasing
    { phrase: "we are looking for", score: 25 },
    { phrase: "we're looking for", score: 25 },
    { phrase: "looking for a", score: 15 },
    { phrase: "looking to hire", score: 30 },
    { phrase: "in search of a", score: 15 },
    { phrase: "seeking a", score: 15 },
    { phrase: "we need a", score: 15 },
    { phrase: "we require a", score: 15 },

    // Team growth phrasing
    { phrase: "join our team", score: 20 },
    { phrase: "join our engineering team", score: 25 },
    { phrase: "growing our team", score: 15 },
    { phrase: "expanding our team", score: 15 },
    { phrase: "our team is growing", score: 15 },
    { phrase: "we're expanding", score: 12 },

    // Posting-type phrasing
    { phrase: "job opening", score: 25 },
    { phrase: "job opportunity", score: 20 },
    { phrase: "career opportunity", score: 20 },
    { phrase: "new opening", score: 20 },
    { phrase: "vacancy", score: 25 },
    { phrase: "vacancies", score: 25 },
    { phrase: "position available", score: 25 },
    { phrase: "role available", score: 20 },
    { phrase: "immediate opening", score: 25 },
    { phrase: "urgent hiring", score: 25 },
    { phrase: "urgently required", score: 25 },
    { phrase: "walk-in interview", score: 20 },

    // Recruiter-voice phrasing
    { phrase: "recruiting for", score: 20 },
    { phrase: "on behalf of my client", score: 20 },
    { phrase: "sourcing for", score: 15 },
    { phrase: "referrals welcome", score: 15 },
    { phrase: "tag someone who", score: 10 },
    { phrase: "know anyone who", score: 10 },
  ],

  // ── 2. APPLICATION / CONTACT INSTRUCTIONS (strong positive) ─────
  contactInstructions: [
    { phrase: "send your cv", score: 30 },
    { phrase: "send your resume", score: 30 },
    { phrase: "send cv to", score: 30 },
    { phrase: "email your cv", score: 30 },
    { phrase: "email your resume", score: 30 },
    { phrase: "share your cv", score: 25 },
    { phrase: "share your resume", score: 25 },
    { phrase: "dm your cv", score: 25 },
    { phrase: "dm me your cv", score: 25 },
    { phrase: "dm me for details", score: 15 },
    { phrase: "apply now", score: 25 },
    { phrase: "apply here", score: 25 },
    { phrase: "apply today", score: 25 },
    { phrase: "click to apply", score: 25 },
    { phrase: "link in comments", score: 15 },
    { phrase: "link in bio", score: 10 },
    { phrase: "interested candidates", score: 20 },
    { phrase: "eligible candidates", score: 15 },
    { phrase: "kindly share your profile", score: 20 },
    { phrase: "drop your resume", score: 25 },
    { phrase: "drop your cv", score: 25 },
  ],

  // ── 3. STRUCTURAL / FORMATTING SIGNALS ───────────────────────────
  structuralPatterns: [
    { regex: /requirements\s*:/i, score: 15, label: "Requirements: header" },
    { regex: /responsibilities\s*:/i, score: 15, label: "Responsibilities: header" },
    { regex: /qualifications\s*:/i, score: 15, label: "Qualifications: header" },
    { regex: /experience\s*:\s*\d+\+?\s*years?/i, score: 20, label: "X+ years experience" },
    { regex: /salary\s*:/i, score: 15, label: "Salary: mentioned" },
    { regex: /ctc\s*:/i, score: 15, label: "CTC: mentioned" },
    { regex: /location\s*:/i, score: 10, label: "Location: header" },
    { regex: /employment type\s*:/i, score: 15, label: "Employment type header" },
    { regex: /(full[\s-]?time|part[\s-]?time|contract)\s*(role|position|job)/i, score: 12, label: "Employment type phrase" },
    { regex: /#hiring|#jobopening|#jobalert|#nowhiring|#weArehiring/i, score: 20, label: "Hiring hashtag" },
    { regex: /#job\b|#jobs\b|#recruitment|#recruiting|#opentowork(?!.*\bme\b)/i, score: 8, label: "Generic job hashtag" },
  ],

  // ── 4. EMOJI SIGNALS ──────────────────────────────────────────────
  emojiSignals: [
    { char: "🚀", score: 5 },
    { char: "📢", score: 8 },
    { char: "🔥", score: 5 },
    { char: "📌", score: 5 },
    { char: "👉", score: 5 },
    { char: "✅", score: 3 },
    { char: "💼", score: 8 },
    { char: "📩", score: 8 },
  ],

  // ── 5. ROLE PATTERNS (Target roles) ──────────────────────────────
  rolePatterns: [
    { name: "Senior Angular Developer", pattern: "(sr\\.?|senior)\\s+angular\\s+(developer|engineer)", score: 25 },
    { name: "Angular Developer", pattern: "angular\\s+(developer|engineer)", score: 20 },
    { name: "Senior Frontend Engineer", pattern: "(sr\\.?|senior)\\s+front[\\s-]?end\\s+(developer|engineer)", score: 25 },
    { name: "Front End Developer", pattern: "front[\\s-]?end\\s+(developer|engineer)", score: 20 },
    { name: "Front End Developer", pattern: "(sr\\.?|senior\\s+)?(react\\.?js|react|next\\.?js|next)\\s+(developer|engineer|dev|programmer|specialist)", score: 25 },
    { name: "Front End Developer", pattern: "\\b(react\\.?js|react|next\\.?js|next)\\b", score: 15 },
    { name: "Full Stack Developer", pattern: "full[\\s-]?stack\\s+(developer|engineer)", score: 20 },
    { name: "Laravel Developer", pattern: "laravel\\s+(developer|engineer)", score: 20 },
    { name: "PHP / Laravel Developer", pattern: "php\\s+(laravel\\s+)?(developer|engineer)", score: 20 },
    { name: "Node.js Developer", pattern: "node\\.?js\\s+(developer|engineer)", score: 20 },
    { name: "TypeScript Developer", pattern: "typescript\\s+(developer|engineer)", score: 20 },
    { name: "Software Engineer", pattern: "software\\s+(engineer|developer)", score: 15 },
    { name: "Web Developer", pattern: "web\\s+developer", score: 15 },
    { name: "MEAN Stack Developer", pattern: "mean\\s+stack\\s+developer", score: 20 },
    { name: "MERN Stack Developer", pattern: "mern\\s+stack\\s+developer", score: 20 },
  ],

  // ── 6. TECHNOLOGY KEYWORDS (Target stack) ─────────────────────────
  techKeywords: [
    "react", "react.js", "reactjs", "next", "next.js", "nextjs",
    "angular", "angular.js", "angularjs", "angular 15", "angular 16",
    "angular 17", "angular 18", "angular 19", "angular 20", "angular 21",
    "typescript", "javascript", "rxjs", "ngrx",
    "laravel", "php", "livewire", "eloquent",
    "node.js", "nodejs", "express.js",
    "mysql", "mariadb", "postgresql", "redis",
    "rest api", "graphql", "tailwind", "docker"
  ],

  // ── 7. NEGATIVE SIGNALS (Penalties) ──────────────────────────────
  negativeSignals: [
    { phrase: "i'm looking for a job", score: -40 },
    { phrase: "i am looking for a job", score: -40 },
    { phrase: "i'm looking for work", score: -40 },
    { phrase: "open to work", score: -35 },
    { phrase: "#opentowork", score: -35 },
    { phrase: "available for hire", score: -35 },
    { phrase: "available for freelance", score: -30 },
    { phrase: "my services", score: -20 },
    { phrase: "hire me", score: -35 },
    { phrase: "i offer", score: -20 },
    { phrase: "check out my portfolio", score: -25 },
    { phrase: "excited to share", score: -15 },
    { phrase: "proud to announce", score: -10 },
    { phrase: "just released", score: -20 },
    { phrase: "just published", score: -20 },
    { phrase: "new blog post", score: -25 },
    { phrase: "check out my article", score: -25 },
    { phrase: "here's what i learned", score: -15 },
    { phrase: "in this article", score: -20 },
    { phrase: "recommendations for a good", score: -25 },
    { phrase: "does anyone know a good", score: -25 },
    { phrase: "congratulations to", score: -20 },
    { phrase: "happy to share that i", score: -20 },
    { phrase: "i recently started", score: -15 },
    { phrase: "training course", score: -15 },
    { phrase: "certification", score: -10 },
    { phrase: "tutorial", score: -15 },
  ],

  // ── 8. HARD EXCLUDES (Terminated immediately) ────────────────────
  hardExcludes: [
    "unpaid",
    "volunteer",
    "no experience required",
    "mlm",
    "commission only",
  ],

  // ── 9. SCORE BANDS ────────────────────────────────────────────────
  scoreBands: [
    { min: 0, max: 29, label: "ignore", badge: "Ignore", color: "#64748B" },
    { min: 30, max: 59, label: "maybe", badge: "Maybe", color: "#F59E0B" },
    { min: 60, max: 79, label: "relevant", badge: "Relevant", color: "#00A878" },
    { min: 80, max: Infinity, label: "hot", badge: "🔥 HOT LEAD", color: "#00C896" },
  ],
};
