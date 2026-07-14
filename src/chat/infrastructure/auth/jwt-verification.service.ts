import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ReconcileTemporaryIdentityUseCase } from '../../application/use-cases/reconcile-temporary-identity.use-case';
import {
  IUserIdentityRepository,
  USER_IDENTITY_REPOSITORY,
} from './identity/user-identity.repository';

/**
 * Payload verificado del JWT emitido por el backend Spring Boot (`JwtProvider.java`).
 * `userId` es la identidad estable del sistema de chat — puede ser el `userId`
 * real de Spring Boot, o una identidad temporal derivada del email mientras
 * Spring Boot no mande `userId` para ese usuario (ver el comentario de la clase).
 */
export interface VerifiedJwtPayload {
  userId: string;
  role: string;
  email: string;
}

export class JwtVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtVerificationError';
  }
}

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Verificación compartida del JWT del backend Java, usada tanto por el guard HTTP
 * como por el gateway de WebSocket, para no duplicar la lógica de decodificación.
 *
 * El backend Java firma con `Jwts.builder().signWith(getSecretKey())` sin especificar
 * algoritmo explícito — `jjwt` elige HS512 automáticamente porque el secreto es
 * suficientemente largo. Por eso aquí se fuerza `algorithms: ['HS512']` explícitamente:
 * si no se restringe, `jsonwebtoken` aceptaría cualquier algoritmo simétrico compatible
 * con el mismo secreto, lo cual sería una superficie de ataque innecesaria.
 *
 * **Identidad temporal por email**: algunos tokens reales de Spring Boot no traen
 * `userId` (lo vimos en producción con un login real). En vez de rechazar esa
 * conexión de plano, se acepta usando una identidad temporal determinística
 * derivada del email (`deriveTemporaryUserId` — mismo email, siempre el mismo
 * UUID), así ese usuario puede chatear con normalidad mientras tanto. En cuanto
 * llega, para ese mismo email, un token que sí trae `userId`, se reconcilia todo
 * lo creado bajo la identidad temporal hacia la real
 * (`ReconcileTemporaryIdentityUseCase`) y desde ese momento el email siempre
 * resuelve al `userId` real. El emparejamiento siempre es por `sub` (email), que
 * el JWT nunca deja de traer — nunca se inventa una identidad para un email que
 * nunca vino acompañado de un `userId` real.
 */
@Injectable()
export class JwtVerificationService {
  private readonly secret: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject(USER_IDENTITY_REPOSITORY)
    private readonly identityRepository: IUserIdentityRepository,
    private readonly reconcileTemporaryIdentity: ReconcileTemporaryIdentityUseCase,
  ) {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured');
    }
    this.secret = secret;
  }

  async verify(token: string): Promise<VerifiedJwtPayload> {
    let decoded: jwt.JwtPayload;
    try {
      const result = jwt.verify(token, this.secret, { algorithms: ['HS512'] });
      if (typeof result === 'string') {
        throw new JwtVerificationError('Unexpected token payload format');
      }
      decoded = result;
    } catch (error) {
      if (error instanceof JwtVerificationError) {
        throw error;
      }
      throw new JwtVerificationError('Invalid or expired token');
    }

    const { userId, role, sub } = decoded;

    if (typeof role !== 'string' || role.length === 0) {
      throw new JwtVerificationError('Token is missing the role claim');
    }
    if (
      typeof sub !== 'string' ||
      sub.length === 0 ||
      !EMAIL_FORMAT.test(sub)
    ) {
      // Sin un `sub` con forma de email no hay llave con la cual matchear una
      // identidad temporal, así que se rechaza igual que si faltara del todo.
      throw new JwtVerificationError(
        'Token is missing a valid sub (email) claim',
      );
    }
    const email = sub.toLowerCase();

    const resolvedUserId =
      typeof userId === 'string' && userId.length > 0
        ? await this.resolveCompleteToken(email, userId, role)
        : await this.resolveIncompleteToken(email);

    return { userId: resolvedUserId, role, email };
  }

  private async resolveCompleteToken(
    email: string,
    realUserId: string,
    role: string,
  ): Promise<string> {
    const existing = await this.identityRepository.findByEmail(email);
    if (existing?.isTemporary) {
      await this.reconcileTemporaryIdentity.execute({
        oldUserId: existing.userId,
        newUserId: realUserId,
        role,
      });
    }
    await this.identityRepository.markResolved(email, realUserId);
    return realUserId;
  }

  private async resolveIncompleteToken(email: string): Promise<string> {
    const existing = await this.identityRepository.findByEmail(email);
    if (existing) {
      return existing.userId;
    }
    return this.identityRepository.createTemporary(email);
  }
}
