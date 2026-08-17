import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

import { CloudinaryService } from '../../../infrastructure/cloudinary/cloudinary.service';
import { UsersService } from '../services/users.service';

@Injectable()
export class UserEventListener {
  private readonly logger = new Logger(UserEventListener.name);

  constructor(
    private readonly cloudinaryService: CloudinaryService,
    private readonly usersService: UsersService,
  ) {}
  @OnEvent('user.profile_picture.upload', { async: true })
  async handleProfileUploadEvent(payload: {
    userId: string;
    file: Express.Multer.File;
  }): Promise<void> {
    try {
      const result = await this.cloudinaryService.uploadImage(payload.file);
      await this.usersService.updateProfilePicture(
        payload.userId,
        result.secure_url,
      );
    } catch (error: unknown) {
      this.logger.error('Profile picture upload failed', error);
    }
  }
}
