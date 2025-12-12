import type { Address } from 'viem'
import { readContract } from 'wagmi/actions'
import AggregatorV3_ABI from './AggregatorV3_ABI.json'
import { config } from '../wagmi.ts'
import { useReadContract } from 'wagmi'

export const aggregatorV3LatestRoundData = async (
  aggregatorContract: Address,
  chainId: number
): Promise<bigint> => {
  const [, answer] = (await readContract(config, {
    address: aggregatorContract,
    abi: AggregatorV3_ABI,
    functionName: 'latestRoundData',
    chainId,
  })) as [roundId: bigint, answer: bigint, startedAt: bigint, updatedAt: bigint, answeredInRound: bigint]

  return answer
}

type UseAggregatorV3DecimalsOptions = {
  enabled?: boolean
}

export function useAggregatorV3Decimals(
  aggregatorContract?: Address,
  chainId?: number,
  options: UseAggregatorV3DecimalsOptions = {}
) {
  return useReadContract({
    address: aggregatorContract,
    abi: AggregatorV3_ABI,
    functionName: 'decimals',
    chainId,
    query: {
      enabled: Boolean(aggregatorContract && chainId) && (options.enabled ?? true),
      select: decimals => {
        return BigInt((decimals as number).toString())
      },
    },
  })
}
