import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CreateDocumentMessageUseCase } from '../../application/use-cases/create-document-message.use-case';
import { GetOrCreateConversationUseCase } from '../../application/use-cases/get-or-create-conversation.use-case';
import { HideConversationUseCase } from '../../application/use-cases/hide-conversation.use-case';
import { ListConversationsForUserUseCase } from '../../application/use-cases/list-conversations-for-user.use-case';
import { ListMessagesUseCase } from '../../application/use-cases/list-messages.use-case';
import {
  ConversationNotFoundError,
  InvalidCaptionError,
  NotConversationParticipantError,
  SameParticipantError,
} from '../../application/errors';
import { Message } from '../../domain/entities/message.entity';
import { ConversationSummary } from '../../domain/repositories/conversation.repository';
import { AuthenticatedRequest } from '../auth/authenticated-request';
import { HttpAuthGuard } from '../auth/http-auth.guard';
import { DocumentStorageService } from '../storage/document-storage.service';
import { ConnectionRegistryService } from '../websocket/connection-registry.service';
import {
  ServerEvents,
  envelope,
  toNewMessagePayload,
} from '../websocket/protocol';
import { ConversationResponseDto } from './dtos/conversation-response.dto';
import { CreateConversationDto } from './dtos/create-conversation.dto';
import { ListMessagesQueryDto } from './dtos/list-messages-query.dto';
import { MessageResponseDto } from './dtos/message-response.dto';
import { UploadDocumentDto } from './dtos/upload-document.dto';

const DEFAULT_MESSAGES_PAGE_SIZE = 50;
const MAX_DOCUMENT_SIZE_BYTES = 20 * 1024 * 1024;
// Sin text/plain a propósito: el validador revisa el número mágico (bytes
// reales) del archivo, y texto plano no tiene una firma binaria detectable —
// no hay nada real que verificar, así que se excluye en vez de confiar
// ciegamente en el Content-Type que manda el cliente.
const ALLOWED_DOCUMENT_MIME_TYPE_PATTERN =
  /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.(wordprocessingml\.document|spreadsheetml\.sheet)|application\/vnd\.ms-excel)$/;

@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(HttpAuthGuard)
export class ChatController {
  constructor(
    private readonly listConversationsForUserUseCase: ListConversationsForUserUseCase,
    private readonly listMessagesUseCase: ListMessagesUseCase,
    private readonly getOrCreateConversationUseCase: GetOrCreateConversationUseCase,
    private readonly hideConversationUseCase: HideConversationUseCase,
    private readonly createDocumentMessageUseCase: CreateDocumentMessageUseCase,
    private readonly documentStorageService: DocumentStorageService,
    private readonly connectionRegistry: ConnectionRegistryService,
  ) {}

