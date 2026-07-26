import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, type JsonRpcSigner } from "ethers";
import "./ethereum.d.ts";

export interface WalletState {
  activeAddress: string | null;
  chainId: bigint | null;
  connecting: boolean;
  error: string | null;
}

export interface UseWalletResult extends WalletState {
  connect: () => Promise<string | null>;
  getProvider: () => BrowserProvider | null;
  getSigner: () => Promise<JsonRpcSigner | null>;
}

export function useWallet(): UseWalletResult {
  const [state, setState] = useState<WalletState>({
    activeAddress: null,
    chainId: null,
    connecting: false,
    error: null,
  });
  const providerRef = useRef<BrowserProvider | null>(null);

  const getProvider = useCallback((): BrowserProvider | null => {
    if (!window.ethereum) return null;
    if (!providerRef.current) {
      providerRef.current = new BrowserProvider(window.ethereum);
    }
    return providerRef.current;
  }, []);

  const refreshAccountsAndChain = useCallback(async () => {
    const provider = getProvider();
    if (!provider) return;
    const accounts = (await provider.send("eth_accounts", [])) as string[];
    const network = await provider.getNetwork();
    setState((prev) => ({
      ...prev,
      activeAddress: accounts[0] ?? null,
      chainId: network.chainId,
    }));
  }, [getProvider]);

  const connect = useCallback(async (): Promise<string | null> => {
    if (!window.ethereum) {
      setState((prev) => ({
        ...prev,
        error: "No wallet extension found. Install MetaMask to continue.",
      }));
      return null;
    }
    setState((prev) => ({ ...prev, connecting: true, error: null }));
    try {
      const provider = getProvider();
      if (!provider) return null;
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      const network = await provider.getNetwork();
      setState({
        activeAddress: accounts[0] ?? null,
        chainId: network.chainId,
        connecting: false,
        error: null,
      });
      return accounts[0] ?? null;
    } catch {
      setState((prev) => ({
        ...prev,
        connecting: false,
        error: "Wallet connection was rejected.",
      }));
      return null;
    }
  }, [getProvider]);

  const getSigner = useCallback(async (): Promise<JsonRpcSigner | null> => {
    const provider = getProvider();
    if (!provider) return null;
    try {
      return await provider.getSigner();
    } catch {
      return null;
    }
  }, [getProvider]);

  useEffect(() => {
    if (!window.ethereum) return;
    const ethereum = window.ethereum;

    void refreshAccountsAndChain();

    const handleAccountsChanged = () => void refreshAccountsAndChain();
    const handleChainChanged = () => void refreshAccountsAndChain();

    ethereum.on("accountsChanged", handleAccountsChanged);
    ethereum.on("chainChanged", handleChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", handleAccountsChanged);
      ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [refreshAccountsAndChain]);

  return useMemo(
    () => ({ ...state, connect, getProvider, getSigner }),
    [state, connect, getProvider, getSigner],
  );
}
