import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

import type { UUID } from 'node:crypto';

import { AccountStatus, User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async createToken(user: User): Promise<string> {
    const token = await this.jwtService.signAsync(
      { sub: user.id, email: user.email, purpose: 'email-verification' },
      {
        secret: this.configService.getOrThrow<string>(
          'appConfig.auth.jwtVerificationSecret',
        ),
        expiresIn: '15m',
      },
    );
    await this.usersService.update(user.id as UUID, {
      verificationToken: token,
    });
    return token;
  }

  async verifyEmail(token: string): Promise<{ verified: boolean }> {
    let payload: { sub: string; email: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>(
          'appConfig.auth.jwtVerificationSecret',
        ),
      });
    } catch (error: unknown) {
      this.logger.error('Email verification failed', error);
      throw new BadRequestException('Invalid or expired verification token');
    }

    if (payload.purpose !== 'email-verification') {
      throw new BadRequestException('Invalid or expired verification token');
    }
    const user = await this.usersService.findOneById(payload.sub as UUID);
    if (!user || user.verificationToken !== token) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.usersService.update(user.id as UUID, {
      status: AccountStatus.ACTIVE,
      emailVerifiedAt: new Date(),
      isVerified: true,
      verificationToken: null,
    });
    return { verified: true };
  }
}
