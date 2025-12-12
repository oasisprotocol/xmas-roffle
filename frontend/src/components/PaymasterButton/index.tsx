import { FC, ReactNode, useEffect, useState } from 'react'
import { usePaymaster } from '../../hooks/usePaymaster.ts'
import { base } from 'wagmi/chains'
import { formatUnits } from 'viem'
import {
  ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN,
  ROFL_PAYMASTER_TOKEN_CONFIG,
} from '../../constants/rofl-paymaster-config.ts'
import { Loader } from 'lucide-react'

interface Props {
  roseAmountInBaseUnits: bigint
  children: ({ amountLabel }: { amountLabel: string }) => ReactNode
}

const tokenMeta = ROFL_PAYMASTER_TOKEN_CONFIG[base.id].TOKENS[0]

export const TopUpButton: FC<Props> = ({
  roseAmountInBaseUnits = 100n * 10n ** BigInt(ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN.decimals),
  children,
}) => {
  const [quote, setQuote] = useState<bigint | null>(null)
  const { isLoading, error, currentStep, getQuote, startTopUp } = usePaymaster()

  useEffect(() => {
    const _init = async () => {
      setQuote(
        await getQuote({
          amount: roseAmountInBaseUnits!,
        })
      )
    }

    _init()
  }, [roseAmountInBaseUnits])

  return (
    <>
      {quote && (
        <button
          className="bg-white hover:bg-gray-100 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full disabled:bg-[linear-gradient(0deg,rgba(0,0,0,0.5)_0%,rgba(0,0,0,0.5)_100%),linear-gradient(#fff,#fff)]"
          disabled={isLoading}
          onClick={async () => {
            await startTopUp({
              amount: quote,
            })
          }}
        >
          <p className="font-medium leading-[20px] text-[16px] text-black text-center">
            {isLoading && !error ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              children({ amountLabel: `${formatUnits(quote, tokenMeta.decimals)} $${tokenMeta.symbol}` })
            )}
          </p>
        </button>
      )}

      {isLoading && !!quote && (
        <div className="self-stretch text-center justify-start text-teal-300 text-base font-normal font-['Geist'] leading-4">
          ({currentStep?.id}/5) {currentStep?.label}
        </div>
      )}

      {!isLoading && error && (
        <p className="self-stretch text-center justify-start text-red-600 text-base font-normal font-['Geist'] leading-4 break-words">
          {error.length > 150 ? `${error.slice(0, 150)}...` : error}
        </p>
      )}
    </>
  )
}
