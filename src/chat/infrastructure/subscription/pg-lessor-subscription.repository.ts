import { Injectable, Logger } from '@nestjs/common';
import { ViviaDatabaseService } from '../external-db/vivia-database.service';
import {
  ILessorSubscriptionRepository,
  PremiumStatus,
} from './lessor-subscription.repository';

/**
 * Lee `public.lessor_subscriptions` de la base del backend `vivia`
 * (`ViviaDatabaseService`), NO de la del chat: son dos Postgres distintos y esa
 * tabla solo existe del lado de `vivia` (migración `V27__create_lessor_subscriptions_table`,
 * con FK hacia `lessors` → `users`). Consultarla en la DataSource del chat
 * fallaba con `relation "public.lessor_subscriptions" does not exist`, y como
 * ese error se traducía a "no premium", el límite free terminaba bloqueando a
 * TODOS los lessors, premium incluidos.
 *
 * `user_id` es el mismo UUID que viaja en el claim `userId` del JWT, así que se
 * consulta directo. Query cruda sobre una columna de una tabla cuyo esquema es
 * de otro servicio: no hay entidad ni migración que mantener de este lado.
 */
@Injectable()
export class PgLessorSubscriptionRepository implements ILessorSubscriptionRepository {
  private readonly logger = new Logger(PgLessorSubscriptionRepository.name);

  constructor(private readonly viviaDatabase: ViviaDatabaseService) {}

  /**
   * Mismo criterio que `SubscriptionServiceImpl.isPremiumActive` del backend
   * Java: premium si `premium_until` está en el futuro. Sin fila → `FREE`.
   * Si la consulta falla → `UNKNOWN`, y el guard decide (hoy: no bloquear).
   */
  async getPremiumStatus(lessorId: string): Promise<PremiumStatus> {
    if (!this.viviaDatabase.isEnabled) {
      return 'UNKNOWN';
    }
    try {
      const rows = await this.viviaDatabase.query<{
        premium_until: Date | null;
      }>(
        'SELECT premium_until FROM public.lessor_subscriptions WHERE user_id = $1 LIMIT 1',
        [lessorId],
      );
      if (rows.length === 0) {
        return 'FREE';
      }
      const premiumUntil = rows[0].premium_until;
      return premiumUntil != null && new Date(premiumUntil) > new Date()
        ? 'PREMIUM'
        : 'FREE';
    } catch (error) {
      this.logger.error(
        `Error consultando el premium del lessor ${lessorId}; no se aplicará el límite free`,
        error as Error,
      );
      return 'UNKNOWN';
    }
  }
}
