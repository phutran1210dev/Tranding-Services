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
  private readonly symbols = ['DOGEUSDT'];
  private readonly depositAmount = 10;
  private readonly margin = parseInt(process.env.DEFAULT_MARGIN) || 30;

  private tradeStates = new Map<string, {
    size: number;
    entryPrice: number;
    breakEvenPrice: number;
    markPrice: number;
    liqPrice: number;
    marginRatio: number;
    pnlRoiPercent: number;
    tradeInProgress: boolean;
    pnlInterval: NodeJS.Timeout;
    priceHistory: Array<{ time: string; price: number }>;
    tradeHistory: Array<{ time: string; pnlAmount: number; pnlPercent: number }>;
  }>();

  constructor(
    @InjectModel(Trade.name) private tradeModel: Model<TradeDocument>,
  ) {
    this.symbols.forEach(symbol => {
      this.tradeStates.set(symbol, {
        size: 0,
        entryPrice: 0,
        breakEvenPrice: 0,
        markPrice: 0,
        liqPrice: 0,
        marginRatio: 0,
        pnlRoiPercent: 0,
        tradeInProgress: false,
        pnlInterval: null,
        priceHistory: [],
        tradeHistory: [],
      });
    });
    this.startTrading();
  }

  async getCandles(symbol: string) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=50`;
    const { data } = await axios.get(url);
    return data.map(candle => ({
      openTime: candle[0],
      close: parseFloat(candle[4]),
    }));
  }

  async calculateEMA(symbol: string) {
    const candles = await this.getCandles(symbol);
    const closes = candles.map(candle => candle.close);

    const ema12 = technicalindicators.EMA.calculate({ period: 12, values: closes });
    const ema26 = technicalindicators.EMA.calculate({ period: 26, values: closes });
    const ema200 = technicalindicators.EMA.calculate({ period: 200, values: closes });

    return { ema12, ema26, ema200, latestClose: closes[closes.length - 1] };
  }

  async trade(symbol: string) {
    const { ema12, ema26, latestClose } = await this.calculateEMA(symbol);
    const latestEMA12 = ema12[ema12.length - 1];
    const latestEMA26 = ema26[ema26.length - 1];

    const tradeState = this.tradeStates.get(symbol);
    if (!tradeState) return;

    const isBuySignal = latestEMA12 > latestEMA26 && !tradeState.tradeInProgress;
    const isSellSignal = latestEMA12 < latestEMA26 && tradeState.tradeInProgress;

    if (isBuySignal) {
      await this.executeTrade(symbol, 'BUY', latestClose);
    } else if (isSellSignal) {
      await this.executeTrade(symbol, 'SELL', latestClose);
    }

    this.updateTradeDetails(symbol, latestClose);
    this.logTradeSummary();
  }

  async executeTrade(symbol: string, action: 'BUY' | 'SELL', price: number) {
    const tradeState = this.tradeStates.get(symbol);
    if (!tradeState) return;

    tradeState.entryPrice = price;
    tradeState.size = this.depositAmount * this.margin / price;
    tradeState.tradeInProgress = true;

    const slPercentage = 0.015 + Math.random() * 0.015;
    tradeState.liqPrice = action === 'BUY'
      ? tradeState.entryPrice * (1 - slPercentage)
      : tradeState.entryPrice * (1 + slPercentage);

    tradeState.marginRatio = 0; // Can calculate based on dynamic market conditions
    tradeState.pnlRoiPercent = 0;
  }

  updateTradeDetails(symbol: string, latestClose: number) {
    const tradeState = this.tradeStates.get(symbol);
    if (!tradeState || !tradeState.tradeInProgress) return;

    tradeState.markPrice = latestClose;
    tradeState.pnlRoiPercent = ((latestClose - tradeState.entryPrice) / tradeState.entryPrice) * 100;
    tradeState.marginRatio = tradeState.pnlRoiPercent * 0.75; // Example formula
  }

  async startTrading() {
    setInterval(async () => {
      for (const symbol of this.symbols) {
        await this.trade(symbol);
      }
    }, 5000);
  }

  logTradeSummary() {
    const summaryTable = Array.from(this.tradeStates.values()).map(state => ({
      Symbol: this.symbols[0],
      Size: state.size.toFixed(2),
      EntryPrice: state.entryPrice.toFixed(2),
      MarkPrice: state.markPrice.toFixed(2),
      LiqPrice: state.liqPrice.toFixed(2),
      MarginRatio: `${state.marginRatio.toFixed(2)}%`,
      Margin: this.margin,
      PNL_ROI: `${state.pnlRoiPercent.toFixed(2)}%`
    }));
    console.clear();
    console.table(summaryTable);
  }
}
