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
