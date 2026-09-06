import { format, addDays } from 'date-fns';
import { OptionContract } from '../brokers/broker.interface';

export class OptionsUtil {
  /**
   * Formats tomorrow's date for daily options (e.g., "07-09-2026" or "070926")
   */
  static getNextDayExpiry(offsetDays: number = 1): { dateString: string; codeString: string } {
    const targetDate = addDays(new Date(), offsetDays);
    return {
      dateString: format(targetDate, 'dd-MM-yyyy'),
      codeString: format(targetDate, 'ddMMyy'),
    };
  }

  /**
   * Normalizes any expiry date format into Delta's 6-digit DDMMYY format
   */
  static normalizeExpiryCode(expiry?: string): string {
    if (!expiry) return '';
    const digits = expiry.replace(/[^0-9]/g, '');
    if (digits.length === 6) return digits;
    if (digits.length === 8) {
      if (digits.startsWith('20')) {
        // YYYYMMDD -> DDMMYY
        return `${digits.slice(6, 8)}${digits.slice(4, 6)}${digits.slice(2, 4)}`;
      }
      // DDMMYYYY -> DDMMYY
      return `${digits.slice(0, 4)}${digits.slice(6, 8)}`;
    }
    return expiry;
  }

  /**
   * Automatically resolves the underlying asset symbol and strike interval for any ticker
   */
  static getUnderlyingAndStrikeInterval(symbol: string, price: number = 0): { underlying: string; strikeInterval: number } {
    const clean = (symbol || 'BTCUSD').toUpperCase().replace(/[\/\-_]/g, '');
    let underlying = 'BTC';
    if (clean.includes('ETH')) underlying = 'ETH';
    else if (clean.includes('SOL')) underlying = 'SOL';
    else if (clean.startsWith('BTC')) underlying = 'BTC';
    else underlying = clean.replace(/(USD|USDT)$/, '') || 'BTC';

    let strikeInterval = 500;
    if (underlying === 'BTC') strikeInterval = 500;
    else if (underlying === 'ETH') strikeInterval = 50;
    else if (underlying === 'SOL') strikeInterval = 5;
    else if (price >= 10000) strikeInterval = 500;
    else if (price >= 1000) strikeInterval = 50;
    else if (price >= 100) strikeInterval = 5;
    else strikeInterval = 1;

    return { underlying, strikeInterval };
  }

  /**
   * Rounds underlying price to nearest standard strike interval
   * (e.g., BTC usually trades in $500 or $1,000 steps; ETH trades in $20 or $50 steps)
   */
  static roundToNearestStrike(price: number, interval: number = 500): number {
    return Math.round(price / interval) * interval;
  }

  /**
   * Finds the best matching Call option for ATM / target strike
   */
  static findMatchingCall(
    chain: OptionContract[],
    targetStrike: number,
    expiryFilter?: string,
  ): OptionContract | null {
    if (!chain || chain.length === 0) return null;

    const calls = chain.filter((opt) => opt.optionType === 'CALL');
    if (calls.length === 0) return null;

    // Filter by expiry if provided
    let filtered = calls;
    if (expiryFilter) {
      const code = this.normalizeExpiryCode(expiryFilter);
      const matches = calls.filter((c) =>
        (code && (c.symbol?.includes(code) || c.expiryDate?.includes(code))) ||
        c.symbol?.includes(expiryFilter) ||
        c.expiryDate?.includes(expiryFilter),
      );
      if (matches.length > 0) {
        filtered = matches;
      }
      // If no exact match for this expiry code, filtered falls back to all calls
    }

    // Find the call option with strike closest to targetStrike
    let closest = filtered[0];
    let minDiff = Math.abs(closest.strike - targetStrike);

    for (const opt of filtered) {
      const diff = Math.abs(opt.strike - targetStrike);
      if (diff < minDiff) {
        minDiff = diff;
        closest = opt;
      }
    }

    return closest;
  }

  /**
   * Finds the nearest Out-Of-The-Money (OTM) Call option.
   * For Call options, OTM strikes are >= currentPrice.
   * Finds the call with strike >= currentPrice that has the smallest difference (strike - currentPrice).
   * If none are >= currentPrice, falls back to the highest available strike call.
   */
  static findNearestOtmCall(
    chain: OptionContract[],
    currentPrice: number,
    expiryFilter?: string,
  ): OptionContract | null {
    if (!chain || chain.length === 0) return null;

    const calls = chain.filter((opt) => opt.optionType === 'CALL');
    if (calls.length === 0) return null;

    // Filter by expiry if provided
    let filtered = calls;
    if (expiryFilter) {
      const code = this.normalizeExpiryCode(expiryFilter);
      const matches = calls.filter((c) =>
        (code && (c.symbol?.includes(code) || c.expiryDate?.includes(code))) ||
        c.symbol?.includes(expiryFilter) ||
        c.expiryDate?.includes(expiryFilter),
      );
      if (matches.length > 0) {
        filtered = matches;
      }
    }

    // Filter for OTM calls: strike >= currentPrice
    const otmCalls = filtered.filter((opt) => opt.strike >= currentPrice);
    if (otmCalls.length > 0) {
      // Sort ascending by strike: lowest strike >= currentPrice is the nearest OTM strike
      otmCalls.sort((a, b) => a.strike - b.strike);
      return otmCalls[0];
    }

    // Fallback: if all strikes are below currentPrice (deep ITM), pick highest available strike
    filtered.sort((a, b) => b.strike - a.strike);
    return filtered[0];
  }

  /**
   * Selects Call option for routine evaluation (when Future drawdown < 1%):
   * USER RULE:
   * "if the atm call option of next day match the strike of call option then dont go for otm"
   *
   * 1. If next-day ATM strike matches the existing Call option strike -> return ATM Call (do not go for OTM).
   * 2. If it does not match (or no existing call) -> return the nearest OTM Call.
   */
  static selectRoutineCallOption(
    chain: OptionContract[],
    currentPrice: number,
    atmStrike: number,
    existingCallStrike?: number,
    expiryFilter?: string,
  ): { option: OptionContract | null; isAtmMatch: boolean } {
    if (existingCallStrike && atmStrike === existingCallStrike) {
      const atmCall = this.findMatchingCall(chain, atmStrike, expiryFilter);
      if (atmCall) {
        return { option: atmCall, isAtmMatch: true };
      }
    }

    const otmCall = this.findNearestOtmCall(chain, currentPrice, expiryFilter);
    return { option: otmCall, isAtmMatch: false };
  }
}

