import { useState, useEffect } from 'react';
import styles from '../styles/app.module.css';

type ModelValue = string | { id: string };

type LaunchCfg = {
  server: { host: string; port: number; timeoutMs?: number };
  openrouter: { apiKey: string };
  models: { opus: ModelValue; sonnet: ModelValue; haiku: ModelValue };
};

type DesktopStatus = { installed: boolean; enabled: boolean };

function modelId(val: ModelValue): string {
  return typeof val === 'object' ? (val.id || '') : (val || '');
}

export default function LaunchCommand() {
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<LaunchCfg | null>(null);
  const [desktop, setDesktop] = useState<DesktopStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/config').then(r => r.ok ? r.json() : null).then(setConfig);
    fetch('/api/claude-desktop').then(r => r.ok ? r.json() : null).then(setDesktop);
  }, []);

  function buildCommand(): string {
    if (!config) return 'Loading...';
    const base = `http://${config.server.host}:${config.server.port}`;
    const opus = modelId(config.models.opus) || 'openrouter/your-opus-model';
    const sonnet = modelId(config.models.sonnet) || 'openrouter/your-sonnet-model';
    const haiku = modelId(config.models.haiku) || 'openrouter/your-haiku-model';
    // Proxy kendi API anahtarını kullanır; istemci token'ı yalnızca yerel erişim kontrolü içindir
    const apiKey = 'placeholder';

    return [
      `ANTHROPIC_BASE_URL='${base}'`,
      `ANTHROPIC_AUTH_TOKEN='${apiKey}'`,
      `ANTHROPIC_DEFAULT_OPUS_MODEL='${opus}'`,
      `ANTHROPIC_DEFAULT_SONNET_MODEL='${sonnet}'`,
      `ANTHROPIC_DEFAULT_HAIKU_MODEL='${haiku}'`,
      `API_TIMEOUT_MS=${config.server.timeoutMs || 3000000}`,
      `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
      'claude --disallowedTools LSP',
    ].join(' ');
  }

  function handleCopy() {
    const cmd = buildCommand();
    navigator.clipboard.writeText(cmd).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function toggleDesktop(enabled: boolean) {
    setBusy(true);
    setError(null);
    fetch('/api/claude-desktop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    })
      .then(async r => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error || 'Failed');
        setDesktop(body);
      })
      .catch(e => setError((e as Error).message))
      .finally(() => setBusy(false));
  }

  return (
    <>
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Claude Code Launch Command</h2>
          <button className={styles.button} onClick={handleCopy}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className={styles.codeBlock}>{buildCommand()}</pre>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Claude Desktop</h2>
        </div>
        <label className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={!!desktop?.enabled}
            disabled={!desktop?.installed || busy}
            onChange={e => toggleDesktop(e.target.checked)}
          />
          Route Claude Desktop through this proxy
        </label>
        {desktop && !desktop.installed && (
          <div className={styles.hint}>Claude Desktop 3P config not found on this machine.</div>
        )}
        {desktop?.installed && (
          <div className={styles.hint}>
            Turning this off restores the settings Claude Desktop had before.
            Restart the app after changing it. Models appear as claude-opus / claude-sonnet / claude-haiku.
          </div>
        )}
        {error && <div className={styles.hint}>{error}</div>}
      </section>
    </>
  );
}
