# 🎯 LeadHunter — LinkedIn Recruitment Radar & Smart Scroll CRM

> **100% Local, Zero-Cost, Deterministic Hiring Post Detector, Intelligent Auto-Scroll Engine & Job Outreach Mini-CRM for Chromium Browsers (Manifest V3).**  
> Built with Pure Vanilla JavaScript (ES Modules), Modern CSS, and Google Lexend typography. No external AI APIs, no cloud dependencies, no tracking, and zero risk to your LinkedIn account.

---

## 📖 Table of Contents

1. [Overview](#-overview)
2. [Key Features](#-key-features)
3. [Smart Auto-Scroll Engine](#-smart-auto-scroll-engine)
4. [How It Works](#-how-it-works)
5. [Scoring & Signal Detection Engine](#-scoring--signal-detection-engine)
6. [In-Feed Experience](#-in-feed-experience)
7. [Local CRM & Pipeline Management](#-local-crm--pipeline-management)
8. [Email Outreach & Gmail Integration](#-email-outreach--gmail-integration)
9. [Settings & Radar Customization](#-settings--radar-customization)
10. [Architecture & Project Structure](#-architecture--project-structure)
11. [Installation & Setup](#-installation--setup)
12. [Running Automated Tests](#-running-automated-tests)
13. [Privacy & Account Safety](#-privacy--account-safety)

---

## 🌟 Overview

**LeadHunter** transforms your standard LinkedIn feed and search pages into a real-time recruitment intelligence feed with built-in hands-free scrolling.

As the page scrolls, LeadHunter passively analyzes organic posts, detects authentic hiring intent, extracts recruiter contact details (emails, direct application URLs, DM requests), scores each post against your preferred tech stack and roles, and saves qualified leads into a local, offline mini-CRM.

---

## 🚀 Key Features

- **⚡ Deterministic Smart Scroll**: Local, async scrolling loop with automatic scrollable container detection and settlement monitoring (`MutationObserver` filtering strictly on genuine `addedNodes`).
- **🎯 100% Local Heuristic Radar**: Real-time scoring of posts (+30 email, +25 apply link, +30 hiring phrase, -35 `#opentowork` penalty, 0% hard exclusions).
- **📇 Integrated Mini-CRM**: 7 pipeline stages (`New`, `Reviewed`, `Contacted`, `Applied`, `Replied`, `Interview`, `Rejected`), rich notes, multi-level deduplication, CSV/JSON export.
- **✉️ 1-Click Gmail Outreach**: Instant pre-filled cold outreach emails with candidate name, role, company, recruiter name, and phone/email placeholders.
- **🛡️ 100% Local & Privacy First**: Zero external API calls, zero tracking, runs in-browser offline.

---

## 🔄 Smart Auto-Scroll Engine

LeadHunter includes a deterministic **Smart Scroll** engine that understands *how* a page scrolls instead of relying on a hardcoded, blind timer.

```
┌─────────────────────────────────────────────────────────────┐
│                    Smart Scroll Engine                      │
│                                                             │
│   1. ContainerDetector                                      │
│      - Probes element at center (elementFromPoint)          │
│      - Walks up DOM hierarchy scoring candidate containers  │
│      - Selects container with best scrollable range & size  │
│                                                             │
│   2. Async Control Loop (scrollEngine.js)                   │
│      - Smooth scroll execution (ScrollController)           │
│      - Settlement wait (SettlementDetector addedNodes > 2)  │
│      - Passive LeadHunter radar evaluation pass             │
│      - Stop conditions evaluation (StopConditions)          │
│      - Natural pause variation & loop repeat                │
└─────────────────────────────────────────────────────────────┘
```

### Smart Scroll Controls & Configuration
- **Start / Stop Toggle**: Prominent toggle button in the popup with live animated state.
- **Scroll Distance (`px`)**: Adjustable step distance (100px – 1500px, default `500px`).
- **Scroll Delay (`seconds`)**: Adjustable pause time between jumps (0.5s – 10.0s, default `2.0s`).
- **Scroll Mode**:
  - **Continuous Loop**: Keeps scrolling down automatically for hands-free feed monitoring.
  - **Single Step ("Step Once")**: Scrolls down exactly once by the configured pixel distance.
- **Infinite Feed Resilience**: Automatically handles dynamic lazy-loading on infinite scroll feeds (LinkedIn, Twitter/X) without prematurely stopping when approaching temporary pre-rendered boundaries.
- **Configurable Stop Rules**: Optional max scroll count limit, max duration limit, and stop-on-bottom toggle.
- **Live Telemetry**: Real-time display of scrolls executed, DOM activity mutations detected, and elapsed time.

---

## ⚙️ How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    LinkedIn Feed / Search                   │
│   (User scrolls naturally or with Smart Scroll Engine)      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Passive Content Script (MutationObserver)       │
│  - Captures post DOM nodes & text boxes                     │
│  - Prevents duplicate evaluations with URN caching          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Deterministic Rule-Based Scoring Engine         │
│  1. Check Hard Exclusions (unpaid, MLM, volunteer)          │
│  2. Entity Extraction (regex emails, career apply links, DM)│
│  3. Positive Intent Phrases ("we're hiring", "join team")   │
│  4. Contact Directives ("send your cv", "apply now")        │
│  5. Structural Patterns (Requirements:, Experience:, CTC:)  │
│  6. Target Role Matching & Tech Stack Matching              │
│  7. Negative Penalties (#opentowork, course, portfolio)     │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            │ Score < Min Threshold               │ Score >= Min Threshold (e.g. 60%+)
            ▼                                     ▼
      ┌───────────┐                ┌─────────────────────────────┐
      │  Ignored  │                │     Qualified Lead Found!   │
      └───────────┘                └──────────────┬──────────────┘
                                                  │
            ┌─────────────────────────────────────┴─────────────────────────────────────┐
            ▼                                                                           ▼
┌──────────────────────────────────────┐                   ┌────────────────────────────────────────┐
│          In-Feed Overlay             │                   │           Local Mini-CRM               │
│ - Visual Badge (Score & Role)        │                   │ - Auto-saved to chrome.storage.local   │
│ - Hot Lead Border Glow               │                   │ - Multi-level deduplication (URN/Email)│
│ - Hover Popover with Signal Breakdown│                   │ - 7 Pipeline status stages             │
│ - 1-Click Copy & Gmail Compose       │                   │ - Search, Filter, Notes, CSV/JSON exp  │
└──────────────────────────────────────┘                   └────────────────────────────────────────┘
```

---

## 🧠 Scoring & Signal Detection Engine

LeadHunter's scoring engine (`src/core/scoring.js`) runs locally in milliseconds and uses a multi-tiered, rule-based heuristic algorithm without making external API calls.

### 1. Hard Exclusions (Immediate 0% Score & Discard)
Eliminates spam, uncompensated roles, and multi-level marketing:
- `unpaid`, `volunteer`, `no experience required`, `mlm`, `commission only`

### 2. Contact Entity Extraction
- **Direct Email Extraction (`+30 pts`)**: Full RFC-compliant regex scanning. Automatically filters out common false positives (`.png`, `.jpg`, `example.com`, `linkedin.com`).
- **Application URL Extraction (`+25 pts`)**: Identifies external application links and ATS portals (Greenhouse, Lever, Ashby, Workable, BambooHR, Typeform, Google Forms, Notion, etc.).
- **DM Instruction Detection (`+20 pts`)**: Detects explicit instructions like `dm me your cv`, `drop a dm`, `message me directly`, `inbox me`.

### 3. Positive Hiring Intent Phrases (Up to 3 matched)
- `we are hiring`, `we're hiring`, `join our team`, `looking for a`, `job opening`, `hiring alert`, `open position`, `immediate opening` (`+15 to +30 pts`).

### 4. Contact & Application Directives
- `send your cv`, `send resume to`, `apply here`, `apply at`, `share your profile`, `interested candidates` (`+20 to +30 pts`).

### 5. Structured Job Post Formats
- Formatted headers: `Requirements:`, `Responsibilities:`, `Experience:`, `Salary:`, `Location:`, `Skills:` (`+10 to +15 pts`).
- Hiring hashtags: `#hiring`, `#jobopportunity`, `#careers`, `#developerjobs` (`+8 to +20 pts`).

### 6. Role & Tech Stack Matching
- **Target Roles (`+20 pts`)**: Matches custom roles (e.g. `Senior Angular Developer`, `Laravel Developer`, `Full Stack Developer`).
- **Tech Stack Keywords (`+8 pts each, up to +24 pts`)**: Matches technologies (e.g. `Angular`, `TypeScript`, `Laravel`, `PHP`, `Node.js`).

### 7. Negative Penalties
- `#opentowork` or job seeker posts (`-35 pts`).
- Course, bootcamp, or portfolio self-promotions (`-25 pts`).

---

## 🖥️ In-Feed Experience

When scrolling through LinkedIn, LeadHunter injects clean, non-intrusive elements directly on qualified post cards:

- **Score Badge**: An emerald badge showing the detected job role and compatibility score (e.g., `Angular Developer • 95% Hot Lead`).
- **Signal Breakdown Hover Popover**: Hovering over the badge displays every matched keyword, extracted email, and direct link.
- **Card Highlighting**: Posts scoring $\ge 80\%$ receive a subtle emerald gradient glow.
- **Instant Actions**:
  - 📋 **Copy**: Copies a formatted summary directly to your clipboard.
  - ✉️ **Pitch**: Opens Gmail web compose pre-filled with the recruiter's email and your customized pitch.

---

## 📊 Local CRM & Pipeline Management

Access the full CRM anytime by clicking **Open Lead Dashboard & CRM** from the popup or extension menu.

- **Status Pipeline Stages**: `New`, `Reviewed`, `Contacted`, `Applied`, `Replied`, `Interview`, `Rejected`.
- **Search & Filters**: Real-time search across roles, companies, emails, recruiter names, and notes with filter toggles (e.g. *Has Email*, *Has URL*, *Hot Leads Only*).
- **Candidate Notes**: Save private interview notes, compensation details, and recruiter feedback.
- **Export Options**: 1-click **Export to CSV** (for spreadsheets) or **Export to JSON** (for backups).

---

## ✉️ Email Outreach & Gmail Integration

Clicking the **Pitch** button automatically builds a Gmail web compose link with your configured details:

```text
To: careers@company.com
Subject: Application for Senior Angular Developer Position

Hi,

I'm making an application for the job of Senior Angular Developer. Please find my CV attached as stated in the job description.

I describe my motivation for applying for the job, my prior experience, and my pay goals in my CV.

You can reach me at any time at +8801620531802 or by email if you have any questions (suptokhan24@gmail.com).

Regards,
Supto Khan
```

---

## ⚙️ Settings & Radar Customization

Fine-tune how LeadHunter behaves via the **Radar Settings** tab in the dashboard:

- **Target Roles**: Add or remove target job titles (supports full regex patterns).
- **Tech Stack Keywords**: Add or remove technologies, languages, and frameworks.
- **Negative Penalties & Exclusions**: Add keywords that should penalize or eliminate posts.
- **Sensitivity Thresholds**:
  - Minimum Score to Capture (Default: `60%`)
  - Hot Lead Threshold (Default: `80%`)
- **Display Toggles**: Enable/disable in-feed badges, hot lead card highlights, or auto-saving.
- **Applicant Profile & Outreach Template**: Configure your full name, email, phone number, subject line, and body template.

---

## 📁 Architecture & Project Structure

```
linkedin-LeadHunter/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── README.md                  # Project documentation & reference manual
├── test_engine.js             # Automated test suite for LeadHunter radar scoring & extraction
├── test_smart_scroll.js       # Automated test suite for Smart Scroll deterministic modules
├── create_icons.js            # Standalone canvas icon generator
├── icons/                     # Extension icons (16x16, 48x48, 128x128)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── src/
    ├── background/
    │   └── service-worker.js  # Background worker handling messaging & on-demand script injection
    ├── config/
    │   ├── defaults.js        # Default user profile, smart scroll config, and initial CRM state
    │   └── signals.js         # Comprehensive dictionary of hiring signals, phrases & weights
    ├── core/
    │   ├── extractor.js       # Regex extractors (emails, ATS URLs, DMs, metadata) & email builder
    │   ├── scoring.js         # Deterministic scoring algorithm & classification engine
    │   └── storage.js         # chrome.storage.local wrapper, CRUD, deduplication, CSV/JSON export
    ├── content/
    │   ├── containerDetector.js  # Probes center point & scores scrollable DOM candidate containers
    │   ├── scrollController.js   # Executes smooth container & window scroll actions
    │   ├── settlementDetector.js # MutationObserver filtering strictly on addedNodes (>2 threshold)
    │   ├── stopConditions.js     # Evaluates limits (count, duration, bottom reached, activity timeout)
    │   ├── scrollEngine.js       # Async control loop orchestrator with live telemetry
    │   ├── content.js            # Passive DOM observer, feed parser, badge injector & overlays
    │   └── content.css           # In-feed badge styles, card highlights, popovers & animations
    ├── dashboard/
    │   ├── dashboard.html     # Full CRM & Settings interface
    │   ├── dashboard.js       # Dashboard pipeline controller, search, filters, drawer & settings
    │   └── dashboard.css      # Modern emerald/dark theme design system
    └── popup/
        ├── popup.html         # Popup widget with Smart Scroll controls & mini-feed summary
        ├── popup.js           # Popup controller, Smart Scroll sliders, Start/Stop toggle & telemetry
        └── popup.css          # Compact popup stylesheet & sleek control cards
```

---

## 🚀 Installation & Setup

### Requirements
- Any modern Chromium-based browser (**Google Chrome**, **Brave**, **Microsoft Edge**, **Arc**, **Opera**).

### Installation Steps
1. Clone or download this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/linkedin-LeadHunter.git
   ```
2. Open your Chromium browser and go to the extensions manager:
   ```text
   chrome://extensions
   ```
3. Enable **Developer mode** using the toggle in the top-right corner.
4. Click the **Load unpacked** button in the top-left corner.
5. Select the project folder (`linkedin-LeadHunter`).
6. The LeadHunter icon will appear in your browser toolbar!

### Usage
1. Open **LinkedIn** (`https://www.linkedin.com/feed/` or search posts for `"Senior Developer"`).
2. Click the LeadHunter extension icon in your toolbar:
   - Configure **Scroll Distance** (e.g. `500 px`) and **Scroll Delay** (e.g. `2.0 s`).
   - Click **Start Smart Scroll** for hands-free scanning.
3. When hiring posts are detected, LeadHunter will display an in-feed score badge and highlight hot leads.
4. Click **Open Lead Dashboard & CRM** from the popup to manage your outreach pipeline!

---

## 🧪 Running Automated Tests

LeadHunter includes deterministic unit test suites to verify scoring accuracy, negative penalties, role detection, entity extraction, and the Smart Scroll engine.

### Run Smart Scroll Tests:
```bash
node test_smart_scroll.js
```
- ✅ ContainerDetector candidate probing & scoring
- ✅ ScrollController smooth metric calculations
- ✅ StopConditions limits & infinite feed resilience
- ✅ SettlementDetector `addedNodes` noise rejection
- ✅ ScrollEngine async control loop & state telemetry

### Run Radar Scoring & Extraction Tests:
```bash
node test_engine.js
```
- ✅ Hot Lead verification (Role + Hiring Intent + Direct Email + Apply URL)
- ✅ Technology & DM verification (Framework keywords + DM instruction detection)
- ✅ Negative Signal penalty test (`#opentowork` job-seeker post filtered out)
- ✅ Hard Exclusion test (Strict rejection of unpaid/volunteer posts)
- ✅ Email & URL extractor accuracy (Filters out `.png`, `example.com`)
- ✅ Multi-level duplicate check & Gmail outreach URL generation

---

## 🔒 Privacy & Account Safety

- **100% Local Processing**: All evaluation, scoring, extraction, scroll control, and lead storage happens entirely on your machine via `chrome.storage.local`. No data is ever sent to external servers.
- **Zero Account Risk**: LeadHunter does **not** use headless scrapers, synthetic clicks, or unauthorized private LinkedIn APIs. It uses native smooth browser scrolling and passive DOM analysis on the content rendered in your active tab.
- **No Cloud AI / Zero API Cost**: Works without OpenAI, Gemini, or any paid API key. Runs entirely on deterministic pattern-matching algorithms.

---

## 📄 License

MIT License. Free to use, modify, and distribute for personal and commercial job search workflows.
