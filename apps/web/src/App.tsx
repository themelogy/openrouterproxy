import { useState, useEffect } from 'react';
import StatusBar from './components/StatusBar';
import ApiKeySettings from './components/ApiKeySettings';
import ModelSettings from './components/ModelSettings';
import ProxySettings from './components/ProxySettings';
import RequestHistory from './components/RequestHistory';
import LaunchCommand from './components/LaunchCommand';
import styles from './styles/app.module.css';

type Config = {
  server: { host: string; port: number; timeoutMs?: number; bodyLimit?: number };
  openrouter: { baseUrl: string; apiKey: string };
  models: { opus: string | { id: string }; sonnet: string | { id: string }; haiku: string | { id: string } };
  enablePromptCaching?: boolean;
};

type Status = { running: boolean; upstreamOk: boolean; lastCheck?: string };

const TABS = [
  { key: 'settings', label: 'Settings' },
  { key: 'models', label: 'Models' },
  { key: 'proxy', label: 'Proxy' },
  { key: 'launch', label: 'Launch' },
  { key: 'history', label: 'History' },
] as const;

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [status, setStatus] = useState<Status>({ running: true, upstreamOk: false });
  const [tab, setTab] = useState('settings');
  const [saveMsg, setSaveMsg] = useState('');

  useEffect(() => { loadConfig(); loadStatus(); }, []);
  useEffect(() => { if (saveMsg) { const t = setTimeout(() => setSaveMsg(''), 3000); return () => clearTimeout(t); } }, [saveMsg]);

  async function loadConfig() {
    try { const r = await fetch('/api/config'); if (r.ok) setConfig(await r.json()); } catch { /* */ }
  }

  async function loadStatus() {
    try { const r = await fetch('/api/status'); if (r.ok) setStatus(await r.json()); } catch { /* */ }
  }

  async function handleSave(partial: Partial<Config>) {
    try {
      const r = await fetch('/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(partial) });
      if (r.ok) { setSaveMsg('Saved'); loadConfig(); }
    } catch { /* */ }
  }

  async function testConnection() {
    try {
      const r = await fetch('/api/test-connection', { method: 'POST' });
      const data = await r.json();
      alert(data.ok ? 'Connected to OpenRouter' : `Connection failed: ${data.error}`);
      loadStatus();
    } catch { alert('Network error'); }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1>Claude Code Proxy</h1>
      </header>

      <StatusBar status={status} />

      {config ? (<>
        <nav className={styles.tabs}>
          {TABS.map(t => (
            <button key={t.key} className={tab === t.key ? styles.tabActive : ''} onClick={() => setTab(t.key)}>{t.label}</button>
          ))}
        </nav>

        <div className={styles.tabContent}>
          {tab === 'settings' && (
            <ApiKeySettings config={config} onSave={handleSave} onTestConnection={testConnection} />
          )}
          {tab === 'models' && (
            <ModelSettings config={config} onSave={handleSave} />
          )}
          {tab === 'proxy' && (
            <ProxySettings config={config} onSave={handleSave} />
          )}
          {tab === 'launch' && (
            <LaunchCommand />
          )}
          {tab === 'history' && (
            <RequestHistory />
          )}
        </div>
      </>) : (
        <div className={styles.loading}>Loading configuration...</div>
      )}

      {saveMsg && <div className={styles.toast}>{saveMsg}</div>}
    </div>
  );
}
