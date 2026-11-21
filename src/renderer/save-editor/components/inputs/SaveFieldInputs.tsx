import React, { useEffect, useRef, useState } from 'react';

export interface NumberInputProps {
  id?: string;
  label?: string;
  value: number;
  onChange: (val: number) => void;
  disabled?: boolean;
}

/**
 * Pure presentational numeric input maintaining local string drafting state so
 * negative signs, intermediate decimals, and backspace clearing remain intact
 * until blur or Enter validation.
 */
export function NumberInput({
  id,
  label,
  value,
  onChange,
  disabled = false,
}: NumberInputProps): React.JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const [draftError, setDraftError] = useState<string | null>(null);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    skipBlurCommitRef.current = false;
    setDraft(String(value));
    setDraftError(null);
  }, [value]);

  const handleCommit = (fromEnter = false) => {
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.' || trimmed === '-.') {
      skipBlurCommitRef.current = false;
      setDraft(String(value));
      setDraftError(null);
      return;
    }

    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      const normalized = Object.is(parsed, -0) ? 0 : parsed;
      skipBlurCommitRef.current = fromEnter;
      setDraft(String(normalized));
      setDraftError(null);
      if (normalized !== value) {
        onChange(normalized);
      }
      return;
    }

    skipBlurCommitRef.current = false;
    if (fromEnter) {
      setDraftError('Invalid number');
    } else {
      setDraft(String(value));
      setDraftError(null);
    }
  };

  return (
    <div className="virtualized-table-number-input-wrapper">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        className="virtualized-table-number-input"
        aria-label={label}
        aria-invalid={Boolean(draftError)}
        aria-describedby={draftError && id ? `${id}-error` : undefined}
        value={draft}
        disabled={disabled}
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
          if (e.key === 'Enter') {
            handleCommit(true);
          }
        }}
      />
      {draftError && id && (
        <span id={`${id}-error`} className="number-input-error" role="alert">
          {draftError}
        </span>
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
