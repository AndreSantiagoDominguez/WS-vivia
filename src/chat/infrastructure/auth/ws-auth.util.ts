import { IncomingMessage } from 'http';

/**
 * Extrae el bearer token del handshake de WebSocket. A diferencia de Socket.io,
 * `ws` expone el `IncomingMessage` original del handshake HTTP en `handleConnection`,
 * así que el token viaja como header estándar (`Authorization: Bearer <token>`)
 * y no como query param — evita que quede registrado en logs de acceso de
 * proxies/load balancers.
 */
export function extractBearerToken(request: IncomingMessage): string | null {
  const header = request.headers.authorization;
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

/**
 * Fallback para clientes que corren en un navegador: la API `WebSocket` del
 * navegador no permite fijar headers custom en el handshake (a diferencia de
 * `IOWebSocketChannel` en Flutter), así que el único header de este handshake
 * que sí puede controlar es `Sec-WebSocket-Protocol`. Un cliente de prueba en
 * el navegador puede mandar el token ahí (`new WebSocket(url, [token])`) y el
 * servidor lo toma como si fuera el bearer token. Ver `handleProtocols` en
 * `chat.gateway.ts`, necesario para que el navegador acepte el handshake.
 */
export function extractProtocolToken(request: IncomingMessage): string | null {
  const header = request.headers['sec-websocket-protocol'];
  if (!header) {
    return null;
  }
  const [token] = header.split(',');
  const trimmed = token?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}
