import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Public } from '../common/decorators';
import { PublicService } from './public.service';
import type { AuthenticatedRequest } from '../common/guards';

@ApiTags('Registro público')
@Controller('public')
export class PublicController {
  constructor(private readonly publicService: PublicService) {}

  @Public()
  @Get('plans')
  plans() {
    return this.publicService.plans();
  }

  @Public()
  @Get('business-types')
  businessTypes() {
    return this.publicService.businessTypes();
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('stores')
  @HttpCode(201)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('logo', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024, files: 1 },
    }),
  )
  register(
    @Body() body: Record<string, unknown>,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.publicService.register(body, file, req.ip);
  }
}
