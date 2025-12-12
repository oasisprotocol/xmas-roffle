import type { Address } from 'viem'
import { readContract } from 'wagmi/actions'
import CrossChainPaymaster_ABI from './CrossChainPaymaster_ABI.json'
import { config } from '../wagmi.ts'
import { useReadContract } from 'wagmi'

export const calculateRoseAmount = async (
  crossChainPaymasterContractAddress: Address,
  tokenContractAddress: Address,
  amount: bigint,
  chainId: number
): Promise<bigint> => {
  return (await readContract(config, {
    address: crossChainPaymasterContractAddress,
    abi: CrossChainPaymaster_ABI,
    functionName: 'calculateRoseAmount',
    args: [tokenContractAddress, amount],
    chainId,
  })) as bigint
}

export const isPaymentProcessed = async (
  crossChainPaymasterContractAddress: Address,
  paymentId: string,
  chainId: number
): Promise<boolean> => {
  return (await readContract(config, {
    address: crossChainPaymasterContractAddress,
    abi: CrossChainPaymaster_ABI,
    functionName: 'isPaymentProcessed',
    args: [paymentId],
    chainId,
  })) as boolean
}

interface UsePriceFeedOptions {
  enabled?: boolean
}

export function useRosePriceFeed(
  crossChainPaymasterContractAddress?: Address,
  chainId?: number,
  options: UsePriceFeedOptions = {}
) {
  return useReadContract({
    address: crossChainPaymasterContractAddress,
    abi: CrossChainPaymaster_ABI,
    functionName: 'roseUsdFeed',
    chainId,
    query: {
      enabled: Boolean(crossChainPaymasterContractAddress && chainId) && (options.enabled ?? true),
    },
  })
}

export function useTokenPriceFeed(
  crossChainPaymasterContractAddress?: Address,
  tokenContractAddress?: Address,
  chainId?: number,
  options: UsePriceFeedOptions = {}
) {
  return useReadContract({
    address: crossChainPaymasterContractAddress,
    abi: CrossChainPaymaster_ABI,
    functionName: 'priceFeeds',
    args: tokenContractAddress ? [tokenContractAddress] : undefined,
    chainId,
    query: {
      enabled:
        Boolean(crossChainPaymasterContractAddress && tokenContractAddress && chainId) &&
        (options.enabled ?? true),
    },
  })
}
