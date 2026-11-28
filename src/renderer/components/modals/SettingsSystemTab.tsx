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
  exposeBetaOptions: boolean;
  onAutoLaunchChange: (value: string) => void;
  onMinimizeToTrayChange: (enabled: boolean) => void;
  onExposeBetaChange: (enabled: boolean) => void;
}

export function SettingsSystemTab({
  language,
  strings,
  autoLaunchValue,
  minimizeToTray,
  exposeBetaOptions,
  onAutoLaunchChange,
  onMinimizeToTrayChange,
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
