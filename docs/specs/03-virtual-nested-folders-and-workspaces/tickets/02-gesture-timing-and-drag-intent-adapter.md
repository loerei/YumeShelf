# 02 — Author Gesture Timing and Drag Intent Adapter Seam

## Epic
PRD 03: Virtual Nested Folders (App Folders) & Dual Workspace Views ("Favorite Desk" vs "Library")

## Structural Refactoring Notice
> [!NOTE]
> This is a purely headless, structural timing and intent state machine adapter ($S$) with an injectable `IClock` seam authored in `[NEW] src/renderer/utils/gesture-timer.ts`. It contains zero DOM or rendering logic, leaves legacy `src/renderer/drag-drop-grid.ts` intact, and is verified 100% via in-memory unit tests using `MockClock`. Visual prototype gates are enforced on visual UI tickets (04.1.2, 05.1, 05.2, 06.1.1, 06.1.2, 06.2.1.1, 06.2.1.2, 06.2.2, 07.1, 07.2, 08.2).

## What to build

A brand-new, isolated headless drag gesture timing adapter authored at `src/renderer/utils/gesture-timer.ts` (`DragGestureTimer`) to handle hold durations (300ms for folder creation) and hover dwell times (2000ms for spring-loaded drill-down / drill-up) with deterministic timeout management and parameter seams.

## Acceptance criteria

- [ ] Re-export shared `IClock` and `MockClock` from `src/shared/virtual-tree/types.ts` (or `src/shared/types/clock.ts`) in `[NEW] src/renderer/utils/gesture-timer.ts`:
  ```typescript
  export interface IClock {
    now(): number;
    setTimeout(callback: () => void, ms: number): any;
    clearTimeout(id: any): void;
    requestAnimationFrame?(callback: (timestamp: number) => void): any;
    cancelAnimationFrame?(id: any): void;
  }
  export interface MockClock extends IClock {
    advanceTime(ms: number): void;
    getPendingTimerCount(): number;
    requestAnimationFrame(callback: (timestamp: number) => void): any;
    cancelAnimationFrame(id: any): void;
  }
  ```
  In `MockClock`, implement concrete shared test utility factory `createMockClock(): MockClock` (in `src/shared/testing/mock-clock.ts` or `src/renderer/testing/mock-clock.ts`). Specify that `MockClock.advanceTime(ms: number)` executes queued `requestAnimationFrame` callbacks in discrete, bounded 16ms frame steps rather than draining the queue in an unbounded `while (queue.length > 0)` loop, invoking queued callbacks with `clock.now()` timestamps.
- [ ] Inject operational parameters via `DragGestureOptions`:
  ```typescript
  export interface DragGestureOptions {
    creationDelayMs?: number;           // default: 300
    dwellDelayMs?: number;              // default: 2000
    velocityThresholdPxPerSec?: number; // default: 500
    slopPx?: number;                    // default: 10
  }
  ```
- [ ] Expose `dispose(): void` to clear all pending hold/dwell timers and reset internal state.
- [ ] Support a 300ms hold delay before firing folder creation intent callback (`onHoldIntent`) when pointer remains stationary within `slopPx`.
- [ ] Support a 2000ms hover dwell delay before firing spring navigation intent callback (`onDwellIntent`), emitting periodic progress callbacks for consumers over the 2000ms duration.
- [ ] Implement slop radius threshold tracking (`slopPx`) and cancellation on pointer departure.
- [ ] Implement pointer velocity tracking over consecutive `pointermove` events ($\Delta d / \Delta t$) with guards for $\Delta t < 5\text{ms}$ or $\Delta t \le 0$, canceling timers if velocity exceeds 500px/s.
- [ ] Implement `onTargetChange` callback unconditionally clearing pending hold/dwell timers when pointer moves to a new item.
- [ ] Implement drag abort, pointer leave lifecycle cleanup handlers, and `dispose()` teardown.
- [ ] Include unit tests in `src/renderer/utils/drag-gestures.test.ts` using `MockClock` verifying 300ms hold triggers, 2000ms dwell transitions, velocity cancellations ($\Delta d / \Delta t > 500\text{px/s}$ with $\Delta t \le 0$ coalesced event safety), target change cancellation, and `dispose()` teardown with zero real wall-clock sleeps and without requiring browser DOM rendering.
- [ ] Execute automated gesture timing tests via `npm run test:vitest -- src/renderer/utils/drag-gestures.test.ts` with standard output containing `'✓ renderer/utils/drag-gestures.test.ts'` and `'Test Files  1 passed (1)'` with exit code 0.

## Blocked by

- None — can start immediately.
