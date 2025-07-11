const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));

const ADMIN_KEY = 'wyuckie'; // Change this to a secret key

const corsOptions = {
  origin: 'https://www.wyuckie.rocks',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('/chat', cors(corsOptions));

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

const bannedTerms = ["nigga", "nigger", "faggot", "retard"]; // Extend as needed

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
    const cmd = `./llama.cpp/build/bin/llama-run -m ./llama.cpp/models/gemma-3n-E2B-it-Q8_0.gguf -p "${safePrompt}" --n-predict=100 --color=false`;

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

  const chatContext = chatHistories[ip]
    .map(entry => `${entry.role === 'user' ? 'User' : 'Wyuckie'}: ${entry.content}`)
    .join('\n') + '\nWyuckie:';

  const prompt = `You are Wyuckie, a chill, sarcastic 15 y/o who helps people if they don’t act like dicks. No fancy grammar, you're human, swear casually. Avoid slurs, respond differently every time. Keep it fun, not robotic.

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

app.get('/admin', (req, res) => {
  const key = req.query.key;
  if (key !== ADMIN_KEY) return res.status(401).send("Unauthorized");

  let html = `<html><head><title>Admin</title></head><body><h1>Bans & Logs</h1>`;
  Object.entries(chatHistories).forEach(([ip, messages]) => {
    const banned = bannedIPs.has(ip);
    html += `<div><strong>${ip}</strong> ${banned ? '<span style="color:red;">(BANNED)</span>' : ''}
    <form method="POST" action="/admin/${banned ? 'unban' : 'ban'}">
    <input type="hidden" name="ip" value="${ip}" />
    <input type="hidden" name="key" value="${ADMIN_KEY}" />
    <button type="submit">${banned ? 'Unban' : 'Ban'}</button></form>
    <details><summary>Messages</summary><ul>
    ${messages.map(m => `<li><strong>${m.role}</strong>: ${m.content}</li>`).join('')}
    </ul></details></div><hr/>`;
  });

  html += `</body></html>`;
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
