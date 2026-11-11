/**
 * defaults.js
 * Default user settings and storage state
 */

export const DEFAULT_SETTINGS = {
  minScoreThreshold: 60, // Only notify/auto-save leads with score >= 60
  hotLeadThreshold: 80,
  strictRoleMatch: true, // Only capture posts that match target roles or tech stack
  emailOnlyLeads: true, // Only capture posts with recruiter emails (strictly ignore DM & apply links)
  autoSaveLeads: true,
  showInFeedBadge: true,
  soundAlertOnHotLead: false,
  highlightHotPosts: true,

  // Telegram Channel Integration
  telegramChannel: "remotejobss",
  telegramActiveChannels: [
    "remotejobss",
    "Remote_Software_Developer_Jobs",
    "remote_frontend_jobs",
    "angular_jobs_feed",
    "job_react",
    "javascript_jobs_feed",
    "remote_php_jobs",
    "DevEngine",
    "devitjobs_us",
    "devitjobs",
    "cchellowork",
    "tech_revolution_world"
  ],

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
    name: "John Doe",
    email: "johndoe@example.com",
    phone: "+1 555-0199"
  },

  // 3-CV Google Drive Links Manager
  cvLinks: {
    angular: "",
    frontend: "",
    fullstack: ""
  },

  // Global Reply-To Email for consolidating recruiter replies
  replyToEmail: "johndoe@example.com",

  // Multi-Account Sender Pool (Configurable via CRM Settings)
  senderAccounts: [],

  // Auto-Outreach Schedule & Speed Controls (6:00 AM - 2:00 PM)
  autoOutreachSchedule: {
    enabled: true,
    directSmtpEnabled: true, // Silent background sending
    smtpBridgeUrl: "http://localhost:3000", // Custom remote server or local bridge URL
    startHour: 6, // 6:00 AM
    endHour: 14,  // 2:00 PM (14:00)
    minIntervalSec: 45, // 45 seconds
    maxIntervalSec: 90, // 90 seconds
    dailyGoal: 360,
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

/**
 * Curated Telegram Recruitment & Job Channels Directory
 * 100% verified public channels with accessible web previews and live job postings.
 */
export const TELEGRAM_CHANNELS = {
  // First Priority: Highest direct developer match & verified public recruiter hiring channels
  priority: [
    { username: "remotejobss", name: "Remote Jobs Worldwide", subscribers: "162K", lang: "English", category: "Remote Work", focus: "All Remote Roles" },
    { username: "Remote_Software_Developer_Jobs", name: "Remote Software Developer Jobs", subscribers: "26.9K", lang: "English", category: "Software Dev", focus: "Software Engineering" },
    { username: "remote_frontend_jobs", name: "Remote Front-End Jobs", subscribers: "5.03K", lang: "English", category: "Frontend Dev", focus: "TypeScript, React, Next.js" },
    { username: "angular_jobs_feed", name: "Angular Jobs Feed", subscribers: "2.17K", lang: "English / Russian", category: "Frontend Dev", focus: "Angular & TypeScript" },
    { username: "job_react", name: "React Job | JS", subscribers: "16.8K", lang: "English / Russian", category: "Frontend Dev", focus: "React, JavaScript" },
    { username: "javascript_jobs_feed", name: "JavaScript Jobs Feed", subscribers: "15K", lang: "English / Russian", category: "Frontend Dev", focus: "JS, TS, Front-End" },
    { username: "remote_php_jobs", name: "Remote PHP / Laravel Jobs", subscribers: "1.23K", lang: "English", category: "Backend Dev", focus: "PHP, Laravel, Full Stack" },
    { username: "DevEngine", name: "DevEngine Canadian Tech", subscribers: "1.11K", lang: "English", category: "Software Dev", focus: "Front-End, Angular/React" },
    { username: "devitjobs_us", name: "DevIT Jobs USA", subscribers: "3.53K", lang: "English", category: "Software Dev", focus: "USA & Remote Developers" },
    { username: "devitjobs", name: "DevIT Jobs UK & Remote", subscribers: "13.3K", lang: "English", category: "Software Dev", focus: "Software Engineering" },
    { username: "cchellowork", name: "HelloWork Remote IT", subscribers: "24.8K", lang: "English", category: "Software Dev", focus: "Remote IT & Dev" },
    { username: "tech_revolution_world", name: "Tech Revolution World", subscribers: "15K", lang: "English", category: "Software Dev", focus: "Tech Jobs & Engineering" }
  ],

  // Category A: Large international and remote-work channels
  categoryA: [
    { username: "remotejobss", name: "Remote Jobs Worldwide", subscribers: "162K", lang: "English", category: "Remote Work", focus: "Remote Roles" },
    { username: "young_relocate", name: "Young Relocate", subscribers: "53K", lang: "Russian / English", category: "Remote Work", focus: "Relocation & Remote" },
    { username: "arabonlinework", name: "Arab Online Work", subscribers: "140K", lang: "Arabic / English", category: "Remote Work", focus: "Online & Remote" },
    { username: "teleworksjobs", name: "Teleworks Jobs", subscribers: "271K", lang: "Arabic / English", category: "Remote Work", focus: "Telework & Remote" },
    { username: "vacantesremotas", name: "Vacantes Remotas", subscribers: "130K", lang: "Spanish / English", category: "Remote Work", focus: "Remote Vacancies" },
    { username: "rabota_doma", name: "Rabota Doma", subscribers: "150K", lang: "Russian / English", category: "Remote Work", focus: "Work from Home" },
    { username: "rabota_udalennayaq", name: "Rabota Udalennaya", subscribers: "72K", lang: "Russian / English", category: "Remote Work", focus: "Remote Jobs" },
    { username: "remoteit", name: "Remote IT", subscribers: "46K", lang: "Russian / English", category: "Remote Work", focus: "IT Remote" }
  ],

  // Category B: Software engineering and developer recruitment
  categoryB: [
    { username: "Remote_Software_Developer_Jobs", name: "Remote Software Developer Jobs", subscribers: "26.9K", lang: "English", category: "Software Dev", focus: "Software Engineering" },
    { username: "DevEngine", name: "DevEngine Tech Jobs", subscribers: "1.11K", lang: "English", category: "Software Dev", focus: "Remote Dev" },
    { username: "devitjobs_us", name: "Tech Jobs USA (DevIT)", subscribers: "3.53K", lang: "English", category: "Software Dev", focus: "US Tech Roles" },
    { username: "devitjobs", name: "DevIT Jobs", subscribers: "13.3K", lang: "English", category: "Software Dev", focus: "Software Engineering" },
    { username: "remotedevjobs", name: "Remote Dev Jobs", subscribers: "1.96K", lang: "English", category: "Software Dev", focus: "Remote Developers" },
    { username: "remote_jobs_today", name: "Remote Jobs Today", subscribers: "19.4K", lang: "English", category: "Software Dev", focus: "Remote Work" },
    { username: "remotejobsenglish", name: "Remote Jobs English", subscribers: "6.5K", lang: "English", category: "Software Dev", focus: "Curated Remote" },
    { username: "remote_job_worldwide", name: "Remote Job Worldwide", subscribers: "3.3K", lang: "English", category: "Software Dev", focus: "Worldwide Remote" },
    { username: "cchellowork", name: "HelloWork Remote IT", subscribers: "24.8K", lang: "English", category: "Software Dev", focus: "Remote IT" },
    { username: "opento_dev", name: "OpenTo Dev Jobs", subscribers: "10.8K", lang: "Russian / English", category: "Software Dev", focus: "Relocation & Remote Dev" }
  ],

  // Category C: Frontend, Angular, React & TypeScript Specialists
  categoryC: [
    { username: "angular_jobs_feed", name: "Angular Jobs Feed", subscribers: "2.17K", lang: "English / Russian", category: "Frontend Dev", focus: "Angular & TypeScript" },
    { username: "remote_frontend_jobs", name: "Remote Front-End Jobs", subscribers: "5.03K", lang: "English", category: "Frontend Dev", focus: "TypeScript, React, Next.js" },
    { username: "job_react", name: "React Job | JS", subscribers: "16.8K", lang: "English / Russian", category: "Frontend Dev", focus: "React, JavaScript" },
    { username: "javascript_jobs_feed", name: "JavaScript Jobs Feed", subscribers: "15K", lang: "English / Russian", category: "Frontend Dev", focus: "JavaScript & Front-End" },
    { username: "JScript_jobs", name: "JavaScript Curated Jobs", subscribers: "12.8K", lang: "English / Russian", category: "Frontend Dev", focus: "JavaScript, React, Node" },
    { username: "frontend_rabota", name: "FrontEnd Jobs", subscribers: "3.59K", lang: "Russian / English", category: "Frontend Dev", focus: "Front-End Roles" },
    { username: "job_webdev", name: "WebDev & Layout Jobs", subscribers: "7.72K", lang: "Russian / English", category: "Frontend Dev", focus: "HTML, CSS, JS, Front-End" },
    { username: "runello_rus_javascript", name: "JavaScript Job Offers", subscribers: "10.4K", lang: "Russian / English", category: "Frontend Dev", focus: "JS / TS Opportunities" },
    { username: "typescript_jobs", name: "TypeScript Jobs", subscribers: "25", lang: "English", category: "Frontend Dev", focus: "TypeScript" }
  ],

  // Category D: Backend, PHP, Laravel, Node.js & Full Stack
  categoryD: [
    { username: "remote_php_jobs", name: "Remote PHP / Laravel", subscribers: "1.23K", lang: "English", category: "Backend Dev", focus: "PHP, Laravel" },
    { username: "nodejsjobsfeed", name: "NodeJS Jobs Feed", subscribers: "3.61K", lang: "English / Russian", category: "Backend Dev", focus: "Node.js & Backend" },
    { username: "laravel_jobs", name: "Laravel Jobs", subscribers: "125", lang: "Russian / English", category: "Backend Dev", focus: "Laravel Specialists" },
    { username: "symfony_careers", name: "Symfony Jobs", subscribers: "828", lang: "English / Russian", category: "Backend Dev", focus: "Symfony & PHP" },
    { username: "yii_jobs", name: "Yii Framework Jobs", subscribers: "564", lang: "Russian / English", category: "Backend Dev", focus: "Yii & PHP" },
    { username: "codenjobs", name: "Code & Jobs", subscribers: "186", lang: "English", category: "Backend Dev", focus: "Remote Developer Jobs" }
  ],

  // Category E: Freelance, Outstaffing, Web3 & Tech
  categoryE: [
    { username: "outsource456", name: "Outsource & Freelance", subscribers: "19.4K", lang: "English", category: "Freelance / Projects", focus: "Freelance Projects" },
    { username: "IT_Outstaff_projects", name: "IT Outstaff Projects", subscribers: "16.1K", lang: "English", category: "Freelance / Projects", focus: "Outstaffing" },
    { username: "IT_REMOTE_PROJECTS", name: "IT Remote Projects", subscribers: "10.6K", lang: "English", category: "Freelance / Projects", focus: "Remote IT Projects" },
    { username: "itfreelancers", name: "IT Freelancers", subscribers: "26K", lang: "English", category: "Freelance / Projects", focus: "Freelance Development" },
    { username: "web3hiring", name: "Web3 Hiring", subscribers: "61K", lang: "English", category: "Freelance / Projects", focus: "Web3 & Blockchain" },
    { username: "remotejobshg", name: "Remote Crypto Jobs", subscribers: "32.5K", lang: "English", category: "Freelance / Projects", focus: "Crypto & Web3 Remote" },
    { username: "remoteeverafter", name: "Remote Ever After", subscribers: "7.2K", lang: "English", category: "Freelance / Projects", focus: "Remote Opportunities" },
    { username: "josad_software", name: "Josad Software", subscribers: "2.1K", lang: "English", category: "Freelance / Projects", focus: "Software Vacancies" },
    { username: "tech_revolution_world", name: "Tech Revolution World", subscribers: "15K", lang: "English", category: "Freelance / Projects", focus: "Tech Jobs & Engineering" }
  ]
};

/**
 * Returns a deduplicated flat list of all curated Telegram channels
 */
export function getAllTelegramChannels() {
  const map = new Map();
  Object.values(TELEGRAM_CHANNELS).forEach(list => {
    list.forEach(ch => {
      const key = ch.username.toLowerCase();
      if (!map.has(key)) {
        map.set(key, ch);
      }
    });
  });
  return Array.from(map.values());
}
