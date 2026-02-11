import { Connection, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js-light";

const PUMPFUN_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

const DISCRIMINATOR_SIZE = 8;

const BONDING_CURVE_OFFSETS = {
  virtualTokenReserves: 8,
  virtualSolReserves: 16,
  realTokenReserves: 24,
  realSolReserves: 32,
  tokenTotalSupply: 40,
  complete: 48,
};

const PUMPFUN_GRADUATION_TARGET = new BN("85000000000");
const TOKEN_DECIMALS = 6;
const SOL_DECIMALS = 9;

export interface PumpFunBondingCurveAccount {
  virtualTokenReserves: BN;
  virtualSolReserves: BN;
  realTokenReserves: BN;
  realSolReserves: BN;
  tokenTotalSupply: BN;
  complete: boolean;
}

export interface PumpFunBondingCurveInfo {
  bondingPercentage: Decimal;
  currentPrice: Decimal;
  graduationPrice: Decimal;
  graduationMcap: Decimal;
  totalFundRaisingSOL: Decimal;
  raisedSoFar: Decimal;
  remainingToRaise: Decimal;
  complete: boolean;
  virtualTokenReserves: Decimal;
  virtualSolReserves: Decimal;
  realTokenReserves: Decimal;
  realSolReserves: Decimal;
}

function readU64(data: Buffer, offset: number): BN {
  return new BN(data.subarray(offset, offset + 8), "le");
}

function readBool(data: Buffer, offset: number): boolean {
  return data[offset] !== 0;
}

function deserializePumpFunBondingCurve(
  data: Buffer
): PumpFunBondingCurveAccount {
  return {
    virtualTokenReserves: readU64(
      data,
      BONDING_CURVE_OFFSETS.virtualTokenReserves
    ),
    virtualSolReserves: readU64(data, BONDING_CURVE_OFFSETS.virtualSolReserves),
    realTokenReserves: readU64(data, BONDING_CURVE_OFFSETS.realTokenReserves),
    realSolReserves: readU64(data, BONDING_CURVE_OFFSETS.realSolReserves),
    tokenTotalSupply: readU64(data, BONDING_CURVE_OFFSETS.tokenTotalSupply),
    complete: readBool(data, BONDING_CURVE_OFFSETS.complete),
  };
}

function calculateCurrentPrice(curve: PumpFunBondingCurveAccount): Decimal {
  const effectiveSol = new Decimal(
    curve.virtualSolReserves.add(curve.realSolReserves).toString()
  );
  const effectiveToken = new Decimal(
    curve.virtualTokenReserves.sub(curve.realTokenReserves).toString()
  );

  if (effectiveToken.isZero()) {
    return new Decimal(0);
  }

  const decimalAdj = Math.pow(10, TOKEN_DECIMALS - SOL_DECIMALS);
  return effectiveSol.div(effectiveToken).mul(decimalAdj);
}

function calculateGraduationPrice(curve: PumpFunBondingCurveAccount): Decimal {
  const graduationSol = new Decimal(
    curve.virtualSolReserves.add(PUMPFUN_GRADUATION_TARGET).toString()
  );

  const currentK = new Decimal(
    curve.virtualSolReserves.add(curve.realSolReserves).toString()
  ).mul(
    new Decimal(
      curve.virtualTokenReserves.sub(curve.realTokenReserves).toString()
    )
  );

  const graduationTokens = currentK.div(graduationSol);

  if (graduationTokens.isZero()) {
    return new Decimal(0);
  }

  const decimalAdj = Math.pow(10, TOKEN_DECIMALS - SOL_DECIMALS);
  return graduationSol.div(graduationTokens).mul(decimalAdj);
}

export async function fetchPumpFunBondingCurveAccount(
  connection: Connection,
  bondingCurveAddress: string | PublicKey
): Promise<PumpFunBondingCurveAccount> {
  const pubkey =
    typeof bondingCurveAddress === "string"
      ? new PublicKey(bondingCurveAddress)
      : bondingCurveAddress;

  const accountInfo = await connection.getAccountInfo(pubkey);
  if (!accountInfo) {
    throw new Error(
      `PumpFun bonding curve account not found: ${pubkey.toString()}`
    );
  }

  if (!accountInfo.owner.equals(PUMPFUN_PROGRAM)) {
    throw new Error(
      `Account ${pubkey.toString()} is not owned by the PumpFun program`
    );
  }

  return deserializePumpFunBondingCurve(accountInfo.data as Buffer);
}

export async function fetchPumpFunBondingCurveInfo(
  connection: Connection,
  bondingCurveAddress: string | PublicKey
): Promise<PumpFunBondingCurveInfo> {
  const curve = await fetchPumpFunBondingCurveAccount(
    connection,
    bondingCurveAddress
  );

  const bondingPercentage = new Decimal(curve.realSolReserves.toString())
    .div(new Decimal(PUMPFUN_GRADUATION_TARGET.toString()))
    .mul(100);

  const currentPrice = calculateCurrentPrice(curve);

  const graduationPrice = calculateGraduationPrice(curve);

  const totalSupplyHuman = new Decimal(curve.tokenTotalSupply.toString()).div(
    new Decimal(10).pow(TOKEN_DECIMALS)
  );
  const graduationMcap = graduationPrice.mul(totalSupplyHuman);

  const totalFundRaisingSOL = new Decimal(
    PUMPFUN_GRADUATION_TARGET.toString()
  ).div(new Decimal(10).pow(SOL_DECIMALS));

  const raisedSoFar = new Decimal(curve.realSolReserves.toString()).div(
    new Decimal(10).pow(SOL_DECIMALS)
  );

  const remainingToRaise = totalFundRaisingSOL.sub(raisedSoFar);

  const virtualTokenReserves = new Decimal(
    curve.virtualTokenReserves.toString()
  ).div(new Decimal(10).pow(TOKEN_DECIMALS));

  const virtualSolReserves = new Decimal(
    curve.virtualSolReserves.toString()
  ).div(new Decimal(10).pow(SOL_DECIMALS));

  const realTokenReserves = new Decimal(curve.realTokenReserves.toString()).div(
    new Decimal(10).pow(TOKEN_DECIMALS)
  );

  const realSolReserves = new Decimal(curve.realSolReserves.toString()).div(
    new Decimal(10).pow(SOL_DECIMALS)
  );

  return {
    bondingPercentage,
    currentPrice,
    graduationPrice,
    graduationMcap,
    totalFundRaisingSOL,
    raisedSoFar,
    remainingToRaise,
    complete: curve.complete,
    virtualTokenReserves,
    virtualSolReserves,
    realTokenReserves,
    realSolReserves,
  };
}
