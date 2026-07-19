import { Injectable } from '@nestjs/common';
import { AuthenticatedWebSocket } from '../auth/authenticated-websocket';

/**
 * Reemplazo manual de las "rooms" de Socket.io: `ws` no tiene ese concepto,
 * así que este servicio mantiene en memoria quién está conectado y a qué
 * conversaciones se unió cada cliente.
 *
 * IMPORTANTE: esta implementación solo es correcta mientras el backend corra
 * en una única instancia — el estado vive en el heap del proceso. Si el
 * servicio se escala horizontalmente a varias instancias, hace falta un
 * mecanismo externo (p. ej. Redis pub/sub) para sincronizar conversaciones y
 * presencia entre procesos. Eso queda fuera de este alcance.
 */
@Injectable()
export class ConnectionRegistryService {
  private readonly conversationClients = new Map<
    string,
    Set<AuthenticatedWebSocket>
  >();
  private readonly userClients = new Map<string, Set<AuthenticatedWebSocket>>();
  private readonly allClients = new Set<AuthenticatedWebSocket>();

  /** Registra la conexión recién autenticada para presencia y heartbeat. Llamar desde `handleConnection`. */
  registerConnection(client: AuthenticatedWebSocket): void {
    this.allClients.add(client);
    let set = this.userClients.get(client.userId);
    if (!set) {
      set = new Set();
      this.userClients.set(client.userId, set);
    }
    set.add(client);
  }

  addToConversation(
    conversationId: string,
    client: AuthenticatedWebSocket,
  ): void {
    let set = this.conversationClients.get(conversationId);
    if (!set) {
      set = new Set();
      this.conversationClients.set(conversationId, set);
    }
    set.add(client);
  }

  removeFromConversation(
    conversationId: string,
    client: AuthenticatedWebSocket,
  ): void {
    const set = this.conversationClients.get(conversationId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) {
      this.conversationClients.delete(conversationId);
    }
  }

  /**
   * `excludeUserId` es por `userId`, no por conexión puntual — así, si el
   * mismo usuario tiene la conversación abierta en dos dispositivos a la
   * vez, ninguno de los dos recibe el eco de su propia acción (evita el bug
   * de ver tu propio mensaje/borrado/edición duplicado en tu pantalla). El
   * actor se entera del resultado por `sendToUser`, nunca por este broadcast.
   */
  broadcastToConversation(
    conversationId: string,
    message: unknown,
    excludeUserId?: string,
  ): void {
    const set = this.conversationClients.get(conversationId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const client of set) {
      if (client.userId === excludeUserId) continue;
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  /** Manda a **todas** las conexiones activas de `userId` (todos sus dispositivos), no solo a la que originó la acción. */
  sendToUser(userId: string, message: unknown): void {
    const set = this.userClients.get(userId);
    if (!set) return;
    const payload = JSON.stringify(message);
    for (const client of set) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  isUserOnline(userId: string): boolean {
    const set = this.userClients.get(userId);
    return !!set && set.size > 0;
  }

  getAllClients(): ReadonlySet<AuthenticatedWebSocket> {
    return this.allClients;
  }

  /** Limpieza completa en `handleDisconnect`: quita al cliente de toda conversación y de presencia. */
  removeClient(client: AuthenticatedWebSocket): void {
    this.allClients.delete(client);

    for (const [conversationId, set] of this.conversationClients) {
      if (set.delete(client) && set.size === 0) {
        this.conversationClients.delete(conversationId);
      }
    }

    const userSet = this.userClients.get(client.userId);
    if (userSet) {
      userSet.delete(client);
      if (userSet.size === 0) {
        this.userClients.delete(client.userId);
      }
    }
  }
}
