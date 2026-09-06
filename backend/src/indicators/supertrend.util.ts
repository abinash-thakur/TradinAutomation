import { Candle } from '../brokers/broker.interface';

export interface SupertrendResult {
  trend: 'BULLISH' | 'BEARISH';
  value: number;
  upperBand: number;
  lowerBand: number;
  atr: number;
}

export class IndicatorCalculator {
  /**
   * Calculates Supertrend on an array of candles
   * @param candles Chronological list of candles (oldest first)
   * @param period ATR period (default 10)
   * @param multiplier ATR multiplier (default 3)
   */
  static calculateSupertrend(
    candles: Candle[],
    period: number = 10,
    multiplier: number = 3,
  ): SupertrendResult {
    if (!candles || candles.length < period + 1) {
      return { trend: 'BULLISH', value: 0, upperBand: 0, lowerBand: 0, atr: 0 };
    }

    const n = candles.length;
    const tr: number[] = new Array(n).fill(0);
    const atr: number[] = new Array(n).fill(0);
    const upperBand: number[] = new Array(n).fill(0);
    const lowerBand: number[] = new Array(n).fill(0);
    const supertrend: number[] = new Array(n).fill(0);
    const trend: ('BULLISH' | 'BEARISH')[] = new Array(n).fill('BULLISH');

    // 1. Calculate True Range (TR)
    for (let i = 0; i < n; i++) {
      if (i === 0) {
        tr[i] = candles[i].high - candles[i].low;
      } else {
        const hl = candles[i].high - candles[i].low;
        const hc = Math.abs(candles[i].high - candles[i - 1].close);
        const lc = Math.abs(candles[i].low - candles[i - 1].close);
        tr[i] = Math.max(hl, hc, lc);
      }
    }

    // 2. Calculate initial ATR (Simple average of first 'period' TRs)
    let initialTrSum = 0;
    for (let i = 0; i < period; i++) {
      initialTrSum += tr[i];
    }
    atr[period - 1] = initialTrSum / period;

    // Smoothed ATR (Wilder's Smoothing)
    for (let i = period; i < n; i++) {
      atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
    }

    // 3. Calculate Bands and Trend
    for (let i = period - 1; i < n; i++) {
      const hl2 = (candles[i].high + candles[i].low) / 2;
      const basicUpper = hl2 + multiplier * atr[i];
      const basicLower = hl2 - multiplier * atr[i];

      if (i === period - 1) {
        upperBand[i] = basicUpper;
        lowerBand[i] = basicLower;
        trend[i] = candles[i].close >= basicLower ? 'BULLISH' : 'BEARISH';
        supertrend[i] = trend[i] === 'BULLISH' ? lowerBand[i] : upperBand[i];
        continue;
      }

      // Final Upper Band
      if (basicUpper < upperBand[i - 1] || candles[i - 1].close > upperBand[i - 1]) {
        upperBand[i] = basicUpper;
      } else {
        upperBand[i] = upperBand[i - 1];
      }

      // Final Lower Band
      if (basicLower > lowerBand[i - 1] || candles[i - 1].close < lowerBand[i - 1]) {
        lowerBand[i] = basicLower;
      } else {
        lowerBand[i] = lowerBand[i - 1];
      }

      // Determine Trend Direction
      if (trend[i - 1] === 'BULLISH') {
        if (candles[i].close < lowerBand[i]) {
          trend[i] = 'BEARISH';
          supertrend[i] = upperBand[i];
        } else {
          trend[i] = 'BULLISH';
          supertrend[i] = lowerBand[i];
        }
      } else {
        if (candles[i].close > upperBand[i]) {
          trend[i] = 'BULLISH';
          supertrend[i] = lowerBand[i];
        } else {
          trend[i] = 'BEARISH';
          supertrend[i] = upperBand[i];
        }
      }
    }

    const lastIdx = n - 1;
    return {
      trend: trend[lastIdx],
      value: supertrend[lastIdx],
      upperBand: upperBand[lastIdx],
      lowerBand: lowerBand[lastIdx],
      atr: atr[lastIdx],
    };
  }

  /**
   * Calculates Exponential Moving Average (EMA)
   */
  static calculateEMA(candles: Candle[], period: number): number {
    if (!candles || candles.length < period) return 0;
    const k = 2 / (period + 1);
    let ema = candles[0].close;
    for (let i = 1; i < candles.length; i++) {
      ema = candles[i].close * k + ema * (1 - k);
    }
    return ema;
  }
}

