import { Trie } from '@ethereumjs/trie'
import { RLP } from '@ethereumjs/rlp'
import {
  bytesToHex,
  concatBytes,
  hexToBytes,
  hexToBigInt,
  bytesToInt,
  intToBytes,
  intToHex,
} from '@ethereumjs/util'
import { createBlockHeaderFromRPC, JSONRPCBlock } from '@ethereumjs/block'
import { createCustomCommon, Hardfork, Mainnet } from '@ethereumjs/common'
import { Address, PublicClient, RpcTransactionReceipt, TransactionReceipt } from 'viem'
import { writeContract, waitForTransactionReceipt } from '@wagmi/core'
import { config } from '../wagmi'
import CrossChainPaymaster_ABI from '../contracts/CrossChainPaymaster_ABI.json'
import { base } from 'wagmi/chains'

const encodeIndex = (_index: string | number) => {
  const indexStr = typeof _index === 'number' ? `0x${_index.toString(16)}` : _index
  return indexStr === '0x0'
    ? RLP.encode(Buffer.alloc(0))
    : RLP.encode(bytesToInt(hexToBytes(indexStr as `0x${string}`)))
}

export interface ProofData {
  proof: string[][]
  chainId: number
  blockNumber: bigint
  blockHeader: string
  transactionIndex: string
  logIndex: number
  blockHash: string
}

export async function generateMerkleProof(
  receipt: TransactionReceipt,
  publicClient: PublicClient,
  eventLogIndex: number
): Promise<ProofData> {
  const blockHex = `0x${receipt.blockNumber.toString(16)}` as `0x${string}`
  console.log(`  Block hex: ${blockHex}`)

  // Use eth_getBlockByNumber for full block data
  const block = await publicClient.request({
    method: 'eth_getBlockByNumber',
    params: [blockHex, true],
  })

  if (!block) throw new Error('Block not found')
  console.log(`  Block hash: ${block.hash}`)

  // Build merkle proof over receipts
  const chainId = Number(await publicClient.getChainId())

  const common =
    chainId === 8453
      ? createCustomCommon({ chainId }, Mainnet, { hardfork: Hardfork.Cancun, eips: [7685] })
      : (() => {
          throw new Error('Unsupported chain ID')
        })()

  const receipts = await Promise.all(
    block.transactions.map(async tx => {
      const txHash = typeof tx === 'string' ? tx : tx.hash
      return await publicClient.request({
        method: 'eth_getTransactionReceipt',
        params: [txHash],
        chainId: base.id,
      })
    })
  )

  // Encode receipts
  const encodedReceipts = receipts.map(_r => {
    const type = Number(hexToBigInt((_r!.type as `0x${string}`) || '0x0'))
    const encoded = RLP.encode([
      _r!.status === '0x1' ? hexToBytes('0x01') : Uint8Array.from([]),
      hexToBytes(_r!.cumulativeGasUsed),
      hexToBytes(_r!.logsBloom),
      _r!.logs.map(_log => [hexToBytes(_log.address), _log.topics.map(hexToBytes), hexToBytes(_log.data)]),
    ])
    if (type === 0) return encoded
    return concatBytes(intToBytes(type), encoded)
  })

  // Build receipt trie
  const trie = new Trie()
  await Promise.all(
    receipts.map((_r: RpcTransactionReceipt | null, _i: number) =>
      trie.put(encodeIndex(_r!.transactionIndex), encodedReceipts[_i])
    )
  )

  const calculatedRoot = bytesToHex(trie.root())
  if (calculatedRoot !== block.receiptsRoot) {
    throw new Error(`Trie root mismatch. Calculated ${calculatedRoot}, Block ${block.receiptsRoot}`)
  }

  // Create proof for the specific transaction index
  const txIndexKey = encodeIndex(intToHex(receipt.transactionIndex ?? 0))
  const merkleProof = await trie.createProof(txIndexKey)

  // Block header encoding
  const blockHeader = createBlockHeaderFromRPC(block as JSONRPCBlock, { common })
  const encodedBlockHeader = bytesToHex(blockHeader.serialize())

  console.log('Proof generated successfully, Summary:')
  console.log(`Chain ID: ${chainId}`)
  console.log(`Block Number: ${receipt.blockNumber}`)
  console.log(`Tx Index: ${receipt.transactionIndex}`)
  console.log(`Log Index: ${eventLogIndex}`)
  console.log(`Merkle Nodes: ${merkleProof.length}`)

  return {
    proof: merkleProof.map(n => [bytesToHex(n)]),
    chainId,
    blockNumber: receipt.blockNumber,
    blockHeader: encodedBlockHeader,
    transactionIndex: bytesToHex(txIndexKey),
    logIndex: eventLogIndex,
    blockHash: block.hash!,
  }
}

export async function generateAndSubmitManualProof(
  receipt: TransactionReceipt,
  paymentLogIndex: number | null,
  publicClient: PublicClient,
  destinationChainId: number,
  paymasterAddress: Address
): Promise<void> {
  try {
    const proofData = await generateMerkleProof(receipt, publicClient, paymentLogIndex!)

    const formattedProof = [
      proofData.chainId,
      proofData.blockNumber,
      proofData.blockHeader,
      0, // ancestralBlockNumber
      [], // ancestralBlockHeaders
      proofData.proof,
      proofData.transactionIndex,
      proofData.logIndex,
    ]

    // Submit to CrossChainPaymaster contract
    const hash = await writeContract(config, {
      address: paymasterAddress,
      abi: CrossChainPaymaster_ABI,
      functionName: 'processPayment',
      args: [formattedProof],
      chainId: destinationChainId,
    })

    await waitForTransactionReceipt(config, {
      hash,
      chainId: destinationChainId,
    })

    console.log('Manual proof submitted...!')
  } catch (error) {
    console.error(error)
    throw error
  }
}