  @Get('conversations')
  @ApiOperation({
    summary: 'Lista las conversaciones del usuario autenticado.',
  })
  @ApiResponse({ status: 200, type: [ConversationResponseDto] })
  async listConversations(@Req() request: AuthenticatedRequest) {
    const summaries = await this.listConversationsForUserUseCase.execute(
      request.user.userId,
    );
    return summaries.map((summary) => this.toConversationResponse(summary));
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Historial paginado de una conversación.' })
  @ApiResponse({ status: 200, type: [MessageResponseDto] })
  async listMessages(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @Query() query: ListMessagesQueryDto,
  ) {
    try {
      const messages = await this.listMessagesUseCase.execute({
        conversationId,
        requesterId: request.user.userId,
        before: query.before ? new Date(query.before) : undefined,
        limit: query.limit ?? DEFAULT_MESSAGES_PAGE_SIZE,
      });
      return messages.map((message) => this.toMessageResponse(message));
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @Post('conversations')
  @ApiOperation({
    summary:
      'Obtiene la conversación entre el usuario autenticado y otro, creándola si no existe.',
  })
  @ApiResponse({ status: 201, type: ConversationResponseDto })
  async createConversation(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateConversationDto,
  ) {
    try {
      const conversation = await this.getOrCreateConversationUseCase.execute({
        requesterId: request.user.userId,
        requesterRole: request.user.role,
        requesterName: body.requesterName,
        requesterPhotoUrl: body.requesterPhotoUrl,
        otherUserId: body.otherUserId,
        otherUserRole: body.otherUserRole,
        otherUserName: body.otherUserName,
        otherUserPhotoUrl: body.otherUserPhotoUrl,
        propertyId: body.propertyId ?? null,
        propertyTitle: body.propertyTitle ?? null,
      });
      // Los campos de preview/no-leídos/perfil son para la lista
      // (GET /conversations, que sí hace los joins correspondientes) — este
      // endpoint solo crea/obtiene el id, no vale la pena pagar esa consulta aquí.
      return this.toConversationResponse({
        conversation,
        lastMessageContent: null,
        lastMessageType: null,
        unreadCount: 0,
        participantOneName: null,
        participantOnePhotoUrl: null,
        participantTwoName: null,
        participantTwoPhotoUrl: null,
      });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Oculta la conversación solo para el usuario autenticado (no la borra para el otro participante). Reaparece sola si llega un mensaje nuevo.',
  })
  @ApiResponse({ status: 204, description: 'Conversación ocultada.' })
  async hideConversation(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) conversationId: string,
  ): Promise<void> {
    try {
      await this.hideConversationUseCase.execute({
        conversationId,
        requesterId: request.user.userId,
      });
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  @Post('conversations/:id/documents')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        caption: { type: 'string' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Sube un documento (PDF/Word/Excel, máx. 20MB) a una conversación.',
  })
  @ApiResponse({ status: 201, type: MessageResponseDto })
  async uploadDocument(
    @Req() request: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) conversationId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_DOCUMENT_SIZE_BYTES }),
          // Valida por número mágico (bytes reales del archivo), no por el
          // Content-Type que manda el cliente — más seguro, pero exige que el
          // tipo permitido tenga una firma binaria real detectable (por eso
          // no se admite texto plano: no tiene una firma que verificar).
          new FileTypeValidator({
            fileType: ALLOWED_DOCUMENT_MIME_TYPE_PATTERN,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body() body: UploadDocumentDto,
  ) {
    try {
      const uploaded = await this.documentStorageService.uploadDocument(
        file.buffer,
        file.originalname,
      );
      const message = await this.createDocumentMessageUseCase.execute({
        conversationId,
        senderId: request.user.userId,
        caption: body.caption ?? null,
        documentUrl: uploaded.url,
        documentName: file.originalname,
        documentMimeType: file.mimetype,
        documentSizeBytes: uploaded.bytes,
      });

      // Quien subió el documento ya tiene la confirmación en esta misma
      // respuesta HTTP — se excluye del broadcast por si también tiene esta
      // conversación abierta por WS al mismo tiempo (si no, vería el mismo
      // mensaje duplicado, igual que el bug que se corrigió en el gateway).
      this.connectionRegistry.broadcastToConversation(
        conversationId,
        envelope(ServerEvents.NEW_MESSAGE, toNewMessagePayload(message)),
        request.user.userId,
      );

      return this.toMessageResponse(message);
    } catch (error) {
      throw this.mapDomainError(error);
    }
  }

  private mapDomainError(error: unknown): HttpException {
    if (error instanceof ConversationNotFoundError) {
      return new NotFoundException(error.message);
    }
    if (error instanceof NotConversationParticipantError) {
      return new ForbiddenException(error.message);
    }
    if (
      error instanceof SameParticipantError ||
      error instanceof InvalidCaptionError
    ) {
      return new BadRequestException(error.message);
    }
    return new InternalServerErrorException();
  }

  private toConversationResponse(summary: ConversationSummary) {
    const { conversation } = summary;
    return {
      id: conversation.id,
      participantOneId: conversation.participantOneId,
      participantOneRole: conversation.participantOneRole,
      participantTwoId: conversation.participantTwoId,
      participantTwoRole: conversation.participantTwoRole,
      propertyId: conversation.propertyId,
      propertyTitle: conversation.propertyTitle,
      lastMessageAt: conversation.lastMessageAt,
      lastMessageContent: summary.lastMessageContent,
      lastMessageType: summary.lastMessageType,
      unreadCount: summary.unreadCount,
      participantOneName: summary.participantOneName,
      participantOnePhotoUrl: summary.participantOnePhotoUrl,
      participantTwoName: summary.participantTwoName,
      participantTwoPhotoUrl: summary.participantTwoPhotoUrl,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  private toMessageResponse(message: Message) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      type: message.type,
      content: message.content,
      documentUrl: message.documentUrl,
      documentName: message.documentName,
      documentMimeType: message.documentMimeType,
      documentSizeBytes: message.documentSizeBytes,
      readAt: message.readAt,
      deletedAt: message.deletedAt,
      editedAt: message.editedAt,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
    };
  }
}
