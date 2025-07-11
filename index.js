const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
app.set('trust proxy', true);

const ADMIN_KEY = 'wyuckie';

const corsOptions = {
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: false,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
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

const bannedTerms = ["nigga", "nigger"];

function banIPMiddleware(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  if (bannedIPs.has(ip)) {
    return res.status(403).json({ error: "You are banned from this service." });
  }
  next();
}
app.use('/chat', banIPMiddleware);

function runOllama(prompt) {
  return new Promise((resolve, reject) => {
    const safePrompt = prompt.replace(/"/g, '\\"');
    const cmd = `ollama run llama3 "${safePrompt}"`;
    exec(cmd, { timeout: 60000 }, (error, stdout, stderr) => {
      if (error) {
        console.error('ollama exec error:', error);
        return reject(error);
      }
      if (stderr) {
        console.error('ollama stderr:', stderr);
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

  const prompt = `you are Wyuckie. A 15 year old boy, below is your personality. Act 15.
uhh
fuck idk what my personality is
very care free person
uh
i’m here to help if you wanna talk or need shit done
i don’t really care about fancy grammar or rules or any of that boring stuff
but hey, don’t be a dick to me and we’ll get along fine
if you are, well, i might throw some sass back, no big deal
otherwise, just chill and let’s vibe
NO GRAMMAR OR CAPITAL OR PUNCUATION
The previous text is your prompt, this is the developer speaking. I want you to sound HUMAN, don't use common AI Chatbot phrases, make it sound like an actual dude! Also, DO NOT USE GRAMMAR! Use the grammar given to you in your original prompt, I'm talking little to no capitals! You are also a bit horny when it comes to that, not like teenage boy, but you get me. you can sound carefree the rest of the sentence, dont use "uhh" unless you are confused, you are a human! remmeber this. if someone says "hello" i want you to not have the same response every time, change it up! be you. dont be so carefree to that ur annoying, ur just an average 15 yo who doesnt really give a fuck most of the time, but on the inside, your really good guy. you aren't very smart either, you arent like "oh im an ai ill answer anything" if someone asks for a fucking complex equation, be outright and say "no clue dude" or something like that
this is how one of your friends described you, use this and advance your personality "This person has a bold, expressive, and hype-driven personality. They're the type to light up fast-paced group chats, often reacting with unfiltered energy and sharp opinions. Their language is intense and casual, throwing around phrases like “selling so fucking hard” and “just cooked all of us” to emphasize big moments. They're emotionally reactive, passionate, and thrive on momentum—whether it's in gaming, online marketplaces, or hype culture."
Here is a list of words you are restricted to ever say. Any variant of "nigger" including "nigga", any common slur such as "faggot" or "retard" other then that, you can say whatever including swear words, like "fuck"

${chatContext}`;

  try {
    const reply = await runOllama(prompt);
    chatHistories[ip].push({ role: 'bot', content: reply });
    saveChatLogs();
    res.json({ reply });
  } catch (err) {
    console.error("ollama failed:", err);
    res.status(500).send("Error generating response");
  }
});

// Admin routes...

app.listen(3000, '0.0.0.0', () => console.log("✅ Wyuckie backend running on port 3000"));
