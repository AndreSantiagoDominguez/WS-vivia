/** Errores de dominio/aplicación, independientes de HTTP o WebSocket. Cada adaptador los mapea a su propio formato de respuesta. */

export class ConversationNotFoundError extends Error {
  constructor(conversationId: string) {
    super(`Conversation ${conversationId} not found`);
    this.name = 'ConversationNotFoundError';
  }
}

export class NotConversationParticipantError extends Error {
  constructor(userId: string, conversationId: string) {
    super(
      `User ${userId} is not a participant of conversation ${conversationId}`,
    );
    this.name = 'NotConversationParticipantError';
  }
}

export class SameParticipantError extends Error {
  constructor() {
    super('A conversation requires two different participants');
    this.name = 'SameParticipantError';
  }
}

export class InvalidMessageContentError extends Error {
  constructor() {
    super('Message content must be between 1 and 4000 characters');
    this.name = 'InvalidMessageContentError';
  }
}

export class InvalidCaptionError extends Error {
  constructor() {
    super('Caption must be at most 4000 characters');
    this.name = 'InvalidCaptionError';
  }
}

export class MessageNotFoundError extends Error {
  constructor(messageId: string) {
    super(`Message ${messageId} not found`);
    this.name = 'MessageNotFoundError';
  }
}

export class NotMessageSenderError extends Error {
  constructor() {
    super('Only the sender of a message can delete or edit it');
    this.name = 'NotMessageSenderError';
  }
}

export class MessageAlreadyDeletedError extends Error {
  constructor() {
    super('This message was already deleted');
    this.name = 'MessageAlreadyDeletedError';
  }
}

export class MessageDeleteWindowExpiredError extends Error {
  constructor() {
    super('This message can no longer be deleted (older than 5 minutes)');
    this.name = 'MessageDeleteWindowExpiredError';
  }
}

export class MessageEditWindowExpiredError extends Error {
  constructor() {
    super('This message can no longer be edited (older than 15 minutes)');
    this.name = 'MessageEditWindowExpiredError';
  }
}

export class CannotEditDocumentMessageError extends Error {
  constructor() {
    super('Document messages cannot be edited, only deleted');
    this.name = 'CannotEditDocumentMessageError';
  }
}

/**
 * El lessor free ya tiene el máximo de conversaciones activas (aquellas donde
 * él ya respondió) y está intentando estrenar una nueva. El cupo se consume
 * cuando el lessor manda su primer mensaje en una conversación, no cuando el
 * lessee lo contacta — por eso este error solo puede originarlo un envío del
 * propio lessor. Los adaptadores lo mapean a 402 (requiere suscripción).
 */
export class ConversationLimitReachedError extends Error {
  constructor(limit: number) {
    super(
      `Alcanzaste el límite gratuito de ${limit} conversaciones. ` +
        `Hazte Premium para responder a más lessees.`,
    );
    this.name = 'ConversationLimitReachedError';
  }
}
