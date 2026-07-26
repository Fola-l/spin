import type { Interface } from "ethers";

const CUSTOM_ERROR_MESSAGES: Record<string, string> = {
  WalletAlreadyBound: "This wallet is already registered to a different student.",
  StudentAlreadyBound: "This student is already registered to a different wallet.",
  AlreadyStaked: "This student has already staked for this question.",
  NotStaked: "This student hasn't staked for this question.",
  RoundNotOpen: "Hands aren't open for staking right now.",
  RoundNotLocked: "The round needs to be locked first.",
  InsufficientPool:
    "The reward pool doesn't have enough tokens to cover this reward amount.",
  PenaltyExceedsStake: "The penalty can't be larger than the stake amount.",
  NoStakers: "No students have staked yet.",
  OwnableUnauthorizedAccount: "Switch MetaMask to the teacher wallet to do this.",
};

interface EthersLikeError {
  code?: string | number;
  data?: string;
  reason?: string | null;
  shortMessage?: string;
  message?: string;
  info?: { error?: { data?: string } };
}

function extractRevertData(err: EthersLikeError): string | undefined {
  return err.data ?? err.info?.error?.data;
}

/** Translates an ethers/MetaMask error into a short, human-readable message. */
export function translateError(err: unknown, contractInterface?: Interface): string {
  const error = (err ?? {}) as EthersLikeError;

  if (error.code === "ACTION_REJECTED" || error.code === 4001) {
    return "You rejected the transaction in your wallet.";
  }

  if (error.code === "INSUFFICIENT_FUNDS") {
    return "This wallet doesn't have enough ETH to pay for gas.";
  }

  const data = extractRevertData(error);
  if (data && contractInterface) {
    try {
      const parsed = contractInterface.parseError(data);
      if (parsed && CUSTOM_ERROR_MESSAGES[parsed.name]) {
        return CUSTOM_ERROR_MESSAGES[parsed.name];
      }
      if (parsed) {
        return `Reverted: ${parsed.name}`;
      }
    } catch {
      // fall through to generic handling below
    }
  }

  if (error.reason) {
    return error.reason;
  }

  if (error.shortMessage) {
    return error.shortMessage;
  }

  console.error("Unhandled web3 error:", err);
  return "Something went wrong with the transaction. Check the console for details.";
}
