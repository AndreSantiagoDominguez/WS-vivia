import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CreateDocumentMessageUseCase } from './application/use-cases/create-document-message.use-case';
import { CreateMessageUseCase } from './application/use-cases/create-message.use-case';
import { GetOrCreateConversationUseCase } from './application/use-cases/get-or-create-conversation.use-case';
import { ListConversationsForUserUseCase } from './application/use-cases/list-conversations-for-user.use-case';
import { ListMessagesUseCase } from './application/use-cases/list-messages.use-case';
import { MarkMessagesReadUseCase } from './application/use-cases/mark-messages-read.use-case';
import { ReconcileTemporaryIdentityUseCase } from './application/use-cases/reconcile-temporary-identity.use-case';
import { CONVERSATION_REPOSITORY } from './domain/repositories/conversation.repository';
import { MESSAGE_REPOSITORY } from './domain/repositories/message.repository';
import { HttpAuthGuard } from './infrastructure/auth/http-auth.guard';
import { UserIdentityOrmEntity } from './infrastructure/auth/identity/user-identity.orm-entity';
import { TypeOrmUserIdentityRepository } from './infrastructure/auth/identity/user-identity.repository.impl';
import { USER_IDENTITY_REPOSITORY } from './infrastructure/auth/identity/user-identity.repository';
import { JwtVerificationService } from './infrastructure/auth/jwt-verification.service';
import { ChatController } from './infrastructure/http/chat.controller';
import { ConversationOrmEntity } from './infrastructure/persistence/typeorm/conversation.orm-entity';
import { TypeOrmConversationRepository } from './infrastructure/persistence/typeorm/conversation.repository.impl';
import { MessageOrmEntity } from './infrastructure/persistence/typeorm/message.orm-entity';
import { TypeOrmMessageRepository } from './infrastructure/persistence/typeorm/message.repository.impl';
import { DocumentStorageService } from './infrastructure/storage/document-storage.service';
import { ChatGateway } from './infrastructure/websocket/chat.gateway';
import { ConnectionRegistryService } from './infrastructure/websocket/connection-registry.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationOrmEntity,
      MessageOrmEntity,
      UserIdentityOrmEntity,
    ]),
  ],
  controllers: [ChatController],
  providers: [
    JwtVerificationService,
    HttpAuthGuard,
    ConnectionRegistryService,
    ChatGateway,
    {
      provide: CONVERSATION_REPOSITORY,
      useClass: TypeOrmConversationRepository,
    },
    { provide: MESSAGE_REPOSITORY, useClass: TypeOrmMessageRepository },
    {
      provide: USER_IDENTITY_REPOSITORY,
      useClass: TypeOrmUserIdentityRepository,
    },
    GetOrCreateConversationUseCase,
    ListMessagesUseCase,
    CreateMessageUseCase,
    CreateDocumentMessageUseCase,
    MarkMessagesReadUseCase,
    ListConversationsForUserUseCase,
    ReconcileTemporaryIdentityUseCase,
    DocumentStorageService,
  ],
})
export class ChatModule {}
