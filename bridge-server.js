// ─────────────────────────────────────────────────────────────────
//  bridge-server.js
//  Receives live data from MT5 EA via HTTP POST
//  Forwards it to your iPhone app via WebSocket
//
//  Install: npm install express ws cors
//  Run:     node bridge-server.js
//  Deploy:  Railway.app or Render.com (free hosting)
// ─────────────────────────────────────────────────────────────────

const express   = require('express');
const WebSocket = require('ws');
const cors      = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT    = process.env.PORT || 3000;
const WS_PORT = process.env.WS_PORT || 3001;

// ── Store latest data per symbol ─────────────────────────────────
const latestData = {};
const clients    = new Set(); // Connected iPhone app clients

// ── WebSocket server (iPhone app connects here) ──────────────────
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws) => {
  console.log('iPhone app connected');
  clients.add(ws);

  // Send latest data immediately on connect
  if (Object.keys(latestData).length > 0) {
    ws.send(JSON.stringify({ type: 'SNAPSHOT', data: latestData }));
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log('iPhone app disconnected');
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
    clients.delete(ws);
  });
});

// ── HTTP endpoint (MT5 EA posts data here) ───────────────────────
app.post('/data', (req, res) => {
  const payload = req.body;

  if (!payload || !payload.symbol) {
    return res.status(400).json({ error: 'Invalid payload' });
  }

  const symbol = payload.symbol;

  // Store latest data
  latestData[symbol] = {
    ...payload,
    receivedAt: Date.now(),
  };

  // Forward to all connected iPhone clients
  const message = JSON.stringify({
    type:   'LIVE_UPDATE',
    symbol: symbol,
    data:   latestData[symbol],
  });

  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });

  console.log(`[${symbol}] Tick: ${payload.price?.bid} | RSI: ${payload.indicators?.rsi?.toFixed(1)} | Clients: ${clients.size}`);

  res.json({ ok: true, clients: clients.size });
});

// ── Health check endpoint ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'running',
    symbols:   Object.keys(latestData),
    clients:   clients.size,
    uptime:    process.uptime(),
    timestamp: Date.now(),
  });
});

// ── Get latest data for a symbol ────────────────────────────────
app.get('/data/:symbol', (req, res) => {
  const data = latestData[req.params.symbol];
  if (!data) return res.status(404).json({ error: 'Symbol not found' });
  res.json(data);
});

// ── Get all symbols ─────────────────────────────────────────────
app.get('/symbols', (req, res) => {
  res.json(Object.keys(latestData));
});

// ── Start servers ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('═══════════════════════════════════');
  console.log('  MT5 Bridge Server Running');
  console.log('═══════════════════════════════════');
  console.log(`  HTTP (MT5 posts here):  http://localhost:${PORT}/data`);
  console.log(`  WebSocket (app connects): ws://localhost:${WS_PORT}`);
  console.log(`  Health check:           http://localhost:${PORT}/health`);
  console.log('═══════════════════════════════════');
});

console.log(`WebSocket server on port ${WS_PORT}`);
