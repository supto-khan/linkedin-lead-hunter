# 🎯 LeadHunter — LinkedIn Recruitment Radar & Job Outreach CRM

> **100% Local, Zero-Cost, Deterministic Hiring Post Detector & Job Outreach Mini-CRM for Chromium Browsers (Manifest V3).**  
> Built with Pure Vanilla JavaScript (ES Modules), Modern CSS, and Google Lexend typography. No external AI APIs, no cloud dependencies, no tracking, and zero risk to your LinkedIn account.

---

## 📖 Table of Contents

1. [Overview](#-overview)
2. [Key Problems Solved](#-key-problems-solved)
3. [How It Works](#-how-it-works)
4. [Scoring & Signal Detection Engine](#-scoring--signal-detection-engine)
5. [In-Feed Experience](#-in-feed-experience)
6. [Local CRM & Pipeline Management](#-local-crm--pipeline-management)
7. [Email Outreach & Gmail Integration](#-email-outreach--gmail-integration)
8. [Settings & Radar Customization](#-settings--radar-customization)
9. [Architecture & Project Structure](#-architecture--project-structure)
10. [Installation & Setup](#-installation--setup)
11. [Running Automated Tests](#-running-automated-tests)
12. [Privacy & LinkedIn Account Safety](#-privacy--linkedin-account-safety)

---

## 🌟 Overview

**LeadHunter** transforms your standard LinkedIn feed and search pages into a real-time recruitment intelligence feed. As you scroll naturally, LeadHunter passively analyzes organic posts, detects authentic hiring intent, extracts recruiter contact details (emails, direct application URLs, DM requests), scores each post against your preferred tech stack and roles, and saves qualified leads into a local, offline mini-CRM.

---

## 💡 Key Problems Solved

- **The Hidden Job Market on LinkedIn**: Thousands of hiring managers and founders skip the official LinkedIn Job board (which is expensive and flooded with bots) and instead post informal hiring updates on their personal feeds ("*We're hiring a Senior Angular/Laravel Dev! Send CV to jobs@company.com*").
- **Feed Clutter & Algorithmic Noise**: These high-value hiring posts are easily buried under promotions, influencer posts, career milestones, and `#opentowork` updates.
- **Manual Overhead**: Finding the email, copying the post, organizing leads in spreadsheets, and drafting cold emails takes hours of tedious manual work.
- **Bot/Ban Risk of Scraping Tools**: Automated scrapers and bots that simulate clicks or send non-human HTTP requests risk getting your LinkedIn account flagged or restricted. LeadHunter operates **100% passively on your existing DOM** with zero bot actions.

---

## ⚙️ How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                    LinkedIn Feed / Search                   │
│   (User scrolls naturally — zero automated clicking/bots)   │
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
- High intent (`+30 pts`): `"we're hiring"`, `"we are hiring"`, `"i'm hiring"`, `"looking to hire"`, `"now hiring"`, `"currently hiring"`, `"actively hiring"`
- Medium intent (`+20 to +25 pts`): `"we are looking for"`, `"job opening"`, `"job opportunity"`, `"vacancies"`, `"immediate opening"`, `"urgent hiring"`, `"join our team"`, `"hiring alert"`
- Recruiter phrasing (`+10 to +20 pts`): `"recruiting for"`, `"on behalf of my client"`, `"referrals welcome"`, `"tag someone who"`

### 4. Application & Submission Directives (Up to 2 matched)
- Direct submission (`+25 to +30 pts`): `"send your cv"`, `"email your resume"`, `"share your cv"`, `"dm your cv"`, `"apply now"`, `"apply here"`, `"drop your resume"`
- Guidance phrasing (`+10 to +20 pts`): `"interested candidates"`, `"link in comments"`, `"link in bio"`

### 5. Structural & Format Patterns
- Structural headers (`+10 to +20 pts`): `Requirements:`, `Responsibilities:`, `Qualifications:`, `Experience: X+ years`, `Salary:`, `CTC:`, `Employment type:`
- Relevant hashtags (`+8 to +20 pts`): `#hiring`, `#jobopening`, `#jobalert`, `#nowhiring`, `#weArehiring`

### 6. Target Role & Technology Stack Matching
- **Target Role Matching (`+15 to +25 pts`)**: Regex matching for target titles (e.g. *Senior Angular Developer*, *Frontend Engineer*, *Full Stack Developer*, *Laravel Developer*, *Node.js Developer*, *Software Engineer*).
- **Tech Stack Matching (`+8 pts` per match, up to `+24 pts` max)**: Word-boundary matching for frameworks, libraries, and databases (Angular, TypeScript, RxJS, NgRx, Laravel, PHP, Livewire, Node.js, Express, MySQL, PostgreSQL, Redis, REST API, GraphQL, Tailwind, Docker).

### 7. Negative Penalties (Reductions)
Filters out job seekers, announcements, and articles misclassified as jobs:
- Job seeker / looking for work (`-35 to -40 pts`): `"i'm looking for a job"`, `"open to work"`, `"#opentowork"`, `"available for hire"`, `"hire me"`
- Personal milestone / promotions (`-10 to -20 pts`): `"proud to announce"`, `"excited to share"`, `"congratulations to"`, `"happy to share that i"`
- Content sharing & tutorials (`-15 to -25 pts`): `"new blog post"`, `"check out my article"`, `"here's what i learned"`, `"tutorial"`, `"certification"`

### 8. Score Bands & Classification
| Score Band | Classification | Badge Display | Visual Effect |
| :--- | :--- | :--- | :--- |
| **80 – 100%** | **🔥 HOT LEAD** | Emerald / Green | Highlighted glowing card border + Hot badge |
| **60 – 79%** | **Relevant** | Mint / Teal | In-feed Lead badge |
| **30 – 59%** | **Maybe** | Amber / Orange | Low priority (below default capture threshold) |
| **0 – 29%** | **Ignore** | Muted Slate | Discarded |

---

## 🖥️ In-Feed Experience

LeadHunter enhances the standard LinkedIn interface without breaking the layout or interfering with normal browsing:

1. **In-Feed Score Badge**: Appears at the top-right of every detected job post, displaying the score percentage and detected job title.
2. **Hot Lead Highlighting**: High-scoring posts (80%+) receive a subtle, modern glowing border.
3. **Interactive Signal Breakdown Popover**: Hovering over any badge reveals:
   - Why the post received its score (exact signal-by-signal list with point values).
   - Extracted direct email addresses.
   - Extracted direct application URLs.
   - Direct Message (DM) requirement indicator.
4. **Quick In-Feed Action Buttons**:
   - 📋 **Copy**: Copies a clean, structured summary of the lead to your clipboard.
   - ✉️ **Email**: Opens Gmail with the recruiter email and a personalized cold outreach template pre-filled.
   - 🏷️ **Status Picker**: Update the lead's status in your CRM directly from your LinkedIn feed.

---

## 🗂️ Local CRM & Pipeline Management

LeadHunter includes a full-screen local CRM dashboard (`src/dashboard/dashboard.html`) and a quick-access browser popup (`src/popup/popup.html`).

### 1. Recruitment Pipeline Stages
Track every opportunity from discovery to offer:
- 🔵 **New**: Freshly detected leads waiting for review.
- 🟣 **Reviewed**: Evaluated and qualified for application.
- 🟡 **Contacted**: Cold outreach email or DM sent.
- 🟠 **Applied**: Official application submitted via portal or ATS.
- 🟢 **Replied**: Recruiter or hiring manager responded.
- 🎯 **Interview**: Interview rounds scheduled or in progress.
- 🔴 **Rejected**: Opportunity archived or closed.

### 2. Multi-Level Deduplication Engine
Prevents clutter when the same post appears multiple times in your feed:
- **Level 1**: Unique LinkedIn Activity URN / Post ID.
- **Level 2**: Recruiter's direct email address match.
- **Level 3**: Exact application URL match.  
*(When a repost is detected, LeadHunter preserves your existing status and notes, merges any new contact info, and bumps the update timestamp).*

### 3. Search, Filter & Organization
- **Full-Text Search**: Filter by role, company name, recruiter name, tech keyword, email, or post snippet.
- **Quick Filters**: Filter by pipeline status, "Has Direct Email", "Has Application Link", or "Hot Only".
- **Sorting**: Sort by Highest Score, Newest First, or Oldest First.
- **Lead Notes**: Attach custom notes to any lead (e.g., follow-up dates, interviewer names).

### 4. Data Export
- **Export to CSV**: Download your pipeline for Excel, Google Sheets, or Notion.
- **Export to JSON**: Download raw structured data for backups or custom scripts.

---

## ✉️ Email Outreach & Gmail Integration

LeadHunter streamlines cold job applications with automated draft generation:

1. **Dynamic Template Variables**: Customize your cold email with dynamic placeholders:
   - `{role}`: Automatically replaced with the detected job title (e.g. *Senior Angular Developer*).
   - `{company}`: Replaced with the company or poster's organization.
   - `{recruiter}`: Replaced with the poster's first name or "Hiring Team".
   - `{tech}`: Replaced with top matching technologies.
   - `{user_name}`, `{user_email}`, `{user_phone}`: Replaced with your user profile details.
2. **1-Click Gmail Web Compose**: Generates a standard web Gmail compose URL pre-populated with:
   - Recruiter's recipient email (`to`)
   - Subject line (`su`)
   - Full personalized email body (`body`)
3. **Email Tracker Compatibility**: Compatible with Chrome email tracking extensions such as **MailSuite / Mailtrack**.

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
├── test_engine.js             # Automated Node.js test suite for scoring & extraction
├── create_icons.js            # Standalone canvas icon generator
├── icons/                     # Extension icons (16x16, 48x48, 128x128)
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── src/
    ├── background/
    │   └── service-worker.js  # Background worker handling message routing & lifecycle
    ├── config/
    │   ├── defaults.js        # Default user profile, settings, and initial CRM state
    │   └── signals.js         # Comprehensive dictionary of hiring signals, phrases & weights
    ├── core/
    │   ├── extractor.js       # Regex extractors (emails, ATS URLs, DMs, metadata) & email builder
    │   ├── scoring.js         # Deterministic scoring algorithm & classification engine
    │   └── storage.js         # chrome.storage.local wrapper, CRUD, deduplication, CSV/JSON export
    ├── content/
    │   ├── content.js         # Passive DOM observer, feed parser, badge injector & overlays
    │   └── content.css        # In-feed badge styles, card highlights, popovers & animations
    ├── dashboard/
    │   ├── dashboard.html     # Full CRM & Settings interface
    │   ├── dashboard.js       # Dashboard pipeline controller, search, filters, drawer & settings
    │   └── dashboard.css      # Modern emerald/dark theme design system
    └── popup/
        ├── popup.html         # Quick popup widget
        ├── popup.js           # Popup controller & mini-feed summary
        └── popup.css          # Compact popup stylesheet
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
2. Scroll through your feed normally.
3. When a hiring post is detected, LeadHunter will display an in-feed score badge and highlight hot leads.
4. Click the LeadHunter extension icon in your toolbar or click **Open Dashboard** to manage your pipeline, review extracted leads, and send cold emails.

---

## 🧪 Running Automated Tests

LeadHunter includes a deterministic unit test suite to verify scoring accuracy, negative penalties, role detection, entity extraction, and structured output.

To execute the test suite:
```bash
node test_engine.js
```

### Test Suite Coverage
- ✅ **Test 1**: Hot Lead verification (Role + Hiring Intent + Direct Email + Apply URL).
- ✅ **Test 2**: Technology & DM verification (Framework keywords + DM instruction detection).
- ✅ **Test 3**: Negative Signal penalty test (`#opentowork` job-seeker post filtered out).
- ✅ **Test 4**: Hard Exclusion test (Strict rejection of unpaid/volunteer posts).
- ✅ **Test 5**: Email & URL extractor accuracy (Filters out false positives like `.png`, `example.com`).
- ✅ **Test 6**: 1-Click structured text clipboard formatting.

---

## 🔒 Privacy & LinkedIn Account Safety

- **100% Local Processing**: All evaluation, scoring, extraction, and lead storage happens entirely on your machine via `chrome.storage.local`. No data is sent to external servers.
- **Zero Account Risk**: LeadHunter does **not** use automated scrolling, headless browsing, synthetic clicks, or unauthorized private LinkedIn APIs. It simply reads the text content already rendered in your browser during your normal browsing sessions.
- **No Cloud AI / Zero API Cost**: Works without OpenAI, Gemini, or any paid API key. Runs on fast deterministic pattern-matching algorithms.

---

## 📄 License

MIT License. Free to use, modify, and distribute for personal and commercial job search workflows.
