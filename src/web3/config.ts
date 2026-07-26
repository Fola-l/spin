export const SEPOLIA_CHAIN_ID = 11155111n;

// Both addresses are read from build-time env vars (set in `.env` locally, and
// in your Vercel project's Environment Variables for deployment). They must be
// prefixed with VITE_ for Vite to expose them to client code — see .env.example.
export const FLD_TOKEN_ADDRESS = import.meta.env.VITE_FLD_TOKEN_ADDRESS ?? "";

export const STAKING_CONTRACT_ADDRESS =
  import.meta.env.VITE_STAKING_CONTRACT_ADDRESS ?? "";

export const SEPOLIA_EXPLORER_BASE_URL = "https://sepolia.etherscan.io";

export function explorerTxUrl(txHash: string): string {
  return `${SEPOLIA_EXPLORER_BASE_URL}/tx/${txHash}`;
}

export function explorerAddressUrl(address: string): string {
  return `${SEPOLIA_EXPLORER_BASE_URL}/address/${address}`;
}
