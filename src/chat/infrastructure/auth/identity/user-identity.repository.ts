/** Token de inyección de dependencias — la interfaz no puede usarse como valor en Nest. */
export const USER_IDENTITY_REPOSITORY = Symbol('USER_IDENTITY_REPOSITORY');

export interface UserIdentityRecord {
  userId: string;
  isTemporary: boolean;
}

export interface IUserIdentityRepository {
  findByEmail(email: string): Promise<UserIdentityRecord | null>;

  /** Deriva el UUID temporal, inserta la fila, y devuelve el `userId` temporal. */
  createTemporary(email: string): Promise<string>;

  /** Pasa la fila de `email` a `isTemporary = false` con el `userId` real. */
  markResolved(email: string, realUserId: string): Promise<void>;
}
