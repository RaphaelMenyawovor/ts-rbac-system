import { EmailVerificationService } from './email-verification.service';
import { TokenService } from './token.service';

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import * as bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

import { User } from '../../users/entities/user.entity';
import { UsersService } from '../../users/services/users.service';
import { LoginAuthDto } from '../dto/login.dto';
import { RegisterAuthDto } from '../dto/register.dto';
import { LoginResponse, RegisterResponse } from '../types/auth-response.type';

const DUMMY_PASSWORD_HASH =
  '$2b$12$MwL2hICCvJC6Ft2pCEb/o.TxXNtKk8bgxTDbE0SYclpdRrSxrpN0u';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly tokenService: TokenService,
    private readonly emailVerificationService: EmailVerificationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async validateUser(email: string, password: string): Promise<User> {
    const user = await this.usersService.findOneByEmailWithPassword(email);
    if (!user || !user.password) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    const now = Date.now();
    if (user.lockedUntil && user.lockedUntil.getTime() > now) {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil) {
      await this.usersService.resetFailedAttempts(user.id);
      user.loginAttempts = 0;
      user.lockedUntil = null;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await this.usersService.incrementFailedAttempts(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.loginAttempts > 0) {
      await this.usersService.resetFailedAttempts(user.id);
    }

    if (!user.isVerified) {
      throw new ForbiddenException('Please verify your email to continue');
    }
    return user;
  }

  async register(registerAuthDto: RegisterAuthDto): Promise<RegisterResponse> {
    const existingUser = await this.usersService.findOneByEmail(
      registerAuthDto.email,
    );
    if (existingUser) {
      throw new BadRequestException('Email is already registered');
    }

    const hashedPassword = await bcrypt.hash(registerAuthDto.password, 10);
    const user = await this.usersService.create({
      email: registerAuthDto.email,
      name: registerAuthDto.email.split('@')[0],
      password: hashedPassword,
    });
    const token = await this.emailVerificationService.createToken(user);

    this.eventEmitter.emit('user.registered', { email: user.email, token });

    return { id: user.id, email: user.email };
  }

  async login(loginAuthDto: LoginAuthDto): Promise<LoginResponse> {
    const user = await this.validateUser(
      loginAuthDto.email,
      loginAuthDto.password,
    );
    return this.tokenService.issueTokenPair(user, randomUUID());
  }
}
