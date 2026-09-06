import * as vm from 'vm';
import { IndicatorCalculator } from '../indicators/supertrend.util';

export interface ScriptContext {
  btcPrice: number;
  ethPrice: number;
  symbol: string;
  candles4h: any[];
  positions: {
    hasFuture: boolean;
    hasOption: boolean;
    future?: any;
    option?: any;
    futurePnl: number;
    optionPnl: number;
  };
  getATMOption: (underlying: string, type: 'CALL' | 'PUT', expiry: string) => any;
  log?: (msg: string) => void;
}

export class StrategyScriptRunner {
  /**
   * Evaluates user's custom strategy script
   */
  static runScript(
    scriptCode: string,
    context: ScriptContext,
  ): {
    checkEntryResult?: boolean;
    entryOrders?: any[];
    monitorAction?: any;
    logs: string[];
    error?: string;
  } {
    const logs: string[] = [];

    const sandbox = {
      context: {
        ...context,
        log: (msg: string) => logs.push(String(msg)),
      },
      indicators: {
        supertrend: (candles: any[], period: number = 10, multiplier: number = 3) =>
          IndicatorCalculator.calculateSupertrend(candles, period, multiplier),
        ema: (candles: any[], period: number) =>
          IndicatorCalculator.calculateEMA(candles, period),
      },
      module: { exports: {} },
      exports: {},
      console: {
        log: (...args: any[]) => logs.push(args.map(String).join(' ')),
      },
    };

    try {
      vm.createContext(sandbox);
      vm.runInContext(scriptCode, sandbox, { timeout: 3000 });

      const exported = (sandbox.module.exports as any) || sandbox.exports;

      let checkEntryResult = false;
      let entryOrders: any[] = [];
      let monitorAction = null;

      if (typeof exported.checkEntry === 'function') {
        checkEntryResult = Boolean(exported.checkEntry(sandbox.context));
      }

      if (typeof exported.getEntryOrders === 'function') {
        entryOrders = exported.getEntryOrders(sandbox.context) || [];
      }

      if (typeof exported.onMonitor === 'function') {
        monitorAction = exported.onMonitor(sandbox.context) || null;
      }

      return {
        checkEntryResult,
        entryOrders,
        monitorAction,
        logs,
      };
    } catch (err: any) {
      return {
        logs,
        error: err.message,
      };
    }
  }

  /**
   * Default customizable starter script implementing the user's strategy:
   * 4H Supertrend -> Buy 2 BTC Future + Sell Next-Day ATM Call -> 70% Roll -> 4.5% Square Off
   */
  static getDefaultScript(): string {
    return `// ====================================================================
// Custom Trading Strategy Logic - JavaScript / TypeScript
// You can edit or write ANY custom trading logic below!
// ====================================================================

module.exports = {
  /**
   * 1. Entry Condition
   * Evaluated at the scheduled trigger time (e.g. 3:30 PM IST).
   * Return true to trigger order placement.
   */
  checkEntry: function(context) {
    const { btcPrice, candles4h, positions } = context;

    // Calculate 4-Hour Supertrend (10, 3)
    const supertrend = indicators.supertrend(candles4h, 10, 3);
    context.log("Current 4H Supertrend: " + supertrend.trend + " (Val: " + supertrend.value.toFixed(1) + ")");

    // Condition: 4H Supertrend is Bullish AND no future position is already open
    const isBullish = supertrend.trend === "BULLISH";
    return isBullish && !positions.hasFuture;
  },

  /**
   * 2. Order Execution
   * Called when checkEntry returns true.
   * Return array of orders to execute on the broker.
   */
  getEntryOrders: function(context) {
    // Find next-day ATM Call option
    const atmCall = context.getATMOption("BTC", "CALL", "NEXT_DAY");
    context.log("Found ATM Call: " + (atmCall ? atmCall.symbol : "None"));

    return [
      {
        action: "BUY",
        productType: "FUTURE",
        symbol: "BTCUSD",
        size: 2.0 // 2 BTC Future
      },
      {
        action: "SELL",
        productType: "OPTION",
        symbol: atmCall ? atmCall.symbol : "BTC-ATM-CALL",
        size: 2.0 // ATM Call
      }
    ];
  },

  /**
   * 3. Real-Time Monitor & Exit Rules
   * Evaluated every few seconds against live market PnL.
   * Return action object or null to hold.
   */
  onMonitor: function(context) {
    const { futurePnl, optionPnl, positions } = context;

    // Rule 1: If Future reaches 4.5% profit -> Emergency Square Off All
    if (futurePnl >= 4.5) {
      context.log("Future profit reached 4.5%! Squaring off all legs.");
      return {
        action: "SQUARE_OFF_ALL",
        reason: "Future profit target reached: " + futurePnl.toFixed(2) + "%"
      };
    }

    // Rule 2: If Short Call reaches 70% profit decay -> Book profit & Roll
    if (optionPnl >= 70) {
      const nextCall = context.getATMOption("BTC", "CALL", "NEXT_DAY");
      context.log("Call option reached 70% decay! Booking profit and rolling.");
      return {
        action: "ROLL_OPTION",
        closeSymbol: positions.option ? positions.option.symbol : null,
        newSymbol: nextCall ? nextCall.symbol : null,
        reason: "Option 70% profit target booked"
      };
    }

    return null; // Hold positions
  }
};
`;
  }
}

