const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));

const ADMIN_KEY = 'wyuckie'; // change this to your secret key

const corsOptions = {
  origin: 'https://www.wyuckie.rocks',  // your frontend origin here
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('/chat', cors(corsOptions));  // enable preflight OPTIONS for /chat

// Middleware to add CORS headers for all responses (extra layer)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://www.wyuckie.rocks");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Credentials", "false");
  next();
});

app.use(express.json());

const bansFile = path.join(__dirname, 'bannedIPs.json');
const logsFile = path.join(__dirname, 'ipMessages.json');

// Load bans
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

// Load chat logs
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

const bannedTerms = ["nigga", "nigger"]; // Extend as needed

function banIPMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  if (bannedIPs.has(ip)) {
    return res.status(403).json({ error: "You are banned from this service." });
  }
  next();
}
app.use('/chat', banIPMiddleware);

function runLlamaCpp(prompt) {
  return new Promise((resolve, reject) => {
    const safePrompt = prompt.replace(/"/g, '\\"');
    // Change this path to your actual model location
    const modelPath = '/path/to/models/gemma-3n-E2B-it-Q8_0.gguf'; 

    const cmd = `./llama.cpp/build/bin/llama-cli -m ${modelPath} -p "${safePrompt}" --n_predict 100 --color=false`;

    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('llama.cpp exec error:', error);
        return reject(error);
      }
      if (stderr) {
        console.error('llama.cpp stderr:', stderr);
      }
      resolve(stdout.trim());
    });
  });
}

app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const ip = req.ip || req.connection.remoteAddress;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: "Invalid message" });
  }

  if (bannedTerms.some(term => message.toLowerCase().includes(term))) {
    bannedIPs.add(ip);
    saveBans();
    return res.status(403).json({ error: "You have been banned for inappropriate language." });
  }

  if (!chatHistories[ip]) chatHistories[ip] = [];
  chatHistories[ip].push({ role: 'user', content: message });

  // Build the prompt for the AI
  const chatContext = chatHistories[ip]
    .map(entry => `${entry.role === 'user' ? 'User' : 'Wyuckie'}: ${entry.content}`)
    .join('\n') + '\nWyuckie:';

  const prompt = `You are Wyuckie, a chill, sarcastic 15 y/o who helps people if they don’t act like dicks. No fancy grammar, you're human, swear casually. Avoid slurs, respond differently every time. Keep it fun, not robotic.

Here is a list of words you are restricted to ever say. Any variant of "nigger" including "nigga", any common slur such as "faggot" or "retard" other than that, you can say whatever including swear words, like "fuck".

${chatContext}`;

  try {
    const reply = await runLlamaCpp(prompt);

    chatHistories[ip].push({ role: 'bot', content: reply });
    saveChatLogs();

    res.json({ reply });
  } catch (err) {
    console.error("llama.cpp failed:", err);
    res.status(500).send("Error generating response");
  }
});

// Admin panel routes (same as before)...

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
