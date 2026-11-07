import { useState, useEffect } from 'react';
import styles from '../styles/app.module.css';

type ModelValue = string | { id: string };

type LaunchCfg = {
  server: { host: string; port: number; timeoutMs?: number };
  openrouter: { apiKey: string };
  models: { opus: ModelValue; sonnet: ModelValue; haiku: ModelValue };
};

function modelId(val: ModelValue): string {
  return typeof val === 'object' ? (val.id || '') : (val || '');
}

export default function LaunchCommand() {
  const [copied, setCopied] = useState(false);
  const [config, setConfig] = useState<LaunchCfg | null>(null);

  useEffect(() => {
    fetch('/api/config').then(r => r.ok ? r.json() : null).then(setConfig);
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

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Claude Code Launch Command</h2>
        <button className={styles.button} onClick={handleCopy}>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className={styles.codeBlock}>{buildCommand()}</pre>
    </section>
  );
}
