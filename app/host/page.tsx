'use client';

import { useState } from 'react';
import { API_URL } from '@/lib/config';

/**
 * Minimal, unstyled host/admin panel — just enough to drive open-betting /
 * close-betting for the classroom demo. The full host panel mockup comes
 * in a later phase; no auth is required, matching the admin REST routes.
 */
export default function HostPage() {
  const [raceId, setRaceId] = useState('');
  const [status, setStatus] = useState('');
  const [log, setLog] = useState<string[]>([]);

  function appendLog(entry: string) {
    setLog((prev) => [entry, ...prev].slice(0, 20));
  }

  async function call(path: string, options?: RequestInit) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        ...options,
      });
      const data = await res.json();
      appendLog(`${res.status} ${path} -> ${JSON.stringify(data)}`);
      return data;
    } catch (err) {
      appendLog(`ERROR ${path} -> ${String(err)}`);
      return null;
    }
  }

  async function createRace() {
    const data = await call('/admin/races');
    if (data?.id) {
      setRaceId(data.id);
      setStatus(data.status);
    }
  }

  async function openBetting() {
    if (!raceId) return;
    const data = await call(`/admin/races/${raceId}/open-betting`);
    if (data?.status) setStatus(data.status);
  }

  async function closeBetting() {
    if (!raceId) return;
    const data = await call(`/admin/races/${raceId}/close-betting`);
    if (data?.status) setStatus(data.status);
  }

  async function startRace() {
    if (!raceId) return;
    const data = await call(`/admin/races/${raceId}/start`);
    if (data?.status) setStatus(data.status);
  }

  return (
    <main style={{ padding: '2rem', paddingTop: '3.75rem', fontFamily: 'monospace' }}>
      <h1>Host panel (demo)</h1>
      <p>Race ID: {raceId || '(none)'}</p>
      <p>Status: {status || '(none)'}</p>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        <button type="button" onClick={createRace}>
          1. Crear carrera
        </button>
        <button type="button" onClick={openBetting} disabled={!raceId}>
          2. Abrir apuestas
        </button>
        <button type="button" onClick={closeBetting} disabled={!raceId}>
          3. Cerrar apuestas
        </button>
        <button type="button" onClick={startRace} disabled={!raceId}>
          4. Iniciar carrera
        </button>
      </div>

      <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8rem', opacity: 0.8 }}>
        {log.join('\n')}
      </pre>
    </main>
  );
}
