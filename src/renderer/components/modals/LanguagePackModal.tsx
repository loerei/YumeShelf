import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Modal } from './Modal';
import { useNotification } from '../../providers/NotificationProvider';
import type { UiStorageAdapter } from '../../state/ui-runtime-state';
import type {
  ElectronAPI,
  LanguagePackManifestResponse,
  LanguageState,
  ManifestPack,
} from '../../../shared/types/ipc';
import { sanitizeUserPaths } from '../../../shared/path-sanitizer';
import { useLocaleStrings } from '../../i18n/locale-strings';

export type LanguagePackListItem = ManifestPack & { isInstalled: boolean };

export interface LanguagePackModalProps {
  isOpen: boolean;
  onClose: () => void;
  fallbackFocusRef?: React.RefObject<HTMLElement | null>;
  electronAPI?: ElectronAPI;
  storage?: UiStorageAdapter;
  onLanguagePackApplied?: (languageCode: string) => void;
}

const BCP47_REGEX = /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/;

export const LanguagePackModal: React.FC<LanguagePackModalProps> = ({
  isOpen,
  onClose,
  fallbackFocusRef,
  electronAPI,
  storage,
  onLanguagePackApplied,
}) => {
  const [status, setStatus] = useState<'loading' | 'idle' | 'submitting' | 'error'>('loading');
  const [packs, setPacks] = useState<LanguagePackListItem[]>([]);
  const [activeCode, setActiveCode] = useState<string>('en');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [inFlightCode, setInFlightCode] = useState<string | null>(null);

  const manifestReqSeqRef = useRef(0);
  const installSeqRef = useRef(0);
  const isMountedRef = useRef(true);
  const isOpenRef = useRef(isOpen);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const packCardRefs = useRef(new Map<string, HTMLDivElement>());
  const actionBtnRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingInstallFocusCodeRef = useRef<string | null>(null);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const { showToast } = useNotification();
  const api = electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
  const store = storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  const strings = useLocaleStrings(store, api ?? null);
  const isEn = (activeCode || 'en') === 'en';

  const loadManifest = async ({
    silent = false,
    installedCode,
  }: { silent?: boolean; installedCode?: string } = {}) => {
    if (!isMountedRef.current) return;
    const seq = ++manifestReqSeqRef.current;
    if (!silent) {
      setStatus('loading');
    }
    try {
      let candidate = 'en';
      try {
        const rawStored = store?.getItem?.('yumeshelf_lang');
        const trimmed = typeof rawStored === 'string' ? rawStored.trim().toLowerCase() : '';
        candidate = BCP47_REGEX.test(trimmed) ? trimmed : 'en';
      } catch (err) {
        console.warn('[LanguagePackModal] Failed to read yumeshelf_lang from storage:', {
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        });
      }
      if (isMountedRef.current) setActiveCode(candidate);

      let state: LanguageState | undefined;
      if (api?.getLanguageState) {
        try {
          state = await api.getLanguageState();
        } catch (err) {
          console.warn(
            '[LanguagePackModal] Failed to get active language state, preserving stored language:',
            {
              candidate,
              error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
              stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
            }
          );
        }
      }

      const installedCodes = new Set<string>([
        ...(state?.builtIn ?? []).map((p) => p.code),
        ...(state?.installed ?? []).map((p) => p.code),
      ]);
      const availableCodes = new Set<string>(
        [...(state?.builtIn ?? []), ...(state?.installed ?? [])]
          .map((p) => String(p.code || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const validatedCode =
        availableCodes.size > 0 && !availableCodes.has(candidate) ? 'en' : candidate;
      if (isMountedRef.current) setActiveCode(validatedCode);

      // Safely unwrap manifest payload supporting wrapped { ok, packs } or direct array fixture
      const res: LanguagePackManifestResponse | ManifestPack[] | undefined =
        await api?.getLanguagePackManifest?.();
      if (res && typeof res === 'object' && 'ok' in res && !res.ok) {
        throw new Error(res.error || 'Failed to load language packs');
      }

      const manifestPacks: ManifestPack[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.packs)
          ? res.packs
          : [];

      const reconciledPacks: LanguagePackListItem[] = manifestPacks.map((pack) => ({
        ...pack,
        isInstalled: installedCodes.has(pack.code),
      }));

      if (seq === manifestReqSeqRef.current && isMountedRef.current && isOpenRef.current) {
        setActiveCode(validatedCode);
        if (installedCode) {
          const active = typeof document !== 'undefined' ? document.activeElement : null;
          const cardEl = packCardRefs.current.get(installedCode) ?? null;
          const btnEl = actionBtnRefs.current.get(installedCode) ?? null;
          const isOwnedOrEvicted =
            active === btnEl ||
            Boolean(cardEl && active && cardEl.contains(active)) ||
            active === document.body ||
            active === document.documentElement ||
            active === null ||
            !active.isConnected;
          if (!isOwnedOrEvicted) {
            pendingInstallFocusCodeRef.current = null;
          }
        }
        setPacks(reconciledPacks);
        setStatus('idle');
      }
    } catch (err) {
      console.error('[LanguagePackModal] Failed to load language pack manifest:', {
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      if (seq === manifestReqSeqRef.current && isMountedRef.current && isOpenRef.current) {
        if (!silent) {
          setStatus('error');
        }
        showToast('Failed to load language packs');
      }
    }
  };

  useEffect(() => {
    manifestReqSeqRef.current += 1;
    installSeqRef.current += 1;
    pendingInstallFocusCodeRef.current = null;
    setInFlightCode(null);
    setStatus((prev) => (prev === 'submitting' ? 'idle' : prev));
    if (isOpen) {
      void loadManifest();
    }
  }, [isOpen]);

  const isBusy = status === 'submitting' || inFlightCode !== null;

  useLayoutEffect(() => {
    const targetCode = pendingInstallFocusCodeRef.current;
    if (!targetCode || !isOpen || isBusy) return;
    pendingInstallFocusCodeRef.current = null;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    const cardEl = packCardRefs.current.get(targetCode) ?? null;
    const targetBtn = actionBtnRefs.current.get(targetCode) ?? null;
    const isOwnedOrEvicted =
      active === targetBtn ||
      Boolean(cardEl && active && cardEl.contains(active)) ||
      active === null ||
      active === document.body ||
      active === document.documentElement ||
      !active.isConnected;
    if (!isOwnedOrEvicted) return;
    (targetBtn ?? searchInputRef.current)?.focus();
  }, [packs, isOpen, isBusy]);

  const filteredPacks = useMemo(() => {
    const q = searchQuery.trim().normalize('NFC').toLowerCase();
    if (!q) return packs;
    return packs.filter(
      (p) =>
        (p.nativeName || p.englishName || p.code).normalize('NFC').toLowerCase().includes(q) ||
        p.code.normalize('NFC').toLowerCase().includes(q) ||
        (p.englishName && p.englishName.normalize('NFC').toLowerCase().includes(q))
    );
  }, [packs, searchQuery]);

  const handleInstall = async (code: string) => {
    if (isBusy) return;
    if (!BCP47_REGEX.test(code)) {
      showToast(`Invalid language code format: ${code}`);
      return;
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    pendingInstallFocusCodeRef.current = active === actionBtnRefs.current.get(code) ? code : null;
    const installSeq = ++installSeqRef.current;
    setInFlightCode(code);
    setStatus('submitting');
    try {
      const res = await api?.installLanguagePack?.(code);
      if (installSeq !== installSeqRef.current || !isMountedRef.current || !isOpenRef.current)
        return;
      if (res?.ok) {
        showToast(`Installed language pack: ${code}`);
        await loadManifest({ silent: true, installedCode: code });
      } else {
        pendingInstallFocusCodeRef.current = null;
        const sanitizedReason =
          res?.reason && String(res.reason).trim().length > 0
            ? sanitizeUserPaths(String(res.reason))
            : 'Installation failed';
        console.error('[LanguagePackModal] Language pack installation failed:', {
          code,
          reason: sanitizedReason,
        });
        showToast(sanitizedReason);
        setStatus('idle');
      }
    } catch (err) {
      if (installSeq !== installSeqRef.current || !isMountedRef.current || !isOpenRef.current)
        return;
      console.error(`[LanguagePackModal] Unexpected error installing language pack "${code}":`, {
        packCode: code,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
      showToast('Installation encountered an unexpected error');
      setStatus('idle');
    } finally {
      if (installSeq === installSeqRef.current && isMountedRef.current) {
        setInFlightCode(null);
        setStatus((prev) => (prev === 'submitting' ? 'idle' : prev));
      }
    }
  };

  const handleApply = (code: string) => {
    if (isBusy) return;
    if (!BCP47_REGEX.test(code)) {
      showToast(`Invalid language code format: ${code}`);
      return;
    }
    try {
      store?.setItem('yumeshelf_lang', code);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('yumeshelf:language-changed', { detail: { code } })
        );
      }
    } catch (err) {
      console.warn('[LanguagePackModal] Failed to persist active language to storage:', {
        code,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
      });
    }
    manifestReqSeqRef.current += 1;
    setActiveCode(code);
    onLanguagePackApplied?.(code);
    showToast(`Activated language: ${code}`);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      modalType="language-pack"
      fallbackFocusRef={fallbackFocusRef}
      className="settings-overlay"
      panelClassName="language-pack-panel"
      title="Language Packs"
    >
      <Modal.Header className="settings-header">
        {isEn ? 'Language Packs' : strings.lang_modal_title || 'Language Packs'}
      </Modal.Header>
      <Modal.Body className="language-pack-body">
        <section
          className="app-update-review-card"
          id="app-update-review-section"
          style={{ display: 'none' }}
        >
          <div className="app-update-review-copy">
            <div className="app-update-review-eyebrow" id="app-update-review-eyebrow">
              {strings.app_update_review_eyebrow || 'App update'}
            </div>
            <h3 id="app-update-review-title">{strings.title || 'YumeShelf'}</h3>
            <p id="app-update-review-status">Review the latest release before you update.</p>
            <div className="app-update-review-meta" id="app-update-review-meta" />
          </div>
          <div className="app-update-review-notes" id="app-update-review-notes" />
          <div className="app-update-review-actions">
            <button
              type="button"
              className="text-btn app-update-review-opt-out-btn"
              id="app-update-review-opt-out-btn"
              style={{ display: 'none' }}
            >
              {strings.post_update_notification_opt_out || "Don't show again"}
            </button>
            <button type="button" className="small-btn" id="app-update-review-action-btn">
              {strings.app_update_review_action || 'Update'}
            </button>
          </div>
        </section>

        <div className="language-pack-toolbar" id="language-pack-toolbar">
          <input
            ref={searchInputRef}
            type="search"
            id="language-pack-search"
            className="language-pack-search"
            placeholder={
              strings.lang_modal_search_placeholder || 'Search by code, language, or alias'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search language packs"
          />
          <div className="language-pack-actions">
            <button
              type="button"
              id="language-pack-list-btn"
              className="small-btn secondary-btn"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
            >
              {strings.lang_modal_list_button || 'See available language packs'}
            </button>
            <button
              type="button"
              id="language-pack-refresh-btn"
              className="small-btn secondary-btn"
              aria-disabled={isBusy || status === 'loading' ? 'true' : undefined}
              onClick={() => {
                if (!isBusy && status !== 'loading') {
                  void loadManifest();
                }
              }}
            >
              {strings.lang_modal_refresh_button || 'Refresh'}
            </button>
          </div>
        </div>

        <p className="language-pack-hint" id="language-pack-hint">
          {strings.lang_modal_hint || 'Search for a language pack or browse what is available.'}
        </p>
        <div className="language-pack-source" id="language-pack-source" />

        {status === 'loading' && (
          <div className="language-pack-placeholder" role="status" aria-live="polite">
            {isEn
              ? 'Loading language packs...'
              : strings.lang_modal_loading || 'Loading language packs...'}
          </div>
        )}

        {status === 'error' && (
          <div className="language-pack-empty" role="alert">
            <h3>Unable to fetch language packs</h3>
            <p>Please check your connection and try again.</p>
            <button
              type="button"
              className="small-btn secondary-btn"
              onClick={() => void loadManifest()}
            >
              {isEn ? 'Retry' : strings.save_editor_retry || 'Retry'}
            </button>
          </div>
        )}

        {status !== 'loading' && status !== 'error' && (
          <div className="language-pack-results" id="language-pack-results" role="list">
            {filteredPacks.length === 0 ? (
              <div className="language-pack-empty" id="language-pack-empty">
                <h3 id="language-pack-empty-title">
                  {isEn
                    ? 'No language packs found'
                    : strings.lang_modal_empty_title || 'No language packs found'}
                </h3>
                <p id="language-pack-empty-desc">
                  {isEn
                    ? 'Try refining your search terms or contribute your own pack.'
                    : strings.lang_modal_empty_desc ||
                      'Try refining your search terms or contribute your own pack.'}
                </p>
                <a
                  id="language-pack-repo-link"
                  href="https://github.com/loerei/YumeShelf/blob/main/TRANSLATION.md"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {strings.lang_modal_contribute || 'Open translation guide'}
                </a>
              </div>
            ) : (
              filteredPacks.map((pack) => {
                const isSelected = activeCode === pack.code;
                const isInFlight = inFlightCode === pack.code;
                return (
                  <div
                    key={pack.code}
                    ref={(el) => {
                      if (el) packCardRefs.current.set(pack.code, el);
                      else packCardRefs.current.delete(pack.code);
                    }}
                    className="language-pack-card"
                    role="listitem"
                  >
                    <div className="language-pack-card-copy">
                      <h3>
                        {pack.nativeName || pack.englishName || pack.code}{' '}
                        {pack.englishName &&
                          pack.nativeName &&
                          pack.englishName !== pack.nativeName &&
                          `(${pack.englishName})`}
                      </h3>
                      <p>{pack.code}</p>
                      <div className="language-pack-card-meta">
                        {pack.packVersion && (
                          <span className="language-pack-chip">v{pack.packVersion}</span>
                        )}
                        {pack.reviewedForAppVersion && (
                          <span className="language-pack-chip">
                            App {pack.reviewedForAppVersion}
                          </span>
                        )}
                        {Array.isArray(pack.aliases) &&
                          pack.aliases.slice(0, 3).map((alias) => (
                            <span key={alias} className="language-pack-chip">
                              {alias}
                            </span>
                          ))}
                        {isSelected && <span className="language-pack-chip active">Active</span>}
                      </div>
                    </div>
                    <div className="language-pack-actions">
                      {pack.isInstalled ? (
                        <button
                          ref={(el) => {
                            if (el) actionBtnRefs.current.set(pack.code, el);
                            else actionBtnRefs.current.delete(pack.code);
                          }}
                          type="button"
                          className="small-btn secondary-btn"
                          aria-disabled={isSelected || isBusy ? 'true' : undefined}
                          style={
                            isSelected || isBusy
                              ? { pointerEvents: 'none', opacity: 0.5 }
                              : undefined
                          }
                          onClick={() => {
                            if (!isSelected && !isBusy) handleApply(pack.code);
                          }}
                        >
                          {isSelected ? 'Applied' : 'Apply'}
                        </button>
                      ) : (
                        <button
                          ref={(el) => {
                            if (el) actionBtnRefs.current.set(pack.code, el);
                            else actionBtnRefs.current.delete(pack.code);
                          }}
                          type="button"
                          className="small-btn primary-btn"
                          aria-disabled={isBusy ? 'true' : undefined}
                          style={isBusy ? { pointerEvents: 'none', opacity: 0.5 } : undefined}
                          onClick={() => {
                            if (!isBusy) void handleInstall(pack.code);
                          }}
                        >
                          {isInFlight ? 'Installing...' : 'Download & Install'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};
