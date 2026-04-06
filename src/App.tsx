import { useState, useEffect } from "react";

import LoginScreen from "./loginScreen/LoginScreen";
import BattleMenuScreen from "./battleMenu/BattleMenuScreen";
import BattleScreen from "./battleScreen/BattleScreen";
import AboutDialog from "./homeScreen/dialogs/AboutDialog";
import Player from "./multiplayer/types/Player";
import { CrowdComposition } from "./multiplayer/types/Challenge";
import { getStoredPlayer, handleDiscordCallback } from "./multiplayer/discordAuth";
import { createChallenge, getGame } from "./multiplayer/gameClient";

type AppScreen = 'login' | 'menu' | 'battle';

const BATTLE_LEVEL_ID = 'Rap Battle';

function App() {
  const [screen, setScreen] = useState<AppScreen>('login');
  const [player, setPlayer] = useState<Player | null>(null);
  const [modalDialogName, setModalDialogName] = useState<string | null>(null);
  const [battleCrowd, setBattleCrowd] = useState<CrowdComposition[]>([]);
  const [battleOpponent, setBattleOpponent] = useState<string>('Player 2');
  const [gameId, setGameId] = useState<string | null>(null);
  const [isChallenger, setIsChallenger] = useState<boolean>(false);
  const [challengerScore, setChallengerScore] = useState<number | null>(null);

  useEffect(() => {
    async function _checkAuth() {
      // Handle Discord OAuth callback
      let storedPlayer = await handleDiscordCallback();
      if (!storedPlayer) {
        storedPlayer = await getStoredPlayer();
      }
      if (storedPlayer) {
        setPlayer(storedPlayer);
      }

      // Check for ?id= or ?join= parameter (opponent clicking Discord link)
      const params = new URLSearchParams(window.location.search);
      const joinGameId = params.get('id') ?? params.get('join');
      if (joinGameId) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
          const game = await getGame(joinGameId);
          setGameId(joinGameId);
          setIsChallenger(false);
          setBattleOpponent(game.challengerName);
          setBattleCrowd(game.crowdComposition || []);
          if (game.scores && game.scores[game.challengerId] !== undefined) {
            setChallengerScore(game.scores[game.challengerId]);
          }
          setScreen('battle');
          return;
        } catch (e) {
          console.error('Failed to join game:', e);
        }
      }

      setScreen(storedPlayer ? 'menu' : 'login');
    }
    _checkAuth();
  }, []);

  function _onSoloPlay() {
    setBattleOpponent('Player 2');
    setBattleCrowd([]);
    setGameId(null);
    setScreen('battle');
  }

  async function _onChallenge(defenderId: string, defenderName: string, crowd: CrowdComposition[]) {
    setBattleCrowd(crowd);
    setBattleOpponent(defenderName);

    if (player) {
      try {
        const result = await createChallenge(
          player.discordId,
          player.username,
          defenderId,
          defenderName,
          crowd,
          BATTLE_LEVEL_ID,
        );
        setGameId(result.gameId);
        setIsChallenger(true);
        setChallengerScore(null);
        setScreen('battle');
        return;
      } catch (e) {
        console.error('Failed to create challenge, starting local battle:', e);
      }
    }

    // Fallback: local solo battle
    setGameId(null);
    setScreen('battle');
  }

  switch (screen) {
    case 'login':
      return (
        <>
          <LoginScreen onAboutClick={() => setModalDialogName(AboutDialog.name)} />
          <AboutDialog
            isOpen={modalDialogName === AboutDialog.name}
            onClose={() => setModalDialogName(null)}
          />
        </>
      );

    case 'menu':
      return (
        <BattleMenuScreen
          player={player}
          onSoloPlay={_onSoloPlay}
          onChallenge={_onChallenge}
          onAboutClick={() => setModalDialogName(AboutDialog.name)}
        />
      );

    case 'battle':
      return (
        <BattleScreen
          player1Name={player?.username ?? 'Player 1'}
          player2Name={battleOpponent}
          levelId={BATTLE_LEVEL_ID}
          crowdComposition={battleCrowd}
          gameId={gameId}
          playerId={player?.discordId ?? null}
          isChallenger={isChallenger}
          opponentScore={challengerScore}
          onExit={() => { setGameId(null); setScreen('menu'); }}
        />
      );
  }
}

export default App;
