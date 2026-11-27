import React, { useEffect, useRef, useState } from 'react';

export interface NumberInputProps {
  id?: string;
  label?: string;
  value: number;
  onChange: (val: number) => void;
  onUndo?: () => void;
  disabled?: boolean;
  invalidNumberText?: string;
  divideByZeroText?: string;
  delta?: React.ReactNode;
}

type EvalResult =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'divide_by_zero' | 'invalid' };

/**
 * Safely evaluates simple arithmetic expressions (+, -, *, /, parentheses)
 * without using eval or Function constructors.
 */
export function evaluateArithmeticExpression(raw: string): EvalResult {
  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
    return { ok: false, reason: 'empty' };
  }

  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      return { ok: false, reason: 'invalid' };
    }
    return { ok: true, value: Object.is(parsed, -0) ? 0 : parsed };
  }

  let pos = 0;
  let divZero = false;

  const skipWs = () => {
    while (pos < trimmed.length && /\s/.test(trimmed[pos])) {
      pos += 1;
    }
  };

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (true) {
      skipWs();
      const ch = trimmed[pos];
      if (ch !== '+' && ch !== '-') break;
      pos += 1;
      const right = parseTerm();
      if (right === null) return null;
      left = ch === '+' ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parseFactor();
    if (left === null) return null;
    while (true) {
      skipWs();
      const ch = trimmed[pos];
      if (ch !== '*' && ch !== '/') break;
      pos += 1;
      const right = parseFactor();
      if (right === null) return null;
      if (ch === '/') {
        if (right === 0) {
          divZero = true;
          return null;
        }
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  };

  const parseFactor = (): number | null => {
    skipWs();
    const ch = trimmed[pos];
    if (ch === '+' || ch === '-') {
      pos += 1;
      const inner = parseFactor();
      if (inner === null) return null;
      return ch === '-' ? -inner : inner;
    }
    if (ch === '(') {
      pos += 1;
      const inner = parseExpr();
      if (inner === null) return null;
      skipWs();
      if (trimmed[pos] !== ')') return null;
      pos += 1;
      return inner;
    }
    const rest = trimmed.slice(pos);
    const numMatch = rest.match(/^(?:\d+\.?\d*|\.\d+)/);
    if (!numMatch) return null;
    pos += numMatch[0].length;
    const num = Number(numMatch[0]);
    return Number.isFinite(num) ? num : null;
  };

  const result = parseExpr();
  skipWs();
  if (divZero) {
    return { ok: false, reason: 'divide_by_zero' };
  }
  if (result === null || pos !== trimmed.length || !Number.isFinite(result)) {
    return { ok: false, reason: 'invalid' };
  }

  const cleaned = Number.isInteger(result) ? result : Number(result.toPrecision(12));
  return { ok: true, value: Object.is(cleaned, -0) ? 0 : cleaned };
}

/**
 * Pure presentational numeric input maintaining local string drafting state so
 * negative signs, intermediate decimals, backspace clearing, and simple
 * arithmetic (+ - * /) remain intact until Enter or blur validation.
 */
export function NumberInput({
  id,
  label,
  value,
  onChange,
  onUndo,
  disabled = false,
  invalidNumberText = 'Invalid number',
  divideByZeroText = 'Cannot divide by 0',
  delta,
}: NumberInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const [draftError, setDraftError] = useState<string | null>(null);
  const skipBlurCommitRef = useRef(false);
  const isComposingRef = useRef(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    skipBlurCommitRef.current = false;
    setDraft(String(value));
    setDraftError(null);
  }, [value]);

  const handleRevert = () => {
    skipBlurCommitRef.current = false;
    setDraft(String(value));
    setDraftError(null);
    inputRef.current?.focus();
  };

  const handleCommit = (fromEnter = false) => {
    const evaluated = evaluateArithmeticExpression(draft);
    if (!evaluated.ok) {
      if (evaluated.reason === 'empty') {
        skipBlurCommitRef.current = false;
        setDraft(String(value));
        setDraftError(null);
        return;
      }
      skipBlurCommitRef.current = false;
      setDraftError(
        evaluated.reason === 'divide_by_zero' ? divideByZeroText : invalidNumberText
      );
      return;
    }

    const normalized = evaluated.value;
    skipBlurCommitRef.current = fromEnter;
    setDraft(String(normalized));
    setDraftError(null);
    if (normalized !== value) {
      onChange(normalized);
    }
  };

  return (
    <div className="data-value-wrapper">
      <div className="virtualized-table-number-input-wrapper">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="decimal"
          className="virtualized-table-number-input"
          aria-label={label}
          aria-invalid={Boolean(draftError)}
          aria-describedby={draftError && id ? `${id}-error` : undefined}
          value={draft}
          disabled={disabled}
          onCompositionStart={() => {
            isComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false;
          }}
          onChange={(e) => {
            skipBlurCommitRef.current = false;
            setDraft(e.target.value);
            setDraftError(null);
          }}
          onBlur={() => {
            if (skipBlurCommitRef.current) {
              skipBlurCommitRef.current = false;
              return;
            }
            handleCommit(false);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing || e.keyCode === 229 || isComposingRef.current) {
              return;
            }
            if (
              (e.ctrlKey || e.metaKey) &&
              !e.shiftKey &&
              !e.altKey &&
              e.key.toLowerCase() === 'z'
            ) {
              if (draft === String(value) && onUndo && !disabled) {
                e.preventDefault();
                onUndo();
              }
              return;
            }
            if (e.key === 'Enter') {
              handleCommit(true);
            }
          }}
        />
      </div>
      {draftError ? (
        <button
          type="button"
          id={id ? `${id}-error` : undefined}
          className="number-input-error"
          role="alert"
          title={`Click to revert to ${value}`}
          onClick={handleRevert}
        >
          {draftError}
        </button>
      ) : (
        delta
      )}
    </div>
  );
}

export interface TextInputProps {
  id?: string;
  label?: string;
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

/**
 * Pure presentational text input for string save fields.
 */
export function TextInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: TextInputProps): React.JSX.Element {
  return (
    <input
      id={id}
      type="text"
      className="virtualized-table-text-input"
      aria-label={label}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export interface CheckboxSwitchProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  isTranslated?: boolean;
  badge?: React.ReactNode;
  delta?: React.ReactNode;
}

/**
 * Pure presentational boolean switch control matching `.checkbox-row` styles.
 */
export function CheckboxSwitch({
  id,
  label,
  checked,
  onChange,
  disabled = false,
  isTranslated = false,
  badge,
  delta,
}: CheckboxSwitchProps): React.JSX.Element {
  return (
    <div className="checkbox-row">
      {badge}
      <label
        htmlFor={id}
        className={isTranslated ? 'data-label is-translated' : 'data-label'}
      >
        {label}
      </label>
      {delta}
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </div>
  );
}
