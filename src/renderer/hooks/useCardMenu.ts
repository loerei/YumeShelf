import type React from 'react';
import { useEffect, useRef, useState } from 'react';

export interface UseCardMenuOptions {
  readonly cardRef: React.RefObject<HTMLDivElement | null>;
  readonly onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
}

export interface UseCardMenuResult {
  readonly isMenuOpen: boolean;
  readonly setIsMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  readonly menuRef: React.RefObject<HTMLDivElement | null>;
  readonly menuBtnRef: React.RefObject<HTMLButtonElement | null>;
  readonly handleMenuButtonClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  readonly handleCardContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * Manages open/close state and trigger handlers for a card's dropdown menu,
 * supporting both the menu button and right-click context menu on the card.
 */
export function useCardMenu({ cardRef, onContextMenu }: UseCardMenuOptions): UseCardMenuResult {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isMenuOpen) return;

    const handleDocumentPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null;
      if (!target) return;

      // Ignore secondary pointerdown on this card so the subsequent contextmenu event can toggle cleanly.
      if (e.button === 2 && cardRef.current?.contains(target)) {
        return;
      }

      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        menuBtnRef.current &&
        !menuBtnRef.current.contains(target)
      ) {
        setIsMenuOpen(false);
      }
    };

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [isMenuOpen, cardRef]);

  const handleMenuButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsMenuOpen((prev) => !prev);
  };

  const handleCardContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    onContextMenu?.(e);
    if (e.defaultPrevented) return;

    if (
      e.target instanceof HTMLElement &&
      e.target.closest('input, textarea, [contenteditable="true"]')
    ) {
      return;
    }

    if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
      e.preventDefault();
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    setIsMenuOpen((prev) => !prev);
  };

  return {
    isMenuOpen,
    setIsMenuOpen,
    menuRef,
    menuBtnRef,
    handleMenuButtonClick,
    handleCardContextMenu,
  };
}
