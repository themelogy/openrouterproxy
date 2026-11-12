import { useRef, useState } from 'react';
import styles from '../styles/app.module.css';

export default function BackupSettings({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function doImport(file: File) {
    setError('');
    setMsg('');
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setError('Not a valid JSON file');
      return;
    }
    const r = await fetch('/api/config/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(parsed),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(body.error || 'Import failed');
      return;
    }
    setMsg('Configuration imported. Local API key was kept.');
    onImported();
  }

  return (
    <section>
      <h2>Backup</h2>
      <div className={styles.row}>
        <button onClick={() => { window.location.href = '/api/config/export'; }}>Export config</button>
        <button onClick={() => fileRef.current?.click()}>Import config</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) doImport(f); e.target.value = ''; }}
        />
      </div>
      <div className={styles.hint}>
        The exported file excludes your OpenRouter API key. Importing keeps the key already saved on this machine.
      </div>
      {error && <div className={styles.hint} style={{ color: 'var(--red)' }}>{error}</div>}
      {msg && <div className={styles.hint} style={{ color: 'var(--green)' }}>{msg}</div>}
    </section>
  );
}
