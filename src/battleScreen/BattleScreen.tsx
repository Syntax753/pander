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
import { initSpeech, enableSpeech, isSpeechAvailable, toggleSpeech } from "@/speech/speechUtil";
import { getSpeechPreference, setSpeechPreference } from "@/common/speechPreference";
import ToastPane from "@/components/toasts/ToastPane";
import MicrophonePermissionDialog from "@/homeScreen/dialogs/MicrophonePermissionDialog";
import { CrowdComposition } from "@/multiplayer/types/Challenge";
import { submitScore, connectToGame, sendGameMessage, sendChat, sendSignalTo, sendStateEvent, disconnectFromGame } from "@/multiplayer/gameClient";
import {
  initMesh,
  ensureLocalStream,
  addPeer,
  handleSignal,
  removePeer,
  closeMesh,
} from "@/multiplayer/meshConnection";

type MpStage = 'lobby_waiting' | 'lobby_ready' | 'my_turn' | 'opponent_turn' | 'observing' | 'finished';

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

function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      ref.current.play().catch(() => { /* requires user gesture */ });
    }
  }, [stream]);
  return <audio ref={ref} autoPlay playsInline />;
}

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
  const [isSpeechEnabledState, setIsSpeechEnabled] = useState<boolean>(getSpeechPreference());
  const [battleOver, setBattleOver] = useState<boolean>(false);
  const [winner, setWinner] = useState<BattlePlayer[] | null>(null);
  const [winnerIndex, setWinnerIndex] = useState<number>(0);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(TURN_DURATION_MS / 1000);
  const [lastTurnScore, setLastTurnScore] = useState<TurnScore | null>(null);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [mpStage, setMpStage] = useState<MpStage>(isMultiplayer ? 'lobby_waiting' : 'my_turn');
  const [opponentFinishedScore, setOpponentFinishedScore] = useState<number | null>(opponentScore ?? null);
  const [iAmReady, setIAmReady] = useState<boolean>(false);
  const [defenderId, setDefenderId] = useState<string | null>(null);
  const defenderIdRef = useRef<string | null>(null);
  const [challengerIdState, setChallengerIdState] = useState<string | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [chatMessages, setChatMessages] = useState<{ from: string; username: string; text: string; timestamp: number }[]>([]);
  const [chatDraft, setChatDraft] = useState<string>('');
  const [micGranted, setMicGranted] = useState<boolean>(false);
  const [showMicDialog, setShowMicDialog] = useState<boolean>(false);
  const [lobbyPlayers, setLobbyPlayers] = useState<Record<string, { username?: string; ready: boolean; connected: boolean }>>({});

  const sessionRef = useRef<BattleSession | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startBattleSessionRef = useRef<() => void>(() => {});
  const playerNames = [player1Name, player2Name];

  const onTurnEnd: TurnEndCallback = useCallback((playerIndex: number, turnScore: TurnScore) => {
    setLastTurnScore(turnScore);
    setScores(prev => {
      const next = [...prev];
      next[playerIndex] += turnScore.totalScore;
      if (isMultiplayer) {
        sendStateEvent('TURN_ENDED_SYNC', { playerIndex, turnScore, scores: next });
      }
      return next;
    });
  }, [isMultiplayer]);

  const [scoreSubmitted, setScoreSubmitted] = useState<boolean>(false);

  const onBattleEnd: BattleEndCallback = useCallback((players: BattlePlayer[], winIdx: number) => {
    setBattleOver(true);
    setWinner(players);
    setWinnerIndex(winIdx);
    if (isMultiplayer) {
      sendStateEvent('BATTLE_END_SYNC', { players, winnerIndex: winIdx });
    }
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
          // If opponent already finished, we're done; otherwise watch their performance.
          if (opponentFinishedScore !== null) {
            setMpStage('finished');
          } else {
            // Tear down the local session so we can render the defender's broadcast state.
            if (sessionRef.current) {
              sessionRef.current.destroy();
              sessionRef.current = null;
            }
            setBattleOver(false);
            setScores([0, 0]);
            setMpStage('observing');
          }
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
      if (isMultiplayer) {
        sendStateEvent('TURN_CHANGED_SYNC', { activePlayerIndex: playerIdx, turnNumber: turnNum, totalTurns: totalT });
      }
    }, [isMultiplayer]
  );

  // Load spriteset once (needed for both lobby + battle render)
  useEffect(() => {
    loadCharacterSpriteset().then(setCharacterSpriteset);
  }, []);

  // Multiplayer: pre-load the level so the lobby can show the audience preview
  useEffect(() => {
    if (!isMultiplayer) return;
    let cancelled = false;
    import('@/game/levelFileUtil').then(({ loadLevel }) => loadLevel(levelId)).then(level => {
      if (cancelled) return;
      setAudienceMembers(level.audienceMembers);
    }).catch(err => console.error('Lobby preload failed:', err));
    return () => { cancelled = true; };
  }, [isMultiplayer, levelId]);

  // Start the BattleSession — only called when it's actually our turn to play
  const startBattleSession = useCallback(async () => {
    console.log('[battle] startBattleSession called', { isMultiplayer, isChallenger, levelId });
    if (sessionRef.current) { console.log('[battle] already started'); return; }

    function _setHappiness(characterId: string, triggerWord: string, happiness: number) {
      setHappiness(characterId, triggerWord, happiness);
      if (isMultiplayer) {
        sendStateEvent('HAPPINESS_EVENT', { characterId, triggerWord, happiness });
      }
    }

    function _setDeckBroadcast(d: Deck) {
      setDeck(d);
      if (isMultiplayer) {
        sendStateEvent('DECK_UPDATE', { deck: d });
      }
    }

    function _setAverageBroadcast(avg: number) {
      setAverageHappiness(avg);
      if (isMultiplayer) {
        sendStateEvent('HAPPINESS_EVENT', { averageHappiness: avg });
      }
    }

    const session = new BattleSession(
      _setHappiness,
      _setAverageBroadcast,
      _setDeckBroadcast,
      onTurnEnd,
      onBattleEnd,
      onTurnChanged,
    );
    sessionRef.current = session;

    if (isMultiplayer) {
      // Each player plays through the entire deck on their own turn.
      session.setSinglePlayerMode(isChallenger ? 0 : 1);
    }

    let level;
    try {
      level = await session.startBattle(levelId, player1Name, player2Name);
    } catch (e) {
      console.error('[battle] session.startBattle threw:', e);
      sessionRef.current = null;
      return;
    }
    console.log('[battle] level loaded', { members: level.audienceMembers.length, totalTurns: session.totalTurns });
    setAudienceMembers(level.audienceMembers);
    setIsReady(true);

    if (isMultiplayer) {
      console.log('[battle] sending BATTLE_INIT');
      sendStateEvent('BATTLE_INIT', {
        audienceMembers: level.audienceMembers,
        totalTurns: session.totalTurns,
        activePlayerIndex: session.activePlayerIndex,
        player1Name,
        player2Name,
      });
    }

    if (getSpeechPreference()) {
      await initSpeech(
        (text: string) => session.prompt(text),
        (_text: string) => { /* onStopTalking */ }
      );
      enableSpeech();
      setIsSpeechEnabled(true);
    }
  }, [isMultiplayer, isChallenger, levelId, player1Name, player2Name, onTurnEnd, onBattleEnd, onTurnChanged]);

  // Keep the ref pointing at the latest startBattleSession so the WS effect
  // (which intentionally has a stable dep list) can call it without re-running.
  useEffect(() => {
    startBattleSessionRef.current = startBattleSession;
  }, [startBattleSession]);

  // Solo play — start immediately. Multiplayer waits for lobby/turn coordination.
  useEffect(() => {
    if (!isMultiplayer) {
      startBattleSessionRef.current();
    }
    return () => {
      if (sessionRef.current) sessionRef.current.destroy();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isMultiplayer, startBattleSession]);

  // Multiplayer: connect WebSocket and drive state machine via server messages
  useEffect(() => {
    if (!isMultiplayer || !gameId || !playerId) return;

    initMesh(playerId, {
      onRemoteStream: (peerId, stream) => {
        setRemoteStreams(prev => ({ ...prev, [peerId]: stream }));
      },
      onPeerDisconnected: (peerId) => {
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      },
      onSignal: (targetId, type, payload) => {
        sendSignalTo(targetId, type, payload);
      },
    });

    connectToGame(gameId, playerId, (msg) => {
      switch (msg.type) {
        case 'GAME_STATE':
        case 'PLAYER_JOINED':
          break;
        case 'LOBBY_STATE': {
          setLobbyPlayers(msg.players || {});
          setDefenderId(msg.defenderId ?? null);
          defenderIdRef.current = msg.defenderId ?? null;
          if (msg.challengerId) setChallengerIdState(msg.challengerId);
          if (msg.players && msg.players[playerId]) {
            setIAmReady(!!msg.players[playerId].ready);
          }
          setMpStage((cur) => (cur === 'lobby_waiting' ? 'lobby_ready' : cur));
          // Diff peers and add any new ones to the mesh
          const otherIds = Object.keys(msg.players || {}).filter((id: string) => id !== playerId);
          for (const id of otherIds) {
            addPeer(id).catch(err => console.error('addPeer failed:', err));
          }
          break;
        }
        case 'SDP_OFFER':
        case 'SDP_ANSWER':
        case 'ICE_CANDIDATE':
          if (msg.from) {
            handleSignal(msg.from, msg.type, msg.payload).catch(err => console.error('handleSignal failed:', err));
          }
          break;
        case 'CHAT':
          setChatMessages(prev => [...prev, { from: msg.from, username: msg.username, text: msg.text, timestamp: msg.timestamp }]);
          break;
        case 'PLAYER_LEFT':
          if (msg.playerId) removePeer(msg.playerId);
          break;
        case 'BATTLE_START':
          console.log('[battle] BATTLE_START received, isChallenger=', isChallenger);
          // Challenger plays first; defender + spectators observe live.
          if (isChallenger) {
            setMpStage('my_turn');
            startBattleSessionRef.current();
          } else {
            setMpStage('observing');
          }
          break;
        case 'OPPONENT_TURN':
          // Challenger just finished. Only the defender plays next; everyone else observes.
          if (msg.finishedPlayerId !== playerId) {
            setOpponentFinishedScore(msg.score ?? null);
            const iAmDefender = defenderIdRef.current === playerId;
            if (iAmDefender && !sessionRef.current) {
              setMpStage('my_turn');
              startBattleSessionRef.current();
            } else if (!sessionRef.current) {
              setMpStage('observing');
            }
          }
          break;
        case 'BATTLE_INIT':
          console.log('[battle] BATTLE_INIT received', { hasSession: !!sessionRef.current, members: msg.audienceMembers?.length });
          if (!sessionRef.current) {
            setAudienceMembers(msg.audienceMembers || []);
            setTotalTurns(msg.totalTurns || 0);
            setActivePlayerIndex(msg.activePlayerIndex ?? 0);
            setIsReady(true);
            setBattleOver(false);
            setMpStage('observing');
          }
          break;
        case 'HAPPINESS_EVENT':
          if (!sessionRef.current) {
            if (typeof msg.averageHappiness === 'number') {
              setAverageHappiness(msg.averageHappiness);
            } else if (msg.characterId) {
              setHappiness(msg.characterId, msg.triggerWord || '', msg.happiness || 0);
            }
          }
          break;
        case 'DECK_UPDATE':
          if (!sessionRef.current && msg.deck) setDeck(msg.deck);
          break;
        case 'TURN_CHANGED_SYNC':
          if (!sessionRef.current) {
            setActivePlayerIndex(msg.activePlayerIndex ?? 0);
            setTurnNumber(msg.turnNumber ?? 0);
            setTotalTurns(msg.totalTurns ?? 0);
            setLastTurnScore(null);
          }
          break;
        case 'TURN_ENDED_SYNC':
          if (!sessionRef.current) {
            if (Array.isArray(msg.scores)) setScores(msg.scores);
            if (msg.turnScore) setLastTurnScore(msg.turnScore);
          }
          break;
        case 'BATTLE_END_SYNC':
          if (!sessionRef.current) {
            setBattleOver(true);
            setWinner(msg.players || null);
            setWinnerIndex(msg.winnerIndex ?? 0);
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
      closeMesh();
    };
    // Intentionally NOT depending on startBattleSession — see startBattleSessionRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMultiplayer, gameId, playerId, isChallenger]);

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

  async function _onToggleMic() {
    if (!sessionRef.current) return;
    if (!isSpeechAvailable()) {
      setShowMicDialog(true);
      return;
    }
    const enabled = toggleSpeech();
    setSpeechPreference(enabled);
    setIsSpeechEnabled(enabled);
  }

  async function _initSpeechAfterDialog() {
    try {
      await initSpeech(
        (text: string) => sessionRef.current?.prompt(text),
        (_text: string) => { /* onStopTalking */ }
      );
      enableSpeech();
      setSpeechPreference(true);
      setIsSpeechEnabled(true);
    } catch (e) {
      console.error('Speech init failed:', e);
      alert('Could not access microphone. Check your browser permissions.');
    }
  }

  function _onEndTurn() {
    if (!sessionRef.current || battleOver) return;
    sessionRef.current.endTurn();
  }

  function _onReadyClick() {
    sendGameMessage({ type: 'READY' });
    setIAmReady(true);
  }

  function _onLobbyMicClick() {
    if (micGranted) return;
    setShowMicDialog(true);
  }

  async function _onMicDialogApprove() {
    setShowMicDialog(false);
    // 1) Mesh peer audio (always)
    const stream = await ensureLocalStream();
    setMicGranted(stream !== null);
    // 2) Speech recognition (only meaningful while a session is running)
    if (sessionRef.current) {
      await _initSpeechAfterDialog();
    }
    if (stream === null) {
      alert('Could not access microphone. Check your browser permissions.');
    }
  }

  function _onSendChat() {
    const text = chatDraft.trim();
    if (!text) return;
    sendChat(text);
    setChatDraft('');
  }

  // Multiplayer lobby/waiting screens (rendered before BattleSession exists)
  if (isMultiplayer && (mpStage === 'lobby_waiting' || mpStage === 'lobby_ready' || mpStage === 'opponent_turn')) {
    let title = '';
    let subtitle = '';
    if (mpStage === 'lobby_waiting') {
      title = 'Waiting for opponent…';
      subtitle = isChallenger
        ? `Waiting for ${player2Name} to join.`
        : `Connecting to ${player2Name}…`;
    } else if (mpStage === 'lobby_ready') {
      title = 'Lobby';
      subtitle = defenderId
        ? 'Defender locked in. Attacker can start the battle.'
        : 'Waiting for someone to accept the challenge.';
      // Buttons surfaced explicitly in the JSX below
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
    function _roleFor(id: string): { label: string; emoji: string } {
      if (id === challengerIdState) return { label: 'Attacker', emoji: '🎤' };
      if (id === defenderId) return { label: 'Defender', emoji: '⚔️' };
      return { label: 'Observer', emoji: '👀' };
    }

    // Lobby action button: single Start Battle (challenger) / Accept Challenge (other) / nothing (spectator)
    const actionButton = (() => {
      if (mpStage !== 'lobby_ready') return null;
      if (isChallenger) {
        const disabled = !defenderId || iAmReady;
        return (
          <button
            className={styles.exitButton}
            onClick={_onReadyClick}
            disabled={disabled}
            style={disabled ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
          >
            {iAmReady ? 'Starting…' : 'Start Battle'}
          </button>
        );
      }
      if (!defenderId) {
        return (
          <button className={styles.exitButton} onClick={_onReadyClick}>
            Accept Challenge
          </button>
        );
      }
      // Already a defender, or I'm a spectator
      return null;
    })();

    return (
      <div className={styles.gameOver}>
        <h2 className={styles.gameOverTitle}>{title}</h2>
        <p style={{ color: '#ccc', fontSize: '2vh', textAlign: 'center', marginTop: '1vh' }}>{subtitle}</p>
        {/* Audience preview — pre-loaded so the lobby isn't an empty box */}
        {audienceMembers.length > 0 && characterSpriteset && (
          <div style={{ width: '90%', maxWidth: '50vh', height: '25vh', margin: '1vh auto' }}>
            <AudienceView characterSpriteset={characterSpriteset} audienceMembers={audienceMembers} />
          </div>
        )}
        {mpStage === 'lobby_ready' && Object.keys(lobbyPlayers).length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '2vh 0', color: '#eee', fontSize: '2vh', textAlign: 'left' }}>
            {Object.entries(lobbyPlayers).map(([id, p]) => {
              const { label, emoji } = _roleFor(id);
              const name = p.username || id.slice(0, 8);
              const youTag = id === playerId ? ' (you)' : '';
              const readyMark = p.ready ? '✓' : '○';
              return (
                <li key={id} style={{ padding: '0.5vh 0' }}>
                  <span style={{ marginRight: '1vh' }}>{readyMark}</span>
                  <span style={{ marginRight: '1vh' }}>{emoji}</span>
                  <span style={{ marginRight: '1vh' }}>{name}{youTag}</span>
                  <span style={{ color: '#999' }}>{label}</span>
                </li>
              );
            })}
          </ul>
        )}
        {Object.entries(remoteStreams).map(([id, stream]) => (
          <RemoteAudio key={id} stream={stream} />
        ))}
        <div style={{ display: 'flex', gap: '1vh', marginTop: '1vh' }}>
          <button className={styles.exitButton} onClick={_onLobbyMicClick}>
            {micGranted ? '🎙️ Mic On' : '🔇 Enable Mic'}
          </button>
          {actionButton}
        </div>
        {/* Lobby chat */}
        <div style={{ width: '90%', maxWidth: '50vh', marginTop: '2vh', background: 'rgba(0,0,0,0.3)', padding: '1vh', borderRadius: '0.5vh' }}>
          <div style={{ height: '20vh', overflowY: 'auto', fontSize: '1.6vh', color: '#eee' }}>
            {chatMessages.length === 0 && <div style={{ color: '#777' }}>No messages yet — say hi!</div>}
            {chatMessages.map((m, i) => (
              <div key={i} style={{ padding: '0.3vh 0' }}>
                <strong>{m.username}:</strong> {m.text}
              </div>
            ))}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); _onSendChat(); }}
            style={{ display: 'flex', gap: '0.5vh', marginTop: '0.5vh' }}
          >
            <input
              type="text"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder="Type a message…"
              maxLength={500}
              style={{ flex: 1, fontSize: '1.6vh', padding: '0.5vh' }}
            />
            <button type="submit" style={{ fontSize: '1.6vh', padding: '0.5vh 1vh' }}>Send</button>
          </form>
        </div>
        <button className={styles.exitButton} onClick={onExit}>Back to Menu</button>
        <MicrophonePermissionDialog
          isOpen={showMicDialog}
          onApprove={_onMicDialogApprove}
          onCancel={() => setShowMicDialog(false)}
        />
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

      {/* Controls — hidden for observers */}
      {mpStage !== 'observing' && (
        <div className={styles.inputArea}>
          <button className={styles.endTurnButton} onClick={_onToggleMic} title="Toggle microphone">
            {isSpeechEnabledState ? '🎙️ Mic On' : '🔇 Mic Off'}
          </button>
          <button className={styles.endTurnButton} onClick={_onEndTurn}>
            End Turn
          </button>
        </div>
      )}
      {mpStage === 'observing' && (
        <div className={styles.inputArea}>
          <span style={{ color: '#aaa', fontSize: '2vh' }}>👀 Watching the performance…</span>
        </div>
      )}

      {Object.entries(remoteStreams).map(([id, stream]) => (
        <RemoteAudio key={id} stream={stream} />
      ))}
      <MicrophonePermissionDialog
        isOpen={showMicDialog}
        onApprove={_onMicDialogApprove}
        onCancel={() => setShowMicDialog(false)}
      />
      <ToastPane />
    </div>
  );
}

export default BattleScreen;
