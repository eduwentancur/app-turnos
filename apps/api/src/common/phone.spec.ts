import { normalizePhone } from './phone.js';

describe('normalizePhone', () => {
  it.each([
    ['+54 9 3764 11-1222', '+5493764111222'],
    ['5493764111222', '+5493764111222'],
    ['3764 222333', '+5493764222333'],
    ['03764-222333', '+5493764222333'],
    ['54 3764 222333', '+5493764222333'],
    ['+34 612 345 678', '+34612345678'],
    ['0034 612 345 678', '+34612345678'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each(['123', 'abc', '+1234567890123456'])('rechaza %s', (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
