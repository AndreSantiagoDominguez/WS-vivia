import { WebSocket } from 'ws';

/**
 * `ws.WebSocket` no tiene un lugar estándar para colgar datos custom como el
 * `client.data` de Socket.io, así que extendemos el tipo con lo que el gateway
 * necesita después de verificar el JWT en `handleConnection`.
 */
export interface AuthenticatedWebSocket extends WebSocket {
  userId: string;
  role: string;
  /** Usado por el heartbeat: se marca en `pong` y se revisa antes del siguiente ping. */
  isAlive: boolean;
}
