import { TokenService } from './token.service';

import { UnauthorizedException } from '@nestjs/common';

import { UsersService } from '../../users/services/users.service';
import { RefreshToken } from '../entities/refresh-token.entity';

describe('TokenService', () => {
  const users = { findOneById: jest.fn() };
  const jwt = { signAsync: jest.fn(), verifyAsync: jest.fn() };
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({
          'appConfig.auth.jwtRefreshSecret': 'refresh-secret',
          'appConfig.auth.jwtRefreshExpiry': '7d',
          'appConfig.auth.refreshTokenHashSecret': 'hash-secret',
        })[key],
    ),
  };
  const repository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn((value: Partial<RefreshToken>) => value),
  };
  const dataSource = { transaction: jest.fn() };
  const service = new TokenService(
    users as unknown as UsersService,
    jwt as never,
    config as never,
    repository as never,
    dataSource as never,
  );

  beforeEach(() => jest.resetAllMocks());

  it('rejects an invalid refresh token before querying the database', async () => {
    jwt.verifyAsync.mockRejectedValue(new Error('invalid'));
    await expect(service.refreshTokens('bad-token')).rejects.toEqual(
      new UnauthorizedException('Invalid or expired refresh token'),
    );
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('revokes and saves a matching refresh token on logout', async () => {
    const token = {
      revokedAt: null,
      revokedReason: null,
    } as unknown as RefreshToken;
    repository.findOne.mockResolvedValue(token);

    await expect(service.logout('refresh-token')).resolves.toEqual({
      message: 'Logged out successfully',
    });
    expect(token.revokedReason).toBe('logout');
    expect(repository.save).toHaveBeenCalledWith(token);
  });
});
