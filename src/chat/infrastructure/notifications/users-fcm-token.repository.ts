import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

/**
 * Acceso de solo lectura al `fcm_token` del destinatario, que vive en una base
 * Postgres **distinta** a la del chat (`USERS_DATABASE_URL`, tabla `users`,
 * gestionada por otro servicio de Vivia). SSL requerido, mismo criterio de
 * `rejectUnauthorized: false` que el resto del proyecto.
 *
 * Se usa un `pg.Pool` directo en vez de una entidad TypeORM porque solo se lee
 * una columna de una tabla cuyo esquema es propiedad de otro servicio: no hay
 * migraciones ni modelo que mantener de este lado.
 */
@Injectable()
export class UsersFcmTokenRepository implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(UsersFcmTokenRepository.name);
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const connectionString =
      this.configService.get<string>('USERS_DATABASE_URL');
    if (!connectionString) {
      this.logger.warn(
        'USERS_DATABASE_URL no configurado — no se podrán resolver fcm_token para push',
      );
      return;
    }
    this.pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /**
   * Devuelve el `fcm_token` del usuario, o `null` si no hay fila, la columna
   * está vacía, o no hay conexión configurada. Nunca lanza: cualquier error de
   * DB se loggea y se devuelve `null` (el push simplemente no se envía).
   */
  async getToken(userId: string): Promise<string | null> {
    if (!this.pool) return null;
    try {
      const result = await this.pool.query<{ fcm_token: string | null }>(
        'SELECT fcm_token FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );
      const token = result.rows[0]?.fcm_token;
      return token && token.trim().length > 0 ? token : null;
    } catch (error) {
      this.logger.error(
        `Error consultando fcm_token para el usuario ${userId}`,
        error as Error,
      );
      return null;
    }
  }
}
