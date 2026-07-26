import type { Student, StudentStakeState } from "../types";
import EditableText from "./EditableText";
import "./Roster.css";

interface RosterProps {
  students: Student[];
  raisedHands: Set<string>;
  eliminated: Set<string>;
  selectedId: string | null;
  handsOpen: boolean;
  stakeStates: Record<string, StudentStakeState>;
  onRaiseHand: (id: string) => void;
  onRenameStudent: (id: string, name: string) => void;
}

const PENDING_LABELS: Record<string, string> = {
  connecting: "Connecting…",
  approving: "Approving…",
  staking: "Staking…",
};

export default function Roster({
  students,
  raisedHands,
  eliminated,
  selectedId,
  handsOpen,
  stakeStates,
  onRaiseHand,
  onRenameStudent,
}: RosterProps) {
  return (
    <div className="roster">
      {students.map((student) => {
        const raised = raisedHands.has(student.id);
        const out = eliminated.has(student.id);
        const isSelected = selectedId === student.id;
        const stakeState = stakeStates[student.id];
        const busy =
          stakeState?.status === "connecting" ||
          stakeState?.status === "approving" ||
          stakeState?.status === "staking";
        const canRaise = handsOpen && !out && !raised && !busy;
        const classes = [
          "student-card",
          raised ? "raised" : "",
          out ? "eliminated" : "",
          isSelected ? "selected" : "",
          canRaise ? "clickable" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <div
            key={student.id}
            className={classes}
            role="button"
            tabIndex={canRaise ? 0 : -1}
            onClick={() => {
              if (canRaise) onRaiseHand(student.id);
            }}
            onKeyDown={(e) => {
              if (canRaise && (e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                onRaiseHand(student.id);
              }
            }}
            title={
              out
                ? `${student.name} already answered incorrectly this round`
                : stakeState?.status === "error"
                ? stakeState.error
                : undefined
            }
          >
            <EditableText
              value={student.name}
              onChange={(name) => onRenameStudent(student.id, name)}
              ariaLabel={`${student.name}'s name`}
              className="student-name"
            />
            {out && <span className="student-badge out">Out</span>}
            {!out && raised && <span className="student-badge raised">Raised</span>}
            {!out && !raised && busy && (
              <span className="student-badge pending">
                {PENDING_LABELS[stakeState.status]}
              </span>
            )}
            {!out && !raised && stakeState?.status === "error" && (
              <span className="student-badge error">Failed</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
