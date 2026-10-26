/**
 * Keys that would let an attacker walk up the prototype chain or replace a
 * constructor. Every key that is copied or created must pass this guard.
 */
export function isUnsafeKey(key: string): boolean {
  return key === '__proto__' || key === 'constructor' || key === 'prototype';
}
