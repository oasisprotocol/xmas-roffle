import { sapphire, base, arbitrum, mainnet } from 'wagmi/chains'
import { Address, Chain } from 'viem'

/** PaymasterVault contract address (same on all supported chains) */
export const PAYMASTER_VAULT_ADDRESS: Address = '0x4A390256055264787F1d7d9b75bDBe78F6b7f49C'

/** Source chains where users can deposit stablecoins */
export const SUPPORTED_SOURCE_CHAINS: Chain[] = [base, arbitrum, mainnet]

export const ROFL_PAYMASTER_ENABLED_CHAINS = SUPPORTED_SOURCE_CHAINS
export const ROFL_PAYMASTER_NATIVE_TOKEN_ADDRESS = '0xNATIVE'
export const ROFL_PAYMASTER_EXPECTED_TIME = 60 // 60 seconds
export const ROFL_PAYMASTER_DEPOSIT_GAS_LIMIT = 500_000n
export const ROFL_PAYMASTER_DESTINATION_CHAIN = sapphire
export const ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN = sapphire.nativeCurrency

export type RoflPaymasterTokenConfig = {
  contractAddress: Address
  symbol: string
  decimals: number
  name: string
}
export type RoflPaymasterChainConfig = {
  paymasterContractAddress: Address
  TOKENS: RoflPaymasterTokenConfig[]
}

export const ROFL_PAYMASTER_TOKEN_CONFIG: Record<number, RoflPaymasterChainConfig> = {
  [base.id]: {
    paymasterContractAddress: PAYMASTER_VAULT_ADDRESS,
    TOKENS: [
      {
        contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        symbol: 'USDC',
        decimals: 6,
        name: 'USDC',
      },
      {
        contractAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        symbol: 'USDT',
        decimals: 6,
        name: 'Tether USD',
      },
    ],
  },
  [arbitrum.id]: {
    paymasterContractAddress: PAYMASTER_VAULT_ADDRESS,
    TOKENS: [
      {
        contractAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
        symbol: 'USDC',
        decimals: 6,
        name: 'USDC',
      },
      {
        contractAddress: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
        symbol: 'USDT',
        decimals: 6,
        name: 'Tether USD',
      },
    ],
  },
  [mainnet.id]: {
    paymasterContractAddress: PAYMASTER_VAULT_ADDRESS,
    TOKENS: [
      {
        contractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        symbol: 'USDC',
        decimals: 6,
        name: 'USDC',
      },
      {
        contractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT',
        decimals: 6,
        name: 'Tether USD',
      },
    ],
  },
}

export const ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG = {
  [sapphire.id]: '0x6997953a4458F019506370110e84eefF52d375ad' as Address,
}

export const ROFL_PAYMASTER_SLIPPAGE_PERCENTAGE = 2n // 2%

/** Get a source chain by ID, or undefined if not supported */
export function getSourceChain(chainId: number): Chain | undefined {
  return SUPPORTED_SOURCE_CHAINS.find(chain => chain.id === chainId)
}

/** Get chain name for display */
export function getChainName(chainId: number): string {
  const chain = getSourceChain(chainId)
  return chain?.name ?? 'Unknown'
}
