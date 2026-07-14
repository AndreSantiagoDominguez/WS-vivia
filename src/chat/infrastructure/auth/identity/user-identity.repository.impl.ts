import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IUserIdentityRepository,
  UserIdentityRecord,
} from './user-identity.repository';
import { deriveTemporaryUserId } from './temporary-identity.util';
import { UserIdentityOrmEntity } from './user-identity.orm-entity';

@Injectable()
export class TypeOrmUserIdentityRepository implements IUserIdentityRepository {
  constructor(
    @InjectRepository(UserIdentityOrmEntity)
    private readonly repository: Repository<UserIdentityOrmEntity>,
  ) {}

  async findByEmail(email: string): Promise<UserIdentityRecord | null> {
    const found = await this.repository.findOneBy({
      email: email.toLowerCase(),
    });
    return found
      ? { userId: found.userId, isTemporary: found.isTemporary }
      : null;
  }

  async createTemporary(email: string): Promise<string> {
    const normalizedEmail = email.toLowerCase();
    const userId = deriveTemporaryUserId(normalizedEmail);
    await this.repository.save(
      this.repository.create({
        email: normalizedEmail,
        userId,
        isTemporary: true,
      }),
    );
    return userId;
  }

  async markResolved(email: string, realUserId: string): Promise<void> {
    await this.repository.save(
      this.repository.create({
        email: email.toLowerCase(),
        userId: realUserId,
        isTemporary: false,
      }),
    );
  }
}
