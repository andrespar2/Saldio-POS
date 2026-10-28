import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PlatformGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, RequirePlatform } from '../common/decorators';
import { PlatformService } from './platform.service';
import {
  AdminResetDto,
  AuditQueryDto,
  ChangePlanDto,
  ChangeStoreStatusDto,
  CreatePlatformAdminDto,
  PlanDto,
  PlatformSettingsDto,
  StoreQueryDto,
  SupportSessionDto,
  UpdatePlatformAdminDto,
  UpdatePlanDto,
  UpdateStoreDto,
} from './platform.dto';

@ApiTags('Administración de plataforma')
@ApiBearerAuth()
@UseGuards(PlatformGuard)
@Controller('platform')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('dashboard')
  @RequirePlatform('platform.stores.read')
  dashboard() {
    return this.platform.dashboard();
  }

  @Get('stores')
  @RequirePlatform('platform.stores.read')
  listStores(@Query() query: StoreQueryDto) {
    return this.platform.listStores(query);
  }

  @Get('stores/:id')
  @RequirePlatform('platform.stores.read')
  storeDetail(@Param('id') id: string) {
    return this.platform.storeDetail(id);
  }

  @Patch('stores/:id')
  @RequirePlatform('platform.stores.write')
  updateStore(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateStoreDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.updateStore(auth, id, dto, req.ip);
  }

  @Post('stores/:id/approve')
  @RequirePlatform('platform.stores.write')
  @HttpCode(200)
  approve(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.approveStore(auth, id, req.ip);
  }

  @Post('stores/:id/status')
  @RequirePlatform('platform.stores.write')
  @HttpCode(200)
  changeStatus(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ChangeStoreStatusDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.changeStatus(auth, id, dto, req.ip);
  }

  @Post('stores/:id/plan')
  @RequirePlatform('platform.stores.write')
  @HttpCode(200)
  changePlan(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ChangePlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.changePlan(auth, id, dto, req.ip);
  }

  @Post('stores/:id/support-sessions')
  @RequirePlatform('platform.support.access')
  @HttpCode(201)
  support(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: SupportSessionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.createSupportSession(auth, id, dto, req.ip);
  }

  @Delete('support-sessions/:id')
  @RequirePlatform('platform.support.access')
  revokeSupport(@CurrentAuth() auth: AuthContext, @Param('id') id: string) {
    return this.platform.revokeSupportSession(auth, id);
  }

  @Post('users/:id/reset-password')
  @RequirePlatform('platform.stores.write')
  @HttpCode(200)
  resetPassword(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: AdminResetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.resetUserPassword(auth, id, dto.reason, req.ip);
  }

  @Get('admins')
  @RequirePlatform('platform.admins.manage')
  admins() {
    return this.platform.listAdmins();
  }

  @Post('admins')
  @RequirePlatform('platform.admins.manage')
  createAdmin(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreatePlatformAdminDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.createAdmin(auth, dto, req.ip);
  }

  @Patch('admins/:id')
  @RequirePlatform('platform.admins.manage')
  updateAdmin(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePlatformAdminDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.updateAdmin(auth, id, dto, req.ip);
  }

  @Post('admins/:id/reset-password')
  @RequirePlatform('platform.admins.manage')
  @HttpCode(200)
  adminReset(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: AdminResetDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.resetUserPassword(auth, id, dto.reason, req.ip);
  }

  @Get('plans')
  @RequirePlatform('platform.plans.manage')
  plans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  @RequirePlatform('platform.plans.manage')
  createPlan(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.createPlan(auth, dto, req.ip);
  }

  @Patch('plans/:id')
  @RequirePlatform('platform.plans.manage')
  updatePlan(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.updatePlan(auth, id, dto, req.ip);
  }

  @Get('settings')
  @RequirePlatform('platform.settings.manage')
  settingsGet() {
    return this.platform.getSettings();
  }

  @Patch('settings')
  @RequirePlatform('platform.settings.manage')
  settingsUpdate(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: PlatformSettingsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.platform.updateSettings(auth, dto, req.ip);
  }

  @Get('audit')
  @RequirePlatform('platform.audit.read')
  audit(@Query() query: AuditQueryDto) {
    return this.platform.auditLog(query);
  }

  @Get('operations')
  @RequirePlatform('platform.jobs.manage')
  operations() {
    return this.platform.operations();
  }

  @Post('jobs/:id/retry')
  @RequirePlatform('platform.jobs.manage')
  @HttpCode(200)
  retryJob(@Param('id') id: string) {
    return this.platform.retryJob(id);
  }
}
