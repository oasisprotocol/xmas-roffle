import { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import svgPaths from "./imports/svg-tho7mppomn";
import { BaseError, useAccount, useBalance, useConfig, useReadContract, useWriteContract } from 'wagmi';
import RoffleJson from '../../artifacts/contracts/Roffle.sol/Roffle.json';
import { Roffle$Type } from '../../artifacts/contracts/Roffle.sol/Roffle.ts';
import { formatEther, parseEther } from 'viem';
import { waitForTransactionReceipt } from 'viem/actions';

const typedRoffleJson = RoffleJson as Roffle$Type

// TODO: mainnet
const RAFFLE_CONTRACT_ADDRESS = '0x0165878A594ca255338adfa4d48449f69242Eb8F' as `0x${string}`;

function TicketDecoration({ color, rotation, position }: { color: string; rotation: string; position: string }) {
  return (
    <div className={`absolute ${position}`} style={{ transform: `rotate(${rotation})` }}>
      <svg className="block w-[120px] h-[60px] md:w-[160px] md:h-[80px]" fill="none" preserveAspectRatio="none" viewBox="0 0 160 80">
        <g filter={`url(#noise-${color})`}>
          <path d={svgPaths.p3416cc80} fill={color} />
        </g>
        <defs>
          <filter colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" height="80" id={`noise-${color}`} width="160" x="0" y="0">
            <feFlood floodOpacity="0" result="BackgroundImageFix" />
            <feBlend in="SourceGraphic" in2="BackgroundImageFix" mode="normal" result="shape" />
            <feTurbulence baseFrequency="4 4" numOctaves="3" result="noise" seed="4641" stitchTiles="stitch" type="fractalNoise" />
            <feColorMatrix in="noise" result="alphaNoise" type="luminanceToAlpha" />
            <feComponentTransfer in="alphaNoise" result="coloredNoise1">
              <feFuncA type="discrete" />
            </feComponentTransfer>
            <feComposite in="coloredNoise1" in2="shape" operator="in" result="noise1Clipped" />
            <feFlood floodColor="rgba(0, 0, 0, 0.25)" result="color1Flood" />
            <feComposite in="color1Flood" in2="noise1Clipped" operator="in" result="color1" />
            <feMerge result="effect1_noise">
              <feMergeNode in="shape" />
              <feMergeNode in="color1" />
            </feMerge>
          </filter>
        </defs>
      </svg>
      <p className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[32px] md:text-[46px] text-neutral-800 font-['IBM_Plex_Mono',monospace]">250</p>
    </div>
  );
}

function TicketsHeader() {
  const tickets = [
    { color: '#FFF47E', rotation: '0deg', position: 'left-[5%] top-[10%]' },
    { color: '#71E1E2', rotation: '346deg', position: 'left-[15%] top-[15%]' },
    { color: '#FF8EE6', rotation: '14deg', position: 'left-[25%] top-[5%]' },
    { color: '#FFF47E', rotation: '330deg', position: 'left-[35%] top-[18%]' },
    { color: '#71E1E2', rotation: '10deg', position: 'left-[45%] top-[8%]' },
    { color: '#FF8EE6', rotation: '343deg', position: 'left-[55%] top-[12%]' },
    { color: 'white', rotation: '15deg', position: 'left-[65%] top-[6%]' },
    { color: '#FFF47E', rotation: '338deg', position: 'left-[75%] top-[16%]' },
    { color: '#71E1E2', rotation: '13deg', position: 'left-[85%] top-[9%]' },
    { color: 'white', rotation: '347deg', position: 'left-[95%] top-[14%]' },
  ];

  return (
    <div className="absolute h-[180px] md:h-[240px] left-1/2 overflow-hidden top-0 -translate-x-1/2 w-full max-w-[910px] pointer-events-none">
      {tickets.map((ticket, i) => (
        <TicketDecoration key={i} {...ticket} />
      ))}
    </div>
  );
}

export function App() {
  const { isConnected } = useAccount()
  const config = useConfig()
  const [ticketAmount, setTicketAmount] = useState(1);
  const [showSuccess, setShowSuccess] = useState(false);
  const [purchasedTickets, setPurchasedTickets] = useState(0);

  const raffleBalance = useBalance({
    address: RAFFLE_CONTRACT_ADDRESS,
  })
  const ticketPrice = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'TICKET_PRICE',
  });
  const raffleEndTime = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'raffleEndTime',
  });
  const ticketsRemaining = useReadContract({
    address: RAFFLE_CONTRACT_ADDRESS,
    abi: typedRoffleJson.abi,
    functionName: 'getTicketsRemaining',
    query: {
      refetchInterval: 60_000,
    },
  });
  const enterTx = useWriteContract();

  if (!ticketPrice.data) return
  if (!raffleEndTime.data) return

  const ticketOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(v => (
    { value: v, label: v + ' ticket', price: formatEther(BigInt(v) * ticketPrice.data) + ' ROSE' }
  ));

  const handleBuyTickets = async () => {
    ticketsRemaining.refetch()
    try {
      const hash = await enterTx.writeContractAsync({
        address: RAFFLE_CONTRACT_ADDRESS,
        abi: typedRoffleJson.abi,
        functionName: 'buyTickets',
        args: [BigInt(ticketAmount)],
        value: BigInt(ticketAmount) * ticketPrice.data,
      });
      const transactionReceipt = await waitForTransactionReceipt(config.getClient(), { hash })
      if (transactionReceipt.status === 'success') {
        setPurchasedTickets(prev => prev + ticketAmount);
        setShowSuccess(true);
        ticketsRemaining.refetch()
      } else {
        console.log('reverted', transactionReceipt)
        alert('Transaction reverted. Check explorer.oasis.io to see error message')
        // Would need grpc or nexus to get the reason.
      }
    } catch (error) {
      // TODO: handle user rejection
      console.error('error', error)
      alert((error as BaseError).shortMessage || (error as Error).message)
    }
  };

  const handleBuyMore = () => {
    setShowSuccess(false);
  };

  const shareOnLinkedIn = () => {
    window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + encodeURIComponent(window.location.href), '_blank');
  };

  const shareOnX = () => {
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent('I just entered the Oasis X-mas Raffle!'), '_blank');
  };

  return (
    <div
      className="relative w-full min-h-screen flex flex-col font-['Geist',Helvetica]"
      style={{
        background: 'radial-gradient(50% 50% at 50% 50%, #19323C 0%, #0A1D24 100%)'
      }}
    >
      {/* Header */}
      <header className="relative z-20 flex items-center justify-between px-4 md:px-10 pt-6 pb-[70px]">
        {/* Logo */}
        <div className="h-[40px] w-[110px] md:h-[48px] md:w-[131px]">
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

        {/* Wallet */}
        <div className='styledConnect'>
          <ConnectButton />
        </div>
      </header>

      {/* Ticket Decorations */}
      <TicketsHeader />

      {/* Main Content Area */}
      <main className="relative flex-1 flex flex-col items-center justify-center px-4 py-20 md:py-0">
        <div className="w-full max-w-[410px] mx-auto">
          {!showSuccess ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-4 items-center text-center">
                <p className="font-['Mountains_of_Christmas',cursive] text-[40px] leading-[48px] md:text-[56px] md:leading-[64px] text-white">X-mas Roffle</p>
                <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">Participate in the Oasis Raffle! The initial pot is 100,000 ROSE and grows with each ticket purchased which costs {formatEther(ticketPrice.data)} ROSE.</p>
              </div>

              {!isConnected ?
                <div className='styledConnect bigButton [&_button]:w-full'>
                  <ConnectButton />
                </div>
                :
                <>
                  <div className="flex flex-col gap-6 mt-4">
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
                            onChange={(e) => setTicketAmount(Number(e.target.value))}
                            className="bg-[rgba(0,0,0,0.2)] border border-black h-[48px] rounded-[12px] w-full px-[16px] py-[12px] text-white appearance-none cursor-pointer hover:bg-[rgba(0,0,0,0.3)] transition-colors"
                          >
                            {ticketOptions.map((option) => (
                              <option key={option.value} value={option.value} className="bg-[#1a3c47] text-white">
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
                                <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
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

                    <button
                      onClick={handleBuyTickets}
                      className="bg-white hover:bg-gray-100 transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
                    >
                      <p className="font-medium leading-[20px] text-[16px] text-black text-center">
                        Buy {ticketAmount} Ticket{ticketAmount > 1 ? 's' : ''} for {formatEther(BigInt(ticketAmount) * ticketPrice.data)} ROSE
                      </p>
                    </button>
                  </div>

                  <p className="font-normal leading-[18px] opacity-60 text-[12px] text-center text-white">
                    <span>{`I acknowledge and agree to the Xmas `}</span>
                    <a href="#faq" className="[text-decoration-skip-ink:none] [text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity">Roffle rules included in the FAQ section of this app.</a>.
                  </p>
                </>
              }

            </div>
          ) : (
            <div className="flex flex-col gap-10 bg-[rgba(0,0,0,0.3)] backdrop-blur-md p-6 md:p-8 rounded-2xl border border-white/10 animate-in fade-in zoom-in-95 duration-300">
              <div className="flex flex-col gap-8 items-center">
                <div className="flex flex-col gap-4 items-center text-center">
                  <p className="font-['Mountains_of_Christmas',cursive] leading-[normal] text-[36px] md:text-[48px] text-white">Participation Successful!</p>
                  <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)]">Thank you for participating in the Oasis Raffle! Good luck!</p>
                </div>
                <button
                  onClick={handleBuyMore}
                  className="bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.15)] transition-colors flex h-[64px] items-center justify-center px-4 py-2 rounded-[12px] w-full"
                >
                  <p className="font-medium leading-[20px] text-[16px] text-white">Buy more tickets</p>
                </button>
              </div>

              <div className="flex flex-col gap-6 items-center">
                <p className="font-normal leading-[20px] text-[16px] text-[rgba(255,255,255,0.6)] text-center">Share on social media</p>
                <div className="flex flex-col gap-6 w-full">
                  <button
                    onClick={shareOnLinkedIn}
                    className="bg-white hover:bg-gray-100 transition-colors flex h-[48px] items-center justify-between pl-4 pr-2 py-2 rounded-[12px] w-full"
                  >
                    <div className="relative shrink-0 size-[24px]">
                      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
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
                      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 24 24">
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
              <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">{
                !raffleEndTime.data
                  ? ''
                  : Number(raffleEndTime.data*1000n) < Date.now()
                    ? '0'
                    : (Number(raffleEndTime.data*1000n) - Date.now()) / 1000 / 60 / 60 / 24 < 1
                      ? '<1'
                      : Math.floor((Number(raffleEndTime.data*1000n) - Date.now()) / 1000 / 60 / 60 / 24)
              }</p>
            </div>
          </div>
          <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
            <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
              <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">Tickets left</p>
              <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">
                {ticketsRemaining.data?.toString()}
                <span style={{
                  color: 'rgba(255, 255, 255, 0.30)',
                  fontSize: '32px',
                }}>
                  / 3600
                </span>
              </p>
            </div>
          </div>
          <div className="flex-1 bg-[rgba(0,0,0,0.15)] rounded-[12px]">
            <div className="flex flex-col items-center px-6 md:px-10 py-5 text-center">
              <p className="font-light leading-[20px] text-[14px] text-[rgba(255,255,255,0.6)]">Pot size</p>
              <p className="font-['Mountains_of_Christmas',cursive] leading-[56px] text-[48px] text-white">{raffleBalance.data?.value ? formatEther(raffleBalance.data?.value) : ''} ROSE</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Links */}
      <footer className="relative z-10 pb-6">
        <div className="flex flex-col sm:flex-row font-normal gap-4 sm:gap-4 items-center justify-center leading-[20px] text-[14px] text-center text-white px-4">
          <a href="#faq" className="[text-underline-position:from-font] decoration-solid underline hover:opacity-80 transition-opacity">Frequently Asked Questions</a>
        </div>
      </footer>
    </div>
  );
}
