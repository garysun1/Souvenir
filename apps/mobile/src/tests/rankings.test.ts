import { beginRanking, compare, comparisonTarget, finishRanking, undoComparison } from '@/domain/rankings';
import type { Ranking } from '@/domain/types';
const ranking: Ranking = { key: 'cultural:recommend', placeIds: ['a', 'b', 'c', 'd', 'e', 'f'], provisionalIds: [], ties: [] };
test('quick ranking asks at most two comparisons and marks an unresolved bracket provisional', () => {
  let session = beginRanking('new', 'cultural', 'recommend', [ranking]);
  expect(comparisonTarget(session)).toBe('d'); session = compare(session, 'prefer-new');
  expect(comparisonTarget(session)).toBe('b'); session = compare(session, 'prefer-existing');
  expect(comparisonTarget(session)).toBeUndefined();
  const result = finishRanking(session, 'recommend');
  expect(result.assessment.ranking).toBe('provisional'); expect(result.ranking?.placeIds).toEqual(['a', 'b', 'new', 'c', 'd', 'e', 'f']);
});
test('undo restores exact bounds and tie uses stable IDs without claiming preference', () => {
  let session = beginRanking('aa', 'cultural', 'recommend', [ranking]); session = compare(session, 'prefer-new'); session = undoComparison(session);
  expect(comparisonTarget(session)).toBe('d');
  session = compare(session, 'tie'); const result = finishRanking(session, 'recommend');
  expect(result.assessment.tiedWith).toBe('d'); expect(result.assessment.ranking).toBe('settled'); expect(result.ranking?.ties).toContainEqual(['aa', 'd']);
});
test('finishing and re-ranking insert the place exactly once without mutating the bucket', () => {
  let session = beginRanking('b', 'cultural', 'recommend', [ranking], true);
  expect(session.bucket.placeIds).not.toContain('b');
  while (comparisonTarget(session)) session = compare(session, 'prefer-new');
  const result = finishRanking(session, 'recommend');
  expect(result.assessment.ranking).toBe('settled');
  expect(result.ranking?.placeIds).toEqual(['b', 'a', 'c', 'd', 'e', 'f']);
  expect(ranking.placeIds).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
});
test('skip saves sentiment without a fabricated rank', () => {
  const result = finishRanking(compare(beginRanking('new', 'cultural', 'depends', [ranking]), 'skip'), 'depends');
  expect(result.assessment.ranking).toBe('unranked'); expect(result.ranking).toBeUndefined();
});
