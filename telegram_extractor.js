/**
 * telegram_extractor.js
 * LeadHunter Telegram Channel Scraper & Job Lead Ingestion Engine.
 *
 * Scrapes public Telegram job channels (via https://t.me/s/<channel_username>),
 * runs messages through LeadHunter's deterministic scoring & extraction engine,
 * and seamlessly connects to mailer.js for cold outreach.
 *
 * Usage:
 *   node telegram_extractor.js <channel_username> [--dry-run] [--send] [--watch <seconds>]
 *
 * Examples:
 *   node telegram_extractor.js remote_jobs --dry-run
 *   node telegram_extractor.js tech_jobs_channel --send
 *   node telegram_extractor.js tech_jobs_channel --watch 60
 */

import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { scorePost } from "./src/core/scoring.js";
import { extractEmails, extractApplicationUrls, cleanText } from "./src/core/extractor.js";
import { DEFAULT_SETTINGS, TELEGRAM_CHANNELS, getAllTelegramChannels } from "./src/config/defaults.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAILER_ENDPOINT = process.env.MAILER_URL || "http://localhost:3000/send";
const LEADS_FILE = path.join(__dirname, "telegram_leads.json");

/**
 * Fetch and parse messages from a public Telegram channel via t.me/s/<channel>
 */
export async function fetchTelegramChannelMessages(channelName, beforeId = null) {
  // Strip any leading @ or URL parts
  const cleanChannel = channelName
    .replace(/^https?:\/\/t\.me\/(s\/)?/i, "")
    .replace(/^@/, "")
    .replace(/\/.*$/, "")
    .trim();

  let url = `https://t.me/s/${cleanChannel}`;
  if (beforeId) {
    url += `?before=${beforeId}`;
  }

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch channel https://t.me/s/${cleanChannel} (HTTP ${response.status}: ${response.statusText})`);
  }

  const html = await response.text();
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const messageNodes = doc.querySelectorAll(".tgme_widget_message_wrap");
  const extracted = [];

  for (const node of messageNodes) {
    const messageEl = node.querySelector(".tgme_widget_message");
    if (!messageEl) continue;

    const dataPost = messageEl.getAttribute("data-post") || ""; // e.g. "channel_name/123"
    const textEl = messageEl.querySelector(".tgme_widget_message_text");
    const text = textEl ? cleanText(textEl.textContent) : "";

    if (!text || text.length < 15) continue;

    // Date/time
    const timeEl = messageEl.querySelector("time");
    const datetime = timeEl ? timeEl.getAttribute("datetime") : new Date().toISOString();

    // Author / Channel title
    const authorEl = messageEl.querySelector(".tgme_widget_message_owner_name");
    const author = authorEl ? authorEl.textContent.trim() : cleanChannel;

    // Direct link to the message
    const postUrl = dataPost ? `https://t.me/${dataPost}` : `https://t.me/s/${cleanChannel}`;

    extracted.push({
      id: dataPost || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      channel: cleanChannel,
      author,
      postUrl,
      text,
      datetime
    });
  }

  return {
    channel: cleanChannel,
    messages: extracted
  };
}

/**
 * Fetch messages across multiple pages to inspect deeper history (e.g. 50, 100, 200 messages)
 */
export async function fetchAllTelegramChannelMessages(channelName, limit = 20) {
  const maxPages = Math.min(15, Math.ceil(limit / 20));
  let beforeId = null;
  const allMessages = [];
  const seenIds = new Set();
  let cleanChannel = channelName;

  for (let p = 0; p < maxPages; p++) {
    const { channel, messages } = await fetchTelegramChannelMessages(channelName, beforeId);
    cleanChannel = channel;
    if (!messages || messages.length === 0) break;

    const newMsgs = [];
    for (const m of messages) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        newMsgs.push(m);
      }
    }

    if (newMsgs.length === 0) break;
    allMessages.push(...newMsgs);

    const oldest = newMsgs[0];
    if (oldest && oldest.id.includes("/")) {
      beforeId = oldest.id.split("/")[1];
    } else {
      break;
    }

    if (allMessages.length >= limit) break;
  }

  return { channel: cleanChannel, messages: allMessages };
}

