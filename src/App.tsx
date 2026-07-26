import { useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import Roster from "./components/Roster";
import SpinnerWheel from "./components/SpinnerWheel";
import TeacherPanel from "./components/TeacherPanel";
import { STUDENTS, TEACHER_NAME } from "./data/classroom";
import type {
  QuestionPhase,
  RoundResult,
  Student,
  StudentStakeState,
} from "./types";
import { toStudentIdHash } from "./web3/studentId";
import { useStakingContract } from "./web3/useStakingContract";
import { useWallet } from "./web3/useWallet";

function App() {
  const [teacherName, setTeacherName] = useState(TEACHER_NAME);
  const [students, setStudents] = useState<Student[]>(STUDENTS);
  const [phase, setPhase] = useState<QuestionPhase>("idle");
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());
  const [pool, setPool] = useState<string[]>([]);
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [spinTarget, setSpinTarget] = useState<string | null>(null);
  const [spinToken, setSpinToken] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);

  const wallet = useWallet();
  const staking = useStakingContract(wallet);

  const [contractOwner, setContractOwner] = useState<string | null>(null);
  const [rewardPoolBalance, setRewardPoolBalance] = useState<bigint>(0n);
  const [stakeStates, setStakeStates] = useState<Record<string, StudentStakeState>>({});
  const [txPending, setTxPending] = useState<{
    startRound: boolean;
    lock: boolean;
    correct: boolean;
    wrong: boolean;
    fundPool: boolean;
  }>({ startRound: false, lock: false, correct: false, wrong: false, fundPool: false });
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshPoolBalance = useCallback(async () => {
    setRewardPoolBalance(await staking.rewardPool());
  }, [staking]);

  useEffect(() => {
    void staking.owner().then(setContractOwner);
    void refreshPoolBalance();
  }, [staking, refreshPoolBalance]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await staking.roundStatus();
      if (cancelled) return;

      // None or Closed — nothing active on-chain, "idle" is correct as-is.
      if (status !== 1n && status !== 2n) return;

      const entries = await Promise.all(
        students.map(async (s) => {
          const staked = await staking.stakedAmountOf(toStudentIdHash(s.id));
          return [s.id, staked > 0n] as const;
        }),
      );
      if (cancelled) return;

      const stakedIds = entries.filter(([, staked]) => staked).map(([id]) => id);
      setRaisedHands(new Set(stakedIds));
      setStakeStates(
        Object.fromEntries(stakedIds.map((id) => [id, { status: "staked" as const }])),
      );

      if (status === 1n) {
        setPhase("collecting");
      } else {
        setPool(stakedIds);
        setPhase("locked");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Intentionally run once on mount only (empty deps): this rehydrates local
    // state from the chain after a page reload. Re-running it every time the
    // wallet/account changes would clobber in-session-only UI state (like the
    // "selected" phase after a spin) that has no on-chain equivalent to
    // rehydrate from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isOwnerConnected = useMemo(() => {
    if (!contractOwner || !wallet.activeAddress) return false;
    return contractOwner.toLowerCase() === wallet.activeAddress.toLowerCase();
  }, [contractOwner, wallet.activeAddress]);

  const poolStudents = useMemo(
    () => students.filter((s) => pool.includes(s.id)),
    [students, pool]
  );

  const selectedStudent = useMemo(
    () => students.find((s) => s.id === selectedId) ?? null,
    [students, selectedId]
  );

  const handleRenameTeacher = (name: string) => setTeacherName(name);

  const handleRenameStudent = (id: string, name: string) => {
    setStudents((prev) => prev.map((s) => (s.id === id ? { ...s, name } : s)));
  };

  const handleStartRound = async (
    stakeAmountInput: string,
    rewardAmountInput: string,
    penaltyAmountInput: string,
  ) => {
    setActionError(null);
    setTxPending((prev) => ({ ...prev, startRound: true }));
    try {
      const stakeAmount = staking.toBaseUnits(stakeAmountInput);
      const rewardAmount = staking.toBaseUnits(rewardAmountInput);
      const penaltyAmount = staking.toBaseUnits(penaltyAmountInput);

      await staking.startRound(stakeAmount, rewardAmount, penaltyAmount);
      setRaisedHands(new Set());
      setPool([]);
      setEliminated(new Set());
      setSelectedId(null);
      setSpinTarget(null);
      setLastResult(null);
      setStakeStates({});
      setPhase("collecting");
      await refreshPoolBalance();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTxPending((prev) => ({ ...prev, startRound: false }));
    }
  };

  const handleRaiseHand = async (studentId: string) => {
    if (phase !== "collecting") return;
    if (stakeStates[studentId]?.status === "staked") return;

    setStakeStates((prev) => ({ ...prev, [studentId]: { status: "connecting" } }));
    const address = await wallet.connect();
    if (!address) {
      setStakeStates((prev) => ({
        ...prev,
        [studentId]: { status: "error", error: "Wallet connection was rejected." },
      }));
      return;
    }

    try {
      setStakeStates((prev) => ({ ...prev, [studentId]: { status: "approving" } }));
      const stakeAmount = await staking.currentStakeAmount();
      await staking.ensureAllowance(address, stakeAmount);

      setStakeStates((prev) => ({ ...prev, [studentId]: { status: "staking" } }));
      await staking.stake(toStudentIdHash(studentId));

      setStakeStates((prev) => ({ ...prev, [studentId]: { status: "staked" } }));
      setRaisedHands((prev) => new Set(prev).add(studentId));
    } catch (err) {
      setStakeStates((prev) => ({
        ...prev,
        [studentId]: { status: "error", error: (err as Error).message },
      }));
    }
  };

  const handleLock = async () => {
    if (phase !== "collecting" || raisedHands.size === 0) return;
    setActionError(null);
    setTxPending((prev) => ({ ...prev, lock: true }));
    try {
      await staking.lockRound();
      setPool(Array.from(raisedHands));
      setPhase("locked");
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTxPending((prev) => ({ ...prev, lock: false }));
    }
  };

  const handleSpin = () => {
    if (phase !== "locked" || pool.length === 0 || spinning) return;
    const choice = pool[Math.floor(Math.random() * pool.length)];
    setLastResult(null);
    setSpinTarget(choice);
    setSpinToken((t) => t + 1);
    setSpinning(true);
  };

  const handleSpinComplete = (studentId: string) => {
    setSpinning(false);
    setSelectedId(studentId);
    setPhase("selected");
  };

  const handleMarkCorrect = async () => {
    if (phase !== "selected" || !selectedStudent) return;
    setActionError(null);
    setTxPending((prev) => ({ ...prev, correct: true }));
    try {
      await staking.resolveCorrect(toStudentIdHash(selectedStudent.id));
      await refreshPoolBalance();
      setLastResult({
        studentId: selectedStudent.id,
        name: selectedStudent.name,
        status: "correct",
      });
      setSelectedId(null);
      setPhase("done");
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTxPending((prev) => ({ ...prev, correct: false }));
    }
  };

  const handleMarkWrong = async () => {
    if (phase !== "selected" || !selectedStudent) return;
    setActionError(null);
    setTxPending((prev) => ({ ...prev, wrong: true }));
    try {
      await staking.resolveWrong(toStudentIdHash(selectedStudent.id));
      await refreshPoolBalance();
      const wrongId = selectedStudent.id;
      setEliminated((prev) => new Set(prev).add(wrongId));
      const nextPool = pool.filter((id) => id !== wrongId);
      setPool(nextPool);
      setLastResult({
        studentId: wrongId,
        name: selectedStudent.name,
        status: "wrong",
      });
      setSelectedId(null);
      setPhase(nextPool.length > 0 ? "locked" : "done");
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTxPending((prev) => ({ ...prev, wrong: false }));
    }
  };

  const handleFundPool = async (amountInput: string) => {
    setActionError(null);
    setTxPending((prev) => ({ ...prev, fundPool: true }));
    try {
      const address = await wallet.connect();
      if (!address) throw new Error("Connect your wallet first.");
      const amount = staking.toBaseUnits(amountInput);
      await staking.ensureAllowance(address, amount);
      await staking.fundPool(amount);
      await refreshPoolBalance();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setTxPending((prev) => ({ ...prev, fundPool: false }));
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Classroom Question Spinner</h1>
      </header>

      <main className="app-main">
        <section className="left-column">
          <TeacherPanel
            teacherName={teacherName}
            phase={phase}
            handsRaisedCount={raisedHands.size}
            poolCount={pool.length}
            spinning={spinning}
            selectedName={selectedStudent?.name ?? null}
            lastResult={lastResult}
            onRenameTeacher={handleRenameTeacher}
            onStartRound={handleStartRound}
            onLock={handleLock}
            onSpin={handleSpin}
            onMarkCorrect={handleMarkCorrect}
            onMarkWrong={handleMarkWrong}
            onFundPool={handleFundPool}
            walletAddress={wallet.activeAddress}
            walletConnecting={wallet.connecting}
            onConnectWallet={wallet.connect}
            isOwnerConnected={isOwnerConnected}
            rewardPoolBalance={staking.fromBaseUnits(rewardPoolBalance)}
            decimalsAssumed={staking.decimalsAssumed}
            txPending={txPending}
            actionError={actionError}
          />

          <SpinnerWheel
            segments={poolStudents}
            targetId={spinTarget}
            spinToken={spinToken}
            onSpinComplete={handleSpinComplete}
          />
        </section>

        <section className="right-column">
          <h2 className="roster-title">
            Students{" "}
            <span className="roster-hint">
              {phase === "collecting"
                ? "— raise your hand to volunteer"
                : phase === "idle"
                ? "— waiting for a question"
                : ""}
            </span>
          </h2>
          <Roster
            students={students}
            raisedHands={raisedHands}
            eliminated={eliminated}
            selectedId={selectedId}
            handsOpen={phase === "collecting"}
            stakeStates={stakeStates}
            onRaiseHand={handleRaiseHand}
            onRenameStudent={handleRenameStudent}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
