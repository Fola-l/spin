/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FLD_TOKEN_ADDRESS?: string;
  readonly VITE_STAKING_CONTRACT_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
