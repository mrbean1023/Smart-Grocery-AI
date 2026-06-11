import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  chatMessageSchema,
  type ChatMessageInput,
  type ChatSessionDto,
} from '@smart-grocery/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthUser } from '../auth/types';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';
import { AssistantService, ChatResponse, SessionPreview } from './assistant.service';

@Controller('assistant')
export class AssistantController {
  constructor(private readonly assistant: AssistantService) {}

  @Post('chat')
  chat(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(chatMessageSchema)) body: ChatMessageInput,
  ): Promise<ChatResponse> {
    return this.assistant.chat(user, body);
  }

  @Get('sessions')
  listSessions(@CurrentUser() user: AuthUser): Promise<SessionPreview[]> {
    return this.assistant.listSessions(user.id);
  }

  @Get('sessions/:id')
  getSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ChatSessionDto> {
    return this.assistant.getSession(user.id, id);
  }

  @Delete('sessions/:id')
  deleteSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<{ deleted: true }> {
    return this.assistant.deleteSession(user.id, id);
  }
}
