import { Injectable, Logger } from '@nestjs/common';
import { ViviaDatabaseService } from '../external-db/vivia-database.service';
import { PiiDecryptor } from '../security/pii-decryptor';

/**
 * Acceso de solo lectura al `fcm_token` del destinatario, que vive en la base
 * del backend `vivia` (`ViviaDatabaseService`), no en la del chat.
 *
 * La columna está **cifrada en reposo** (AES-256-GCM, `EncryptedStringConverter`
 * del backend Java + migración `V30__encrypt_existing_pii`), así que hay que
 * descifrarla antes de mandársela a FCM: si se envía el criptograma, Firebase
 * responde `The registration token is not a valid FCM registration token`.
 */
@Injectable()
export class UsersFcmTokenRepository {
  private readonly logger = new Logger(UsersFcmTokenRepository.name);

  constructor(
    private readonly viviaDatabase: ViviaDatabaseService,
    private readonly piiDecryptor: PiiDecryptor,
  ) {}

  /**
   * Devuelve el `fcm_token` del usuario en claro, o `null` si no hay fila, la
   * columna está vacía, o no hay conexión configurada. Nunca lanza: cualquier
   * error de DB se loggea y se devuelve `null` (el push simplemente no se envía).
   */
  async getToken(userId: string): Promise<string | null> {
    if (!this.viviaDatabase.isEnabled) return null;
    try {
      const rows = await this.viviaDatabase.query<{ fcm_token: string | null }>(
        'SELECT fcm_token FROM users WHERE id = $1 LIMIT 1',
        [userId],
      );
      const token = this.piiDecryptor.decrypt(rows[0]?.fcm_token ?? null);
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
