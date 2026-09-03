import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';

export function createGameSocket(sessionToken: string): Socket {
  return io(API_URL, {
    auth: { sessionToken },
    autoConnect: true,
  });
}
