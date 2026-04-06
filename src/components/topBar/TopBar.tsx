import styles from './TopBar.module.css';

type Props = {
  onAboutClick: () => void;
}

function TopBar({ onAboutClick }: Props) {
  return (
    <div className={styles.bar}>
      <h1 className={styles.title}>Pander</h1>
      <div className={styles.links}>
        <a className={styles.link} href="https://storage.googleapis.com/santyx-landing/turkey/index.html">Home</a>
        <button className={styles.link} onClick={onAboutClick}>About</button>
        <a className={styles.link} href="https://github.com/Syntax753/pander/issues" target="_blank" rel="noreferrer">Support</a>
      </div>
    </div>
  );
}

export default TopBar;
