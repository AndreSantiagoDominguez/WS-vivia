import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  cert,
  getApps,
  initializeApp,
  ServiceAccount,
} from 'firebase-admin/app';
import { getMessaging, Messaging } from 'firebase-admin/messaging';
import { readFileSync } from 'fs';

/**
 * Inicializa el SDK de Firebase Admin una sola vez, leyendo el service account
 * JSON desde el path indicado por `FIREBASE_KEY_PATH` (montado como docker
 * secret en `/var/run/secrets/firebase-adminsdk.json`).
 *
 * Si la variable no está configurada o el archivo no se puede leer/parsear, el
 * servicio queda **deshabilitado** (loggea un warning) en vez de romper el
 * arranque del proceso: el chat sigue funcionando por WebSocket, solo que sin
 * push notifications. `getMessaging()` devuelve `null` en ese caso, y el
 * orquestador (`PushNotificationService`) lo trata como "push apagado".
 */
@Injectable()
export class FirebaseAdminService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseAdminService.name);
  private messaging: Messaging | null = null;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const keyPath = this.configService.get<string>('FIREBASE_KEY_PATH');
    if (!keyPath) {
      this.logger.warn(
        'FIREBASE_KEY_PATH no configurado — push notifications deshabilitadas',
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(
        readFileSync(keyPath, 'utf8'),
      ) as ServiceAccount;

      // Guarda contra doble inicialización (p. ej. hot reload en tests).
      const app = getApps().length
        ? getApps()[0]
        : initializeApp({ credential: cert(serviceAccount) });

      this.messaging = getMessaging(app);
      this.logger.log(
        'Firebase Admin inicializado — push notifications activas',
      );
    } catch (error) {
      this.logger.error(
        `No se pudo inicializar Firebase Admin desde ${keyPath} — push notifications deshabilitadas`,
        error as Error,
      );
    }
  }

  /** `null` cuando el SDK no está inicializado (push deshabilitado). */
  getMessaging(): Messaging | null {
    return this.messaging;
  }
}
