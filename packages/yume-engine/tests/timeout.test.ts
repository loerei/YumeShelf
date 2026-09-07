/// <reference types="node" />
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  withTimeout,
  TimeoutError,
  DEFAULT_MAX_ARTWORK_SIZE,
  DEFAULT_MAX_RSRC_SIZE,
  RT_ICON,
  RT_GROUP_ICON,
  DEFAULT_MAX_RESOURCE_ENTRIES,
  DEFAULT_MAX_RECURSION_DEPTH,
  DEFAULT_MAX_GROUP_ICON_FRAMES,
  MAX_RESOURCE_ENTRIES,
  MAX_RECURSION_DEPTH,
  MAX_GROUP_ICON_FRAMES,
} from '../dist/index.js';
import {
  DEFAULT_MAX_ARTWORK_SIZE as TYPES_MAX_ARTWORK_SIZE,
  DEFAULT_MAX_RSRC_SIZE as TYPES_MAX_RSRC_SIZE,
} from '../dist/types.js';

describe('withTimeout Promise Racing Utility & Core Seams (@yumeshelf/engine)', () => {
  it('0. exports canonical PE resource constants and size bounds', () => {
    assert.strictEqual(RT_ICON, 3);
    assert.strictEqual(RT_GROUP_ICON, 14);
    assert.strictEqual(DEFAULT_MAX_RSRC_SIZE, 32 * 1024 * 1024);
    assert.strictEqual(DEFAULT_MAX_RESOURCE_ENTRIES, 2048);
    assert.strictEqual(DEFAULT_MAX_RECURSION_DEPTH, 3);
    assert.strictEqual(DEFAULT_MAX_GROUP_ICON_FRAMES, 64);
    assert.strictEqual(MAX_RESOURCE_ENTRIES, 2048);
    assert.strictEqual(MAX_RECURSION_DEPTH, 3);
    assert.strictEqual(MAX_GROUP_ICON_FRAMES, 64);

    assert.strictEqual(DEFAULT_MAX_ARTWORK_SIZE, 32 * 1024 * 1024);
    assert.strictEqual(TYPES_MAX_ARTWORK_SIZE, 32 * 1024 * 1024);
    assert.strictEqual(TYPES_MAX_RSRC_SIZE, 32 * 1024 * 1024);
  });
  it('1. resolves underlying promise when execution completes before timeout', async () => {
    const fastPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('success'), 10);
    });

    const result = await withTimeout(fastPromise, { timeoutMs: 1000 });
    assert.strictEqual(result, 'success');
  });

  it('2. handles timeout expiry, ensuring clearTimeout executes cleanly in try...finally', async (t: any) => {
    const clearTimeoutSpy = t.mock.method(globalThis, 'clearTimeout');

    const slowPromise = new Promise<string>(() => {});

    await assert.rejects(
      () => withTimeout(slowPromise, { timeoutMs: 15, errorMessage: 'Custom timeout occurred' }),
      (err: any) => {
        assert.ok(err instanceof TimeoutError || err.name === 'TimeoutError');
        assert.strictEqual(err.message, 'Custom timeout occurred');
        return true;
      }
    );

    assert.ok(clearTimeoutSpy.mock.callCount() >= 1);
  });

  it('3. aborts immediately on signal.aborted, asserting signal.removeEventListener cleanup', async (t: any) => {
    const controller = new AbortController();
    const removeEventListenerSpy = t.mock.method(controller.signal, 'removeEventListener');

    const slowPromise = new Promise<string>(() => {});

    const racePromise = withTimeout(slowPromise, {
      timeoutMs: 5000,
      signal: controller.signal,
    });

    const abortReason = new Error('Client disconnected');
    controller.abort(abortReason);

    await assert.rejects(
      () => racePromise,
      (err: any) => {
        assert.strictEqual(err, abortReason);
        return true;
      }
    );

    assert.strictEqual(removeEventListenerSpy.mock.callCount(), 1);
  });

  it('4. returns typed fallbackValue without throwing when timed out or aborted', async () => {
    // Case A: Timeout with fallback
    const hangingPromise1 = new Promise<string>(() => {});
    const timeoutResult = await withTimeout(hangingPromise1, {
      timeoutMs: 10,
      fallbackValue: null,
    });
    assert.strictEqual(timeoutResult, null);

    // Case B: Abort with fallback (active abort)
    const controller = new AbortController();
    const hangingPromise2 = new Promise<string>(() => {});
    const abortResultPromise = withTimeout(hangingPromise2, {
      signal: controller.signal,
      fallbackValue: 'fallback-on-abort',
    });
    controller.abort(new Error('Aborted'));
    const abortResult = await abortResultPromise;
    assert.strictEqual(abortResult, 'fallback-on-abort');

    // Case C: Immediate ingress abort with fallback
    const preAborted = new AbortController();
    preAborted.abort(new Error('Already aborted'));
    const preAbortedResult = await withTimeout(Promise.resolve('will not be returned'), {
      signal: preAborted.signal,
      fallbackValue: 42,
    });
    assert.strictEqual(preAbortedResult, 42);
  });

  it('5. suppresses late promise rejections when settled via timeout or abort, ensuring unhandled rejections do not escape', async () => {
    const unhandled: any[] = [];
    const onUnhandled = (err: any) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      let rejectLateTimeout!: (err: any) => void;
      const lateRejectingPromise1 = new Promise<string>((_, reject) => {
        rejectLateTimeout = reject;
      });

      await assert.rejects(
        () => withTimeout(lateRejectingPromise1, { timeoutMs: 10 }),
        { name: 'TimeoutError' }
      );

      // Fire late rejection after timeout already settled
      rejectLateTimeout(new Error('Late background I/O failure'));

      // Case with signal abort
      let rejectLateAbort!: (err: any) => void;
      const lateRejectingPromise2 = new Promise<string>((_, reject) => {
        rejectLateAbort = reject;
      });
      const controller = new AbortController();
      const race = withTimeout(lateRejectingPromise2, { signal: controller.signal });
      controller.abort(new Error('Aborted mid-flight'));

      await assert.rejects(() => race, /Aborted mid-flight/);

      // Fire late rejection after abort already settled
      rejectLateAbort(new Error('Late stream cancellation'));

      // Allow microtask cycle to flush any potential unhandled rejections
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(unhandled.length, 0);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('6. suppresses late promise rejections on pre-aborted signals where signal.aborted === true at immediate ingress', async () => {
    const unhandled: any[] = [];
    const onUnhandled = (err: any) => unhandled.push(err);
    process.on('unhandledRejection', onUnhandled);

    try {
      let rejectLate!: (err: any) => void;
      const lateRejectingPromise = new Promise<string>((_, reject) => {
        rejectLate = reject;
      });

      const controller = new AbortController();
      controller.abort(new Error('Immediate ingress abort'));

      await assert.rejects(
        () => withTimeout(lateRejectingPromise, { signal: controller.signal }),
        /Immediate ingress abort/
      );

      // Fire late rejection
      rejectLate(new Error('Late background failure after ingress abort'));

      // Flush microtasks
      await new Promise((resolve) => setImmediate(resolve));
      assert.strictEqual(unhandled.length, 0);
    } finally {
      process.removeListener('unhandledRejection', onUnhandled);
    }
  });

  it('7. verifies omitted or undefined timeoutMs does not schedule a timer or prematurely timeout, allowing normal resolution', async (t: any) => {
    const setTimeoutSpy = t.mock.method(globalThis, 'setTimeout');

    const promiseA = Promise.resolve('val-a');
    const resA = await withTimeout(promiseA);
    assert.strictEqual(resA, 'val-a');

    const promiseB = Promise.resolve('val-b');
    const resB = await withTimeout(promiseB, { timeoutMs: undefined });
    assert.strictEqual(resB, 'val-b');

    // Confirm setTimeout was never called
    assert.strictEqual(setTimeoutSpy.mock.callCount(), 0);
  });
});
