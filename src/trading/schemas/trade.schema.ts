import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TradeDocument = Trade & Document;

@Schema()
export class Trade {
  @Prop({ required: true })
  symbol: string; // Ví dụ: BTCUSDT

  @Prop({ required: true })
  action: string; // "BUY" hoặc "SELL"

  @Prop({ required: true })
  entryPrice: number; // Giá vào lệnh

  @Prop({ required: true })
  depositAmount: number; // Số tiền đầu tư cố định

  @Prop({ required: true })
  margin: number; // Đòn bẩy

  @Prop()
  takeProfit: number; // Giá chốt lời (TP)

  @Prop()
  stopLoss: number; // Giá cắt lỗ (SL)

  @Prop({ default: Date.now })
  timestamp: Date; // Thời gian giao dịch

  @Prop()
  profitLossAmount: number; // Lời/Lỗ tính theo số tiền

  @Prop()
  profitLossPercent: number; // Lời/Lỗ tính theo phần trăm

  @Prop()
  result: string; // Kết quả giao dịch, "THẮNG" hoặc "THUA"
}

export const TradeSchema = SchemaFactory.createForClass(Trade);
