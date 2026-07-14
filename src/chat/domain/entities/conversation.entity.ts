export interface ConversationProps {
  id: string;
  participantOneId: string;
  participantOneRole: string;
  participantTwoId: string;
  participantTwoRole: string;
  propertyId: string | null;
  propertyTitle: string | null;
  lastMessageAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Conversación 1:1 entre dos usuarios de Vivia. No conoce Postgres ni ws.
 * `participantOneId` es siempre el UUID menor de los dos (ver `orderParticipants`),
 * lo que permite el índice único (participant_one_id, participant_two_id)
 * sin importar quién inició la conversación.
 */
export class Conversation {
  readonly id: string;
  readonly participantOneId: string;
  readonly participantOneRole: string;
  readonly participantTwoId: string;
  readonly participantTwoRole: string;
  readonly propertyId: string | null;
  readonly propertyTitle: string | null;
  lastMessageAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ConversationProps) {
    this.id = props.id;
    this.participantOneId = props.participantOneId;
    this.participantOneRole = props.participantOneRole;
    this.participantTwoId = props.participantTwoId;
    this.participantTwoRole = props.participantTwoRole;
    this.propertyId = props.propertyId;
    this.propertyTitle = props.propertyTitle;
    this.lastMessageAt = props.lastMessageAt;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /**
   * Ordena dos participantes por UUID (string compare) para que el par
   * (participantOneId, participantTwoId) sea determinístico sin importar
   * quién de los dos inició la conversación.
   */
  static orderParticipants(
    a: { userId: string; role: string },
    b: { userId: string; role: string },
  ): {
    participantOneId: string;
    participantOneRole: string;
    participantTwoId: string;
    participantTwoRole: string;
  } {
    const [first, second] = a.userId < b.userId ? [a, b] : [b, a];
    return {
      participantOneId: first.userId,
      participantOneRole: first.role,
      participantTwoId: second.userId,
      participantTwoRole: second.role,
    };
  }

  hasParticipant(userId: string): boolean {
    return this.participantOneId === userId || this.participantTwoId === userId;
  }

  otherParticipantId(userId: string): string {
    if (this.participantOneId === userId) return this.participantTwoId;
    if (this.participantTwoId === userId) return this.participantOneId;
    throw new Error(
      `userId ${userId} is not a participant of conversation ${this.id}`,
    );
  }

  otherParticipant(userId: string): { userId: string; role: string } {
    if (this.participantOneId === userId) {
      return { userId: this.participantTwoId, role: this.participantTwoRole };
    }
    if (this.participantTwoId === userId) {
      return { userId: this.participantOneId, role: this.participantOneRole };
    }
    throw new Error(
      `userId ${userId} is not a participant of conversation ${this.id}`,
    );
  }
}
