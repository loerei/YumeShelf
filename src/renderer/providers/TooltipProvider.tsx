import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

export interface ActiveTooltipState {
  readonly title: string;
  readonly meta?: string;
  readonly subtitle?: string;
  readonly compact: boolean;
  readonly top: number;
  readonly left: number;
}

export interface TooltipContextValue {
  readonly activeTooltip: ActiveTooltipState | null;
  readonly isVisible: boolean;
  hideTooltip(): void;
}

const TooltipContext = createContext<TooltipContextValue | null>(null);

export interface TooltipProviderProps {
  readonly children: React.ReactNode;
  readonly delayMs?: number;
}

const DEFAULT_TOOLTIP_DELAY_MS = 300;
const VIEWPORT_PADDING = 12;
const CURSOR_OFFSET = 12;

function clampTooltipPosition(
  anchorX: number,
  anchorY: number,
  tooltipWidth = 240,
  tooltipHeight = 48
): { top: number; left: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;

  let left = anchorX;
  let top = anchorY;

  if (left + tooltipWidth > vw - VIEWPORT_PADDING) {
    left = Math.max(VIEWPORT_PADDING, vw - tooltipWidth - VIEWPORT_PADDING);
  }
  if (left < VIEWPORT_PADDING) {
    left = VIEWPORT_PADDING;
  }

  if (top + tooltipHeight > vh - VIEWPORT_PADDING) {
    top = Math.max(VIEWPORT_PADDING, anchorY - tooltipHeight - CURSOR_OFFSET * 2);
  }
  if (top < VIEWPORT_PADDING) {
    top = VIEWPORT_PADDING;
  }

  return { top, left };
}

function migrateNativeTitle(el: Element): string {
  const existing = el.getAttribute('data-tooltip');
  if (existing && existing.trim().length > 0) {
    if (el.hasAttribute('title')) {
      el.removeAttribute('title');
    }
    return existing.trim();
  }
  const titleAttr = el.getAttribute('title');
  if (titleAttr && titleAttr.trim().length > 0) {
    const trimmed = titleAttr.trim();
    el.setAttribute('data-tooltip', trimmed);
    el.removeAttribute('title');
    return trimmed;
  }
  return '';
}

function isDropdownMenuOpen(): boolean {
  return Boolean(document.querySelector('.dropdown-menu.show'));
}

