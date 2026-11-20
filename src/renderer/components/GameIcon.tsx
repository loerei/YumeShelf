import React, { useEffect, useState } from 'react';
import type { GameEntry } from '../types/game';

const iconUrlCache = new Map<string, string>();

export interface GameIconProps {
  readonly game: Pick<GameEntry, 'name' | 'exePath' | 'iconUrl'>;
  readonly className?: string;
}

export const GameIcon = React.memo(function GameIcon({
  game,
  className = 'game-icon',
}: GameIconProps): React.ReactElement {
  const initialUrl =
    game.iconUrl || (game.exePath ? iconUrlCache.get(game.exePath) : undefined) || null;
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(initialUrl);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    if (game.iconUrl) {
      setResolvedUrl(game.iconUrl);
      if (game.exePath) {
        iconUrlCache.set(game.exePath, game.iconUrl);
      }
      return;
    }

    if (!game.exePath) {
      setResolvedUrl(null);
      return;
    }

    const cached = iconUrlCache.get(game.exePath);
    if (cached) {
      setResolvedUrl(cached);
      return;
    }

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api || typeof api.getIcon !== 'function') {
      setResolvedUrl(null);
      return;
    }

    let cancelled = false;
    void Promise.resolve(api.getIcon(game.exePath))
      .then((result: unknown) => {
        if (cancelled) return;
        const url =
          typeof result === 'string'
            ? result
            : result && typeof result === 'object' && 'iconUrl' in result
              ? String((result as { iconUrl?: unknown }).iconUrl || '')
              : '';
        if (url) {
          iconUrlCache.set(game.exePath!, url);
          setResolvedUrl(url);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHasError(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [game.iconUrl, game.exePath]);

  if (resolvedUrl && !hasError) {
    return (
      <img
        className={className}
        src={resolvedUrl}
        alt=""
        loading="lazy"
        onError={() => setHasError(true)}
      />
    );
  }

  return (
    <div className={`${className} game-icon-fallback`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="3" />
        <path d="M8 12h4M10 10v4" />
        <circle cx="16.5" cy="11" r="1" fill="currentColor" />
        <circle cx="14.5" cy="13.5" r="1" fill="currentColor" />
      </svg>
    </div>
  );
});
