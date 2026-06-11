import { Module } from '@nestjs/common';
import { PantryModule } from '../pantry/pantry.module';
import { AssistantController } from './assistant.controller';
import { AssistantService } from './assistant.service';

@Module({
  imports: [PantryModule],
  controllers: [AssistantController],
  providers: [AssistantService],
})
export class AssistantModule {}
