import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';

import { Job } from 'bullmq';

import { PasswordResetService } from '../services/password-reset.service';
import { AuthJobData } from '../types/auth.types';

@Processor('auth')
export class AuthProcessor extends WorkerHost {
  private readonly logger = new Logger(AuthProcessor.name);
  private readonly passwordResetService: PasswordResetService;

  constructor(passwordResetService: PasswordResetService) {
    super();
    this.passwordResetService = passwordResetService;
  }

  async process(job: Job<AuthJobData>): Promise<void> {
    this.logger.log(`Processing job ${job.id} → ${job.name}`);

    switch (job.name) {
      case 'reset-password':
        await this.passwordResetService.forgotPassword(job.data.email);
        break;
      default:
        throw new Error(`Unknown job: ${job.name}`);
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Job ${job.id} completed`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error): void {
    this.logger.error(`Job ${job.id} failed: ${error.message}`);
  }
}
