import React from 'react';
import { Modal } from './Modal';
import { AboutContent } from './AboutContent';
import type { ElectronAPI } from '../../../shared/types/ipc';
import { useLocaleStrings } from '../../i18n/locale-strings';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  electronAPI?: ElectronAPI;
  version?: string;
}

export const AboutModal: React.FC<AboutModalProps> = ({
  isOpen,
  onClose,
  fallbackFocusRef,
  electronAPI,
  version,
}) => {
  const strings = useLocaleStrings();

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
      <Modal.Body>
        <AboutContent electronAPI={electronAPI} version={version} />
      </Modal.Body>
    </Modal>
  );
};
