// src/trading/trading.service.ts

import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import * as technicalindicators from 'technicalindicators';
import * as dotenv from 'dotenv';
import Binance from 'binance-api-node';

dotenv.config();

@Injectable()
export class TradingService {
  private readonly logger = new Logger(TradingService.name);
  private readonly symbols = [
    'BTCUSDT',
    // 'DOGEUSDT',
    // "BNBUSDT",
    // 'ETHUSDT',
    // 'ADAUSDT',
  ];
  private lastAction = '';
  private consecutiveTrades = 0;
  private readonly leverage = 40;

  private binanceClient = Binance({
    apiKey: process.env.BINANCE_API_KEY,
    apiSecret: process.env.BINANCE_API_SECRET,
  });

  private priceHistory: {
    [symbol: string]: Array<{ time: string; price: number }>;
  } = {};
  private entryPrice: { [symbol: string]: number } = {};
  private profit: { [symbol: string]: number } = {};

  constructor() {
    this.symbols.forEach((symbol) => {
      this.priceHistory[symbol] = [];
      this.entryPrice[symbol] = 0;
      this.profit[symbol] = 0;
    });
    this.startTrading();
  }

  async getCandles(symbol: string) {
    const url = `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=15m&limit=50`;
    const { data } = await axios.get(url);
    return data.map((candle) => ({
      openTime: candle[0],
      close: parseFloat(candle[4]),
    }));
  }

  async getLatestPrice(symbol: string) {
    const url = `https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`;
    const { data } = await axios.get(url);
    return parseFloat(data.price);
  }

  async calculateEMA(symbol: string) {
    const candles = await this.getCandles(symbol);
    const closes = candles.map((candle) => candle.close);

    const ema12 = technicalindicators.EMA.calculate({
      period: 12,
      values: closes,
    });
    const ema26 = technicalindicators.EMA.calculate({
      period: 26,
      values: closes,
    });
    const ema200 = technicalindicators.EMA.calculate({
      period: 200,
      values: closes,
    });

    return { ema12, ema26, ema200, latestClose: closes[closes.length - 1] };
  }

  async trade(symbol: string) {
    const { ema12, ema26, ema200, latestClose } =
      await this.calculateEMA(symbol);
    const latestEMA12 = ema12[ema12.length - 1];
    const latestEMA26 = ema26[ema26.length - 1];
    const latestEMA200 = ema200[ema200.length - 1];

    // Log the latest price every second
    const currentPrice = await this.getLatestPrice(symbol);
    this.logger.log(`📈 Current Price: ${symbol} ${currentPrice} USDT`);

    // Define buy and sell signals based on EMA crossover and consecutive trades restriction
    const isBuySignal =
      latestEMA12 > latestEMA26 &&
      latestClose > latestEMA200 &&
      this.lastAction !== 'BUY' &&
      this.consecutiveTrades < 2;
    const isSellSignal =
      latestEMA12 < latestEMA26 &&
      latestClose < latestEMA200 &&
      this.lastAction !== 'SELL' &&
      this.consecutiveTrades < 2;

    // Log buy or sell signals
    if (isBuySignal) {
      this.logger.log(`🔔 Buy Signal Detected for ${symbol} at ${latestClose}`);
      this.entryPrice[symbol] = currentPrice;
      this.lastAction = 'BUY';
      this.consecutiveTrades++;
    } else if (isSellSignal) {
      this.logger.log(
        `🔔 Sell Signal Detected for ${symbol} at ${latestClose}`,
      );
      if (this.entryPrice[symbol] > 0) {
        this.profit[symbol] +=
          (currentPrice - this.entryPrice[symbol]) * this.leverage;
        this.logger.log(`💰 Profit for ${symbol}: ${this.profit[symbol]} USDT`);
      }
      this.entryPrice[symbol] = 0;
      this.lastAction = 'SELL';
      this.consecutiveTrades++;
    }

    this.logPrice(symbol, currentPrice);
  }

  async logPrice(symbol: string, currentPrice: number) {
    const timestamp = new Date().toLocaleTimeString();
    this.priceHistory[symbol].push({ time: timestamp, price: currentPrice });

    if (this.priceHistory[symbol].length > 100) {
      this.priceHistory[symbol].shift();
    }

    console.clear();
    this.logger.log(`Price history for ${symbol}:`);
    console.table(this.priceHistory[symbol]);
  }

  async startTrading() {
    setInterval(async () => {
      for (const symbol of this.symbols) {
        await this.trade(symbol);
        this.logger.log(`Current price for ${symbol}: ${await this.getLatestPrice(symbol)} USDT`);
      }
    }, 1000); // Check every second for new signals and log the current price
  }
}
