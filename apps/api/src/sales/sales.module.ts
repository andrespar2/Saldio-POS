import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { AccountingModule } from '../accounting/accounting.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { CashService } from './cash.service';
import { FinanceService } from './finance.service';
import { ReceiptService } from './receipt.service';

@Module({
  imports: [InventoryModule, AccountingModule],
  controllers: [SalesController],
  providers: [SalesService, CashService, FinanceService, ReceiptService],
  exports: [SalesService, CashService, FinanceService, ReceiptService],
})
export class SalesModule {}
