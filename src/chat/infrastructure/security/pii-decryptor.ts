import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDecipheriv } from 'crypto';

const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // nonce GCM
const TAG_LENGTH_BYTES = 16; // tag de autenticación GCM

/**
 * Descifra columnas PII que el backend `vivia` guarda cifradas en su base
 * (`users.fcm_token`, entre otras). Espejo en Node de `AesGcmEncryptionService`
 * del proyecto Java: AES-256-GCM sobre `base64(IV[12] || ciphertext || tag[16])`,
 * con la clave de `ENCRYPTION_KEY` (base64 de 32 bytes exactos) — tiene que ser
 * literalmente el mismo secreto que usa el backend, o el tag no valida.
 *
 * Todo lo que no se pueda descifrar se devuelve **tal cual**: la columna quedó
 * en texto plano si se escribió antes de la migración `V30__encrypt_existing_pii`,
 * y ese valor sí sirve. Por eso nunca lanza — un dato ilegible aquí solo debe
 * costar un push, no el mensaje.
 */
@Injectable()
export class PiiDecryptor {
  private readonly logger = new Logger(PiiDecryptor.name);
  private readonly key: Buffer | null;

  constructor(configService: ConfigService) {
    this.key = this.parseKey(configService.get<string>('ENCRYPTION_KEY'));
  }

  decrypt(value: string | null): string | null {
    if (!this.key || value == null || value.trim().length === 0) {
      return value;
    }

    const raw = Buffer.from(value, 'base64');
    if (raw.length <= IV_LENGTH_BYTES + TAG_LENGTH_BYTES) {
      // Demasiado corto para ser IV + tag: no es un criptograma nuestro.
      return value;
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        raw.subarray(0, IV_LENGTH_BYTES),
      );
      decipher.setAuthTag(raw.subarray(raw.length - TAG_LENGTH_BYTES));
      const plaintext = Buffer.concat([
        decipher.update(
          raw.subarray(IV_LENGTH_BYTES, raw.length - TAG_LENGTH_BYTES),
        ),
        decipher.final(),
      ]);
      return plaintext.toString('utf8');
    } catch {
      // Tag inválido o basura: se asume texto plano (ver comentario de clase).
      return value;
    }
  }

  private parseKey(configured: string | undefined): Buffer | null {
    if (!configured) {
      this.logger.warn(
        'ENCRYPTION_KEY no configurada — los datos cifrados del backend vivia se usarán tal cual (p. ej. el fcm_token no servirá)',
      );
      return null;
    }
    const key = Buffer.from(configured, 'base64');
    if (key.length !== KEY_LENGTH_BYTES) {
      this.logger.error(
        `ENCRYPTION_KEY debe ser base64 de ${KEY_LENGTH_BYTES} bytes; se decodificaron ${key.length} — se ignora`,
      );
      return null;
    }
    return key;
  }
}
