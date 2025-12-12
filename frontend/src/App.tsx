import { useState } from 'react'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import svgPaths from './imports/svg-tho7mppomn'
import { BaseError, useAccount, useBalance, useConfig, useReadContract, useWriteContract } from 'wagmi'
import RoffleJson from '../../artifacts/contracts/Roffle.sol/Roffle.json'
import { Roffle$Type } from '../../artifacts/contracts/Roffle.sol/Roffle.ts'
import { formatEther } from 'viem'
import { waitForTransactionReceipt } from 'viem/actions'
import tickets250_svg from './assets/tickets250.svg'
import ticketsYay_svg from './assets/ticketsYay.svg'
import ticketsWow_svg from './assets/ticketsWow.svg'
import ticketsOmg_svg from './assets/ticketsOmg.svg'
import { LucideLoader } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader } from './components/index.ts'
import { FAQ } from './FAQ.tsx'
import { TopUpButton } from './components/TopUpButton'
import { ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN } from './constants/rofl-paymaster-config.ts'
import { sapphire } from 'wagmi/chains'

const typedRoffleJson = RoffleJson as Roffle$Type

const CONTRACTS = {
  normal: '0x45779C35Bbbd97D457BEe37E2057d9DD9F7Ee136',
  noTickets: '0x7D9A90986092c48BFA0101772a872dFA249BDd6B',
  alreadyEnded: '0x0656F4F298Ed781008a4Af4B65639432B455B088',
  only2hours: '0xf786f37EF135f690803F9aD0247DEF654fDBA361',
  only4hours: '0x7CC7ca43b9bdA25b5682b69b8f028eD64BF3157a',
  only4hours15tickets: '0x136b8c13927f60439aF8fAde24B04b7DD27D81E9',
} as const
// TODO: mainnet
const RAFFLE_CONTRACT_ADDRESS = CONTRACTS.normal

