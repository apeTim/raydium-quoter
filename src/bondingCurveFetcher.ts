import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js-light";
import {
  CurveType,
  CURVE_TYPE_LABELS,
  LaunchpadPoolAccount,
  BondingCurveInfo,
} from "./types";

const LAUNCHPAD_PROGRAM = new PublicKey(
  "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj"
);

// LaunchpadPool account byte offsets (after 8-byte discriminator)
const POOL_OFFSETS = {
  bump: 16,
  status: 17,
  mintDecimalsA: 18,
  mintDecimalsB: 19,
  migrateType: 20,
  supply: 21,
  totalSellA: 29,
  virtualA: 37,
  virtualB: 45,
  realA: 53,
  realB: 61,
  totalFundRaisingB: 69,
  protocolFee: 77,
  platformFee: 85,
  migrateFee: 93,
  // VestingSchedule
  totalLockedAmount: 101,
  cliffPeriod: 109,
  unlockPeriod: 117,
  startTime: 125,
  totalAllocatedShare: 133,
  // PublicKeys
  configId: 141,
  platformId: 173,
  mintA: 205,
  mintB: 237,
  vaultA: 269,
  vaultB: 301,
  creator: 333,
};

// LaunchpadConfig account byte offsets (after 8-byte discriminator)
const CONFIG_OFFSETS = {
  curveType: 16,
  index: 17,
  migrateFee: 19,
  tradeFeeRate: 27,
};

function readU8(data: Buffer, offset: number): number {
  return data[offset];
}

function readU64(data: Buffer, offset: number): BN {
  return new BN(data.subarray(offset, offset + 8), "le");
}

function readPublicKey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function deserializeLaunchpadPool(data: Buffer): LaunchpadPoolAccount {
  return {
    status: readU8(data, POOL_OFFSETS.status),
    mintDecimalsA: readU8(data, POOL_OFFSETS.mintDecimalsA),
    mintDecimalsB: readU8(data, POOL_OFFSETS.mintDecimalsB),
    migrateType: readU8(data, POOL_OFFSETS.migrateType),
    supply: readU64(data, POOL_OFFSETS.supply),
    totalSellA: readU64(data, POOL_OFFSETS.totalSellA),
    virtualA: readU64(data, POOL_OFFSETS.virtualA),
    virtualB: readU64(data, POOL_OFFSETS.virtualB),
    realA: readU64(data, POOL_OFFSETS.realA),
    realB: readU64(data, POOL_OFFSETS.realB),
    totalFundRaisingB: readU64(data, POOL_OFFSETS.totalFundRaisingB),
    migrateFee: readU64(data, POOL_OFFSETS.migrateFee),
    totalLockedAmount: readU64(data, POOL_OFFSETS.totalLockedAmount),
    configId: readPublicKey(data, POOL_OFFSETS.configId),
    platformId: readPublicKey(data, POOL_OFFSETS.platformId),
    mintA: readPublicKey(data, POOL_OFFSETS.mintA),
    mintB: readPublicKey(data, POOL_OFFSETS.mintB),
    creator: readPublicKey(data, POOL_OFFSETS.creator),
  };
}

function deserializeCurveType(data: Buffer): CurveType {
  const raw = readU8(data, CONFIG_OFFSETS.curveType);
  if (raw !== 0 && raw !== 1 && raw !== 2) {
    throw new Error(`Unknown curve type: ${raw}`);
  }
  return raw as CurveType;
}

function calculateCurrentPrice(
  pool: LaunchpadPoolAccount,
  curveType: CurveType
): Decimal {
  const decimalAdj = Math.pow(10, pool.mintDecimalsA - pool.mintDecimalsB);

  switch (curveType) {
    case CurveType.ConstantProduct: {
      // price = (virtualB + realB) / (virtualA - realA) * 10^(decA - decB)
      const effectiveB = new Decimal(pool.virtualB.add(pool.realB).toString());
      const effectiveA = new Decimal(pool.virtualA.sub(pool.realA).toString());
      return effectiveB.div(effectiveA).mul(decimalAdj);
    }
    case CurveType.FixedPrice:
    case CurveType.LinearPrice: {
      // For fixed/linear, use virtualB/virtualA as base price
      const vB = new Decimal(pool.virtualB.add(pool.realB).toString());
      const vA = new Decimal(pool.virtualA.sub(pool.realA).toString());
      return vB.div(vA).mul(decimalAdj);
    }
  }
}

