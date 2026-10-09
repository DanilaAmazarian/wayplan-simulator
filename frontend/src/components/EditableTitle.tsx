"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Pencil } from "lucide-react";

interface EditableTitleProps {
  value: string;
  onSave: (title: string) => void;
}

const MAX_TITLE_LENGTH = 120;

export function EditableTitle({ value, onSave }: EditableTitleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const finishedRef = useRef(false);

  const startEditing = () => {
    finishedRef.current = false;
    setDraft(value);
    setEditing(true);
  };

  const finish = (save: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setEditing(false);
    const title = draft.trim();
    if (save && title && title !== value) onSave(title);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") finish(true);
    if (e.key === "Escape") finish(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={MAX_TITLE_LENGTH}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => finish(true)}
        onKeyDown={handleKeyDown}
        aria-label="Название маршрута"
        className="w-full rounded-sm bg-transparent text-base font-semibold outline-none ring-2 ring-ring/50 ring-offset-2 ring-offset-background"
      />
    );
  }

  return (
    <h1 className="group/title flex min-w-0 items-center gap-1.5">
      <button
        type="button"
        onClick={startEditing}
        title={`${value}\nНажмите, чтобы переименовать`}
        className="flex min-w-0 items-center gap-1.5 rounded-sm text-left text-base font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{value}</span>
        <Pencil className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/title:opacity-100 group-focus-within/title:opacity-100" />
      </button>
    </h1>
  );
}
