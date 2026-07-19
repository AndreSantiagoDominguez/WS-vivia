import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Cache de nombre/foto por usuario — ver `IUserProfileCacheRepository` para
 * el porqué de que viva aparte de `conversations` en vez de columnas
 * repetidas por fila.
 */
@Entity({ schema: 'chat', name: 'user_profile_cache' })
export class UserProfileCacheOrmEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ name: 'photo_url', type: 'text', nullable: true })
  photoUrl: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
