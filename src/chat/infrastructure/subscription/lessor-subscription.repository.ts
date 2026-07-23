/** Token de inyección de dependencias — la interfaz no puede usarse como valor en Nest. */
export const LESSOR_SUBSCRIPTION_REPOSITORY = Symbol(
  'LESSOR_SUBSCRIPTION_REPOSITORY',
);

/**
 * Estado de suscripción de un lessor. `UNKNOWN` NO es "no premium": significa
 * que no se pudo consultar (base inaccesible, tabla ausente). Se modela aparte
 * a propósito, porque confundirlo con `FREE` bloquea a lessors premium por una
 * falla de infraestructura ajena al chat (ver `ConversationLimitGuard`).
 */
export type PremiumStatus = 'PREMIUM' | 'FREE' | 'UNKNOWN';

/**
 * Acceso de solo lectura al estado premium de un lessor. La fuente de verdad
 * (`public.lessor_subscriptions`) es propiedad del backend `vivia` y vive en SU
 * base Postgres, la misma que `users` — NO en la del chat (ver
 * `ViviaDatabaseService`).
 */
export interface ILessorSubscriptionRepository {
  /** `PREMIUM` si el lessor tiene `premium_until` en el futuro. */
  getPremiumStatus(lessorId: string): Promise<PremiumStatus>;
}
