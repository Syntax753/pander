import Player from "./types/Player";
import { getText, setText } from "@/persistence/pathStore";

// Discord OAuth2 with PKCE - no server secret needed.
// Register your app at https://discord.com/developers/applications
// Set redirect URI to your app origin (e.g., http://localhost:3000)
const CLIENT_ID = '1490086176864993471';
// Must exactly match a redirect URI registered in the Discord developer portal.
// Derived from Vite's BASE_URL so it is stable regardless of current location.pathname.
const _basePath = import.meta.env.BASE_URL.endsWith('/')
  ? `${import.meta.env.BASE_URL}index.html`
  : import.meta.env.BASE_URL;
const REDIRECT_URI = `${window.location.origin}${_basePath}`;
console.log('[discordAuth] REDIRECT_URI =', JSON.stringify(REDIRECT_URI));
const SCOPES = 'identify';
const DISCORD_API = 'https://discord.com/api/v10';

const PLAYER_STORAGE_KEY = 'multiplayer/player';
const TOKEN_STORAGE_KEY = 'multiplayer/discordToken';

function _generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

async function _sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest('SHA-256', encoder.encode(plain));
}

function _base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startDiscordLogin(): Promise<void> {
  const codeVerifier = _generateRandomString(64);
  sessionStorage.setItem('discord_code_verifier', codeVerifier);

  const codeChallenge = _base64UrlEncode(await _sha256(codeVerifier));

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export async function handleDiscordCallback(): Promise<Player | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return null;

  const codeVerifier = sessionStorage.getItem('discord_code_verifier');
  if (!codeVerifier) return null;
  sessionStorage.removeItem('discord_code_verifier');

  // Exchange code for token
  const tokenResponse = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    console.error('Discord token exchange failed:', tokenResponse.status);
    return null;
  }

  const tokenData = await tokenResponse.json();
  await setText(TOKEN_STORAGE_KEY, JSON.stringify(tokenData));

  // Fetch user profile
  const userResponse = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userResponse.ok) {
    console.error('Discord user fetch failed:', userResponse.status);
    return null;
  }

  const userData = await userResponse.json();
  const player: Player = {
    discordId: userData.id,
    username: userData.username,
    avatarUrl: userData.avatar
      ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
      : null,
  };

  await setText(PLAYER_STORAGE_KEY, JSON.stringify(player));

  // Clean URL
  window.history.replaceState({}, document.title, window.location.pathname);

  return player;
}

export async function getStoredPlayer(): Promise<Player | null> {
  const text = await getText(PLAYER_STORAGE_KEY);
  if (!text) return null;
  return JSON.parse(text) as Player;
}

export async function logout(): Promise<void> {
  await setText(PLAYER_STORAGE_KEY, null);
  await setText(TOKEN_STORAGE_KEY, null);
}

export async function getAccessToken(): Promise<string | null> {
  const text = await getText(TOKEN_STORAGE_KEY);
  if (!text) return null;
  const tokenData = JSON.parse(text);
  return tokenData.access_token ?? null;
}
