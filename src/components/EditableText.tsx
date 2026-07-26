import { useEffect, useRef, useState } from "react";
import "./EditableText.css";

interface EditableTextProps {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
}

export default function EditableText({
  value,
  onChange,
  ariaLabel,
  className,
  inputClassName,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
    }
  }, [editing, value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onChange(trimmed);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        className={`editable-text-input ${inputClassName ?? ""}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        aria-label={ariaLabel}
      />
    );
  }

  return (
    <span className={`editable-text ${className ?? ""}`}>
      <span className="editable-text-value">{value}</span>
      <button
        type="button"
        className="editable-text-edit-btn"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        aria-label={`Edit ${ariaLabel}`}
        title={`Edit ${ariaLabel}`}
      >
        ✎
      </button>
    </span>
  );
}
