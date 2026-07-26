import { expect } from "chai";
import { network } from "hardhat";
import type {
  BigNumberish,
  ContractRunner,
  ContractTransactionResponse,
  Interface,
} from "ethers";

const { ethers } = await network.create();

const studentId = (id: string) => ethers.keccak256(ethers.toUtf8Bytes(id));
const S1 = studentId("s1");
const S2 = studentId("s2");

interface Erc20Test {
  getAddress(): Promise<string>;
  mint(to: string, amount: BigNumberish): Promise<ContractTransactionResponse>;
  approve(spender: string, amount: BigNumberish): Promise<ContractTransactionResponse>;
  transfer(to: string, amount: BigNumberish): Promise<ContractTransactionResponse>;
  connect(runner: ContractRunner | null): Erc20Test;
}

interface ClassroomStakingTest {
  getAddress(): Promise<string>;
  interface: Interface;
  startRound(
    stakeAmount: BigNumberish,
    rewardAmount: BigNumberish,
    penaltyAmount: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  lockRound(): Promise<ContractTransactionResponse>;
  stake(studentId: string): Promise<ContractTransactionResponse>;
  resolveCorrect(studentId: string): Promise<ContractTransactionResponse>;
  resolveWrong(studentId: string): Promise<ContractTransactionResponse>;
  fundPool(amount: BigNumberish): Promise<ContractTransactionResponse>;
  getRoundStakers(): Promise<string[]>;
  roundStatus(): Promise<bigint>;
  roundId(): Promise<bigint>;
  rewardPool(): Promise<bigint>;
  stakedAmountOf(studentId: string): Promise<bigint>;
  connect(runner: ContractRunner | null): ClassroomStakingTest;
}

async function deployFixture(decimals = 18) {
  const [owner, walletA, walletB, walletC, stranger] = await ethers.getSigners();

  const token = (await ethers.deployContract("MockERC20", [
    "Mock Token",
    "MOCK",
    decimals,
  ])) as unknown as Erc20Test;
  const staking = (await ethers.deployContract("ClassroomStaking", [
    await token.getAddress(),
    owner.address,
  ])) as unknown as ClassroomStakingTest;

  const unit = 10n ** BigInt(decimals);
  const mintAmount = 10_000n * unit;
  for (const signer of [owner, walletA, walletB, walletC]) {
    await token.mint(signer.address, mintAmount);
    await token
      .connect(signer)
      .approve(await staking.getAddress(), ethers.MaxUint256);
  }

  return { owner, walletA, walletB, walletC, stranger, token, staking, unit };
}

describe("ClassroomStaking", function () {
  for (const decimals of [18, 6]) {
    describe(`with ${decimals}-decimal token`, function () {
      it("runs the correct-answer happy path: payout, pool decrease, auto-refund stragglers, round closes", async function () {
        const { owner, walletA, walletB, staking, token, unit } =
          await deployFixture(decimals);

        const stakeAmount = 100n * unit;
        const rewardAmount = 20n * unit;
        const penaltyAmount = 30n * unit;

        await token.connect(owner).approve(await staking.getAddress(), ethers.MaxUint256);
        await staking.fundPool(rewardAmount);

        await staking.startRound(stakeAmount, rewardAmount, penaltyAmount);
        await staking.connect(walletA).stake(S1);
        await staking.connect(walletB).stake(S2);
        await staking.lockRound();

        await expect(staking.resolveCorrect(S1)).to.changeTokenBalances(
          ethers,
          token,
          [walletA, walletB, staking],
          [stakeAmount + rewardAmount, stakeAmount, -(stakeAmount + rewardAmount + stakeAmount)],
        );

        expect(await staking.rewardPool()).to.equal(0n);
        expect(await staking.roundStatus()).to.equal(3n); // Closed
        expect(await staking.stakedAmountOf(S1)).to.equal(0n);
        expect(await staking.stakedAmountOf(S2)).to.equal(0n);
      });

      it("runs the wrong-answer happy path: partial refund, pool increase, stays open until all resolved", async function () {
        const { walletA, walletB, staking, token, owner, unit } =
          await deployFixture(decimals);

        const stakeAmount = 100n * unit;
        const penaltyAmount = 30n * unit;

        await staking.startRound(stakeAmount, 0n, penaltyAmount);
        await staking.connect(walletA).stake(S1);
        await staking.connect(walletB).stake(S2);
        await staking.lockRound();

        await expect(staking.resolveWrong(S1)).to.changeTokenBalance(
          ethers,
          token,
          walletA,
          stakeAmount - penaltyAmount,
        );
        expect(await staking.rewardPool()).to.equal(penaltyAmount);
        expect(await staking.roundStatus()).to.equal(2n); // still Locked

        await staking.resolveWrong(S2);
        expect(await staking.rewardPool()).to.equal(penaltyAmount * 2n);
        expect(await staking.roundStatus()).to.equal(3n); // Closed after last resolution
        void owner;
      });

      it("enforces permanent wallet<->student binding in both directions", async function () {
        const { walletA, walletB, staking, unit } = await deployFixture(decimals);
        const stakeAmount = 50n * unit;

        await staking.startRound(stakeAmount, 0n, 0n);
        await staking.connect(walletA).stake(S1);

        // same wallet, different student -> rejected
        await staking.lockRound();
        await staking.startRound(stakeAmount, 0n, 0n);
        await expect(staking.connect(walletA).stake(S2))
          .to.be.revertedWithCustomError(staking, "WalletAlreadyBound")
          .withArgs(S1);

        // different wallet, already-bound student -> rejected
        await expect(staking.connect(walletB).stake(S1))
          .to.be.revertedWithCustomError(staking, "StudentAlreadyBound")
          .withArgs(walletA.address);
      });

      it("reverts startRound on bad config: penalty > stake, or reward > pool", async function () {
        const { staking, unit } = await deployFixture(decimals);

        await expect(
          staking.startRound(100n * unit, 0n, 150n * unit),
        ).to.be.revertedWithCustomError(staking, "PenaltyExceedsStake");

        await expect(
          staking.startRound(100n * unit, 10n * unit, 0n),
        ).to.be.revertedWithCustomError(staking, "InsufficientPool");
      });

      it("force-closes and refunds an abandoned round when a new one starts", async function () {
        const { walletA, walletB, staking, token, unit } = await deployFixture(decimals);
        const stakeAmount = 40n * unit;

        await staking.startRound(stakeAmount, 0n, 0n);
        await staking.connect(walletA).stake(S1);
        // walletB never stakes; teacher forgets to lock/resolve and asks a new question

        await expect(staking.startRound(stakeAmount, 0n, 0n)).to.changeTokenBalance(
          ethers,
          token,
          walletA,
          stakeAmount, // refunded in full
        );
        expect(await staking.roundId()).to.equal(2n);
        expect((await staking.getRoundStakers()).length).to.equal(0);

        // wallet A can stake again in the fresh round (already bound to S1, that's fine)
        await staking.connect(walletA).stake(S1);
        expect(await staking.stakedAmountOf(S1)).to.equal(stakeAmount);
        void walletB;
      });

      it("gates all admin functions to the owner", async function () {
        const { stranger, staking, unit } = await deployFixture(decimals);

        await expect(
          staking.connect(stranger).startRound(10n * unit, 0n, 0n),
        ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");

        await staking.startRound(10n * unit, 0n, 0n);
        await expect(
          staking.connect(stranger).lockRound(),
        ).to.be.revertedWithCustomError(staking, "OwnableUnauthorizedAccount");
      });
    });
  }

  it("prevents locking a round with no stakers", async function () {
    const { staking, unit } = await deployFixture();
    await staking.startRound(10n * unit, 0n, 0n);
    await expect(staking.lockRound()).to.be.revertedWithCustomError(
      staking,
      "NoStakers",
    );
  });
});
