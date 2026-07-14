import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Empareja un email (`sub` del JWT) con la identidad de usuario que el chat
 * termina usando — real (`userId` que mandó Spring Boot) o temporal (derivada
 * del email, mientras Spring Boot no mande `userId` para ese usuario). Ver
 * `JwtVerificationService` para el mecanismo completo.
 */
@Entity({ schema: 'chat', name: 'user_identities' })
export class UserIdentityOrmEntity {
  @PrimaryColumn({ type: 'varchar' })
  email: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'is_temporary', type: 'boolean', default: true })
  isTemporary: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
