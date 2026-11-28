import React from 'react';
import type { LocaleStrings } from '../../i18n/locale-strings';

export interface SettingsUpdatesTabProps {
  language: string;
  strings: LocaleStrings;
  appUpdateMode: string;
  langPackUpdateMode: string;
  onAppUpdateModeChange: (nextMode: string) => void;
  onLangPackUpdateModeChange: (nextMode: string) => void;
}

export function SettingsUpdatesTab({
  language,
  strings,
  appUpdateMode,
  langPackUpdateMode,
  onAppUpdateModeChange,
  onLangPackUpdateModeChange,
}: SettingsUpdatesTabProps): React.JSX.Element {
  return (
    <div
      id="settings-panel-updates"
      role="tabpanel"
      aria-labelledby="settings-tab-updates"
      className="settings-tab-panel"
    >
      <div className="setting-item">
        <label htmlFor="app-updates-select">
          {strings.app_updates_label || 'App Updates'}
        </label>
        <div className="setting-control-zone">
          <select
            id="app-updates-select"
            value={appUpdateMode}
            onChange={(e) => onAppUpdateModeChange(e.target.value)}
          >
            <option value="automatic">
              {strings.update_mode_automatic || 'Automatic'}
            </option>
            <option value="notify">
              {language === 'en'
                ? 'Notify Only'
                : strings.update_mode_notify || 'Notify Only'}
            </option>
            <option value="off">{strings.update_mode_off || 'Off'}</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="lang-pack-updates-select">
          {strings.language_pack_updates_label || 'Language Pack Updates'}
        </label>
        <div className="setting-control-zone">
          <select
            id="lang-pack-updates-select"
            value={langPackUpdateMode}
            onChange={(e) => onLangPackUpdateModeChange(e.target.value)}
          >
            <option value="automatic">
              {strings.update_mode_automatic || 'Automatic'}
            </option>
            <option value="notify">
              {language === 'en'
                ? 'Notify Only'
                : strings.update_mode_notify || 'Notify Only'}
            </option>
            <option value="off">{strings.update_mode_off || 'Off'}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
