// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClassroomStaking
/// @notice Students stake an ERC-20 token to raise their hand for a question.
///         Correct answers are paid a reward from the contract's pool; wrong
///         answers forfeit a penalty into that same pool. A wallet is bound to
///         at most one student, permanently.
contract ClassroomStaking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum RoundStatus {
        None,
        Open,
        Locked,
        Closed
    }

    error RoundNotOpen();
    error RoundNotLocked();
    error PenaltyExceedsStake();
    error InsufficientPool();
    error NoStakers();
    error AlreadyStaked();
    error NotStaked();
    error WalletAlreadyBound(bytes32 boundStudent);
    error StudentAlreadyBound(address boundWallet);

    event RoundStarted(
        uint256 indexed roundId,
        uint256 stakeAmount,
        uint256 rewardAmount,
        uint256 penaltyAmount
    );
    event RoundLocked(uint256 indexed roundId);
    event Staked(
        uint256 indexed roundId,
        bytes32 indexed studentId,
        address indexed wallet,
        uint256 amount
    );
    event ResolvedCorrect(
        uint256 indexed roundId,
        bytes32 indexed studentId,
        uint256 payout
    );
    event ResolvedWrong(
        uint256 indexed roundId,
        bytes32 indexed studentId,
        uint256 forfeited,
        uint256 refunded
    );
    event RoundForceClosed(
        uint256 indexed roundId,
        bytes32 indexed studentId,
        uint256 refunded
    );
    event RoundClosed(uint256 indexed roundId);
    event PoolFunded(address indexed from, uint256 amount);

    IERC20 public immutable token;

    RoundStatus public roundStatus;
    uint256 public roundId;
    uint256 public currentStakeAmount;
    uint256 public currentRewardAmount;
    uint256 public currentPenaltyAmount;
    uint256 public rewardPool;
    uint256 public resolvedCount;

    mapping(address => bytes32) public walletToStudent;
    mapping(bytes32 => address) public studentToWallet;
    mapping(bytes32 => uint256) public stakedAmountOf;
    bytes32[] public roundStakers;

    constructor(
        address tokenAddress_,
        address initialOwner_
    ) Ownable(initialOwner_) {
        token = IERC20(tokenAddress_);
    }

    /// @notice Starts a new round. Force-closes (and refunds stragglers from)
    ///         any previous round that was never fully resolved.
    function startRound(
        uint256 stakeAmount_,
        uint256 rewardAmount_,
        uint256 penaltyAmount_
    ) external onlyOwner nonReentrant {
        if (penaltyAmount_ > stakeAmount_) revert PenaltyExceedsStake();
        if (rewardPool < rewardAmount_) revert InsufficientPool();

        if (roundStatus == RoundStatus.Open || roundStatus == RoundStatus.Locked) {
            _closeRound();
        }

        roundId += 1;
        currentStakeAmount = stakeAmount_;
        currentRewardAmount = rewardAmount_;
        currentPenaltyAmount = penaltyAmount_;
        resolvedCount = 0;
        roundStatus = RoundStatus.Open;

        emit RoundStarted(roundId, stakeAmount_, rewardAmount_, penaltyAmount_);
    }

    /// @notice Closes hand-raising for the current round. No more stakes accepted.
    function lockRound() external onlyOwner {
        if (roundStatus != RoundStatus.Open) revert RoundNotOpen();
        if (roundStakers.length == 0) revert NoStakers();

        roundStatus = RoundStatus.Locked;
        emit RoundLocked(roundId);
    }

    /// @notice Stakes the current round's stake amount to raise a hand.
    /// @param studentId keccak256 hash of the app's local student id.
    function stake(bytes32 studentId) external nonReentrant {
        if (roundStatus != RoundStatus.Open) revert RoundNotOpen();
        if (stakedAmountOf[studentId] != 0) revert AlreadyStaked();

        bytes32 boundStudent = walletToStudent[msg.sender];
        address boundWallet = studentToWallet[studentId];

        bool walletBound = boundStudent != bytes32(0);
        bool studentBound = boundWallet != address(0);

        if (walletBound && boundStudent != studentId) {
            revert WalletAlreadyBound(boundStudent);
        }
        if (studentBound && boundWallet != msg.sender) {
            revert StudentAlreadyBound(boundWallet);
        }

        if (!walletBound && !studentBound) {
            walletToStudent[msg.sender] = studentId;
            studentToWallet[studentId] = msg.sender;
        }

        token.safeTransferFrom(msg.sender, address(this), currentStakeAmount);

        stakedAmountOf[studentId] = currentStakeAmount;
        roundStakers.push(studentId);

        emit Staked(roundId, studentId, msg.sender, currentStakeAmount);
    }

    /// @notice Pays the student their stake back plus the configured reward,
    ///         then ends the round (auto-refunding any other still-staked students).
    function resolveCorrect(bytes32 studentId) external onlyOwner nonReentrant {
        if (roundStatus != RoundStatus.Locked) revert RoundNotLocked();
        uint256 staked = stakedAmountOf[studentId];
        if (staked == 0) revert NotStaked();
        if (rewardPool < currentRewardAmount) revert InsufficientPool();

        stakedAmountOf[studentId] = 0;
        resolvedCount += 1;
        rewardPool -= currentRewardAmount;

        uint256 payout = staked + currentRewardAmount;
        token.safeTransfer(studentToWallet[studentId], payout);

        emit ResolvedCorrect(roundId, studentId, payout);

        _closeRound();
    }

    /// @notice Refunds the student's stake minus the configured penalty; the
    ///         penalty is kept in the reward pool. Round stays open until every
    ///         staker for this round has been resolved.
    function resolveWrong(bytes32 studentId) external onlyOwner nonReentrant {
        if (roundStatus != RoundStatus.Locked) revert RoundNotLocked();
        uint256 staked = stakedAmountOf[studentId];
        if (staked == 0) revert NotStaked();

        stakedAmountOf[studentId] = 0;
        resolvedCount += 1;

        uint256 forfeited = currentPenaltyAmount;
        uint256 refund = staked - forfeited;
        rewardPool += forfeited;

        if (refund > 0) {
            token.safeTransfer(studentToWallet[studentId], refund);
        }

        emit ResolvedWrong(roundId, studentId, forfeited, refund);

        if (resolvedCount == roundStakers.length) {
            _closeRound();
        }
    }

    /// @notice Tops up the reward pool. Anyone may call this (typically the teacher).
    function fundPool(uint256 amount) external nonReentrant {
        token.safeTransferFrom(msg.sender, address(this), amount);
        rewardPool += amount;
        emit PoolFunded(msg.sender, amount);
    }

    function getRoundStakers() external view returns (bytes32[] memory) {
        return roundStakers;
    }

    /// @dev Refunds any still-staked, unresolved students, then clears round state.
    function _closeRound() internal {
        uint256 length = roundStakers.length;
        for (uint256 i = 0; i < length; i++) {
            bytes32 id = roundStakers[i];
            uint256 staked = stakedAmountOf[id];
            if (staked != 0) {
                stakedAmountOf[id] = 0;
                token.safeTransfer(studentToWallet[id], staked);
                emit RoundForceClosed(roundId, id, staked);
            }
        }
        delete roundStakers;
        roundStatus = RoundStatus.Closed;
        emit RoundClosed(roundId);
    }
}
