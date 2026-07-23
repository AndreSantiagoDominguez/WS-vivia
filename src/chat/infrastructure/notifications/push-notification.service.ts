import { Inject, Injectable, Logger } from '@nestjs/common';
import { Message } from '../../domain/entities/message.entity';
import {
  CONVERSATION_REPOSITORY,
  IConversationRepository,
} from '../../domain/repositories/conversation.repository';
import { ConnectionRegistryService } from '../websocket/connection-registry.service';
import { FirebaseAdminService } from './firebase-admin.service';
import { UsersFcmTokenRepository } from './users-fcm-token.repository';

/** Contenido genérico (español MX) — no se expone el contenido del mensaje. */
const NOTIFICATION_TITLE = 'Vivia';
const NOTIFICATION_BODY = 'Tienes un nuevo mensaje';

/**
 * Orquesta el envío de push notifications vía FCM cuando llega un mensaje.
 *
 * Regla de disparo (corregida): se notifica solo si el destinatario **no está
 * unido a esta conversación puntual** (`isUserInConversation`) — tener el
 * WebSocket conectado no es suficiente para saltarse el push, porque puede
 * estar online pero viendo otra pantalla (la lista de chats, u otra
 * conversación) sin haber mandado `joinConversation` para esta. Usar
 * `isUserOnline` ahí producía el bug real: el usuario no recibía el mensaje
 * en vivo (no estaba en el room) y tampoco el push (se asumía que sí lo
 * recibiría), quedándose sin enterarse de nada hasta reabrir la app.
 *
 * `notifyNewMessage` es fire-and-forget: nunca lanza, para no afectar el flujo
 * de envío de mensajes. Los call sites lo invocan con `void`.
 */
@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly usersFcmTokenRepository: UsersFcmTokenRepository,
    private readonly connectionRegistry: ConnectionRegistryService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversationRepository: IConversationRepository,
  ) {}

  async notifyNewMessage(message: Message): Promise<void> {
    try {
      const messaging = this.firebaseAdmin.getMessaging();
      if (!messaging) return; // push deshabilitado

      const conversation = await this.conversationRepository.findById(
        message.conversationId,
      );
      if (!conversation) return;

      const recipientId = conversation.otherParticipantId(message.senderId);

      // Unido a ESTA conversación → ya recibe el mensaje en vivo por el
      // broadcast, no se notifica. Estar "online" en general no basta (ver
      // comentario de la clase).
      if (
        this.connectionRegistry.isUserInConversation(
          message.conversationId,
          recipientId,
        )
      ) {
        return;
      }

      const token = await this.usersFcmTokenRepository.getToken(recipientId);
      if (!token) return;

      await messaging.send({
        token,
        notification: {
          title: NOTIFICATION_TITLE,
          body: NOTIFICATION_BODY,
        },
        data: {
          conversationId: message.conversationId,
        },
      });
    } catch (error) {
      // Incluye tokens inválidos/expirados (messaging/registration-token-not-registered).
      // No se escribe en la DB externa (es de otro servicio): solo se loggea.
      this.logger.error(
        `No se pudo enviar la push notification del mensaje ${message.id}`,
        error as Error,
      );
    }
  }
}
