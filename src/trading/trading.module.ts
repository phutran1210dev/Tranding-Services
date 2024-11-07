import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TradingService } from './trading.service';
import { Trade, TradeSchema } from './schemas/trade.schema';
import { TradingController } from './trading.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trade.name, schema: TradeSchema }]), // Đăng ký model Trade với Mongoose
  ],
  providers: [TradingService],
  controllers: [TradingController],
  exports: [TradingService],
})
export class TradingModule {}
