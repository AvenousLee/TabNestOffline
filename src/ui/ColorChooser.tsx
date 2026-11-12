import { useEffect, useRef, useState } from 'react';
import { parseColor, SPACE_COLORS } from '../lib/colors';
import { Icon } from './icons';

/** Palette swatches, plus a "+" panel to pick any colour or type a code (#hex or rgb). */
export function ColorChooser({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(value);
  const ref = useRef<HTMLDivElement>(null);
  const custom = !SPACE_COLORS.includes(value);
  const codeOk = parseColor(code) !== null;

  useEffect(() => {
    if (!open) return;
    setCode(value);
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (c: string) => {
    onChange(c);
    setCode(c);
  };

  return (
    <div className="swatches color-chooser" ref={ref}>
      {SPACE_COLORS.map((c) => (
        <button type="button" key={c} className={`swatch${c === value ? ' on' : ''}`} style={{ background: c }} onClick={() => pick(c)} aria-label={c} />
      ))}
      <button
        type="button"
        className={`swatch custom-swatch${custom ? ' on' : ''}`}
        style={custom ? { background: value } : undefined}
        title="Add a colour: picker or code"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name="plus" size={12} />
      </button>
      {open && (
        <div className="color-pop" role="dialog" aria-label="Add a colour">
          <b className="small">Add a colour</b>
          <div className="color-pop-row">
            <input type="color" className="color-native" value={value} onChange={(e) => pick(e.target.value)} aria-label="Colour picker" title="Open the colour picker" />
            <input
              autoFocus
              onFocus={(e) => e.target.select()} // type straight over the current code
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                const c = parseColor(e.target.value);
                if (c) onChange(c);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (codeOk) setOpen(false);
                }
                if (e.key === 'Escape') {
                  // Close only this panel, not the whole Space settings window.
                  e.nativeEvent.stopPropagation();
                  setOpen(false);
                }
              }}
              className={codeOk ? '' : 'invalid'}
              spellCheck={false}
              placeholder="#3a7bd5 or rgb(58, 123, 213)"
              aria-label="Colour code"
            />
          </div>
          <span className={`small ${codeOk ? 'muted' : 'err-text'}`}>
            {codeOk ? 'Click the square for the picker, or type a code: #3a7bd5, #37d, rgb(58, 123, 213).' : 'Use a code like #3a7bd5, #37d or rgb(58, 123, 213).'}
          </span>
          <button type="button" className="btn primary" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