export function TooltipProvider({
  children,
  delayMs = DEFAULT_TOOLTIP_DELAY_MS,
}: TooltipProviderProps): React.ReactElement {
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltipState | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const currentTriggerRef = useRef<Element | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const hideTooltip = useCallback(() => {
    clearPendingTimer();
    currentTriggerRef.current = null;
    setIsVisible(false);
    setActiveTooltip(null);
  }, [clearPendingTimer]);

  const scheduleShowForTrigger = useCallback(
    (triggerEl: Element, pointerPos?: { x: number; y: number }) => {
      if (isDropdownMenuOpen()) {
        hideTooltip();
        return;
      }

      const title = migrateNativeTitle(triggerEl);
      if (!title) return;

      const meta = triggerEl.getAttribute('data-tooltip-meta')?.trim() || undefined;
      const subtitle = triggerEl.getAttribute('data-tooltip-subtitle')?.trim() || undefined;
      const compact =
        triggerEl.getAttribute('data-tooltip-compact') === 'true' || (!meta && !subtitle);

      clearPendingTimer();
      currentTriggerRef.current = triggerEl;

      showTimerRef.current = setTimeout(() => {
        showTimerRef.current = null;
        if (!triggerEl.isConnected || currentTriggerRef.current !== triggerEl) {
          return;
        }
        if (isDropdownMenuOpen()) {
          return;
        }

        const rect = triggerEl.getBoundingClientRect();
        const anchorX = pointerPos ? pointerPos.x + CURSOR_OFFSET : rect.left;
        const anchorY = pointerPos ? pointerPos.y + CURSOR_OFFSET : rect.bottom + 8;
        const pos = clampTooltipPosition(anchorX, anchorY);

        setActiveTooltip({
          title,
          meta,
          subtitle,
          compact,
          top: pos.top,
          left: pos.left,
        });
        setIsVisible(true);
      }, delayMs);
    },
    [clearPendingTimer, delayMs, hideTooltip]
  );

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      if (isDropdownMenuOpen()) {
        hideTooltip();
        return;
      }
      const triggerEl = e.target.closest('[data-tooltip], [title]');
      if (!triggerEl) return;
      if (currentTriggerRef.current === triggerEl) return;
      scheduleShowForTrigger(triggerEl, { x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!currentTriggerRef.current) return;
      if (isDropdownMenuOpen()) {
        hideTooltip();
        return;
      }
      const pos = clampTooltipPosition(e.clientX + CURSOR_OFFSET, e.clientY + CURSOR_OFFSET);
      setActiveTooltip((prev) => (prev ? { ...prev, top: pos.top, left: pos.left } : prev));
    };

    const handleMouseOut = (e: MouseEvent) => {
      const current = currentTriggerRef.current;
      if (!current) return;
      if (e.relatedTarget instanceof Node && current.contains(e.relatedTarget)) {
        return;
      }
      hideTooltip();
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!(e.target instanceof Element)) return;
      if (isDropdownMenuOpen()) {
        hideTooltip();
        return;
      }
      const triggerEl = e.target.closest('[data-tooltip], [title]');
      if (!triggerEl) return;
      scheduleShowForTrigger(triggerEl);
    };

    const handleFocusOut = (e: FocusEvent) => {
      const current = currentTriggerRef.current;
      if (!current) return;
      if (e.relatedTarget instanceof Node && current.contains(e.relatedTarget)) {
        return;
      }
      hideTooltip();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        hideTooltip();
      }
    };

    const handlePointerDown = () => hideTooltip();
    const handleScroll = () => hideTooltip();
    const handleBlur = () => hideTooltip();
    const handleResize = () => hideTooltip();

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleMouseOut);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', handleScroll, true);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('resize', handleResize);

    return () => {
      clearPendingTimer();
      currentTriggerRef.current = null;
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseout', handleMouseOut);
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', handleScroll, true);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('resize', handleResize);
    };
  }, [clearPendingTimer, hideTooltip, scheduleShowForTrigger]);

  const contextValue = useMemo<TooltipContextValue>(
    () => ({
      activeTooltip,
      isVisible,
      hideTooltip,
    }),
    [activeTooltip, isVisible, hideTooltip]
  );

  const tooltipNode = activeTooltip ? (
    <div
      ref={tooltipRef}
      role="tooltip"
      className={`app-tooltip ${isVisible ? 'show' : ''} ${activeTooltip.compact ? 'compact' : ''}`}
      style={{
        top: `${activeTooltip.top}px`,
        left: `${activeTooltip.left}px`,
        zIndex: 'var(--zIndex-tooltip)',
        isolation: 'isolate',
      }}
    >
      <div className="app-tooltip-title">{activeTooltip.title}</div>
      {activeTooltip.meta && <div className="app-tooltip-meta-line">{activeTooltip.meta}</div>}
      {activeTooltip.subtitle && <div className="app-tooltip-subtitle">{activeTooltip.subtitle}</div>}
    </div>
  ) : null;

  return (
    <TooltipContext.Provider value={contextValue}>
      {children}
      {tooltipNode && typeof document !== 'undefined' ? createPortal(tooltipNode, document.body) : null}
    </TooltipContext.Provider>
  );
}

export function useTooltip(): TooltipContextValue | null {
  return useContext(TooltipContext);
}

export interface TooltipProps {
  readonly content: string;
  readonly meta?: string;
  readonly subtitle?: string;
  readonly compact?: boolean;
  readonly children: React.ReactElement;
}

export function Tooltip({
  content,
  meta,
  subtitle,
  compact,
  children,
}: TooltipProps): React.ReactElement {
  const ctx = useContext(TooltipContext);
  if (!ctx) {
    // Graceful degradation outside TooltipProvider: render children directly without throwing
    return children;
  }

  return (
    <span
      data-tooltip={content}
      data-tooltip-meta={meta}
      data-tooltip-subtitle={subtitle}
      data-tooltip-compact={compact !== undefined ? String(compact) : undefined}
      style={{ display: 'inline-flex' }}
    >
      {children}
    </span>
  );
}
