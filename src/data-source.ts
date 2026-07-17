import 'dotenv/config';
import { DataSource } from 'typeorm';

/**
 * DataSource standalone para el CLI de TypeORM (`npm run migration:*`).
 * Separado del que arma `TypeOrmModule.forRootAsync` en `app.module.ts` — el
 * CLI corre fuera del contenedor de DI de Nest, así que necesita una
 * instancia de `DataSource` plana, leyendo `.env` directo con `dotenv`.
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  // Mismo criterio que app.module.ts: SSL solo cuando DATABASE_SSL=true.
  ssl:
    process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities: ['src/**/*.orm-entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
