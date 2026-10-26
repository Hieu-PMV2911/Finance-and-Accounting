import { afterEach, describe, expect, it } from 'vitest';
import { camelCaseKeys, deepClone, deepMerge, omit, pick, snakeCaseKeys } from '../src/object/index';

type Pollutable = { polluted?: unknown };

const PAYLOADS = [
  '{"__proto__":{"polluted":"yes"}}',
  '{"constructor":{"prototype":{"polluted":"yes"}}}',
  '{"prototype":{"polluted":"yes"}}',
  '{"a":{"__proto__":{"polluted":"yes"}},"b":[{"constructor":{"prototype":{"polluted":"yes"}}}]}',
];

function parse(json: string): Record<string, unknown> {
  return JSON.parse(json) as Record<string, unknown>;
}

function expectClean(): void {
  expect(({} as Pollutable).polluted).toBeUndefined();
  expect(Object.prototype).not.toHaveProperty('polluted');
  expect(Object.getPrototypeOf({})).toBe(Object.prototype);
}

afterEach(() => {
  expectClean();
});

describe('prototype pollution', () => {
  it.each(PAYLOADS)('deepMerge ignores hostile keys in %s', (json) => {
    const before = Object.getOwnPropertyNames(Object.prototype).length;
    deepMerge({}, parse(json));
    expect(Object.getOwnPropertyNames(Object.prototype)).toHaveLength(before);
    expectClean();
  });

  it.each(PAYLOADS)('deepClone ignores hostile keys in %s', (json) => {
    const cloned = deepClone(parse(json));
    expect(Object.getPrototypeOf(cloned)).toBe(Object.prototype);
    expect(Object.prototype).not.toHaveProperty('polluted');
  });

  it.each(PAYLOADS)('camelCaseKeys ignores hostile keys in %s', (json) => {
    camelCaseKeys(parse(json));
    expectClean();
  });

  it.each(PAYLOADS)('snakeCaseKeys ignores hostile keys in %s', (json) => {
    snakeCaseKeys(parse(json));
    expectClean();
  });

  it('does not let pick create a __proto__ own property', () => {
    const payload = parse('{"__proto__":{"polluted":"yes"},"legit":1}');
    const picked = pick(payload, ['__proto__' as 'legit']);
    expect(picked).toEqual({});
    expect(Object.getPrototypeOf(picked)).toBe(Object.prototype);
  });

  it('does not let omit copy a __proto__ own property', () => {
    const payload = parse('{"__proto__":{"polluted":"yes"},"legit":1}');
    const omitted = omit(payload, []);
    expect(omitted).toEqual({ legit: 1 });
    expect(Object.getOwnPropertyNames(omitted)).toEqual(['legit']);
  });

  it('drops hostile keys carried by the target side', () => {
    const target = parse('{"__proto__":{"polluted":"yes"},"legit":1}');
    expect(deepMerge(target, { legit: 2 })).toEqual({ legit: 2 });
    expectClean();
  });

  it('still merges legitimate deep configuration', () => {
    const source = parse('{"db":{"host":"b","ports":[1,2]},"flags":{"beta":true}}');
    const merged = deepMerge({ db: { host: 'a', ports: [] }, flags: {} }, source);
    expect(merged).toEqual({ db: { host: 'b', ports: [1, 2] }, flags: { beta: true } });
  });
});

describe('bad runtime input', () => {
  it('returns null and undefined instead of throwing', () => {
    expect(camelCaseKeys(null)).toBeNull();
    expect(camelCaseKeys(undefined)).toBeUndefined();
    expect(snakeCaseKeys(null)).toBeNull();
    expect(deepClone(null)).toBeNull();
    expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
  });

  it('handles values that are not objects', () => {
    expect(camelCaseKeys(42)).toBe(42);
    expect(camelCaseKeys('snake_key')).toBe('snake_key');
    expect(snakeCaseKeys(false)).toBe(false);
  });

  it('does not blow the stack on circular input', () => {
    const node: Record<string, unknown> = { some_key: 1 };
    node.self = node;
    const circularList: unknown[] = [];
    circularList.push(circularList);

    expect(camelCaseKeys(node).selfKey).toBeUndefined();
    expect(camelCaseKeys(circularList)[0]).toBeTypeOf('object');
    expect(deepClone(node).self).toBeTypeOf('object');
    expect(deepMerge(node, node).self).toBeTypeOf('object');
  });
});
