import React, { useEffect, useRef, useState } from 'react';
import type { LocaleStrings } from '../../i18n/locale-strings';

export interface SettingsGeneralTabProps {
  language: string;
  strings: LocaleStrings;
  theme: string;
  installedLanguages: ReadonlyArray<{ code: string; label: string }>;
  locationDisplayMode: 'parent' | 'full';
  titleDisplayMode: 'metadata' | 'legacy_folder';
  displayProductCodes: boolean;
  maxDepth: number;
  autoAllowLargeSaves: boolean;
  isUpdatingConfig: boolean;
  onThemeChange: (nextTheme: string) => void;
  onLanguageChange: (nextLang: string) => void;
  onOpenLanguagePack?: () => void;
  onLocationDisplayModeChange: (nextMode: 'parent' | 'full') => void;
  onUpdateDisplayConfig: (updates: {
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    displayProductCodes?: boolean;
    autoAllowLargeSaves?: boolean;
  }) => void;
  onMaxDepthChange: (nextDepth: number) => void;
}

function MaxDepthStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    skipBlurCommitRef.current = false;
    setDraft(String(value));
  }, [value]);

  const handleCommit = (fromEnter = false) => {
    const parsed = parseInt(draft, 10);
    if (Number.isFinite(parsed)) {
      skipBlurCommitRef.current = fromEnter;
      const clamped = Math.min(12, Math.max(0, parsed));
      setDraft(String(clamped));
      if (clamped !== value) {
        onChange(clamped);
      }
    } else {
      skipBlurCommitRef.current = false;
      setDraft(String(value));
    }
  };

  const atMin = value <= 0;
  const atMax = value >= 12;
  return (
    <div className="max-depth-stepper">
      <button
        type="button"
        className="max-depth-stepper-btn"
        title="Decrease max depth"
        aria-label="Decrease max depth"
        aria-disabled={atMin}
        style={atMin ? { pointerEvents: 'none' } : undefined}
        onClick={() => {
          if (!atMin) onChange(Math.max(0, value - 1));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M6 12h12" />
        </svg>
      </button>
      <input
        id="max-depth-input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={draft}
        aria-label="Max scan depth"
        onChange={(e) => {
          skipBlurCommitRef.current = false;
          setDraft(e.target.value);
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
      <button
        type="button"
        className="max-depth-stepper-btn"
        title="Increase max depth"
        aria-label="Increase max depth"
        aria-disabled={atMax}
        style={atMax ? { pointerEvents: 'none' } : undefined}
        onClick={() => {
          if (!atMax) onChange(Math.min(12, value + 1));
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 6v12" />
          <path d="M6 12h12" />
        </svg>
      </button>
    </div>
  );
}

export function SettingsGeneralTab({
  language,
  strings,
  theme,
  installedLanguages,
  locationDisplayMode,
  titleDisplayMode,
  displayProductCodes,
  maxDepth,
  autoAllowLargeSaves,
  isUpdatingConfig,
  onThemeChange,
  onLanguageChange,
  onOpenLanguagePack,
  onLocationDisplayModeChange,
  onUpdateDisplayConfig,
  onMaxDepthChange,
}: SettingsGeneralTabProps): React.JSX.Element {
  return (
    <div
      id="settings-panel-general"
      role="tabpanel"
      aria-labelledby="settings-tab-general"
      className="settings-tab-panel"
    >
      <div className="setting-item">
        <label htmlFor="theme-select">
          {language === 'en' ? 'Theme' : strings.theme || 'Theme'}
        </label>
        <div className="setting-control-zone">
          <select
            id="theme-select"
            value={theme}
            onChange={(e) => onThemeChange(e.target.value)}
          >
            <option value="system">{strings.theme_system || 'System'}</option>
            <option value="dark">{strings.theme_dark || 'Dark'}</option>
            <option value="light">{strings.theme_light || 'Light'}</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="language-select">{strings.lang || 'Language'}</label>
        <div className="setting-control-zone setting-field-group">
          <button
            type="button"
            className="small-btn secondary-btn"
            onClick={() => onOpenLanguagePack?.()}
          >
            {strings.settings_more_languages || 'More languages...'}
          </button>
          <select
            id="language-select"
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
          >
            {installedLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="location-display-select">
          {language === 'en'
            ? 'Location Display'
            : strings.location_display_label || 'Location Display'}
        </label>
        <div className="setting-control-zone">
          <select
            id="location-display-select"
            value={locationDisplayMode}
            onChange={(e) =>
              onLocationDisplayModeChange(e.target.value as 'parent' | 'full')
            }
          >
            <option value="parent">
              {language === 'en'
                ? 'Parent Folder'
                : strings.location_display_parent || 'Parent Folder'}
            </option>
            <option value="full">
              {language === 'en'
                ? 'Full Path'
                : strings.location_display_full || 'Full Path'}
            </option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="title-display-select">
          {strings.title_display_label || 'Title Display'}
        </label>
        <div className="setting-control-zone">
          <select
            id="title-display-select"
            value={titleDisplayMode}
            aria-disabled={isUpdatingConfig}
            style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            onChange={(e) =>
              onUpdateDisplayConfig({
                titleDisplayMode: e.target.value as 'metadata' | 'legacy_folder',
              })
            }
          >
            <option value="metadata">
              {language === 'en'
                ? 'Metadata Title'
                : strings.title_display_metadata || 'Metadata Title'}
            </option>
            <option value="legacy_folder">
              {language === 'en'
                ? 'Folder Name'
                : strings.title_display_legacy || 'Folder Name'}
            </option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="product-codes-select">
          {language === 'en'
            ? 'Product Codes'
            : strings.display_codes_label || 'Product Codes'}
        </label>
        <div className="setting-control-zone">
          <select
            id="product-codes-select"
            value={displayProductCodes ? 'on' : 'off'}
            aria-disabled={isUpdatingConfig}
            style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            onChange={(e) =>
              onUpdateDisplayConfig({
                displayProductCodes: e.target.value === 'on',
              })
            }
          >
            <option value="off">{strings.option_off || 'Off'}</option>
            <option value="on">{strings.option_on || 'On'}</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="max-depth-input">
          {language === 'en'
            ? 'Max Scan Depth'
            : strings.max_depth_label || 'Max Scan Depth'}
        </label>
        <div className="setting-control-zone">
          <MaxDepthStepper value={maxDepth} onChange={onMaxDepthChange} />
        </div>
      </div>

      <div className="setting-item">
        <div className="setting-label-with-info">
          <label htmlFor="auto-allow-large-saves-select">
            {strings.setting_auto_allow_large_saves_label ||
              'Always Allow Large Saves (>64 MB)'}
          </label>
          <button
            type="button"
            className="setting-info-btn"
            aria-label={
              strings.setting_auto_allow_large_saves_info ||
              'Very large save files can take longer to open and use more memory while editing.'
            }
            data-tooltip={
              strings.setting_auto_allow_large_saves_info ||
              'Very large save files can take longer to open and use more memory while editing.'
            }
            data-tooltip-compact="true"
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.9.9 0 1 1 0 1.8A.9.9 0 0 1 8 4zm-.75 3h1.5v5h-1.5V7z" />
            </svg>
          </button>
        </div>
        <div className="setting-control-zone">
          <select
            id="auto-allow-large-saves-select"
            value={autoAllowLargeSaves ? 'on' : 'off'}
            aria-disabled={isUpdatingConfig}
            style={isUpdatingConfig ? { pointerEvents: 'none', opacity: 0.6 } : undefined}
            onChange={(e) =>
              onUpdateDisplayConfig({
                autoAllowLargeSaves: e.target.value === 'on',
              })
            }
          >
            <option value="off">{strings.option_off || 'Off'}</option>
            <option value="on">{strings.option_on || 'On'}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
