/**
 * mailer.js
 * Lightweight local SMTP Bridge for LeadHunter.
 * Uses nodemailer to deliver 100% silent cold emails via your Gmail & Hotmail App Passwords.
 */

import http from "http";
import nodemailer from "nodemailer";

const PORT = process.env.PORT || 3000;

function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function autoFormatHtmlWithCvLink(body) {
  if (!body) return "";

  const escapeHtml = (str) => {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  // Find Google Drive or general URLs
  const driveUrlRegex = /(https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s<]+)/gi;

  const paragraphs = body.split(/\r?\n\r?\n/).map(para => {
    let cleanPara = escapeHtml(para.trim());

    // Convert Drive links to clickable CV links
    cleanPara = cleanPara.replace(driveUrlRegex, (url) => {
      return `<a href="${url}" target="_blank" style="color: #0a66c2; text-decoration: underline; font-weight: 600;">Google Drive CV</a>`;
    });

    // Attach CV link to "in my CV" if not already linked
    cleanPara = cleanPara.replace(/\bin my CV\b/gi, (match) => {
      return match;
    });

    cleanPara = cleanPara.replace(/\r?\n/g, "<br>");
    cleanPara = cleanPara.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, '<a href="mailto:$1" style="color: #0a66c2; text-decoration: none;">$1</a>');

    return `<p style="margin: 0 0 16px 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b;">${cleanPara}</p>`;
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1e293b; background-color: #ffffff;">
  <div style="max-width: 600px; padding: 20px 0;">
${paragraphs.join("\n")}
  </div>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check endpoint
  if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, message: "LeadHunter Local SMTP Bridge is Active", timestamp: Date.now() }));
    return;
  }

  // Email dispatch endpoint
  if (req.method === "POST" && req.url === "/send") {
    let bodyData = "";
    req.on("data", chunk => {
      bodyData += chunk;
    });

    req.on("end", async () => {
      try {
        const payload = JSON.parse(bodyData || "{}");
        const { senderEmail, appPassword, provider, to, replyTo, subject, body, html, attachments } = payload;

        if (!senderEmail || !appPassword || !to || !subject || !body) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            success: false,
            error: "Missing required fields: senderEmail, appPassword, to, subject, and body are mandatory."
          }));
          return;
        }

        const cleanPass = String(appPassword).replace(/\s+/g, "");
        const isOutlook = provider === "outlook" || senderEmail.includes("hotmail") || senderEmail.includes("outlook");

        let transporterConfig;
        if (isOutlook) {
          transporterConfig = {
            host: "smtp-mail.outlook.com",
            port: 587,
            secure: false,
            auth: {
              user: senderEmail,
              pass: cleanPass
            },
            tls: {
              ciphers: "SSLv3",
              rejectUnauthorized: false
            }
          };
        } else {
          transporterConfig = {
            host: "smtp.gmail.com",
            port: 465,
            secure: true,
            auth: {
              user: senderEmail,
              pass: cleanPass
            }
          };
        }

        const transporter = nodemailer.createTransport(transporterConfig);

        console.log(`📡 [LeadHunter Bridge] Dispatching email from ${senderEmail} to ${to}...`);

        const mailOptions = {
          from: senderEmail,
          to,
          replyTo: replyTo || "suptokhan24@gmail.com",
          subject,
          text: body
        };

        if (html) {
          mailOptions.html = html;
        } else if (body) {
          mailOptions.html = autoFormatHtmlWithCvLink(body);
        }

        if (attachments && Array.isArray(attachments) && attachments.length > 0) {
          mailOptions.attachments = attachments.map(att => {
            const item = { filename: att.filename || "CV.pdf" };
            if (att.content) {
              item.content = att.content;
              item.encoding = att.encoding || "base64";
            } else if (att.path) {
              item.path = att.path;
            }
            if (att.contentType) item.contentType = att.contentType;
            return item;
          });
        }

        const info = await transporter.sendMail(mailOptions);

        console.log(`✅ [LeadHunter Bridge] Delivered successfully! MessageId: ${info.messageId}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: true,
          messageId: info.messageId,
          response: info.response
        }));
      } catch (err) {
        console.error(`❌ [LeadHunter Bridge Error]:`, err.message);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          success: false,
          error: err.message || "Failed to send email via SMTP"
        }));
      }
    });
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Endpoint not found" }));
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🚀 LeadHunter Local SMTP Bridge Running on http://localhost:${PORT}`);
  console.log(`⚡ Ready to dispatch cold emails silently in the background!`);
  console.log(`======================================================\n`);
});
