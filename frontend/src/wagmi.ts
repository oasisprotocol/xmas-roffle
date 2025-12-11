import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem'
import { sapphire, sapphireTestnet } from 'wagmi/chains';

export const sapphireLocalnet = defineChain({
	id: 0x5afd,
	name: 'Sapphire Localnet',
	nativeCurrency: {
		decimals: 18,
		name: 'TEST',
		symbol: 'TEST'
	},
	rpcUrls: {
		default: {
			http: ['http://localhost:8545']
		},
		public: {
			http: ['http://localhost:8545']
		}
	}
});

export const config = getDefaultConfig({
  appName: 'Xmas Raffle',
  projectId: '5c76ff8764ea097205fffc221f056c98',
  // TODO: mainnet
  chains: [sapphireTestnet],
  ssr: false,
  batch: {
    multicall: false,
  },
});

