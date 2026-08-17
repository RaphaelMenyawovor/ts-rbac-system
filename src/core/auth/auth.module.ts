import { Module, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import type { SignOptions } from 'jsonwebtoken';

import { QueueModule } from '../../infrastructure/queue/queue.module';
import { UsersModule } from '../users/users.module';

import { AuthController } from './controllers/auth.controller';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthListener } from './listeners/auth-events.listener';
import { AuthService } from './services/auth.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordResetService } from './services/password-reset.service';
import { TokenService } from './services/token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';

@Module({
  imports: [
    UsersModule,
    forwardRef(() => QueueModule),
    TypeOrmModule.forFeature([RefreshToken]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const expiresIn = configService.get<string>(
          'appConfig.auth.jwtAccessExpiry',
        ) as SignOptions['expiresIn'];

        return {
          secret: configService.getOrThrow<string>(
            'appConfig.auth.jwtAccessSecret',
          ),
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokenService,
    EmailVerificationService,
    PasswordResetService,
    LocalStrategy,
    JwtStrategy,
    AuthListener,
  ],
  exports: [
    AuthService,
    TokenService,
    EmailVerificationService,
    PasswordResetService,
    JwtModule,
  ],
})
export class AuthModule {}
