import { useCallback, useState } from 'react'
import { BaseError, fallback, useAccount, useBalance } from 'wagmi'
import { checkAndSetErc20Allowance, switchToChain } from '../contracts/erc-20'
import { Address, Chain, http } from 'viem'
import { base } from 'wagmi/chains'
import { deposit } from '../contracts/paymasterVault.ts'
import {
  ROFL_PAYMASTER_DESTINATION_CHAIN,
  ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN,
  ROFL_PAYMASTER_EXPECTED_TIME,
  ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG,
  ROFL_PAYMASTER_SLIPPAGE_PERCENTAGE,
  ROFL_PAYMASTER_TOKEN_CONFIG,
  RoflPaymasterTokenConfig,
} from '../constants/rofl-paymaster-config.ts'
import { isPaymentProcessed, useRosePriceFeed, useTokenPriceFeed } from '../contracts/crossChainPaymaster.ts'
import { aggregatorV3LatestRoundData, useAggregatorV3Decimals } from '../contracts/AggregatorV3.ts'
import { generateAndSubmitManualProof } from '../lib/paymaster.utils.ts'
import { getPublicClient } from '@wagmi/core'
import { config } from '../wagmi.ts'

export type PaymasterStepStatus = 'pending' | 'processing' | 'completed' | 'error'

export type ProgressStep = {
  id: number
  label: string
  expectedTimeInSeconds?: number
}

export type ProgressStepWithAction = ProgressStep & {
  action: () => Promise<void>
}

export type StartTopUpParams = {
  amount: bigint
}

export type UsePaymasterTopUpFlowReturn = {
  isLoading: boolean
  initialLoading: boolean
  error: string
  quote: bigint | null

  currentStep: ProgressStep | ProgressStepWithAction | null
  stepStatuses: Partial<Record<number, PaymasterStepStatus>>

  getQuote: (p: StartTopUpParams) => Promise<bigint | null>
  startTopUp: (p: StartTopUpParams) => Promise<{ paymentId: string | null }>
  reset: () => void
}

function ceilDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error('Division by zero')
  return (n + d - 1n) / d
}

const progressSteps = [
  {
    id: 1,
    label: 'Validating chain connection',
  },
  {
    id: 2,
    label: 'Approving token spend',
  },
  {
    id: 3,
    label: 'Executing deposit transaction',
  },
  {
    id: 4,
    label: 'Confirming completion',
    expectedTimeInSeconds: ROFL_PAYMASTER_EXPECTED_TIME,
  },
  {
    id: 5,
    label: 'Validating chain connection',
  },
]

