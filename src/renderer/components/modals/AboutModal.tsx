import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ElectronAPI } from '../../../shared/types/ipc';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';
import { useLocaleStrings } from '../../i18n/locale-strings';
import yumeshelfIcon from '../../../assets/yumeshelf_icon.png';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  electronAPI?: ElectronAPI;
  version?: string;
}

interface CreditItem {
  title: string;
  author: string;
  url: string;
  description: string;
}

const CREDITS: CreditItem[] = [
  {
    title: 'Detect-It-Easy / XPEViewer',
    author: 'by horsicq',
    url: 'https://github.com/horsicq/Detect-It-Easy',
    description: 'Binary inspection heuristics, PE structure analysis, and engine signatures.',
  },
  {
    title: 'XUnity.AutoTranslator',
    author: 'by bbepis',
    url: 'https://github.com/bbepis/XUnity.AutoTranslator',
    description: 'Unity runtime translation architecture and plugin hooking models.',
  },
  {
    title: 'BepInEx',
    author: 'by BepInEx Team',
    url: 'https://github.com/BepInEx/BepInEx',
    description: 'Unity and .NET modding and runtime injection framework.',
  },
];

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  fallbackFocusRef,
  electronAPI,
  version: propVersion,
}) => {
  const [appVersion, setAppVersion] = useState<string>(propVersion ?? '');
  const strings = useLocaleStrings();
  const localizedCredits: CreditItem[] = [
    {
      ...CREDITS[0],
      description: strings.about_credit_die_desc || CREDITS[0].description,
    },
    {
      ...CREDITS[1],
      description: strings.about_credit_xunity_desc || CREDITS[1].description,
    },
    {
      ...CREDITS[2],
      description: strings.about_credit_bepinex_desc || CREDITS[2].description,
    },
  ];

  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);

  useEffect(() => {
    if (propVersion) {
      setAppVersion(propVersion);
      return;
    }
    let isMounted = true;
    void api?.getAppVersion?.()
      .then((v) => {
        if (isMounted && v) setAppVersion(v);
      })
      .catch((err) => {
        console.warn('[AboutModal] Failed to retrieve application version:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        });
      });
    return () => {
      isMounted = false;
    };
  }, [propVersion, api]);

  const handleOpenLink = (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    if (api?.openExternalUrl) {
      void Promise.resolve(api.openExternalUrl(url)).catch((err) => {
        console.warn('[AboutModal] Failed to open external URL:', {
          url: sanitizeUserPaths(url),
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
      });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      modalType="about"
      fallbackFocusRef={fallbackFocusRef}
      className="settings-overlay"
      panelClassName="about-panel"
      title="About YumeShelf"
    >
      <Modal.Header className="settings-header">
        {strings.about_modal_title || 'About & Credits'}
      </Modal.Header>
      <Modal.Body className="about-body">
        <div className="about-brand">
          <img
            src={yumeshelfIcon}
            alt="YumeShelf"
            width={64}
            height={64}
            className="about-icon"
          />
          <div className="about-brand-text">
            <h3>{strings.title || 'YumeShelf'}</h3>
            <p className="about-version">{appVersion ? `Version ${appVersion}` : 'Desktop Library'}</p>
            <p className="about-tagline">
              {strings.about_tagline ||
                'A minimalist game library and launcher for your personal collection.'}
            </p>
            <p className="about-author">
              Created by{' '}
              <a
                href="https://github.com/loerei"
                className="about-external-link"
                onClick={(e) => handleOpenLink(e, 'https://github.com/loerei')}
                target="_blank"
                rel="noopener noreferrer"
              >
                loerei
              </a>
            </p>
          </div>
        </div>

        <div className="about-credits-section">
          <h4>{strings.about_credits_heading || 'Acknowledgements & Credits'}</h4>
          <p className="about-credits-intro">
            {strings.about_credits_intro ||
              'YumeShelf and the YumeEngine core parser are built upon foundational open-source engineering and heuristics from the community:'}
          </p>
          {localizedCredits.map((credit) => (
            <div key={credit.title} className="about-credit-card">
              <div className="about-credit-header">
                <a
                  href={credit.url}
                  className="about-external-link"
                  onClick={(e) => handleOpenLink(e, credit.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {credit.title}
                </a>
                <span className="about-credit-author">{credit.author}</span>
              </div>
              <p className="about-credit-desc">{credit.description}</p>
            </div>
          ))}
        </div>

        <div className="about-license-note">
          <p>
            {strings.about_license_text ||
              'YumeShelf is free and open-source software under the MIT License.'}
          </p>
        </div>
      </Modal.Body>
    </Modal>
  );
};
