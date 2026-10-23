/**
 * Quick entry at the foot of Done and Scheduled.
 *
 * "Persistent compose field at the foot of Done. Type, Enter, done." The one
 * flow the PRD calls non-negotiable, so it is a plain textarea rather than a
 * CodeMirror instance: nothing to mount, nothing to wait for, and a single
 * uninterrupted keystroke path from an empty field to a recorded line.
 *
 * A textarea rather than an input because a card is markdown and can be more
 * than one line; Enter submits and Shift-Enter adds a line, which is the way
 * round that suits a field whose overwhelming case is one line.
 */

import { useRef, useState } from 'react';

export interface ComposeProps {
  placeholder: string;
  /** Returns false when the target refused it — a full Next, a frozen day. */
  onSubmit: (value: string) => Promise<boolean>;
}

export const Compose = ({ placeholder, onSubmit }: ComposeProps): React.ReactElement => {
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const composing = useRef(false);

  const submit = (): void => {
    const text = value.trim();
    if (text.length === 0 || submitting.current) return;
    submitting.current = true;
    setPending(true);
    void onSubmit(text)
      .then((accepted) => {
        if (accepted) setValue('');
      })
      .finally(() => {
        submitting.current = false;
        setPending(false);
      });
  };

  return (
    <div className="compose">
      <textarea
        className="compose-field"
        rows={1}
        value={value}
        readOnly={pending}
        aria-busy={pending}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
        }}
        onBlur={() => {
          composing.current = false;
        }}
        onKeyDown={(event) => {
          // An IME owns Enter while confirming its preedit. Some keyboards
          // report only keyCode 229; others need the composition session flag.
          if (
            event.key !== 'Enter' ||
            event.shiftKey ||
            event.nativeEvent.isComposing ||
            event.nativeEvent.keyCode === 229 ||
            composing.current
          )
            return;
          event.preventDefault();
          submit();
        }}
      />
      <button
        type="button"
        className="compose-submit"
        onClick={submit}
        disabled={pending || value.trim().length === 0}
      >
        Add
      </button>
      {pending && <span role="status">Waiting to save…</span>}
    </div>
  );
};
