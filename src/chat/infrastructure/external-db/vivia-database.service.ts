import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

/**
 * Quita los parámetros `sslmode`/`ssl` de la connection string. Con ellos
 * presentes, `pg-connection-string` fija su propia config de TLS (verify-full)
 * que pisa el objeto `ssl` pasado al `Pool`. Sin ellos, gana nuestro `ssl`
 * explícito con `rejectUnauthorized: false`. Si la URL no es parseable, se
 * devuelve tal cual (el `Pool` la reportará como error de conexión, no acá).
 */
function stripSslModeParam(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    url.searchParams.delete('sslmode');
    url.searchParams.delete('ssl');
    return url.toString();
  } catch {
    return connectionString;
  }
}

/**
 * Pool de solo lectura hacia la base Postgres del backend `vivia`
 * (`USERS_DATABASE_URL`), que es **distinta** a la del chat (`DATABASE_URL`).
 * De ahí salen dos cosas que el chat necesita y no le pertenecen:
 * `users.fcm_token` (push) y `public.lessor_subscriptions` (estado premium).
 *
 * Se usa un `pg.Pool` directo en vez de entidades TypeORM porque solo se leen
 * un par de columnas de tablas cuyo esquema es propiedad de otro servicio: no
 * hay migraciones ni modelo que mantener de este lado.
 *
 * Si `USERS_DATABASE_URL` no está configurado el servicio queda deshabilitado
 * (`isEnabled === false`) en vez de romper el arranque: el chat funciona igual,
 * solo que sin push y sin poder confirmar el premium de un lessor.
 */
@Injectable()
export class ViviaDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ViviaDatabaseService.name);
  private pool: Pool | null = null;

  constructor(private readonly configService: ConfigService) {}

  get isEnabled(): boolean {
    return this.pool !== null;
  }

  onModuleInit(): void {
    const connectionString =
      this.configService.get<string>('USERS_DATABASE_URL');
    if (!connectionString) {
      this.logger.warn(
        'USERS_DATABASE_URL no configurado — no se podrán resolver fcm_token ni el estado premium de los lessors',
      );
      return;
    }
    this.pool = new Pool({
      // Se quita `sslmode` de la URL: la versión nueva de pg-connection-string
      // lo interpreta como `verify-full` y eso pisaría el objeto `ssl` de abajo,
      // haciendo que `pg` verifique la cadena de certificados y falle con
      // `SELF_SIGNED_CERT_IN_CHAIN` contra certificados self-signed (típico de
      // RDS). Al removerlo, gana nuestro `ssl` explícito.
      connectionString: stripSslModeParam(connectionString),
      // SSL sigue activo (conexión cifrada), pero sin verificar la cadena —
      // mismo criterio que el resto del proyecto (ver app.module.ts).
      ssl: { rejectUnauthorized: false },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }

  /**
   * Ejecuta la consulta y devuelve las filas. Lanza si el pool no está
   * configurado o si la consulta falla — cada repositorio decide qué hacer con
   * el error, porque las consecuencias no son las mismas (no mandar un push es
   * inocuo; no poder leer el premium no debe bloquear a nadie).
   */
  async query<T extends object>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (!this.pool) {
      throw new Error('USERS_DATABASE_URL no configurado');
    }
    const result = await this.pool.query<T>(sql, params);
    return result.rows;
  }
}
