import React from 'react';
import type { SaveFieldDto } from '@yumeshelf/engine/types';
import { CheckboxSwitch, NumberInput, TextInput } from './inputs/SaveFieldInputs';

export interface SaveFieldRowProps {
  field: SaveFieldDto;
  value: number | string | boolean;
  isDirty: boolean;
  label: string;
  onChange: (fieldId: string, nextValue: number | string | boolean) => void;
}

/**
 * Memoized pure presentational row rendering a schema-typed input control
 * decoupled from save-editor store contexts.
 */
export const SaveFieldRow = React.memo(
  function SaveFieldRow({
    field,
    value,
    isDirty,
    label,
    onChange,
  }: SaveFieldRowProps): React.JSX.Element {
    const inputId = `field-${field.id}`;
    const rowClassName = isDirty ? 'save-field-row is-dirty' : 'save-field-row';
    const isBooleanField = field.type === 'boolean' || typeof field.value === 'boolean';

    if (isBooleanField) {
      return (
        <div
          className={rowClassName}
          data-dirty={isDirty ? 'true' : undefined}
        >
          <CheckboxSwitch
            id={inputId}
            label={label}
            checked={Boolean(value)}
            disabled={field.readOnly}
            onChange={(checked) => onChange(field.id, checked)}
          />
        </div>
      );
    }

    if (field.type === 'number') {
      const numericValue =
        typeof value === 'number' && Number.isFinite(value)
          ? value
          : Number.isFinite(Number(value))
            ? Number(value)
            : 0;

      return (
        <div
          className={rowClassName}
          data-dirty={isDirty ? 'true' : undefined}
        >
          <label htmlFor={inputId} className="save-field-label">
            {label}
          </label>
          <NumberInput
            id={inputId}
            label={label}
            value={numericValue}
            disabled={field.readOnly}
            onChange={(val) => onChange(field.id, val)}
          />
        </div>
      );
    }

    return (
      <div
        className={rowClassName}
        data-dirty={isDirty ? 'true' : undefined}
      >
        <label htmlFor={inputId} className="save-field-label">
          {label}
        </label>
        <TextInput
          id={inputId}
          label={label}
          value={value !== null && value !== undefined ? String(value) : ''}
          disabled={field.readOnly}
          onChange={(val) => onChange(field.id, val)}
        />
      </div>
    );
  },
  (prev, next) =>
    prev.field === next.field &&
    prev.field.id === next.field.id &&
    prev.value === next.value &&
    prev.isDirty === next.isDirty &&
    prev.label === next.label &&
    prev.onChange === next.onChange
);
