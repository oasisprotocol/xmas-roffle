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
import ticketsNoo_svg from './assets/ticketsNoo.svg'
import { LucideLoader } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from './components/index.ts'
import { FAQ } from './FAQ.tsx'
import { TopUpButton } from './components/TopUpButton'
import { base, sapphire } from 'wagmi/chains'
import { ROFL_PAYMASTER_TOKEN_CONFIG, RoflPaymasterTokenConfig } from './constants/rofl-paymaster-config.ts'

const typedRoffleJson = RoffleJson as Roffle$Type

type PayInOption = 'ROSE' | 'USDT_BASE' | 'USDC_BASE'

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
  const [showError, setShowError] = useState<{ txHash: `0x${string}`; message?: string } | undefined>(
    undefined
  )
  const [purchasedTickets, setPurchasedTickets] = useState(0)
  const [isFaqOpen, setIsFaqOpen] = useState(false)
  const [payIn, setPayIn] = useState<PayInOption>('ROSE')
  const payInLabel =
    payIn === 'ROSE'
      ? { symbol: 'ROSE' as const, suffix: null as null | string }
      : payIn === 'USDT_BASE'
        ? { symbol: 'USDT' as const, suffix: 'on Base' }
        : { symbol: 'USDC' as const, suffix: 'on Base' }

  const raffleBalance = useBalance({
    address: RAFFLE_CONTRACT_ADDRESS,
  })
  const initialPot = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'opfContribution',
  })
  const maxTotalTickers = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'MAX_TOTAL_TICKETS',
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
        setShowError({ txHash: hash })
        // Would need grpc or nexus to get the reason. Show link to explorer instead.
      }
    } catch (error) {
      console.error('error', error)
      setShowError({ txHash: hash, message: (error as BaseError).shortMessage || (error as Error).message })
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
      'https://twitter.com/intent/tweet?text=' + encodeURIComponent('I just entered the Oasis Xmas Roffle!'),
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
          {showError ? (
            <img src={ticketsNoo_svg} />
          ) : showSuccess ? (
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
        </div>

        {/* Wallet */}
        <div className="styledConnect shrink-0">
          <ConnectButton />
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-20 md:py-0">
        <div className="w-full max-w-[670px] mx-auto">
          {showError ? (
            <div className="flex flex-col gap-8 items-center">
              <div className="flex flex-col gap-4 items-center text-center">
                <p className="font-['Mountains_of_Christmas',cursive] leading-[normal] text-[36px] md:text-[48px] text-white max-w-[400px]">
                  Something went wrong...
                </p>
                <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">
                  Oops! Your ticket purchase failed. Click below to try again.
                </p>
                {showError.message ? (
                  <pre>{showError.message}</pre>
                ) : (
                  <a
                    href={`https://explorer.oasis.io/mainnet/sapphire/tx/${showError.txHash}`}
                    target="_blank"
                    className="[text-decoration-skip-ink:none] [text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity"
                  >
                    See why transaction was reverted in Oasis Explorer
                  </a>
                )}
              </div>
              <button
                onClick={() => setShowError(undefined)}
                className="bg-white hover:bg-gray-100 disabled:bg-gray-500 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
              >
                <p className="font-medium leading-[20px] text-[16px] text-black text-center">
                  Back to Raffle
                </p>
              </button>
            </div>
          ) : hasEnded ? (
            <div className="flex flex-col gap-4 items-center text-center">
              <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">
                Xmas Roffle has ended
              </p>
            </div>
          ) : hasSoldOut ? (
            <div className="flex flex-col gap-4 items-center text-center">
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
                  Participate in the Oasis Christmas raffle! The initial pot is {initialPot?.data ? formatEther(initialPot.data) : '...'} ROSE and grows with
                  each ticket purchased which costs {formatEther(ticketPrice.data)} ROSE.
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

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              className="bg-[rgba(0,0,0,0.2)] border border-black h-[48px] rounded-[12px] w-full px-[16px] py-[12px] flex items-center justify-between hover:bg-[rgba(0,0,0,0.6)] transition-colors"
                            >
                              <span className="flex gap-[8px] items-center">
                                <span className="relative shrink-0 size-[24px]">
                                  {payIn === 'ROSE' && (
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
                                  )}
                                  {payIn === 'USDC_BASE' && (
                                    <div className="w-6 h-6 flex justify-center items-center">
                                      <svg
                                        width="19"
                                        height="18"
                                        viewBox="0 0 19 18"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <path
                                          d="M12.3225 10.4023C12.3225 8.65681 11.273 8.05135 9.17304 7.80154C7.67194 7.6019 7.37304 7.20154 7.37304 6.50226C7.37304 5.80299 7.87267 5.35135 8.87194 5.35135C9.77304 5.35135 10.2727 5.65135 10.5225 6.4019C10.5493 6.47421 10.5977 6.53654 10.6611 6.58044C10.7245 6.62434 10.7999 6.6477 10.877 6.64735H11.6767C11.723 6.64855 11.7691 6.64032 11.8121 6.62314C11.8551 6.60597 11.8942 6.58022 11.927 6.54746C11.9597 6.5147 11.9855 6.47562 12.0026 6.43259C12.0198 6.38956 12.0281 6.34349 12.0269 6.29717V6.24808C11.9302 5.70616 11.6574 5.21132 11.2506 4.84044C10.8438 4.46957 10.3259 4.24344 9.7774 4.19717V2.99717C9.7774 2.79754 9.62685 2.64808 9.37704 2.5979H8.62649C8.42685 2.5979 8.2774 2.74735 8.22722 2.99717V4.15136C6.72285 4.35645 5.77267 5.35135 5.77267 6.60154C5.77267 8.25208 6.77304 8.90226 8.87304 9.15208C10.2727 9.4019 10.7276 9.69754 10.7276 10.5015C10.7276 11.3055 10.0283 11.8521 9.07813 11.8521C7.77776 11.8521 7.33267 11.3066 7.17776 10.5517C7.16347 10.4674 7.12005 10.3907 7.05507 10.3351C6.99009 10.2795 6.90765 10.2484 6.82213 10.2474H5.96794C5.92167 10.2463 5.87567 10.2547 5.83271 10.2719C5.78975 10.2891 5.75073 10.3149 5.718 10.3476C5.68528 10.3803 5.65952 10.4193 5.64229 10.4623C5.62506 10.5053 5.61672 10.5513 5.61776 10.5975V10.6477C5.81849 11.8979 6.61813 12.7979 8.26867 13.0477V14.2477C8.26867 14.4474 8.41813 14.5979 8.66794 14.6481H9.41849C9.61813 14.6481 9.76867 14.4975 9.81776 14.2477V13.0477C11.3178 12.7979 12.3181 11.7474 12.3181 10.3979L12.3225 10.4023Z"
                                          fill="white"
                                          fill-opacity="0.5"
                                        />
                                        <path
                                          d="M6.47192 15.6518C5.03325 15.1241 3.79128 14.1674 2.9139 12.9111C2.03652 11.6547 1.56603 10.1593 1.56603 8.62689C1.56603 7.0945 2.03652 5.59906 2.9139 4.3427C3.79128 3.08635 5.03325 2.12967 6.47192 1.60198C6.56791 1.56046 6.64854 1.48999 6.70252 1.40041C6.7565 1.31083 6.78115 1.20662 6.77301 1.10235V0.401983C6.77974 0.310117 6.75295 0.218924 6.69758 0.145307C6.64222 0.0716892 6.56205 0.0206396 6.47192 0.00161924C6.40154 -0.00572177 6.33083 0.0120524 6.27228 0.051801C4.452 0.630365 2.86306 1.77316 1.73543 3.31479C0.607801 4.85641 0 6.71688 0 8.62689C0 10.5369 0.607801 12.3974 1.73543 13.939C2.86306 15.4806 4.452 16.6234 6.27228 17.202C6.31385 17.2261 6.36056 17.2401 6.40856 17.2427C6.45657 17.2453 6.50452 17.2366 6.54847 17.2171C6.59243 17.1976 6.63115 17.168 6.66145 17.1307C6.69176 17.0933 6.71279 17.0494 6.72283 17.0023C6.77301 16.9522 6.77301 16.902 6.77301 16.8016V16.1023C6.77301 15.9518 6.62246 15.7522 6.47192 15.6518ZM11.7726 0.051801C11.731 0.0276507 11.6842 0.0137238 11.6361 0.0111644C11.5881 0.00860504 11.5401 0.0174862 11.4961 0.037078C11.4521 0.0566699 11.4134 0.0864134 11.3832 0.123867C11.3529 0.16132 11.332 0.205414 11.3221 0.252528C11.273 0.301619 11.273 0.351801 11.273 0.452164V1.15144C11.2814 1.25227 11.3129 1.34984 11.3649 1.43664C11.4169 1.52344 11.4881 1.59717 11.573 1.65216C13.0117 2.17985 14.2536 3.13653 15.131 4.39288C16.0084 5.64924 16.4789 7.14468 16.4789 8.67707C16.4789 10.2095 16.0084 11.7049 15.131 12.9613C14.2536 14.2176 13.0117 15.1743 11.573 15.702C11.4771 15.7435 11.3966 15.8141 11.3428 15.9037C11.289 15.9933 11.2646 16.0974 11.273 16.2016V16.902C11.2662 16.9937 11.2929 17.0848 11.348 17.1584C11.4032 17.232 11.4831 17.2831 11.573 17.3023C11.6434 17.3097 11.7141 17.2919 11.7726 17.2522C13.5922 16.6656 15.1789 15.517 16.3044 13.9717C17.4299 12.4263 18.0363 10.5638 18.0363 8.65198C18.0363 6.7402 17.4299 4.87767 16.3044 3.3323C15.1789 1.78694 13.5922 0.638369 11.7726 0.051801Z"
                                          fill="white"
                                          fill-opacity="0.5"
                                        />
                                      </svg>
                                    </div>
                                  )}
                                  {payIn === 'USDT_BASE' && (
                                    <div className="w-6 h-6 flex justify-center items-center">
                                      <svg
                                        width="24"
                                        height="24"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        xmlns="http://www.w3.org/2000/svg"
                                      >
                                        <path
                                          fill-rule="evenodd"
                                          clip-rule="evenodd"
                                          d="M13.4416 13.0375V13.036C13.3591 13.042 12.9338 13.0675 11.9851 13.0675C11.2276 13.0675 10.6943 13.045 10.5068 13.036V13.0383C7.59085 12.91 5.41435 12.4023 5.41435 11.7948C5.41435 11.188 7.59085 10.6803 10.5068 10.5498V12.5328C10.6973 12.5463 11.2433 12.5785 11.9978 12.5785C12.9031 12.5785 13.3568 12.541 13.4416 12.5335V10.5513C16.3516 10.681 18.5228 11.1888 18.5228 11.7948C18.5228 12.4023 16.3516 12.9085 13.4416 13.0375ZM13.4416 10.345V8.5705H17.5021V5.8645H6.44635V8.5705H10.5068V10.3443C7.20685 10.4958 4.7251 11.1498 4.7251 11.9328C4.7251 12.7158 7.20685 13.369 10.5068 13.5213V19.2078H13.4416V13.5198C16.7363 13.3683 19.2121 12.715 19.2121 11.9328C19.2121 11.1505 16.7363 10.4973 13.4416 10.345Z"
                                          fill="white"
                                          fill-opacity="0.5"
                                        />
                                      </svg>
                                    </div>
                                  )}
                                </span>

                                <span className="font-medium leading-[20px] text-[16px] text-white">
                                  {payInLabel.symbol}
                                </span>
                                {payInLabel.suffix && (
                                  <span className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.5)]">
                                    {payInLabel.suffix}
                                  </span>
                                )}
                              </span>

                              <span className="shrink-0 size-[24px] flex items-center justify-center">
                                <svg width="24" height="24" fill="none" viewBox="0 0 24 24">
                                  <path d="M8 10L12 14L16 10" stroke="white" strokeWidth="1.5" />
                                </svg>
                              </span>
                            </button>
                          </DropdownMenuTrigger>

                          <DropdownMenuContent
                            sideOffset={8}
                            align="start"
                            className="w-[var(--radix-dropdown-menu-trigger-width)] outline-none border-0 p-0 shadow-none"
                          >
                            <div className="flex flex-col">
                              <DropdownMenuItem
                                onSelect={() => setPayIn('ROSE')}
                                className="bg-[rgba(0,0,0,0.2)] border border-[#1f1f1f] h-[48px] pl-[16px] pr-[12px] py-[12px] flex items-center justify-between rounded-tl-[12px] rounded-tr-[12px] cursor-pointer select-none outline-none data-[highlighted]:bg-[rgba(255,255,255,0.06)]"
                              >
                                <span className="flex gap-[8px] items-center">
                                  <span className="relative shrink-0 size-[24px]">
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
                                  </span>
                                  <span className="font-medium leading-[20px] text-[16px] text-white">
                                    ROSE
                                  </span>
                                </span>
                                <span className="shrink-0 size-[24px]" />
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPayIn('USDT_BASE')}
                                className="bg-[rgba(0,0,0,0.2)] border-[#1f1f1f] border-x border-b h-[48px] pl-[16px] pr-[12px] py-[12px] flex items-center justify-between rounded-bl-[12px] rounded-br-[12px] cursor-pointer select-none outline-none data-[highlighted]:bg-[rgba(255,255,255,0.06)]"
                              >
                                <span className="flex gap-[8px] items-center">
                                  <div className="w-6 h-6 flex justify-center items-center">
                                    <svg
                                      width="24"
                                      height="24"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        fill-rule="evenodd"
                                        clip-rule="evenodd"
                                        d="M13.4416 13.0375V13.036C13.3591 13.042 12.9338 13.0675 11.9851 13.0675C11.2276 13.0675 10.6943 13.045 10.5068 13.036V13.0383C7.59085 12.91 5.41435 12.4023 5.41435 11.7948C5.41435 11.188 7.59085 10.6803 10.5068 10.5498V12.5328C10.6973 12.5463 11.2433 12.5785 11.9978 12.5785C12.9031 12.5785 13.3568 12.541 13.4416 12.5335V10.5513C16.3516 10.681 18.5228 11.1888 18.5228 11.7948C18.5228 12.4023 16.3516 12.9085 13.4416 13.0375ZM13.4416 10.345V8.5705H17.5021V5.8645H6.44635V8.5705H10.5068V10.3443C7.20685 10.4958 4.7251 11.1498 4.7251 11.9328C4.7251 12.7158 7.20685 13.369 10.5068 13.5213V19.2078H13.4416V13.5198C16.7363 13.3683 19.2121 12.715 19.2121 11.9328C19.2121 11.1505 16.7363 10.4973 13.4416 10.345Z"
                                        fill="white"
                                        fill-opacity="0.5"
                                      />
                                    </svg>
                                  </div>
                                  <span className="font-medium leading-[20px] text-[16px] text-white">
                                    USDT
                                  </span>
                                  <span className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.5)]">
                                    on Base
                                  </span>
                                </span>
                                <span className="shrink-0 size-[24px]" />
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPayIn('USDC_BASE')}
                                className="bg-[rgba(0,0,0,0.2)] border-[#1f1f1f] border-x border-b h-[48px] pl-[16px] pr-[12px] py-[12px] flex items-center justify-between rounded-bl-[12px] rounded-br-[12px] cursor-pointer select-none outline-none data-[highlighted]:bg-[rgba(255,255,255,0.06)]"
                              >
                                <span className="flex gap-[8px] items-center">
                                  <div className="w-6 h-6 flex justify-center items-center">
                                    <svg
                                      width="19"
                                      height="18"
                                      viewBox="0 0 19 18"
                                      fill="none"
                                      xmlns="http://www.w3.org/2000/svg"
                                    >
                                      <path
                                        d="M12.3225 10.4023C12.3225 8.65681 11.273 8.05135 9.17304 7.80154C7.67194 7.6019 7.37304 7.20154 7.37304 6.50226C7.37304 5.80299 7.87267 5.35135 8.87194 5.35135C9.77304 5.35135 10.2727 5.65135 10.5225 6.4019C10.5493 6.47421 10.5977 6.53654 10.6611 6.58044C10.7245 6.62434 10.7999 6.6477 10.877 6.64735H11.6767C11.723 6.64855 11.7691 6.64032 11.8121 6.62314C11.8551 6.60597 11.8942 6.58022 11.927 6.54746C11.9597 6.5147 11.9855 6.47562 12.0026 6.43259C12.0198 6.38956 12.0281 6.34349 12.0269 6.29717V6.24808C11.9302 5.70616 11.6574 5.21132 11.2506 4.84044C10.8438 4.46957 10.3259 4.24344 9.7774 4.19717V2.99717C9.7774 2.79754 9.62685 2.64808 9.37704 2.5979H8.62649C8.42685 2.5979 8.2774 2.74735 8.22722 2.99717V4.15136C6.72285 4.35645 5.77267 5.35135 5.77267 6.60154C5.77267 8.25208 6.77304 8.90226 8.87304 9.15208C10.2727 9.4019 10.7276 9.69754 10.7276 10.5015C10.7276 11.3055 10.0283 11.8521 9.07813 11.8521C7.77776 11.8521 7.33267 11.3066 7.17776 10.5517C7.16347 10.4674 7.12005 10.3907 7.05507 10.3351C6.99009 10.2795 6.90765 10.2484 6.82213 10.2474H5.96794C5.92167 10.2463 5.87567 10.2547 5.83271 10.2719C5.78975 10.2891 5.75073 10.3149 5.718 10.3476C5.68528 10.3803 5.65952 10.4193 5.64229 10.4623C5.62506 10.5053 5.61672 10.5513 5.61776 10.5975V10.6477C5.81849 11.8979 6.61813 12.7979 8.26867 13.0477V14.2477C8.26867 14.4474 8.41813 14.5979 8.66794 14.6481H9.41849C9.61813 14.6481 9.76867 14.4975 9.81776 14.2477V13.0477C11.3178 12.7979 12.3181 11.7474 12.3181 10.3979L12.3225 10.4023Z"
                                        fill="white"
                                        fill-opacity="0.5"
                                      />
                                      <path
                                        d="M6.47192 15.6518C5.03325 15.1241 3.79128 14.1674 2.9139 12.9111C2.03652 11.6547 1.56603 10.1593 1.56603 8.62689C1.56603 7.0945 2.03652 5.59906 2.9139 4.3427C3.79128 3.08635 5.03325 2.12967 6.47192 1.60198C6.56791 1.56046 6.64854 1.48999 6.70252 1.40041C6.7565 1.31083 6.78115 1.20662 6.77301 1.10235V0.401983C6.77974 0.310117 6.75295 0.218924 6.69758 0.145307C6.64222 0.0716892 6.56205 0.0206396 6.47192 0.00161924C6.40154 -0.00572177 6.33083 0.0120524 6.27228 0.051801C4.452 0.630365 2.86306 1.77316 1.73543 3.31479C0.607801 4.85641 0 6.71688 0 8.62689C0 10.5369 0.607801 12.3974 1.73543 13.939C2.86306 15.4806 4.452 16.6234 6.27228 17.202C6.31385 17.2261 6.36056 17.2401 6.40856 17.2427C6.45657 17.2453 6.50452 17.2366 6.54847 17.2171C6.59243 17.1976 6.63115 17.168 6.66145 17.1307C6.69176 17.0933 6.71279 17.0494 6.72283 17.0023C6.77301 16.9522 6.77301 16.902 6.77301 16.8016V16.1023C6.77301 15.9518 6.62246 15.7522 6.47192 15.6518ZM11.7726 0.051801C11.731 0.0276507 11.6842 0.0137238 11.6361 0.0111644C11.5881 0.00860504 11.5401 0.0174862 11.4961 0.037078C11.4521 0.0566699 11.4134 0.0864134 11.3832 0.123867C11.3529 0.16132 11.332 0.205414 11.3221 0.252528C11.273 0.301619 11.273 0.351801 11.273 0.452164V1.15144C11.2814 1.25227 11.3129 1.34984 11.3649 1.43664C11.4169 1.52344 11.4881 1.59717 11.573 1.65216C13.0117 2.17985 14.2536 3.13653 15.131 4.39288C16.0084 5.64924 16.4789 7.14468 16.4789 8.67707C16.4789 10.2095 16.0084 11.7049 15.131 12.9613C14.2536 14.2176 13.0117 15.1743 11.573 15.702C11.4771 15.7435 11.3966 15.8141 11.3428 15.9037C11.289 15.9933 11.2646 16.0974 11.273 16.2016V16.902C11.2662 16.9937 11.2929 17.0848 11.348 17.1584C11.4032 17.232 11.4831 17.2831 11.573 17.3023C11.6434 17.3097 11.7141 17.2919 11.7726 17.2522C13.5922 16.6656 15.1789 15.517 16.3044 13.9717C17.4299 12.4263 18.0363 10.5638 18.0363 8.65198C18.0363 6.7402 17.4299 4.87767 16.3044 3.3323C15.1789 1.78694 13.5922 0.638369 11.7726 0.051801Z"
                                        fill="white"
                                        fill-opacity="0.5"
                                      />
                                    </svg>
                                  </div>
                                  <span className="font-medium leading-[20px] text-[16px] text-white">
                                    USDC
                                  </span>
                                  <span className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.5)]">
                                    on Base
                                  </span>
                                </span>
                                <span className="shrink-0 size-[24px]" />
                              </DropdownMenuItem>
                            </div>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {payIn !== 'ROSE' && (
                      <TopUpButton
                        roseAmountInBaseUnits={BigInt(ticketAmount) * ticketPrice.data}
                        targetToken={
                          payIn === 'USDC_BASE'
                            ? ROFL_PAYMASTER_TOKEN_CONFIG[base.id].TOKENS[0]
                            : ROFL_PAYMASTER_TOKEN_CONFIG[base.id].TOKENS[1]
                        }
                        onSuccess={() => {
                          setPayIn('ROSE')
                          handleBuyTickets()
                        }}
                      >
                        {({ amountLabel }) =>
                          `Buy ${ticketAmount} ticket${ticketAmount > 1 ? 's' : ''} for ${amountLabel}`
                        }
                      </TopUpButton>
                    )}
                    {payIn === 'ROSE' && (
                      <button
                        onClick={handleBuyTickets}
                        disabled={buyTx.isPending || isWaitingForBuyReceipt}
                        className="bg-white hover:bg-gray-100 disabled:bg-gray-500 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
                      >
                        {buyTx.isPending || isWaitingForBuyReceipt ? (
                          <LucideLoader className="animate-spin" />
                        ) : (
                          <p className="font-medium leading-[20px] text-[16px] text-black text-center">
                            Buy {ticketAmount} ticket{ticketAmount > 1 ? 's' : ''} for{' '}
                            {formatEther(BigInt(ticketAmount) * ticketPrice.data)} ROSE
                          </p>
                        )}
                      </button>
                    )}

                    {buyTx.isPending && (
                      <div className="text-center text-teal-300">
                        Please, confirm the action(s) in your wallet.
                      </div>
                    )}
                    {buyTx.error && (
                      <p className="text-warning text-center">
                        {(buyTx.error as BaseError).shortMessage || buyTx.error.message}
                      </p>
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
                      Xmas Roffle rules included in the FAQ section of this app.
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
                  /{maxTotalTickers.data?.toString()}
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
