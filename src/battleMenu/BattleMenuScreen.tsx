import { useState, useEffect } from "react";

import styles from './BattleMenuScreen.module.css';
import TopBar from '@/components/topBar/TopBar';
import { getFriendsList } from "@/multiplayer/friends";
import Friend from "@/multiplayer/types/Friend";
import Player from "@/multiplayer/types/Player";
import CrowdPicker from "./CrowdPicker";
import { CrowdComposition } from "@/multiplayer/types/Challenge";
import { parseSections, parseNameValueLines } from "@/common/markdownUtil";
import { baseUrl } from "@/common/urlUtil";
import { logout } from "@/multiplayer/discordAuth";

type Props = {
  player: Player | null;
  onSoloPlay: () => void;
  onChallenge: (defenderId: string, defenderName: string, crowd: CrowdComposition[]) => void;
  onAboutClick: () => void;
};

async function _onSignOut() {
  await logout();
  window.location.reload();
}

type CharacterInfo = {
  id: string;
  title: string;
};

async function _loadCharacterIds(): Promise<CharacterInfo[]> {
  const response = await fetch(baseUrl('/characters/characters.md'));
  const text = await response.text();
  const sections = parseSections(text);
  return Object.keys(sections)
    .filter(name => name !== 'General')
    .map(id => {
      const nameValues = parseNameValueLines(sections[id]);
      return { id, title: nameValues.title ?? id };
    });
}

function BattleMenuScreen({ player, onSoloPlay, onChallenge, onAboutClick }: Props) {
  const [friends] = useState<Friend[]>(getFriendsList());
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null);
  const [characters, setCharacters] = useState<CharacterInfo[]>([]);
  const [showCrowdPicker, setShowCrowdPicker] = useState(false);

  useEffect(() => {
    _loadCharacterIds().then(setCharacters);
  }, []);

  function _onFriendClick(friend: Friend) {
    setSelectedFriend(friend);
    setShowCrowdPicker(true);
  }

  function _onCrowdConfirm(crowd: CrowdComposition[]) {
    if (!selectedFriend) return;
    onChallenge(selectedFriend.discordId, selectedFriend.username, crowd);
    setShowCrowdPicker(false);
  }

  return (
    <div className={styles.container}>
      <TopBar onAboutClick={onAboutClick} />
      <div className={styles.content}>
        <h2 className={styles.title}>
          {player ? `Welcome, ${player.username}` : 'Pander'}
        </h2>
        {player && (
          <button className={styles.signOutButton} onClick={_onSignOut}>
            Sign out
          </button>
        )}

        <div className={styles.modeSection}>
          <button className={styles.soloButton} onClick={onSoloPlay}>
            Solo Play
          </button>
        </div>

        {player && (
          <div className={styles.battleSection}>
            <h3 className={styles.sectionTitle}>Challenge a Friend</h3>
            <div className={styles.friendsList}>
              {friends.map(friend => (
                <button
                  key={friend.discordId}
                  className={styles.friendButton}
                  onClick={() => _onFriendClick(friend)}
                >
                  <span className={styles.friendAvatar}>
                    {friend.avatarUrl
                      ? <img src={friend.avatarUrl} alt={friend.username} />
                      : friend.username.charAt(0).toUpperCase()
                    }
                  </span>
                  <span className={styles.friendName}>{friend.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showCrowdPicker && selectedFriend && (
        <CrowdPicker
          characters={characters}
          opponentName={selectedFriend.username}
          onConfirm={_onCrowdConfirm}
          onCancel={() => setShowCrowdPicker(false)}
        />
      )}
    </div>
  );
}

export default BattleMenuScreen;
