import { arbitrum, base, mainnet, sapphire } from 'wagmi/chains'

type ChainWithExplorer = {
  id: number
  blockExplorers?: {
    default: { url: string }
  }
}

const SUPPORTED_CHAINS: ChainWithExplorer[] = [base, arbitrum, mainnet, sapphire]

/**
 * Get the block explorer URL for a transaction hash.
 * Uses wagmi chain definitions for dynamic URL generation.
 */
export function getExplorerTxUrl(chainId: number, txHash: string): string | null {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
  const baseUrl = chain?.blockExplorers?.default?.url
  if (!baseUrl) return null
  return `${baseUrl}/tx/${txHash}`
}

/**
 * Get the block explorer URL for an address (wallet or contract).
 * Useful for "View Wallet on Sapphire" links.
 */
export function getExplorerAddressUrl(chainId: number, address: string): string | null {
  const chain = SUPPORTED_CHAINS.find(c => c.id === chainId)
  const baseUrl = chain?.blockExplorers?.default?.url
  if (!baseUrl) return null
  return `${baseUrl}/address/${address}`
}
