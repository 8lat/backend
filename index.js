const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// --- CORS ---
app.use(cors({
  origin: 'https://www.wyuckie.rocks',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

// --- Ban & Chat Logs ---
const bansFile = path.join(__dirname, 'bannedIPs.json');
const logsFile = path.join(__dirname, 'ipMessages.json');

let bannedIPs = new Set(fs.existsSync(bansFile) ? JSON.parse(fs.readFileSync(bansFile)) : []);
let chatHistories = fs.existsSync(logsFile) ? JSON.parse(fs.readFileSync(logsFile)) : {};

function saveBans() {
  fs.writeFileSync(bansFile, JSON.stringify([...bannedIPs], null, 2));
}

function saveChatLogs() {
  fs.writeFileSync(logsFile, JSON.stringify(chatHistories, null, 2));
}

const bannedTerms = ["nigga", "nigger"];

app.use('/chat', (req, res, next) => {
  const ip = req.ip;
  if (bannedIPs.has(ip)) {
    return res.status(403).json({ error: "You are banned." });
  }
  next();
});

// --- Use Ollama ---
const { spawn } = require('child_process');
function runLlama3(prompt) {
  return new Promise((resolve, reject) => {
    const ollama = spawn('ollama', ['run', 'llama3'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let output = '';
    ollama.stdout.on('data', data => { output += data.toString(); });
    ollama.stderr.on('data', data => console.error('[ollama]', data.toString()));
    ollama.on('error', err => reject(err));
    ollama.on('close', () => resolve(output.trim()));

    ollama.stdin.write(prompt);
    ollama.stdin.end();
  });
}

// --- /chat endpoint ---
app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const ip = req.ip;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: "Invalid message" });
  }

  if (bannedTerms.some(term => message.toLowerCase().includes(term))) {
    bannedIPs.add(ip);
    saveBans();
    return res.status(403).json({ error: "You are banned." });
  }

  chatHistories[ip] = chatHistories[ip] || [];
  chatHistories[ip].push({ role: 'user', content: message });

  const chatContext = chatHistories[ip].map(m => `${m.role === 'user' ? 'User' : 'Wyuckie'}: ${m.content}`).join('\n') + '\nWyuckie:';
  const prompt = `you are Wyuckie...\n${chatContext}`;

  try {
    const reply = await runLlama3(prompt);
    chatHistories[ip].push({ role: 'bot', content: reply });
    saveChatLogs();
    res.json({ reply });
  } catch (err) {
    console.error('Ollama error:', err);
    res.status(500).send('Internal Server Error');
  }
});

// --- Start Server ---
app.listen(3000, () => console.log('✅ Backend running on port 3000'));
