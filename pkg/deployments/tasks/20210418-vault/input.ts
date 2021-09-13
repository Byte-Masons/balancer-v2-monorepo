import Task from '../../src/task';
import { MONTH } from '@balancer-labs/v2-helpers/src/time';

export type VaultDeployment = {
  Authorizer: string;
  weth: string;
  pauseWindowDuration: number;
  bufferPeriodDuration: number;
};

const Authorizer = new Task('20210418-authorizer');

export default {
  goerli: {
    Authorizer,
    weth: '0xdFCeA9088c8A88A76FF74892C1457C17dfeef9C1',
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  kovan: {
    Authorizer,
    weth: '0xdFCeA9088c8A88A76FF74892C1457C17dfeef9C1',
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  mainnet: {
    Authorizer,
    weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  rinkeby: {
    Authorizer,
    weth: '0xdFCeA9088c8A88A76FF74892C1457C17dfeef9C1',
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  ropsten: {
    Authorizer,
    weth: '0xdFCeA9088c8A88A76FF74892C1457C17dfeef9C1',
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  polygon: {
    Authorizer,
    weth: '0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270', // WMATIC
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  opera: {
    Authorizer,
    weth: '0x21be370d5312f44cb42ce377bc9b8a0cef1a4c83', // WFTM
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
  ftmTestnet: {
    Authorizer,
    weth: '0x80dD2B80FbcFB06505A301d732322e987380EcD6', // WFTM
    pauseWindowDuration: 3 * MONTH,
    bufferPeriodDuration: MONTH,
  },
};
