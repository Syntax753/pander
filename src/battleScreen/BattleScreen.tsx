import { useState, useEffect, useRef, useCallback } from "react";

import styles from './BattleScreen.module.css';
import AudienceView from "@/components/audienceView/AudienceView";
import AudienceMember from "@/game/types/AudienceMember";
import CharacterSpriteset from "@/components/audienceView/types/CharacterSpriteset";
import { loadCharacterSpriteset } from "@/components/audienceView/characterSpriteUtil";
import CardHandBox from "@/components/cardHandBox/CardHandBox";
import Deck from "@/game/types/cards/Deck";
import BattleSession, { BattleEndCallback, BattlePlayer, TurnEndCallback, TurnChangedCallback, TURN_DURATION_MS } from "@/game/BattleSession";
import { setHappiness } from "@/components/audienceView/audienceEventUtil";
import Card from "@/game/types/cards/Card";
import { TurnScore } from "@/game/battleScoringUtil";
import { DEFAULT_HAPPINESS } from "@/game/happinessUtil";
import { initSpeech, enableSpeech } from "@/speech/speechUtil";
import { getSpeechPreference } from "@/common/speechPreference";
import ToastPane from "@/components/toasts/ToastPane";
import { CrowdComposition } from "@/multiplayer/types/Challenge";
import { submitScore, connectToGame, sendGameMessage, disconnectFromGame } from "@/multiplayer/gameClient";
import {
  initPeerConnection,
  createOffer,
  handleOffer,
  handleAnswer,
  addIceCandidate,
  closePeerConnection,
} from "@/multiplayer/peerConnection";

type MpStage = 'lobby_waiting' | 'lobby_ready' | 'my_turn' | 'opponent_turn' | 'finished';

type Props = {
  player1Name: string;
  player2Name: string;
  levelId: string;
  crowdComposition?: CrowdComposition[];
  gameId?: string | null;
  playerId?: string | null;
  isChallenger?: boolean;
  opponentScore?: number | null;
  onExit: () => void;
};

function LocalVideo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hasStream, setHasStream] = useState(false);

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: { width: 160, height: 120, frameRate: 15 }, audio: false })
      .then(stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setHasStream(true);
        }
      })
      .catch(() => setHasStream(false));

    return () => {
      if (videoRef.current?.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      className={styles.localVideo}
      autoPlay
      muted
      playsInline
      style={{ display: hasStream ? 'block' : 'none' }}
    />
  );
}

