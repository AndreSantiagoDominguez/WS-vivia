/** Token de inyección de dependencias — la interfaz no puede usarse como valor en Nest. */
export const USER_PROFILE_CACHE_REPOSITORY = Symbol(
  'USER_PROFILE_CACHE_REPOSITORY',
);

export interface UpsertUserProfileData {
  userId: string;
  name: string;
  photoUrl: string | null;
}

/**
 * Nombre/foto de un usuario, tal como los mandó el cliente la última vez que
 * tuvo esa info a la mano (típicamente al crear una conversación, sacándolos
 * de `GET /properties/:id` o de su propia sesión). Una sola fila por
 * `userId`, sin importar en cuántas conversaciones aparezca — así una
 * actualización se refleja para todas sus conversaciones a la vez, en vez de
 * quedar pegada por separado en cada una.
 */
export interface IUserProfileCacheRepository {
  upsert(data: UpsertUserProfileData): Promise<void>;
}
