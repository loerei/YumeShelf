import React from 'react';
import type { LocaleStrings } from '../../i18n/locale-strings';
import { normalizeHideAndSeekMode, type HideAndSeekMode } from '../../mascot/mascot-domain';
import type { MascotPreferencesPatch } from '../../providers/MascotProvider';

export interface SettingsMascotTabProps {
  language: string;
  strings: LocaleStrings;
  mascotShow: boolean;
  hideAndSeek: HideAndSeekMode;
  mascotScale: number;
  mascotSound: string;
  mascotVolume: number;
  onUpdateMascotPreferences: (patch: MascotPreferencesPatch) => void;
}

export function SettingsMascotTab({
  language,
  strings,
  mascotShow,
  hideAndSeek,
  mascotScale,
  mascotSound,
  mascotVolume,
  onUpdateMascotPreferences,
}: SettingsMascotTabProps): React.JSX.Element {
  return (
    <div
      id="settings-panel-mascot"
      role="tabpanel"
      aria-labelledby="settings-tab-mascot"
      className="settings-tab-panel"
    >
      <div className="setting-item">
        <label htmlFor="mascot-show-select">
          {language === 'en'
            ? 'Show Mascot'
            : strings.mascot_show_label || 'Show Mascot'}
        </label>
        <div className="setting-control-zone">
          <select
            id="mascot-show-select"
            value={mascotShow ? 'on' : 'off'}
            onChange={(e) =>
              onUpdateMascotPreferences({ show: e.target.value === 'on' })
            }
          >
            <option value="on">
              {language === 'en'
                ? 'On'
                : strings.mascot_show_on || strings.option_on || 'On'}
            </option>
            <option value="off">
              {language === 'en'
                ? 'Off'
                : strings.mascot_show_off || strings.option_off || 'Off'}
            </option>
          </select>
        </div>
      </div>

      <div className="setting-item" id="setting-item-hide-and-seek">
        <label htmlFor="hide-and-seek-select">
          {strings.hide_and_seek_label || 'Hide And Seek?'}
        </label>
        <div className="setting-control-zone">
          <select
            id="hide-and-seek-select"
            value={hideAndSeek}
            disabled={!mascotShow}
            onChange={(e) =>
              onUpdateMascotPreferences({
                hideAndSeek: normalizeHideAndSeekMode(e.target.value),
              })
            }
          >
            <option value="yeaaa">{strings.hide_and_seek_yeaaa || 'YEAAA'}</option>
            <option value="out">{strings.hide_and_seek_out || "I'm out"}</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="mascot-scale-slider">
          {language === 'en'
            ? 'Mascot Scale'
            : strings.mascot_scale_label || 'Mascot Scale'}
        </label>
        <div className="setting-control-zone">
          <div className="volume-slider-container">
            <span id="mascot-scale-value" className="volume-value-label">
              {mascotScale}%
            </span>
            <input
              id="mascot-scale-slider"
              type="range"
              min={25}
              max={100}
              value={mascotScale}
              aria-valuetext={`${mascotScale}%`}
              onChange={(e) =>
                onUpdateMascotPreferences({ scale: Number(e.target.value) })
              }
            />
          </div>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="mascot-sound-select">
          {language === 'en'
            ? 'Bonk Sound'
            : strings.mascot_sound_label || strings.mascot_menu_sound || 'Bonk Sound'}
        </label>
        <div className="setting-control-zone">
          <select
            id="mascot-sound-select"
            value={mascotSound}
            onChange={(e) => onUpdateMascotPreferences({ sound: e.target.value })}
          >
            <option value="squeaker">{strings.sound_squeaker || 'Squeaky'}</option>
            <option value="metal-pipe">{strings.sound_metal_pipe || 'Metal pipe'}</option>
            <option value="none">{strings.sound_none || 'None'}</option>
          </select>
        </div>
      </div>

      <div className="setting-item">
        <label htmlFor="mascot-volume-slider">
          {language === 'en'
            ? 'Mascot Volume'
            : strings.mascot_volume_label || 'Mascot Volume'}
        </label>
        <div className="setting-control-zone">
          <div className="volume-slider-container">
            <span id="mascot-volume-value" className="volume-value-label">
              {mascotVolume}%
            </span>
            <input
              id="mascot-volume-slider"
              type="range"
              min={0}
              max={100}
              value={mascotVolume}
              aria-valuetext={`${mascotVolume}%`}
              onChange={(e) =>
                onUpdateMascotPreferences({ volume: Number(e.target.value) })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
