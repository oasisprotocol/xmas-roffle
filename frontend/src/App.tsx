import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import svgPaths from './imports/svg-tho7mppomn'
import { BaseError, useAccount, useBalance, useConfig, useReadContract, useWriteContract } from 'wagmi'
import RoffleJson from '../../artifacts/contracts/Roffle5.sol/Roffle.json'
import { Roffle$Type } from '../../artifacts/contracts/Roffle5.sol/Roffle.ts'
import { formatEther, parseEther } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import tickets250_svg from './assets/tickets250.svg'
import bowl_svg from './assets/bowl.svg'
import { LucideLoader, LucideTicket } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader } from './components/index.ts'
import { FAQ } from './FAQ.tsx'
import { TopUpButton } from './components/TopUpButton'
import { base, sapphire } from 'wagmi/chains'
import { ROFL_PAYMASTER_TOKEN_CONFIG } from './constants/rofl-paymaster-config.ts'
import { DropdownSelect } from './components/DropdownSelect'
import { ROSEIcon } from './components/icons/RoseIcon.tsx'
import { IconCenter } from './components/icons/IconCenter.tsx'
import { USDTIcon } from './components/icons/USDTIcon.tsx'
import { USDCIcon } from './components/icons/USDCIcon.tsx'
import { switchToChain } from './contracts/erc-20.ts'
import { CustomConnectButton } from './CustomConnectButton.tsx'
import { AccountAvatar } from './components/AccountAvatar/index.tsx'

const typedRoffleJson = RoffleJson as Roffle$Type

type PayInOption = 'ROSE' | 'USDT_BASE' | 'USDC_BASE'

const CONTRACTS = {
  normal: '0x45779C35Bbbd97D457BEe37E2057d9DD9F7Ee136',
  noTickets: '0x7D9A90986092c48BFA0101772a872dFA249BDd6B',
  alreadyEnded: '0x0656F4F298Ed781008a4Af4B65639432B455B088',
  only2hours: '0xf786f37EF135f690803F9aD0247DEF654fDBA361',
  only4hours: '0x7CC7ca43b9bdA25b5682b69b8f028eD64BF3157a',
  only4hours15tickets: '0x136b8c13927f60439aF8fAde24B04b7DD27D81E9',
  mainnet1week3winners: '0x5507E5dE2A23ED8D5BB10Bd8d3734FFCbFC84DA3',
  mainnet12h5winners: '0xab5fF015023E032313459b59E7E0b93dDb99d75B',
  mainnet13hours5winners: '0xCF734e31C3E50dA43AC676e7E70525dFba24e6f6',
  final: '0x405B9960A9a0380471B82a66400C786B22ff9f52',
} as const
const CONTRACT_NETWORK = sapphire
const RAFFLE_CONTRACT_ADDRESS = CONTRACTS.mainnet12h5winners

const SOCIAL_SHARE_TEXT = `I'm in! 🎄
Just got my tickets for the Oasis Xmas Roffle — 10 winners sharing up to 1M $ROSE!
Get yours here: ${window.location.href}`

