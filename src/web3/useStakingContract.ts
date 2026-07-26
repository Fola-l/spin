import { useCallback, useEffect, useState } from "react";
import { Contract, MaxUint256, type ContractTransactionReceipt } from "ethers";
import { ERC20_ABI, STAKING_ABI } from "./abi";
import { FLD_TOKEN_ADDRESS, STAKING_CONTRACT_ADDRESS } from "./config";
import { translateError } from "./errors";
import type { UseWalletResult } from "./useWallet";

const DEFAULT_DECIMALS = 18;

export interface UseStakingContractResult {
  decimals: number;
  decimalsAssumed: boolean;
  toBaseUnits: (humanAmount: string) => bigint;
  fromBaseUnits: (amount: bigint) => string;
  owner: () => Promise<string | null>;
  roundStatus: () => Promise<bigint>;
  rewardPool: () => Promise<bigint>;
  stakedAmountOf: (studentIdHash: string) => Promise<bigint>;
  walletToStudent: (address: string) => Promise<string>;
  ensureAllowance: (ownerAddress: string, amount: bigint) => Promise<void>;
  startRound: (
    stakeAmount: bigint,
    rewardAmount: bigint,
    penaltyAmount: bigint,
  ) => Promise<ContractTransactionReceipt>;
  lockRound: () => Promise<ContractTransactionReceipt>;
  stake: (studentIdHash: string) => Promise<ContractTransactionReceipt>;
  resolveCorrect: (studentIdHash: string) => Promise<ContractTransactionReceipt>;
  resolveWrong: (studentIdHash: string) => Promise<ContractTransactionReceipt>;
  fundPool: (amount: bigint) => Promise<ContractTransactionReceipt>;
}