export function usePaymaster(
  targetToken: RoflPaymasterTokenConfig,
  additionalSteps: ProgressStepWithAction[]
): UsePaymasterTopUpFlowReturn {
  const { address } = useAccount()
  const { refetch: refetchSapphireNativeBalance } = useBalance({
    address,
    chainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id,
    query: { enabled: !!address },
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<bigint | null>(null)

  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [stepStatuses, setStepStatuses] = useState<Partial<Record<number, PaymasterStepStatus>>>({})

  const updateStep = useCallback((step: number, status: PaymasterStepStatus) => {
    setCurrentStep(step)
    setStepStatuses(prev => ({ ...prev, [step]: status }))
  }, [])

  const reset = useCallback(() => {
    setIsLoading(false)
    setError('')
    setQuote(null)
    setCurrentStep(null)
    setStepStatuses({})
  }, [])

  const { data: roseFeed } = useRosePriceFeed(
    ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG[ROFL_PAYMASTER_DESTINATION_CHAIN.id],
    ROFL_PAYMASTER_DESTINATION_CHAIN.id
  )
  const { data: tokenFeed } = useTokenPriceFeed(
    ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG[ROFL_PAYMASTER_DESTINATION_CHAIN.id],
    targetToken.contractAddress,
    ROFL_PAYMASTER_DESTINATION_CHAIN.id
  )
  const { data: roseFeedDecimals } = useAggregatorV3Decimals(
    roseFeed as Address,
    ROFL_PAYMASTER_DESTINATION_CHAIN.id
  )
  const { data: tokenFeedDecimals } = useAggregatorV3Decimals(
    tokenFeed as Address,
    ROFL_PAYMASTER_DESTINATION_CHAIN.id
  )

  const _getQuote = useCallback(
    async (
      roseAmount: bigint,
      chain: Chain,
      roseDecimals = ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN.decimals,
      slippagePercentage = ROFL_PAYMASTER_SLIPPAGE_PERCENTAGE
    ): Promise<bigint | null> => {
      if (chain.id !== ROFL_PAYMASTER_DESTINATION_CHAIN.id) {
        throw new Error('Invalid chain!')
      }
      if (!roseFeed || !tokenFeed || !roseFeedDecimals || !tokenFeedDecimals) {
        // Silently fail if the required data is not refreshed yet
        return null
      }

      const [roseUsdPrice, tokenUsdPrice] = await Promise.all([
        aggregatorV3LatestRoundData(roseFeed as Address, chain.id),
        aggregatorV3LatestRoundData(tokenFeed as Address, chain.id),
      ])

      if (roseUsdPrice <= 0n) throw new Error('Invalid ROSE price')
      if (tokenUsdPrice <= 0n) throw new Error('Invalid token price')

      const tokenDecimals = BigInt(targetToken.decimals)
      const roseTokenDecimals = BigInt(roseDecimals)

      const numerator = roseAmount * roseUsdPrice * 10n ** ((tokenDecimals + tokenFeedDecimals) as bigint)
      const denominator = tokenUsdPrice * 10n ** ((roseTokenDecimals + roseFeedDecimals) as bigint)

      const tokenAmount = ceilDiv(numerator, denominator)

      return ceilDiv(tokenAmount * (100n + slippagePercentage), 100n)
    },
    [roseFeed, tokenFeed, tokenFeedDecimals, roseFeedDecimals, targetToken.decimals]
  )

  const createDeposit = useCallback(
    (tokenContractAddress: Address, amount: bigint, recipient: Address, chainId: number) => {
      const roflPaymasterVaultContractAddress = ROFL_PAYMASTER_TOKEN_CONFIG[chainId].paymasterContractAddress

      return deposit(roflPaymasterVaultContractAddress, tokenContractAddress, amount, recipient, chainId)
    },
    []
  )

  const pollPayment = useCallback(async (paymentId: string, chain: Chain) => {
    throw new Error('Force manual check proof generation')

    if (chain.id !== ROFL_PAYMASTER_DESTINATION_CHAIN.id) {
      throw new Error('Invalid chain!')
    }
    if (!paymentId) {
      throw new Error('PaymentId is required!')
    }

    let attempts = 0
    const maxAttempts = 60

    while (attempts < maxAttempts) {
      try {
        const isProcessed = await isPaymentProcessed(
          ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG[chain.id],
          paymentId,
          chain.id
        )

        if (isProcessed) {
          return true
        }

        await new Promise(resolve => setTimeout(resolve, 4000))
        attempts++
      } catch (error) {
        console.error('Error checking payment processed:', error)
        await new Promise(resolve => setTimeout(resolve, 4000))
        attempts++
      }
    }

    console.warn('Payment processed polling timed out, but payment may still complete')
    return null
  }, [])

  const getQuote = useCallback(
    async ({ amount }: StartTopUpParams) => {
      setError('')
      setQuote(null)

      if (!address) throw new Error('Wallet not connected')

      setIsLoading(true)
      try {
        const q = await _getQuote(amount, ROFL_PAYMASTER_DESTINATION_CHAIN)
        setQuote(q)
        return q
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch quote'
        setError(msg)
        throw e
      } finally {
        setIsLoading(false)
      }
    },
    [address, _getQuote]
  )

  const waitForSapphireNativeBalanceIncrease = useCallback(
    async ({
      baseline,
      timeoutMs,
      intervalMs,
      minIncrease,
    }: {
      baseline: bigint
      timeoutMs: number
      intervalMs: number
      minIncrease: bigint
    }) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        const res = await refetchSapphireNativeBalance()
        const current = res.data?.value

        if (typeof current === 'bigint' && current >= baseline + minIncrease) return current

        await new Promise(resolve => setTimeout(resolve, intervalMs))
      }

      throw new Error('Payment likely processed, but Sapphire native balance did not increase in time')
    },
    [refetchSapphireNativeBalance]
  )

  const startTopUp = useCallback(
    async ({ amount }: StartTopUpParams) => {
      setError('')

      if (!address) throw new Error('Wallet not connected')

      const sourceChainConfig = ROFL_PAYMASTER_TOKEN_CONFIG[base.id]

      setIsLoading(true)
      setCurrentStep(1)
      try {
        // Snapshot baseline Sapphire native balance
        const baselineSapphireNative =
          (await refetchSapphireNativeBalance()).data?.value ??
          (() => {
            throw new Error('Failed to read Sapphire native balance')
          })()

        // Step 1: switch to source
        updateStep(1, 'processing')
        await switchToChain({ targetChainId: base.id, address })
        updateStep(1, 'completed')

        // Step 2: allowance
        updateStep(2, 'processing')
        await checkAndSetErc20Allowance(
          targetToken.contractAddress,
          sourceChainConfig.paymasterContractAddress,
          amount,
          address,
          base.id
        )
        updateStep(2, 'completed')

        // Step 3: create a deposit
        updateStep(3, 'processing')
        const { paymentId, paymentLogIndex, receipt } = await createDeposit(
          targetToken.contractAddress,
          amount,
          address,
          base.id
        )
        updateStep(3, 'completed')

        // Step 4: poll
        updateStep(4, 'processing')
        try {
        await pollPayment(paymentId!, ROFL_PAYMASTER_DESTINATION_CHAIN)

        await waitForSapphireNativeBalanceIncrease({
          baseline: baselineSapphireNative,
          timeoutMs: 3 * 60_000,
          intervalMs: 4_000,
          minIncrease: 1n,
        })
        } catch (ex) {
          console.error('Error polling payment:', ex)
          console.warn('Trying to generate manual proof')

          const sourcePublicClient = getPublicClient(
            {
              ...config,
              transport: fallback([
                http('https://mainnet.base.org'),
                http('https://base-rpc.publicnode.com'),
                http('https://base.llamarpc.com'),
              ]),
            },
            { chainId: base.id }
          )!

          await generateAndSubmitManualProof(
            receipt,
            paymentLogIndex,
            sourcePublicClient,
            ROFL_PAYMASTER_DESTINATION_CHAIN.id,
            ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG[ROFL_PAYMASTER_DESTINATION_CHAIN.id]
          )
        }
        updateStep(4, 'completed')

        // Step 5: switch to destination
        updateStep(5, 'processing')
        await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
        updateStep(5, 'completed')

        // Additional steps
        for (let i = 0; i < additionalSteps.length; i++) {
          updateStep(i + 6, 'processing')
          await additionalSteps[i].action()
          updateStep(i + 6, 'completed')
        }

        setCurrentStep(null)
        return { paymentId }
      } catch (e) {
        const msg = e instanceof Error ? (e as BaseError).shortMessage || e.message : 'Top up failed'
        setError(msg)

        if (currentStep) {
          setStepStatuses(prev => ({ ...prev, [currentStep]: 'error' }))
        }

        setCurrentStep(null)
        throw e
      } finally {
        setIsLoading(false)
        setCurrentStep(null)

        await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
      }
    },
    [
      address,
      createDeposit,
      currentStep,
      pollPayment,
      updateStep,
      targetToken.contractAddress,
      additionalSteps,
      refetchSapphireNativeBalance,
      waitForSapphireNativeBalanceIncrease,
    ]
  )

  return {
    isLoading,
    error,
    quote,
    currentStep: currentStep
      ? currentStep <= progressSteps.length
        ? progressSteps[currentStep - 1]
        : additionalSteps[currentStep - 1 - progressSteps.length]
      : null,
    stepStatuses,
    getQuote,
    startTopUp,
    reset,
    initialLoading: !(!!roseFeed && !!tokenFeed && !!roseFeedDecimals && !!tokenFeedDecimals),
  }
}
