const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');  // npm i node-fetch@2

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));

const ADMIN_KEY = 'wyuckie'; // your admin key

const corsOptions = {
  origin: '*',  // allow all origins, change if needed
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('/chat', cors(corsOptions));

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Credentials", "false");
  next();
});

app.use(express.json());

const bansFile = path.join(__dirname, 'bannedIPs.json');
const logsFile = path.join(__dirname, 'ipMessages.json');

let bannedIPs = new Set();
try {
  if (fs.existsSync(bansFile)) {
    bannedIPs = new Set(JSON.parse(fs.readFileSync(bansFile)));
  }
} catch (err) {
  console.error('Error loading bans:', err);
}
function saveBans() {
  fs.writeFileSync(bansFile, JSON.stringify([...bannedIPs], null, 2));
}

let chatHistories = {};
try {
  if (fs.existsSync(logsFile)) {
    chatHistories = JSON.parse(fs.readFileSync(logsFile));
  }
} catch (err) {
  console.error('Error loading chat logs:', err);
}
function saveChatLogs() {
  fs.writeFileSync(logsFile, JSON.stringify(chatHistories, null, 2));
}

const bannedTerms = ["nigga", "nigger"]; // banned words

function banIPMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  if (bannedIPs.has(ip)) {
    return res.status(403).json({ error: "You are banned from this service." });
  }
  next();
}
app.use('/chat', banIPMiddleware);

// Replace this with your llama-server URL:
const LLAMA_SERVER_URL = 'http://localhost:11434/v1/chat/completions';

async function queryLlamaServer(prompt) {
  const body = {
    model: "gemma-3n-E2B-it-Q8_0", // your model name on llama server
    messages: [
      { role: "system", content: "You are Wyuckie, a chill, sarcastic 15 y/o who helps people if they don’t act like dicks. No fancy grammar, you're human, swear casually. Avoid slurs, respond differently every time. Keep it fun, not robotic." },
      { role: "user", content: prompt }
    ],
    max_tokens: 100,
    temperature: 0.7,
  };

  const response = await fetch(LLAMA_SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Llama server error: ${response.statusText}`);
  }

  const data = await response.json();

  // Adjust depending on llama server response structure
  // Example: data.choices[0].message.content
  return data.choices && data.choices[0] && data.choices[0].message.content
    ? data.choices[0].message.content.trim()
    : "No response from model.";
}

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: "Invalid message" });
  }

  // Ban check for bad words
  if (bannedTerms.some(term => message.toLowerCase().includes(term))) {
    bannedIPs.add(ip);
    saveBans();
    return res.status(403).json({ error: "You have been banned for inappropriate language." });
  }

  if (!chatHistories[ip]) chatHistories[ip] = [];
  chatHistories[ip].push({ role: 'user', content: message });

  // Build chat history context for prompt if you want, or just pass message as is.
  // For now, just send current message to llama server.
  try {
    const reply = await queryLlamaServer(message);

    chatHistories[ip].push({ role: 'bot', content: reply });
    saveChatLogs();

    res.json({ reply });
  } catch (err) {
    console.error("Llama server request failed:", err);
    res.status(500).json({ error: "Error generating response" });
  }
});

// Admin panel & ban/unban routes (same as before, I can add them if you want)

app.get('/admin', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).send("Unauthorized: Invalid key");

  let html = `
  <html>
  <head>
    <title>Wyuckie Admin Panel</title>
    <style>
      body {
        background: #111;
        color: #eee;
        font-family: 'Segoe UI', sans-serif;
        padding: 30px;
      }
      h1 {
        font-size: 2rem;
        color: #fff;
        border-bottom: 2px solid red;
        padding-bottom: 10px;
      }
      .ip-block {
        background: #1a1a1a;
        border-left: 4px solid red;
        padding: 20px;
        margin-bottom: 20px;
        border-radius: 8px;
      }
      .ip-block strong {
        font-size: 1.2rem;
        color: #fff;
      }
      .banned {
        color: #ff5e5e;
        margin-left: 10px;
      }
      button {
        background: #e50914;
        color: white;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        cursor: pointer;
        margin-top: 10px;
        margin-right: 10px;
        font-weight: bold;
      }
      button:hover {
        background: #ff2020;
      }
      .message-log {
        background: #2b2b2b;
        margin-top: 10px;
        padding: 10px 15px;
        border-radius: 8px;
        display: none;
      }
      .message-log p {
        margin: 6px 0;
        font-size: 0.95rem;
      }
      .buttons {
        margin-top: 12px;
      }
      form {
        display: inline;
      }
    </style>
  </head>
  <body>
    <h1>Wyuckie Admin Panel</h1>
  `;

  Object.entries(chatHistories).forEach(([ip, messages]) => {
    const banned = bannedIPs.has(ip);
    html += `<div class="ip-block">
      <strong>${ip}</strong> ${banned ? '<span class="banned">(BANNED)</span>' : ''}
      <div class="buttons">
        <button onclick="toggleLog('${ip}')">Toggle Messages</button>
        <form method="POST" action="/admin/${banned ? 'unban' : 'ban'}">
          <input type="hidden" name="ip" value="${ip}" />
          <input type="hidden" name="key" value="${ADMIN_KEY}" />
          <button type="submit">${banned ? 'Unban' : 'Ban'}</button>
        </form>
      </div>
      <div class="message-log" id="${ip}">
        ${messages.map(m => `<p><strong>${m.role}:</strong> ${m.content}</p>`).join('')}
      </div>
    </div>`;
  });

  html += `
    <script>
      function toggleLog(ip) {
        const el = document.getElementById(ip);
        el.style.display = el.style.display === 'block' ? 'none' : 'block';
      }
    </script>
  </body></html>`;
  res.send(html);
});

app.post('/admin/ban', (req, res) => {
  const { ip, key } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).send("Unauthorized");
  bannedIPs.add(ip);
  saveBans();
  res.redirect(`/admin?key=${ADMIN_KEY}`);
});

app.post('/admin/unban', (req, res) => {
  const { ip, key } = req.body;
  if (key !== ADMIN_KEY) return res.status(401).send("Unauthorized");
  bannedIPs.delete(ip);
  saveBans();
  res.redirect(`/admin?key=${ADMIN_KEY}`);
});

app.listen(3000, '0.0.0.0', () => console.log("✅ Wyuckie backend running on port 3000"));
