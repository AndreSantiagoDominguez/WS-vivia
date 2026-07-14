import { v5 as uuidv5 } from 'uuid';

/**
 * Namespace fijo para derivar UUIDs temporales a partir de un email (UUID v5).
 * Generado una única vez — NUNCA debe cambiar: cambiarlo invalidaría todas las
 * identidades temporales ya emitidas (dejarían de matchear con el mismo email).
 */
const EMAIL_NAMESPACE_UUID = 'c1b1612d-8b4b-4f4d-a4dc-3e19e7900b31';

/**
 * Deriva un UUID determinístico a partir de un email: el mismo email siempre
 * da el mismo UUID, así un usuario sin `userId` en su JWT puede acumular
 * conversaciones/mensajes de forma consistente hasta que Spring Boot mande
 * un token completo y se reconcilie con su identidad real (ver
 * `ReconcileTemporaryIdentityUseCase`).
 */
export function deriveTemporaryUserId(email: string): string {
  return uuidv5(email.toLowerCase(), EMAIL_NAMESPACE_UUID);
}
