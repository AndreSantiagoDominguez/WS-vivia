import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatModule } from './chat/chat.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.getOrThrow<string>('DATABASE_URL'),
        // Postgres local no expone SSL por default — solo se activa cuando
        // `DATABASE_SSL=true` (p. ej. contra RDS, accesible desde internet).
        // `rejectUnauthorized: false` cifra la conexión sin verificar la
        // cadena de certificados — decisión consciente para simplificar el
        // setup en esta etapa del proyecto, no una omisión.
        ssl:
          configService.get<string>('DATABASE_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : false,
        autoLoadEntities: true,
        // El esquema del schema `chat` (`CREATE SCHEMA IF NOT EXISTS chat;`
        // debe existir de antemano) se gestiona con migraciones versionadas
        // en src/migrations/, no con `synchronize` — un cambio de modelo
        // aplicado automáticamente sin revisión es un riesgo real en
        // producción. `migrationsRun: false` a propósito: las migraciones se
        // corren como paso explícito de deploy (`npm run migration:run`),
        // nunca solas en cada arranque del proceso.
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        migrationsRun: false,
        synchronize: false,
      }),
    }),
    ChatModule,
    HealthModule,
  ],
})
export class AppModule {}
