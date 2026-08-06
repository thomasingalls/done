/**
 * The compose field at the foot of Done (PRD §4).
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

import { useState } from 'react';

export interface ComposeProps {
  placeholder: string;
  /** Returns false when the target refused it — a full Next, a frozen day. */
  onSubmit: (value: string) => boolean;
}

export const Compose = ({ placeholder, onSubmit }: ComposeProps): React.ReactElement => {
  const [value, setValue] = useState('');

  const submit = (): void => {
    const text = value.trim();
    if (text.length === 0) return;
    if (onSubmit(text)) setValue('');
  };

  return (
    <div className="compose">
      <textarea
        className="compose-field"
        rows={1}
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.shiftKey) return;
          event.preventDefault();
          submit();
        }}
      />
      <button
        type="button"
        className="compose-submit"
        onClick={submit}
        disabled={value.trim().length === 0}
      >
        Add
      </button>
    </div>
  );
};
