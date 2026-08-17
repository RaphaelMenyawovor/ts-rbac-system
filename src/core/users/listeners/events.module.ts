import { UserEventListener } from './user-event.listeners';

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

import { CloudinaryModule } from '../../../infrastructure/cloudinary/cloudinary.module';
import { UsersModule } from '../users.module';

@Module({
  imports: [CloudinaryModule, EventEmitterModule.forRoot(), UsersModule],
  providers: [UserEventListener],
})
export class EventsModule {}
