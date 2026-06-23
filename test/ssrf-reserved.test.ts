import { describe, it, expect } from 'vitest';
import { isPrivateAddress } from '../src/ssrf';

// Reserved / special-purpose IPv4 ranges that are not public unicast and should not be
// reachable through a spreadsheet URL (SSRF hardening).
describe('isPrivateAddress — reserved/special IPv4 ranges', () => {
  it('flags benchmarking 198.18.0.0/15', () => {
    expect(isPrivateAddress('198.18.0.1')).toBe(true);
    expect(isPrivateAddress('198.19.255.255')).toBe(true);
  });

  it('flags IETF protocol assignments 192.0.0.0/24', () => {
    expect(isPrivateAddress('192.0.0.1')).toBe(true);
  });

  it('flags multicast, class E and broadcast (224.0.0.0 .. 255.255.255.255)', () => {
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
    expect(isPrivateAddress('240.0.0.1')).toBe(true);
    expect(isPrivateAddress('255.255.255.255')).toBe(true);
  });

  it('still allows neighbouring public addresses', () => {
    expect(isPrivateAddress('198.20.0.1')).toBe(false);
    expect(isPrivateAddress('192.0.1.1')).toBe(false);
    expect(isPrivateAddress('223.255.255.255')).toBe(false);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
  });
});
