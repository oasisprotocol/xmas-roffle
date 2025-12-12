import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { defineChain } from 'viem'
import { sapphire, sapphireTestnet, base } from 'wagmi/chains'
import { Config } from 'wagmi'

export const sapphireLocalnet = defineChain({
  id: 0x5afd,
  name: 'Sapphire Localnet',
  nativeCurrency: {
    decimals: 18,
    name: 'TEST',
    symbol: 'TEST',
  },
  rpcUrls: {
    default: {
      http: ['http://localhost:8545'],
    },
    public: {
      http: ['http://localhost:8545'],
    },
  },
})

export const config: Config = getDefaultConfig({
  appName: 'Xmas Roffle',
  projectId: '5c76ff8764ea097205fffc221f056c98',
  chains: [sapphire, base],
  ssr: false,
  batch: {
    multicall: false,
  },
})
