import { PasswordResetService } from './password-reset.service';

import { BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import * as bcrypt from 'bcrypt';

import { UsersService } from '../../users/services/users.service';

jest.mock('bcrypt', () => ({ compare: jest.fn(), hash: jest.fn() }));

describe('PasswordResetService', () => {
  const users = {
    findOneByEmail: jest.fn(),
    findOneById: jest.fn(),
    update: jest.fn(),
    revokeAllRefreshTokens: jest.fn(),
  };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const config = { getOrThrow: jest.fn().mockReturnValue('reset-secret') };
  const events = { emit: jest.fn() };
  const service = new PasswordResetService(
    users as unknown as UsersService,
    jwt as never,
    config as never,
    events as unknown as EventEmitter2,
  );
  const hash = bcrypt.hash as jest.Mock;
  const compare = bcrypt.compare as jest.Mock;

  beforeEach(() => jest.resetAllMocks());

  it('queues the password-reset process', () => {
    service.queueForgotPasswordProcess('user@example.com');
    expect(events.emit).toHaveBeenCalledWith(
      'user.reset-password-process',
      'user@example.com',
    );
  });

  it('stores a hashed reset token and emits the raw token', async () => {
    users.findOneByEmail.mockResolvedValue({ id: 'user-id' });
    jwt.signAsync.mockResolvedValue('reset-token');
    hash.mockResolvedValue('token-hash');

    await service.forgotPassword('user@example.com');
    expect(users.update).toHaveBeenLastCalledWith('user-id', {
      resetToken: 'token-hash',
    });
    expect(events.emit).toHaveBeenCalledWith('user.forgot-password', {
      email: 'user@example.com',
      token: 'reset-token',
    });
  });

  it('rejects an invalid reset token', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('expired'));
    await expect(service.resetPassword('bad', 'password123')).rejects.toEqual(
      new BadRequestException('Invalid or expired reset token/ bad token'),
    );
  });

  it('updates the password and revokes sessions after a valid reset', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: 'user-id',
      purpose: 'password-reset',
    });
    users.findOneById.mockResolvedValue({
      id: 'user-id',
      resetToken: 'token-hash',
    });
    compare.mockResolvedValue(true);
    hash.mockResolvedValue('new-password-hash');

    await expect(
      service.resetPassword('token', 'password123'),
    ).resolves.toEqual({
      message: 'Password has been reset successfully.',
    });
    expect(users.revokeAllRefreshTokens).toHaveBeenCalledWith(
      'user-id',
      'Password reset',
    );
  });
});
