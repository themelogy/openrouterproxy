import { useState, useEffect } from 'react';
import styles from '../styles/app.module.css';

type Config = { openrouter: { apiKey: string; baseUrl: string } };

export default function ApiKeySettings({ config, onSave, onTestConnection }: {
  config: Config;
  onSave: (partial: Partial<Config>) => void;
  onTestConnection: () => void;
}) {
  const [apiKey, setApiKey] = useState(config.openrouter.apiKey);
  const [baseUrl, setBaseUrl] = useState(config.openrouter.baseUrl);

  useEffect(() => {
    setApiKey(config.openrouter.apiKey);
    setBaseUrl(config.openrouter.baseUrl);
  }, [config]);

  return (
    <section>
      <h2>OpenRouter Settings</h2>
      <div className={styles.field}>
        <label>API Key</label>
        <input type="text" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-or-v1-..." />
      </div>
      <div className={styles.field}>
        <label>Base URL</label>
        <input type="text" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
      </div>
      <div className={styles.row}>
        <button onClick={() => onSave({ openrouter: { apiKey, baseUrl } })} className={styles.primary}>Save</button>
        <button onClick={onTestConnection}>Test Connection</button>
      </div>
    </section>
  );
}
