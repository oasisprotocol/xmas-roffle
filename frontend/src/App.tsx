import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useAccount, useBalance, useConfig } from 'wagmi'
import { formatUnits, parseUnits } from 'viem'
import { base, sapphire } from 'wagmi/chains'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { toast } from 'sonner'
import { LucideLoader } from 'lucide-react'

import { BridgeCard, BridgeCardSection, BridgeCardDivider } from './components/bridge'
import { AmountInput } from './components/bridge'
import { TokenSelector, getTokenKey, type TokenOption } from './components/bridge'
import { ChainSelector } from './components/bridge'
import { FeeBreakdown, FeeEstimate, type FeeItem } from './components/bridge'
import { PendingTransactionBanner, TransactionHistory, BridgeSuccessModal } from './components/bridge'
import { CustomConnectButton } from './CustomConnectButton'
import { usePaymaster } from './hooks/usePaymaster'
import {
  ROFL_PAYMASTER_TOKEN_CONFIG,
  ROFL_PAYMASTER_EXPECTED_TIME,
  ROFL_PAYMASTER_SLIPPAGE_PERCENTAGE,
  SUPPORTED_SOURCE_CHAINS,
  getChainName,
} from './constants/rofl-paymaster-config'
import { ROSEIcon } from './components/icons/RoseIcon'
import { USDCIcon } from './components/icons/USDCIcon'
import { USDTIcon } from './components/icons/USDTIcon'
import { cn } from './lib/utils'
import svgPaths from './imports/svg-tho7mppomn'

/** Token icon mapping - extensible for new tokens */
function getTokenIcon(symbol: string): React.ReactNode {
  const icons: Record<string, React.ReactNode> = {
    USDC: <USDCIcon />,
    USDT: <USDTIcon />,
    ROSE: <ROSEIcon />,
  }
  // Default to first available icon if token not found (defensive)
  return icons[symbol] ?? icons.USDC
}

/** Build source tokens for a given chain ID */
function buildSourceTokens(chainId: number): TokenOption[] {
  const chainConfig = ROFL_PAYMASTER_TOKEN_CONFIG[chainId]
  if (!chainConfig) return []

  const chainName = getChainName(chainId)
  return chainConfig.TOKENS.map(token => ({
    symbol: token.symbol,
    name: token.name,
    address: token.contractAddress,
    decimals: token.decimals,
    chainId,
    chainName,
    icon: getTokenIcon(token.symbol),
  }))
}

/** Destination token (ROSE on Sapphire) */
const DESTINATION_TOKEN: TokenOption = {
  symbol: 'ROSE',
  name: 'ROSE',
  chainId: sapphire.id,
  chainName: 'Sapphire',
  decimals: 18,
  icon: <ROSEIcon />,
}

