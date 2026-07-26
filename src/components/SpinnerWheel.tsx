import { useEffect, useRef, useState } from "react";
import type { Student } from "../types";
import "./SpinnerWheel.css";

const PALETTE = [
  "#5c2430", // burgundy
  "#1f4d3d", // emerald
  "#203a5c", // navy
  "#6b5328", // bronze
  "#4a2e4f", // plum
  "#2c4f4f", // deep teal
  "#5c3a20", // umber
  "#3c3c46", // slate
];

interface SpinnerWheelProps {
  segments: Student[];
  targetId: string | null;
  spinToken: number;
  onSpinComplete: (studentId: string) => void;
}

export default function SpinnerWheel({
  segments,
  targetId,
  spinToken,
  onSpinComplete,
}: SpinnerWheelProps) {
  const [rotation, setRotation] = useState(0);
  const [animating, setAnimating] = useState(false);
  const wheelRef = useRef<HTMLDivElement>(null);
  const lastToken = useRef(0);
  const pendingTargetId = useRef<string | null>(null);

  const segmentAngle = segments.length > 0 ? 360 / segments.length : 0;

  useEffect(() => {
    if (spinToken === lastToken.current) return;
    if (!targetId || segments.length === 0) return;

    lastToken.current = spinToken;
    const index = segments.findIndex((s) => s.id === targetId);
    if (index === -1) return;

    pendingTargetId.current = targetId;

    const midAngle = index * segmentAngle + segmentAngle / 2;
    const currentNormalized = ((rotation % 360) + 360) % 360;
    const deltaToTarget = ((360 - midAngle - currentNormalized) % 360 + 360) % 360;
    const fullSpins = 5 * 360;

    setAnimating(true);
    setRotation((prev) => prev + fullSpins + deltaToTarget);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinToken, targetId, segments, segmentAngle]);

  const handleTransitionEnd = () => {
    setAnimating(false);
    if (pendingTargetId.current) {
      onSpinComplete(pendingTargetId.current);
      pendingTargetId.current = null;
    }
  };

  const gradient =
    segments.length > 0
      ? segments
          .map((_, i) => {
            const from = i * segmentAngle;
            const to = (i + 1) * segmentAngle;
            const color = PALETTE[i % PALETTE.length];
            return `${color} ${from}deg ${to}deg`;
          })
          .join(", ")
      : "#211f1c 0deg 360deg";

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" aria-hidden="true" />
      <div
        ref={wheelRef}
        className="wheel"
        style={{
          background: `conic-gradient(${gradient})`,
          transform: `rotate(${rotation}deg)`,
          transition: animating ? "transform 3.2s cubic-bezier(0.17, 0.67, 0.16, 0.99)" : "none",
        }}
        onTransitionEnd={handleTransitionEnd}
      >
        {segments.map((s, i) => {
          const trueAngle = i * segmentAngle + segmentAngle / 2;
          const flip = trueAngle > 90 && trueAngle < 270;
          const rotateDeg = trueAngle - 90;
          return (
            <div
              key={s.id}
              className="wheel-label-anchor"
              style={{ transform: `rotate(${rotateDeg}deg)` }}
            >
              <span
                className={`wheel-label ${flip ? "flip" : ""}`}
                title={s.name}
              >
                {s.name}
              </span>
            </div>
          );
        })}
      </div>
      {segments.length === 0 && (
        <div className="wheel-empty-msg">No students on the wheel yet</div>
      )}
    </div>
  );
}