function BattleScreen({ player1Name, player2Name, levelId, gameId, playerId, isChallenger, opponentScore, onExit }: Props) {
  const isMultiplayer = !!(gameId && playerId);
  const [characterSpriteset, setCharacterSpriteset] = useState<CharacterSpriteset | null>(null);
  const [audienceMembers, setAudienceMembers] = useState<AudienceMember[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [_averageHappiness, setAverageHappiness] = useState<number>(DEFAULT_HAPPINESS);
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [turnNumber, setTurnNumber] = useState<number>(0);
  const [totalTurns, setTotalTurns] = useState<number>(6);
  const [scores, setScores] = useState<number[]>([0, 0]);
  const [_activeCard, setActiveCard] = useState<Card | null>(null);
  const [_isSpeechEnabled, setIsSpeechEnabled] = useState<boolean>(getSpeechPreference());
  const [battleOver, setBattleOver] = useState<boolean>(false);
  const [winner, setWinner] = useState<BattlePlayer[] | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number>(0);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(TURN_DURATION_MS / 1000);
  const [lastTurnScore, setLastTurnScore] = useState<TurnScore | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mpStage, setMpStage] = useState<MpStage>(isMultiplayer ? 'lobby_waiting' : 'my_turn');
  const [opponentFinishedScore, setOpponentFinishedScore] = useState<number | null>(opponentScore ?? null);
  const [iAmReady, setIAmReady] = useState<boolean>(false);
  const [opponentReady, setOpponentReady] = useState<boolean>(false);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const _attachRemoteAudio = useCallback((el: HTMLAudioElement | null) => {
    if (el && remoteStreamRef.current) {
      el.srcObject = remoteStreamRef.current;
      el.play().catch(() => { /* requires user gesture */ });
    }
  }, []);

  const sessionRef = useRef<BattleSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerNames = [player1Name, player2Name];

  const onTurnEnd: TurnEndCallback = useCallback((playerIndex: number, turnScore: TurnScore) => {
    setLastTurnScore(turnScore);
    setScores(prev => {
      const next = [...prev];
      next[playerIndex] += turnScore.totalScore;
      return next;
    });
  }, []);

  const [scoreSubmitted, setScoreSubmitted] = useState<boolean>(false);

  const onBattleEnd: BattleEndCallback = useCallback((players: BattlePlayer[], winIdx: number) => {
    setBattleOver(true);
    setWinner(players);
    setWinnerIndex(winIdx);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // In multiplayer, submit our score and transition stage
    if (isMultiplayer && gameId && playerId) {
      const myPlayerIndex = isChallenger ? 0 : 1;
      const myScore = players[myPlayerIndex].score;
      submitScore(gameId, playerId, myScore)
        .then(() => {
          setScoreSubmitted(true);
          // If opponent already finished, we're done; otherwise wait
          setMpStage(opponentFinishedScore !== null ? 'finished' : 'opponent_turn');
        })
        .catch(err => console.error('Failed to submit score:', err));
    }
  }, [isMultiplayer, gameId, playerId, isChallenger, opponentFinishedScore]);

  const onTurnChanged: TurnChangedCallback = useCallback(
    (playerIdx: number, card: Card | null, turnNum: number, totalT: number) => {
      setActivePlayerIndex(playerIdx);
      setActiveCard(card);
      setTurnNumber(turnNum);
      setTotalTurns(totalT);
      setTurnTimeLeft(TURN_DURATION_MS / 1000);
      setLastTurnScore(null);
    }, []
  );

  // Load spriteset once (needed for both lobby + battle render)
  useEffect(() => {
    loadCharacterSpriteset().then(setCharacterSpriteset);
  }, []);

  // Start the BattleSession — only called when it's actually our turn to play
  const startBattleSession = useCallback(async () => {
    if (sessionRef.current) return; // already started

    function _setHappiness(characterId: string, triggerWord: string, happiness: number) {
      setHappiness(characterId, triggerWord, happiness);
    }

    const session = new BattleSession(
      _setHappiness,
      setAverageHappiness,
      setDeck,
      onTurnEnd,
      onBattleEnd,
      onTurnChanged,
    );
    sessionRef.current = session;

    if (isMultiplayer) {
      // Each player plays through the entire deck on their own turn.
      session.setSinglePlayerMode(isChallenger ? 0 : 1);
    }

    const level = await session.startBattle(levelId, player1Name, player2Name);
    setAudienceMembers(level.audienceMembers);
    setIsReady(true);

    if (getSpeechPreference()) {
      await initSpeech(
        (text: string) => session.prompt(text),
        (_text: string) => { /* onStopTalking */ }
      );
      enableSpeech();
      setIsSpeechEnabled(true);
    }
  }, [isMultiplayer, isChallenger, levelId, player1Name, player2Name, onTurnEnd, onBattleEnd, onTurnChanged]);

  // Solo play — start immediately. Multiplayer waits for lobby/turn coordination.
  useEffect(() => {
    if (!isMultiplayer) {
      startBattleSession();
    }
    return () => {
      if (sessionRef.current) sessionRef.current.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isMultiplayer, startBattleSession]);

  // Multiplayer: connect WebSocket and drive state machine via server messages
  useEffect(() => {
    if (!isMultiplayer || !gameId || !playerId) return;

    let peerInitialized = false;

    async function _ensurePeerConnection() {
      if (peerInitialized) return;
      peerInitialized = true;
      try {
        await initPeerConnection({
          onRemoteStream: (stream) => {
            remoteStreamRef.current = stream;
            // If an <audio> element is currently mounted, attach immediately.
            const el = document.querySelector<HTMLAudioElement>('audio[data-remote-audio]');
            if (el) {
              el.srcObject = stream;
              el.play().catch(() => { /* requires user gesture */ });
            }
          },
          onDataMessage: () => { /* unused — WS handles game messages */ },
          onIceCandidate: (candidate) => {
            sendGameMessage({ type: 'ICE_CANDIDATE', payload: candidate.toJSON() });
          },
          onConnectionStateChange: (state) => {
            console.log('[peer] connection state:', state);
          },
        });
        // Challenger initiates the offer once peer ready
        if (isChallenger) {
          const offer = await createOffer();
          sendGameMessage({ type: 'SDP_OFFER', payload: offer });
        }
      } catch (e) {
        console.error('Peer connection init failed:', e);
      }
    }

    connectToGame(gameId, playerId, (msg) => {
      switch (msg.type) {
        case 'GAME_STATE':
        case 'PLAYER_JOINED':
          // No-op; LOBBY_READY drives the transition
          break;
        case 'LOBBY_READY':
          setMpStage((cur) => (cur === 'lobby_waiting' ? 'lobby_ready' : cur));
          _ensurePeerConnection();
          break;
        case 'READY_STATE':
          if (msg.ready) {
            setIAmReady(!!msg.ready[playerId]);
            const otherId = Object.keys(msg.ready).find(id => id !== playerId);
            if (otherId) setOpponentReady(!!msg.ready[otherId]);
          }
          break;
        case 'SDP_OFFER':
          handleOffer(msg.payload).then((answer) => {
            sendGameMessage({ type: 'SDP_ANSWER', payload: answer });
          }).catch(err => console.error('handleOffer failed:', err));
          break;
        case 'SDP_ANSWER':
          handleAnswer(msg.payload).catch(err => console.error('handleAnswer failed:', err));
          break;
        case 'ICE_CANDIDATE':
          addIceCandidate(msg.payload).catch(err => console.error('addIceCandidate failed:', err));
          break;
        case 'BATTLE_START':
          // Challenger plays first
          if (isChallenger) {
            setMpStage('my_turn');
            startBattleSession();
          } else {
            setMpStage('opponent_turn');
          }
          break;
        case 'OPPONENT_TURN':
          // Other player just finished — if I haven't played yet, my turn now
          if (msg.finishedPlayerId !== playerId) {
            setOpponentFinishedScore(msg.score ?? null);
            if (!sessionRef.current) {
              setMpStage('my_turn');
              startBattleSession();
            }
          }
          break;
        case 'BATTLE_FINISHED':
          // Both scores in — capture opponent's score for the results UI
          if (msg.scores) {
            const otherId = Object.keys(msg.scores).find((id) => id !== playerId);
            if (otherId) setOpponentFinishedScore(msg.scores[otherId]);
          }
          setMpStage('finished');
          break;
      }
    });

    return () => {
      disconnectFromGame();
      closePeerConnection();
    };
  }, [isMultiplayer, gameId, playerId, isChallenger, startBattleSession]);

  // Turn countdown timer
  useEffect(() => {
    if (!isReady || battleOver) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTurnTimeLeft(prev => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isReady, battleOver, turnNumber]);

  function _onEndTurn() {
    if (!sessionRef.current || battleOver) return;
    sessionRef.current.endTurn();
  }

  function _onReadyClick() {
    sendGameMessage({ type: 'READY' });
    setIAmReady(true);
  }

  // Multiplayer lobby/waiting screens (rendered before BattleSession exists)
  if (isMultiplayer && (mpStage === 'lobby_waiting' || mpStage === 'lobby_ready' || mpStage === 'opponent_turn')) {
    let title = '';
    let subtitle = '';
    let showReady = false;
    if (mpStage === 'lobby_waiting') {
      title = 'Waiting for opponent…';
      subtitle = isChallenger
        ? `Waiting for ${player2Name} to join.`
        : `Connecting to ${player2Name}…`;
    } else if (mpStage === 'lobby_ready') {
      title = 'Both players connected!';
      const youLabel = iAmReady ? '✓ You are ready' : '✗ You — click Ready';
      const themLabel = opponentReady ? `✓ ${player2Name} is ready` : `✗ ${player2Name} not ready`;
      subtitle = `${youLabel}\n${themLabel}\n${isChallenger ? 'You play first.' : `${player2Name} plays first.`}`;
      showReady = !iAmReady;
    } else if (mpStage === 'opponent_turn') {
      // Either we just finished and are waiting for opponent, or we haven't played yet
      if (scoreSubmitted) {
        title = 'Turn complete!';
        subtitle = `Waiting for ${player2Name} to take their turn.`;
      } else {
        title = `${player2Name} is performing…`;
        subtitle = 'Your turn is next.';
      }
    }
    return (
      <div className={styles.gameOver}>
        <h2 className={styles.gameOverTitle}>{title}</h2>
        <p style={{ color: '#ccc', fontSize: '2vh', textAlign: 'center', marginTop: '2vh', whiteSpace: 'pre-line' }}>{subtitle}</p>
        <audio ref={_attachRemoteAudio} data-remote-audio autoPlay playsInline />
        {showReady && (
          <button className={styles.exitButton} onClick={_onReadyClick}>Ready</button>
        )}
        <button className={styles.exitButton} onClick={onExit}>Back to Menu</button>
      </div>
    );
  }

  if (!isReady) {
    return <div className={styles.loading}>Loading battle...</div>;
  }

  if (battleOver && winner) {
    if (isMultiplayer && mpStage === 'finished') {
      // Both players done — compare scores
      const myIdx = isChallenger ? 0 : 1;
      const myScore = winner[myIdx].score;
      const theirScore = opponentFinishedScore ?? 0;
      const iWin = myScore > theirScore;
      const tie = myScore === theirScore;
      return (
        <div className={styles.gameOver}>
          <h2 className={styles.gameOverTitle}>Battle Over!</h2>
          <div className={styles.finalScores}>
            <div className={iWin || tie ? styles.winnerScore : styles.loserScore}>
              <span className={styles.playerLabel}>{player1Name} (you)</span>
              <span className={styles.scoreValue}>{myScore}</span>
            </div>
            <span className={styles.vs}>vs</span>
            <div className={!iWin || tie ? styles.winnerScore : styles.loserScore}>
              <span className={styles.playerLabel}>{player2Name}</span>
              <span className={styles.scoreValue}>{theirScore}</span>
            </div>
          </div>
          <h3 className={styles.winnerName}>
            {tie ? "It's a tie!" : iWin ? `${player1Name} wins!` : `${player2Name} wins!`}
          </h3>
          <button className={styles.exitButton} onClick={onExit}>Back to Menu</button>
        </div>
      );
    }

    // Local/solo battle — original behavior
    return (
      <div className={styles.gameOver}>
        <h2 className={styles.gameOverTitle}>Battle Over!</h2>
        <div className={styles.finalScores}>
          <div className={winnerIndex === 0 ? styles.winnerScore : styles.loserScore}>
            <span className={styles.playerLabel}>{playerNames[0]}</span>
            <span className={styles.scoreValue}>{winner[0].score}</span>
          </div>
          <span className={styles.vs}>vs</span>
          <div className={winnerIndex === 1 ? styles.winnerScore : styles.loserScore}>
            <span className={styles.playerLabel}>{playerNames[1]}</span>
            <span className={styles.scoreValue}>{winner[1].score}</span>
          </div>
        </div>
        <h3 className={styles.winnerName}>{playerNames[winnerIndex]} wins!</h3>
        <button className={styles.exitButton} onClick={onExit}>Back to Menu</button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Turn info bar */}
      <div className={styles.turnBar}>
        <div className={styles.turnInfo}>
          <span className={styles.turnLabel}>
            {playerNames[activePlayerIndex]}'s turn
          </span>
          <span className={styles.turnCount}>
            Round {Math.floor(turnNumber / 2) + 1}/{Math.floor(totalTurns / 2)}
          </span>
        </div>
        <div className={styles.timer}>
          {turnTimeLeft}s
        </div>
      </div>

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        <div className={activePlayerIndex === 0 ? styles.activePlayerScore : styles.playerScore}>
          <span className={styles.playerName}>{playerNames[0]}</span>
          <span className={styles.score}>{scores[0]}</span>
        </div>
        <div className={activePlayerIndex === 1 ? styles.activePlayerScore : styles.playerScore}>
          <span className={styles.playerName}>{playerNames[1]}</span>
          <span className={styles.score}>{scores[1]}</span>
        </div>
      </div>

      {/* Camera — opponent view (top right, above audience) */}
      <div className={styles.cameraBar}>
        <LocalVideo />
      </div>

      {/* Audience */}
      <div className={styles.audienceArea}>
        <AudienceView characterSpriteset={characterSpriteset} audienceMembers={audienceMembers} />
      </div>

      {/* Card */}
      <div className={styles.cardArea}>
        <CardHandBox deck={deck} />
      </div>

      {/* Last turn score */}
      {lastTurnScore && (
        <div className={styles.turnScorePopup}>
          +{lastTurnScore.totalScore} pts (x{lastTurnScore.crowdMultiplier.toFixed(1)} crowd)
        </div>
      )}

      {/* Controls */}
      <div className={styles.inputArea}>
        <button className={styles.endTurnButton} onClick={_onEndTurn}>
          End Turn
        </button>
      </div>

      <audio ref={_attachRemoteAudio} data-remote-audio autoPlay playsInline />
      <ToastPane />
    </div>
  );
}

export default BattleScreen;
