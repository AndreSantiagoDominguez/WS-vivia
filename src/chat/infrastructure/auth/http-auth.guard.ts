import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import {
  JwtVerificationError,
  JwtVerificationService,
} from './jwt-verification.service';
import { AuthenticatedRequest } from './authenticated-request';
import { extractBearerToken } from './ws-auth.util';

@Injectable()
export class HttpAuthGuard implements CanActivate {
  constructor(
    private readonly jwtVerificationService: JwtVerificationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      request.user = await this.jwtVerificationService.verify(token);
    } catch (error) {
      if (error instanceof JwtVerificationError) {
        throw new UnauthorizedException(error.message);
      }
      throw error;
    }

    return true;
  }
}
