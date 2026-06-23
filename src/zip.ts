import { readFile } from 'node:fs/promises';
import { unzipSync, strFromU8, type UnzipFileInfo } from 'fflate';

export type ZipEntries = Record<string, Uint8Array>;

export interface ZipLimits {
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  maxEntries?: number;
  /** Only inflate/keep entries whose name matches; others are skipped before inflation. */
  only?: (name: string) => boolean;
}

const DEFAULT_MAX_ENTRY = 50 * 1024 * 1024;   // 50 MB per entry (declared uncompressed size)
const DEFAULT_MAX_TOTAL = 200 * 1024 * 1024;  // 200 MB total declared uncompressed
const DEFAULT_MAX_ENTRIES = 4096;             // cap on accepted entries (zip-bomb / fork defense)

// NOTE: caps are based on each entry's DECLARED uncompressed size (zip central
// directory). This bounds the realistic zip-bomb; a file that lies about its size
// is a residual risk fflate does not let us hard-cap mid-inflate.
function makeFilter(limits?: ZipLimits) {
  const maxEntry = limits?.maxEntryBytes ?? DEFAULT_MAX_ENTRY;
  const maxTotal = limits?.maxTotalBytes ?? DEFAULT_MAX_TOTAL;
  const maxEntries = limits?.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const only = limits?.only;
  let total = 0;
  let count = 0;
  return (file: UnzipFileInfo): boolean => {
    if (only && !only(file.name)) return false; // never inflate entries we don't need
    if (file.originalSize > maxEntry) return false;
    if (count >= maxEntries) return false;
    total += file.originalSize;
    if (total > maxTotal) return false;
    count += 1;
    return true;
  };
}

const EOCD_SIG = 0x06054b50;       // end of central directory record
const ZIP64_LOC_SIG = 0x07064b50;  // zip64 EOCD locator
const ZIP64_EOCD_SIG = 0x06064b50; // zip64 EOCD record
const CD_HEADER_MIN = 46;          // minimum bytes for one central-directory file header
const EOCD_MIN = 22;               // size of an EOCD record with an empty comment

// Read the declared total number of central-directory entries (honoring a zip64 record),
// or null if no EOCD can be located.
function declaredEntryCount(bytes: Uint8Array): bigint | null {
  const len = bytes.length;
  if (len < EOCD_MIN) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The EOCD lives at the very end, after an optional comment of up to 0xffff bytes.
  const minStart = Math.max(0, len - EOCD_MIN - 0xffff);
  let eocd = -1;
  for (let i = len - EOCD_MIN; i >= minStart; i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) return null;

  let count = BigInt(dv.getUint16(eocd + 10, true));
  const cdOffset = dv.getUint32(eocd + 16, true);
  // 0xffff / 0xffffffff sentinels mean "the real value is in the zip64 record".
  if (count === 0xffffn || cdOffset === 0xffffffff) {
    const loc = eocd - 20;
    if (loc >= 0 && dv.getUint32(loc, true) === ZIP64_LOC_SIG) {
      const z64 = Number(dv.getBigUint64(loc + 8, true));
      if (Number.isSafeInteger(z64) && z64 >= 0 && z64 + 40 <= len &&
          dv.getUint32(z64, true) === ZIP64_EOCD_SIG) {
        count = dv.getBigUint64(z64 + 32, true);
      }
    }
  }
  return count;
}

// Reject an archive whose central directory claims more entries than could physically
// fit in the file. Each entry needs >= 46 bytes of central-directory header, so a tiny
// file declaring millions of entries is a zip64 entry-count DoS, not a real archive.
export function assertSaneArchive(bytes: Uint8Array): void {
  const count = declaredEntryCount(bytes);
  if (count !== null && count * BigInt(CD_HEADER_MIN) > BigInt(bytes.length)) {
    throw new Error(
      `zip: declared ${count} central-directory entries cannot fit in ${bytes.length} bytes`,
    );
  }
}

export async function loadZip(filePath: string, limits?: ZipLimits): Promise<ZipEntries> {
  const buf = await readFile(filePath);
  // Zero-copy view over the file Buffer (avoids duplicating it before inflation).
  return loadZipFromBytes(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength), limits);
}

export function loadZipFromBytes(bytes: Uint8Array, limits?: ZipLimits): ZipEntries {
  assertSaneArchive(bytes);
  return unzipSync(bytes, { filter: makeFilter(limits) });
}

export function entryText(zip: ZipEntries, name: string): string | null {
  const entry = zip[name];
  return entry ? strFromU8(entry) : null;
}
