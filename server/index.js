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
app.post('/api/challenge', async (req, res) => {
  const { challengerId, challengerName, defenderId, defenderName, crowdComposition, levelId } = req.body;

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
app.get('/api/game/:gameId', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// Submit a player's score after their turn
app.post('/api/game/:gameId/score', (req, res) => {
  const game = games.get(req.params.gameId);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const { playerId, score } = req.body;
  if (!playerId || score === undefined) return res.status(400).json({ error: 'Missing playerId or score' });

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
app.get('/api/games', (req, res) => {
  const playerId = req.query.playerId;
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

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const gameId = url.searchParams.get('gameId');
  const playerId = url.searchParams.get('playerId');

  if (!gameId || !playerId) {
    ws.close(4000, 'Missing gameId or playerId');
    return;
  }

  const game = games.get(gameId);
  if (!game) {
    ws.close(4001, 'Game not found');
    return;
  }

  // Register connection
  if (!gameConnections.has(gameId)) gameConnections.set(gameId, []);
  const conns = gameConnections.get(gameId);
  conns.push(ws);

  // Track player (preserve ready state if reconnecting)
  const existing = game.players[playerId] || {};
  game.players[playerId] = { connected: true, score: existing.score || 0, ready: existing.ready || false };

  ws.gameId = gameId;
  ws.playerId = playerId;

  // Send full game state to the joining player so they know who's challenger
  ws.send(JSON.stringify({ type: 'GAME_STATE', game }));

  // Notify all players in this game (lobby presence update)
  broadcast(gameId, { type: 'PLAYER_JOINED', playerId, playerCount: conns.length });

  // If both players connected, the lobby is full — wait for challenger to click Ready
  const playerIds = Object.keys(game.players).filter(id => game.players[id].connected);
  if (playerIds.length === 2 && game.status === 'waiting') {
    broadcast(gameId, { type: 'LOBBY_READY', game });
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    switch (msg.type) {
      case 'READY':
        // Mark this player ready and broadcast updated ready state
        if (game.players[playerId]) {
          game.players[playerId].ready = true;
        }
        broadcast(gameId, {
          type: 'READY_STATE',
          ready: Object.fromEntries(
            Object.entries(game.players).map(([id, p]) => [id, !!p.ready])
          ),
        });
        // If both players are ready, start the battle (challenger plays first)
        if (
          game.status === 'waiting' &&
          game.players[game.challengerId]?.ready &&
          game.players[game.defenderId]?.ready
        ) {
          game.status = 'active';
          broadcast(gameId, { type: 'BATTLE_START', firstPlayerId: game.challengerId });
        }
        break;

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
