import { createPublicClient, createWalletClient, custom, http, type EIP1193Provider } from "viem";

export const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 4663);
export const chain = {
  id: chainId,
  name: chainId === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [process.env.NEXT_PUBLIC_RPC_HTTP_URL ?? "https://rpc.mainnet.chain.robinhood.com"] } },
  blockExplorers: { default: { name: "Blockscout", url: process.env.NEXT_PUBLIC_EXPLORER_URL ?? "https://robinhoodchain.blockscout.com" } }
} as const;

export type InjectedProvider = EIP1193Provider & { providers?: InjectedProvider[]; isTrust?: boolean; isMetaMask?: boolean };

export function injected(): InjectedProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as typeof window & { ethereum?: InjectedProvider }).ethereum;
}

export async function walletClients() {
  const provider = injected();
  if (!provider) throw new Error("Install MetaMask or Trust Wallet to continue.");
  const wallet = createWalletClient({ chain, transport: custom(provider) });
  const publicClient = createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
  return { wallet, publicClient };
}

export function readClient() {
  return createPublicClient({ chain, transport: http(chain.rpcUrls.default.http[0]) });
}

export async function ensureChain(provider: InjectedProvider) {
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: `0x${chainId.toString(16)}`,
        chainName: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcUrls.default.http,
        blockExplorerUrls: [chain.blockExplorers.default.url]
      }]
    });
  }
}
