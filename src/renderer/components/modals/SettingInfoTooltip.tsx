import React from 'react';

export interface SettingInfoTooltipProps {
  text: string;
}

export function SettingInfoTooltip({ text }: SettingInfoTooltipProps): React.JSX.Element {
  return (
    <button
      type="button"
      className="setting-info-btn"
      aria-label={text}
      data-tooltip={text}
      data-tooltip-compact="true"
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4zm-.75 3h1.5v5h-1.5V7z" />
      </svg>
    </button>
  );
}
