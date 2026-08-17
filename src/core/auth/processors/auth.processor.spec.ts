import { AuthProcessor } from './auth.processor';

import { Job } from 'bullmq';

import { PasswordResetService } from '../services/password-reset.service';
import { AuthJobData } from '../types/auth.types';

describe('AuthProcessor', () => {
  let processor: AuthProcessor;
  let authService: { forgotPassword: jest.Mock };

  beforeEach(() => {
    authService = { forgotPassword: jest.fn().mockResolvedValue(undefined) };
    processor = new AuthProcessor(
      authService as unknown as PasswordResetService,
    );
  });

  describe('process', () => {
    it('calls authService.forgotPassword for a reset-password job', async () => {
      const job = {
        id: 'job-1',
        name: 'reset-password',
        data: { email: 'user@example.com' },
      } as Job<AuthJobData>;

      await processor.process(job);

      expect(authService.forgotPassword).toHaveBeenCalledWith(
        'user@example.com',
      );
    });

    it('throws for an unrecognized job name', async () => {
      const job = {
        id: 'job-2',
        name: 'unknown-job',
        data: { email: 'user@example.com' },
      } as Job<AuthJobData>;

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown job: unknown-job',
      );
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('does not throw when logging a completed job', () => {
      const job = { id: 'job-1' } as Job;

      expect(() => processor.onCompleted(job)).not.toThrow();
    });

    it('does not throw when logging a failed job', () => {
      const job = { id: 'job-1' } as Job;
      const error = new Error('boom');

      expect(() => processor.onFailed(job, error)).not.toThrow();
    });
  });
});
