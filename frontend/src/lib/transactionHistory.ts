import { Address } from 'viem'
import { base } from 'wagmi/chains'
import { SUPPORTED_SOURCE_CHAINS } from '../constants/rofl-paymaster-config'

const STORAGE_KEY = 'oasis-bridge-tx-history'

/** Check if a chain ID is supported */
function isSupportedChain(chainId: number): boolean {
  return SUPPORTED_SOURCE_CHAINS.some(c => c.id === chainId)
}

export type TransactionStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type TransactionRecord = {
  paymentId: string
  timestamp: number
  amount: string
  decimals: number
  tokenSymbol: string
  tokenAddress: Address
  userAddress: Address
  status: TransactionStatus
  txHash?: string
  sourceChainId: number // Chain where deposit was made (Base, Arbitrum, Ethereum)
}

export function getTransactions(userAddress: Address): TransactionRecord[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []

    const allTransactions = JSON.parse(stored) as (TransactionRecord & { sourceChainId?: number })[]
    return (
      allTransactions
        .filter(tx => tx.userAddress.toLowerCase() === userAddress.toLowerCase())
        .map(tx => ({
          ...tx,
          // Migration: default sourceChainId to Base for old records
          sourceChainId: tx.sourceChainId ?? base.id,
        }))
        // Filter out transactions with unsupported chains (e.g., if a chain was removed)
        .filter(tx => isSupportedChain(tx.sourceChainId))
        .sort((a, b) => b.timestamp - a.timestamp)
    )
  } catch (e) {
    console.warn('Failed to read transaction history:', e)
    return []
  }
}

export function saveTransaction(record: TransactionRecord): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    let transactions: TransactionRecord[] = stored ? JSON.parse(stored) : []

    // Remove existing if any (upsert)
    transactions = transactions.filter(t => t.paymentId !== record.paymentId)
    transactions.push(record)

    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
  } catch (e) {
    console.warn('Failed to save transaction to history:', e)
  }
}

export function updateTransactionStatus(paymentId: string, status: TransactionStatus): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    const transactions = JSON.parse(stored) as TransactionRecord[]
    const index = transactions.findIndex(t => t.paymentId === paymentId)

    if (index !== -1) {
      transactions[index].status = status
      localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions))
    }
  } catch (e) {
    console.warn('Failed to update transaction status:', e)
  }
}

export function clearHistory(userAddress: Address): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return

    const transactions = JSON.parse(stored) as TransactionRecord[]
    const otherTransactions = transactions.filter(
      tx => tx.userAddress.toLowerCase() !== userAddress.toLowerCase()
    )

    localStorage.setItem(STORAGE_KEY, JSON.stringify(otherTransactions))
  } catch (e) {
    console.warn('Failed to clear transaction history:', e)
  }
}
