import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { ReconcileTemporaryIdentityUseCase } from '../../application/use-cases/reconcile-temporary-identity.use-case';
import { deriveTemporaryUserId } from './identity/temporary-identity.util';
import {
  IUserIdentityRepository,
  UserIdentityRecord,
} from './identity/user-identity.repository';
import {
  JwtVerificationError,
  JwtVerificationService,
} from './jwt-verification.service';

const SECRET =
  'a-test-secret-long-enough-for-hs512-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

function buildConfigService(
  secret: string | undefined = SECRET,
): ConfigService {
  return { get: jest.fn().mockReturnValue(secret) } as unknown as ConfigService;
}

class InMemoryUserIdentityRepository implements IUserIdentityRepository {
  private readonly records = new Map<string, UserIdentityRecord>();

  findByEmail(email: string): Promise<UserIdentityRecord | null> {
    return Promise.resolve(this.records.get(email) ?? null);
  }

  createTemporary(email: string): Promise<string> {
    const userId = deriveTemporaryUserId(email);
    this.records.set(email, { userId, isTemporary: true });
    return Promise.resolve(userId);
  }

  markResolved(email: string, realUserId: string): Promise<void> {
    this.records.set(email, { userId: realUserId, isTemporary: false });
    return Promise.resolve();
  }
}

function sign(
  payload: Record<string, unknown>,
  options: jwt.SignOptions = {},
): string {
  return jwt.sign(payload, SECRET, {
    algorithm: 'HS512',
    expiresIn: '1h',
    ...options,
  });
}

describe('JwtVerificationService', () => {
  let identityRepository: InMemoryUserIdentityRepository;
  let reconcileTemporaryIdentity: jest.Mocked<ReconcileTemporaryIdentityUseCase>;
  let service: JwtVerificationService;

  beforeEach(() => {
    identityRepository = new InMemoryUserIdentityRepository();
    reconcileTemporaryIdentity = {
      execute: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<ReconcileTemporaryIdentityUseCase>;
    service = new JwtVerificationService(
      buildConfigService(),
      identityRepository,
      reconcileTemporaryIdentity,
    );
  });

  it('verifies a valid HS512 token and extracts userId as the identity', async () => {
    const token = sign({
      sub: 'user@vivia.com',
      role: 'ROLE_LESSEE',
      userId: '11111111-1111-1111-1111-111111111111',
    });

    const result = await service.verify(token);

    expect(result).toEqual({
      userId: '11111111-1111-1111-1111-111111111111',
      role: 'ROLE_LESSEE',
      email: 'user@vivia.com',
    });
  });

  it('rejects an expired token', async () => {
    const token = sign(
      {
        sub: 'user@vivia.com',
        role: 'ROLE_LESSEE',
        userId: '11111111-1111-1111-1111-111111111111',
      },
      { expiresIn: -10 },
    );

    await expect(service.verify(token)).rejects.toThrow(JwtVerificationError);
  });

  it('rejects a token signed with the wrong secret', async () => {
    const token = jwt.sign(
      {
        sub: 'user@vivia.com',
        role: 'ROLE_LESSEE',
        userId: '11111111-1111-1111-1111-111111111111',
      },
      'a-completely-different-secret',
      { algorithm: 'HS512', expiresIn: '1h' },
    );

    await expect(service.verify(token)).rejects.toThrow(JwtVerificationError);
  });

  it('rejects a token signed with an algorithm other than HS512', async () => {
    const token = sign(
      {
        sub: 'user@vivia.com',
        role: 'ROLE_LESSEE',
        userId: '11111111-1111-1111-1111-111111111111',
      },
      { algorithm: 'HS256' },
    );

    await expect(service.verify(token)).rejects.toThrow(JwtVerificationError);
  });

  it('rejects a token whose sub does not look like an email', async () => {
    const token = sign({
      sub: 'not-an-email',
      role: 'ROLE_LESSEE',
      userId: '11111111-1111-1111-1111-111111111111',
    });

    await expect(service.verify(token)).rejects.toThrow(JwtVerificationError);
  });

  it('accepts a token missing userId by creating a deterministic temporary identity', async () => {
    const token = sign({ sub: 'nuevo@vivia.com', role: 'ROLE_LESSEE' });

    const result = await service.verify(token);

    expect(result.userId).toBe(deriveTemporaryUserId('nuevo@vivia.com'));
    expect(result.email).toBe('nuevo@vivia.com');
  });

  it('resolves repeated incomplete tokens for the same email to the same temporary id', async () => {
    const token = sign({ sub: 'nuevo@vivia.com', role: 'ROLE_LESSEE' });

    const first = await service.verify(token);
    const second = await service.verify(
      sign({ sub: 'nuevo@vivia.com', role: 'ROLE_LESSEE' }),
    );

    expect(second.userId).toBe(first.userId);
  });

  it('reconciles the temporary identity when a complete token arrives for the same email', async () => {
    const incompleteToken = sign({
      sub: 'nuevo@vivia.com',
      role: 'ROLE_LESSEE',
    });
    const temp = await service.verify(incompleteToken);

    const completeToken = sign({
      sub: 'nuevo@vivia.com',
      role: 'ROLE_LESSEE',
      userId: '22222222-2222-2222-2222-222222222222',
    });
    const resolved = await service.verify(completeToken);

    expect(resolved.userId).toBe('22222222-2222-2222-2222-222222222222');
    expect(reconcileTemporaryIdentity.execute).toHaveBeenCalledWith({
      oldUserId: temp.userId,
      newUserId: '22222222-2222-2222-2222-222222222222',
      role: 'ROLE_LESSEE',
    });
  });

  it('resolves a later incomplete token directly to the real userId after reconciliation', async () => {
    await service.verify(sign({ sub: 'nuevo@vivia.com', role: 'ROLE_LESSEE' }));
    await service.verify(
      sign({
        sub: 'nuevo@vivia.com',
        role: 'ROLE_LESSEE',
        userId: '22222222-2222-2222-2222-222222222222',
      }),
    );

    const result = await service.verify(
      sign({ sub: 'nuevo@vivia.com', role: 'ROLE_LESSEE' }),
    );

    expect(result.userId).toBe('22222222-2222-2222-2222-222222222222');
    expect(reconcileTemporaryIdentity.execute).toHaveBeenCalledTimes(1);
  });
});
