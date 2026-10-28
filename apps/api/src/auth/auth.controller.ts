import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ChangeUsernameDto,
  ForgotPasswordDto,
  LoginDto,
  RefreshDto,
  ResetPasswordDto,
  SelectTenantDto,
  UpdateProfileDto,
} from './auth.dto';
import { CurrentAuth, Public } from '../common/decorators';
import type { AuthContext, AuthenticatedRequest } from '../common/guards';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('Autenticación')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: process.env.NODE_ENV === 'test' ? 100_000 : 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() req: AuthenticatedRequest) {
    return this.auth.login({
      username: dto.username,
      password: dto.password,
      tenantId: dto.tenantId,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Public()
  @Post('select-tenant')
  @HttpCode(200)
  selectTenant(@Body() dto: SelectTenantDto) {
    return this.auth.selectTenant(dto.selectionToken, dto.tenantId);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiBearerAuth()
  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentAuth() auth: AuthContext) {
    await this.auth.logout(auth);
    return { ok: true };
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentAuth() auth: AuthContext) {
    return this.auth.me(auth);
  }

  @ApiBearerAuth()
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      auth,
      dto.currentPassword,
      dto.newPassword,
      dto.confirmPassword,
    );
  }

  @ApiBearerAuth()
  @Post('change-username')
  @HttpCode(200)
  changeUsername(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: ChangeUsernameDto,
  ) {
    return this.auth.changeUsername(auth, dto.currentPassword, dto.username);
  }

  @ApiBearerAuth()
  @Patch('profile')
  updateProfile(@CurrentAuth() auth: AuthContext, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(auth, dto.fullName, dto.phone);
  }

  @ApiBearerAuth()
  @Get('preferences')
  preferences(@CurrentAuth() auth: AuthContext) {
    return this.auth.preferences(auth);
  }

  @ApiBearerAuth()
  @Patch('preferences')
  updatePreferences(
    @CurrentAuth() auth: AuthContext,
    @Body() preferences: Record<string, unknown>,
  ) {
    return this.auth.updatePreferences(auth, preferences);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotPasswordDto, @Req() req: AuthenticatedRequest) {
    await this.auth.requestPasswordReset(dto.email, req.ip);
    return {
      message:
        'Si el correo está registrado, enviaremos un enlace de recuperación.',
    };
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.password, dto.confirmPassword);
  }

  @ApiBearerAuth()
  @Get('sessions')
  async sessions(@CurrentAuth() auth: AuthContext) {
    const sessions = await this.prisma.session.findMany({
      where: { userId: auth.userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastUsedAt: true,
        expiresAt: true,
        tenantId: true,
        userAgent: true,
        ip: true,
      },
    });
    return sessions.map((s) => ({ ...s, current: s.id === auth.sessionId }));
  }

  @ApiBearerAuth()
  @Delete('sessions/:id')
  async revokeSession(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
  ) {
    await this.prisma.session.updateMany({
      where: { id, userId: auth.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
