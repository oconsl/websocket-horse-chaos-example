import { io, type Socket } from 'socket.io-client';
import { API_URL } from '@/lib/config';

let socket: Socket | null = null;
let currentToken: string | null = null;

/**
 * One shared Socket.IO connection for the whole app's lifetime. Pages call
 * this to get/reuse the singleton and attach their own listeners on mount,
 * removing them (never disconnecting the socket) on unmount.
 *
 * This matters because the server resolves player identity via
 * `handshake.auth.sessionToken`, not `socket.id` — but each page previously
 * called `io()`/`.disconnect()` independently, so a slow teardown of one
 * page's socket could briefly overlap with the next page's new socket,
 * making the server see the same player as two live connections at once
 * (which duplicated targeted emits like `powerup:received` client-side).
 * Reusing one socket across client-side navigation removes that window.
 */
export function getGameSocket(sessionToken: string): Socket {
  if (socket && currentToken === sessionToken) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }

  // A different (or first) session token — tear down any previous socket
  // before opening a new one.
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
  }

  currentToken = sessionToken;
  socket = io(API_URL, { auth: { sessionToken }, autoConnect: true });

  // Fires on the initial connect AND on every Socket.IO auto-reconnect
  // (e.g. after a dropped connection or a refresh that raced the old
  // socket's teardown). The server re-resolves identity from the
  // sessionToken on each new socket.id, so this is the client-side signal
  // to ask for a state snapshot to rehydrate from (design doc §16).
  socket.on('connect', () => {
    socket?.emit('session:resume');
  });

  return socket;
}

/** Only for tab close / explicit logout — never call this on plain navigation. */
export function disconnectGameSocket(): void {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  currentToken = null;
}
