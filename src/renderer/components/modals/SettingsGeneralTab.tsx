import React from 'react';
import type { LocaleStrings } from '../../i18n/locale-strings';

export interface SettingsGeneralTabProps {
  language: string;
  strings: LocaleStrings;
  theme: string;
  installedLanguages: ReadonlyArray<{ code: string; label: string }>;
  onThemeChange: (nextTheme: string) => void;
  onLanguageChange: (nextLang: string) => void;
  onOpenLanguagePack?: () => void;
}

export function SettingsGeneralTab({
  language,
  strings,
  theme,
  installedLanguages,
  onThemeChange,
  onLanguageChange,
  onOpenLanguagePack,
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
    </div>
  );
}
