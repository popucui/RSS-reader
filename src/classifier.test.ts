import { describe, expect, it } from 'vitest';
import { classifyText } from './classifier.js';

describe('classifyText', () => {
  it('keeps source defaults and adds matched topics', () => {
    expect(classifyText('A new single-cell atlas for drug discovery', ['ai'])).toEqual(
      expect.arrayContaining(['ai', 'single-cell', 'biopharma'])
    );
  });

  it('falls back to other when no rule matches', () => {
    expect(classifyText('A quiet note from a personal site')).toEqual(['other']);
  });
});
