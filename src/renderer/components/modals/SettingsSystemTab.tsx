import React from 'react';
import type { LocaleStrings } from '../../i18n/locale-strings';

export interface MascotPreferences {
  show: boolean;
  scale: number;
  sound: string;
  volume: number;
}

export interface SettingsSystemTabProps {
  language: string;
  strings: LocaleStrings;
  autoLaunchValue: string;
  minimizeToTray: boolean;
  autoAllowLargeSaves: boolean;
  isUpdatingConfig: boolean;
  exposeBetaOptions: boolean;
  onAutoLaunchChange: (value: string) => void;
  onMinimizeToTrayChange: (enabled: boolean) => void;
  onUpdateDisplayConfig: (updates: {
    titleDisplayMode?: 'metadata' | 'legacy_folder';
    displayProductCodes?: boolean;
    autoAllowLargeSaves?: boolean;
  }) => void;
  onExposeBetaChange: (enabled: boolean) => void;
}

export function SettingsSystemTab({
  language,
  strings,
  autoLaunchValue,
  minimizeToTray,
  autoAllowLargeSaves,
  isUpdatingConfig,
  exposeBetaOptions,
  onAutoLaunchChange,
  onMinimizeToTrayChange,
  onUpdateDisplayConfig,
  onExposeBetaChange,
}: SettingsSystemTabProps): React.JSX.Element {
  return (
    <div
      id="settings-panel-system"
      role="tabpanel"
      aria-labelledby="settings-tab-system"
      className="settings-tab-panel"
    >
      <div className="setting-item">
        <label htmlFor="auto-launch-select">
          {language === 'en'
            ? 'Launch on Startup'
            : strings.auto_launch_label || 'Launch on Startup'}
        </label>
        <div className="setting-control-zone">
          <select
            id="auto-launch-select"
            value={autoLaunchValue}
            onChange={(e) => onAutoLaunchChange(e.target.value)}
          >
            <option value="off">{strings.option_off || 'Off'}</option>
            <option value="on">{strings.option_on || 'On'}</option>
            <option value="minimized">
              {language === 'en'
                ? 'Minimized'
                : strings.option_minimized || 'Minimized'}
            </option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="minimize-tray-select">
          {language === 'en'
            ? 'Minimize to Tray'
            : strings.minimize_to_tray_label || 'Minimize to Tray'}
        </label>
        <div className="setting-control-zone">
          <select
            id="minimize-tray-select"
            value={minimizeToTray ? 'on' : 'off'}
            onChange={(e) => onMinimizeToTrayChange(e.target.value === 'on')}
          >
            <option value="off">{strings.option_off || 'Off'}</option>
            <option value="on">{strings.option_on || 'On'}</option>
          </select>
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

      <div className="setting-item">
        <label htmlFor="expose-beta-select">
          {strings.expose_beta_label || 'Expose Beta Options'}
        </label>
        <div className="setting-control-zone">
          <select
            id="expose-beta-select"
            value={exposeBetaOptions ? 'on' : 'off'}
            onChange={(e) => onExposeBetaChange(e.target.value === 'on')}
          >
            <option value="off">{strings.option_off || 'Off'}</option>
            <option value="on">{strings.option_on || 'On'}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
