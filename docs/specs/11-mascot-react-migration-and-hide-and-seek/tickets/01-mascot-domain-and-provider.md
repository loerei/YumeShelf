# 01 — Mascot Domain Core, Shuffled Decks & `MascotProvider` ($S$)

## Epic
[Epic 11: Mascot React 19 Migration & Hide-and-Seek Restoration](file:///d:/Projects/YumeShelf/docs/specs/11-mascot-react-migration-and-seek/PRD.md)

## Status
ready-for-agent

## Blocked by
- [Epic 09.2: Folder Drag-and-Drop Reordering & Card FLIP Animation](file:///d:/Projects/YumeShelf/docs/specs/09.2-folder-dnd-and-card-flip/PRD.md)

## What to Build
> **Scope Guard:** Implement only the headless domain helpers, ingress parsers, audio/storage interfaces, and `MascotProvider` + `<BonkImpactLayer />` context specified below; do NOT modify `MascotWidget.tsx`, `LibraryGrid.tsx`, or `SettingsModal.tsx` yet. Note that files under `src/renderer/mascot/` and `src/renderer/providers/` sit one directory deeper than `src/renderer/mascot-widget.ts`, so static asset imports resolve via `../../../assets/...`.

Establish the pure TypeScript domain core and shared reactive `MascotProvider` for Mascot and Hide-and-Seek state:

- [ ] 1. **Extract headless Mascot domain FSM, canonical storage keys, ingress parsers, shuffled decks & audio seam**:
  - **Files:** **[NEW]** [`src/renderer/mascot/mascot-domain.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot/mascot-domain.ts) *(Replaces: domain, deck, parser, and FSM seams from [`src/renderer/mascot-widget.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts) and [`.scratch/pre-310-frontend/src/renderer/features/hide-and-seek.ts`](file:///d:/Projects/YumeShelf/.scratch/pre-310-frontend/src/renderer/features/hide-and-seek.ts))*
  - Declare canonical `MASCOT_STORAGE_KEYS` matching brownfield keys verbatim, plus `MASCOT_CARD_KEY = 'yumeshelf_mascot_card'`, `DEFAULT_BONK_QUOTES`, `DEFAULT_IDLE_QUOTES`, and `DEFAULT_TITLES`:
    ```ts
    export const MASCOT_STORAGE_KEYS = {
      show: 'yumeshelf_mascot_show',
      scale: 'yumeshelf_mascot_scale',
      sound: 'yumeshelf_mascot_sound',
      volume: 'yumeshelf_mascot_volume',
      posX: 'yumeshelf_mascot_x',
      posY: 'yumeshelf_mascot_y',
      bonkCount: 'yumeshelf_mascot_bonk_count',
      hideAndSeek: 'yumeshelf_hide_and_seek',
      deckBonkedQuotes: 'yumeshelf_deck_bonked_quotes',
      deckCardTitles: 'yumeshelf_deck_card_titles',
      deckCardIdleQuotes: 'yumeshelf_deck_card_idle_quotes',
    } as const;

    export type MascotExpression = 'smug' | 'bonked' | 'bonkedTooMuch';
    export type MascotSoundKey = 'squeaker' | 'metal-pipe' | 'none';
    export type HideAndSeekMode = 'yeaaa' | 'out';

    export interface MascotTimingConfig {
      readonly stage1DurationMs: number;   // default 3000
      readonly minCooldownMs: number;      // default 3000
      readonly maxCooldownMs: number;      // default 10000
      readonly cooldownStepMs: number;     // default 1000
      readonly rapidWindowMs: number;      // default 1200
      readonly rapidBurstCount: number;    // default 3
    }

    export type MascotRecoveryState =
      | { readonly phase: 'smug' }
      | {
          readonly phase: 'bonkedTooMuch';
          readonly streak: number;
          readonly accumulatedCooldownMs: number;
        }
      | {
          readonly phase: 'bonked';
          readonly streak: number;
          readonly accumulatedCooldownMs: number;
          readonly stage2EndTimeMs: number;
          readonly rapidClickTimestamps: readonly number[];
        };

    export interface MascotPosition {
      readonly x: number;
      readonly y: number;
    }

    export interface MascotPreferencesState {
      readonly show: boolean;
      readonly scale: number; // clamped [25, 100], default 30
      readonly sound: MascotSoundKey; // default 'squeaker'
      readonly volume: number; // clamped [0, 100], default 20 (preserves '0')
      readonly hideAndSeek: HideAndSeekMode; // default 'out'
    }

    export interface MascotAudioPlayer {
      play(soundKey: MascotSoundKey | string, volumePercent: number): void;
      stop(): void;
    }
    ```
  - Implement pure boundary ingress parsers ("Parse, Don't Validate") wrapping all `UiStorageAdapter` reads/writes in `try/catch` (never touching ambient `localStorage` when `storage` is supplied), and emitting structured, path-sanitized `console.warn` diagnostics using `sanitizeUserPaths` from `../../shared/path-sanitizer` whenever a storage read/write or deck `JSON.parse` fails:
    ```ts
    import { sanitizeUserPaths } from '../../shared/path-sanitizer';

    console.warn('[MascotDomain] Storage operation failed:', {
      operation: 'read' | 'write' | 'parse_deck',
      key: storageKey,
      error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
      stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
    });
    ```
    - `parseMascotPreferences(storage?: Pick<UiStorageAdapter, 'getItem'>): MascotPreferencesState`: treat empty/whitespace/non-finite strings as missing (avoiding `Number('') === 0`), preserve explicit `'0'` for `yumeshelf_mascot_volume` (clamped `[0, 100]`, default `20`), clamp `scale` to `[25, 100]` (default `30`, treating `<= 0` or `''` as `30`), validate `sound` to `'squeaker' | 'metal-pipe' | 'none'` (default `'squeaker'`), and `hideAndSeek` to `'yeaaa' | 'out'` (default `'out'`).
    - `parseMascotPosition(storage?: Pick<UiStorageAdapter, 'getItem'>): MascotPosition | null`: require both `yumeshelf_mascot_x` and `yumeshelf_mascot_y` to be trimmed, non-empty, finite numbers; return `null` on missing, partial, whitespace, or non-finite inputs.
    - `parseBonkCount(storage?: Pick<UiStorageAdapter, 'getItem'>): number`: parse trimmed non-empty string via `Number(trimmed)` (not `Number.parseInt`, which truncates `'1.5'`), require `Number.isInteger(parsed) && parsed >= 0` (so `'abc'`/`'-1'`/`'1.5'` falls back to `0` and never writes `'NaN'` back to `yumeshelf_mascot_bonk_count`).
    - `getNextShuffledIndex(storageKey: string, totalCount: number, storage?: UiStorageAdapter, rng: () => number = Math.random): number`: return `0` immediately whenever `!(Number.isInteger(totalCount) && totalCount > 1)`, require `Number.isInteger(n) && n >= 0 && n < totalCount` when parsing stored decks (no crash on corrupt JSON; log `[MascotDomain]` warning), guard non-finite `rng()` results (`const rawRng = rng(); const safeRng = Number.isFinite(rawRng) ? rawRng : 0;`) before clamping into `[0, 1 - Number.EPSILON]` and calling `Math.floor`, and persist via `storage` inside `try/catch`.
  - Implement pure monotonic-clock (`nowMs` from `performance.now()`) FSM transitions:
    - `applyBonkTransition(prev: MascotRecoveryState, nowMs: number, config: MascotTimingConfig, options?: { readonly ignoreStage2Expiry?: boolean }): MascotRecoveryState`: default `ignoreStage2Expiry = false`; advance Stage 2 (`streak` increment, `accumulatedCooldownMs` accumulation, `rapidClickTimestamps` sliding-window tracking) whenever `prev.phase === 'bonked' && (options?.ignoreStage2Expiry || prev.stage2EndTimeMs > nowMs)`, explicitly treating `prev.phase === 'bonked' && !options?.ignoreStage2Expiry && prev.stage2EndTimeMs <= nowMs` identically to `prev.phase === 'smug'` (`streak = 1`, `rapidClickTimestamps = [nowMs]`):
      ```ts
      export function applyBonkTransition(
        prev: MascotRecoveryState,
        nowMs: number,
        config: MascotTimingConfig,
        options?: { readonly ignoreStage2Expiry?: boolean }
      ): MascotRecoveryState {
        if (
          prev.phase === 'bonked' &&
          (options?.ignoreStage2Expiry || prev.stage2EndTimeMs > nowMs)
        ) {
          const nextAccumulatedCooldownMs = options?.ignoreStage2Expiry
            ? Math.min(
                config.maxCooldownMs,
                Math.max(config.minCooldownMs, prev.accumulatedCooldownMs + config.cooldownStepMs)
              )
            : Math.min(
                config.maxCooldownMs,
                Math.max(
                  config.minCooldownMs,
                  Math.max(0, prev.stage2EndTimeMs - nowMs) + config.cooldownStepMs
                )
              );
          // Increment streak, apply nextAccumulatedCooldownMs, and track rapid burst
          ...
        }
        ...
      }
      ```
    - `applyStage1Complete(prev: MascotRecoveryState, nowMs: number): MascotRecoveryState`: use an exhaustive `switch (prev.phase)` (returning `prev` when not `'bonkedTooMuch'`).
    - `applyReturnFromHideAndSeek(streak: number, accumulatedMs: number, nowMs: number, config: MascotTimingConfig): MascotRecoveryState`: sanitize `streak` (`Number.isInteger(streak) && streak > 0 ? streak : 1`) and `accumulatedMs` (`Number.isFinite(accumulatedMs) ? Math.min(config.maxCooldownMs, Math.max(config.minCooldownMs, accumulatedMs)) : config.minCooldownMs`).
    - `recoverToSmug(): MascotRecoveryState`.
  - Define default `MascotAudioPlayer` factory wrapping `Audio` (`../../../assets/squeaker.mp3`, `../../../assets/metal-pipe.mp3`) safely for `happy-dom`, replacing silent `play().catch(() => {})` / bare `catch {}` with structured, path-sanitized `console.warn` diagnostics (`stop()` pausing/resetting active audio inside best-effort `try/catch`):
    ```ts
    // Inside default MascotAudioPlayer.play(soundKey, volumePercent):
    if (!Number.isFinite(volumePercent) || volumePercent <= 0) return;
    try {
      activeAudio = new Audio(soundSrc);
      activeAudio.volume = vol;
      void activeAudio.play().catch((err: unknown) => {
        console.warn('[MascotAudioPlayer] Audio playback failed:', {
          soundKey,
          volumePercent,
          error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
          stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
        });
      });
    } catch (err) {
      console.warn('[MascotAudioPlayer] Failed to initialize audio element:', {
        soundKey,
        volumePercent,
        error: sanitizeUserPaths(err instanceof Error ? err.message : String(err)),
        stack: err instanceof Error && err.stack ? sanitizeUserPaths(err.stack) : undefined,
      });
    }
    ```

- [ ] 2. **Implement selector-isolated `MascotProvider` and `<BonkImpactLayer />` portal**:
  - **Files:** **[NEW]** [`src/renderer/providers/MascotProvider.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/MascotProvider.tsx) *(Replaces: lifecycle orchestration, bonk/recovery timers, impact particle spawner, and session card identity from [`src/renderer/mascot-widget.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot-widget.ts) and [`.scratch/pre-310-frontend/src/renderer/features/hide-and-seek.ts`](file:///d:/Projects/YumeShelf/.scratch/pre-310-frontend/src/renderer/features/hide-and-seek.ts))*
  - Accept optional props: `storage?: UiStorageAdapter`, `audioPlayer?: MascotAudioPlayer`, `timingConfig?: Partial<MascotTimingConfig>`, `nowProvider?: () => number` (default `() => performance.now()`), and `rng?: () => number` (default `Math.random`). Read `useLocaleStrings(storage)` for localized `mascot_bonk_quotes` and expose `storage?: UiStorageAdapter` on `MascotContextValue`.
  - Back `MascotProvider` with an internal observable store + `useSyncExternalStoreWithSelector` (matching [`src/renderer/hooks/useLibraryState.ts`](file:///d:/Projects/YumeShelf/src/renderer/hooks/useLibraryState.ts)) using a module-level `NOOP_MASCOT_STORE` fallback (so React Rules of Hooks hold unconditionally) and field-by-field shallow `isEqual` comparators, exporting:
    - `useMascot(): MascotContextValue` (strict, throws outside provider) and `useOptionalMascot(): MascotContextValue | null` (non-throwing);
    - `useOptionalMascotHideAndSeek()` selecting `{ isHideAndSeekCardActive, isCardStarred, cardTitleIndex, sessionSlotFraction, hideAndSeekThreshold, getMascotCardTitle, bonk, returnFromHideAndSeek, cancelDeferredRecovery }` with field-by-field shallow `isEqual` so `bonk()`, `expression`, `recoveryState`, `activeBonkQuote`, `scale`, `volume`, and `sound` updates trigger `0` `LibraryGrid` re-renders;
    - `useOptionalMascotSearch()` selecting `{ activeBonkQuote, lastBonkEvent, isHideAndSeekCardActive, isCardStarred, cardTitleIndex, expression, getMascotCardTitle }` with field-by-field shallow `isEqual` so `scale`, `volume`, `sound`, `bonkCount`, and `recoveryState` updates that do not alter quote, expression, or card visibility trigger `0` `SearchBar` re-renders.
  - Own unified state and synchronous refs (`recoveryStateRef`, `deferredRecoveryPendingRef`, `isDragging: boolean`, `expression = isDragging ? 'bonked' : recoveryState.phase`, `activeBonkQuote`, `lastBonkEvent: { quote: string; seq: number } | null`, `bonkCount`, `isDismissed`):
    - Manage `show`, `scale`, `sound`, `volume`, `hideAndSeek`, `isWidgetVisible` (`show && !(hideAndSeek === 'yeaaa' && !isDismissed)`), `isHideAndSeekCardActive` (`show && hideAndSeek === 'yeaaa' && !isDismissed`), and `updatePreferences(patch: Partial<{ show: boolean; scale: number; sound: string; volume: number; hideAndSeek: HideAndSeekMode }>)` + individual setters clamping/normalizing inputs and persisting to `MASCOT_STORAGE_KEYS` inside `try/catch` strictly via injected `storage` (never ambient `localStorage` when `storage` is passed), emitting structured `console.warn('[MascotProvider] Storage operation failed:', { operation, key: storageKey, error: sanitizeUserPaths(...), stack: ... })` on any storage read/write failure. In `updatePreferences(patch)`, delegate to the exact same reset transitions as `setShow(false)` / `setHideAndSeek(...)` ONLY when `patch.show === false && prev.show !== false` or `patch.hideAndSeek !== undefined && patch.hideAndSeek !== prev.hideAndSeek`, preventing redundant Hide-and-Seek session resets while never bypassing `isDismissed` or timer cleanup.
    - Own Hide-and-Seek session identity (`cardTitleIndex` via `getNextShuffledIndex(MASCOT_STORAGE_KEYS.deckCardTitles, DEFAULT_TITLES.length, storage, rng)`, `isCardStarred` via `rng() < 0.5`, `sessionSlotFraction` via clamped `rng()`, `hideAndSeekThreshold` via `Math.floor(clampedRng * 6) + 5`, `getMascotCardTitle(strings)`, and `getNextIdleQuote(strings)` via `getNextShuffledIndex(MASCOT_STORAGE_KEYS.deckCardIdleQuotes, ..., storage, rng)` so `MascotCard` inherits `MascotProvider`'s injected `rng` seam).
    - Expose `bonk(options?: { clientX?: number; clientY?: number; renderedHeight?: number; deferRecoveryThreshold?: number }): MascotRecoveryState` returning the synchronously committed `MascotRecoveryState`, incrementing `yumeshelf_mascot_bonk_count` via `parseBonkCount(storage) + 1`, calling `applyBonkTransition(recoveryStateRef.current, nowMs, resolvedConfig, { ignoreStage2Expiry: deferredRecoveryPendingRef.current })`, evaluating `deferRecoveryThreshold` atomically *after* `applyBonkTransition` (`deferredRecoveryPendingRef`), and dispatching particle spawns to `<BonkImpactLayer />` via an imperative callback/ref (`0` `MascotProvider` re-renders).
    - Expose `cancelDeferredRecovery()` (clears pending timers and resets `deferredRecoveryPending = false`, `recoveryState = { phase: 'smug' }`, `activeBonkQuote = null` whenever deferred recovery was pending without `returnFromHideAndSeek`), `interruptRecoveryForDrag()` (clears recovery timers, resets `recoveryState` to `{ phase: 'smug' }`, clears `activeBonkQuote`, sets `isDragging = true`), `finishDrag()` (sets `isDragging = false`), and `returnFromHideAndSeek(streak, accumulatedMs)` (atomically clears `deferredRecoveryPending`, sets `isDismissed = true`, runs `applyReturnFromHideAndSeek` recovery timers).
    - Clear pending recovery timers, reset `deferredRecoveryPending`, reset `recoveryState` to `{ phase: 'smug' }`, and clear `activeBonkQuote` whenever `setShow(false)`, `setHideAndSeek('out')`, or `setHideAndSeek('yeaaa')` is called (with `setHideAndSeek('yeaaa')` also resetting `isDismissed = false` and refreshing session card identity); clean up all timers and call `audioPlayer.stop()` on unmount.
  - Render `<BonkImpactLayer />` via `createPortal(..., document.getElementById('portal-root') ?? document.body)` (guarding `typeof document !== 'undefined'`), capping concurrent `.bonk-impact-particle` nodes (`MAX_BONK_PARTICLES = 16`), falling back to viewport-center coordinates when `bonk()` omits coordinates, computing `const elapsed = Math.max(0, nowProvider() - startTime)` inside `requestAnimationFrame` (`cancelAnimationFrame` on unmount), mutating `opacity`/`transform` via DOM refs (`0` React `setState` calls), and respecting `prefers-reduced-motion: reduce`.

- [ ] 3. **Add unit tests for headless Mascot domain parsers, shuffled decks, FSM & default `MascotAudioPlayer`**:
  - **Files:** **[NEW]** [`src/renderer/mascot/mascot-domain.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot/mascot-domain.test.ts)
  - Test `parseMascotPreferences` and `parseMascotPosition` boundary inputs (`yumeshelf_mascot_show`: `'on'`, `'off'`, `'   '`, `'invalid'` -> `true`; `yumeshelf_mascot_sound`: `'squeaker'`, `'metal-pipe'`, `'none'`, `'invalid'`, `'   '` -> `'squeaker'`; `yumeshelf_hide_and_seek`: `'yeaaa'`, `'out'`, `'invalid'`, `'   '` -> `'out'`; `yumeshelf_mascot_volume`: `'0'`, `'-5'`, `'150'`, `'   '`; `scale`: `'10'`, `'200'`, `'0'`, `'-10'`, `'   '`; partial `(x, null)` or whitespace position), `parseBonkCount` (`'1.5'`, `'-1'`, `'abc'`, `'0'`, `'42'`), `getNextShuffledIndex` (`totalCount <= 1`, non-integer/out-of-bounds deck entries, corrupt JSON, clamped and non-finite `NaN` `rng()` fallback, storage exception safety, zero ambient `localStorage` calls), and the full `smug -> bonked -> bonkedTooMuch -> bonked -> smug` FSM including expired `bonked` (`stage2EndTimeMs <= nowMs`), `{ ignoreStage2Expiry: true }` preserving Stage 2 `streak` and `accumulatedCooldownMs` past `stage2EndTimeMs` (asserting concrete pre-calculated expected literals rather than duplicating production formulas: e.g., with default `minCooldownMs = 3000`, `cooldownStepMs = 1000`, `maxCooldownMs = 10000`, `prev.accumulatedCooldownMs === 3000` -> `next.accumulatedCooldownMs === 4000`, and cap boundary `prev.accumulatedCooldownMs === 10000` -> `next.accumulatedCooldownMs === 10000`, never `1000`), `rapidBurstCount` window, and `applyReturnFromHideAndSeek` sanitization.
  - Test the default `MascotAudioPlayer` factory (stubbing `globalThis.Audio` in `beforeEach`/`afterEach` and restoring in `afterEach`):
    - `play('squeaker', 40)` / `play('metal-pipe', 100)` constructs `Audio` with the expected asset `src`, sets `audio.volume = 0.4` / `1`, and calls `play()`;
    - `play('none', 50)` and `play('squeaker', 0)` / `play('squeaker', -10)` are no-ops (never construct or play `Audio`);
    - calling `play(...)` a second time or calling `stop()` pauses and resets `currentTime = 0` on the active `Audio` instance;
    - rejected `play()` promises and throwing `Audio` constructors/pause calls are caught cleanly without unhandled rejections, and rejected `play()` / throwing `Audio` constructors emit `[MascotAudioPlayer]` `console.warn` diagnostics with sanitized error context;
    - storage read/write exceptions and corrupt `yumeshelf_deck_*` JSON in `mascot-domain.ts` emit `[MascotDomain]` `console.warn` diagnostics with sanitized error context while returning fallback defaults.

- [ ] 4. **Add unit tests for `MascotProvider`, selector isolation, and `<BonkImpactLayer />`**:
  - **Files:** **[NEW]** [`src/renderer/providers/MascotProvider.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/MascotProvider.test.tsx)
  - Test `yumeshelf_mascot_volume: '0'` preservation, `isWidgetVisible` vs `isHideAndSeekCardActive` transitions, `setHideAndSeek('yeaaa')` resetting `isDismissed` / session identity / active recovery timers, `updatePreferences` delegating reset transitions only on actual `show === false` / `hideAndSeek` changes, `getNextIdleQuote(strings)` inheriting injected `rng`, `deferRecoveryThreshold` + `cancelDeferredRecovery()`, slow bonks reaching `deferRecoveryThreshold` in the `'bonked'` phase with `stage2EndTimeMs < nowMs + 3000` followed by a late `bonk({ deferRecoveryThreshold })` after advancing both `nowProvider` and `vi.advanceTimersByTime` in lockstep past `stage2EndTimeMs` (asserting via observable public state that the returned `MascotRecoveryState.streak === threshold + 1`, `accumulatedCooldownMs` equals the concrete pre-calculated literal—e.g. `4000` when `prev.accumulatedCooldownMs === 3000` with default `minCooldownMs = 3000`, `cooldownStepMs = 1000`, `maxCooldownMs = 10000`, never `1000`—`expression` remains `'bonked'` without auto-recovering to `'smug'` even after `maxCooldownMs` elapses, and `cancelDeferredRecovery()` still transitions `expression` back to `'smug'`), `isDragging` expression transitions, `audioPlayer.play(sound, volume)` dispatch on `bonk()` for `'squeaker'`/`'metal-pipe'` (preserving `volume: 0`) and no-op when `sound === 'none'`, `audioPlayer.stop()` on unmount, `returnFromHideAndSeek` continuity leaving `expression === 'bonked'` before auto-recovering to `'smug'` and clearing `activeBonkQuote`, `useOptionalMascotHideAndSeek()` experiencing `0` re-renders across `bonk()` and `setScale`/`setVolume` calls, `useOptionalMascotSearch()` experiencing `0` re-renders across `setScale`, `setVolume`, `setSound`, and `recoveryState` updates that do not alter `activeBonkQuote`, `expression`, or `isHideAndSeekCardActive`, storage error `console.warn('[MascotProvider] ...')` diagnostics with sanitized error context, and `<BonkImpactLayer />` `.bonk-impact-particle` spawn, `MAX_BONK_PARTICLES = 16` concurrent node cap, `prefers-reduced-motion: reduce` particle suppression, virtual-clock `nowProvider()` timing, viewport-center fallback, and unmount `rAF` cleanup.

- [ ] 5. **Run automated unit tests and typecheck**:
  - **Files:** **[VERIFY]** [`src/renderer/mascot/mascot-domain.test.ts`](file:///d:/Projects/YumeShelf/src/renderer/mascot/mascot-domain.test.ts), [`src/renderer/providers/MascotProvider.test.tsx`](file:///d:/Projects/YumeShelf/src/renderer/providers/MascotProvider.test.tsx)
  - Execute `npm run test:vitest -- src/renderer/mascot/mascot-domain.test.ts src/renderer/providers/MascotProvider.test.tsx && npm run typecheck`.

## Acceptance Criteria
- [ ] `mascot-domain.ts` provides `MASCOT_STORAGE_KEYS`, ingress parsers (`parseMascotPreferences`, `parseMascotPosition`, `parseBonkCount`, `getNextShuffledIndex`), pure `MascotRecoveryState` FSM transitions, `MascotAudioPlayer` (`play`/`stop`), and structured path-sanitized `console.warn` diagnostics (`[MascotDomain]`, `[MascotAudioPlayer]`) on storage/deck/audio failures.
- [ ] `MascotProvider.tsx` manages shared Mascot + Hide-and-Seek state, selector-isolated `useOptionalMascot*()` hooks (`NOOP_MASCOT_STORE` + shallow `isEqual`), `getNextIdleQuote(strings)`, `<BonkImpactLayer />` portal, structured path-sanitized `[MascotProvider]` storage warnings, and zero `window` `CustomEvent` dependencies.
- [ ] Execute automated verification command: `npm run test:vitest -- src/renderer/mascot/mascot-domain.test.ts src/renderer/providers/MascotProvider.test.tsx && npm run typecheck`.

## Verification Command
```bash
npm run test:vitest -- src/renderer/mascot/mascot-domain.test.ts src/renderer/providers/MascotProvider.test.tsx && npm run typecheck
```
