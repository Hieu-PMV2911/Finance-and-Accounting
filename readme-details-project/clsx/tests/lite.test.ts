import { describe, expect, it } from 'vitest';
import clsxLiteDefault, { clsx as clsxLite } from '../src/lite';

describe('clsx/lite', () => {
  it('joins strings, numbers and nested arrays', () => {
    expect(clsxLite('a', 'b', 'c')).toBe('a b c');
    expect(clsxLite('btn', ['btn-primary', false], [[123]])).toBe('btn btn-primary 123');
  });

  it('drops falsy values', () => {
    expect(clsxLite()).toBe('');
    expect(clsxLite(null, undefined, false, 0, '', true)).toBe('');
    expect(clsxLite(['a', 0, null, ['b', false]])).toBe('a b');
  });

  it('ignores object maps', () => {
    expect(clsxLite({ active: true } as never)).toBe('');
    expect(clsxLite('a', { b: true } as never, ['c'])).toBe('a c');
  });

  it('exposes the same function as the default export', () => {
    expect(clsxLiteDefault).toBe(clsxLite);
  });
});
