import { expect } from 'chai';
import { ethers } from 'hardhat';
import { BigNumber, Contract } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import WeightedPool from '@balancer-labs/v2-helpers/src/models/pools/weighted/WeightedPool';

import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { deploy, deployedAt } from '@balancer-labs/v2-helpers/src/contract';
import { actionId } from '@balancer-labs/v2-helpers/src/models/misc/actions';
import { MAX_INT256, MAX_UINT256, ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import { BigNumberish, fp } from '@balancer-labs/v2-helpers/src/numbers';
import Vault from '../../../pvt/helpers/src/models/vault/Vault';
import {
  encodeExitWeightedPool,
  encodeJoinWeightedPool,
} from '../../../pvt/helpers/src/models/pools/weighted/encoding';

describe('BatchRelayer', function () {
  let tokens: TokenList, basePoolTokens: TokenList, metaPoolTokens: TokenList;
  let basePoolId: string, metaPoolId: string;
  let sender: SignerWithAddress, recipient: SignerWithAddress, admin: SignerWithAddress;
  let vault: Vault, relayer: Contract, basePool: WeightedPool, metaPool: WeightedPool;

  // An array of token amounts which will be added/removed to pool's balance on joins/exits
  let tokenIncrements: BigNumber[];

  before('setup signer', async () => {
    [, admin, sender, recipient] = await ethers.getSigners();
  });

  sharedBeforeEach('deploy relayer', async () => {
    vault = await Vault.create({ admin });
    relayer = await deploy('BatchRelayer', { args: [vault.address] });

    const DAI = await Token.create('DAI');
    const wethContract = await deployedAt('TestWETH', await vault.instance.WETH());
    const WETH = new Token('WETH', 'WETH', 18, wethContract);
    tokens = new TokenList([DAI, WETH].sort());

    await tokens.mint({ to: sender, amount: fp(100) });
    await tokens.approve({ to: vault.address, amount: fp(100), from: sender });
    tokenIncrements = Array(tokens.length).fill(fp(1));
  });

  sharedBeforeEach('deploy sample pool', async () => {
    basePoolTokens = new TokenList([tokens.DAI, tokens.WETH].sort());
    basePool = await WeightedPool.create({ tokens: basePoolTokens, vault });
    basePoolId = basePool.poolId;

    // Approve vault to take LP's BPT
    const bptToken = new Token('BPT', 'BPT', 18, basePool.instance);
    await bptToken.approve(vault.address, fp(100), { from: sender });

    metaPoolTokens = new TokenList([bptToken, tokens.WETH].sort());
    metaPool = await WeightedPool.create({ tokens: metaPoolTokens, vault });
    metaPoolId = metaPool.poolId;

    // Seed liquidity in pools

    await tokens.mint({ to: admin, amount: fp(200) });
    await tokens.approve({ to: vault.address, amount: MAX_UINT256, from: admin });
    await bptToken.approve(vault.address, MAX_UINT256, { from: admin });

    await basePool.init({ initialBalances: fp(100), from: admin });
    await metaPool.init({ initialBalances: fp(100), from: admin });
  });

  describe('getVault', () => {
    it('returns the given vault', async () => {
      expect(await relayer.getVault()).to.be.equal(vault.address);
    });
  });

  describe('joinAndSwap', () => {
    let joinRequest: { assets: string[]; maxAmountsIn: BigNumberish[]; userData: string; fromInternalBalance: boolean };
    let swaps: {
      poolId: string;
      assetInIndex: number;
      assetOutIndex: number;
      amount: BigNumberish;
      userData: string;
    }[];
    let assets: string[];
    let limits: BigNumberish[];
    const deadline = MAX_UINT256;

    sharedBeforeEach('build join request', async () => {
      joinRequest = {
        assets: basePoolTokens.addresses,
        maxAmountsIn: tokenIncrements,
        userData: encodeJoinWeightedPool({ kind: 'ExactTokensInForBPTOut', amountsIn: tokenIncrements, minimumBPT: 0 }),
        fromInternalBalance: false,
      };

      swaps = [
        {
          poolId: metaPoolId,
          assetInIndex: 0,
          assetOutIndex: 1,
          amount: 0,
          userData: '0x',
        },
      ];

      assets = metaPoolTokens.addresses;

      limits = assets.map(() => MAX_INT256);
    });

    context('when the relayer is allowed to join', () => {
      sharedBeforeEach('allow relayer', async () => {
        const joinAction = await actionId(vault.instance, 'joinPool');
        const batchSwapAction = await actionId(vault.instance, 'batchSwap');

        await vault.authorizer?.connect(admin).grantRoles([joinAction, batchSwapAction], relayer.address);
      });

      context('when the user did allow the relayer', () => {
        sharedBeforeEach('allow relayer', async () => {
          await vault.instance.connect(sender).setRelayerApproval(sender.address, relayer.address, true);
        });

        it('joins the pool', async () => {
          const receipt = await relayer
            .connect(sender)
            .joinAndSwap(basePoolId, recipient.address, joinRequest, swaps, assets, limits, deadline);

          expectEvent.inIndirectReceipt(await receipt.wait(), vault.instance.interface, 'PoolBalanceChanged', {
            poolId: basePoolId,
            liquidityProvider: sender.address,
          });
        });

        it("reverts if swap doesn't use BPT", async () => {
          const badAssets = basePoolTokens.addresses;
          await expect(
            relayer
              .connect(sender)
              .joinAndSwap(basePoolId, recipient.address, joinRequest, swaps, badAssets, limits, deadline)
          ).to.be.revertedWith('Must use BPT as input to swap');
        });

        it('approves the vault', async () => {
          const receipt = await relayer
            .connect(sender)
            .joinAndSwap(basePoolId, recipient.address, joinRequest, swaps, assets, limits, deadline);

          expectEvent.inIndirectReceipt(await receipt.wait(), basePool.instance.interface, 'Approval', {
            owner: relayer.address,
            spender: vault.address,
            value: MAX_UINT256,
          });
        });

        it('performs the given swap', async () => {
          const receipt = await relayer
            .connect(sender)
            .joinAndSwap(basePoolId, recipient.address, joinRequest, swaps, assets, limits, deadline);

          expectEvent.inIndirectReceipt(await receipt.wait(), vault.instance.interface, 'Swap', {
            poolId: metaPoolId,
            tokenIn: assets[swaps[0].assetInIndex],
            tokenOut: assets[swaps[0].assetOutIndex],
            // amountIn,
            // amountOut
          });
        });

        it.skip('returns any extra value to the sender', async () => {
          const previousVaultBalance = await tokens.WETH.balanceOf(vault.address);
          const previousSenderBalance = await ethers.provider.getBalance(sender.address);
          const previousRelayerBalance = await ethers.provider.getBalance(relayer.address);

          // Overwrite assets addresses to use ETH instead of WETH
          joinRequest.assets = tokens.map((token) => (token === tokens.WETH ? ZERO_ADDRESS : token.address));
          const gasPrice = 1;
          const receipt = await relayer
            .connect(sender)
            .joinAndSwap(basePool, recipient.address, joinRequest, { value: fp(10), gasPrice });

          const ethUsed = (await receipt.wait()).gasUsed.mul(gasPrice);
          const currentSenderBalance = await ethers.provider.getBalance(sender.address);
          const expectedTransferredBalance = previousSenderBalance.sub(currentSenderBalance).sub(ethUsed);

          const currentVaultBalance = await tokens.WETH.balanceOf(vault.address);
          expect(currentVaultBalance).to.be.equal(previousVaultBalance.add(expectedTransferredBalance));

          const currentRelayerBalance = await ethers.provider.getBalance(relayer.address);
          expect(currentRelayerBalance).to.be.equal(previousRelayerBalance);
        });
      });

      context('when the user did not allow the relayer', () => {
        sharedBeforeEach('disallow relayer', async () => {
          await vault.instance.connect(sender).setRelayerApproval(sender.address, relayer.address, false);
        });

        it('reverts', async () => {
          await expect(
            relayer
              .connect(sender)
              .joinAndSwap(basePoolId, recipient.address, joinRequest, swaps, assets, limits, deadline)
          ).to.be.revertedWith('USER_DOESNT_ALLOW_RELAYER');
        });
      });
    });

    context('when the relayer is not allowed to join', () => {
      sharedBeforeEach('revoke relayer', async () => {
        const action = await actionId(vault.instance, 'joinPool');
        await vault.authorizer?.connect(admin).revokeRole(action, relayer.address);
      });

      it('reverts', async () => {
        await expect(
          relayer
            .connect(sender)
            .joinAndSwap(basePoolId, recipient.address, joinRequest, swaps, assets, limits, deadline)
        ).to.be.revertedWith('SENDER_NOT_ALLOWED');
      });
    });
  });

  describe('swapAndExit', () => {
    let exitRequest: { assets: string[]; minAmountsOut: BigNumberish[]; userData: string; toInternalBalance: boolean };
    let swaps: {
      poolId: string;
      assetInIndex: number;
      assetOutIndex: number;
      amount: BigNumberish;
      userData: string;
    }[];
    let assets: string[];
    let limits: BigNumberish[];
    const swapKind = 0;
    const deadline = MAX_UINT256;

    sharedBeforeEach('build exit request', async () => {
      exitRequest = {
        assets: basePoolTokens.addresses,
        minAmountsOut: basePoolTokens.map(() => 0),
        // bptAmountIn is overwritten by the relayer
        userData: encodeExitWeightedPool({ kind: 'ExactBPTInForOneTokenOut', bptAmountIn: 0, exitTokenIndex: 1 }),
        toInternalBalance: false,
      };

      swaps = [
        {
          poolId: metaPoolId,
          assetInIndex: 1,
          assetOutIndex: 0,
          amount: fp(1),
          userData: '0x',
        },
      ];

      assets = metaPoolTokens.addresses;
      limits = [0, MAX_INT256];
    });

    context('when the relayer is allowed to swap/exit', () => {
      sharedBeforeEach('allow relayer', async () => {
        const exitAction = await actionId(vault.instance, 'exitPool');
        const batchSwapAction = await actionId(vault.instance, 'batchSwap');

        await vault.authorizer?.connect(admin).grantRoles([exitAction, batchSwapAction], relayer.address);
      });

      context('when the user did allow the relayer', () => {
        sharedBeforeEach('allow relayer', async () => {
          await vault.instance.connect(sender).setRelayerApproval(sender.address, relayer.address, true);
        });

        it('performs the given swap', async () => {
          const receipt = await relayer
            .connect(sender)
            .swapAndExit(basePoolId, recipient.address, exitRequest, swapKind, swaps, assets, limits, deadline);

          expectEvent.inIndirectReceipt(await receipt.wait(), vault.instance.interface, 'Swap', {
            poolId: metaPoolId,
            tokenIn: assets[swaps[0].assetInIndex],
            tokenOut: assets[swaps[0].assetOutIndex],
          });
        });

        it('exits the pool', async () => {
          const previousRecipientBalance = await tokens.WETH.balanceOf(recipient.address);

          const receipt = await relayer
            .connect(sender)
            .swapAndExit(basePoolId, recipient.address, exitRequest, swapKind, swaps, assets, limits, deadline);

          expectEvent.inIndirectReceipt(await receipt.wait(), vault.instance.interface, 'PoolBalanceChanged', {
            poolId: basePoolId,
            liquidityProvider: sender.address,
          });

          const currentRecipientBalance = await tokens.WETH.balanceOf(recipient.address);

          expect(currentRecipientBalance).to.be.gt(previousRecipientBalance);
        });

        it("doesn't leave dust BPT on the sender", async () => {
          const previousSenderBalance = await basePool.balanceOf(sender.address);

          await relayer
            .connect(sender)
            .swapAndExit(basePoolId, recipient.address, exitRequest, swapKind, swaps, assets, limits, deadline);

          const currentSenderBalance = await basePool.balanceOf(sender.address);

          expect(currentSenderBalance).to.be.eq(previousSenderBalance);
        });
      });

      context('when the user did not allow the relayer', () => {
        sharedBeforeEach('disallow relayer', async () => {
          await vault.instance.connect(sender).setRelayerApproval(sender.address, relayer.address, false);
        });

        it('reverts', async () => {
          await expect(
            relayer
              .connect(sender)
              .swapAndExit(basePoolId, recipient.address, exitRequest, swapKind, swaps, assets, limits, deadline)
          ).to.be.revertedWith('USER_DOESNT_ALLOW_RELAYER');
        });
      });
    });

    context('when the relayer is not allowed to swap', () => {
      it('reverts', async () => {
        await expect(
          relayer
            .connect(sender)
            .swapAndExit(basePoolId, recipient.address, exitRequest, swapKind, swaps, assets, limits, deadline)
        ).to.be.revertedWith('SENDER_NOT_ALLOWED');
      });
    });
  });
});
