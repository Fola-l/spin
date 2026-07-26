export interface Student {
  id: string;
  name: string;
}

export type QuestionPhase =
  | "idle" // no question asked yet
  | "collecting" // hands can be raised
  | "locked" // hands locked, ready to spin
  | "selected" // a student has been chosen, awaiting correct/wrong
  | "done"; // question resolved (correct answer, or pool exhausted)

export interface RoundResult {
  studentId: string;
  name: string;
  status: "correct" | "wrong";
}

export interface RoundConfigInput {
  stakeAmount: string;
  rewardAmount: string;
  penaltyAmount: string;
}

export type StakeStatus =
  | "idle"
  | "connecting"
  | "approving"
  | "staking"
  | "staked"
  | "error";

export interface StudentStakeState {
  status: StakeStatus;
  error?: string;
}
