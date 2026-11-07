import styles from '../styles/app.module.css';

type Status = { running: boolean; upstreamOk: boolean; lastCheck?: string };

export default function StatusBar({ status }: { status: Status }) {
  return (
    <div className={styles.statusBar}>
      <span className={styles.statusItem}>
        <span className={`${styles.dot} ${status.running ? styles.dotGreen : styles.dotRed}`} />
        Proxy Running
      </span>
      <span className={styles.statusItem}>
        <span className={`${styles.dot} ${status.upstreamOk ? styles.dotGreen : styles.dotRed}`} />
        OpenRouter
      </span>
      {status.lastCheck && <span className={styles.statusItem}>Last check: {status.lastCheck}</span>}
    </div>
  );
}
