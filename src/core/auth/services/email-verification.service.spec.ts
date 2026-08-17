import { EmailVerificationService } from './email-verification.service';

import { BadRequestException } from '@nestjs/common';

import { AccountStatus, User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';

describe('EmailVerificationService', () => {
  const users = {
    update: jest.fn(),
    findOneById: jest.fn(),
  };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const config = {
    getOrThrow: jest.fn().mockReturnValue('verification-secret'),
  };
  const service = new EmailVerificationService(
    users as unknown as UsersService,
    jwt as never,
    config as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('creates and stores an email-verification token', async () => {
    const user = { id: 'user-id', email: 'user@example.com' } as User;
    jwt.signAsync.mockResolvedValue('verification-token');

    await expect(service.createToken(user)).resolves.toBe('verification-token');
    expect(users.update).toHaveBeenCalledWith(user.id, {
      verificationToken: 'verification-token',
    });
  });

  it('activates an account when the stored token matches', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      email: 'user@example.com',
      purpose: 'email-verification',
    });
    users.findOneById.mockResolvedValue({
      id: 'user-id',
      verificationToken: 'token',
    });

    await expect(service.verifyEmail('token')).resolves.toEqual({
      verified: true,
    });
    expect(users.update).toHaveBeenCalledWith(
      'user-id',
      expect.objectContaining({
        status: AccountStatus.ACTIVE,
        isVerified: true,
        verificationToken: null,
      }),
    );
  });

  it('rejects an invalid token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(service.verifyEmail('token')).rejects.toEqual(
      new BadRequestException('Invalid or expired verification token'),
    );
  });
});
