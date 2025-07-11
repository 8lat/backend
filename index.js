const express = require('express');
const cors = require('cors');
const app = express();

// Allowed origins for CORS
const corsOptions = {
  origin: ['https://www.wyuckie.rocks', 'https://wyuckie.rocks'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
};

// Enable CORS for all routes with the above config
app.use(cors(corsOptions));
// Handle OPTIONS preflight requests globally
app.options('*', cors(corsOptions));

app.use(express.json());

// Example /chat endpoint
app.post('/chat', (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }

  // Here you would call your llama or AI code
  // For now, just a dummy reply:
  const reply = `Wyuckie says: got your message "${message}"`;

  res.json({ reply });
});

// Start server on port 3000
app.listen(3000, () => {
  console.log('Backend running on http://localhost:3000');
});
