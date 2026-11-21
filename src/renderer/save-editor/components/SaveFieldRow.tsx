import React from 'react';
import type { SaveFieldDto } from '@yumeshelf/engine/types';
import { CheckboxSwitch, NumberInput, TextInput } from './inputs/SaveFieldInputs';

export interface SaveFieldRowProps {
  field: SaveFieldDto;
  value: number | string | boolean;
  isDirty: boolean;
  isTranslated?: boolean;
  isPinned?: boolean;
  label: string;
  onChange: (fieldId: string, nextValue: number | string | boolean) => void;
  onTogglePin?: (fieldId: string) => void;
  pinLabelTemplate?: string;
  unpinLabelTemplate?: string;
  pinTitle?: string;
  unpinTitle?: string;
  deltaWasTemplate?: string;
  deltaChangedText?: string;
  invalidNumberText?: string;
}

function renderDelta(
  field: SaveFieldDto,
  value: number | string | boolean,
  isDirty: boolean,
  deltaWasTemplate = '(was: {value})',
  deltaChangedText = '(changed)'
): React.ReactNode {
  if (!isDirty || value === field.value) return null;

  if (typeof value === 'number' && typeof field.value === 'number') {
    const diff = value - field.value;
    if (diff > 0) {
      return <span className="data-delta data-delta--positive">+{diff}</span>;
    }
    if (diff < 0) {
      return <span className="data-delta data-delta--negative">{diff}</span>;
    }
    return null;
  }

  if (typeof value === 'boolean') {
    return (
      <span className="data-delta data-delta--changed">
        {deltaWasTemplate.replace('{value}', String(field.value))}
      </span>
    );
  }

  return <span className="data-delta data-delta--changed">{deltaChangedText}</span>;
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
    isTranslated = false,
    isPinned = false,
    label,
    onChange,
    onTogglePin,
    pinLabelTemplate = 'Pin {label}',
    unpinLabelTemplate = 'Unpin {label}',
    pinTitle = 'Pin field',
    unpinTitle = 'Unpin field',
    deltaWasTemplate = '(was: {value})',
    deltaChangedText = '(changed)',
    invalidNumberText,
  }: SaveFieldRowProps): React.JSX.Element {
    const inputId = `field-${field.id}`;
    const rowClassName = isDirty ? 'save-field-row is-dirty' : 'save-field-row';
    const labelClassName = isTranslated
      ? 'save-field-label is-translated'
      : 'save-field-label';
    const isBooleanField = field.type === 'boolean' || typeof field.value === 'boolean';
    const idBadge = field.key ? <span className="data-id">#{field.key}</span> : null;
    const deltaNode = renderDelta(field, value, isDirty, deltaWasTemplate, deltaChangedText);
    const pinButton = onTogglePin ? (
      <button
        type="button"
        className={isPinned ? 'data-pin-btn active' : 'data-pin-btn'}
        aria-label={(isPinned ? unpinLabelTemplate : pinLabelTemplate).replace('{label}', label)}
        aria-pressed={isPinned}
        title={isPinned ? unpinTitle : pinTitle}
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(field.id);
        }}
      >
        ★
      </button>
    ) : null;

    if (isBooleanField) {
      return (
        <div
          className={rowClassName}
          data-dirty={isDirty ? 'true' : undefined}
        >
          {pinButton}
          <CheckboxSwitch
            id={inputId}
            label={label}
            checked={Boolean(value)}
            disabled={field.readOnly}
            isTranslated={isTranslated}
            badge={idBadge}
            delta={deltaNode}
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
          {pinButton}
          <div className="save-field-header">
            {idBadge}
            <label htmlFor={inputId} className={labelClassName}>
              {label}
            </label>
          </div>
          <div className="data-value-wrapper">
            <NumberInput
              id={inputId}
              label={label}
              value={numericValue}
              disabled={field.readOnly}
              invalidNumberText={invalidNumberText}
              onChange={(val) => onChange(field.id, val)}
            />
            {deltaNode}
          </div>
        </div>
      );
    }

    return (
      <div
        className={rowClassName}
        data-dirty={isDirty ? 'true' : undefined}
      >
        {pinButton}
        <div className="save-field-header">
          {idBadge}
          <label htmlFor={inputId} className={labelClassName}>
            {label}
          </label>
        </div>
        <div className="data-value-wrapper">
          <TextInput
            id={inputId}
            label={label}
            value={value !== null && value !== undefined ? String(value) : ''}
            disabled={field.readOnly}
            onChange={(val) => onChange(field.id, val)}
          />
          {deltaNode}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.field === next.field &&
    prev.field.id === next.field.id &&
    prev.value === next.value &&
    prev.isDirty === next.isDirty &&
    prev.isTranslated === next.isTranslated &&
    prev.isPinned === next.isPinned &&
    prev.label === next.label &&
    prev.onChange === next.onChange &&
    prev.onTogglePin === next.onTogglePin &&
    prev.pinLabelTemplate === next.pinLabelTemplate &&
    prev.unpinLabelTemplate === next.unpinLabelTemplate &&
    prev.pinTitle === next.pinTitle &&
    prev.unpinTitle === next.unpinTitle &&
    prev.deltaWasTemplate === next.deltaWasTemplate &&
    prev.deltaChangedText === next.deltaChangedText &&
    prev.invalidNumberText === next.invalidNumberText
);