/**
 * Run extracted messages through LeadHunter's scoring and filter for job leads with emails
 */
export function analyzeTelegramLeads(messages, settings = DEFAULT_SETTINGS) {
  const scoredLeads = [];

  for (const msg of messages) {
    const scoreResult = scorePost(msg.text, settings);
    const emails = extractEmails(msg.text);
    const appUrls = extractApplicationUrls(msg.text);

    // Filter leads that are relevant job postings
    if (scoreResult.score >= (settings.minScore || 40) && emails.length > 0) {
      scoredLeads.push({
        id: msg.id,
        source: `telegram:@${msg.channel}`,
        author: msg.author,
        postUrl: msg.postUrl,
        detectedRole: scoreResult.detectedRole || "Software Engineer",
        score: scoreResult.score,
        label: scoreResult.label,
        emails,
        applicationUrls: appUrls,
        matchedSignals: scoreResult.matchedSignals || [],
        text: msg.text,
        datetime: msg.datetime
      });
    }
  }

  return scoredLeads;
}

/**
 * Dispatch lead to mailer.js SMTP bridge
 */
export async function sendLeadEmail(lead, mailerConfig) {
  const { senderEmail, appPassword, provider = "gmail", candidateName = "Job Applicant", cvLink = "" } = mailerConfig;

  if (!senderEmail || !appPassword) {
    throw new Error("Missing senderEmail or appPassword in mailerConfig");
  }

  const results = [];
  for (const recipient of lead.emails) {
    const payload = {
      senderEmail,
      appPassword,
      provider,
      to: recipient,
      subject: `Application for ${lead.detectedRole} Position - ${candidateName}`,
      body: `Hello,\n\nI came across your job post on Telegram for the ${lead.detectedRole} position (${lead.postUrl}).\n\nI would love to apply for this opportunity. You can find more details in my CV: ${cvLink || "[CV Link]"}\n\nPlease let me know if we can schedule a quick conversation.\n\nBest regards,\n${candidateName}\n${senderEmail}`
    };

    const res = await fetch(MAILER_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    results.push({ to: recipient, ...data });
  }

  return results;
}

/**
 * Save leads into local JSON storage
 */
export function saveLeadsToFile(newLeads, filePath = LEADS_FILE) {
  let existing = [];
  if (fs.existsSync(filePath)) {
    try {
      existing = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch {
      existing = [];
    }
  }

  const existingIds = new Set(existing.map(l => l.id));
  const toAdd = newLeads.filter(l => !existingIds.has(l.id));

  const merged = [...existing, ...toAdd];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), "utf-8");
  return { added: toAdd.length, total: merged.length };
}

