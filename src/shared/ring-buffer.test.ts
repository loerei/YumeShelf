import { describe, expect, it } from 'vitest';
import { CircularRingBuffer } from './ring-buffer';

describe('CircularRingBuffer', () => {
  it('throws on invalid capacities (NaN, non-integers, <= 0)', () => {
    expect(() => new CircularRingBuffer(NaN)).toThrow('Capacity must be a positive integer');
    expect(() => new CircularRingBuffer(1.5)).toThrow('Capacity must be a positive integer');
    expect(() => new CircularRingBuffer(-5)).toThrow('Capacity must be a positive integer');
    expect(() => new CircularRingBuffer(0)).toThrow('Capacity must be a positive integer');
  });

  it('maintains FIFO order, overwrites oldest items on overflow, tracks droppedCount, and resets on clear()', () => {
    const buf = new CircularRingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.toArray()).toEqual([1, 2, 3]);
    expect(buf.getDroppedCount()).toBe(0);

    buf.push(4);
    buf.push(5);
    expect(buf.toArray()).toEqual([3, 4, 5]);
    expect(buf.getDroppedCount()).toBe(2);

    buf.clear();
    expect(buf.toArray()).toEqual([]);
    expect(buf.getDroppedCount()).toBe(0);
  });

  it('strips ANSI escape sequences and truncates strings > 2000 chars on push and in toSafeArray', () => {
    const buf = new CircularRingBuffer<unknown>(5);
    buf.push('\u001b[31mError:\u001b[0m failed');
    const longStr = 'a'.repeat(2100);
    buf.push(longStr);
    buf.push({ nested: '\u001b[32mok\u001b[0m', longNested: 'b'.repeat(2050) });

    const arr = buf.toArray();
    expect(arr[0]).toBe('Error: failed');
    expect(arr[1]).toBe(`${'a'.repeat(2000)}... [truncated]`);

    const safe = buf.toSafeArray() as any[];
    expect(safe[2].nested).toBe('ok');
    expect(safe[2].longNested).toBe(`${'b'.repeat(2000)}... [truncated]`);
  });

  it('safely serializes circular objects, DAG diamonds, BigInt, Date, Error, AggregateError, Map, Set, and prototype-pollution keys', () => {
    const buf = new CircularRingBuffer<unknown>(10);

    const circular: any = { name: 'root' };
    circular.self = circular;

    const sharedLeaf = { val: 42 };
    const diamond = { left: sharedLeaf, right: sharedLeaf };

    const err = new Error('boom', { cause: new Error('inner') });
    const agg = new AggregateError([new Error('e1'), 'e2'], 'multi');
    const date = new Date('2026-01-01T00:00:00.000Z');
    const map = new Map<unknown, unknown>([['k1', 'v1'], ['__proto__', 'evil']]);
    const set = new Set([1, 'two']);
    const protoObj = JSON.parse('{"safe":"ok","__proto__":{"polluted":true},"constructor":"bad"}');

    buf.push(circular);
    buf.push(diamond);
    buf.push({ big: 9007199254740993n });
    buf.push({ err, agg, date, map, set, protoObj });

    const serialized = JSON.stringify(buf);
    const parsed = JSON.parse(serialized);

    expect(parsed[0]).toEqual({ name: 'root', self: '[Circular]' });
    expect(parsed[1]).toEqual({ left: { val: 42 }, right: { val: 42 } });
    expect(parsed[2]).toEqual({ big: '9007199254740993' });
    expect(parsed[3].err.name).toBe('Error');
    expect(parsed[3].err.message).toBe('boom');
    expect(parsed[3].err.cause.message).toBe('inner');
    expect(parsed[3].agg.errors).toHaveLength(2);
    expect(parsed[3].date).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed[3].map).toEqual({ k1: 'v1' });
    expect(parsed[3].set).toEqual([1, 'two']);
    expect(parsed[3].protoObj).toEqual({ safe: 'ok' });
  });
});
