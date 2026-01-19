import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BaseError, useAccount, useBalance } from 'wagmi'
import { checkAndSetErc20Allowance, switchToChain } from '../contracts/erc-20'
import { Address, Chain } from 'viem'
import { deposit } from '../contracts/paymasterVault.ts'
import {
  clearPendingTransaction,
  getPendingTransaction,
  isPendingTransactionExpired,
  PendingTransaction,
  savePendingTransaction,
} from '../lib/pendingTransaction.ts'
import { getTransactions, saveTransaction, updateTransactionStatus } from '../lib/transactionHistory.ts'
import {
  getChainName,
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

export type PaymasterStepStatus = 'pending' | 'processing' | 'completed' | 'error'

export type ProgressStep = {
  id: number
  label: string
  expectedTimeInSeconds?: number
}

export type ProgressStepWithAction = ProgressStep & {
  action: (signal?: AbortSignal) => Promise<void>
}

export type StartTopUpParams = {
  amount: bigint
}

/** Data populated on successful bridge completion for the success modal */
export type BridgeSuccessData = {
  paymentId: string
  /** Transaction hash on the source chain (Base, Arbitrum, or Ethereum) */
  sourceTxHash: string
  /** Chain ID where the deposit was made */
  sourceChainId: number
  amount: string
  tokenSymbol: string
}

export type UsePaymasterTopUpFlowReturn = {
  isLoading: boolean
  initialLoading: boolean
  error: string
  quote: bigint | null
  roseEstimate: bigint | null

  currentStep: ProgressStep | ProgressStepWithAction | null
  stepStatuses: Partial<Record<number, PaymasterStepStatus>>

  // Recovery support
  pendingTransaction: PendingTransaction | null
  resumeFromPending: () => Promise<{ paymentId: string | null }>
  dismissPending: () => void

  // Success state for modal display
  successData: BridgeSuccessData | null
  clearSuccess: () => void

  getQuote: (p: StartTopUpParams) => Promise<bigint | null>
  getRoseEstimate: (p: StartTopUpParams) => Promise<bigint | null>
  startTopUp: (p: StartTopUpParams) => Promise<{ paymentId: string | null }>
  reset: () => void
  cancel: () => void
}

function ceilDiv(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error('Division by zero')
  return (n + d - 1n) / d
}

// Polling configuration
const POLL_INTERVAL_MS = 4_000
const POLL_MAX_ATTEMPTS = 60
const BALANCE_CHECK_TIMEOUT_MS = 3 * 60_000

// Minimum balance increase threshold (0.001 ROSE = 1e15 wei)
// Prevents false positives from dust transfers or staking rewards
const MIN_BALANCE_INCREASE_THRESHOLD = 1_000_000_000_000_000n

/** Generate progress steps with dynamic chain name */
function createProgressSteps(sourceChainName: string): ProgressStep[] {
  return [
    {
      id: 1,
      label: `Connecting to ${sourceChainName}`,
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
      label: 'Connecting to Sapphire',
    },
  ]
}

/** Number of built-in progress steps in the paymaster flow */
export const PROGRESS_STEP_COUNT = 5

export function usePaymaster(
  targetToken: RoflPaymasterTokenConfig,
  sourceChainId: number,
  additionalSteps: ProgressStepWithAction[]
): UsePaymasterTopUpFlowReturn {
  // Generate progress steps with dynamic chain name
  const progressSteps = useMemo(() => createProgressSteps(getChainName(sourceChainId)), [sourceChainId])
  const { address } = useAccount()
  const { refetch: refetchSapphireNativeBalance } = useBalance({
    address,
    chainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id,
    query: { enabled: !!address },
  })

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [quote, setQuote] = useState<bigint | null>(null)
  const [roseEstimate, setRoseEstimate] = useState<bigint | null>(null)

  const [currentStep, setCurrentStep] = useState<number | null>(null)
  const [stepStatuses, setStepStatuses] = useState<Partial<Record<number, PaymasterStepStatus>>>({})

  // Recovery state for interrupted transactions
  const [pendingTransaction, setPendingTransaction] = useState<PendingTransaction | null>(null)

  // Success state for displaying the success modal after bridge completion
  const [successData, setSuccessData] = useState<BridgeSuccessData | null>(null)

  // Track current step synchronously for error handling (avoids stale closure in callbacks)
  const currentStepRef = useRef<number | null>(null)

  // Guard against concurrent execution (double-click protection)
  const isLoadingRef = useRef(false)

  // AbortController for cancellation support
  const abortControllerRef = useRef<AbortController | null>(null)

  const updateStep = useCallback((step: number, status: PaymasterStepStatus) => {
    currentStepRef.current = step
    setCurrentStep(step)
    setStepStatuses(prev => ({ ...prev, [step]: status }))
  }, [])

  const reset = useCallback(() => {
    // Cancel any in-flight operations
    abortControllerRef.current?.abort()
    abortControllerRef.current = null

    isLoadingRef.current = false
    currentStepRef.current = null
    setIsLoading(false)
    setError('')
    setQuote(null)
    setRoseEstimate(null)
    setCurrentStep(null)
    setStepStatuses({})
    // Also clear any pending transaction
    clearPendingTransaction()
    setPendingTransaction(null)
  }, [])

  const cancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const clearSuccess = useCallback(() => {
    setSuccessData(null)
  }, [])

  // Cleanup on unmount - abort any in-flight operations
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  // Check for pending transaction on mount (recovery support)
  useEffect(() => {
    if (!address) return

    const pending = getPendingTransaction()
    if (!pending) return

    // Clear if different user or expired
    if (pending.userAddress.toLowerCase() !== address.toLowerCase() || isPendingTransactionExpired(pending)) {
      clearPendingTransaction()
      setPendingTransaction(null)
      return
    }

    // If it's for a different token or chain, don't show but keep in storage
    // User can recover when they select the correct token and chain
    if (
      pending.tokenAddress.toLowerCase() !== targetToken.contractAddress.toLowerCase() ||
      pending.sourceChainId !== sourceChainId
    ) {
      setPendingTransaction(null)
      return
    }

    setPendingTransaction(pending)
  }, [address, targetToken.contractAddress, sourceChainId])

  const dismissPending = useCallback(() => {
    clearPendingTransaction()
    setPendingTransaction(null)
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
      if (
        roseFeed === undefined ||
        tokenFeed === undefined ||
        roseFeedDecimals === undefined ||
        tokenFeedDecimals === undefined
      ) {
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

  /**
   * Inverse of _getQuote: given token amount, estimate ROSE the user will receive.
   * Applies slippage by subtracting (user receives less due to slippage).
   */
  const _getRoseEstimate = useCallback(
    async (
      tokenAmount: bigint,
      chain: Chain,
      roseDecimals = ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN.decimals,
      slippagePercentage = ROFL_PAYMASTER_SLIPPAGE_PERCENTAGE
    ): Promise<bigint | null> => {
      if (chain.id !== ROFL_PAYMASTER_DESTINATION_CHAIN.id) {
        throw new Error('Invalid chain!')
      }
      if (
        roseFeed === undefined ||
        tokenFeed === undefined ||
        roseFeedDecimals === undefined ||
        tokenFeedDecimals === undefined
      ) {
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

      // Inverse formula: roseAmount = (tokenAmount * tokenUsdPrice * 10^(roseDecimals + roseFeedDecimals)) /
      //                               (roseUsdPrice * 10^(tokenDecimals + tokenFeedDecimals))
      const numerator =
        tokenAmount * tokenUsdPrice * 10n ** ((roseTokenDecimals + roseFeedDecimals) as bigint)
      const denominator = roseUsdPrice * 10n ** ((tokenDecimals + tokenFeedDecimals) as bigint)

      const roseAmount = numerator / denominator

      // Apply slippage by subtracting (user receives less)
      return (roseAmount * (100n - slippagePercentage)) / 100n
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

  const pollPayment = useCallback(async (paymentId: string, chain: Chain, signal?: AbortSignal) => {
    if (chain.id !== ROFL_PAYMASTER_DESTINATION_CHAIN.id) {
      throw new Error('Invalid chain!')
    }
    if (!paymentId) {
      throw new Error('PaymentId is required!')
    }

    let attempts = 0

    while (attempts < POLL_MAX_ATTEMPTS) {
      if (signal?.aborted) {
        throw new Error('Payment polling cancelled')
      }

      try {
        const isProcessed = await isPaymentProcessed(
          ROFL_PAYMASTER_SAPPHIRE_CONTRACT_CONFIG[chain.id],
          paymentId,
          chain.id
        )

        if (isProcessed) {
          return true
        }

        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, POLL_INTERVAL_MS)
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timeoutId)
              reject(new Error('Payment polling cancelled'))
            },
            { once: true }
          ) // Prevent memory leak
        })
        attempts++
      } catch (error) {
        if (signal?.aborted) {
          throw new Error('Payment polling cancelled')
        }
        console.error('Error checking payment processed:', error)
        // Cancellable delay in catch block
        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, POLL_INTERVAL_MS)
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timeoutId)
              reject(new Error('Payment polling cancelled'))
            },
            { once: true }
          )
        })
        attempts++
      }
    }

    throw new Error('Payment confirmation timed out. Your funds may still arrive - check your wallet.')
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

  const getRoseEstimate = useCallback(
    async ({ amount }: StartTopUpParams) => {
      setError('')
      setRoseEstimate(null)

      if (!address) throw new Error('Wallet not connected')

      setIsLoading(true)
      try {
        const estimate = await _getRoseEstimate(amount, ROFL_PAYMASTER_DESTINATION_CHAIN)
        setRoseEstimate(estimate)
        return estimate
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to fetch estimate'
        setError(msg)
        throw e
      } finally {
        setIsLoading(false)
      }
    },
    [address, _getRoseEstimate]
  )

  const waitForSapphireNativeBalanceIncrease = useCallback(
    async ({
      baseline,
      timeoutMs,
      intervalMs,
      minIncrease,
      signal,
    }: {
      baseline: bigint
      timeoutMs: number
      intervalMs: number
      minIncrease: bigint
      signal?: AbortSignal
    }) => {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeoutMs) {
        // Check for cancellation
        if (signal?.aborted) {
          throw new Error('Balance check cancelled')
        }

        const res = await refetchSapphireNativeBalance()
        const current = res.data?.value

        if (typeof current === 'bigint' && current >= baseline + minIncrease) return current

        await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(resolve, intervalMs)
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(timeoutId)
              reject(new Error('Balance check cancelled'))
            },
            { once: true }
          ) // Prevent memory leak
        })
      }

      throw new Error('Payment likely processed, but Sapphire native balance did not increase in time')
    },
    [refetchSapphireNativeBalance]
  )

  /**
   * Resume a pending transaction from step 4 (polling for payment confirmation).
   * Used for recovery after user closes tab during the bridge flow.
   */
  const resumeFromPending = useCallback(async () => {
    if (!pendingTransaction) {
      throw new Error('No pending transaction to resume')
    }
    if (!address) {
      throw new Error('Wallet not connected')
    }
    if (isLoadingRef.current) {
      throw new Error('Operation already in progress')
    }

    isLoadingRef.current = true
    setIsLoading(true)
    setError('')

    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    const paymentId = pendingTransaction.paymentId

    try {
      // Snapshot baseline Sapphire native balance
      const baselineSapphireNative =
        (await refetchSapphireNativeBalance()).data?.value ??
        (() => {
          throw new Error('Failed to read Sapphire native balance')
        })()

      // Resume from step 4: poll for payment confirmation
      updateStep(4, 'processing')
      updateTransactionStatus(paymentId, 'processing')
      await pollPayment(paymentId, ROFL_PAYMASTER_DESTINATION_CHAIN, signal)

      await waitForSapphireNativeBalanceIncrease({
        baseline: baselineSapphireNative,
        timeoutMs: BALANCE_CHECK_TIMEOUT_MS,
        intervalMs: POLL_INTERVAL_MS,
        minIncrease: MIN_BALANCE_INCREASE_THRESHOLD,
        signal,
      })
      updateStep(4, 'completed')

      // Step 5: switch to destination
      updateStep(5, 'processing')
      await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
      updateStep(5, 'completed')

      // Execute additional steps
      for (let i = 0; i < additionalSteps.length; i++) {
        if (signal.aborted) throw new Error('Operation cancelled')
        updateStep(i + 6, 'processing')
        try {
          await additionalSteps[i].action(signal)
        } catch (e) {
          const stepLabel = additionalSteps[i].label
          throw new Error(`Step "${stepLabel}" failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
        }
        updateStep(i + 6, 'completed')
      }

      // Clear pending transaction on success
      clearPendingTransaction()
      setPendingTransaction(null)

      updateTransactionStatus(paymentId, 'completed')

      // Set success data for the success modal
      // Look up sourceTxHash from transaction history (saved when deposit was created)
      const transactions = getTransactions(address)
      const txRecord = transactions.find(tx => tx.paymentId === paymentId)
      if (txRecord?.txHash) {
        setSuccessData({
          paymentId,
          sourceTxHash: txRecord.txHash,
          sourceChainId: pendingTransaction.sourceChainId,
          amount: pendingTransaction.amount,
          tokenSymbol: pendingTransaction.tokenSymbol,
        })
      } else if (txRecord) {
        console.warn('[usePaymaster] Transaction record missing txHash:', paymentId)
      }

      return { paymentId }
    } catch (e) {
      const msg = e instanceof Error ? (e as BaseError).shortMessage || e.message : 'Recovery failed'
      setError(`${msg}. Your deposit (ID: ${paymentId}) was submitted - funds may still arrive.`)

      updateTransactionStatus(paymentId, 'failed')

      const failedStep = currentStepRef.current
      if (failedStep) {
        setStepStatuses(prev => ({ ...prev, [failedStep]: 'error' }))
      }

      throw e
    } finally {
      isLoadingRef.current = false
      currentStepRef.current = null
      setIsLoading(false)
      abortControllerRef.current = null
    }
  }, [
    pendingTransaction,
    address,
    updateStep,
    pollPayment,
    refetchSapphireNativeBalance,
    waitForSapphireNativeBalanceIncrease,
    additionalSteps,
  ])

  const startTopUp = useCallback(
    async ({ amount }: StartTopUpParams) => {
      // Guard against concurrent execution (atomic check-and-set)
      if (isLoadingRef.current) {
        throw new Error('Operation already in progress')
      }
      isLoadingRef.current = true

      setError('')
      // Clear any previous success state before starting new bridge
      setSuccessData(null)

      if (!address) {
        isLoadingRef.current = false
        throw new Error('Wallet not connected')
      }

      const sourceChainConfig = ROFL_PAYMASTER_TOKEN_CONFIG[sourceChainId]
      if (!sourceChainConfig) {
        isLoadingRef.current = false
        throw new Error(`Unsupported source chain: ${sourceChainId}`)
      }

      // Abort any lingering operation before creating new controller
      abortControllerRef.current?.abort()
      abortControllerRef.current = new AbortController()
      const signal = abortControllerRef.current.signal

      setIsLoading(true)

      // Track whether deposit was committed (for error handling)
      let depositCommitted = false
      let paymentId: string | null = null
      let sourceTxHash: string | null = null

      try {
        // Step 1: switch to source chain
        updateStep(1, 'processing')

        // Snapshot baseline Sapphire native balance
        const baselineSapphireNative =
          (await refetchSapphireNativeBalance()).data?.value ??
          (() => {
            throw new Error('Failed to read Sapphire native balance')
          })()
        await switchToChain({ targetChainId: sourceChainId, address })
        updateStep(1, 'completed')

        // Check for cancellation before user interaction
        if (signal.aborted) throw new Error('Operation cancelled')

        // Step 2: allowance
        updateStep(2, 'processing')
        await checkAndSetErc20Allowance(
          targetToken.contractAddress,
          sourceChainConfig.paymasterContractAddress,
          amount,
          address,
          sourceChainId
        )
        updateStep(2, 'completed')

        if (signal.aborted) throw new Error('Operation cancelled')

        // Step 3: create a deposit
        updateStep(3, 'processing')
        const depositResult = await createDeposit(targetToken.contractAddress, amount, address, sourceChainId)

        if (!depositResult.paymentId) {
          const txHash = depositResult.hash
          throw new Error(
            txHash
              ? `Deposit succeeded but no payment ID returned. Please contact support with tx: ${txHash}`
              : 'Deposit succeeded but no payment ID returned. Please contact support.'
          )
        }
        paymentId = depositResult.paymentId
        sourceTxHash = depositResult.hash
        depositCommitted = true // Funds are now committed on-chain

        saveTransaction({
          paymentId,
          timestamp: Date.now(),
          amount: amount.toString(),
          decimals: targetToken.decimals,
          tokenSymbol: targetToken.symbol,
          tokenAddress: targetToken.contractAddress,
          userAddress: address,
          status: 'processing',
          txHash: depositResult.hash,
          sourceChainId,
        })

        // Save pending transaction for recovery if user closes tab during polling
        savePendingTransaction({
          paymentId,
          timestamp: Date.now(),
          amount: amount.toString(),
          tokenSymbol: targetToken.symbol,
          tokenAddress: targetToken.contractAddress,
          userAddress: address,
          roseAmount: '0', // We don't know exact ROSE amount until processed
          sourceChainId,
        })

        updateStep(3, 'completed')

        // Step 4: poll (with cancellation support)
        updateStep(4, 'processing')
        await pollPayment(paymentId, ROFL_PAYMASTER_DESTINATION_CHAIN, signal)

        await waitForSapphireNativeBalanceIncrease({
          baseline: baselineSapphireNative,
          timeoutMs: BALANCE_CHECK_TIMEOUT_MS,
          intervalMs: POLL_INTERVAL_MS,
          minIncrease: MIN_BALANCE_INCREASE_THRESHOLD,
          signal,
        })
        updateStep(4, 'completed')

        // Step 5: switch to destination
        updateStep(5, 'processing')
        await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
        updateStep(5, 'completed')

        // Additional steps (with cancellation support)
        for (let i = 0; i < additionalSteps.length; i++) {
          if (signal.aborted) throw new Error('Operation cancelled')
          updateStep(i + 6, 'processing')
          try {
            await additionalSteps[i].action(signal)
          } catch (e) {
            // Provide context about which step failed
            const stepLabel = additionalSteps[i].label
            throw new Error(`Step "${stepLabel}" failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
          }
          updateStep(i + 6, 'completed')
        }

        // Clear pending transaction on success
        clearPendingTransaction()
        setPendingTransaction(null)

        if (paymentId) updateTransactionStatus(paymentId, 'completed')

        // Set success data for the success modal
        if (paymentId && sourceTxHash) {
          setSuccessData({
            paymentId,
            sourceTxHash: sourceTxHash,
            sourceChainId,
            amount: amount.toString(),
            tokenSymbol: targetToken.symbol,
          })
        }

        return { paymentId }
      } catch (e) {
        const msg = e instanceof Error ? (e as BaseError).shortMessage || e.message : 'Top up failed'

        // If deposit was committed, provide different error messaging
        if (depositCommitted && paymentId) {
          updateTransactionStatus(paymentId, 'failed')
          setError(`${msg}. Your deposit (ID: ${paymentId}) was submitted - funds may still arrive.`)
        } else {
          setError(msg)
        }

        const failedStep = currentStepRef.current
        if (failedStep) {
          setStepStatuses(prev => ({ ...prev, [failedStep]: 'error' }))
        }

        throw e
      } finally {
        isLoadingRef.current = false
        currentStepRef.current = null
        setIsLoading(false)
        // Note: currentStepRef (ref) is cleared above, but currentStep (state) is preserved
        // so users can see which step failed. State resets only via reset() or on success.
        abortControllerRef.current = null

        try {
          await switchToChain({ targetChainId: ROFL_PAYMASTER_DESTINATION_CHAIN.id, address })
        } catch {
          // Best-effort chain switch - don't mask the original error
          console.warn('Failed to switch back to destination chain')
        }
      }
    },
    [
      address,
      createDeposit,
      pollPayment,
      updateStep,
      targetToken.contractAddress,
      targetToken.symbol,
      targetToken.decimals,
      sourceChainId,
      additionalSteps,
      refetchSapphireNativeBalance,
      waitForSapphireNativeBalanceIncrease,
    ]
  )

  return {
    isLoading,
    error,
    quote,
    roseEstimate,
    currentStep: currentStep
      ? currentStep <= progressSteps.length
        ? progressSteps[currentStep - 1]
        : additionalSteps[currentStep - 1 - progressSteps.length]
      : null,
    stepStatuses,
    // Recovery support
    pendingTransaction,
    resumeFromPending,
    dismissPending,
    // Success state
    successData,
    clearSuccess,
    getQuote,
    getRoseEstimate,
    startTopUp,
    reset,
    cancel,
    initialLoading:
      roseFeed === undefined ||
      tokenFeed === undefined ||
      roseFeedDecimals === undefined ||
      tokenFeedDecimals === undefined,
  }
}
