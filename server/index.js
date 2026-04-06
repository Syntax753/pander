import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT || 3100;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID || '';
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGIN || 'http://localhost:3000')
  .split(',').map(s => s.trim());
// Always allow localhost for dev
if (!CLIENT_ORIGINS.includes('http://localhost:3000')) CLIENT_ORIGINS.push('http://localhost:3000');

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CLIENT_ORIGINS.includes(origin)) callback(null, true);
    else callback(null, true); // Allow all for now — tighten in production
  }
}));
app.use(express.json());

// ── Discord token verification + rate limiting ──

/** @type {Map<string, { userId: string, username: string, expiresAt: number }>} token → cached user */
const tokenCache = new Map();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/** @type {Map<string, number[]>} discordId → recent request timestamps */
const rateLimitBuckets = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30; // 30 requests / minute / user

async function verifyDiscordToken(token) {
  if (!token) return null;
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) return cached;
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    const entry = { userId: user.id, username: user.username, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS };
    tokenCache.set(token, entry);
    return entry;
  } catch (err) {
    console.error('[auth] Discord verification failed:', err);
    return null;
  }
}

function checkRateLimit(discordId) {
  const now = Date.now();
  const bucket = (rateLimitBuckets.get(discordId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  if (bucket.length >= RATE_LIMIT_MAX) {
    rateLimitBuckets.set(discordId, bucket);
    return false;
  }
  bucket.push(now);
  rateLimitBuckets.set(discordId, bucket);
  return true;
}

async function requireDiscordAuth(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const user = await verifyDiscordToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid or missing Discord token' });
  if (!checkRateLimit(user.userId)) return res.status(429).json({ error: 'Rate limit exceeded' });
  req.discordUser = user;
  next();
}

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// ── In-memory stores ──

/** @type {Map<string, object>} gameId → game state */
const games = new Map();

/** @type {Map<string, import('ws').WebSocket[]>} gameId → [ws, ws] */
const gameConnections = new Map();

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Discord integration ──

async function postDiscordMessage(content) {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
    console.log('[discord-stub] No token/channel. Message:', content);
    return null;
  }
  try {
    console.log('[discord] Posting to channel', DISCORD_CHANNEL_ID);
    const res = await fetch(`https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error('[discord] Post failed:', res.status, body);
      return null;
    }
    console.log('[discord] Message posted successfully');
    return await res.json();
  } catch (err) {
    console.error('[discord] Fetch error:', err);
    return null;
  }
}

// ── REST API ──

// Create a challenge → creates a game, posts link to Discord
app.post('/api/challenge', requireDiscordAuth, async (req, res) => {
  const { challengerId, challengerName, defenderId, defenderName, crowdComposition, levelId } = req.body;
  // Enforce that the challenger matches the authenticated Discord user
  if (challengerId !== req.discordUser.userId) {
    return res.status(403).json({ error: 'challengerId does not match authenticated user' });
  }

  const gameId = generateId();
  const game = {
    id: gameId,
    levelId: levelId || 'Rap Battle',
    challengerId,
    challengerName,
    defenderId,
    defenderName,
    crowdComposition: crowdComposition || [],
    status: 'waiting',       // waiting → active → finished
    players: {},             // playerId → { connected, score }
    turnNumber: 0,
    activePlayerId: challengerId,
    createdAt: Date.now(),
  };

  games.set(gameId, game);

  const joinLink = `https://storage.googleapis.com/santyx-landing/turkey/index.html?id=${gameId}`;
  const discordMsg = `🎤 **${challengerName}** challenges **${defenderName}** to a rap battle!\n👉 ${joinLink}`;
  await postDiscordMessage(discordMsg);

  res.json({ gameId, joinLink });
});

// Get game state
app.get('/api/game/:gameId', requireDiscordAuth, (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Submit a player's score after their turn
app.post('/api/game/:gameId/score', requireDiscordAuth, (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { playerId, score } = req.body;
  if (!playerId || score === undefined) return res.status(400).json({ error: 'Missing playerId or score' });
  if (playerId !== req.discordUser.userId) {
    return res.status(403).json({ error: 'playerId does not match authenticated user' });
  }

  if (!game.scores) game.scores = {};
  game.scores[playerId] = score;

  // If both players have submitted scores, mark game as finished
  const scoreCount = Object.keys(game.scores).length;
  if (scoreCount >= 2) {
    game.status = 'finished';
    broadcast(req.params.gameId, { type: 'BATTLE_FINISHED', scores: game.scores });
  } else {
    game.status = 'waiting_for_defender';
    // Notify the *other* player that it's their turn now
    broadcast(req.params.gameId, { type: 'OPPONENT_TURN', finishedPlayerId: playerId, score });
  }

  res.json({ scores: game.scores, status: game.status });
});

// List active games for a player
app.get('/api/games', requireDiscordAuth, (req, res) => {
  const playerId = req.query.playerId;
  if (playerId !== req.discordUser.userId) {
    return res.status(403).json({ error: 'playerId does not match authenticated user' });
  }
  const playerGames = [];
  for (const game of games.values()) {
    if (game.status !== 'finished' &&
        (game.challengerId === playerId || game.defenderId === playerId)) {
      playerGames.push(game);
    }
  }
  res.json(playerGames);
});

// ── WebSocket: real-time game coordination ──

wss.on('connection', async (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const gameId = url.searchParams.get('gameId');
  const playerId = url.searchParams.get('playerId');
  const token = url.searchParams.get('token');

  if (!gameId || !playerId) {
    ws.close(4000, 'Missing gameId or playerId');
    return;
  }

  const user = await verifyDiscordToken(token);
  if (!user) {
    ws.close(4002, 'Invalid Discord token');
    return;
  }
  if (user.userId !== playerId) {
    ws.close(4003, 'playerId does not match authenticated user');
    return;
  }
  if (!checkRateLimit(user.userId)) {
    ws.close(4004, 'Rate limit exceeded');
    return;
  }

  const game = games.get(gameId);
  if (!game) {
    ws.close(4001, 'Game not found');
    return;
  }

  // Register connection — cap room at 5 (1 challenger + 1 defender + up to 3 spectators)
  const MAX_ROOM_SIZE = 5;
  if (!gameConnections.has(gameId)) gameConnections.set(gameId, []);
  const conns = gameConnections.get(gameId);
  if (conns.length >= MAX_ROOM_SIZE) {
    ws.close(4006, 'Room is full');
    return;
  }
  conns.push(ws);

  // Track player (preserve ready state if reconnecting)
  const existing = game.players[playerId] || {};
  game.players[playerId] = {
    connected: true,
    score: existing.score || 0,
    ready: existing.ready || false,
    username: user.username,
  };

  ws.gameId = gameId;
  ws.playerId = playerId;

  // Send full game state to the joining player so they know who's challenger
  ws.send(JSON.stringify({ type: 'GAME_STATE', game }));

  // Anyone in the room can now see the lobby UI; transition out of "waiting for opponent"
  broadcast(gameId, {
    type: 'LOBBY_STATE',
    challengerId: game.challengerId,
    defenderId: game.defenderClaimed ? game.defenderId : null,
    players: Object.fromEntries(
      Object.entries(game.players).map(([id, p]) => [id, { username: p.username, ready: !!p.ready, connected: !!p.connected }])
    ),
  });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'READY': {
        // The first non-challenger to click Ready claims the defender slot.
        if (playerId !== game.challengerId && !game.defenderClaimed) {
          game.defenderId = playerId;
          game.defenderClaimed = true;
        }
        // Spectators (joined after defender was claimed) can't become ready.
        const isParticipant = playerId === game.challengerId || playerId === game.defenderId;
        if (isParticipant && game.players[playerId]) {
          game.players[playerId].ready = true;
        }
        broadcast(gameId, {
          type: 'LOBBY_STATE',
          challengerId: game.challengerId,
          defenderId: game.defenderClaimed ? game.defenderId : null,
          players: Object.fromEntries(
            Object.entries(game.players).map(([id, p]) => [id, { username: p.username, ready: !!p.ready, connected: !!p.connected }])
          ),
        });
        // Both ready → start (challenger plays first)
        if (
          game.status === 'waiting' &&
          game.defenderClaimed &&
          game.players[game.challengerId]?.ready &&
          game.players[game.defenderId]?.ready
        ) {
          game.status = 'active';
          broadcast(gameId, { type: 'BATTLE_START', firstPlayerId: game.challengerId });
        }
        break;
      }

      case 'PROMPT':
        // Player spoke — relay to opponent
        relay(gameId, playerId, { type: 'PROMPT', playerId, text: msg.text, timestamp: Date.now() });
        break;

      case 'CARD_UPDATE':
        // Card keyword completed — relay
        relay(gameId, playerId, { type: 'CARD_UPDATE', playerId, keywordIndex: msg.keywordIndex, timestamp: Date.now() });
        break;

      case 'END_TURN':
        // Player ended their turn
        game.turnNumber++;
        const totalTurns = 6; // 3 rounds x 2 players
        if (game.turnNumber >= totalTurns) {
          game.status = 'finished';
          broadcast(gameId, { type: 'GAME_END', scores: game.players, turnNumber: game.turnNumber });
        } else {
          // Switch active player
          const ids = [game.challengerId, game.defenderId];
          game.activePlayerId = ids[game.turnNumber % 2];
          broadcast(gameId, {
            type: 'TURN_CHANGE',
            activePlayerId: game.activePlayerId,
            turnNumber: game.turnNumber,
            scores: Object.fromEntries(
              Object.entries(game.players).map(([id, p]) => [id, p.score])
            ),
          });
        }
        break;

      case 'SCORE_UPDATE':
        // Player reports their turn score
        if (game.players[playerId]) {
          game.players[playerId].score = msg.totalScore;
        }
        relay(gameId, playerId, { type: 'SCORE_UPDATE', playerId, totalScore: msg.totalScore });
        break;

      case 'SDP_OFFER':
      case 'SDP_ANSWER':
      case 'ICE_CANDIDATE':
        // WebRTC signaling — relay to the other player
        relay(gameId, playerId, { type: msg.type, playerId, payload: msg.payload });
        break;

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (game.players[playerId]) game.players[playerId].connected = false;
    const idx = conns.indexOf(ws);
    if (idx !== -1) conns.splice(idx, 1);
    broadcast(gameId, { type: 'PLAYER_LEFT', playerId });
  });
});

function broadcast(gameId, msg) {
  const conns = gameConnections.get(gameId) || [];
  const data = JSON.stringify(msg);
  for (const ws of conns) {
    if (ws.readyState === 1) ws.send(data);
  }
}

function relay(gameId, fromPlayerId, msg) {
  const conns = gameConnections.get(gameId) || [];
  const data = JSON.stringify(msg);
  for (const ws of conns) {
    if (ws.readyState === 1 && ws.playerId !== fromPlayerId) ws.send(data);
  }
}

// ── Start ──

server.listen(PORT, () => {
  console.log(`Pander server running on http://localhost:${PORT}`);
  if (!DISCORD_BOT_TOKEN) console.log('  ⚠ DISCORD_BOT_TOKEN not set — Discord messages will be logged to console');
  if (!DISCORD_CHANNEL_ID) console.log('  ⚠ DISCORD_CHANNEL_ID not set');
});
