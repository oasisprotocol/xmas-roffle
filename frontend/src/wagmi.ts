import { connectorsForWallets, Wallet } from '@rainbow-me/rainbowkit'
import { defineChain, http } from 'viem'
import { arbitrum, base, mainnet, sapphire } from 'wagmi/chains'
import { Config, createConfig } from 'wagmi'
import { metaMaskWallet, rabbyWallet, walletConnectWallet } from '@rainbow-me/rainbowkit/wallets'
import { isMetaMaskInjected, isMobileDevice } from './lib'

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

const metaMaskWalletWithoutDeeplinks = (options: { projectId: string }): Wallet => {
  const wallet = walletConnectWallet({
    ...options,
    options: {
      metadata: {
        name: 'MetaMask',
        description: 'Connect with MetaMask',
        url: window.location.origin,
        icons: [
          'https://images.ctfassets.net/clixtyxoaeas/4rnpEzy1ATWRKVBOLxZ1Fm/a74dc1eed36d23d7ea6030383a4d5163/MetaMask-icon-fox.svg',
        ],
      },
    },
  })

  return {
    ...wallet,
    iconUrl:
      'https://raw.githubusercontent.com/rainbow-me/rainbowkit/refs/heads/main/packages/rainbowkit/src/wallets/walletConnectors/metaMaskWallet/metaMaskWallet.svg',
    iconBackground: '#f6851b',
    mobile: wallet.mobile || {
      getUri: (uri: string) => uri,
    },
    desktop: wallet.desktop || {
      getUri: (uri: string) => uri,
    },
    qrCode: wallet.qrCode || {
      getUri: (uri: string) => uri,
    },
  }
}

// MetaMask wallet that uses WalletConnect on mobile, native MetaMask on desktop
const createMetaMaskWallet = (options: { projectId: string }): Wallet => {
  if (isMobileDevice() && !isMetaMaskInjected()) {
    return metaMaskWalletWithoutDeeplinks(options)
  }

  return metaMaskWallet(options)
}

const connectors = connectorsForWallets(
  [
    {
      groupName: 'Recommended',
      wallets: [createMetaMaskWallet, walletConnectWallet, rabbyWallet],
    },
  ],
  {
    appName: 'Oasis Bridge',
    projectId: '5c76ff8764ea097205fffc221f056c98',
  }
)

export const config: Config = createConfig({
  chains: [
    {
      ...sapphire,
      name: 'Sapphire',
      iconUrl: 'https://assets.oasis.io/logotypes/metamask-oasis-sapphire.png',
    },
    base,
    arbitrum,
    mainnet,
  ],
  connectors,
  transports: {
    [sapphire.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [mainnet.id]: http(),
  },
  multiInjectedProviderDiscovery: false, // Disable auto-discovery of injected providers
  ssr: false,
  batch: {
    multicall: false,
  },
})
