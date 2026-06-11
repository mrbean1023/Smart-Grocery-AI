import {
  decideMatchPath,
  filterCandidates,
  ingredientEmbeddingText,
  productEmbeddingText,
  toVectorLiteral,
} from './matching.logic';

describe('matching.logic', () => {
  describe('decideMatchPath', () => {
    it('uses embedding path when both sides have embeddings', () => {
      expect(decideMatchPath(true, 120)).toBe('embedding');
    });

    it('falls back to trigram when the source has no embedding', () => {
      expect(decideMatchPath(false, 120)).toBe('trigram');
    });

    it('falls back to trigram when no targets are embedded', () => {
      expect(decideMatchPath(true, 0)).toBe('trigram');
    });

    it('falls back to trigram when nothing is embedded', () => {
      expect(decideMatchPath(false, 0)).toBe('trigram');
    });
  });

  describe('filterCandidates', () => {
    it('keeps only candidates at or above the threshold', () => {
      const result = filterCandidates(
        [
          { id: 'a', sim: 0.9 },
          { id: 'b', sim: 0.45 },
          { id: 'c', sim: 0.44 },
        ],
        0.45,
      );
      expect(result.map((c) => c.id)).toEqual(['a', 'b']);
    });

    it('applies the trigram floor', () => {
      const result = filterCandidates(
        [
          { id: 'a', sim: 0.31 },
          { id: 'b', sim: 0.3 },
          { id: 'c', sim: 0.29 },
        ],
        0.1,
        0.3,
      );
      expect(result.map((c) => c.id)).toEqual(['a']);
    });

    it('dedupes by id keeping the highest similarity', () => {
      const result = filterCandidates(
        [
          { id: 'a', sim: 0.5 },
          { id: 'a', sim: 0.8 },
          { id: 'a', sim: 0.6 },
        ],
        0.45,
      );
      expect(result).toEqual([{ id: 'a', sim: 0.8 }]);
    });

    it('sorts by similarity descending', () => {
      const result = filterCandidates(
        [
          { id: 'low', sim: 0.5 },
          { id: 'high', sim: 0.95 },
          { id: 'mid', sim: 0.7 },
        ],
        0.45,
      );
      expect(result.map((c) => c.id)).toEqual(['high', 'mid', 'low']);
    });

    it('drops non-finite similarities and returns empty for no candidates', () => {
      expect(filterCandidates([{ id: 'a', sim: NaN }], 0.45)).toEqual([]);
      expect(filterCandidates([], 0.45)).toEqual([]);
    });
  });

  describe('embedding text builders', () => {
    it('joins product name, brand and category', () => {
      expect(productEmbeddingText('Chicken Breast', 'Pasar', 'Meat')).toBe(
        'Chicken Breast Pasar Meat',
      );
    });

    it('skips null brand/category', () => {
      expect(productEmbeddingText('Chicken Breast', null, null)).toBe('Chicken Breast');
    });

    it('humanizes the ingredient category', () => {
      expect(ingredientEmbeddingText('Bee Hoon', 'NOODLES_PASTA')).toBe('Bee Hoon noodles pasta');
    });
  });

  describe('toVectorLiteral', () => {
    it('formats a pgvector literal', () => {
      expect(toVectorLiteral([0.1, -0.2, 3])).toBe('[0.1,-0.2,3]');
    });
  });
});
