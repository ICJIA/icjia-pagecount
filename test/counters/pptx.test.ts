import { describe, it, expect } from 'vitest';
import { countPptx } from '../../src/counters/pptx';
import { pptxBytes, writeTemp } from '../helpers/fixtures';
import { zipBytes } from '../helpers/fixtures';

describe('countPptx', () => {
  it('counts slides from presentation.xml (many)', async () => {
    const file = await writeTemp(pptxBytes(5), 'deck.pptx');
    expect(await countPptx(file)).toMatchObject({ pageCount: 5, status: 'ok' });
  });
  it('counts a single slide (non-array sldId)', async () => {
    const file = await writeTemp(pptxBytes(1), 'deck.pptx');
    expect(await countPptx(file)).toMatchObject({ pageCount: 1, status: 'ok' });
  });
  it('falls back to counting slide parts', async () => {
    const file = await writeTemp(zipBytes({
      'ppt/slides/slide1.xml': '<s/>',
      'ppt/slides/slide2.xml': '<s/>',
    }), 'deck.pptx');
    expect(await countPptx(file)).toMatchObject({ pageCount: 2, status: 'ok' });
  });
});
