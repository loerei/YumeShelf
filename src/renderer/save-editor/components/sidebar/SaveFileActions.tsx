import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { sanitizeUserPaths } from '../../../../shared/path-sanitizer';

export interface SaveFileActionsProps {
  fileName: string;
  onStartRename?: () => void;
  onDelete: () => Promise<void>;
  /** Disables action interactions via aria-disabled="true" and pointer-events: none without setting native HTML disabled, preserving focus continuity */
  disabled?: boolean;
  isConfirmOpen?: boolean;
  onConfirmOpenChange?: (open: boolean) => void;
}

export const SaveFileActions: React.FC<SaveFileActionsProps> = ({
  fileName,
  onStartRename,
  onDelete,
  disabled = false,
  isConfirmOpen: controlledIsConfirmOpen,
  onConfirmOpenChange,
}) => {
  const [internalIsConfirmOpen, setInternalIsConfirmOpen] = useState(false);
  const resolvedOpen = controlledIsConfirmOpen ?? internalIsConfirmOpen;
  const setConfirmOpen = (next: boolean) => {
    if (controlledIsConfirmOpen !== undefined) {
      onConfirmOpenChange?.(next);
    } else {
      setInternalIsConfirmOpen(next);
    }
  };
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [popoverCoords, setPopoverCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const isMountedRef = useRef(true);
  const wasConfirmOpenRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (wasConfirmOpenRef.current && !resolvedOpen && deleteBtnRef.current?.isConnected) {
      deleteBtnRef.current.focus();
    }
    wasConfirmOpenRef.current = resolvedOpen;
  }, [resolvedOpen]);

  useLayoutEffect(() => {
    if (!resolvedOpen || !deleteBtnRef.current) return;
    const updatePosition = () => {
      const rect = deleteBtnRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxWidth = 270;
      const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - maxWidth - 8));
      const top = Math.min(rect.bottom + 6, Math.max(8, window.innerHeight - 160));
      setPopoverCoords({ top, left });
    };
    updatePosition();

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (popoverRef.current?.contains(target) || deleteBtnRef.current?.contains(target)) {
        return; // Keep open on internal popover text/button clicks
      }
      if (!isDeleting) {
        setConfirmOpen(false);
        setDeleteError(null);
      }
    };
    const handleScrollOrResize = () => {
      if (!isDeleting) {
        setConfirmOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [resolvedOpen, isDeleting]);

  const handleConfirmDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (isDeleting || disabled) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await onDelete();
      if (isMountedRef.current) {
        setIsDeleting(false);
        setConfirmOpen(false);
      }
    } catch (err: any) {
      if (isMountedRef.current) {
        const rawMsg = err?.message || 'Failed to delete save slot.';
        setDeleteError(sanitizeUserPaths(rawMsg));
        setIsDeleting(false);
      }
    }
  };

  const handleCancelDelete = (e?: React.MouseEvent) => {
    e?.preventDefault();
    if (isDeleting) return;
    setConfirmOpen(false);
    setDeleteError(null);
    deleteBtnRef.current?.focus();
  };

  const isRenameDisabled = disabled || isDeleting;
  const isDeleteDisabled = disabled || isDeleting;

  return (
    <div
      className="save-file-actions"
      data-interactive="true"
    >
      {onStartRename && (
        <button
          type="button"
          className="save-file-action-btn rename-btn"
          onClick={(e) => {
            e.preventDefault();
            if (isRenameDisabled) return;
            onStartRename();
          }}
          aria-disabled={isRenameDisabled}
          style={isRenameDisabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
          title={`Rename ${fileName}`}
          aria-label={`Rename ${fileName}`}
        >
          <svg
            className="action-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 20h9M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
          </svg>
        </button>
      )}
      <button
        ref={deleteBtnRef}
        type="button"
        className="save-file-action-btn delete-btn"
        onClick={(e) => {
          e.preventDefault();
          if (isDeleteDisabled) return;
          setConfirmOpen(true);
        }}
        aria-disabled={isDeleteDisabled}
        style={isDeleteDisabled ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
        aria-haspopup="dialog"
        aria-expanded={resolvedOpen}
        title={`Delete ${fileName}`}
        aria-label={`Delete ${fileName}`}
      >
        <svg
          className="action-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" />
        </svg>
      </button>
      {resolvedOpen &&
        createPortal(
          <div
            ref={popoverRef}
            className="save-editor-popover"
            role="dialog"
            aria-label={`Confirm deletion of ${fileName}`}
            data-interactive="true"
            style={{
              position: 'fixed',
              top: `${popoverCoords.top}px`,
              left: `${popoverCoords.left}px`,
              zIndex: 'var(--zIndex-dropdown, 1000)',
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                if (isDeleting) return;
                handleCancelDelete();
              }
            }}
            tabIndex={-1}
          >
            <h4 className="save-editor-popover-title">Confirm Deletion</h4>
            <p className="save-editor-popover-desc">
              Are you sure you want to delete <strong>{fileName}</strong>?
            </p>
            {deleteError && (
              <div className="save-action-error" role="alert">
                {deleteError}
              </div>
            )}
            <div className="save-editor-popover-actions">
              <button
                type="button"
                className="save-editor-popover-btn danger-btn"
                onClick={handleConfirmDelete}
                aria-disabled={isDeleting}
                style={isDeleting ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
              >
                {isDeleting ? 'Deleting...' : 'Confirm'}
              </button>
              <button
                type="button"
                className="save-editor-popover-btn cancel-btn"
                onClick={handleCancelDelete}
                aria-disabled={isDeleting}
                style={isDeleting ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                autoFocus
              >
                Cancel
              </button>
            </div>
          </div>,
          document.getElementById('portal-root') ?? document.body
        )}
    </div>
  );
};
