import { ConfigService } from '@nestjs/config';
import { createCipheriv, randomBytes } from 'crypto';
import { PiiDecryptor } from './pii-decryptor';

const KEY = randomBytes(32);
const KEY_BASE64 = KEY.toString('base64');

/** Mismo formato que `AesGcmEncryptionService` del backend Java. */
function encrypt(plaintext: string, key: Buffer = KEY): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString(
    'base64',
  );
}

function buildDecryptor(encryptionKey?: string): PiiDecryptor {
  const configService = {
    get: () => encryptionKey,
  } as unknown as ConfigService;
  return new PiiDecryptor(configService);
}

describe('PiiDecryptor', () => {
  const TOKEN = 'fMEP0vJqS0-abcdef:APA91bH_token_de_prueba';

  it('descifra un valor cifrado con la misma clave', () => {
    expect(buildDecryptor(KEY_BASE64).decrypt(encrypt(TOKEN))).toBe(TOKEN);
  });

  // Las filas escritas antes de la migración V30 siguen en texto plano y deben
  // seguir sirviendo tal cual.
  it('devuelve intacto un valor en texto plano', () => {
    expect(buildDecryptor(KEY_BASE64).decrypt(TOKEN)).toBe(TOKEN);
  });

  it('devuelve intacto un criptograma de otra clave en vez de lanzar', () => {
    const otherKey = encrypt(TOKEN, randomBytes(32));
    expect(buildDecryptor(KEY_BASE64).decrypt(otherKey)).toBe(otherKey);
  });

  it('pasa el valor tal cual si no hay ENCRYPTION_KEY configurada', () => {
    const ciphertext = encrypt(TOKEN);
    expect(buildDecryptor(undefined).decrypt(ciphertext)).toBe(ciphertext);
  });

  it('ignora una clave que no mide 32 bytes', () => {
    const ciphertext = encrypt(TOKEN);
    expect(
      buildDecryptor(randomBytes(16).toString('base64')).decrypt(ciphertext),
    ).toBe(ciphertext);
  });

  it('deja pasar null y vacío', () => {
    const decryptor = buildDecryptor(KEY_BASE64);
    expect(decryptor.decrypt(null)).toBeNull();
    expect(decryptor.decrypt('')).toBe('');
  });
});
