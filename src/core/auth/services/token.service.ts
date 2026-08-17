import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import type { SignOptions } from 'jsonwebtoken';
import { type UUID, createHmac } from 'node:crypto';
import { DataSource, Repository } from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { LoginResponse } from '../types/auth-response.type';
import { AuthTokenPayload } from '../types/auth.types';

@Injectable()
export class TokenService {
  private readonly jwtRefreshSecret: string;
  private readonly jwtRefreshExpiry: string;
  private readonly refreshTokenHashSecret: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly dataSource: DataSource,
  ) {
    this.jwtRefreshSecret = configService.getOrThrow<string>(
      'appConfig.auth.jwtRefreshSecret',
    );
    this.jwtRefreshExpiry = configService.getOrThrow<string>(
      'appConfig.auth.jwtRefreshExpiry',
    );
    this.refreshTokenHashSecret = configService.getOrThrow<string>(
      'appConfig.auth.refreshTokenHashSecret',
    );
  }

  async refreshTokens(refreshToken: string): Promise<LoginResponse> {
    let payload: AuthTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const result = await this.dataSource.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(RefreshToken);
      const existingToken = await tokenRepo.findOne({
        where: { token: this.hashToken(refreshToken) },
        lock: { mode: 'pessimistic_write' },
      });

      if (!existingToken) return { outcome: 'not_found' as const };
      if (existingToken.isRevoked()) {
        await this.revokeAllUserSessions(
          existingToken.userId,
          'reuse_detected',
          tokenRepo,
        );
        return { outcome: 'reuse_detected' as const };
      }
      if (existingToken.isExpired()) return { outcome: 'expired' as const };

      existingToken.revokedAt = new Date();
      existingToken.revokedReason = 'rotated';
      await tokenRepo.save(existingToken);

      const user = await this.usersService.findOneById(payload.sub as UUID);
      if (!user) return { outcome: 'user_not_found' as const };

      const tokens = await this.issueTokenPair(
        user,
        existingToken.tokenFamily,
        tokenRepo,
        existingToken.id,
      );
      return { outcome: 'success' as const, tokens };
    });

    switch (result.outcome) {
      case 'not_found':
        throw new UnauthorizedException('Invalid refresh token');
      case 'reuse_detected':
        throw new UnauthorizedException('Refresh token reuse detected');
      case 'expired':
        throw new UnauthorizedException('Refresh token expired');
      case 'user_not_found':
        throw new UnauthorizedException('User not found');
      case 'success':
        return result.tokens;
    }
  }

  async logout(refreshToken: string): Promise<{ message: string }> {
    const existingToken = await this.refreshTokenRepository.findOne({
      where: { token: this.hashToken(refreshToken) },
    });
    if (!existingToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    existingToken.revokedAt = new Date();
    existingToken.revokedReason = 'logout';
    await this.refreshTokenRepository.save(existingToken);
    return { message: 'Logged out successfully' };
  }

  async issueTokenPair(
    user: User,
    tokenFamily: string,
    repository = this.refreshTokenRepository,
    rotatedFrom?: string,
  ): Promise<LoginResponse> {
    const payload = { email: user.email, sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.jwtRefreshSecret,
      expiresIn: this.jwtRefreshExpiry as SignOptions['expiresIn'],
    });

    const tokenEntity = repository.create({
      token: this.hashToken(refreshToken),
      tokenFamily,
      rotatedFrom,
      userId: user.id,
      expiresAt: this.calculateExpiryDate(this.jwtRefreshExpiry),
    });
    await repository.save(tokenEntity);
    return { accessToken, refreshToken };
  }

  private async revokeAllUserSessions(
    userId: string,
    reason: string,
    repository: Repository<RefreshToken>,
  ): Promise<void> {
    await repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where('userId = :userId', { userId })
      .andWhere('revokedAt IS NULL')
      .execute();
  }

  private calculateExpiryDate(duration: string): Date {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) throw new Error(`Invalid duration format: ${duration}`);
    const units: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return new Date(Date.now() + parseInt(match[1], 10) * units[match[2]]);
  }

  private hashToken(token: string): string {
    return createHmac('sha256', this.refreshTokenHashSecret)
      .update(token)
      .digest('hex');
  }
}
