import { startDiscordLogin } from '@/multiplayer/discordAuth';
import styles from './LoginScreen.module.css';
import TopBar from '@/components/topBar/TopBar';

type Props = {
  onAboutClick: () => void;
};

function LoginScreen({ onAboutClick }: Props) {
  return (
    <div className={styles.container}>
      <TopBar onAboutClick={onAboutClick} />
      <div className={styles.content}>
        <h2 className={styles.title}>Rap Battle</h2>
        <p className={styles.subtitle}>Sign in with Discord to challenge your friends</p>
        <button className={styles.discordButton} onClick={startDiscordLogin}>
          Sign in with Discord
        </button>
      </div>
    </div>
  );
}

export default LoginScreen;
