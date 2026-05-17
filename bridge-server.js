// ─────────────────────────────────────────────────────────────────
//  bridge-server.js  — FIXED VERSION
//  Single port for BOTH HTTP and WebSocket
//  Railway only exposes one port — this handles both on PORT 3000
// ─────────────────────────────────────────────────────────────────

const http    = require('http');
const express = require('express');
const WebSocket = require('ws');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Store latest data per symbol
const latestData = {};
const clients    = new Set();

// ── Create ONE HTTP server shared by Express + WebSocket ─────────
const server = http.createServer(app);

// ── WebSocket on the SAME server (same port) ─────────────────────
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  console.log('iPhone app connected. Total clients:', clients.size + 1);
  clients.add(ws);

  // Send snapshot of all current data on connect
  if (Object.keys(latestData).length > 0) {
    ws.send(JSON.stringify({ type: 'SNAPSHOT', data: latestData }));
  }

  ws.on('close', () => {
    clients.delete(ws);
    console.log('iPhone app disconnected. Total clients:', clients.size);
  });

  ws.on('error', () => clients.delete(ws));
});

// ── HTTP: Health check ───────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:    'running',
    symbols:   Object.keys(latestData),
    clients:   clients.size,
    uptime:    Math.round(process.uptime()),
    timestamp: Date.now(),
  });
});

// ── HTTP: MT5 EA posts data here ─────────────────────────────────
app.post('/data', (req, res) => {
  const payload = req.body;

  if (!payload || !payload.symbol) {
    return res.status(400).json({ error: 'Invalid payload — symbol required' });
  }

  latestData[payload.symbol] = { ...payload, receivedAt: Date.now() };

  // Forward to all connected iPhone clients
  const message = JSON.stringify({
    type:   'LIVE_UPDATE',
    symbol: payload.symbol,
    data:   latestData[payload.symbol],
  });

  let sent = 0;
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
      sent++;
    }
  });

  console.log(`[${payload.symbol}] price:${payload.price?.bid} RSI:${payload.indicators?.rsi?.toFixed(1)} → ${sent} clients`);
  res.json({ ok: true, clients: sent });
});

// ── HTTP: Get latest data for one symbol ─────────────────────────
app.get('/data/:symbol', (req, res) => {
  const data = latestData[req.params.symbol];
  if (!data) return res.status(404).json({ error: 'Symbol not found' });
  res.json(data);
});

// ── HTTP: List all active symbols ────────────────────────────────
app.get('/symbols', (req, res) => {
  res.json({ symbols: Object.keys(latestData), count: Object.keys(latestData).length });
});

// ── HTTP: Root ───────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({
    name:    'Spike Bridge Server',
    status:  'running',
    version: '2.0',
    endpoints: {
      health:  'GET  /health',
      data:    'POST /data  (MT5 EA posts here)',
      symbols: 'GET  /symbols',
    }
  });
});

// ── Start single server ──────────────────────────────────────────
server.listen(PORT, () => {
  console.log('════════════════════════════════════');
  console.log('  Spike Bridge Server v2.0 Running  ');
  console.log('════════════════════════════════════');
  console.log(`  Port: ${PORT}`);
  console.log(`  HTTP + WebSocket on same port`);
  console.log(`  Health: /health`);
  console.log(`  MT5 data: POST /data`);
  console.log('════════════════════════════════════');
});
