import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js-light";

export interface TokenInfo {
  mint: PublicKey;
  decimals: number;
  symbol?: string;
}

export interface FeeConfig {
  tradeFeeRate: BN;
  protocolFeeRate: BN;
  fundFeeRate: BN;
}

export interface PoolData {
  id: PublicKey;
  mintA: TokenInfo;
  mintB: TokenInfo;
  baseReserve: BN;
  quoteReserve: BN;
  feeConfig: FeeConfig;
  fetchedAt: number;
}

export type SwapDirection = "solToToken" | "tokenToSol";

export interface QuoteResult {
  amountIn: BN;
  amountOut: BN;
  minAmountOut: BN;
  maxAmountIn: BN;
  fee: BN;
  priceImpact: Decimal;
  executionPrice: Decimal;
  currentPrice: Decimal;
  direction: SwapDirection;
}

export interface ExactInputQuoteParams {
  poolData: PoolData;
  amountIn: number | string;
  slippage: number;
  direction: SwapDirection;
}

export interface ExactOutputQuoteParams {
  poolData: PoolData;
  amountOut: number | string;
  slippage: number;
  direction: SwapDirection;
}

export interface FetchPoolOptions {
  forceRefresh?: boolean;
  cacheTTL?: number;
}

export interface PoolCacheEntry {
  data: PoolData;
  expiresAt: number;
}
