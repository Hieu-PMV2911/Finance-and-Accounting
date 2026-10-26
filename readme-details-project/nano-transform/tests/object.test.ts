import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  camelCaseKeys,
  deepClone,
  deepMerge,
  omit,
  pick,
  snakeCaseKeys,
} from '../src/object/index';

/** Object whose own `__proto__` key comes from JSON, not from a literal. */
function withProtoPayload(json: string): Record<string, unknown> {
  return JSON.parse(json) as Record<string, unknown>;
}

describe('camelCaseKeys', () => {
  class Service {
    some_value = 1;
  }

  it('converts nested keys in objects and arrays', () => {
    const input = {
      user_name: 'An',
      nested_obj: { 'created-at': 1, tags: [{ tag_name: 'x' }] },
      list_items: [1, 'two', { inner_key: true }],
    };
    expect(camelCaseKeys(input)).toEqual({
      userName: 'An',
      nestedObj: { createdAt: 1, tags: [{ tagName: 'x' }] },
      listItems: [1, 'two', { innerKey: true }],
    });
  });

  it('does not mutate the input', () => {
    const input = { user_name: 'An' };
    camelCaseKeys(input);
    expect(input).toEqual({ user_name: 'An' });
  });

  it('preserves non-plain objects by reference', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const regex = /a_b/g;
    const map = new Map([['a_b', 1]]);
    const set = new Set([1]);
    const service = new Service();
    const fn = () => 1;
    const input = {
      fn_value: fn,
      date_value: date,
      regex_value: regex,
      map_value: map,
      set_value: set,
      service_value: service,
      null_value: null,
      undefined_value: undefined,
    };
    const output = camelCaseKeys(input);
    expect(output.fnValue).toBe(fn);
    expectTypeOf(output.fnValue).toEqualTypeOf<typeof fn>();
    expect(output.dateValue).toBe(date);
    expect(output.regexValue).toBe(regex);
    expect(output.mapValue).toBe(map);
    expect(output.setValue).toBe(set);
    expect(output.serviceValue).toBe(service);
    expect(output.nullValue).toBeNull();
    expect(output.undefinedValue).toBeUndefined();
  });

  it('returns non-plain values untouched at the root', () => {
    const date = new Date(0);
    expect(camelCaseKeys(date)).toBe(date);
    const list: unknown[] = [];
    expect(camelCaseKeys(list)).toEqual([]);
  });

  it('keeps circular references intact', () => {
    const node: Record<string, unknown> = { child_key: 1 };
    node.self_ref = node;
    const output = camelCaseKeys(node);
    expect(output.selfRef).toBe(output);
    expect(output.childKey).toBe(1);

    const list: unknown[] = [];
    list.push(list);
    const clonedList = camelCaseKeys(list);
    expect(clonedList[0]).toBe(clonedList);
  });

  it('supports null-prototype objects', () => {
    const input = Object.create(null) as Record<string, unknown>;
    input.some_key = 1;
    expect(camelCaseKeys(input)).toEqual({ someKey: 1 });
  });

  it('infers the camel-cased shape', () => {
    const output = camelCaseKeys({
      user_name: 'An',
      nested_obj: { created_at: new Date(), item_list: [{ item_id: 1 }] },
      map_value: new Map<string, number>(),
    });
    expectTypeOf(output).toEqualTypeOf<{
      userName: string;
      nestedObj: { createdAt: Date; itemList: { itemId: number }[] };
      mapValue: Map<string, number>;
    }>();
  });
});

describe('snakeCaseKeys', () => {
  it('converts nested keys in objects and arrays', () => {
    const input = {
      userName: 'An',
      nestedObj: { createdAt: 1, tags: [{ tagName: 'x' }] },
      listItems: [1, { innerKey: true }],
    };
    expect(snakeCaseKeys(input)).toEqual({
      user_name: 'An',
      nested_obj: { created_at: 1, tags: [{ tag_name: 'x' }] },
      list_items: [1, { inner_key: true }],
    });
  });

  it('preserves non-plain objects and primitives', () => {
    const date = new Date(0);
    const output = snakeCaseKeys({ createdAt: date, someNumber: 3 });
    expect(output.created_at).toBe(date);
    expect(output.some_number).toBe(3);
    expect(snakeCaseKeys(7)).toBe(7);
  });

  it('infers the snake-cased shape', () => {
    expectTypeOf(snakeCaseKeys({ userName: 'An', itemList: [{ itemId: 1 }] })).toEqualTypeOf<{
      user_name: string;
      item_list: { item_id: number }[];
    }>();
  });
});

