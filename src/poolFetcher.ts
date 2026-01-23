import { Connection, PublicKey } from "@solana/web3.js";
import { Raydium } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import {
  PoolData,
  PoolCacheEntry,
  FetchPoolOptions,
  TokenInfo,
} from "./types";

const DEFAULT_CACHE_TTL = 10_000;

const poolCache: Map<string, PoolCacheEntry> = new Map();

let raydiumInstance: Raydium | null = null;
let raydiumConnection: Connection | null = null;


async function getRaydiumInstance(connection: Connection): Promise<Raydium> {
  if (raydiumInstance && raydiumConnection === connection) {
    return raydiumInstance;
  }

  raydiumInstance = await Raydium.load({
    owner: PublicKey.default,
    connection,
    disableFeatureCheck: true,
    disableLoadToken: true,
    blockhashCommitment: "confirmed",
  });

  raydiumConnection = connection;
  return raydiumInstance;
}

export async function fetchPoolData(
  connection: Connection,
  poolId: string | PublicKey,
  options: FetchPoolOptions = {}
): Promise<PoolData> {
  const poolIdStr = poolId.toString();
  const cacheTTL = options.cacheTTL ?? DEFAULT_CACHE_TTL;
  const now = Date.now();

  // Check cache first (unless force refresh)
  if (!options.forceRefresh) {
    const cached = poolCache.get(poolIdStr);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  }

  // Fetch from RPC
  const raydium = await getRaydiumInstance(connection);
  const { poolInfo, rpcData } = await raydium.cpmm.getPoolInfoFromRpc(poolIdStr);

  // Build token info
  const mintA: TokenInfo = {
    mint: new PublicKey(poolInfo.mintA.address),
    decimals: poolInfo.mintA.decimals,
    symbol: poolInfo.mintA.symbol,
  };

  const mintB: TokenInfo = {
    mint: new PublicKey(poolInfo.mintB.address),
    decimals: poolInfo.mintB.decimals,
    symbol: poolInfo.mintB.symbol,
  };

  // Extract pool data
  const poolData: PoolData = {
    id: new PublicKey(poolIdStr),
    mintA,
    mintB,
    baseReserve: rpcData.baseReserve,
    quoteReserve: rpcData.quoteReserve,
    feeConfig: {
      tradeFeeRate: new BN(rpcData.configInfo?.tradeFeeRate || 0),
      protocolFeeRate: new BN(rpcData.configInfo?.protocolFeeRate || 0),
      fundFeeRate: new BN(rpcData.configInfo?.fundFeeRate || 0),
    },
    fetchedAt: now,
  };

  // Store in cache
  poolCache.set(poolIdStr, {
    data: poolData,
    expiresAt: now + cacheTTL,
  });

  return poolData;
}

export function setPoolDataCache(poolData: PoolData, ttl: number = DEFAULT_CACHE_TTL): void {
  const poolIdStr = poolData.id.toString();
  poolCache.set(poolIdStr, {
    data: poolData,
    expiresAt: Date.now() + ttl,
  });
}

export function getPoolDataFromCache(poolId: string | PublicKey): PoolData | undefined {
  const cached = poolCache.get(poolId.toString());
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }
  return undefined;
}


export function clearPoolCache(poolId?: string | PublicKey): void {
  if (poolId) {
    poolCache.delete(poolId.toString());
  } else {
    poolCache.clear();
  }
}

export function clearRaydiumInstance(): void {
  raydiumInstance = null;
  raydiumConnection = null;
}
