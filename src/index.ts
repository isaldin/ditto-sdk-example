import { ethers } from 'ethers';
import {
  Chain,
  EthersContractFactory,
  EthersSigner,
  InMemoryStorage,
  PriceTrigger,
  Provider,
  SmartWalletFactory,
  TimeBasedTrigger,
  TimeScale,
  tokens,
  UniswapSwapActionCallDataBuilder,
  WorkflowsFactory,
} from '@ditto-network/core';

(async () => {
  const chainId = Chain.Polygon;

  const provider = new ethers.JsonRpcProvider(process.env.INFURA_API_URL!, chainId);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  const storage = new InMemoryStorage();
  const dittoProvider = new Provider({
    signer: new EthersSigner(wallet),
    storage,
    contractFactory: new EthersContractFactory(wallet),
  });

  const needAuth = await dittoProvider.needAuthentication();
  if (needAuth) {
    await dittoProvider.authenticate();
  }

  const accountAddress = await dittoProvider.getSigner().getAddress();

  const swFactory = new SmartWalletFactory(dittoProvider, chainId);
  const vault = await swFactory.getDefaultOrCreateVault(chainId);
  const vaultAddress = vault.address;

  const commonConfig = {
    chainId,
    recipient: vaultAddress,
    accountAddress,
    vaultAddress,
    provider: dittoProvider,
  };

  const workflowsFactory = new WorkflowsFactory(dittoProvider);

  const wmatic = tokens.wrappedNative[Chain.Polygon];
  const usdt = tokens.stableCoins[Chain.Polygon].USDT;

  const timeTrigger = new TimeBasedTrigger(
      {
        repeatTimes: 4,
        startAtTimestamp: new Date().getTime() / 1000 + 120,
        cycle: {
          frequency: 1,
          scale: TimeScale.Minutes,
        },
      },
      commonConfig
  );

  // rate = how much of fromToken you should pay to get one toToken
  // rate should be:
  // a) higher than triggerAtPrice if priceMustBeHigherThan is true
  // b) lower than triggerAtPrice if priceMustBeHigherThan is false
  // in this case rate is 0.88 (0.88 USDT for 1 WMATIC)
  // triggerAtPrice is 0.3 (300000 / 1e6)
  // current rate is higher than triggerAtPrice and priceMustBeHigherThan is true so the trigger should be triggered
  const priceTrigger = new PriceTrigger(
      {
        uniswapPoolFeeTier: 3000,
        triggerAtPrice: '300000',
        priceMustBeHigherThan: true,
        fromToken: usdt,
        toToken: wmatic,
      },
      commonConfig
  );

  const usePriceTrigger = true;

  const wf = await workflowsFactory.create({
    name: 'My first workflow',
    triggers: [usePriceTrigger ? priceTrigger : timeTrigger],
    actions: [
      new UniswapSwapActionCallDataBuilder(
          {
            fromToken: wmatic,
            toToken: usdt,
            fromAmount: `444444321000000`,
            slippagePercent: 0.05,
            providerStrategy: {
              type: 'nodejs',
              chainId: chainId,
              rpcUrl: process.env.INFURA_API_URL!,
            },
          },
          commonConfig
      ),
    ],
    chainId,
  });

  const hash = await wf.buildAndDeploy(commonConfig.vaultAddress, commonConfig.accountAddress);
  console.log('Workflow hash:', hash);
})();
