// Browser wallet (Binance Web3 Wallet, MetaMask, Trust, any EIP-1193 wallet) on BSC mainnet.
import { createWalletClient, custom, parseAbi, parseUnits, type Address, type Hash } from 'viem';
import { bsc } from 'viem/chains';
import { client, FACTORY, USDT } from './chain';

declare global {
  interface Window { ethereum?: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown>; on?: (e: string, f: (...a: unknown[]) => void) => void } }
}

const erc20 = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);
const factory = parseAbi([
  'function open(uint256 stockId, uint256 promiseBps, uint256 amount) returns (address)',
  'function vaultsOf(address saver) view returns (address[])',
]);
const vault = parseAbi(['function withdraw(uint256 share)']);

export const hasWallet = () => typeof window !== 'undefined' && !!window.ethereum;

function wallet() {
  if (!window.ethereum) throw new Error('No wallet found in this browser. Install Binance Web3 Wallet or MetaMask.');
  return createWalletClient({ chain: bsc, transport: custom(window.ethereum) });
}

/** Ask the wallet for an account and make sure it is on BSC mainnet (chain 56). */
export async function connect(): Promise<Address> {
  const w = wallet();
  const [account] = await w.requestAddresses();
  if ((await w.getChainId()) !== bsc.id) {
    try {
      await w.switchChain({ id: bsc.id });
    } catch {
      await w.addChain({ chain: bsc });
    }
  }
  return account;
}

export async function usdtState(account: Address) {
  const [balance, allowance] = await Promise.all([
    client.readContract({ address: USDT, abi: erc20, functionName: 'balanceOf', args: [account] }),
    client.readContract({ address: USDT, abi: erc20, functionName: 'allowance', args: [account, FACTORY] }),
  ]);
  return { balance, allowance };
}

export const usdtUnits = (amount: number) => parseUnits(String(amount), 18);

export async function approve(account: Address, amount: bigint): Promise<Hash> {
  const hash = await wallet().writeContract({ account, chain: bsc, address: USDT, abi: erc20, functionName: 'approve', args: [FACTORY, amount] });
  await client.waitForTransactionReceipt({ hash });
  return hash;
}

/** Simulates first so a revert shows up before the wallet asks to sign. Returns the new vault address. */
export async function openVault(account: Address, stockId: number, bps: number, amount: bigint): Promise<{ hash: Hash; vault: Address }> {
  const { request, result } = await client.simulateContract({
    account, address: FACTORY, abi: factory, functionName: 'open', args: [BigInt(stockId), BigInt(bps), amount],
  });
  const hash = await wallet().writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The deposit transaction reverted.');
  return { hash, vault: result };
}

export async function vaultsOf(account: Address): Promise<Address[]> {
  return [...(await client.readContract({ address: FACTORY, abi: factory, functionName: 'vaultsOf', args: [account] }))];
}

/** Withdraw `fraction` (0..1] of the vault at today's value. Only the saver can. */
export async function withdraw(account: Address, vaultAddr: Address, fraction: number): Promise<Hash> {
  const share = BigInt(Math.round(fraction * 1e6)) * 10n ** 12n;
  const { request } = await client.simulateContract({ account, address: vaultAddr, abi: vault, functionName: 'withdraw', args: [share] });
  const hash = await wallet().writeContract(request);
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('The withdrawal reverted.');
  return hash;
}
