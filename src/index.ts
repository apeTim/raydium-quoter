import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js-light";
import {
  PoolData,
  QuoteResult,
  SwapDirection,
  FetchPoolOptions,
} from "./types";
import {
  fetchPoolData,
  setPoolDataCache,
  getPoolDataFromCache,
  clearPoolCache,
  clearRaydiumInstance,
} from "./poolFetcher";
import {
  calculateExactInputQuote,
  calculateExactOutputQuote,
  calculateMultipleQuotes,
  toRawAmount,
  toHumanAmount,
} from "./quoteCalculator";

export * from "./types";

export {
  fetchPoolData,
  setPoolDataCache,
  getPoolDataFromCache,
  clearPoolCache,
  clearRaydiumInstance,
};

export {
  calculateExactInputQuote,
  calculateExactOutputQuote,
  calculateMultipleQuotes,
  toRawAmount,
  toHumanAmount,
};

export class LaunchpadQuoteCalculator {
  private connection: Connection;
  private poolId: PublicKey;
  private cacheTTL: number;

  constructor(
    connection: Connection,
    poolId: string | PublicKey,
    cacheTTL: number = 10_000
  ) {
    this.connection = connection;
    this.poolId = typeof poolId === "string" ? new PublicKey(poolId) : poolId;
    this.cacheTTL = cacheTTL;
  }


  async getPoolData(forceRefresh: boolean = false): Promise<PoolData> {
    return fetchPoolData(this.connection, this.poolId, {
      forceRefresh,
      cacheTTL: this.cacheTTL,
    });
  }

  async getQuoteForExactSol(
    solAmount: number | string,
    slippage: number,
    forceRefresh: boolean = false
  ): Promise<QuoteResult> {
    const poolData = await this.getPoolData(forceRefresh);
    return calculateExactInputQuote({
      poolData,
      amountIn: solAmount,
      slippage,
      direction: "solToToken",
    });
  }

  async getQuoteForExactTokens(
    tokenAmount: number | string,
    slippage: number,
    forceRefresh: boolean = false
  ): Promise<QuoteResult> {
    const poolData = await this.getPoolData(forceRefresh);
    return calculateExactInputQuote({
      poolData,
      amountIn: tokenAmount,
      slippage,
      direction: "tokenToSol",
    });
  }

  async getQuoteToReceiveExactTokens(
    tokenAmount: number | string,
    slippage: number,
    forceRefresh: boolean = false
  ): Promise<QuoteResult> {
    const poolData = await this.getPoolData(forceRefresh);
    return calculateExactOutputQuote({
      poolData,
      amountOut: tokenAmount,
      slippage,
      direction: "solToToken",
    });
  }

  async getQuoteToReceiveExactSol(
    solAmount: number | string,
    slippage: number,
    forceRefresh: boolean = false
  ): Promise<QuoteResult> {
    const poolData = await this.getPoolData(forceRefresh);
    return calculateExactOutputQuote({
      poolData,
      amountOut: solAmount,
      slippage,
      direction: "tokenToSol",
    });
  }

  async getBulkQuotes(
    amounts: (number | string)[],
    slippage: number,
    direction: SwapDirection,
    isExactInput: boolean = true,
    forceRefresh: boolean = false
  ): Promise<QuoteResult[]> {
    const poolData = await this.getPoolData(forceRefresh);
    return calculateMultipleQuotes(poolData, amounts, slippage, direction, isExactInput);
  }

  async getCurrentPrice(forceRefresh: boolean = false): Promise<Decimal> {
    const poolData = await this.getPoolData(forceRefresh);
    const baseDecimal = new Decimal(poolData.baseReserve.toString());
    const quoteDecimal = new Decimal(poolData.quoteReserve.toString());
    const decimalAdjustment = new Decimal(10).pow(
      poolData.mintA.decimals - poolData.mintB.decimals
    );
    return quoteDecimal.div(baseDecimal).mul(decimalAdjustment);
  }

  async getReserves(
    forceRefresh: boolean = false
  ): Promise<{ tokenReserve: Decimal; solReserve: Decimal }> {
    const poolData = await this.getPoolData(forceRefresh);
    return {
      tokenReserve: toHumanAmount(poolData.baseReserve, poolData.mintA.decimals),
      solReserve: toHumanAmount(poolData.quoteReserve, poolData.mintB.decimals),
    };
  }

  clearCache(): void {
    clearPoolCache(this.poolId);
  }
}

export function formatQuote(
  quote: QuoteResult,
  poolData: PoolData
): {
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  maxAmountIn: string;
  fee: string;
  priceImpact: string;
  executionPrice: string;
  currentPrice: string;
} {
  const inputDecimals =
    quote.direction === "solToToken" ? poolData.mintB.decimals : poolData.mintA.decimals;
  const outputDecimals =
    quote.direction === "solToToken" ? poolData.mintA.decimals : poolData.mintB.decimals;

  return {
    amountIn: toHumanAmount(quote.amountIn, inputDecimals).toFixed(6),
    amountOut: toHumanAmount(quote.amountOut, outputDecimals).toFixed(6),
    minAmountOut: toHumanAmount(quote.minAmountOut, outputDecimals).toFixed(6),
    maxAmountIn: toHumanAmount(quote.maxAmountIn, inputDecimals).toFixed(6),
    fee: toHumanAmount(quote.fee, inputDecimals).toFixed(6),
    priceImpact: `${quote.priceImpact.mul(100).toFixed(4)}%`,
    executionPrice: quote.executionPrice.toFixed(9),
    currentPrice: quote.currentPrice.toFixed(9),
  };
}
