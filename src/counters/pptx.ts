import { XMLParser } from 'fast-xml-parser';
import type { CountOutcome } from '../types';
import { loadZip, entryText } from '../zip';

function countSldIds(xml: string): number {
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const doc = parser.parse(xml) as Record<string, any>;
  const ids = doc?.presentation?.sldIdLst?.sldId;
  if (!ids) return 0;
  return Array.isArray(ids) ? ids.length : 1;
}

export async function countPptx(filePath: string): Promise<CountOutcome> {
  try {
    const zip = await loadZip(filePath, {
      only: (n) => n === 'ppt/presentation.xml' || /^ppt\/slides\/slide\d+\.xml$/.test(n),
    });
    const xml = entryText(zip, 'ppt/presentation.xml');
    if (xml) {
      const n = countSldIds(xml);
      if (n > 0) return { pageCount: n, status: 'ok' };
    }
    const slides = Object.keys(zip).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k));
    if (slides.length > 0) return { pageCount: slides.length, status: 'ok' };
    return { pageCount: null, status: 'corrupt', error: 'no slides found' };
  } catch (err) {
    return { pageCount: null, status: 'corrupt', error: err instanceof Error ? err.message : String(err) };
  }
}
