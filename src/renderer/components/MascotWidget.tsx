import React, { useEffect, useRef, useState } from 'react';
import { useLocaleStrings } from '../i18n/locale-strings';
import { createMascotWidget, type MascotController } from '../mascot-widget';
import type { UiStorageAdapter } from '../state/ui-runtime-state';

export interface MascotPreferences {
  show?: boolean;
  scale?: number | string;
  sound?: string;
  volume?: number | string;
}

export interface MascotWidgetProps extends MascotPreferences {
  storage?: UiStorageAdapter;
  onBonk?: (quote: string) => void;
  onRecoverSmug?: () => void;
}

export const MascotWidget: React.FC<MascotWidgetProps> = ({
  show,
  scale,
  sound,
  volume,
  storage,
  onBonk,
  onRecoverSmug,
}) => {
  const strings = useLocaleStrings(storage);
  const stringsRef = useRef(strings);
  stringsRef.current = strings;

  const widgetRef = useRef<HTMLButtonElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<MascotController | null>(null);
  const onBonkRef = useRef(onBonk);
  onBonkRef.current = onBonk;
  const onRecoverSmugRef = useRef(onRecoverSmug);
  onRecoverSmugRef.current = onRecoverSmug;

  const [displayScale, setDisplayScale] = useState<number>(() => {
    const parsed = scale !== undefined ? Number(scale) : 30;
    return Number.isFinite(parsed) ? Math.min(100, Math.max(25, parsed)) : 30;
  });

  const [displayVolume, setDisplayVolume] = useState<number>(() => {
    const parsed = volume !== undefined ? Number(volume) : 20;
    return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : 20;
  });

  useEffect(() => {
    const controller = createMascotWidget({
      widgetEl: widgetRef.current,
      imgEl: imgRef.current,
      contextMenuEl: contextMenuRef.current,
      storage,
      getStrings: () => stringsRef.current,
      onBonk: (quote) => {
        onBonkRef.current?.(quote);
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('yumeshelf:mascot-bonk', { detail: { quote } }));
        }
      },
      onRecoverSmug: () => {
        onRecoverSmugRef.current?.();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('yumeshelf:mascot-recover'));
        }
      },
    });
    controllerRef.current = controller;
    controller.init();

    if (show !== undefined) controller.setVisible(show);
    if (scale !== undefined) controller.setScale(scale);
    if (sound !== undefined) controller.setSound(sound);
    if (volume !== undefined) controller.setVolume(volume);

    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
  }, [storage]);

  useEffect(() => {
    if (show !== undefined) {
      controllerRef.current?.setVisible(show);
    }
  }, [show]);

  useEffect(() => {
    if (scale !== undefined) {
      controllerRef.current?.setScale(scale);
      const parsed = Number(scale);
      if (Number.isFinite(parsed)) {
        setDisplayScale(Math.min(100, Math.max(25, parsed)));
      }
    }
  }, [scale]);

  useEffect(() => {
    if (sound !== undefined) {
      controllerRef.current?.setSound(sound);
    }
  }, [sound]);

  useEffect(() => {
    if (volume !== undefined) {
      controllerRef.current?.setVolume(volume);
      const parsed = Number(volume);
      if (Number.isFinite(parsed)) {
        setDisplayVolume(Math.min(100, Math.max(0, parsed)));
      }
    }
  }, [volume]);

  return (
    <div id="mascot-widget-container">
      <button
        type="button"
        className="yume-mascot-widget"
        id="yume-mascot-widget"
        title="Bonk!"
        ref={widgetRef}
      >
        <img
          className="yume-mascot-img"
          id="yume-mascot-img"
          alt="Yume Mascot"
          draggable={false}
          ref={imgRef}
        />
      </button>

      <div
        className="mascot-context-menu"
        id="mascot-context-menu"
        style={{ display: 'none' }}
        ref={contextMenuRef}
      >
        <div className="mascot-menu-header">
          <div className="mascot-menu-title-group">
            <span className="mascot-menu-title">Yume-chan</span>
            <span className="mascot-menu-counter" id="mascot-menu-counter">
              Bonked 0 times
            </span>
          </div>
          <button
            type="button"
            className="mascot-menu-reset-btn"
            id="mascot-menu-reset-btn"
            data-i18n="mascot_menu_reset_position"
          >
            {strings.mascot_menu_reset_position || 'Reset Position'}
          </button>
        </div>
        <div className="mascot-menu-divider" />
        <div className="mascot-menu-row">
          <label
            id="ui-mascot-menu-sound-label"
            htmlFor="mascot-menu-sound-select"
            data-i18n="mascot_menu_sound"
          >
            {strings.mascot_menu_sound || 'Bonk Sound'}
          </label>
          <select
            id="mascot-menu-sound-select"
            defaultValue={sound ?? 'squeaker'}
            onChange={(e) => {
              controllerRef.current?.setSound(e.target.value);
            }}
          >
            <option value="squeaker" data-i18n="sound_squeaker">
              {strings.sound_squeaker || 'Squeaky'}
            </option>
            <option value="metal-pipe" data-i18n="sound_metal_pipe">
              {strings.sound_metal_pipe || 'Metal pipe'}
            </option>
            <option value="none" data-i18n="sound_none">
              {strings.sound_none || 'None'}
            </option>
          </select>
        </div>
        <div className="mascot-menu-row">
          <label
            id="ui-mascot-menu-scale-label"
            htmlFor="mascot-menu-scale-slider"
            data-i18n="mascot_menu_scale"
          >
            {strings.mascot_menu_scale || 'Scale'}
          </label>
          <div className="volume-slider-container">
            <input
              type="range"
              id="mascot-menu-scale-slider"
              min={25}
              max={100}
              value={displayScale}
              step={1}
              aria-label="Scale"
              aria-valuetext={`${displayScale}%`}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDisplayScale(next);
                controllerRef.current?.setScale(next);
              }}
            />
            <span className="volume-value-label" id="mascot-menu-scale-value">
              {`${displayScale}%`}
            </span>
          </div>
        </div>
        <div className="mascot-menu-row">
          <label
            id="ui-mascot-menu-volume-label"
            htmlFor="mascot-menu-volume-slider"
            data-i18n="mascot_menu_volume"
          >
            {strings.mascot_menu_volume || 'Volume'}
          </label>
          <div className="volume-slider-container">
            <input
              type="range"
              id="mascot-menu-volume-slider"
              min={0}
              max={100}
              value={displayVolume}
              step={1}
              aria-label="Volume"
              aria-valuetext={`${displayVolume}%`}
              onChange={(e) => {
                const next = Number(e.target.value);
                setDisplayVolume(next);
                controllerRef.current?.setVolume(next);
              }}
            />
            <span className="volume-value-label" id="mascot-menu-volume-value">
              {`${displayVolume}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
