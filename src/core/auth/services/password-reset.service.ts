import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';

import * as bcrypt from 'bcrypt';
import type { UUID } from 'node:crypto';

import { UsersService } from '../../users/services/users.service';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  queueForgotPasswordProcess(email: string): void {
    this.eventEmitter.emit('user.reset-password-process', email);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findOneByEmail(email);
    if (!user) return;

    const token = await this.jwtService.signAsync(
      { sub: user.id, purpose: 'password-reset' },
      {
        secret: this.configService.getOrThrow<string>(
          'appConfig.auth.jwtResetSecret',
        ),
        expiresIn: '15m',
      },
    );
    await this.usersService.update(user.id as UUID, { resetToken: null });
    await this.usersService.update(user.id as UUID, {
      resetToken: await bcrypt.hash(token, 10),
    });
    this.eventEmitter.emit('user.forgot-password', { email, token });
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<{ message: string }> {
    let payload: { sub: string; purpose: string };
    try {
      payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.getOrThrow<string>(
          'appConfig.auth.jwtResetSecret',
        ),
      });
    } catch {
      throw new BadRequestException(
        'Invalid or expired reset token/ bad token',
      );
    }
    if (payload.purpose !== 'password-reset') {
      throw new BadRequestException('Invalid or expired reset token/ purpose');
    }

    const user = await this.usersService.findOneById(payload.sub as UUID);
    if (!user || !user.resetToken) {
      throw new BadRequestException(
        'Invalid or expired reset token/ no user or reset token',
      );
    }
    if (!(await bcrypt.compare(token, user.resetToken))) {
      throw new BadRequestException(
        'Invalid or expired reset token/ token mismatch',
      );
    }

    await this.usersService.update(user.id as UUID, {
      password: await bcrypt.hash(password, 10),
      resetToken: null,
      loginAttempts: 0,
    });
    await this.usersService.revokeAllRefreshTokens(user.id, 'Password reset');
    return { message: 'Password has been reset successfully.' };
  }
}