export function useStakingContract(wallet: UseWalletResult): UseStakingContractResult {
  const [decimals, setDecimals] = useState(DEFAULT_DECIMALS);
  const [decimalsAssumed, setDecimalsAssumed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const provider = wallet.getProvider();
      if (!provider) return;
      try {
        const token = new Contract(FLD_TOKEN_ADDRESS, ERC20_ABI, provider);
        const d = await token.decimals();
        if (!cancelled) {
          setDecimals(Number(d));
          setDecimalsAssumed(false);
        }
      } catch {
        if (!cancelled) {
          setDecimals(DEFAULT_DECIMALS);
          setDecimalsAssumed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet]);

  const toBaseUnits = useCallback(
    (humanAmount: string): bigint => {
      const trimmed = humanAmount.trim();
      if (!trimmed) return 0n;
      const [whole = "0", frac = ""] = trimmed.split(".");
      const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
      return BigInt((whole === "" ? "0" : whole) + fracPadded);
    },
    [decimals],
  );

  const fromBaseUnits = useCallback(
    (amount: bigint): string => {
      const s = amount.toString().padStart(decimals + 1, "0");
      const whole = s.slice(0, s.length - decimals) || "0";
      const frac = s.slice(s.length - decimals).replace(/0+$/, "");
      return frac ? `${whole}.${frac}` : whole;
    },
    [decimals],
  );

  const getReadContract = useCallback((): Contract | null => {
    const provider = wallet.getProvider();
    if (!provider || !STAKING_CONTRACT_ADDRESS) return null;
    return new Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, provider);
  }, [wallet]);

  const getWriteContract = useCallback(async (): Promise<Contract> => {
    if (!STAKING_CONTRACT_ADDRESS) {
      throw new Error("Staking contract address is not configured yet.");
    }
    const signer = await wallet.getSigner();
    if (!signer) throw new Error("Connect your wallet first.");
    return new Contract(STAKING_CONTRACT_ADDRESS, STAKING_ABI, signer);
  }, [wallet]);

  const getTokenContract = useCallback(
    async (needsSigner: boolean): Promise<Contract> => {
      if (needsSigner) {
        const signer = await wallet.getSigner();
        if (!signer) throw new Error("Connect your wallet first.");
        return new Contract(FLD_TOKEN_ADDRESS, ERC20_ABI, signer);
      }
      const provider = wallet.getProvider();
      if (!provider) throw new Error("No wallet provider available.");
      return new Contract(FLD_TOKEN_ADDRESS, ERC20_ABI, provider);
    },
    [wallet],
  );

  const runWrite = useCallback(
    async (
      contract: Contract,
      method: string,
      args: unknown[],
    ): Promise<ContractTransactionReceipt> => {
      try {
        const tx = await contract[method](...args);
        const receipt = await tx.wait();
        if (!receipt) throw new Error("Transaction did not confirm.");
        return receipt;
      } catch (err) {
        throw new Error(translateError(err, contract.interface));
      }
    },
    [],
  );

  const owner = useCallback(async (): Promise<string | null> => {
    const contract = getReadContract();
    if (!contract) return null;
    try {
      return (await contract.owner()) as string;
    } catch {
      return null;
    }
  }, [getReadContract]);

  const roundStatus = useCallback(async (): Promise<bigint> => {
    const contract = getReadContract();
    if (!contract) return 0n;
    return (await contract.roundStatus()) as bigint;
  }, [getReadContract]);

  const rewardPool = useCallback(async (): Promise<bigint> => {
    const contract = getReadContract();
    if (!contract) return 0n;
    return (await contract.rewardPool()) as bigint;
  }, [getReadContract]);

  const stakedAmountOf = useCallback(
    async (studentIdHash: string): Promise<bigint> => {
      const contract = getReadContract();
      if (!contract) return 0n;
      return (await contract.stakedAmountOf(studentIdHash)) as bigint;
    },
    [getReadContract],
  );

  const walletToStudent = useCallback(
    async (address: string): Promise<string> => {
      const contract = getReadContract();
      if (!contract) return "";
      return (await contract.walletToStudent(address)) as string;
    },
    [getReadContract],
  );

  const ensureAllowance = useCallback(
    async (ownerAddress: string, amount: bigint): Promise<void> => {
      if (!STAKING_CONTRACT_ADDRESS) {
        throw new Error("Staking contract address is not configured yet.");
      }
      const readToken = await getTokenContract(false);
      const current = (await readToken.allowance(
        ownerAddress,
        STAKING_CONTRACT_ADDRESS,
      )) as bigint;
      if (current >= amount) return;

      const writeToken = await getTokenContract(true);
      await runWrite(writeToken, "approve", [STAKING_CONTRACT_ADDRESS, MaxUint256]);
    },
    [getTokenContract, runWrite],
  );

  const startRound = useCallback(
    async (stakeAmount: bigint, rewardAmount: bigint, penaltyAmount: bigint) => {
      const contract = await getWriteContract();
      return runWrite(contract, "startRound", [stakeAmount, rewardAmount, penaltyAmount]);
    },
    [getWriteContract, runWrite],
  );

  const lockRound = useCallback(async () => {
    const contract = await getWriteContract();
    return runWrite(contract, "lockRound", []);
  }, [getWriteContract, runWrite]);

  const stake = useCallback(
    async (studentIdHash: string) => {
      const contract = await getWriteContract();
      return runWrite(contract, "stake", [studentIdHash]);
    },
    [getWriteContract, runWrite],
  );

  const resolveCorrect = useCallback(
    async (studentIdHash: string) => {
      const contract = await getWriteContract();
      return runWrite(contract, "resolveCorrect", [studentIdHash]);
    },
    [getWriteContract, runWrite],
  );

  const resolveWrong = useCallback(
    async (studentIdHash: string) => {
      const contract = await getWriteContract();
      return runWrite(contract, "resolveWrong", [studentIdHash]);
    },
    [getWriteContract, runWrite],
  );

  const fundPool = useCallback(
    async (amount: bigint) => {
      const contract = await getWriteContract();
      return runWrite(contract, "fundPool", [amount]);
    },
    [getWriteContract, runWrite],
  );

  return {
    decimals,
    decimalsAssumed,
    toBaseUnits,
    fromBaseUnits,
    owner,
    roundStatus,
    rewardPool,
    stakedAmountOf,
    walletToStudent,
    ensureAllowance,
    startRound,
    lockRound,
    stake,
    resolveCorrect,
    resolveWrong,
    fundPool,
  };
}
