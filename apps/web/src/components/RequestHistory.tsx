import { useState, useEffect } from 'react';
import styles from '../styles/app.module.css';

type RequestEntry = {
  time: string; model: string; status: number; duration?: string; ctxTokens?: number; error?: string;
  inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number; cost?: number;
};

const fmtCtx = (n?: number) => n === undefined ? '-' : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n);
const fmtCost = (n?: number) => n === undefined ? '-' : `$${n.toFixed(4)}`;

export default function RequestHistory() {
  const [requests, setRequests] = useState<RequestEntry[]>([]);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const r = await fetch('/api/requests');
      if (r.ok) setRequests(await r.json());
    } catch { /* */ }
  }

  async function clear() {
    await fetch('/api/requests/clear', { method: 'POST' });
    setRequests([]);
  }

  if (requests.length === 0) return null;

  return (
    <section>
      <h2 style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Recent Requests</span>
        <button onClick={clear}>Clear</button>
      </h2>
      <table>
        <thead>
          <tr><th>Time</th><th>Model</th><th>Status</th><th>Context</th><th>In</th><th>Out</th><th>Cached</th><th>Cost</th><th>Duration</th></tr>
        </thead>
        <tbody>
          {requests.map((r, i) => (
            <tr key={i}>
              <td>{r.time}</td>
              <td>{r.model}</td>
              <td><span className={`${styles.badge} ${r.status < 400 ? styles.badgeOk : styles.badgeErr}`}>{r.status}</span></td>
              <td title={r.ctxTokens ? `${r.ctxTokens} tokens` : ''}>{fmtCtx(r.ctxTokens)}</td>
              <td>{fmtCtx(r.inputTokens)}</td>
              <td>{fmtCtx(r.outputTokens)}</td>
              <td>{fmtCtx(r.cachedInputTokens)}</td>
              <td>{fmtCost(r.cost)}</td>
              <td>{r.duration || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
