import { ReactNode, useMemo, useId } from 'react'
import { base, arbitrum, mainnet } from 'wagmi/chains'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu'
import { cn } from '../../lib/utils'
import { BaseIcon } from '../icons/BaseIcon'
import { ArbitrumIcon } from '../icons/ArbitrumIcon'
import { EthereumIcon } from '../icons/EthereumIcon'
import { SUPPORTED_SOURCE_CHAINS } from '../../constants/rofl-paymaster-config'

export interface ChainOption {
  id: number
  name: string
  icon: ReactNode
}

/** Get chain icon by chain ID. Returns null for unknown chains. */
export function getChainIcon(chainId: number, size = 20): ReactNode {
  switch (chainId) {
    case base.id:
      return <BaseIcon size={size} />
    case arbitrum.id:
      return <ArbitrumIcon size={size} />
    case mainnet.id:
      return <EthereumIcon size={size} />
    default:
      // Log warning in development to catch missing icons early
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[ChainSelector] No icon for chain ID: ${chainId}`)
      }
      return null
  }
}

/** Default chain options derived from SUPPORTED_SOURCE_CHAINS config */
export const DEFAULT_CHAIN_OPTIONS: ChainOption[] = SUPPORTED_SOURCE_CHAINS.map(chain => ({
  id: chain.id,
  name: chain.name,
  icon: getChainIcon(chain.id, 20),
}))

interface ChainSelectorProps {
  /** Currently selected chain ID */
  value: number
  /** Available chain options */
  options?: ChainOption[]
  /** Called when user selects a different chain */
  onChange: (chainId: number) => void
  disabled?: boolean
  className?: string
  label?: string
}

export function ChainSelector({
  value,
  options = DEFAULT_CHAIN_OPTIONS,
  onChange,
  disabled = false,
  className,
  label,
}: ChainSelectorProps) {
  const labelId = useId()
  const buttonId = useId()

  const selected = useMemo(() => options.find(o => o.id === value), [options, value])

  const triggerContent = selected ? (
    <>
      {selected.icon && <span className="shrink-0">{selected.icon}</span>}
      <span className="font-medium text-white">{selected.name}</span>
    </>
  ) : (
    <span className="text-white/50">Select chain</span>
  )

  return (
    <div data-slot="chain-selector" className={cn('space-y-2', className)}>
      {label && (
        <label id={labelId} htmlFor={buttonId} className="text-sm font-medium text-white/70">
          {label}
        </label>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            id={buttonId}
            type="button"
            disabled={disabled}
            aria-labelledby={label ? labelId : undefined}
            aria-label={selected ? `Selected chain: ${selected.name}` : 'Select chain'}
            className={cn(
              'w-full flex items-center justify-between gap-3',
              'bg-black/20 border border-white/10',
              'rounded-xl px-4 py-3',
              'hover:bg-black/30 hover:border-white/20',
              'transition-colors',
              'disabled:opacity-50 disabled:pointer-events-none'
            )}
          >
            <span className="flex items-center gap-3 min-w-0">{triggerContent}</span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0 text-white/50"
              aria-hidden="true"
            >
              <path d="M8 10L12 14L16 10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className={cn(
            'w-[var(--radix-dropdown-menu-trigger-width)]',
            'bg-neutral-900/95 backdrop-blur-xl',
            'border border-white/10',
            'rounded-xl overflow-hidden p-0'
          )}
        >
          {options.map((option, index) => {
            const isLast = index === options.length - 1
            const isSelected = option.id === value

            return (
              <DropdownMenuItem
                key={option.id}
                disabled={disabled}
                onSelect={() => onChange(option.id)}
                className={cn(
                  'flex items-center gap-3 px-4 py-3',
                  'cursor-pointer outline-none',
                  'hover:bg-white/[0.06]',
                  'data-[highlighted]:bg-white/[0.06]',
                  isSelected && 'bg-white/[0.03]',
                  !isLast && 'border-b border-white/5'
                )}
              >
                {option.icon && <span className="shrink-0">{option.icon}</span>}
                <span className="font-medium text-white flex-1">{option.name}</span>
                {isSelected && (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    className="text-white/70"
                    aria-hidden="true"
                  >
                    <path
                      d="M5 12L10 17L19 7"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
