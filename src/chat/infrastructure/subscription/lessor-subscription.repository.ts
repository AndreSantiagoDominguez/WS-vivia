/** Token de inyección de dependencias — la interfaz no puede usarse como valor en Nest. */
export const LESSOR_SUBSCRIPTION_REPOSITORY = Symbol(
  'LESSOR_SUBSCRIPTION_REPOSITORY',
);

/**
 * Acceso de solo lectura al estado premium de un lessor. La fuente de verdad
 * (`public.lessor_subscriptions`) es propiedad del backend `vivia`, pero vive
 * en la MISMA base Postgres que el chat, así que se lee con la DataSource
 * existente sin salto HTTP (ver `TypeOrmLessorSubscriptionRepository`).
 */
export interface ILessorSubscriptionRepository {
  /** `true` si el lessor tiene `premium_until` en el futuro. */
  isPremiumActive(lessorId: string): Promise<boolean>;
}
