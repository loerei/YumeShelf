import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { GameEntry } from '../types/game';

interface CachedIconEntry {
  readonly dataUrl: string;
  readonly fit: 'contain' | 'cover';
  readonly source: string;
}

const iconUrlCache = new Map<string, CachedIconEntry>();

export interface GameIconProps {
  readonly game: Pick<GameEntry, 'name' | 'exePath' | 'iconUrl'> & {
    readonly iconData?: string;
    readonly iconFit?: 'contain' | 'cover' | string;
    readonly iconSource?: string;
  };
  readonly className?: string;
}

function normalizeFit(fit: unknown): 'contain' | 'cover' {
  return fit === 'cover' ? 'cover' : 'contain';
}

function extractIconPayload(
  result: unknown,
  fallbackFit: 'contain' | 'cover',
  fallbackSource: string
): CachedIconEntry | null {
  if (typeof result === 'string' && result) {
    return { dataUrl: result, fit: fallbackFit, source: fallbackSource };
  }
  if (result && typeof result === 'object') {
    const record = result as {
      dataUrl?: unknown;
      iconUrl?: unknown;
      fit?: unknown;
      source?: unknown;
    };
    const url =
      (typeof record.dataUrl === 'string' && record.dataUrl) ||
      (typeof record.iconUrl === 'string' && record.iconUrl) ||
      '';
    if (url) {
      return {
        dataUrl: url,
        fit: record.fit !== undefined ? normalizeFit(record.fit) : fallbackFit,
        source: typeof record.source === 'string' && record.source ? record.source : fallbackSource,
      };
    }
  }
  return null;
}

export const GameIcon = React.memo(function GameIcon({
  game,
  className = 'game-icon',
}: GameIconProps): React.ReactElement {
  const defaultFit = normalizeFit(game.iconFit);
  const defaultSource = game.iconSource || 'game-icon';
  const directUrl = game.iconUrl || game.iconData;
  const cached = game.exePath ? iconUrlCache.get(game.exePath) : undefined;

  const [resolvedUrl, setResolvedUrl] = useState<string | null>(
    directUrl || cached?.dataUrl || null
  );
  const [resolvedFit, setResolvedFit] = useState<'contain' | 'cover'>(
    directUrl ? defaultFit : cached?.fit ?? defaultFit
  );
  const [resolvedSource, setResolvedSource] = useState<string>(
    directUrl ? defaultSource : cached?.source ?? defaultSource
  );
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);

    const direct = game.iconUrl || game.iconData;
    const fit = normalizeFit(game.iconFit);
    const source = game.iconSource || 'game-icon';

    if (direct) {
      setResolvedUrl(direct);
      setResolvedFit(fit);
      setResolvedSource(source);
      if (game.exePath) {
        iconUrlCache.set(game.exePath, { dataUrl: direct, fit, source });
      }
      return;
    }

    if (!game.exePath) {
      setResolvedUrl(null);
      return;
    }

    const cachedEntry = iconUrlCache.get(game.exePath);
    if (cachedEntry) {
      setResolvedUrl(cachedEntry.dataUrl);
      setResolvedFit(game.iconFit ? fit : cachedEntry.fit);
      setResolvedSource(game.iconSource ? source : cachedEntry.source);
      return;
    }

    const api = typeof window !== 'undefined' ? window.electronAPI : undefined;
    if (!api) {
      setResolvedUrl(null);
      return;
    }
    if (typeof api.getIcon !== 'function') {
      const protocolUrl = `game-icon://app?path=${encodeURIComponent(game.exePath)}`;
      setResolvedUrl(protocolUrl);
      setResolvedFit(fit);
      setResolvedSource(source);
      return;
    }

    let cancelled = false;
    void Promise.resolve(api.getIcon(game.exePath))
      .then((result: unknown) => {
        if (cancelled) return;
        const payload = extractIconPayload(result, fit, source);
        if (payload) {
          iconUrlCache.set(game.exePath!, payload);
          setResolvedUrl(payload.dataUrl);
          setResolvedFit(payload.fit);
          setResolvedSource(payload.source);
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
  }, [game.iconUrl, game.iconData, game.iconFit, game.iconSource, game.exePath]);

  useLayoutEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setIsLoaded(true);
    }
  }, [resolvedUrl]);

  if (resolvedUrl && !hasError) {
    return (
      <div className={className}>
        <img
          ref={imgRef}
          src={resolvedUrl}
          alt=""
          loading="lazy"
          draggable={false}
          data-icon-fit={resolvedFit}
          data-icon-source={resolvedSource}
          className={`fade-in-icon ${isLoaded ? 'loaded' : ''}`.trim()}
          style={{
            width: '100%',
            height: '100%',
            objectFit: resolvedFit,
            pointerEvents: 'none',
          }}
          onLoad={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
        />
      </div>
    );
  }

  return (
    <div className={`${className} game-icon-fallback`} aria-hidden="true">
      🎮
    </div>
  );
});
