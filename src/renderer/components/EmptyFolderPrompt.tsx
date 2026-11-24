import React, { useRef, useState } from 'react';
import { sanitizeUserPaths } from '../../shared/path-sanitizer';
import { resolveLocalizedErrorCode, useLocaleStrings } from '../i18n/locale-strings';
import type { GameEntry } from '../types/game';

export interface ManualAddResult {
  readonly ok: boolean;
  readonly game?: GameEntry;
  readonly canceled?: boolean;
  readonly error?: string;
}

export interface EmptyFolderPromptProps {
  readonly folderPath: string;
  readonly onAddManualGame: (folderPath: string) => Promise<ManualAddResult>;
  readonly onShowToast?: (message: string) => void;
}

/**
 * Pure presentational empty-folder prompt button for adding a game executable manually.
 */
export const EmptyFolderPrompt: React.FC<EmptyFolderPromptProps> = ({
  folderPath,
  onAddManualGame,
  onShowToast,
}) => {
  const strings = useLocaleStrings();
  const [isSelecting, setIsSelecting] = useState(false);
  const isSelectingRef = useRef(false);

  const handleClick = async () => {
    if (isSelectingRef.current) return;
    isSelectingRef.current = true;
    setIsSelecting(true);

    try {
      const res = await onAddManualGame(folderPath);
      if (res?.ok || res?.canceled) {
        return;
      }

      console.warn('[EmptyFolderPrompt] Manual game addition failed:', {
        folderPath: sanitizeUserPaths(folderPath),
        error: sanitizeUserPaths(res?.error ?? 'unknown'),
      });
      onShowToast?.(resolveLocalizedErrorCode(strings, res?.error, strings.toast_manual_add_failed));
    } catch (err) {
      console.error('[EmptyFolderPrompt] Manual game addition rejected:', {
        folderPath: sanitizeUserPaths(folderPath),
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      onShowToast?.(strings.toast_manual_add_failed);
    } finally {
      isSelectingRef.current = false;
      setIsSelecting(false);
    }
  };

  return (
    <button
      type="button"
      className="empty-folder-prompt manual-add-btn"
      aria-label={strings.add_game_to_folder}
      aria-busy={isSelecting ? 'true' : undefined}
      aria-disabled={isSelecting ? 'true' : undefined}
      onClick={() => {
        void handleClick();
      }}
    >
      {isSelecting ? strings.empty_folder_selecting : strings.manual_add_prompt}
    </button>
  );
};
