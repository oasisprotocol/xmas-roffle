import { FC, ReactNode, useEffect, useState } from 'react'
import { PROGRESS_STEP_COUNT, ProgressStepWithAction, usePaymaster } from '../../hooks/usePaymaster.ts'
import { formatUnits } from 'viem'
import { RoflPaymasterTokenConfig } from '../../constants/rofl-paymaster-config.ts'
import { LucideLoader } from 'lucide-react'
import { useAccount, useBalance } from 'wagmi'
import { base } from 'wagmi/chains'
import { useCountdownTimer } from '../../hooks/useCountdownTimer.ts'

interface Props {
  roseAmountInBaseUnits: bigint
  targetToken: RoflPaymasterTokenConfig
  /** Source chain ID where tokens will be deposited from (defaults to Base) */
  sourceChainId?: number
  children: ({ amountLabel }: { amountLabel: string }) => ReactNode
  additionalSteps: ProgressStepWithAction[]
  onSuccess?: () => void
  onLoadingChange?: (isLoading: boolean) => void
}

export const TopUpButton: FC<Props> = ({
  roseAmountInBaseUnits,
  targetToken,
  sourceChainId = base.id,
  children,
  additionalSteps = [],
  onSuccess,
  onLoadingChange,
}) => {
  const { address } = useAccount()

  const { data: tokenBalance } = useBalance({
    address,
    token: targetToken.contractAddress,
    chainId: sourceChainId,
  })

  const [quote, setQuote] = useState<bigint | null>(null)
  const [showFullError, setShowFullError] = useState(false)
  const { isLoading, initialLoading, error, currentStep, getQuote, startTopUp } = usePaymaster(
    targetToken,
    sourceChainId,
    additionalSteps
  )

  const countdown = useCountdownTimer({
    initialTimeInSeconds: currentStep?.expectedTimeInSeconds || 0,
  })

  useEffect(() => {
    const _init = async () => {
      setQuote(
        await getQuote({
          amount: roseAmountInBaseUnits!,
        })
      )
    }

    if (!initialLoading && targetToken) {
      _init()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Ignore getQuote
  }, [roseAmountInBaseUnits, initialLoading, targetToken])

  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [onLoadingChange, isLoading])

  // Reset error expansion when error changes
  useEffect(() => {
    setShowFullError(false)
  }, [error])

  useEffect(() => {
    const expected = currentStep?.expectedTimeInSeconds ?? 0

    if (isLoading && currentStep && expected > 0) {
      countdown.reset()
      countdown.start()
      return
    }

    countdown.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ignore countdown methods
  }, [isLoading, currentStep?.id, currentStep?.expectedTimeInSeconds])

  if (initialLoading || !quote || !tokenBalance)
    return (
      <div className="flex justify-center">
        <LucideLoader className="animate-spin" />
      </div>
    )

  const insufficientBalance = tokenBalance.value < quote

  return (
    <>
      {!!quote && (
        <button
          className="bg-white hover:bg-gray-100 disabled:bg-gray-500 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
          disabled={isLoading || insufficientBalance}
          onClick={async () => {
            await startTopUp({
              amount: quote,
            })

            onSuccess?.()
          }}
        >
          <p className="font-medium leading-[20px] text-[16px] text-black text-center">
            {isLoading && !error ? (
              <LucideLoader className="animate-spin" />
            ) : (
              children({ amountLabel: `${formatUnits(quote, targetToken.decimals)} $${targetToken.symbol}` })
            )}
          </p>
        </button>
      )}

      {isLoading && !!quote && currentStep && (
        <div className="text-center break-words">
          <p className="text-teal-300">
            ({currentStep?.id}/{PROGRESS_STEP_COUNT + additionalSteps.length}) {currentStep?.label}
          </p>

          {!!currentStep.expectedTimeInSeconds && currentStep.expectedTimeInSeconds > 0 && (
            <div className={`text-xs mt-1 ${countdown.isNegative ? 'text-warning' : 'text-teal-200/80'}`}>
              {countdown.isNegative
                ? `Est. time reached. Overdue by ${countdown.formattedTime.replace('-', '')}`
                : `Est. time left: ${countdown.formattedTime}`}
            </div>
          )}
        </div>
      )}

      {((!isLoading && error) || insufficientBalance) && (
        <div className="text-warning text-center break-words">
          {insufficientBalance && <p>Insufficient ${targetToken.symbol} balance</p>}
          {error && (
            <div>
              <p>{showFullError || error.length <= 150 ? error : `${error.slice(0, 150)}...`}</p>
              {error.length > 150 && (
                <button
                  type="button"
                  onClick={() => setShowFullError(prev => !prev)}
                  className="text-teal-300 underline text-sm mt-1"
                >
                  {showFullError ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