/** Adds thousands separators but might lose precision */
function formatEtherLocale(valueInBaseUnits: bigint) {
  return parseFloat(formatEther(valueInBaseUnits)).toLocaleString()
}
const getOrdinalSuffix = (n: number) => (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th')

export function App() {
  const acc = useAccount()
  const { chains: wagmiChains } = useConfig()
  // Treat wrong chain as unconnected otherwise user might send tokens to malicious contract on another chain
  const isConnected =
    acc.isConnected && acc.chainId !== undefined && wagmiChains.some(chain => chain.id === acc.chainId)
  const config = useConfig()
  const [ticketAmount, setTicketAmount] = useState(1)
  const [_showSuccess, setShowSuccess] = useState(false)
  const [showError, setShowError] = useState<{ txHash: `0x${string}`; message?: string } | undefined>(
    undefined
  )
  const [buyInlineError, setBuyInlineError] = useState<string | undefined>(undefined)
  const [isFaqOpen, setIsFaqOpen] = useState(false)
  const [payIn, setPayIn] = useState<PayInOption>('ROSE')

  const roseBalance = useBalance({
    address: acc.address,
    chainId: CONTRACT_NETWORK.id,
    query: {
      refetchInterval: 60_000,
    },
  })
  const raffleBalance = useBalance({
    address: RAFFLE_CONTRACT_ADDRESS,
    query: {
      refetchInterval: 60_000,
    },
    chainId: CONTRACT_NETWORK.id,
  })
  const initialPot = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'opfContribution',
    chainId: CONTRACT_NETWORK.id,
  })
  const maxTotalTickers = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'MAX_TOTAL_TICKETS',
    chainId: CONTRACT_NETWORK.id,
  })
  const ticketPrice = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'TICKET_PRICE',
    chainId: CONTRACT_NETWORK.id,
  })
  const raffleEndTime = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'raffleEndTime',
    chainId: CONTRACT_NETWORK.id,
  })
  const ticketsRemaining = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'getTicketsRemaining',
    query: {
      refetchInterval: 60_000,
    },
    chainId: CONTRACT_NETWORK.id,
  })
  const maxTicketsPerWallet = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'MAX_TICKETS_PER_WALLET',
    chainId: CONTRACT_NETWORK.id,
  })
  const ticketsPurchased = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'ticketsPurchased',
    chainId: CONTRACT_NETWORK.id,
    args: [acc.address!],
    query: {
      enabled: !!acc.address,
    },
  })
  const _winners = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'getWinners',
    chainId: CONTRACT_NETWORK.id,
  })
  const winners = _winners.data?.filter(w => w.prize > 0n) ?? []
  const totalWinnings = winners.reduce((sum, w) => sum + w.prize, 0n)
  const winnersByPrize = Object.values(
    winners.reduce(
      (acc, winner) => {
        acc[winner.prize.toString()] ??= []
        acc[winner.prize.toString()]!.push(winner)
        return acc
      },
      {} as Record<string, typeof winners>
    )
  ).sort((a, b) => Number(b[0].prize) - Number(a[0].prize))

  const buyTx = useWriteContract()
  const [isBuyingTicketsLoading, setIsBuyingTicketsLoading] = useState(false)
  const [isTopUpLoading, setIsTopUpLoading] = useState(false)

  if (!ticketPrice.data) return
  if (!raffleEndTime.data) return
  if (ticketsRemaining.data === undefined) return

  const isBlockingDropdowns = isBuyingTicketsLoading || isTopUpLoading

  const hasBoughtMaxTickets =
    ticketsPurchased.data !== undefined &&
    ticketsPurchased.data >= (maxTicketsPerWallet.data ?? BigInt(Number.MAX_SAFE_INTEGER))
  const showSuccess = hasBoughtMaxTickets || _showSuccess
  const hasEndedByTime = Number(raffleEndTime.data * 1000n) < Date.now()
  const hasEndedByWinners = winners.length > 0
  const hasEnded = hasEndedByTime || hasEndedByWinners
  const hasSoldOut = ticketsRemaining.data <= 0n && !showSuccess
  const insufficientRoseBalance = roseBalance.data
    ? roseBalance.data?.value < BigInt(ticketAmount) * ticketPrice.data
    : false

  const ticketOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => ({
    value: v,
    label: v + ` ticket${v > 1 ? 's' : ' '}`,
    price: formatEther(BigInt(v) * ticketPrice.data) + ' ROSE',
  }))

  const handleBuyTickets = async () => {
    setBuyInlineError(undefined)
    setShowError(undefined)

    setIsBuyingTicketsLoading(true)

    const switchToChainResponse = await switchToChain({
      targetChainId: CONTRACT_NETWORK.id,
      address: acc.address,
    })
    if (!switchToChainResponse.success) {
      setBuyInlineError(`Please switch your wallet to ${CONTRACT_NETWORK.name} to buy tickets.`)
      setIsBuyingTicketsLoading(false)
      return
    }

    ticketsRemaining.refetch()
    let hash
    try {
      hash = await buyTx.writeContractAsync({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: typedRoffleJson.abi,
        functionName: 'buyTickets',
        args: [BigInt(ticketAmount)],
        value: BigInt(ticketAmount) * ticketPrice.data,
        chainId: CONTRACT_NETWORK.id,
        gas: 500_000n,
      })
      // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Error printed next to button using buyTx.error
    } catch (_error) {
      setIsBuyingTicketsLoading(false)
      return
    }
    try {
      const transactionReceipt = await waitForTransactionReceipt(config.getClient(), { hash })
      if (transactionReceipt.status === 'success') {
        setShowSuccess(true)
        ticketsRemaining.refetch()
        ticketsPurchased.refetch()
      } else {
        console.log('reverted', transactionReceipt)
        setShowError({ txHash: hash })
        // Would need grpc or nexus to get the reason. Show link to explorer instead.
      }
    } catch (error) {
      console.error('error', error)
      setShowError({ txHash: hash, message: (error as BaseError).shortMessage || (error as Error).message })
    } finally {
      setIsBuyingTicketsLoading(false)
    }
  }

  const handleBuyMore = () => {
    // reset to 1 ticket; hasBoughtMaxTickets should handle the max ticket bought
    setTicketAmount(1)
    setShowSuccess(false)
  }

  const shareOnLinkedIn = () => {
    window.open(
      'https://www.linkedin.com/sharing/share-offsite/?url=' +
        encodeURIComponent(window.location.href) +
        '&title=' +
        encodeURIComponent(SOCIAL_SHARE_TEXT),
      '_blank'
    )
  }

  const shareOnX = () => {
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(SOCIAL_SHARE_TEXT), '_blank')
  }

  return (
    <div
      className="relative w-full min-h-screen flex flex-col font-['Geist',Helvetica]"
      style={{
        background: 'radial-gradient(50% 50% at 50% 50%, #19323C 0%, #0A1D24 100%)',
      }}
    >
      {!isConnected && !hasEnded && !hasSoldOut && (
        <div className="grow max-w-[910px] -mt-6 md:hidden">
          <img src={tickets250_svg} />
        </div>
      )}

      {/* Header */}
      <header className="relative z-20 flex items-start justify-between px-4 md:px-10 py-6 gap-4">
        <div className="flex items-center gap-3 md:gap-[24px] shrink-0 h-[48px]">
          {/* Logo */}
          <div className="h-[40px] w-[110px] md:h-[48px] md:w-[131px] shrink-0">
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
          </div>

          {/* Separator */}
          <div className="hidden sm:block h-6 w-px bg-[rgba(255,255,255,0.1)]" />

          {/* Purchased Tickets */}
          {isConnected && ticketsPurchased.data !== undefined && (
            <div className="hidden sm:flex items-center gap-2">
              <LucideTicket className="size-6 shrink-0 text-[rgba(255,255,255,0.3)] translate-y-[-1px]" />
              <span className="text-[16px] font-normal leading-5">
                <span className="text-white">Purchased: {ticketsPurchased.data.toString()}</span>
                <span className="text-[rgba(255,255,255,0.5)]">
                  /{maxTicketsPerWallet.data?.toString() || '10'}
                </span>
              </span>
            </div>
          )}
        </div>

        {!isConnected && !hasEnded && !hasSoldOut && (
          <div className="grow max-w-[910px] -mt-6 max-md:hidden">
            <img src={tickets250_svg} />
          </div>
        )}

        {/* Wallet */}
        <div className="styledConnect shrink-0">
          <CustomConnectButton />
        </div>
      </header>

      {/* Mobile Purchased Tickets */}
      {isConnected && ticketsPurchased.data !== undefined && (
        <div className="sm:hidden relative z-20 flex items-center justify-center gap-2 px-4 -mt-2 mb-4">
          <LucideTicket className="size-6 shrink-0 text-[rgba(255,255,255,0.3)] translate-y-[-1px]" />
          <span className="text-[16px] font-normal leading-5">
            <span className="text-white">Purchased: {ticketsPurchased.data.toString()}</span>
            <span className="text-[rgba(255,255,255,0.5)]">
              /{maxTicketsPerWallet.data?.toString() || '10'}
            </span>
          </span>
        </div>
      )}

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-20 md:py-0">
        <div className="w-full max-w-[670px] mx-auto">
          {hasEnded ? (
            <div className="flex flex-col gap-6 items-center text-center w-full">
              {winners.length <= 0 ? (
                <>
                  <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                    Xmas Roffle has ended
                  </p>
                  <p className="font-['Mountains_of_Christmas',cursive] text-[32px] leading-[40px] text-white">
                    Winners will be announced on Dec 24th 2025!
                  </p>
                </>
              ) : (
                <div className="flex flex-col gap-6 w-full">
                  <div className="flex flex-col gap-4">
                    <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                      Congrats to our winners!
                    </p>
                    <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                      Winners have been drawn! Check if you're on the list.
                    </p>
                  </div>
                  <div className="flex flex-col gap-[40px] w-full mt-4 text-white text-[16px] font-normal">
                    {winnersByPrize.map((prizeGroup, groupIndex) => (
                      <div key={groupIndex} className="flex flex-col gap-[16px]">
                        <div className="text-[rgba(255,255,255,0.60)] flex items-center gap-[16px] text-[14px]">
                          <span>
                            {groupIndex + 1}
                            {getOrdinalSuffix(groupIndex + 1)} prize
                          </span>
                          <hr className="border-[rgba(255,255,255,0.1)] border-t-1 grow" />
                          <span>
                            {((Number(prizeGroup[0].prize) / Number(totalWinnings)) * 100).toFixed(0)}%
                          </span>
                        </div>
                        {prizeGroup.map((winner, winnerIndex) => (
                          <div
                            key={`${winner.winner}-${winnerIndex}`}
                            className="flex items-center gap-4 w-full px-4 py-3 rounded-[12px] bg-[rgba(255,255,255,0.05)]"
                          >
                            <AccountAvatar diameter={24} account={{ address_eth: winner.winner }} />
                            <div className="flex-1 min-w-0">
                              <p className="truncate text-left">{winner.winner}</p>
                            </div>
                            <div className="shrink-0">
                              <p>
                                {parseFloat(formatEther(winner.prize)).toLocaleString(undefined, {
                                  maximumFractionDigits: 0,
                                })}{' '}
                                ROSE
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : hasSoldOut ? (
            <div className="flex flex-col gap-4 items-center text-center">
              <img src={bowl_svg} />
              <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                Sold out!
              </p>
              <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                All tickets have been purchased for the Oasis Xmas Roffle. Better luck next time!
              </p>
              <p className="font-['Mountains_of_Christmas',cursive] text-[32px] leading-[40px] text-white">
                Winners will be announced on Dec 24th 2025!
              </p>
            </div>
          ) : !showSuccess ? (
            <div className="flex flex-col gap-4 items-center">
              <div className="flex flex-col gap-4 items-center text-center">
                <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                  Xmas Roffle
                </p>
                <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                  Join the Oasis Christmas raffle!
                  <br />
                  <br />
                  The prize pool starts at {initialPot?.data
                    ? formatEtherLocale(initialPot.data)
                    : '...'}{' '}
                  ROSE and grows with every ticket purchased.
                  <br />
                  Each ticket costs {ticketPrice.data ? formatEther(ticketPrice.data) : '...'} ROSE.
                </p>
              </div>

              {!isConnected ? (
                <div className="styledConnect bigButton [&_button]:w-full w-full max-w-[400px]">
                  <ConnectButton />
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-6 mt-4 w-full max-w-[400px]">
                    <div className="flex flex-col gap-4">
                      {/* Amount Selector */}
                      <div className="flex flex-col gap-1">
                        <div className="flex gap-1 items-start leading-[20px] text-[14px] text-white flex-wrap">
                          <p className="font-medium">Amount</p>
                          <p className="font-normal opacity-60">(max 10 tickets per account)</p>
                        </div>
                        <div className="w-full">
                          <DropdownSelect
                            ariaLabel="Select ticket amount"
                            value={ticketAmount}
                            onChange={setTicketAmount}
                            disabled={isBlockingDropdowns}
                            options={ticketOptions.map(o => ({
                              value: o.value,
                              label: o.label,
                              subLabel: `(${o.price})`,
                              disabled:
                                maxTicketsPerWallet.data !== undefined && ticketsPurchased.data !== undefined
                                  ? maxTicketsPerWallet.data - ticketsPurchased.data < BigInt(o.value)
                                  : false,
                            }))}
                          />
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div className="flex flex-col gap-1">
                        <p className="font-medium leading-[20px] text-[14px] text-white">Pay in</p>

                        <DropdownSelect
                          ariaLabel="Select payment token"
                          value={payIn}
                          onChange={setPayIn}
                          disabled={isBlockingDropdowns}
                          options={[
                            {
                              value: 'ROSE',
                              label: 'ROSE',
                              leading: (
                                <IconCenter>
                                  <ROSEIcon />
                                </IconCenter>
                              ),
                            },
                            {
                              value: 'USDT_BASE',
                              label: 'USDT',
                              subLabel: 'on Base',
                              leading: (
                                <IconCenter>
                                  <USDTIcon />
                                </IconCenter>
                              ),
                            },
                            {
                              value: 'USDC_BASE',
                              label: 'USDC',
                              subLabel: 'on Base',
                              leading: (
                                <IconCenter>
                                  <USDCIcon />
                                </IconCenter>
                              ),
                            },
                          ]}
                        />
                      </div>
                    </div>

                    {payIn !== 'ROSE' && (
                      <TopUpButton
                        roseAmountInBaseUnits={
                          BigInt(ticketAmount) * ticketPrice.data + parseEther('0.05') /* gas fee */
                        }
                        targetToken={
                          payIn === 'USDC_BASE'
                            ? ROFL_PAYMASTER_TOKEN_CONFIG[base.id].TOKENS[0]
                            : ROFL_PAYMASTER_TOKEN_CONFIG[base.id].TOKENS[1]
                        }
                        onSuccess={() => {
                          setIsTopUpLoading(false)
                          setPayIn('ROSE')
                        }}
                        additionalSteps={[
                          {
                            id: 6,
                            label: `Confirm buying ticket${ticketAmount > 1 ? 's' : ''} on Sapphire`,
                            action: handleBuyTickets,
                          },
                        ]}
                        onLoadingChange={setIsTopUpLoading}
                      >
                        {({ amountLabel }) =>
                          `Buy ${ticketAmount} ticket${ticketAmount > 1 ? 's' : ''} for ${amountLabel}`
                        }
                      </TopUpButton>
                    )}
                    {payIn === 'ROSE' && (
                      <>
                        <button
                          onClick={handleBuyTickets}
                          disabled={isBuyingTicketsLoading || insufficientRoseBalance}
                          className="bg-white hover:bg-gray-100 disabled:bg-gray-500 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
                        >
                          {isBuyingTicketsLoading ? (
                            <LucideLoader className="animate-spin" />
                          ) : (
                            <p className="font-medium leading-[20px] text-[16px] text-black text-center">
                              Buy {ticketAmount} ticket{ticketAmount > 1 ? 's' : ''} for{' '}
                              {formatEther(BigInt(ticketAmount) * ticketPrice.data)} ROSE
                            </p>
                          )}
                        </button>
                        {buyTx.isPending && (
                          <div className="text-center text-teal-300">
                            Please, confirm the action(s) in your wallet.
                          </div>
                        )}
                        {(buyInlineError || buyTx.error) && (
                          <p className="text-warning text-center">
                            {buyInlineError ||
                              (buyTx.error as BaseError)?.shortMessage ||
                              buyTx.error?.message}
                          </p>
                        )}
                        {insufficientRoseBalance && (
                          <p className="text-warning text-center">
                            Insufficient ${CONTRACT_NETWORK.nativeCurrency.symbol} balance
                          </p>
                        )}

                        {showError && (
                          <p className="text-error text-center">
                            Oops! Your ticket purchase failed.{' '}
                            {showError.message || (
                              <>
                                <a
                                  href={`https://explorer.oasis.io/mainnet/sapphire/tx/${showError.txHash}`}
                                  target="_blank"
                                  className="[text-decoration-skip-ink:none] [text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity"
                                >
                                  See why transaction was reverted in Oasis Explorer
                                </a>
                                .
                              </>
                            )}
                          </p>
                        )}
                      </>
                    )}
                  </div>

                  <p className="font-normal leading-[18px] opacity-60 text-[12px] text-center text-white">
                    <span>
                      By buying the ticket{ticketAmount > 1 ? 's' : ''} you acknowledge and agree to the
                    </span>
                    <br />
                    <a
                      onClick={() => setIsFaqOpen(true)}
                      className="cursor-pointer [text-decoration-skip-ink:none] [text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity"
                    >
                      Xmas Roffle rules included in the FAQ section of this app
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-10 p-6 md:p-8 animate-in fade-in zoom-in-95 duration-300">
              {hasBoughtMaxTickets ? (
                <div className="flex flex-col gap-8 items-center">
                  <div className="flex flex-col gap-4 items-center text-center">
                    <p className="font-['Mountains_of_Christmas',cursive] leading-[normal] text-[36px] md:text-[48px] text-white">
                      Max tickets bought
                    </p>
                    <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                      Wow, you bought the max amount of tickets for the Oasis Xmas Roffle! Good luck!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-8 items-center">
                  <div className="flex flex-col gap-4 items-center text-center">
                    <p className="font-['Mountains_of_Christmas',cursive] leading-[normal] text-[36px] md:text-[48px] text-white">
                      Participation Successful!
                    </p>
                    <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                      Thank you for participating in the Oasis Xmas Roffle! Good luck!
                    </p>
                  </div>
                  <button
                    onClick={handleBuyMore}
                    className="bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
                  >
                    <p className="font-medium leading-[20px] text-[16px] text-white">Buy more tickets</p>
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-6 items-center">
                <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)] text-center">
                  Share on social media
                </p>
                <div className="flex flex-col gap-6 w-full">
                  <button
                    onClick={shareOnX}
                    className="bg-white hover:bg-gray-100 transition-colors flex h-[48px] items-center justify-between pl-4 pr-2 py-2 rounded-[12px] w-full"
                  >
                    <div className="relative shrink-0 size-[24px]">
                      <svg
                        className="block size-full"
                        fill="none"
                        preserveAspectRatio="none"
                        viewBox="0 0 24 24"
                      >
                        <g>
                          <path d={svgPaths.p38a22b70} fill="#18181B" />
                        </g>
                      </svg>
                    </div>
                    <p className="font-medium leading-[20px] text-[16px] text-black text-center">X</p>
                    <div className="shrink-0 size-[24px]" />
                  </button>
                  <button
                    onClick={shareOnLinkedIn}
                    className="bg-white hover:bg-gray-100 transition-colors flex h-[48px] items-center justify-between pl-4 pr-2 py-2 rounded-[12px] w-full"
                  >
                    <div className="relative shrink-0 size-[24px]">
                      <svg
                        className="block size-full"
                        fill="none"
                        preserveAspectRatio="none"
                        viewBox="0 0 24 24"
                      >
                        <g>
                          <path d={svgPaths.p2ccee40} fill="#18181B" />
                        </g>
                      </svg>
                    </div>
                    <p className="font-medium leading-[20px] text-[16px] text-black text-center">LinkedIn</p>
                    <div className="shrink-0 size-[24px]" />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Stats */}
      <div className="relative z-10 px-4 md:px-10 pb-5 pt-12">
        <div className="flex flex-col md:flex-row gap-4 max-w-[1360px] mx-auto">
          {hasEnded && winners.length > 0 ? (
            <>
              <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
                <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
                  <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">
                    Tickets sold
                  </p>
                  <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                    {maxTotalTickers.data && ticketsRemaining.data !== undefined
                      ? (maxTotalTickers.data - ticketsRemaining.data).toString()
                      : '...'}
                  </p>
                </div>
              </div>
              <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
                <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
                  <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">
                    Total prize pool
                  </p>
                  <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                    {formatEtherLocale(totalWinnings)}
                    <span className="hero-text-muted">ROSE</span>
                  </p>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
                <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
                  <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">
                    Time remaining
                  </p>
                  {!raffleEndTime.data ? (
                    <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                      ...
                    </p>
                  ) : Number(raffleEndTime.data * 1000n) < Date.now() ? (
                    <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                      0<span className="text-[rgba(255,255,255,0.6)] text-[32px]">days</span>
                    </p>
                  ) : (
                    (() => {
                      const timeRemaining = Number(raffleEndTime.data * 1000n) - Date.now()
                      const days = Math.floor(timeRemaining / 1000 / 60 / 60 / 24)
                      const hours = Math.floor((timeRemaining / 1000 / 60 / 60) % 24)
                      const minutes = Math.floor((timeRemaining / 1000 / 60) % 60)
                      return (
                        <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                          {days > 0 && (
                            <span>
                              {days}
                              <span className="hero-text-muted">days</span>
                            </span>
                          )}{' '}
                          {hours > 0 && (
                            <span>
                              {hours}
                              <span className="hero-text-muted">hours</span>
                            </span>
                          )}{' '}
                          {minutes}
                          <span className="hero-text-muted">min</span>
                        </p>
                      )
                    })()
                  )}
                </div>
              </div>
              <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
                <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
                  <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">
                    Tickets left
                  </p>
                  <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                    {ticketsRemaining.data?.toString()}
                    <span className="hero-text-muted">/{maxTotalTickers.data?.toString()}</span>
                  </p>
                </div>
              </div>
              <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
                <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
                  <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">
                    Current prize pool
                  </p>
                  <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                    {raffleBalance.data?.value ? formatEtherLocale(raffleBalance.data?.value) : ''}
                    <span className="hero-text-muted">ROSE</span>
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Footer Links */}
      <footer className="relative z-10 pb-6">
        <div className="flex flex-col sm:flex-row font-normal gap-4 sm:gap-4 items-center justify-center leading-[20px] text-[14px] text-center text-white px-4">
          <a
            onClick={() => setIsFaqOpen(true)}
            className="cursor-pointer [text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity"
          >
            Frequently Asked Questions
          </a>
        </div>
      </footer>

      <Dialog open={isFaqOpen} onOpenChange={setIsFaqOpen}>
        <DialogContent className="sm:max-w-[670px] p-[32px] bg-[#0A1D24] border-black">
          <DialogHeader>
            <DialogDescription>
              <FAQ RAFFLE_CONTRACT_ADDRESS={RAFFLE_CONTRACT_ADDRESS} />
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  )
}