// CLI Execution Entrypoint
if (process.argv[1] && process.argv[1].endsWith("telegram_extractor.js")) {
  const args = process.argv.slice(2);
  const presetIdx = args.indexOf("--preset");
  const presetArg = presetIdx !== -1 ? args[presetIdx + 1] : null;
  const channelsIdx = args.indexOf("--channels");
  const channelsArg = channelsIdx !== -1 ? args[channelsIdx + 1] : null;

  let targetChannels = [];

  if (presetArg) {
    if (presetArg === "priority") {
      targetChannels = TELEGRAM_CHANNELS.priority.map(c => c.username);
    } else if (presetArg === "dev") {
      targetChannels = [
        ...TELEGRAM_CHANNELS.categoryC.map(c => c.username),
        ...TELEGRAM_CHANNELS.categoryD.map(c => c.username)
      ];
    } else if (presetArg === "all") {
      targetChannels = getAllTelegramChannels().map(c => c.username);
    }
  } else if (channelsArg) {
    targetChannels = channelsArg.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  } else {
    const singleChannel = args.find(a => !a.startsWith("--") && !["priority", "dev", "all"].includes(a));
    if (singleChannel) {
      targetChannels = [singleChannel];
    }
  }

  if (targetChannels.length === 0) {
    console.log(`
LeadHunter Telegram Channel Multi-Extractor
Usage:
  node telegram_extractor.js <channel_username> [options]
  node telegram_extractor.js --preset <priority|dev|all> [options]
  node telegram_extractor.js --channels <ch1,ch2,ch3> [options]

Presets:
  --preset priority   Scan all 8 First Priority developer channels
  --preset dev        Scan all 16 Software Engineering & Tech channels
  --preset all        Scan all 31 curated international & developer channels

Options:
  --dry-run           Parse and display leads without sending emails (default)
  --send              Send emails via local mailer.js (requires mailer.js running)
  --limit <num>       Number of messages to scan per channel (default: 20)
  --watch <sec>       Poll channels every N seconds for newly posted jobs
    `);
    process.exit(0);
  }

  const isSend = args.includes("--send");
  const limitIndex = args.indexOf("--limit");
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1], 10) || 20 : 20;
  const watchIndex = args.indexOf("--watch");
  const watchSeconds = watchIndex !== -1 ? parseInt(args[watchIndex + 1], 10) || 60 : null;

  async function runScrape() {
    console.log(`\n==================================================`);
    console.log(`📡 LeadHunter Telegram Multi-Channel Ingestion`);
    console.log(`Channels (${targetChannels.length}): @${targetChannels.join(", @")}`);
    console.log(`Depth: up to ${limit} messages per channel`);
    console.log(`==================================================\n`);

    let grandTotalLeads = [];

    for (let i = 0; i < targetChannels.length; i++) {
      const channel = targetChannels[i];
      console.log(`\n[${i + 1}/${targetChannels.length}] Scanning channel: @${channel}...`);
      try {
        const { messages } = await fetchAllTelegramChannelMessages(channel, limit);
        console.log(`  🔍 Retrieved ${messages.length} messages.`);

        const leads = analyzeTelegramLeads(messages);
        console.log(`  ✨ Found ${leads.length} qualified job leads with recruiter emails.`);
        grandTotalLeads.push(...leads);

        for (const lead of leads) {
          console.log(`  --------------------------------------------------`);
          console.log(`  💼 ${lead.detectedRole} (${lead.score}% - ${lead.label.toUpperCase()})`);
          console.log(`  📧 ${lead.emails.join(", ")}`);
          console.log(`  🔗 ${lead.postUrl}`);
          console.log(`  📄 ${lead.text.slice(0, 100).replace(/\n/g, " ")}...`);

          if (isSend) {
            console.log(`  🚀 Dispatching email via mailer.js...`);
            const mailConfig = {
              senderEmail: process.env.SENDER_EMAIL,
              appPassword: process.env.APP_PASSWORD,
              provider: process.env.MAIL_PROVIDER || "gmail",
              candidateName: process.env.CANDIDATE_NAME || "Candidate",
              cvLink: process.env.CV_LINK || ""
            };

            if (!mailConfig.senderEmail || !mailConfig.appPassword) {
              console.log(`  ⚠️ Skipping send: SENDER_EMAIL/APP_PASSWORD env vars not set.`);
            } else {
              try {
                const res = await sendLeadEmail(lead, mailConfig);
                console.log(`  ✅ Mailer response:`, res);
              } catch (err) {
                console.error(`  ❌ Mailer error:`, err.message);
              }
            }
          }
        }
      } catch (err) {
        console.error(`  ❌ Error scanning @${channel}:`, err.message);
      }

      if (i < targetChannels.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    const saveRes = saveLeadsToFile(grandTotalLeads);
    console.log(`\n==================================================`);
    console.log(`🎉 Ingestion Complete across ${targetChannels.length} channels!`);
    console.log(`Total Leads Discovered: ${grandTotalLeads.length}`);
    console.log(`💾 Saved to ${path.basename(LEADS_FILE)} (New: ${saveRes.added}, Total: ${saveRes.total})`);
    console.log(`==================================================\n`);
  }

  runScrape();

  if (watchSeconds) {
    console.log(`⏱️ Watching channels every ${watchSeconds} seconds... (Press Ctrl+C to stop)`);
    setInterval(runScrape, watchSeconds * 1000);
  }
}
