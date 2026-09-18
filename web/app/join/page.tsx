'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { API_URL } from '@/lib/config';
import { useSessionStore } from '@/store/session';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

type Mode = 'login' | 'register';

export default function JoinPage() {
  const router = useRouter();
  const setSession = useSessionStore((state) => state.setSession);

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/sessions/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        setError(
          mode === 'login' ? 'Usuario o contraseña inválidos' : 'No se pudo crear la cuenta',
        );
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
        <p className="subtitle">
          {mode === 'login' ? 'Iniciá sesión para entrar al lobby' : 'Creá tu cuenta para entrar al lobby'}
        </p>

        <div className="join-tabs">
          <button
            type="button"
            className={`join-tab${mode === 'login' ? ' join-tab--active' : ''}`}
            onClick={() => {
              setMode('login');
              setError(null);
            }}
          >
            Iniciar sesión
          </button>
          <button
            type="button"
            className={`join-tab${mode === 'register' ? ' join-tab--active' : ''}`}
            onClick={() => {
              setMode('register');
              setError(null);
            }}
          >
            Registrarse
          </button>
        </div>

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
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Contraseña"
            minLength={6}
            maxLength={72}
            required
          />
          <Button type="submit" disabled={loading}>
            {loading
              ? 'ENTRANDO...'
              : mode === 'login'
                ? 'INICIAR SESIÓN'
                : 'CREAR CUENTA'}
          </Button>
        </form>

        {error && <p className="error">{error}</p>}
      </Card>
    </main>
  );
}
