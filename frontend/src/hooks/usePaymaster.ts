import { useCallback, useState } from 'react'
import { useAccount } from 'wagmi'
import { checkAndSetErc20Allowance, switchToChain } from '../contracts/erc-20'
import { Address, Chain } from 'viem'
import { base } from 'wagmi/chains'
import { deposit } from '../contracts/paymasterVault.ts'
import {
  ROFL_PAYMASTER_DESTINATION_CHAIN,
  ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN,
  ROFL_PAYMASTER_EXPECTED_TIME,
  ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG,
  ROFL_PAYMASTER_TOKEN_CONFIG,
} from '../constants/rofl-paymaster-config.ts'
import { isPaymentProcessed, useRosePriceFeed, useTokenPriceFeed } from '../contracts/crossChainPaymaster.ts'
import { aggregatorV3LatestRoundData, useAggregatorV3Decimals } from '../contracts/AggregatorV3.ts'

export type PaymasterStepStatus = 'pending' | 'processing' | 'completed' | 'error'

export type ProgressStep = {
  id: number
  label: string
  expectedTimeInSeconds?: number
}

export type StartTopUpParams = {
  amount: bigint
}

export type UsePaymasterTopUpFlowReturn = {
  isLoading: boolean
  error: string
  quote: bigint | null

  currentStep: ProgressStep | null
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

export function usePaymaster(): UsePaymasterTopUpFlowReturn {
  const { address } = useAccount()

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
    ROFL_PAYMASTER_TOKEN_CONFIG[base.id].TOKENS[0].contractAddress,
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
      slippageBps = 2000n
    ): Promise<bigint | null> => {
      if (chain.id !== ROFL_PAYMASTER_DESTINATION_CHAIN.id) {
        throw new Error('Invalid chain!')
      }
      if (!roseFeed || !tokenFeed || !roseFeedDecimals || !tokenFeedDecimals) {
        // Silently fail if the required data is not refreshed yet
        return null
      }

      const sourceChainConfig = ROFL_PAYMASTER_TOKEN_CONFIG[base.id]
      const tokenMeta = sourceChainConfig.TOKENS[0]

      const [roseUsdPrice, tokenUsdPrice] = await Promise.all([
        aggregatorV3LatestRoundData(roseFeed as Address, chain.id),
        aggregatorV3LatestRoundData(tokenFeed as Address, chain.id),
      ])

      if (roseUsdPrice <= 0n) throw new Error('Invalid ROSE price')
      if (tokenUsdPrice <= 0n) throw new Error('Invalid token price')

      const tokenDecimals = BigInt(tokenMeta.decimals)
      const roseTokenDecimals = BigInt(roseDecimals)

      const numerator = roseAmount * roseUsdPrice * 10n ** ((tokenDecimals + tokenFeedDecimals) as bigint)
      const denominator = tokenUsdPrice * 10n ** ((roseTokenDecimals + roseFeedDecimals) as bigint)

      const tokenAmount = ceilDiv(numerator, denominator)

      // Add 2%(slippageBps=2000n) slippage
      return ceilDiv(tokenAmount * (100_000n + slippageBps), 100_000n)
    },
    [roseFeed, tokenFeed, tokenFeedDecimals, roseFeedDecimals]
  )

  const createDeposit = useCallback(
    (tokenContractAddress: Address, amount: bigint, recipient: Address, chainId: number) => {
      const roflPaymasterVaultContractAddress = ROFL_PAYMASTER_TOKEN_CONFIG[chainId].paymasterContractAddress

      return deposit(roflPaymasterVaultContractAddress, tokenContractAddress, amount, recipient, chainId)
    },
    []
  )

  const pollPayment = useCallback(async (paymentId: string, chain: Chain) => {
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

  const getQuote = async ({ amount }: StartTopUpParams) => {
    setError('')
    setQuote(null)

    if (!address) throw new Error('Wallet not connected')

    setIsLoading(true)
    try {
      const maxAttempts = 20

      let attempts = 0
      while ((!roseFeed || !tokenFeed || !roseFeedDecimals || !tokenFeedDecimals) && attempts < maxAttempts) {
        await new Promise<void>(resolve => setTimeout(resolve, 150))
        attempts++
      }

      if (!roseFeed || !tokenFeed || !roseFeedDecimals || !tokenFeedDecimals) {
        throw new Error('Price feed data not ready yet. Please try again.')
      }

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
  }

  const startTopUp = useCallback(
    async ({ amount }: StartTopUpParams) => {
      setError('')

      if (!address) throw new Error('Wallet not connected')

      const sourceChainConfig = ROFL_PAYMASTER_TOKEN_CONFIG[base.id]
      const tokenMeta = sourceChainConfig.TOKENS[0]

      setIsLoading(true)
      setCurrentStep(1)
      try {
        // Step 1: switch to source
        updateStep(1, 'processing')
        await switchToChain({ targetChainId: base.id, address })
        updateStep(1, 'completed')

        // Step 2: allowance
        updateStep(2, 'processing')
        await checkAndSetErc20Allowance(
          tokenMeta.contractAddress,
          sourceChainConfig.paymasterContractAddress,
          amount,
          address
        )
        updateStep(2, 'completed')

        // Step 3: create a deposit
        updateStep(3, 'processing')
        const { paymentId } = await createDeposit(tokenMeta.contractAddress, amount, address, base.id)
        updateStep(3, 'completed')

        // Step 4: poll
        updateStep(4, 'processing')
        await pollPayment(paymentId!, ROFL_PAYMASTER_DESTINATION_CHAIN)
        updateStep(4, 'completed')

        // Step 1: switch to destination
        updateStep(5, 'processing')
        await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
        updateStep(5, 'completed')

        setCurrentStep(null)
        return { paymentId }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Top up failed'
        setError(msg)

        if (currentStep) {
          setStepStatuses(prev => ({ ...prev, [currentStep]: 'error' }))
        }

        setCurrentStep(null)
        throw e
      } finally {
        await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
        setIsLoading(false)
      }
    },
    [address, createDeposit, currentStep, pollPayment, updateStep]
  )

  return {
    isLoading,
    error,
    quote,
    currentStep: currentStep ? progressSteps[currentStep] : null,
    stepStatuses,
    getQuote,
    startTopUp,
    reset,
  }
}
