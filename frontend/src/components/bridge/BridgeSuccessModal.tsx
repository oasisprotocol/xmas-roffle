import { formatUnits, Address } from 'viem'
import { sapphire } from 'wagmi/chains'
import { CheckCircle, ExternalLink, Copy, Check } from 'lucide-react'
import { useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { getExplorerTxUrl, getExplorerAddressUrl } from '../../lib/blockExplorers'
import { getChainName } from '../../constants/rofl-paymaster-config'
import type { BridgeSuccessData } from '../../hooks/usePaymaster'

interface BridgeSuccessModalProps {
  successData: BridgeSuccessData | null
  userAddress: Address | undefined
  tokenDecimals: number
  onClose: () => void
  onViewHistory: () => void
}

export function BridgeSuccessModal({
  successData,
  userAddress,
  tokenDecimals,
  onClose,
  onViewHistory,
}: BridgeSuccessModalProps) {
  const [copied, setCopied] = useState(false)

  if (!successData) return null

  const formattedAmount = formatUnits(BigInt(successData.amount), tokenDecimals)
  const sourceTxUrl = getExplorerTxUrl(successData.sourceChainId, successData.sourceTxHash)
  const sourceChainName = getChainName(successData.sourceChainId)
  const sapphireWalletUrl = userAddress ? getExplorerAddressUrl(sapphire.id, userAddress) : null

  const handleCopyBridgeId = async () => {
    try {
      await navigator.clipboard.writeText(successData.paymentId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      console.warn('Failed to copy to clipboard')
    }
  }

  const handleViewHistory = () => {
    onClose()
    // Small delay to allow modal close animation
    setTimeout(onViewHistory, 150)
  }

  return (
    <Dialog open={!!successData} onOpenChange={open => !open && onClose()}>
      <DialogContent className="bg-[#19323C] border-white/10 text-white sm:max-w-md">
        <DialogHeader className="text-center sm:text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <CheckCircle className="h-10 w-10 text-green-500" />
          </div>
          <DialogTitle className="text-xl">Bridge Successful!</DialogTitle>
          <DialogDescription className="text-white/70">
            You bridged {formattedAmount} {successData.tokenSymbol}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {/* Source Chain Transaction Link */}
          {sourceTxUrl && (
            <a
              href={sourceTxUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/20 transition-colors"
            >
              <div>
                <div className="text-sm font-medium">View Deposit on {sourceChainName}</div>
                <div className="text-xs text-white/50 mt-0.5">
                  {successData.sourceTxHash.slice(0, 10)}...{successData.sourceTxHash.slice(-8)}
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-white/50" />
            </a>
          )}

          {/* Sapphire Wallet Link */}
          {sapphireWalletUrl && (
            <a
              href={sapphireWalletUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/20 transition-colors"
            >
              <div>
                <div className="text-sm font-medium">View Wallet on Sapphire</div>
                <div className="text-xs text-white/50 mt-0.5">Verify your ROSE balance</div>
              </div>
              <ExternalLink className="h-4 w-4 text-white/50" />
            </a>
          )}

          {/* Bridge ID */}
          <button
            onClick={handleCopyBridgeId}
            className="w-full flex items-center justify-between p-3 rounded-lg bg-black/20 border border-white/5 hover:border-white/20 transition-colors text-left"
          >
            <div>
              <div className="text-sm font-medium">Bridge ID</div>
              <div className="text-xs text-white/50 mt-0.5 font-mono">
                {successData.paymentId.slice(0, 16)}...
              </div>
            </div>
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-white/50" />
            )}
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 mt-6">
          <Button onClick={onClose} className="w-full bg-white text-black hover:bg-gray-100">
            Bridge More
          </Button>
          <Button
            variant="outline"
            onClick={handleViewHistory}
            className="w-full border-white/20 text-white hover:bg-white/10"
          >
            View History
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
