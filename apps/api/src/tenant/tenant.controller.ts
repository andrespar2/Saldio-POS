import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { TenantGuard, type AuthContext, type AuthenticatedRequest } from '../common/guards';
import { CurrentAuth, Public, RequirePermissions } from '../common/decorators';
import { TenantAccessService } from './tenant-access.service';
import { TenantSettingsService } from './tenant-settings.service';
import { StorageService } from '../common/storage.service';
import {
  CreateBranchDto,
  CreateEmployeeDto,
  CreateRegisterDto,
  CreateStoreUserDto,
  CreateWarehouseDto,
  OnboardingDto,
  PaginationDto,
  ResetStoreUserDto,
  UpdateStoreSettingsDto,
  UpdateStoreUserDto,
} from './tenant-settings.dto';

@ApiTags('Tienda')
@ApiBearerAuth()
@UseGuards(TenantGuard)
@Controller('tenant')
export class TenantController {
  constructor(
    private readonly accessService: TenantAccessService,
    private readonly settings: TenantSettingsService,
  ) {}

  @Get('access')
  access(@CurrentAuth() auth: AuthContext) {
    return this.accessService.access(auth);
  }

  @Get('store')
  store(@CurrentAuth() auth: AuthContext) {
    return this.settings.store(auth);
  }

  @Patch('store')
  @RequirePermissions('settings.manage')
  updateStore(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: UpdateStoreSettingsDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.updateStore(auth, dto, req.ip);
  }

  @Post('store/logo')
  @RequirePermissions('settings.manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  logo(
    @CurrentAuth() auth: AuthContext,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.uploadLogo(auth, file, req.ip);
  }

  @Get('branches')
  branches() {
    return this.settings.branches();
  }

  @Post('branches')
  @RequirePermissions('settings.manage')
  createBranch(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateBranchDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.createBranch(auth, dto, req.ip);
  }

  @Patch('branches/:id')
  @RequirePermissions('settings.manage')
  updateBranch(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: Partial<CreateBranchDto> & { active?: boolean },
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.updateBranch(auth, id, dto, req.ip);
  }

  @Get('warehouses')
  @RequirePermissions('inventory.read')
  warehouses() {
    return this.settings.warehouses();
  }

  @Post('warehouses')
  @RequirePermissions('inventory.write')
  createWarehouse(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateWarehouseDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.createWarehouse(auth, dto, req.ip);
  }

  @Get('registers')
  registers() {
    return this.settings.registers();
  }

  @Post('registers')
  @RequirePermissions('settings.manage')
  createRegister(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateRegisterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.createRegister(auth, dto, req.ip);
  }

  @Get('employees')
  @RequirePermissions('users.manage')
  employees() {
    return this.settings.employees();
  }

  @Post('employees')
  @RequirePermissions('users.manage')
  createEmployee(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateEmployeeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.createEmployee(auth, dto, req.ip);
  }

  @Get('users')
  @RequirePermissions('users.manage')
  users(@CurrentAuth() auth: AuthContext) {
    return this.settings.users(auth);
  }

  @Post('users')
  @RequirePermissions('users.manage')
  createUser(
    @CurrentAuth() auth: AuthContext,
    @Body() dto: CreateStoreUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.createUser(auth, dto, req.ip);
  }

  @Patch('users/:id')
  @RequirePermissions('users.manage')
  updateUser(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: UpdateStoreUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.updateUser(auth, id, dto, req.ip);
  }

  @Post('users/:id/reset-password')
  @RequirePermissions('users.manage')
  resetUser(
    @CurrentAuth() auth: AuthContext,
    @Param('id') id: string,
    @Body() dto: ResetStoreUserDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.settings.resetUserPassword(auth, id, dto.reason, req.ip);
  }

  @Get('onboarding')
  @RequirePermissions('settings.manage')
  onboarding() {
    return this.settings.onboarding();
  }

  @Patch('onboarding')
  @RequirePermissions('settings.manage')
  setOnboarding(@CurrentAuth() auth: AuthContext, @Body() dto: OnboardingDto) {
    return this.settings.setOnboarding(auth, dto);
  }

  @Get('audit')
  @RequirePermissions('settings.manage')
  audit(
    @CurrentAuth() auth: AuthContext,
    @Query() query: PaginationDto,
  ) {
    return this.settings.auditLog(auth, query.page, query.pageSize);
  }
}

@ApiTags('Archivos privados')
@Controller('files')
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  @Public()
  @Get(':id')
  async file(
    @Param('id') id: string,
    @Query('token') token: string,
  ): Promise<StreamableFile> {
    const { file, buffer } = await this.storage.readSigned(id, token ?? '');
    return new StreamableFile(buffer, {
      type: file.mime,
      disposition: `inline; filename="${file.originalName.replace(/"/g, '')}"`,
      length: file.size,
    });
  }
}
