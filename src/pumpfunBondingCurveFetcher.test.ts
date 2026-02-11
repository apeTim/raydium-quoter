import { Connection, PublicKey, AccountInfo } from "@solana/web3.js";
import BN from "bn.js";
import Decimal from "decimal.js-light";
import {
  fetchPumpFunBondingCurveAccount,
  fetchPumpFunBondingCurveInfo,
  PumpFunBondingCurveAccount,
  PumpFunBondingCurveInfo,
} from "./pumpfunBondingCurveFetcher";

const PUMPFUN_PROGRAM = new PublicKey(
  "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"
);

const TEST_ADDRESS = new PublicKey("11111111111111111111111111111111");

function createMockBondingCurveData(params: {
  virtualTokenReserves: string;
  virtualSolReserves: string;
  realTokenReserves: string;
  realSolReserves: string;
  tokenTotalSupply: string;
  complete: boolean;
}): Buffer {
  const buffer = Buffer.alloc(57);

  new BN(params.virtualTokenReserves).toBuffer("le", 8).copy(buffer, 8);
  new BN(params.virtualSolReserves).toBuffer("le", 8).copy(buffer, 16);
  new BN(params.realTokenReserves).toBuffer("le", 8).copy(buffer, 24);
  new BN(params.realSolReserves).toBuffer("le", 8).copy(buffer, 32);
  new BN(params.tokenTotalSupply).toBuffer("le", 8).copy(buffer, 40);
  buffer.writeUInt8(params.complete ? 1 : 0, 48);

  return buffer;
}

function createMockAccountInfo(data: Buffer): AccountInfo<Buffer> {
  return {
    data,
    owner: PUMPFUN_PROGRAM,
    lamports: 1000000,
    executable: false,
    rentEpoch: 0,
  };
}

describe("PumpFun Bonding Curve Fetcher", () => {
  let mockConnection: jest.Mocked<Connection>;

  beforeEach(() => {
    mockConnection = {
      getAccountInfo: jest.fn(),
    } as any;
  });

  describe("fetchPumpFunBondingCurveAccount", () => {
    it("should fetch and deserialize bonding curve account", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "500000000000",
        realSolReserves: "42500000000",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveAccount(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.virtualTokenReserves.toString()).toBe("1000000000000");
      expect(result.virtualSolReserves.toString()).toBe("30000000000");
      expect(result.realTokenReserves.toString()).toBe("500000000000");
      expect(result.realSolReserves.toString()).toBe("42500000000");
      expect(result.tokenTotalSupply.toString()).toBe("1000000000000");
      expect(result.complete).toBe(false);
    });

    it("should handle PublicKey as input", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "0",
        realSolReserves: "0",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const pubkey = new PublicKey("11111111111111111111111111111111");
      const result = await fetchPumpFunBondingCurveAccount(
        mockConnection,
        pubkey
      );

      expect(result).toBeDefined();
      expect(mockConnection.getAccountInfo).toHaveBeenCalledWith(pubkey);
    });

    it("should throw error if account not found", async () => {
      mockConnection.getAccountInfo.mockResolvedValue(null);

      await expect(
        fetchPumpFunBondingCurveAccount(mockConnection, TEST_ADDRESS)
      ).rejects.toThrow("PumpFun bonding curve account not found");
    });

    it("should throw error if account has wrong owner", async () => {
      const wrongOwner = new PublicKey("11111111111111111111111111111111");
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "0",
        realSolReserves: "0",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      const accountInfo = createMockAccountInfo(mockData);
      accountInfo.owner = wrongOwner;

      mockConnection.getAccountInfo.mockResolvedValue(accountInfo);

      await expect(
        fetchPumpFunBondingCurveAccount(mockConnection, TEST_ADDRESS)
      ).rejects.toThrow("is not owned by the PumpFun program");
    });

    it("should correctly deserialize completed bonding curve", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "800000000000",
        realSolReserves: "85000000000",
        tokenTotalSupply: "1000000000000",
        complete: true,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveAccount(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.complete).toBe(true);
      expect(result.realSolReserves.toString()).toBe("85000000000");
    });
  });

  describe("fetchPumpFunBondingCurveInfo", () => {
    it("should calculate bonding info for early stage curve", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "100000000000",
        realSolReserves: "5000000000",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.bondingPercentage.toNumber()).toBeCloseTo(5.88, 1);
      expect(result.complete).toBe(false);
      expect(result.raisedSoFar.toNumber()).toBeCloseTo(5, 1);
      expect(result.totalFundRaisingSOL.toNumber()).toBe(85);
      expect(result.remainingToRaise.toNumber()).toBeCloseTo(80, 1);
    });

    it("should calculate bonding info for mid-stage curve", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "500000000000",
        realSolReserves: "42500000000",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.bondingPercentage.toNumber()).toBe(50);
      expect(result.complete).toBe(false);
      expect(result.raisedSoFar.toNumber()).toBe(42.5);
      expect(result.remainingToRaise.toNumber()).toBe(42.5);
    });

    it("should calculate bonding info for near-complete curve", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "800000000000",
        realSolReserves: "80000000000",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.bondingPercentage.toNumber()).toBeCloseTo(94.12, 1);
      expect(result.complete).toBe(false);
      expect(result.raisedSoFar.toNumber()).toBe(80);
      expect(result.remainingToRaise.toNumber()).toBe(5);
    });

    it("should calculate bonding info for completed curve", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "850000000000",
        realSolReserves: "85000000000",
        tokenTotalSupply: "1000000000000",
        complete: true,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.bondingPercentage.toNumber()).toBe(100);
      expect(result.complete).toBe(true);
      expect(result.raisedSoFar.toNumber()).toBe(85);
      expect(result.remainingToRaise.toNumber()).toBe(0);
    });

    it("should calculate correct prices and market cap", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "500000000000",
        realSolReserves: "42500000000",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.currentPrice.toNumber()).toBeGreaterThan(0);
      expect(result.graduationPrice.toNumber()).toBeGreaterThan(0);
      expect(result.graduationMcap.toNumber()).toBeGreaterThan(0);
      expect(result.graduationPrice.toNumber()).toBeGreaterThan(
        result.currentPrice.toNumber()
      );
    });

    it("should return correct human-readable reserves", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "500000000000",
        realSolReserves: "42500000000",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.virtualTokenReserves.toNumber()).toBe(1000000);
      expect(result.virtualSolReserves.toNumber()).toBe(30);
      expect(result.realTokenReserves.toNumber()).toBe(500000);
      expect(result.realSolReserves.toNumber()).toBe(42.5);
    });

    it("should handle zero real reserves", async () => {
      const mockData = createMockBondingCurveData({
        virtualTokenReserves: "1000000000000",
        virtualSolReserves: "30000000000",
        realTokenReserves: "0",
        realSolReserves: "0",
        tokenTotalSupply: "1000000000000",
        complete: false,
      });

      mockConnection.getAccountInfo.mockResolvedValue(
        createMockAccountInfo(mockData)
      );

      const result = await fetchPumpFunBondingCurveInfo(
        mockConnection,
        TEST_ADDRESS
      );

      expect(result.bondingPercentage.toNumber()).toBe(0);
      expect(result.raisedSoFar.toNumber()).toBe(0);
      expect(result.remainingToRaise.toNumber()).toBe(85);
      expect(result.currentPrice.toNumber()).toBeGreaterThan(0);
    });
  });
});