export function App() {
  const acc = useAccount()
  const { chains: wagmiChains } = useConfig()
  // Treat wrong chain as unconnected otherwise user might send tokens to malicious contract on another chain
  const isConnected =
    acc.isConnected && acc.chainId !== undefined && wagmiChains.some(chain => chain.id === acc.chainId)
  const config = useConfig()
  const [ticketAmount, setTicketAmount] = useState(1)
  const [showSuccess, setShowSuccess] = useState(false)
  const [purchasedTickets, setPurchasedTickets] = useState(0)
  const [isFaqOpen, setIsFaqOpen] = useState(false)
  const { data: accountBalance } = useBalance({
    address: acc.address,
    chainId: sapphire.id
  })

  const raffleBalance = useBalance({
    address: RAFFLE_CONTRACT_ADDRESS,
  })
  const ticketPrice = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'TICKET_PRICE',
  })
  const raffleEndTime = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'raffleEndTime',
  })
  const ticketsRemaining = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'getTicketsRemaining',
    query: {
      refetchInterval: 60_000,
    },
  })
  const buyTx = useWriteContract()
  const [isWaitingForBuyReceipt, setIsWaitingForBuyReceipt] = useState(false)

  if (!ticketPrice.data) return
  if (!raffleEndTime.data) return
  if (ticketsRemaining.data === undefined) return

  const hasEnded = Number(raffleEndTime.data * 1000n) < Date.now()
  const hasSoldOut = ticketsRemaining.data <= 0n && !showSuccess

  const ticketOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => ({
    value: v,
    label: v + ' ticket',
    price: formatEther(BigInt(v) * ticketPrice.data) + ' ROSE',
  }))

  const handleBuyTickets = async () => {
    ticketsRemaining.refetch()
    let hash
    try {
      hash = await buyTx.writeContractAsync({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: typedRoffleJson.abi,
        functionName: 'buyTickets',
        args: [BigInt(ticketAmount)],
        value: BigInt(ticketAmount) * ticketPrice.data,
      })
    } catch (error) {
      // Error printed next to button using buyTx.error
      return
    }
    setIsWaitingForBuyReceipt(true)
    try {
      const transactionReceipt = await waitForTransactionReceipt(config.getClient(), { hash })
      if (transactionReceipt.status === 'success') {
        setPurchasedTickets(prev => prev + ticketAmount)
        setShowSuccess(true)
        ticketsRemaining.refetch()
      } else {
        console.log('reverted', transactionReceipt)
        alert('Transaction reverted. Check explorer.oasis.io to see error message')
        // Would need grpc or nexus to get the reason.
      }
    } catch (error) {
      console.error('error', error)
      alert((error as BaseError).shortMessage || (error as Error).message)
    } finally {
      setIsWaitingForBuyReceipt(false)
    }
  }

  const handleBuyMore = () => {
    setShowSuccess(false)
  }

  const shareOnLinkedIn = () => {
    window.open(
      'https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(window.location.href),
      '_blank'
    )
  }

  const shareOnX = () => {
    window.open(
      'https://twitter.com/intent/tweet?text=' + encodeURIComponent('I just entered the Oasis X-mas Raffle!'),
      '_blank'
    )
  }

  return (
    <div
      className="relative w-full min-h-screen flex flex-col font-['Geist',Helvetica]"
      style={{
        background: 'radial-gradient(50% 50% at 50% 50%, #19323C 0%, #0A1D24 100%)',
      }}
    >
      {/* Header */}
      <header className="relative z-20 flex items-start justify-between px-4 md:px-10 py-6 max-md:flex-wrap">
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

        <div className="overflow-hidden grow max-w-[910px] -mt-6 max-md:-order-1">
          {showSuccess ? (
            purchasedTickets === 10 ? (
              <img src={ticketsWow_svg} />
            ) : (
              <img src={ticketsYay_svg} />
            )
          ) : hasSoldOut ? (
            <img src={ticketsOmg_svg} />
          ) : (
            <img src={tickets250_svg} />
          )}
          {/* TODO: error <img src={ticketsNoo_svg} /> */}
        </div>

        {/* Wallet */}
        <div className="styledConnect shrink-0">
          <ConnectButton />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-20 md:py-0">
        <div className="w-full max-w-[670px] mx-auto">
          {hasEnded ? (
            <div className="flex flex-col gap-4 items-center text-center">
              <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                X-mas Roffle has ended
              </p>
            </div>
          ) : hasSoldOut ? (
            <div className="flex flex-col gap-4 items-center text-center">
              <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                Sold out!
              </p>
              <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                All tickets have been purchased for the Oasis Raffle. Better luck next time!
              </p>
              <p className="font-['Mountains_of_Christmas',cursive] text-[32px] leading-[40px] text-white">
                Winners will be announced on Dec 24th 2025!
              </p>
            </div>
          ) : !showSuccess ? (
            <div className="flex flex-col gap-4 items-center">
              <div className="flex flex-col gap-4 items-center text-center">
                <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                  X-mas Roffle
                </p>
                <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                  Participate in the Oasis Raffle! The initial pot is 100,000 ROSE and grows with each ticket
                  purchased which costs {formatEther(ticketPrice.data)} ROSE.
                </p>
              </div>

              {!isConnected ? (
                <div className="styledConnect bigButton [&_button]:w-full">
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
                        <div className="relative w-full">
                          <select
                            value={ticketAmount}
                            onChange={e => setTicketAmount(Number(e.target.value))}
                            className="bg-[rgba(0,0,0,0.2)] border border-black h-[48px] rounded-[12px] w-full px-[16px] py-[12px] text-white appearance-none cursor-pointer hover:bg-[rgba(0,0,0,0.3)] transition-colors"
                          >
                            {ticketOptions.map(option => (
                              <option
                                key={option.value}
                                value={option.value}
                                className="bg-[#1a3c47] text-white"
                              >
                                {option.label} ({option.price})
                              </option>
                            ))}
                          </select>
                          <div className="absolute right-[12px] top-1/2 -translate-y-1/2 pointer-events-none">
                            <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                              <path d="M8 10L12 14L16 10" stroke="white" strokeWidth="1.5" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Payment Method */}
                      <div className="flex flex-col gap-1">
                        <p className="font-medium leading-[20px] text-[14px] text-white">Pay in</p>
                        <div className="bg-[rgba(0,0,0,0.2)] border border-black h-[48px] rounded-[12px] w-full">
                          <div className="flex flex-row items-center size-full px-[12px]">
                            <div className="flex gap-[8px] items-center">
                              <div className="relative shrink-0 size-[24px]">
                                <svg
                                  className="block size-full"
                                  fill="none"
                                  preserveAspectRatio="none"
                                  viewBox="0 0 24 24"
                                >
                                  <g opacity="0.5">
                                    <path d={svgPaths.p35bbc080} fill="white" />
                                  </g>
                                </svg>
                              </div>
                              <p className="font-medium leading-[20px] text-[16px] text-white">ROSE</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const balance = accountBalance?.value ?? BigInt('0')
                      const requiredBalance =
                        BigInt(ticketAmount) *
                        250n *
                        10n ** BigInt(ROFL_PAYMASTER_DESTINATION_CHAIN_TOKEN.decimals)
                      const topUpAmount = requiredBalance - balance

                      if (requiredBalance > balance) {
                        return (
                          <TopUpButton roseAmountInBaseUnits={topUpAmount}>
                            {({ amountLabel }) =>
                              `Buy ${ticketAmount} Ticket${ticketAmount > 1 ? 's' : ''} for ${amountLabel}`
                            }
                          </TopUpButton>
                        )
                      }

                      return (
                        <button
                          onClick={handleBuyTickets}
                          disabled={buyTx.isPending || isWaitingForBuyReceipt}
                          className="bg-white hover:bg-gray-100 disabled:bg-gray-500 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
                        >
                          {buyTx.isPending || isWaitingForBuyReceipt ? (
                            <LucideLoader className="animate-spin" />
                          ) : (
                            <p className="font-medium leading-[20px] text-[16px] text-black text-center">
                              Buy {ticketAmount} Ticket{ticketAmount > 1 ? 's' : ''} for{' '}
                              {formatEther(BigInt(ticketAmount) * ticketPrice.data)} ROSE
                            </p>
                          )}
                        </button>
                      )
                    })()}

                    {buyTx.error && (
                      <p className="text-warning">
                        {(buyTx.error as BaseError).shortMessage || buyTx.error.message}
                      </p>
                    )}
                  </div>

                  <p className="font-normal leading-[18px] opacity-60 text-[12px] text-center text-white">
                    <span>{`I acknowledge and agree to the Xmas `}</span>
                    <a
                      onClick={() => setIsFaqOpen(true)}
                      className="cursor-pointer [text-decoration-skip-ink:none] [text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity"
                    >
                      Roffle rules included in the FAQ section of this app.
                    </a>
                    .
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-10 p-6 md:p-8 animate-in fade-in zoom-in-95 duration-300">
              {purchasedTickets === 10 ? (
                <div className="flex flex-col gap-8 items-center">
                  <div className="flex flex-col gap-4 items-center text-center">
                    <p className="font-['Mountains_of_Christmas',cursive] leading-[normal] text-[36px] md:text-[48px] text-white">
                      Max tickets bought
                    </p>
                    <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                      Wow, you bought the max amount of tickets for the Oasis Raffle! Good luck!
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
                      Thank you for participating in the Oasis Raffle! Good luck!
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
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Stats */}
      <div className="relative z-10 px-4 md:px-10 pb-5 pt-12">
        <div className="flex flex-col md:flex-row gap-4 max-w-[1360px] mx-auto">
          <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
            <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
              <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">Days to go</p>
              <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                {!raffleEndTime.data
                  ? ''
                  : Number(raffleEndTime.data * 1000n) < Date.now()
                    ? '0'
                    : (Number(raffleEndTime.data * 1000n) - Date.now()) / 1000 / 60 / 60 / 24 < 1
                      ? '<1'
                      : Math.floor((Number(raffleEndTime.data * 1000n) - Date.now()) / 1000 / 60 / 60 / 24)}
              </p>
            </div>
          </div>
          <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
            <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
              <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">
                Tickets left
              </p>
              <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                {ticketsRemaining.data?.toString()}
                <span
                  style={{
                    color: 'rgba(255, 255, 255, 0.30)',
                    fontSize: '32px',
                  }}
                >
                  / 3600
                </span>
              </p>
            </div>
          </div>
          <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
            <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
              <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">Pot size</p>
              <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                {raffleBalance.data?.value ? formatEther(raffleBalance.data?.value) : ''} ROSE
              </p>
            </div>
          </div>
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
