import { CrowdComposition } from "./types/Challenge";
import { getAccessToken } from "./discordAuth";

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3100';
const WS_URL = SERVER_URL.replace(/^http/, 'ws');

async function _authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

type MessageHandler = (msg: any) => void;

let _ws: WebSocket | null = null;
let _onMessage: MessageHandler | null = null;

// ── REST API ──

export async function createChallenge(
  challengerId: string,
  challengerName: string,
  defenderId: string,
  defenderName: string,
  crowdComposition: CrowdComposition[],
  levelId: string = 'Rap Battle',
): Promise<{ gameId: string; joinLink: string }> {
  const res = await fetch(`${SERVER_URL}/api/challenge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await _authHeaders()) },
    body: JSON.stringify({ challengerId, challengerName, defenderId, defenderName, crowdComposition, levelId }),
  });
  if (!res.ok) throw Error(`Challenge failed: ${res.status}`);
  return res.json();
}

export async function getGame(gameId: string): Promise<any> {
  const res = await fetch(`${SERVER_URL}/api/game/${gameId}`, {
    headers: await _authHeaders(),
  });
  if (!res.ok) throw Error(`Game not found: ${res.status}`);
  return res.json();
}

export async function submitScore(gameId: string, playerId: string, score: number): Promise<{ scores: Record<string, number>; status: string }> {
  const res = await fetch(`${SERVER_URL}/api/game/${gameId}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await _authHeaders()) },
    body: JSON.stringify({ playerId, score }),
  });
  if (!res.ok) throw Error(`Score submit failed: ${res.status}`);
  return res.json();
}

export async function getPlayerGames(playerId: string): Promise<any[]> {
  const res = await fetch(`${SERVER_URL}/api/games?playerId=${playerId}`, {
    headers: await _authHeaders(),
  });
  if (!res.ok) return [];
  return res.json();
}

// ── WebSocket ──

export function connectToGame(gameId: string, playerId: string, onMessage: MessageHandler): void {
  if (_ws) _ws.close();

  _onMessage = onMessage;
  _ws = new WebSocket(`${WS_URL}/ws?gameId=${gameId}&playerId=${playerId}`);

  _ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (_onMessage) _onMessage(msg);
  };

  _ws.onclose = () => {
    _ws = null;
  };

  _ws.onerror = (err) => {
    console.error('WebSocket error:', err);
  };
}

export function sendGameMessage(msg: any): void {
  if (!_ws || _ws.readyState !== WebSocket.OPEN) {
    console.warn('WebSocket not connected, dropping:', msg.type);
    return;
  }
  _ws.send(JSON.stringify(msg));
}

export function disconnectFromGame(): void {
  if (_ws) {
    _ws.close();
    _ws = null;
  }
  _onMessage = null;
}

export function isConnectedToGame(): boolean {
  return _ws !== null && _ws.readyState === WebSocket.OPEN;
}
