import { describe, expect, it } from 'vitest';
import clsxDefault, { clsx } from '../src/index';

describe('clsx specs', () => {
  it('keeps object keys with truthy values', () => {
    expect(clsx({ a: true, b: false, c: 0, d: null, e: undefined, f: 1 })).toBe('a f');
  });

  it('joins arrays of class names and ignores falsy values', () => {
    expect(clsx(['a', 0, false, null, undefined, 'b', true])).toBe('a b');
  });

  it('supports nested arrays and objects', () => {
    expect(clsx('a', ['b', { c: true, d: false }])).toBe('a b c');
  });

  it('handles variadic arguments correctly', () => {
    expect(clsx('a', 'b', 'c')).toBe('a b c');
  });

  it('returns empty string for no arguments or all falsy inputs', () => {
    expect(clsx()).toBe('');
    expect(clsx(null, false, undefined, 0, '')).toBe('');
  });
});

describe('input types', () => {
  it('accepts numbers', () => {
    expect(clsx(123)).toBe('123');
    expect(clsx(123, 'x', [456])).toBe('123 x 456');
    expect(clsx(0, 1)).toBe('1');
  });

  it('drops booleans, including true', () => {
    expect(clsx(true)).toBe('');
    expect(clsx(false)).toBe('');
    expect(clsx(true, 'a', false)).toBe('a');
  });

  it('drops null and undefined at any depth', () => {
    expect(clsx(null)).toBe('');
    expect(clsx(undefined)).toBe('');
    expect(clsx([null, [undefined, 'a']])).toBe('a');
  });

  it('ignores empty objects and objects with only falsy values', () => {
    expect(clsx({})).toBe('');
    expect(clsx({ a: false, b: null, c: '' })).toBe('');
    expect(clsx([{}])).toBe('');
  });

  it('iterates object keys in insertion order', () => {
    expect(clsx({ zebra: true, apple: true })).toBe('zebra apple');
    expect(clsx({ 0: 'zero', 1: 0 })).toBe('0');
  });

  it('includes inherited enumerable keys, like a `for..in` loop', () => {
    const base = { inherited: true };
    const value = Object.create(base) as Record<string, boolean>;
    value.own = true;
    expect(clsx(value)).toBe('own inherited');
  });

  it('flattens deeply nested arrays', () => {
    expect(clsx([['a', ['b', ['c', ['d']]]]])).toBe('a b c d');
    expect(clsx(['a', ['b', []], [[], 'c']])).toBe('a b c');
  });

  it('does not trim or normalise existing class names', () => {
    expect(clsx('  a  ', 'b')).toBe('  a   b');
  });

  it('handles complex combinations', () => {
    expect(clsx('foo', { bar: true, duck: false }, 'baz', [0, 'hello'])).toBe(
      'foo bar baz hello',
    );
    expect(clsx(['btn', { active: true }], { disabled: false }, [[123]])).toBe(
      'btn active 123',
    );
  });

  it('exposes the same function as the default export', () => {
    expect(clsxDefault).toBe(clsx);
    expect(clsxDefault('a', { b: true })).toBe('a b');
  });

  it('is reusable and stateless', () => {
    expect(clsx('a')).toBe('a');
    expect(clsx('b')).toBe('b');
    expect(clsx('a')).toBe('a');
  });
});
