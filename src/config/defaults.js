/**
 * defaults.js
 * Default user settings and storage state
 */

export const DEFAULT_SETTINGS = {
  minScoreThreshold: 60, // Only notify/auto-save leads with score >= 60
  hotLeadThreshold: 80,
  strictRoleMatch: true, // Only capture posts that match target roles or tech stack
  autoSaveLeads: true,
  showInFeedBadge: true,
  soundAlertOnHotLead: false,
  highlightHotPosts: true,

  // Smart Scroll Configuration
  smartScroll: {
    stepPx: 500,
    delayMs: 2000,
    mode: "infinite", // "infinite" or "single"
    stopConditions: {
      maxScrolls: 0, // 0 = unlimited
      maxDurationMinutes: 0, // 0 = unlimited
      stopOnBottom: true,
      noActivityTimeoutSec: 10 // 0 = disabled
    }
  },

  // Customizable Target Roles
  targetRoles: [
    "Senior Angular Developer",
    "Angular Developer",
    "Senior Frontend Engineer",
    "Front End Developer",
    "Frontend Developer",
    "React Developer",
    "Reactjs Developer",
    "Next.js Developer",
    "Full Stack Developer",
    "Laravel Developer",
    "PHP / Laravel Developer",
    "Node.js Developer",
    "TypeScript Developer",
    "Software Engineer"
  ],

  // Customizable Tech Keywords
  techStack: [
    "React", "Reactjs", "React.js", "Next", "Next.js", "Nextjs",
    "Angular", "TypeScript", "JavaScript", "RxJS", "NgRx",
    "Laravel", "PHP", "Livewire", "Eloquent",
    "Node.js", "Express.js", "REST API", "GraphQL", "Tailwind", "MySQL"
  ],

  // Excluded phrases / words
  exclusions: [
    "unpaid",
    "volunteer",
    "no experience required",
    "mlm",
    "commission only"
  ],

  // Candidate User Profile for Outgoing Emails
  userProfile: {
    name: "Supto Khan",
    email: "suptokhan24@gmail.com",
    phone: "+8801620531802"
  },

  // 3-CV Google Drive Links Manager
  cvLinks: {
    angular: "",
    frontend: "",
    fullstack: ""
  },

  // Global Reply-To Email for consolidating recruiter replies
  replyToEmail: "suptokhan24@gmail.com",

  // Multi-Account Sender Pool (Total 200/day: 60 + 60 + 60 + 20 fallback)
  senderAccounts: [
    { email: "suptokhan25@gmail.com", appPassword: "", provider: "gmail", dailyQuota: 60, sentToday: 0, enabled: true, isFallback: false },
    { email: "suptokhan777@gmail.com", appPassword: "", provider: "gmail", dailyQuota: 60, sentToday: 0, enabled: true, isFallback: false },
    { email: "suptokhan1@hotmail.com", appPassword: "", provider: "outlook", dailyQuota: 60, sentToday: 0, enabled: true, isFallback: false },
    { email: "suptokhan24@gmail.com", appPassword: "", provider: "gmail", dailyQuota: 20, sentToday: 0, enabled: true, isFallback: true }
  ],

  // Auto-Outreach Schedule & Speed Controls (6:00 AM - 2:00 PM)
  autoOutreachSchedule: {
    enabled: true,
    directSmtpEnabled: true, // Silent background sending
    smtpBridgeUrl: "https://mailer.nexidant.com", // Custom remote server or local bridge URL
    startHour: 6, // 6:00 AM
    endHour: 14,  // 2:00 PM (14:00)
    minIntervalSec: 120, // 2 minutes
    maxIntervalSec: 180, // 3 minutes
    dailyGoal: 200,
    lastSentDate: null
  },

  // Cold Outreach Email Template with Dynamic Placeholders
  emailTemplate: {
    subject: "Application for {role} Position - {user_name}",
    body: `Hi,

I'm making an application for the job of {role}. Please find my {cv_type} via Google Drive here:
{cv_link}

I describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.

You can reach me at any time at {user_phone} or by email if you have any questions ({user_email}).

Regards,
{user_name}`
  },

  // Lead Lifecycle Status Options
  leadStatuses: [
    { id: "new", label: "New", color: "#00C896" },
    { id: "reviewed", label: "Reviewed", color: "#5EEAD4" },
    { id: "contacted", label: "Contacted", color: "#00A878" },
    { id: "applied", label: "Applied", color: "#3B82F6" },
    { id: "replied", label: "Replied", color: "#8B5CF6" },
    { id: "interview", label: "Interview", color: "#10B981" },
    { id: "rejected", label: "Rejected", color: "#EF4444" }
  ]
};

export const INITIAL_STORAGE_STATE = {
  settings: DEFAULT_SETTINGS,
  leads: [],
  radarActive: true,
  stats: {
    scannedCount: 0,
    leadsFound: 0,
    hotLeadsFound: 0,
    emailsFound: 0,
    urlsFound: 0,
    lastActive: null
  }
};
