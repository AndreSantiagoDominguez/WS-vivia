import { Request } from 'express';
import { VerifiedJwtPayload } from './jwt-verification.service';

export interface AuthenticatedRequest extends Request {
  user: VerifiedJwtPayload;
}
