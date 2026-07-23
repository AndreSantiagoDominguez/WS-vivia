import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ILessorSubscriptionRepository } from './lessor-subscription.repository';

/**
 * Lee `public.lessor_subscriptions` (tabla propiedad del backend `vivia`) desde
 * la misma DataSource del chat: es la misma base Postgres, solo cambia el
 * schema (`chat` vs `public`), así que no hace falta un pool aparte como en
 * `UsersFcmTokenRepository` (esa sí apunta a OTRA base). Query cruda sobre una
 * columna de una tabla cuyo esquema es de otro servicio: no hay entidad ni
 * migración que mantener de este lado.
 */
@Injectable()
export class TypeOrmLessorSubscriptionRepository implements ILessorSubscriptionRepository {
  private readonly logger = new Logger(
    TypeOrmLessorSubscriptionRepository.name,
  );

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Fail-open: si la consulta falla (BD de suscripciones inaccesible) se trata
   * al lessor como NO premium y se deja que el guard decida por conteo — nunca
   * se tumba el chat por un problema del subsistema de suscripciones.
   */
  async isPremiumActive(lessorId: string): Promise<boolean> {
    try {
      const rows = await this.dataSource.query<
        { premium_until: Date | null }[]
      >(
        'SELECT premium_until FROM public.lessor_subscriptions WHERE user_id = $1 LIMIT 1',
        [lessorId],
      );
      const premiumUntil = rows[0]?.premium_until;
      return premiumUntil != null && new Date(premiumUntil) > new Date();
    } catch (error) {
      this.logger.error(
        `Error consultando premium del lessor ${lessorId}; se asume no premium`,
        error as Error,
      );
      return false;
    }
  }
}