export function App() {
  const { address, isConnected, chainId } = useAccount()
  const { chains: wagmiChains } = useConfig()
  const { openConnectModal } = useConnectModal()

  // Treat wrong chain as unconnected to prevent sending to wrong network
  const isValidConnection =
    isConnected && chainId !== undefined && wagmiChains.some(chain => chain.id === chainId)

  // Bridge state - chain selection
  const [selectedSourceChainId, setSelectedSourceChainId] = useState(
    SUPPORTED_SOURCE_CHAINS[0]?.id ?? base.id
  )

  // Build source tokens based on selected chain
  const sourceTokens = useMemo(() => buildSourceTokens(selectedSourceChainId), [selectedSourceChainId])

  // Token selection state
  const [amount, setAmount] = useState('')
  const [selectedTokenKey, setSelectedTokenKey] = useState<string | null>(
    sourceTokens.length > 0 ? getTokenKey(sourceTokens[0]) : null
  )
  const [historyOpen, setHistoryOpen] = useState(false)

  // Reset token selection when chain changes
  useEffect(() => {
    const newTokens = buildSourceTokens(selectedSourceChainId)
    if (newTokens.length > 0) {
      setSelectedTokenKey(getTokenKey(newTokens[0]))
    }
    setAmount('') // Clear amount when chain changes
  }, [selectedSourceChainId])

  const selectedToken = useMemo(
    () => sourceTokens.find(t => getTokenKey(t) === selectedTokenKey) ?? sourceTokens[0],
    [selectedTokenKey, sourceTokens]
  )

  const tokenConfig = useMemo(() => {
    const chainConfig = ROFL_PAYMASTER_TOKEN_CONFIG[selectedSourceChainId]
    if (!chainConfig?.TOKENS.length) {
      // Defensive: fall back to first supported chain's first token
      // This prevents crashes if chain config is somehow missing
      const fallbackChain = SUPPORTED_SOURCE_CHAINS[0]
      const fallbackConfig = ROFL_PAYMASTER_TOKEN_CONFIG[fallbackChain.id]
      if (!fallbackConfig?.TOKENS.length) {
        throw new Error('No token configuration available for any supported chain')
      }
      return fallbackConfig.TOKENS[0]
    }
    return chainConfig.TOKENS.find(t => t.symbol === selectedToken?.symbol) ?? chainConfig.TOKENS[0]
  }, [selectedToken, selectedSourceChainId])

  // Balances - fetch from the selected source chain
  const sourceBalance = useBalance({
    address,
    token: selectedToken?.address as `0x${string}` | undefined,
    chainId: selectedSourceChainId,
    query: { enabled: !!address && !!selectedToken?.address, refetchInterval: 30_000 },
  })

  const destinationBalance = useBalance({
    address,
    chainId: sapphire.id,
    query: { enabled: !!address, refetchInterval: 30_000 },
  })

  // Paymaster hook for cross-chain transfer
  const paymaster = usePaymaster(tokenConfig, selectedSourceChainId, [])

  // Parse input amount
  const parsedAmount = useMemo(() => {
    if (!amount || amount === '.' || !selectedToken) return 0n
    try {
      return parseUnits(amount, selectedToken.decimals ?? 6)
    } catch {
      return 0n
    }
  }, [amount, selectedToken])

  // Fetch ROSE estimate when amount changes
  useEffect(() => {
    if (parsedAmount > 0n && tokenConfig) {
      paymaster.getRoseEstimate({ amount: parsedAmount }).catch(err => {
        console.warn('Estimate fetch failed:', err)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Depend on specific method, not whole object
  }, [parsedAmount, tokenConfig, paymaster.getRoseEstimate])

  // Estimated ROSE output from the hook
  const estimatedRose = paymaster.roseEstimate

  // Track previous error to avoid duplicate toasts
  const prevErrorRef = useRef<string | null>(null)

  // Ref to hold latest handleBridge function (avoids stale closure in toast retry)
  const handleBridgeRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Handle bridge action
  const handleBridge = useCallback(async () => {
    if (!parsedAmount || parsedAmount === 0n) return
    try {
      await paymaster.startTopUp({ amount: parsedAmount })
    } catch (error) {
      console.error('Bridge failed:', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Depend on specific method, not whole object
  }, [parsedAmount, paymaster.startTopUp])

  // Keep ref updated with latest handleBridge
  useEffect(() => {
    handleBridgeRef.current = handleBridge
  }, [handleBridge])

  // Show error toast with retry action
  useEffect(() => {
    if (paymaster.error && paymaster.error !== prevErrorRef.current) {
      prevErrorRef.current = paymaster.error
      toast.error(paymaster.error, {
        action: {
          label: 'Retry',
          onClick: () => {
            paymaster.reset()
            handleBridgeRef.current()
          },
        },
        duration: 6000,
      })
    } else if (!paymaster.error) {
      prevErrorRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only re-run when error changes; paymaster object is not memoized, reset is stable
  }, [paymaster.error])

  // Handle chain change
  const handleChainChange = useCallback(
    (chainId: number) => {
      setSelectedSourceChainId(chainId)
      paymaster.reset()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Depend on specific method, not whole object
    [paymaster.reset]
  )

  // Handle token change
  const handleTokenChange = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Required by TokenSelector onChange signature
    (key: string, _token: TokenOption) => {
      setSelectedTokenKey(key)
      setAmount('') // Reset amount when changing token
      paymaster.reset()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Depend on specific method, not whole object
    [paymaster.reset]
  )

  // Handle pending transaction recovery
  const handleResume = useCallback(async () => {
    try {
      await paymaster.resumeFromPending()
    } catch (error) {
      console.error('Resume failed:', error)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Depend on specific method, not whole object
  }, [paymaster.resumeFromPending])

  // Handle success modal close - clear success state and reset form
  const handleSuccessClose = useCallback(() => {
    paymaster.clearSuccess()
    paymaster.reset()
    setAmount('') // Also reset the amount input for fresh start
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Depend on specific methods, not whole object
  }, [paymaster.clearSuccess, paymaster.reset])

  // Calculate exchange rate: ROSE per 1 token
  const exchangeRate = useMemo(() => {
    if (!estimatedRose || !parsedAmount || parsedAmount === 0n) return null
    // Calculate ROSE per 1 unit of token
    // estimatedRose is in 18 decimals, parsedAmount is in token decimals (6)
    const oneToken = 10n ** BigInt(selectedToken?.decimals ?? 6)
    const rosePerToken = (estimatedRose * oneToken) / parsedAmount
    return formatUnits(rosePerToken, 18)
  }, [estimatedRose, parsedAmount, selectedToken?.decimals])

  // Fee breakdown items
  const feeItems: FeeItem[] = useMemo(() => {
    const items: FeeItem[] = []

    if (estimatedRose && exchangeRate) {
      items.push({
        label: 'Exchange rate',
        value: `1 ${selectedToken?.symbol ?? 'USDC'} ≈ ${Number(exchangeRate).toFixed(2)} ROSE`,
        loading: paymaster.initialLoading,
      })
    }

    // Note: Slippage is passed separately via the `slippage` prop to FeeBreakdown
    return items
  }, [estimatedRose, exchangeRate, selectedToken?.symbol, paymaster.initialLoading])

  // Validation
  const maxBalance = sourceBalance.data?.value ?? 0n
  const isInsufficientBalance = parsedAmount > maxBalance
  const canBridge =
    parsedAmount > 0n && !isInsufficientBalance && !paymaster.isLoading && !paymaster.pendingTransaction

  // Button state
  const getButtonText = () => {
    if (!isValidConnection) return 'Connect Wallet'
    if (paymaster.isLoading) return 'Processing...'
    if (!amount || parsedAmount === 0n) return 'Enter amount'
    if (isInsufficientBalance) return 'Insufficient balance'
    return 'Bridge to Sapphire'
  }

  return (
    <div
      className="relative w-full min-h-screen flex flex-col font-['Geist',Helvetica]"
      style={{
        background: 'radial-gradient(50% 50% at 50% 50%, #19323C 0%, #0A1D24 100%)',
      }}
    >
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-4 md:px-10 py-6 gap-4">
        <div className="flex items-center gap-3 md:gap-6 shrink-0 h-12">
          {/* Logo */}
          <a href="/" className="block h-10 w-[110px] md:h-12 md:w-[131px]">
            <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 131 48">
              <g id="Union">
                <path clipRule="evenodd" d={svgPaths.p1f562c00} fill="white" fillRule="evenodd" />
                <path clipRule="evenodd" d={svgPaths.p2b736500} fill="white" fillRule="evenodd" />
                <path d={svgPaths.p1bd1ab00} fill="white" />
                <path d={svgPaths.p2a757eb0} fill="white" />
                <path clipRule="evenodd" d={svgPaths.p3d36a900} fill="white" fillRule="evenodd" />
                <path d={svgPaths.p19eb9c00} fill="white" />
              </g>
            </svg>
          </a>

          {/* Divider */}
          <div className="hidden sm:block h-6 w-px bg-white/10" />

          {/* Title */}
          <h1 className="hidden sm:block text-white text-lg font-medium">Bridge</h1>
        </div>

        {/* Wallet */}
        <div className="styledConnect shrink-0 flex items-center gap-2">
          {isConnected && address && (
            <TransactionHistory userAddress={address} open={historyOpen} onOpenChange={setHistoryOpen} />
          )}
          <CustomConnectButton />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-8 md:py-0">
        <BridgeCard
          title="Bridge to Sapphire"
          description="Transfer stablecoins from Base, Arbitrum, or Ethereum to receive ROSE on Sapphire"
        >
          <div className="space-y-4">
            {/* Source Section */}
            <BridgeCardSection label="From">
              <div className="space-y-3">
                <ChainSelector
                  value={selectedSourceChainId}
                  onChange={handleChainChange}
                  disabled={paymaster.isLoading}
                />
                <TokenSelector
                  value={selectedTokenKey}
                  options={sourceTokens}
                  onChange={handleTokenChange}
                  disabled={paymaster.isLoading}
                />
                <AmountInput
                  value={amount}
                  onChange={setAmount}
                  decimals={selectedToken?.decimals ?? 6}
                  maxValue={maxBalance}
                  balance={sourceBalance.data?.value}
                  balanceLabel="Balance"
                  disabled={paymaster.isLoading || !isValidConnection}
                  error={isInsufficientBalance ? 'Insufficient balance' : undefined}
                  placeholder="0.00"
                />
              </div>
            </BridgeCardSection>

            {/* Divider with arrow */}
            <BridgeCardDivider />

            {/* Destination Section */}
            <BridgeCardSection label="To">
              <TokenSelector
                value={getTokenKey(DESTINATION_TOKEN)}
                options={[DESTINATION_TOKEN]}
                showChainName
                singleToken
              />
              {destinationBalance.data && (
                <p className="text-xs text-white/50 mt-2">
                  Current balance: {formatUnits(destinationBalance.data.value, 18)} ROSE
                </p>
              )}
            </BridgeCardSection>

            {/* Fee Estimate */}
            {parsedAmount > 0n && (
              <FeeEstimate
                sourceAmount={amount || '0'}
                sourceToken={selectedToken?.symbol ?? 'USDC'}
                destinationAmount={
                  estimatedRose ? parseFloat(formatUnits(estimatedRose, 18)).toFixed(2) : '...'
                }
                destinationToken="ROSE"
                loading={paymaster.initialLoading}
                className="mt-4"
              />
            )}

            {/* Fee Breakdown */}
            <FeeBreakdown
              items={feeItems}
              estimatedTime={`~${ROFL_PAYMASTER_EXPECTED_TIME}s`}
              slippage={`${ROFL_PAYMASTER_SLIPPAGE_PERCENTAGE}%`}
              className="mt-4"
            />

            {/* Progress Steps */}
            {paymaster.currentStep && (
              <div className="mt-4 p-4 rounded-xl bg-black/20 border border-white/10">
                <div className="flex items-center gap-3">
                  <LucideLoader className="size-5 animate-spin text-white/70" />
                  <span className="text-sm text-white">{paymaster.currentStep.label}</span>
                </div>
                {paymaster.currentStep.expectedTimeInSeconds && (
                  <p className="text-xs text-white/50 mt-2 ml-8">
                    This may take ~{paymaster.currentStep.expectedTimeInSeconds}s
                  </p>
                )}
              </div>
            )}

            {/* Errors are shown via toast notifications */}

            {/* Pending Transaction Recovery */}
            {paymaster.pendingTransaction && !paymaster.isLoading && (
              <PendingTransactionBanner
                pending={paymaster.pendingTransaction}
                decimals={
                  sourceTokens.find(
                    t => t.address?.toLowerCase() === paymaster.pendingTransaction!.tokenAddress.toLowerCase()
                  )?.decimals ?? 6
                }
                onResume={handleResume}
                onDismiss={paymaster.dismissPending}
              />
            )}

            {/* Bridge Button */}
            <button
              onClick={isValidConnection ? handleBridge : openConnectModal}
              disabled={isValidConnection && (!canBridge || paymaster.isLoading)}
              className={cn(
                'w-full h-14 rounded-xl font-medium text-base transition-colors mt-6',
                !isValidConnection || (canBridge && !paymaster.isLoading)
                  ? 'bg-white text-black hover:bg-gray-100'
                  : 'bg-white/20 text-white/50 cursor-not-allowed'
              )}
            >
              {paymaster.isLoading ? (
                <LucideLoader className="size-5 animate-spin mx-auto" />
              ) : (
                getButtonText()
              )}
            </button>
          </div>
        </BridgeCard>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-4 lg:px-10 pb-4 lg:pb-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-sm text-white/50">
          <span>© Oasis Protocol Foundation 2025</span>
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/oasisprotocol"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors underline"
            >
              GitHub
            </a>
            <span>|</span>
            <a
              href="https://oasis.net"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors underline"
            >
              Oasis
            </a>
          </div>
        </div>
      </footer>

      {/* Success Modal */}
      <BridgeSuccessModal
        successData={paymaster.successData}
        userAddress={address}
        tokenDecimals={selectedToken?.decimals ?? 6}
        onClose={handleSuccessClose}
        onViewHistory={() => setHistoryOpen(true)}
      />
    </div>
  )
}
