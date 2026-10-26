import { describe, expect, expectTypeOf, it } from 'vitest';
import { camelCase, kebabCase, pascalCase, slugify, snakeCase } from '../src/string/index';

describe('camelCase', () => {
  it.each([
    ['hello-world', 'helloWorld'],
    ['hello_world', 'helloWorld'],
    ['Hello World', 'helloWorld'],
    ['FOO_BAR', 'fooBar'],
    ['helloWorld', 'helloWorld'],
    ['HTTPServer', 'httpServer'],
    ['FOOBar', 'fooBar'],
    ['foo.bar/baz@qux', 'fooBarBazQux'],
    ['version 2 beta', 'version2Beta'],
    ['user2FAEnabled', 'user2FaEnabled'],
    ['Thư viện', 'thưViện'],
    ['   ', ''],
    ['!!!', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(camelCase(input)).toBe(expected);
  });

  it('accepts a mixed separator soup', () => {
    expect(camelCase('__some--weird  value__')).toBe('someWeirdValue');
  });

  it('returns null and undefined untouched', () => {
    expect(camelCase(null as unknown as string)).toBeNull();
    expect(camelCase(undefined as unknown as string)).toBeUndefined();
  });

  it('infers the transformed literal type', () => {
    expectTypeOf(camelCase('hello-world')).toEqualTypeOf<'helloWorld'>();
    expectTypeOf(camelCase('FOO_BAR')).toEqualTypeOf<'fooBar'>();
    expectTypeOf(camelCase('Thư viện')).toEqualTypeOf<'thưViện'>();
  });
});

describe('snakeCase', () => {
  it.each([
    ['helloWorld', 'hello_world'],
    ['hello-world', 'hello_world'],
    ['Hello World', 'hello_world'],
    ['FOO_BAR', 'foo_bar'],
    ['HTTPServer', 'http_server'],
    ['version 2 beta', 'version_2_beta'],
    ['Thư viện', 'thư_viện'],
    ['!!!', ''],
  ])('%s -> %s', (input, expected) => {
    expect(snakeCase(input)).toBe(expected);
  });

  it('returns null and undefined untouched', () => {
    expect(snakeCase(null as unknown as string)).toBeNull();
    expect(snakeCase(undefined as unknown as string)).toBeUndefined();
  });

  it('infers the transformed literal type', () => {
    expectTypeOf(snakeCase('helloWorld')).toEqualTypeOf<'hello_world'>();
  });
});

describe('kebabCase', () => {
  it.each([
    ['helloWorld', 'hello-world'],
    ['hello_world', 'hello-world'],
    ['Hello World', 'hello-world'],
    ['FOO_BAR', 'foo-bar'],
    ['HTTPServer', 'http-server'],
    ['Thư viện', 'thư-viện'],
    ['!!!', ''],
  ])('%s -> %s', (input, expected) => {
    expect(kebabCase(input)).toBe(expected);
  });

  it('returns null and undefined untouched', () => {
    expect(kebabCase(null as unknown as string)).toBeNull();
    expect(kebabCase(undefined as unknown as string)).toBeUndefined();
  });

  it('infers the transformed literal type', () => {
    expectTypeOf(kebabCase('helloWorld')).toEqualTypeOf<'hello-world'>();
  });
});

describe('pascalCase', () => {
  it.each([
    ['hello_world', 'HelloWorld'],
    ['helloWorld', 'HelloWorld'],
    ['hello-world', 'HelloWorld'],
    ['FOO_BAR', 'FooBar'],
    ['HTTPServer', 'HttpServer'],
    ['Thư viện', 'ThưViện'],
    ['!!!', ''],
  ])('%s -> %s', (input, expected) => {
    expect(pascalCase(input)).toBe(expected);
  });

  it('returns null and undefined untouched', () => {
    expect(pascalCase(null as unknown as string)).toBeNull();
    expect(pascalCase(undefined as unknown as string)).toBeUndefined();
  });

  it('infers the transformed literal type', () => {
    expectTypeOf(pascalCase('hello_world')).toEqualTypeOf<'HelloWorld'>();
  });
});

describe('slugify', () => {
  it.each([
    ['Thư viện npm siêu nhẹ!', 'thu-vien-npm-sieu-nhe'],
    ['  Hello,  World  ', 'hello-world'],
    ['Café Ångström', 'cafe-angstrom'],
    ['Đường phố Hà Nội', 'duong-pho-ha-noi'],
    ['Straße & Æther œuf Øresund Łódź ðelta', 'strasse-aether-oeuf-oresund-lodz-delta'],
    ['Top 10 Bài Hát', 'top-10-bai-hat'],
    ['---abc---', 'abc'],
    ['!!!', ''],
    ['', ''],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it('returns null and undefined untouched', () => {
    expect(slugify(null as unknown as string)).toBeNull();
    expect(slugify(undefined as unknown as string)).toBeUndefined();
  });
});
