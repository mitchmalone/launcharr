import { useEffect, useRef, useState } from 'react';

import { acceleratorFromEvent, prettyAccelerator } from '../lib/accelerator';

/**
 * Raycast-style hotkey pill: click to arm, press a chord to record it. Esc cancels;
 * Backspace clears (when the caller allows an empty value). The recorded string is the
 * accelerator format the Rust global-shortcut plugin parses ("Cmd+Shift+S").
 */
export default function HotkeyRecorder({
  value,
  onChange,
  clearable = false,
  placeholder = 'record hotkey',
}: {
  value: string;
  onChange: (accel: string | null) => void;
  clearable?: boolean;
  placeholder?: string;
}) {
  const [recording, setRecording] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') {
        setRecording(false);
        return;
      }
      if (e.code === 'Backspace' && clearable) {
        setRecording(false);
        onChange(null);
        return;
      }
      const accel = acceleratorFromEvent(e);
      if (accel) {
        setRecording(false);
        onChange(accel);
      }
    };
    const stop = () => setRecording(false);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', stop);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', stop);
    };
  }, [recording, clearable, onChange]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`hotkey${recording ? ' recording' : ''}${value ? '' : ' empty'}`}
      onClick={() => setRecording((r) => !r)}
      onBlur={() => setRecording(false)}
      title={
        recording
          ? 'press a key combo — Esc cancels'
          : 'click, then press a key combo'
      }
    >
      {recording
        ? 'recording…'
        : value
          ? prettyAccelerator(value)
          : placeholder}
    </button>
  );
}
