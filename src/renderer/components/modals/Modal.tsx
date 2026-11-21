import { createContext, useContext, useEffect, useId, useMemo, useRef } from 'react';
import type React from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  id?: string;
  className?: string;
  panelClassName?: string;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  children: React.ReactNode;
}

export interface ModalHeaderProps {
  title?: string;
  children?: React.ReactNode;
  id?: string;
  className?: string;
  onClose?: () => void;
}

export interface ModalBodyProps {
  children: React.ReactNode;
  className?: string;
}

export interface ModalFooterProps {
  children: React.ReactNode;
  className?: string;
}

interface ModalContextValue {
  titleId: string;
  onClose: () => void;
}

const ModalContext = createContext<ModalContextValue | null>(null);

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function ModalRoot({
  isOpen,
  onClose,
  title,
  id,
  className,
  panelClassName,
  fallbackFocusRef,
  children,
}: ModalProps) {
  const generatedId = useId();
  const titleId = id ? `${id}-title` : `modal-title-${generatedId}`;

  const backdropRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const pointerDownOnBackdropRef = useRef(false);
  const wasOpenRef = useRef(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const fallbackFocusRefLatest = useRef(fallbackFocusRef);
  fallbackFocusRefLatest.current = fallbackFocusRef;

  useEffect(() => {
    if (!isOpen) return;

    wasOpenRef.current = true;
    triggerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();

    return () => {
      if (!wasOpenRef.current) return;
      wasOpenRef.current = false;

      const active = document.activeElement;
      const focusAlreadyMovedOutside =
        active instanceof HTMLElement &&
        active.isConnected &&
        active !== document.body &&
        active !== document.documentElement &&
        (!dialogRef.current || !dialogRef.current.contains(active));

      if (focusAlreadyMovedOutside) {
        return;
      }

      if (triggerRef.current && triggerRef.current.isConnected) {
        triggerRef.current.focus();
        return;
      }

      const fallback = fallbackFocusRefLatest.current?.current;
      if (fallback && fallback.isConnected) {
        if (!fallback.hasAttribute('tabindex') && fallback.tabIndex < 0) {
          fallback.setAttribute('tabindex', '-1');
        }
        fallback.focus();
      }
    };
  }, [isOpen]);

  const contextValue = useMemo<ModalContextValue>(
    () => ({ titleId, onClose }),
    [titleId, onClose]
  );

  if (!isOpen) {
    return null;
  }

  const handleBackdropPointerDown = (e: React.MouseEvent<HTMLDivElement>) => {
    pointerDownOnBackdropRef.current = e.target === backdropRef.current;
  };

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const startedOnBackdrop = pointerDownOnBackdropRef.current;
    pointerDownOnBackdropRef.current = false;
    if (startedOnBackdrop && e.target === backdropRef.current) {
      onClose();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      const container = dialogRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');

      if (focusables.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey) {
        if (active === first || active === container) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
      return;
    }

    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const backdropClass = ['modal-backdrop', className].filter(Boolean).join(' ');
  const panelClass = ['modal-panel', panelClassName].filter(Boolean).join(' ');

  const modalContent = (
    <div
      ref={backdropRef}
      id={id}
      className={backdropClass}
      onMouseDown={handleBackdropPointerDown}
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className={panelClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={title ?? undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <ModalContext.Provider value={contextValue}>{children}</ModalContext.Provider>
      </div>
    </div>
  );

  const portalTarget = document.getElementById('portal-root') ?? document.body;
  return createPortal(modalContent, portalTarget);
}

function ModalHeader({ title, children, id, className, onClose }: ModalHeaderProps) {
  const ctx = useContext(ModalContext);
  const resolvedId = id ?? ctx?.titleId;
  const handleClose = () => {
    (onClose ?? ctx?.onClose)?.();
  };

  return (
    <div className={['modal-header', className].filter(Boolean).join(' ')}>
      <h2 id={resolvedId} className="modal-title">
        {children ?? title}
      </h2>
      <button
        type="button"
        className="modal-close-btn"
        aria-label="Close dialog"
        title="Close dialog"
        onClick={handleClose}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function ModalBody({ children, className }: ModalBodyProps) {
  return (
    <div className={['modal-body', className].filter(Boolean).join(' ')}>{children}</div>
  );
}

function ModalFooter({ children, className }: ModalFooterProps) {
  return (
    <div className={['modal-footer', className].filter(Boolean).join(' ')}>{children}</div>
  );
}

export const Modal = Object.assign(ModalRoot, {
  Header: ModalHeader,
  Body: ModalBody,
  Footer: ModalFooter,
});
