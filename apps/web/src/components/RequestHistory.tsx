import { useState, useEffect } from 'react';
import styles from '../styles/app.module.css';

type RequestEntry = { time: string; model: string; status: number; duration?: string; error?: string };

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
          <tr><th>Time</th><th>Model</th><th>Status</th><th>Duration</th></tr>
        </thead>
        <tbody>
          {requests.map((r, i) => (
            <tr key={i}>
              <td>{r.time}</td>
              <td>{r.model}</td>
              <td><span className={`${styles.badge} ${r.status < 400 ? styles.badgeOk : styles.badgeErr}`}>{r.status}</span></td>
              <td>{r.duration || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
