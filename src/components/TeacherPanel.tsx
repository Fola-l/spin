import { useState } from "react";
import type { QuestionPhase, RoundResult } from "../types";
import EditableText from "./EditableText";
import "./TeacherPanel.css";

interface TxPending {
  startRound: boolean;
  lock: boolean;
  correct: boolean;
  wrong: boolean;
  fundPool: boolean;
}

interface TeacherPanelProps {
  teacherName: string;
  phase: QuestionPhase;
  handsRaisedCount: number;
  poolCount: number;
  spinning: boolean;
  selectedName: string | null;
  lastResult: RoundResult | null;
  onRenameTeacher: (name: string) => void;
  onStartRound: (
    stakeAmount: string,
    rewardAmount: string,
    penaltyAmount: string,
  ) => void;
  onLock: () => void;
  onSpin: () => void;
  onMarkCorrect: () => void;
  onMarkWrong: () => void;
  onFundPool: (amount: string) => void;
  walletAddress: string | null;
  walletConnecting: boolean;
  onConnectWallet: () => void;
  isOwnerConnected: boolean;
  rewardPoolBalance: string;
  decimalsAssumed: boolean;
  txPending: TxPending;
  actionError: string | null;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function TeacherPanel({
  teacherName,
  phase,
  handsRaisedCount,
  poolCount,
  spinning,
  selectedName,
  lastResult,
  onRenameTeacher,
  onStartRound,
  onLock,
  onSpin,
  onMarkCorrect,
  onMarkWrong,
  onFundPool,
  walletAddress,
  walletConnecting,
  onConnectWallet,
  isOwnerConnected,
  rewardPoolBalance,
  decimalsAssumed,
  txPending,
  actionError,
}: TeacherPanelProps) {
  const [stakeAmount, setStakeAmount] = useState("10");
  const [rewardAmount, setRewardAmount] = useState("5");
  const [penaltyAmount, setPenaltyAmount] = useState("5");
  const [fundAmount, setFundAmount] = useState("100");

  const canConfigureRound = phase === "idle" || phase === "done";
  const canLock = phase === "collecting" && handsRaisedCount > 0 && isOwnerConnected;
  const canSpin = phase === "locked" && poolCount > 0 && !spinning;
  const canMark = phase === "selected" && !spinning && isOwnerConnected;
  const noEligibleLeft = phase === "done" && poolCount === 0 && handsRaisedCount > 0;

  return (
    <div className="teacher-panel">
      <div className="teacher-header">
        <span className="teacher-label">Teacher</span>
        <h2>
          <EditableText
            value={teacherName}
            onChange={onRenameTeacher}
            ariaLabel="teacher name"
          />
        </h2>
      </div>

      <div className="wallet-box">
        {walletAddress ? (
          <span className={`wallet-status ${isOwnerConnected ? "ok" : "warn"}`}>
            {truncateAddress(walletAddress)}
            {isOwnerConnected ? " · teacher wallet" : ""}
          </span>
        ) : (
          <button className="btn" onClick={onConnectWallet} disabled={walletConnecting}>
            {walletConnecting ? "Connecting…" : "Connect Teacher Wallet"}
          </button>
        )}
        {walletAddress && !isOwnerConnected && (
          <p className="status-line warn">
            Switch MetaMask to the teacher wallet to run the class.
          </p>
        )}
      </div>

      <div className="pool-box">
        <p className="status-line">
          Reward pool: <strong>{rewardPoolBalance} FLD</strong>
          {decimalsAssumed && " (assumed 18 decimals)"}
        </p>
        <div className="fund-row">
          <input
            type="number"
            min="0"
            className="amount-input"
            value={fundAmount}
            onChange={(e) => setFundAmount(e.target.value)}
            aria-label="Amount to fund the reward pool"
          />
          <button
            className="btn"
            onClick={() => onFundPool(fundAmount)}
            disabled={txPending.fundPool}
          >
            {txPending.fundPool ? "Funding…" : "Fund Pool"}
          </button>
        </div>
      </div>

      {canConfigureRound && (
        <div className="round-config">
          <label>
            Stake amount
            <input
              type="number"
              min="0"
              className="amount-input"
              value={stakeAmount}
              onChange={(e) => setStakeAmount(e.target.value)}
            />
          </label>
          <label>
            Reward for correct
            <input
              type="number"
              min="0"
              className="amount-input"
              value={rewardAmount}
              onChange={(e) => setRewardAmount(e.target.value)}
            />
          </label>
          <label>
            Penalty for wrong
            <input
              type="number"
              min="0"
              className="amount-input"
              value={penaltyAmount}
              onChange={(e) => setPenaltyAmount(e.target.value)}
            />
          </label>
        </div>
      )}

      <div className="teacher-actions">
        {canConfigureRound && (
          <button
            className="btn btn-primary"
            onClick={() => onStartRound(stakeAmount, rewardAmount, penaltyAmount)}
            disabled={txPending.startRound || !isOwnerConnected}
          >
            {txPending.startRound
              ? "Starting…"
              : phase === "idle"
              ? "Ask a Question"
              : "Ask New Question"}
          </button>
        )}

        <button className="btn" onClick={onLock} disabled={!canLock || txPending.lock}>
          {txPending.lock ? "Locking…" : `Lock Hands (${handsRaisedCount})`}
        </button>

        <button className="btn btn-spin" onClick={onSpin} disabled={!canSpin}>
          {spinning ? "Spinning…" : "Spin"}
        </button>
      </div>

      {phase === "collecting" && (
        <p className="status-line">
          Students are raising their hands. Lock when ready.
        </p>
      )}

      {phase === "locked" && poolCount > 0 && (
        <p className="status-line">{poolCount} student(s) on the wheel.</p>
      )}

      {noEligibleLeft && (
        <p className="status-line warn">
          No students left on the wheel for this question.
        </p>
      )}

      {phase === "selected" && selectedName && (
        <div className="answer-box">
          <p>
            <strong>{selectedName}</strong> was selected to answer.
          </p>
          <div className="teacher-actions">
            <button
              className="btn btn-correct"
              onClick={onMarkCorrect}
              disabled={!canMark || txPending.correct}
            >
              {txPending.correct ? "Confirming…" : "Correct"}
            </button>
            <button
              className="btn btn-wrong"
              onClick={onMarkWrong}
              disabled={!canMark || txPending.wrong}
            >
              {txPending.wrong ? "Confirming…" : "Wrong"}
            </button>
          </div>
        </div>
      )}

      {lastResult && (
        <p className={`result-line ${lastResult.status}`}>
          {lastResult.status === "correct"
            ? `${lastResult.name} answered correctly.`
            : `${lastResult.name} was wrong and is off the wheel.`}
        </p>
      )}

      {actionError && <p className="result-line wrong">{actionError}</p>}
    </div>
  );
}
