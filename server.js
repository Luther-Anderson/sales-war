const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ─── Config ───────────────────────────────────────────────────────────────────

const AE_OWNERS = {
  '76991650': 'Alberto',
  '40312105': 'Célia',
  '84528640': 'Jakob',
  '87073113': 'Manuel',
};

const WAR_START = new Date('2026-04-08T09:30:00+02:00').getTime();
const WAR_END   = new Date('2026-04-08T13:30:00+02:00').getTime();
const POINTS    = { attempt: 1, connected: 5, meeting: 25 };

// ─── State & SSE ─────────────────────────────────────────────────────────────

let currentData = {
  leaderboard: Object.entries(AE_OWNERS).map(([id, name]) => ({
    id, name, attempts: 0, connected: 0, meetings: 0, score: 0,
  })),
  updatedAt: null,
  error: null,
  warStart: WAR_START,
  warEnd: WAR_END,
  points: POINTS,
};

const clients = new Set();

function broadcast(data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(payload);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/api/data', (req, res) => res.json(currentData));

// Claude pushes aggregated data here after fetching from HubSpot MCP
app.post('/api/push', (req, res) => {
  const { leaderboard, error } = req.body;

  if (leaderboard) {
    // Sort by score desc, then meetings desc
    leaderboard.sort((a, b) => b.score - a.score || b.meetings - a.meetings);
    currentData = { ...currentData, leaderboard, updatedAt: Date.now(), error: null };
    console.log(`[${new Date().toLocaleTimeString()}] Updated — ${leaderboard.map(ae => `${ae.name}:${ae.score}pts`).join(', ')}`);
  } else if (error) {
    currentData = { ...currentData, error, updatedAt: Date.now() };
    console.error(`[${new Date().toLocaleTimeString()}] Error pushed: ${error}`);
  } else {
    return res.status(400).json({ ok: false, message: 'Provide leaderboard or error' });
  }

  broadcast(currentData);
  res.json({ ok: true });
});

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write(`data: ${JSON.stringify(currentData)}\n\n`);
  clients.add(res);
  req.on('close', () => clients.delete(res));
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  const now = Date.now();
  const minsToStart = Math.round((WAR_START - now) / 60000);
  const started = now >= WAR_START && now <= WAR_END;
  const ended   = now > WAR_END;

  console.log(`\n🏆  Sales War Dashboard`);
  console.log(`   http://0.0.0.0:${PORT}  (share your local IP with the team)`);
  console.log(`   Run: ipconfig getifaddr en0  to get your IP\n`);
  console.log(`   Waiting for Claude to push data via POST /api/push\n`);

  if (ended)        console.log('   War has ended. Showing final results.\n');
  else if (started) console.log('   War is LIVE!\n');
  else              console.log(`   War starts in ${minsToStart} min.\n`);
});
