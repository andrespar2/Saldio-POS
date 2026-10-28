import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { PrismaService } from '../prisma/prisma.service';
import type { Env } from '../config/env';
import { signPayload, uuid, verifyPayload } from './security';

interface ImageType {
  mime: string;
  ext: string;
  matches: (buffer: Buffer) => boolean;
}

const IMAGE_TYPES: ImageType[] = [
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b) =>
      b.length > 12 &&
      b.toString('ascii', 0, 4) === 'RIFF' &&
      b.toString('ascii', 8, 12) === 'WEBP',
  },
];

@Injectable()
export class StorageService {
  private readonly logger = new Logger('Storage');
  private readonly baseDir: string;
  private readonly signingSecret: string;
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {
    this.baseDir = path.resolve(
      process.cwd(),
      this.config.get('STORAGE_DIR', { infer: true }),
    );
    this.signingSecret = this.config.get('FILE_SIGNING_SECRET', { infer: true });
    this.maxBytes = this.config.get('MAX_UPLOAD_BYTES', { infer: true });
  }

  async saveImage(params: {
    tenantId: string;
    userId?: string;
    originalName: string;
    buffer: Buffer;
    visibility?: 'PRIVATE' | 'PUBLIC_LOGO';
  }) {
    if (!params.buffer?.length) {
      throw new BadRequestException('El archivo está vacío.');
    }
    if (params.buffer.length > this.maxBytes) {
      throw new BadRequestException(
        `La imagen supera el máximo de ${Math.round(this.maxBytes / 1024)} KB.`,
      );
    }
    const type = IMAGE_TYPES.find((t) => t.matches(params.buffer));
    if (!type) {
      throw new BadRequestException('Formato no permitido. Use PNG, JPG o WebP.');
    }
    const key = `${params.tenantId}/${uuid()}.${type.ext}`;
    const absolute = path.join(this.baseDir, key);
    await fs.mkdir(path.dirname(absolute), { recursive: true, mode: 0o700 });
    await fs.writeFile(absolute, params.buffer, { mode: 0o600 });
    const sha256 = createHash('sha256').update(params.buffer).digest('hex');
    const record = await this.prisma.db.fileObject.create({
      data: {
        tenantId: params.tenantId,
        key,
        originalName: path.basename(params.originalName).slice(0, 180),
        mime: type.mime,
        size: params.buffer.length,
        sha256,
        visibility: params.visibility ?? 'PRIVATE',
        createdById: params.userId,
      },
    });
    return { id: record.id, key: record.key, mime: record.mime, size: record.size };
  }

  signedUrl(fileId: string, tenantId: string, minutes = 10): string {
    const token = signPayload(this.signingSecret, {
      fileId,
      tenantId,
      exp: Date.now() + minutes * 60_000,
    });
    return `/api/v1/files/${fileId}?token=${encodeURIComponent(token)}`;
  }

  async readSigned(fileId: string, token: string) {    const payload = verifyPayload<{ fileId: string; tenantId: string; exp: number }>(
      this.signingSecret,
      token,
    );
    if (!payload || payload.fileId !== fileId) {
      throw new NotFoundException('Archivo no disponible o enlace vencido.');
    }
    const file = await this.prisma.withPlatform(async () =>
      this.prisma.db.fileObject.findFirst({
        where: { id: fileId, tenantId: payload.tenantId },
      }),
    );
    if (!file) throw new NotFoundException('Archivo no encontrado.');
    const absolute = path.join(this.baseDir, file.key);
    const buffer = await fs.readFile(absolute).catch(() => null);
    if (!buffer) throw new NotFoundException('Archivo no encontrado.');
    return { file, buffer };
  }

  async readForTenant(fileId: string, tenantId: string) {
    const file = await this.prisma.withPlatform(() =>
      this.prisma.db.fileObject.findFirst({ where: { id: fileId, tenantId } }),
    );
    if (!file) return null;
    return {
      file,
      buffer: await fs.readFile(path.join(this.baseDir, file.key)).catch(() => null),
    };
  }

  async remove(key: string): Promise<void> {
    await fs.unlink(path.join(this.baseDir, key)).catch((error) => {
      this.logger.warn(`No se pudo borrar ${key}: ${String(error)}`);
    });
  }
}
