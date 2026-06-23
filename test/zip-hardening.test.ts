import { describe, it, expect } from 'vitest';
import { loadZipFromBytes, entryText } from '../src/zip';
import { zipBytes } from './helpers/fixtures';

// A minimal buffer that looks like a zip64 archive declaring a huge central-directory
// entry count, with no real entries — the classic zip64 entry-count DoS. fflate's
// unzip loops once per declared entry, so without a guard this spins for a long time.
function zip64EntryCountBomb(declaredEntries: bigint): Uint8Array {
  const Z64 = 56;
  const LOC = 20;
  const EOCD = 22;
  const out = new Uint8Array(Z64 + LOC + EOCD);
  const dv = new DataView(out.buffer);
  // zip64 end-of-central-directory record at offset 0
  dv.setUint32(0, 0x06064b50, true);
  dv.setBigUint64(24, declaredEntries, true); // entries on this disk
  dv.setBigUint64(32, declaredEntries, true); // total entries
  // zip64 EOCD locator pointing back to offset 0
  dv.setUint32(Z64, 0x07064b50, true);
  dv.setBigUint64(Z64 + 8, 0n, true);
  // classic EOCD signalling "consult the zip64 record"
  const e = Z64 + LOC;
  dv.setUint32(e, 0x06054b50, true);
  dv.setUint16(e + 10, 0xffff, true);
  dv.setUint32(e + 16, 0xffffffff, true);
  return out;
}

describe('zip — zip64 entry-count DoS guard', () => {
  it('rejects an archive whose declared entry count cannot fit in the file', () => {
    const bomb = zip64EntryCountBomb(1_000_000n); // 1M entries in ~98 bytes is impossible
    expect(() => loadZipFromBytes(bomb)).toThrow(/entr/i);
  });

  it('still reads a normal archive', () => {
    const zip = loadZipFromBytes(zipBytes({ 'a.txt': 'hi', 'b.txt': 'yo' }));
    expect(entryText(zip, 'a.txt')).toBe('hi');
    expect(entryText(zip, 'b.txt')).toBe('yo');
  });
});

describe('zip — name filter (memory bound)', () => {
  it('only inflates entries whose name matches the filter', () => {
    const bytes = zipBytes({ 'docProps/app.xml': '<x/>', 'word/media/big.bin': 'x'.repeat(5000) });
    const zip = loadZipFromBytes(bytes, { only: (n) => n === 'docProps/app.xml' });
    expect('docProps/app.xml' in zip).toBe(true);
    expect('word/media/big.bin' in zip).toBe(false);
  });
});