describe('deepMerge', () => {
  it('merges nested objects into a new object', () => {
    const target = { db: { host: 'a', port: 5432 }, keep: 1 };
    const source = { db: { port: 6543 }, extra: true };
    const merged = deepMerge(target, source);
    expect(merged).toEqual({ db: { host: 'a', port: 6543 }, keep: 1, extra: true });
    expect(merged.db).not.toBe(target.db);
    expect(target).toEqual({ db: { host: 'a', port: 5432 }, keep: 1 });
    expect(source).toEqual({ db: { port: 6543 }, extra: true });
  });

  it('replaces arrays by default and concatenates on demand', () => {
    expect(deepMerge({ tags: [1] }, { tags: [2] })).toEqual({ tags: [2] });
    expect(deepMerge({ tags: [1] }, { tags: [2] }, { arrayMode: 'concat' })).toEqual({
      tags: [1, 2],
    });
    expect(deepMerge({ tags: 'scalar' }, { tags: [2] }, { arrayMode: 'concat' })).toEqual({
      tags: [2],
    });
    expect(deepMerge({ a: 1 }, { b: 2 }, {})).toEqual({ a: 1, b: 2 });
  });

  it('keeps target values when the source value is undefined', () => {
    expect(deepMerge({ a: 1, b: 2 }, { a: undefined, b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it('clones exotic source values but keeps maps shared', () => {
    const target = { created: new Date(0) };
    const source = { created: new Date(86400000), map: new Map([['k', 'v']]) };
    const merged = deepMerge(target, source);
    expect(merged.created).toBeInstanceOf(Date);
    expect(merged.created.getTime()).toBe(86400000);
    expect(merged.created).not.toBe(source.created);
    expect(merged.map).toBe(source.map);
  });

  it('handles circular structures', () => {
    const target: Record<string, unknown> = { a: 1 };
    target.self = target;
    const source: Record<string, unknown> = { b: 2 };
    source.self = source;
    const merged = deepMerge(target, source);
    expect(merged.self).toBe(merged);
    expect(merged.a).toBe(1);
    expect(merged.b).toBe(2);

    const sourceList: unknown[] = [1];
    sourceList.push(sourceList);
    const mergedList = deepMerge({ list: [] as unknown[] }, { list: sourceList });
    expect(mergedList.list[0]).toBe(1);
    expect(mergedList.list[1]).toBe(mergedList.list);
  });

  it('returns primitives from the source untouched', () => {
    expect(deepMerge({ a: 1 }, 5)).toBe(5);
  });

  it('treats null and undefined as "nothing to merge"', () => {
    const target = { a: { b: 1 } };
    const cloned = deepMerge(target, null);
    expect(cloned).toEqual(target);
    expect(cloned).not.toBe(target);
    expect(cloned.a).not.toBe(target.a);
    expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
    expect(deepMerge(null, null)).toBeNull();
    expect(deepMerge(undefined, undefined)).toBeUndefined();
  });

  it('merges plain objects into a non-object target', () => {
    expect(deepMerge(1, { a: 2 })).toEqual({ a: 2 });
    expect(deepMerge([1], { a: 2 })).toEqual({ a: 2 });
  });

  it('infers an intersection type', () => {
    const merged = deepMerge({ a: 1 }, { b: 'x' });
    expectTypeOf(merged).toEqualTypeOf<{ a: number } & { b: string }>();
  });
});

describe('deepClone', () => {
  it('returns primitives as-is', () => {
    expect(deepClone(1)).toBe(1);
    expect(deepClone('x')).toBe('x');
    expect(deepClone(true)).toBe(true);
    expect(deepClone(null)).toBeNull();
    expect(deepClone(undefined)).toBeUndefined();
  });

  it('copies nested objects and arrays', () => {
    const input = { a: { b: [1, { c: 2 }] }, d: [{ e: 3 }] };
    const output = deepClone(input);
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
    expect(output.a).not.toBe(input.a);
    expect(output.a.b[1]).not.toBe(input.a.b[1]);
    output.a.b[0] = 99;
    expect(input.a.b[0]).toBe(1);
  });

  it('clones dates and regexps', () => {
    const date = new Date(1234);
    const regex = /ab+c/gi;
    const output = deepClone({ date, regex });
    expect(output.date).toBeInstanceOf(Date);
    expect(output.date).not.toBe(date);
    expect(output.date.getTime()).toBe(1234);
    expect(output.regex).not.toBe(regex);
    expect(output.regex.source).toBe('ab+c');
    expect(output.regex.flags).toBe('gi');
  });

  it('keeps exotic objects by reference', () => {
    const map = new Map([['a', 1]]);
    const set = new Set([1]);
    expect(deepClone(map)).toBe(map);
    expect(deepClone({ map, set }).map).toBe(map);
    expect(deepClone({ set }).set).toBe(set);
  });

  it('reproduces circular references', () => {
    const node: Record<string, unknown> = { a: 1 };
    node.self = node;
    const output = deepClone(node);
    expect(output.self).toBe(output);
    expect(output.a).toBe(1);
  });

  it('handles null-prototype objects', () => {
    const input = Object.create(null) as Record<string, unknown>;
    input.a = 1;
    expect(deepClone(input)).toEqual({ a: 1 });
  });

  it('preserves the type', () => {
    expectTypeOf(deepClone({ a: 1 })).toEqualTypeOf<{ a: number }>();
  });
});

describe('pick', () => {
  it('keeps only the requested own keys', () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toEqual({ a: 1, c: 3 });
  });

  it('ignores missing keys', () => {
    const input: { a: number; b?: number } = { a: 1 };
    expect(pick(input, ['a', 'b'])).toEqual({ a: 1 });
  });

  it('does not copy inherited values', () => {
    const proto = { inherited: 1 };
    const input = Object.create(proto) as { own: number };
    input.own = 2;
    expect(pick(input, ['own'])).toEqual({ own: 2 });
    expect(pick(input, ['inherited' as 'own'])).toEqual({});
  });

  it('returns null and undefined untouched', () => {
    expect(pick(null as unknown as object, [])).toBeNull();
    expect(pick(undefined as unknown as object, [])).toBeUndefined();
  });

  it('infers the picked type', () => {
    expectTypeOf(pick({ a: 1, b: 'x' }, ['b'])).toEqualTypeOf<{ b: string }>();
  });
});

describe('omit', () => {
  it('drops the requested keys', () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 });
  });

  it('keeps symbol keys', () => {
    const symbol = Symbol('s');
    const input: Record<symbol, number> = { [symbol]: 1 };
    expect(omit(input, [])).toEqual({ [symbol]: 1 });
  });

  it('skips non-enumerable own properties', () => {
    const input: Record<string, number> = { visible: 1 };
    Object.defineProperty(input, 'hidden', { value: 2, enumerable: false });
    expect(omit(input, [])).toEqual({ visible: 1 });
  });

  it('does not mutate the input', () => {
    const input = { a: 1, b: 2 };
    omit(input, ['a']);
    expect(input).toEqual({ a: 1, b: 2 });
  });

  it('returns null and undefined untouched', () => {
    expect(omit(null as unknown as object, [])).toBeNull();
    expect(omit(undefined as unknown as object, [])).toBeUndefined();
  });

  it('infers the omitted type', () => {
    expectTypeOf(omit({ a: 1, b: 'x' }, ['b'])).toEqualTypeOf<{ a: number }>();
  });
});

describe('prototype pollution payloads inside plain helpers', () => {
  it('drops unsafe keys instead of walking the prototype chain', () => {
    const payload = withProtoPayload(
      '{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},"safe_key":1}',
    );
    expect(camelCaseKeys(payload)).toEqual({ safeKey: 1 });
    expect(snakeCaseKeys(payload)).toEqual({ safe_key: 1 });
    expect(deepClone(payload)).toEqual({ safe_key: 1 });
    expect(deepMerge({}, payload)).toEqual({ safe_key: 1 });
  });

  it('ignores unsafe keys requested through pick and omit', () => {
    const payload = withProtoPayload('{"__proto__":1,"safe_key":2}');
    expect(pick(payload, ['__proto__' as 'safe_key'])).toEqual({});
    expect(omit(payload, [])).toEqual({ safe_key: 2 });
    expect(Object.getPrototypeOf(omit(payload, []))).toBe(Object.prototype);
  });
});
