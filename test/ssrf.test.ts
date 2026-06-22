import { describe, it, expect } from 'vitest';
import { isPrivateAddress, assertPublicUrl } from '../src/ssrf';

describe('isPrivateAddress', () => {
  it('flags loopback / private / link-local addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.0.0.1')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('169.254.1.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
  });

  it('allows public addresses', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
  });
});

describe('assertPublicUrl', () => {
  it('rejects a literal loopback IP (no DNS)', async () => {
    await expect(assertPublicUrl('http://127.0.0.1/x')).rejects.toMatchObject({ status: 'network-error' });
  });

  it('resolves for a literal public IP', async () => {
    await expect(assertPublicUrl('http://8.8.8.8/x')).resolves.toBeUndefined();
  });
});
