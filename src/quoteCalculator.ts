import BN from "bn.js";
import Decimal from "decimal.js-light";
import {
  PoolData,
  QuoteResult,
  ExactInputQuoteParams,
  ExactOutputQuoteParams,
  SwapDirection,
} from "./types";

const FEE_RATE_DENOMINATOR = new BN(1_000_000);

export function toRawAmount(amount: number | string, decimals: number): BN {
  const decimal = new Decimal(amount);
  const multiplier = new Decimal(10).pow(decimals);
  const raw = decimal.mul(multiplier).toDecimalPlaces(0, Decimal.ROUND_DOWN);
  return new BN(raw.toString());
}

export function toHumanAmount(amount: BN, decimals: number): Decimal {
  const divisor = new Decimal(10).pow(decimals);
  return new Decimal(amount.toString()).div(divisor);
}

function calculateFee(amount: BN, feeRate: BN): BN {
  return amount.mul(feeRate).div(FEE_RATE_DENOMINATOR);
}

function ceilDiv(a: BN, b: BN): BN {
  return a.add(b.subn(1)).div(b);
}

function calculateSwapOutput(
  inputAmount: BN,
  inputReserve: BN,
  outputReserve: BN
): BN {
  const numerator = inputAmount.mul(outputReserve);
  const denominator = inputReserve.add(inputAmount);
  return numerator.div(denominator);
}

function calculateSwapInput(
  outputAmount: BN,
  inputReserve: BN,
  outputReserve: BN
): BN {
  const numerator = inputReserve.mul(outputAmount);
  const denominator = outputReserve.sub(outputAmount);
  return ceilDiv(numerator, denominator);
}

function getReserves(
  poolData: PoolData,
  direction: SwapDirection
): { inputReserve: BN; outputReserve: BN; inputDecimals: number; outputDecimals: number } {
  if (direction === "solToToken") {
    return {
      inputReserve: poolData.quoteReserve,
      outputReserve: poolData.baseReserve,
      inputDecimals: poolData.mintB.decimals,
      outputDecimals: poolData.mintA.decimals,
    };
  } else {
    return {
      inputReserve: poolData.baseReserve,
      outputReserve: poolData.quoteReserve,
      inputDecimals: poolData.mintA.decimals,
      outputDecimals: poolData.mintB.decimals,
    };
  }
}

function calculateCurrentPrice(poolData: PoolData): Decimal {
  const baseDecimal = new Decimal(poolData.baseReserve.toString());
  const quoteDecimal = new Decimal(poolData.quoteReserve.toString());
  const decimalAdjustment = new Decimal(10).pow(
    poolData.mintA.decimals - poolData.mintB.decimals
  );
  return quoteDecimal.div(baseDecimal).mul(decimalAdjustment);
}

function calculatePriceImpact(
  currentPrice: Decimal,
  executionPrice: Decimal,
  direction: SwapDirection
): Decimal {
  if (direction === "solToToken") {
    return executionPrice.sub(currentPrice).div(currentPrice).abs();
  } else {
    return currentPrice.sub(executionPrice).div(currentPrice).abs();
  }
}

export function calculateExactInputQuote(params: ExactInputQuoteParams): QuoteResult {
  const { poolData, amountIn, slippage, direction } = params;
  const { inputReserve, outputReserve, inputDecimals, outputDecimals } = getReserves(
    poolData,
    direction
  );

  const rawAmountIn = toRawAmount(amountIn, inputDecimals);

  const fee = calculateFee(rawAmountIn, poolData.feeConfig.tradeFeeRate);
  const amountInAfterFee = rawAmountIn.sub(fee);

  const rawAmountOut = calculateSwapOutput(amountInAfterFee, inputReserve, outputReserve);

  const slippageBN = new BN(Math.floor(slippage * 1_000_000));
  const slippageAmount = rawAmountOut.mul(slippageBN).div(FEE_RATE_DENOMINATOR);
  const minAmountOut = rawAmountOut.sub(slippageAmount);

  const currentPrice = calculateCurrentPrice(poolData);

  const inputHuman = toHumanAmount(rawAmountIn, inputDecimals);
  const outputHuman = toHumanAmount(rawAmountOut, outputDecimals);

  let executionPrice: Decimal;
  if (direction === "solToToken") {
    executionPrice = inputHuman.div(outputHuman);
  } else {
    executionPrice = outputHuman.div(inputHuman);
  }

  const priceImpact = calculatePriceImpact(currentPrice, executionPrice, direction);

  return {
    amountIn: rawAmountIn,
    amountOut: rawAmountOut,
    minAmountOut,
    maxAmountIn: rawAmountIn,
    fee,
    priceImpact,
    executionPrice,
    currentPrice,
    direction,
  };
}

export function calculateExactOutputQuote(params: ExactOutputQuoteParams): QuoteResult {
  const { poolData, amountOut, slippage, direction } = params;
  const { inputReserve, outputReserve, inputDecimals, outputDecimals } = getReserves(
    poolData,
    direction
  );

  const rawAmountOut = toRawAmount(amountOut, outputDecimals);

  if (rawAmountOut.gte(outputReserve)) {
    throw new Error(
      `Output amount (${rawAmountOut.toString()}) exceeds pool reserve (${outputReserve.toString()})`
    );
  }

  const amountInBeforeFee = calculateSwapInput(rawAmountOut, inputReserve, outputReserve);

  const feeRateDenomMinusFee = FEE_RATE_DENOMINATOR.sub(poolData.feeConfig.tradeFeeRate);
  const rawAmountIn = ceilDiv(
    amountInBeforeFee.mul(FEE_RATE_DENOMINATOR),
    feeRateDenomMinusFee
  );

  const fee = rawAmountIn.sub(amountInBeforeFee);

  const slippageBN = new BN(Math.floor(slippage * 1_000_000));
  const slippageAmount = rawAmountIn.mul(slippageBN).div(FEE_RATE_DENOMINATOR);
  const maxAmountIn = rawAmountIn.add(slippageAmount);

  const currentPrice = calculateCurrentPrice(poolData);

  const inputHuman = toHumanAmount(rawAmountIn, inputDecimals);
  const outputHuman = toHumanAmount(rawAmountOut, outputDecimals);

  let executionPrice: Decimal;
  if (direction === "solToToken") {
    executionPrice = inputHuman.div(outputHuman);
  } else {
    executionPrice = outputHuman.div(inputHuman);
  }

  const priceImpact = calculatePriceImpact(currentPrice, executionPrice, direction);

  return {
    amountIn: rawAmountIn,
    amountOut: rawAmountOut,
    minAmountOut: rawAmountOut,
    maxAmountIn,
    fee,
    priceImpact,
    executionPrice,
    currentPrice,
    direction,
  };
}

export function calculateMultipleQuotes(
  poolData: PoolData,
  amounts: (number | string)[],
  slippage: number,
  direction: SwapDirection,
  isExactInput: boolean = true
): QuoteResult[] {
  return amounts.map((amount) => {
    if (isExactInput) {
      return calculateExactInputQuote({
        poolData,
        amountIn: amount,
        slippage,
        direction,
      });
    } else {
      return calculateExactOutputQuote({
        poolData,
        amountOut: amount,
        slippage,
        direction,
      });
    }
  });
}
