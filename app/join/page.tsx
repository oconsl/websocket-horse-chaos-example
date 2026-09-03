'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import { useSessionStore } from '@/store/session';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

export default function JoinPage() {
  const router = useRouter();
  const setSession = useSessionStore((state) => state.setSession);

  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });

      if (!res.ok) {
        setError('Username inválido');
        setLoading(false);
        return;
      }

      const data = await res.json();
      setSession({
        playerId: data.playerId,
        username: data.username,
        coins: data.coins,
        sessionToken: data.sessionToken,
      });
      router.push('/lobby');
    } catch {
      setError('No se pudo conectar con el servidor');
      setLoading(false);
    }
  }

  return (
    <main className="join-page">
      <Card className="join-card">
        <h1>Horse Chaos</h1>
        <p className="subtitle">Ingresá tu nombre para entrar al lobby</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Nombre de usuario"
            maxLength={20}
            required
            autoFocus
          />
          <Button type="submit" disabled={loading}>
            {loading ? 'ENTRANDO...' : 'ENTRAR'}
          </Button>
        </form>

        {error && <p className="error">{error}</p>}
      </Card>
    </main>
  );
}