function calculateGraduationPrice(
  pool: LaunchpadPoolAccount,
  curveType: CurveType
): Decimal {
  const decimalAdj = Math.pow(10, pool.mintDecimalsA - pool.mintDecimalsB);

  switch (curveType) {
    case CurveType.ConstantProduct: {
      // At graduation: realA = totalSellA, realB = totalFundRaisingB
      // price = (virtualB + totalFundRaisingB) / (virtualA - totalSellA) * decimalAdj
      const endB = new Decimal(
        pool.virtualB.add(pool.totalFundRaisingB).toString()
      );
      const endA = new Decimal(
        pool.virtualA.sub(pool.totalSellA).toString()
      );
      return endB.div(endA).mul(decimalAdj);
    }
    case CurveType.FixedPrice: {
      // Fixed price doesn't change
      const vB = new Decimal(pool.virtualB.toString());
      const vA = new Decimal(pool.virtualA.toString());
      return vB.div(vA).mul(decimalAdj);
    }
    case CurveType.LinearPrice: {
      const endB = new Decimal(
        pool.virtualB.add(pool.totalFundRaisingB).toString()
      );
      const endA = new Decimal(
        pool.virtualA.sub(pool.totalSellA).toString()
      );
      return endB.div(endA).mul(decimalAdj);
    }
  }
}

/**
 * Fetches a LaunchLab bonding curve pool account from on-chain and
 * returns its deserialized data.
 */
export async function fetchLaunchpadPoolAccount(
  connection: Connection,
  poolAddress: string | PublicKey
): Promise<LaunchpadPoolAccount> {
  const pubkey =
    typeof poolAddress === "string" ? new PublicKey(poolAddress) : poolAddress;

  const accountInfo = await connection.getAccountInfo(pubkey);
  if (!accountInfo) {
    throw new Error(`Launchpad pool account not found: ${pubkey.toString()}`);
  }

  if (!accountInfo.owner.equals(LAUNCHPAD_PROGRAM)) {
    throw new Error(
      `Account ${pubkey.toString()} is not owned by the LaunchLab program`
    );
  }

  return deserializeLaunchpadPool(accountInfo.data as Buffer);
}

/**
 * Fetches the curve type from a LaunchLab config account.
 */
export async function fetchLaunchpadCurveType(
  connection: Connection,
  configAddress: PublicKey
): Promise<CurveType> {
  const accountInfo = await connection.getAccountInfo(configAddress);
  if (!accountInfo) {
    throw new Error(
      `Launchpad config account not found: ${configAddress.toString()}`
    );
  }

  return deserializeCurveType(accountInfo.data as Buffer);
}

/**
 * Fetches a LaunchLab bonding curve pool and returns its type,
 * bonding percentage, graduation market cap, and related info.
 */
export async function fetchBondingCurveInfo(
  connection: Connection,
  poolAddress: string | PublicKey
): Promise<BondingCurveInfo> {
  // Fetch the pool account
  const pool = await fetchLaunchpadPoolAccount(connection, poolAddress);

  // Fetch the config account to get the curve type
  const curveType = await fetchLaunchpadCurveType(connection, pool.configId);

  // Bonding percentage: how much of the fundraising target has been raised
  const bondingPercentage = pool.totalFundRaisingB.isZero()
    ? new Decimal(100)
    : new Decimal(pool.realB.toString())
        .div(new Decimal(pool.totalFundRaisingB.toString()))
        .mul(100);

  // Current price per token
  const currentPrice = calculateCurrentPrice(pool, curveType);

  // Graduation (end-of-curve) price per token
  const graduationPrice = calculateGraduationPrice(pool, curveType);

  // Graduation market cap = graduation price * total supply (human-readable)
  const totalSupplyHuman = new Decimal(pool.supply.toString()).div(
    new Decimal(10).pow(pool.mintDecimalsA)
  );
  const graduationMcap = graduationPrice.mul(totalSupplyHuman);

  // Fund raising amounts in human-readable quote token units
  const quoteDecimals = pool.mintDecimalsB;
  const totalFundRaisingHuman = new Decimal(
    pool.totalFundRaisingB.toString()
  ).div(new Decimal(10).pow(quoteDecimals));

  const raisedSoFar = new Decimal(pool.realB.toString()).div(
    new Decimal(10).pow(quoteDecimals)
  );

  const remainingToRaise = totalFundRaisingHuman.sub(raisedSoFar);

  return {
    curveType,
    curveTypeLabel: CURVE_TYPE_LABELS[curveType],
    bondingPercentage,
    currentPrice,
    graduationPrice,
    graduationMcap,
    totalFundRaisingB: totalFundRaisingHuman,
    raisedSoFar,
    remainingToRaise,
    poolStatus: pool.status,
    migrateType: pool.migrateType === 0 ? "amm" : "cpmm",
  };
}
