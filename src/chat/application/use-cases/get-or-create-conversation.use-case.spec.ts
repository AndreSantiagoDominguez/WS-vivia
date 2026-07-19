import { Conversation } from '../../domain/entities/conversation.entity';
import { IConversationRepository } from '../../domain/repositories/conversation.repository';
import { IUserProfileCacheRepository } from '../../infrastructure/profile/user-profile-cache.repository';
import { SameParticipantError } from '../errors';
import { GetOrCreateConversationUseCase } from './get-or-create-conversation.use-case';

function buildConversation(
  overrides: Partial<Conversation> = {},
): Conversation {
  return new Conversation({
    id: 'conv-1',
    participantOneId: 'aaaaaaaa-0000-0000-0000-000000000001',
    participantOneRole: 'ROLE_LESSEE',
    participantTwoId: 'bbbbbbbb-0000-0000-0000-000000000002',
    participantTwoRole: 'ROLE_LESSOR',
    propertyId: null,
    propertyTitle: null,
    lastMessageAt: null,
    hiddenForParticipantOneAt: null,
    hiddenForParticipantTwoAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  });
}

describe('GetOrCreateConversationUseCase', () => {
  let repository: jest.Mocked<IConversationRepository>;
  let profileCacheRepository: jest.Mocked<IUserProfileCacheRepository>;
  let useCase: GetOrCreateConversationUseCase;

  beforeEach(() => {
    repository = {
      findById: jest.fn(),
      findByParticipants: jest.fn(),
      create: jest.fn(),
      findAllForUser: jest.fn(),
      updateLastMessageAt: jest.fn(),
      reassignParticipants: jest.fn(),
      delete: jest.fn(),
      hideForParticipant: jest.fn(),
      findConversationSummariesForUser: jest.fn(),
    };
    profileCacheRepository = {
      upsert: jest.fn(),
    };
    useCase = new GetOrCreateConversationUseCase(
      repository,
      profileCacheRepository,
    );
  });

  it('creates a new conversation with ordered participant ids when none exists', async () => {
    repository.findByParticipants.mockResolvedValue(null);
    const created = buildConversation();
    repository.create.mockResolvedValue(created);

    const result = await useCase.execute({
      requesterId: 'bbbbbbbb-0000-0000-0000-000000000002',
      requesterRole: 'ROLE_LESSOR',
      otherUserId: 'aaaaaaaa-0000-0000-0000-000000000001',
      otherUserRole: 'ROLE_LESSEE',
      propertyId: null,
      propertyTitle: null,
    });

    expect(repository.findByParticipants).toHaveBeenCalledWith(
      'aaaaaaaa-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000002',
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        participantOneId: 'aaaaaaaa-0000-0000-0000-000000000001',
        participantOneRole: 'ROLE_LESSEE',
        participantTwoId: 'bbbbbbbb-0000-0000-0000-000000000002',
        participantTwoRole: 'ROLE_LESSOR',
      }),
    );
    expect(result).toBe(created);
  });

  it('returns the existing conversation instead of creating a duplicate', async () => {
    const existing = buildConversation();
    repository.findByParticipants.mockResolvedValue(existing);

    const result = await useCase.execute({
      requesterId: 'aaaaaaaa-0000-0000-0000-000000000001',
      requesterRole: 'ROLE_LESSEE',
      otherUserId: 'bbbbbbbb-0000-0000-0000-000000000002',
      otherUserRole: 'ROLE_LESSOR',
      propertyId: null,
      propertyTitle: null,
    });

    expect(result).toBe(existing);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects a conversation with itself', async () => {
    await expect(
      useCase.execute({
        requesterId: 'aaaaaaaa-0000-0000-0000-000000000001',
        requesterRole: 'ROLE_LESSEE',
        otherUserId: 'aaaaaaaa-0000-0000-0000-000000000001',
        otherUserRole: 'ROLE_LESSEE',
        propertyId: null,
        propertyTitle: null,
      }),
    ).rejects.toThrow(SameParticipantError);
    expect(repository.findByParticipants).not.toHaveBeenCalled();
  });

  it('upserts the profile cache for both participants when their name is provided', async () => {
    repository.findByParticipants.mockResolvedValue(buildConversation());

    await useCase.execute({
      requesterId: 'aaaaaaaa-0000-0000-0000-000000000001',
      requesterRole: 'ROLE_LESSEE',
      requesterName: 'Juan Pérez',
      requesterPhotoUrl: 'https://cdn.example.com/juan.jpg',
      otherUserId: 'bbbbbbbb-0000-0000-0000-000000000002',
      otherUserRole: 'ROLE_LESSOR',
      otherUserName: 'María López',
      propertyId: null,
      propertyTitle: null,
    });

    expect(profileCacheRepository.upsert).toHaveBeenCalledWith({
      userId: 'aaaaaaaa-0000-0000-0000-000000000001',
      name: 'Juan Pérez',
      photoUrl: 'https://cdn.example.com/juan.jpg',
    });
    expect(profileCacheRepository.upsert).toHaveBeenCalledWith({
      userId: 'bbbbbbbb-0000-0000-0000-000000000002',
      name: 'María López',
      photoUrl: null,
    });
  });

  it('does not touch the profile cache when no name is provided', async () => {
    repository.findByParticipants.mockResolvedValue(buildConversation());

    await useCase.execute({
      requesterId: 'aaaaaaaa-0000-0000-0000-000000000001',
      requesterRole: 'ROLE_LESSEE',
      otherUserId: 'bbbbbbbb-0000-0000-0000-000000000002',
      otherUserRole: 'ROLE_LESSOR',
      propertyId: null,
      propertyTitle: null,
    });

    expect(profileCacheRepository.upsert).not.toHaveBeenCalled();
  });
});
