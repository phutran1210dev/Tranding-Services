import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingService } from './trading.service';
import { Trade, TradeSchema } from './schemas/trade.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trade.name, schema: TradeSchema }]), // Đăng ký model Trade với Mongoose
  ],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
