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
        const { senderEmail, appPassword, provider, to, replyTo, subject, body } = payload;

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

        const info = await transporter.sendMail({
          from: senderEmail,
          to,
          replyTo: replyTo || "suptokhan24@gmail.com",
          subject,
          text: body
        });

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
