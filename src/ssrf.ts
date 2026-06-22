import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import { CountError } from './errors';

function ipv4IsPrivate(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p as [number, number, number, number];
  if (a === 0 || a === 127) return true;             // unspecified / loopback
  if (a === 10) return true;                          // private
  if (a === 172 && b >= 16 && b <= 31) return true;   // private
  if (a === 192 && b === 168) return true;            // private
  if (a === 169 && b === 254) return true;            // link-local
  if (a === 100 && b >= 64 && b <= 127) return true;  // CGNAT
  return false;
}

function ipv6IsPrivate(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;            // loopback / unspecified
  if (lower.startsWith('fe80')) return true;                    // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local
  const m = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);        // IPv4-mapped
  if (m) return ipv4IsPrivate(m[1]!);
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4IsPrivate(ip);
  if (v === 6) return ipv6IsPrivate(ip);
  return false;
}

/**
 * Reject a URL whose host is (or DNS-resolves to) a loopback/private/link-local
 * address, to mitigate SSRF. NOTE: a residual TOCTOU/DNS-rebinding window exists —
 * the address validated here may differ from the one the socket later connects to.
 * Accepted limitation for a v1 tool over public datasets.
 */
export async function assertPublicUrl(url: string): Promise<void> {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    throw new CountError('network-error', `invalid url: ${url}`);
  }
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(bare)) {
    if (isPrivateAddress(bare)) throw new CountError('network-error', `blocked non-public host: ${bare}`);
    return;
  }
  let addrs;
  try {
    addrs = await lookup(bare, { all: true });
  } catch {
    throw new CountError('network-error', `dns lookup failed: ${bare}`);
  }
  for (const a of addrs) {
    if (isPrivateAddress(a.address)) {
      throw new CountError('network-error', `blocked non-public host: ${bare} -> ${a.address}`);
    }
  }
}
