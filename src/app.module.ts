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
        autoLoadEntities: true,
        // Setup local: TypeORM crea/actualiza las tablas del schema `chat` automáticamente.
        // El schema en sí (`CREATE SCHEMA IF NOT EXISTS chat;`) debe existir de antemano.
        synchronize: true,
      }),
    }),
    ChatModule,
    HealthModule,
  ],
})
export class AppModule {}
