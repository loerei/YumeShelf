import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import type { ElectronAPI } from '../../../shared/types/ipc';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';

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
    title: 'React',
    author: 'Meta Open Source',
    url: 'https://react.dev',
    description: 'The library for web and native user interfaces.',
  },
  {
    title: 'Electron',
    author: 'OpenJS Foundation',
    url: 'https://www.electronjs.org',
    description: 'Build cross-platform desktop apps with JavaScript, HTML, and CSS.',
  },
  {
    title: 'TanStack Virtual',
    author: 'Tanner Linsley',
    url: 'https://tanstack.com/virtual',
    description: 'Headless UI for virtualizing scrollable elements.',
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
      fallbackFocusRef={fallbackFocusRef}
      panelClassName="about-panel"
      title="About YumeShelf"
    >
      <Modal.Header>About YumeShelf</Modal.Header>
      <Modal.Body className="about-body">
        <div className="about-brand">
          <div className="about-brand-text">
            <h3>YumeShelf</h3>
            <p className="about-version">{appVersion ? `Version ${appVersion}` : 'Desktop Library'}</p>
            <p className="about-tagline">A pragmatic visual novel & RPG desktop launcher and save manager.</p>
            <p className="about-author">Created with care for visual novel enthusiasts.</p>
          </div>
        </div>

        <div className="about-credits-section">
          <h4>Open Source Credits & Dependencies</h4>
          <p className="about-credits-intro">
            YumeShelf is powered by these remarkable open-source projects:
          </p>
          {CREDITS.map((credit) => (
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
                <span className="about-credit-author">— {credit.author}</span>
              </div>
              <p className="about-credit-desc">{credit.description}</p>
            </div>
          ))}
        </div>

        <div className="about-license-note">
          <p>Released under the MIT License.</p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <button type="button" className="small-btn secondary-btn" onClick={onClose}>
          Close
        </button>
      </Modal.Footer>
    </Modal>
  );
};
