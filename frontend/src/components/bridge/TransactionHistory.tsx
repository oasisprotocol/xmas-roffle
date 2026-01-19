import { useEffect, useState } from 'react'
import { formatUnits, Address } from 'viem'
import { History, Trash2, ExternalLink } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'
import { ScrollArea } from '../ui/scroll-area'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

import { getTransactions, clearHistory, TransactionRecord } from '../../lib/transactionHistory'
import { getExplorerTxUrl } from '../../lib/blockExplorers'

// Helper to format date
const formatDate = (timestamp: number) => {
  return new Date(timestamp).toLocaleString()
}

// Helper to format address
const shortenAddress = (address: string) => {
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface TransactionHistoryProps {
  userAddress?: Address
  /** External control for dialog open state */
  open?: boolean
  /** Callback when dialog open state changes */
  onOpenChange?: (open: boolean) => void
}

export function TransactionHistory({
  userAddress,
  open: controlledOpen,
  onOpenChange,
}: TransactionHistoryProps) {
  const [internalOpen, setInternalOpen] = useState(false)

  // Support both controlled and uncontrolled modes
  const isControlled = controlledOpen !== undefined
  const open = isControlled ? controlledOpen : internalOpen
  const setOpen = isControlled ? (onOpenChange ?? (() => {})) : setInternalOpen
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])

  // Load transactions when dialog opens or address changes
  useEffect(() => {
    if (open && userAddress) {
      setTransactions(getTransactions(userAddress))
    }
  }, [open, userAddress])

  const handleClearHistory = () => {
    if (!userAddress) return
    if (confirm('Are you sure you want to clear your transaction history?')) {
      clearHistory(userAddress)
      setTransactions([])
    }
  }

  // Status badge color mapping
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20'
      case 'failed':
        return 'bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20'
      case 'processing':
        return 'bg-blue-500/10 text-blue-500 border-blue-500/20 hover:bg-blue-500/20'
      default:
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20 hover:bg-yellow-500/20'
    }
  }

  if (!userAddress) return null

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="text-white/70 hover:text-white hover:bg-white/10">
          <History className="size-5" />
          <span className="sr-only">Transaction History</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-[#19323C] border-white/10 text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction History</DialogTitle>
          <DialogDescription className="text-white/50">Your recent bridge transactions</DialogDescription>
        </DialogHeader>

        <div className="flex justify-end mb-2">
          {transactions.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearHistory}
              className="text-white/50 hover:text-red-400 hover:bg-red-500/10 h-8 px-2 text-xs"
            >
              <Trash2 className="size-3 mr-2" />
              Clear History
            </Button>
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="py-8 text-center text-white/30 text-sm">No transactions found</div>
        ) : (
          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {transactions.map(tx => {
                const explorerUrl = tx.txHash ? getExplorerTxUrl(tx.sourceChainId, tx.txHash) : null

                return (
                  <div
                    key={tx.paymentId}
                    className="p-3 rounded-lg bg-black/20 border border-white/5 flex flex-col gap-2"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">
                          Bridge {formatUnits(BigInt(tx.amount), tx.decimals)} {tx.tokenSymbol}
                        </div>
                        <div className="text-xs text-white/40 mt-1">{formatDate(tx.timestamp)}</div>
                      </div>
                      <Badge variant="outline" className={`${getStatusColor(tx.status)} border capitalize`}>
                        {tx.status}
                      </Badge>
                    </div>

                    {explorerUrl && (
                      <div className="pt-2 mt-2 border-t border-white/5 flex justify-between items-center text-xs">
                        <span className="text-white/40">Tx Hash</span>
                        <a
                          href={explorerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-blue-400 hover:text-blue-300"
                        >
                          {shortenAddress(tx.txHash!)}
                          <ExternalLink className="size-3" />
                        </a>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  )
}
