import { useState } from 'react';
import styles from '../styles/app.module.css';

type Config = { server: { host: string; port: number; timeoutMs?: number } };

export default function ProxySettings({ config, onSave }: {
  config: Config;
  onSave: (partial: Partial<Config>) => void;
}) {
  const [server, setServer] = useState(config.server);

  return (
    <section>
      <h2>Proxy Settings</h2>
      <div className={styles.row}>
        <div className={styles.field}>
          <label>Host</label>
          <input type="text" value={server.host} onChange={e => setServer({ ...server, host: e.target.value })} />
        </div>
        <div className={styles.field}>
          <label>Port</label>
          <input type="text" value={server.port} onChange={e => setServer({ ...server, port: parseInt(e.target.value) || 4000 })} />
        </div>
      </div>
      <div className={styles.field}>
        <label>Request Timeout (ms)</label>
        <input type="text" value={server.timeoutMs} onChange={e => setServer({ ...server, timeoutMs: parseInt(e.target.value) || 3000000 })} />
      </div>
      <button onClick={() => onSave({ server })} className={styles.primary}>Save Proxy Settings</button>
    </section>
  );
}
