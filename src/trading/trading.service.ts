// src/trading/trading.service.ts

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as technicalindicators from 'technicalindicators';
import * as dotenv from 'dotenv';
import { Trade, TradeDocument } from './schemas/trade.schema';

dotenv.config();

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private readonly symbol = process.env.SYMBOL || 'BTCUSDT';
  private readonly depositAmount = 100;
  private readonly margin = parseInt(process.env.DEFAULT_MARGIN) || 25;
  private lastAction = '';
  private entryPrice = 0;
  private tradeInProgress = false;
  private pnlInterval: NodeJS.Timeout;
  private tradeStartTime: number;
  private priceHistory: Array<{ time: string; price: number }> = [];

  private winCount = 0;
  private lossCount = 0;
  private totalProfitLoss = 0;
  private consecutiveTrades = 0; // Track consecutive trades to limit to max 1-2

  constructor(
    @InjectModel(Trade.name) private tradeModel: Model<TradeDocument>
  ) {
    this.startTrading();
  }

  async getCandles() {
    const url = `https://api.binance.com/api/v3/klines?symbol=${this.symbol}&interval=15m&limit=50`;
    const { data } = await axios.get(url);
    return data.map(candle => ({
      openTime: candle[0],
      close: parseFloat(candle[4]),
    }));
  }

  async calculateEMA() {
    const candles = await this.getCandles();
    const closes = candles.map(candle => candle.close);

    const ema12 = technicalindicators.EMA.calculate({ period: 12, values: closes });
    const ema26 = technicalindicators.EMA.calculate({ period: 26, values: closes });
    const ema200 = technicalindicators.EMA.calculate({ period: 200, values: closes });

    return { ema12, ema26, ema200, latestClose: closes[closes.length - 1] };
  }

  async trade() {
    const { ema12, ema26, ema200, latestClose } = await this.calculateEMA();
    const latestEMA12 = ema12[ema12.length - 1];
    const latestEMA26 = ema26[ema26.length - 1];
    const latestEMA200 = ema200[ema200.length - 1];

    // Determine signals and limit to 1-2 consecutive trades per signal type
    const isBuySignal = latestEMA12 > latestEMA26 && this.lastAction !== 'BUY' && this.consecutiveTrades < 2;
    const isSellSignal = latestEMA12 < latestEMA26 && this.lastAction !== 'SELL' && this.consecutiveTrades < 2;

    if (!this.tradeInProgress) {
      if (isBuySignal) {
        await this.executeTrade('BUY', latestClose, latestEMA200);
      } else if (isSellSignal) {
        await this.executeTrade('SELL', latestClose, latestEMA200);
      }
    }

    this.logPrice(latestClose);
  }

  async executeTrade(action: 'BUY' | 'SELL', latestClose: number, ema200: number) {
    this.entryPrice = latestClose;
    this.tradeInProgress = true;
    this.lastAction = action;
    this.tradeStartTime = Date.now();
    this.consecutiveTrades++; // Increment consecutive trade count for the current action

    // Calculate SL and TP
    const slPercentage = 0.015 + Math.random() * 0.015; // Random SL between 1.5% - 3%
    const stopLoss = action === 'BUY'
      ? Math.min(ema200, this.entryPrice * (1 - slPercentage))
      : Math.max(ema200, this.entryPrice * (1 + slPercentage));
    const riskToRewardRatio = 2; // R:R of 1:2
    const takeProfit = action === 'BUY'
      ? this.entryPrice * (1 + slPercentage * riskToRewardRatio)
      : this.entryPrice * (1 - slPercentage * riskToRewardRatio);

    this.logger.log(`🔔 ${action === 'BUY' ? 'Vào lệnh MUA' : 'Vào lệnh BÁN'} tại giá: ${this.entryPrice}, SL: ${stopLoss}, TP: ${takeProfit}`);

    await this.saveTrade(action, this.entryPrice, takeProfit, stopLoss);
    this.monitorPnL(takeProfit, stopLoss);
  }

  async saveTrade(action: string, entryPrice: number, takeProfit: number, stopLoss: number) {
    const newTrade = new this.tradeModel({
      symbol: this.symbol,
      action,
      entryPrice,
      depositAmount: this.depositAmount,
      margin: this.margin,
      takeProfit,
      stopLoss,
      timestamp: new Date(),
    });
    await newTrade.save();
    this.logger.log('✅ Giao dịch đã được lưu vào MongoDB');
  }

  async monitorPnL(takeProfit: number, stopLoss: number) {
    if (this.pnlInterval) {
      clearInterval(this.pnlInterval);
    }

    this.pnlInterval = setInterval(async () => {
      const { latestClose } = await this.calculateEMA();
      const pnlPercent = ((latestClose - this.entryPrice) / this.entryPrice) * 100 * this.margin;
      const pnlAmount = (pnlPercent / 100) * this.depositAmount;

      this.logger.log(
        `💰 Giá hiện tại: ${latestClose} | Giá vào lệnh: ${this.entryPrice} | Lợi nhuận: ${pnlPercent.toFixed(2)}% | Lợi nhuận/Lỗ: ${pnlAmount.toFixed(2)} USDT`
      );

      const tradeDuration = (Date.now() - this.tradeStartTime) / 1000 / 60;
      if (tradeDuration >= 15 || latestClose >= takeProfit || latestClose <= stopLoss) {
        clearInterval(this.pnlInterval);
        this.closeTrade(pnlAmount, pnlPercent);
      }
    }, 30000);
  }

  async closeTrade(pnlAmount: number, pnlPercent: number) {
    this.tradeInProgress = false;
    const result = pnlAmount >= 0 ? 'THẮNG' : 'THUA';

    const closedTrade = new this.tradeModel({
      symbol: this.symbol,
      action: this.lastAction,
      entryPrice: this.entryPrice,
      depositAmount: this.depositAmount,
      margin: this.margin,
      profitLossAmount: pnlAmount,
      profitLossPercent: pnlPercent,
      result,
      timestamp: new Date(),
    });
    await closedTrade.save();

    // Update state and log result
    this.lastAction = '';
    this.entryPrice = 0;
    this.consecutiveTrades = 0; // Reset consecutive trade counter
    result === 'THẮNG' ? this.winCount++ : this.lossCount++;
    this.totalProfitLoss += pnlAmount;

    this.logger.log(`🔒 Đóng lệnh với kết quả: ${result} | Lợi nhuận/Lỗ: ${pnlAmount.toFixed(2)} USDT`);

    const totalTrades = this.winCount + this.lossCount;
    const winRate = (this.winCount / totalTrades) * 100;
    console.clear();
    console.table([
      {
        'Số lệnh thắng': this.winCount,
        'Số lệnh thua': this.lossCount,
        'Tỷ lệ thắng (%)': winRate.toFixed(2),
        'Tổng lợi nhuận/lỗ (USDT)': this.totalProfitLoss.toFixed(2),
      },
    ]);
  }

  async logPrice(currentPrice: number) {
    const timestamp = new Date().toLocaleTimeString();
    this.priceHistory.push({ time: timestamp, price: currentPrice });

    if (this.priceHistory.length > 60) {
      this.priceHistory.shift();
    }

    console.clear();
    this.logger.log('Giá theo phút:');
    console.table(this.priceHistory);
  }

  async startTrading() {
    setInterval(async () => {
      await this.trade();
    }, 900000); // Run every 15 minutes to match the candle closing time
  }
}
