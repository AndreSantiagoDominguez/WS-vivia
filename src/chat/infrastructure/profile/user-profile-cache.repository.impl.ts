import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  IUserProfileCacheRepository,
  UpsertUserProfileData,
} from './user-profile-cache.repository';
import { UserProfileCacheOrmEntity } from './user-profile-cache.orm-entity';

@Injectable()
export class TypeOrmUserProfileCacheRepository implements IUserProfileCacheRepository {
  constructor(
    @InjectRepository(UserProfileCacheOrmEntity)
    private readonly repository: Repository<UserProfileCacheOrmEntity>,
  ) {}

  async upsert(data: UpsertUserProfileData): Promise<void> {
    await this.repository.upsert(
      { userId: data.userId, name: data.name, photoUrl: data.photoUrl },
      ['userId'],
    );
  }
}
