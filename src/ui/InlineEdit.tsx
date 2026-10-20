import { useEffect, useRef, useState } from 'react';

/** Text that turns into an input on double-click (or when `editing` is set). Enter saves, Esc cancels. */
export function InlineEdit({
  value,
  onSave,
  className,
  editing: editingProp,
  onEditingChange,
}: {
  value: string;
  onSave: (v: string) => void;
  className?: string;
  editing?: boolean;
  onEditingChange?: (v: boolean) => void;
}) {
  const [own, setOwn] = useState(false);
  const editing = editingProp ?? own;
  const setEditing = onEditingChange ?? setOwn;
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(value);
      requestAnimationFrame(() => ref.current?.select());
    }
  }, [editing, value]);

  if (!editing) {
    return (
      <span className={className} onDoubleClick={() => setEditing(true)} title="Double-click to rename">
        {value}
      </span>
    );
  }
  const commit = () => {
    const v = draft.trim();
    if (v && v !== value) onSave(v);
    setEditing(false);
  };
  return (
    <input
      ref={ref}
      className={`${className ?? ''} inline-input`}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}
