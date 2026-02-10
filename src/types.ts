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

export enum CurveType {
  ConstantProduct = 0,
  FixedPrice = 1,
  LinearPrice = 2,
}

export const CURVE_TYPE_LABELS: Record<CurveType, string> = {
  [CurveType.ConstantProduct]: "Constant Product",
  [CurveType.FixedPrice]: "Fixed Price",
  [CurveType.LinearPrice]: "Linear Price",
};

export interface LaunchpadPoolAccount {
  status: number;
  mintDecimalsA: number;
  mintDecimalsB: number;
  migrateType: number;
  supply: BN;
  totalSellA: BN;
  virtualA: BN;
  virtualB: BN;
  realA: BN;
  realB: BN;
  totalFundRaisingB: BN;
  migrateFee: BN;
  totalLockedAmount: BN;
  configId: PublicKey;
  platformId: PublicKey;
  mintA: PublicKey;
  mintB: PublicKey;
  creator: PublicKey;
}

export interface BondingCurveInfo {
  curveType: CurveType;
  curveTypeLabel: string;
  bondingPercentage: Decimal;
  currentPrice: Decimal;
  graduationPrice: Decimal;
  graduationMcap: Decimal;
  totalFundRaisingB: Decimal;
  raisedSoFar: Decimal;
  remainingToRaise: Decimal;
  poolStatus: number;
  migrateType: "amm" | "cpmm";
}
