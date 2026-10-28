import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T = unknown>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return (row?.value as T) ?? fallback;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: value as never },
      create: { key, value: value as never },
    });
  }
}
