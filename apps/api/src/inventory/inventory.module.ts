import { Module } from '@nestjs/common';
import { StockService } from './stock.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [StockService, InventoryService],
  exports: [StockService, InventoryService],
})
export class InventoryModule {}
