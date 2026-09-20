import type { Assessment, Category, Ranking, Sentiment } from '@/domain/types';

export type Comparison = 'prefer-new' | 'prefer-existing' | 'tie' | 'skip';
interface Bounds { low: number; high: number; comparisons: number; tiedWith?: string; skipped: boolean; comparedTo?: string }
export interface RankingSession extends Bounds { placeId: string; key: string; bucket: Ranking; history: Bounds[]; limit: number }
export function beginRanking(placeId: string, category: Category, sentiment: Sentiment, rankings: Ranking[], finish = false): RankingSession {
  const key = `${category}:${sentiment}`;
  const existing = rankings.find(item => item.key === key);
  const bucket: Ranking = { key, placeIds: (existing?.placeIds ?? []).filter(id => id !== placeId), provisionalIds: (existing?.provisionalIds ?? []).filter(id => id !== placeId), ties: (existing?.ties ?? []).filter(pair => !pair.includes(placeId)) };
  return { placeId, key, bucket, low: 0, high: bucket.placeIds.length, comparisons: 0, skipped: false, history: [], limit: finish ? Number.POSITIVE_INFINITY : 2 };
}
export function comparisonTarget(session: RankingSession): string | undefined {
  if (session.low >= session.high || session.skipped || session.tiedWith || session.comparisons >= session.limit) return undefined;
  return session.bucket.placeIds[Math.floor((session.low + session.high) / 2)];
}
export function compare(session: RankingSession, choice: Comparison): RankingSession {
  const target = comparisonTarget(session);
  if (!target && choice !== 'skip') return session;
  const { low, high, comparisons, skipped, tiedWith, comparedTo } = session;
  const next = { ...session, history: [...session.history, { low, high, comparisons, skipped, tiedWith, comparedTo }], comparisons: comparisons + (choice === 'skip' ? 0 : 1), comparedTo: target ?? comparedTo };
  const midpoint = Math.floor((low + high) / 2);
  if (choice === 'skip') return { ...next, skipped: true };
  if (choice === 'tie') return { ...next, tiedWith: target };
  return choice === 'prefer-new' ? { ...next, high: midpoint } : { ...next, low: midpoint + 1 };
}
export function undoComparison(session: RankingSession): RankingSession {
  const previous = session.history.at(-1);
  return previous ? { ...session, ...previous, history: session.history.slice(0, -1) } : session;
}
export function finishRanking(session: RankingSession, sentiment: Sentiment, editionId?: string): { assessment: Assessment; ranking?: Ranking } {
  const assessment: Assessment = { placeId: session.placeId, sentiment, editionId, comparedTo: session.comparedTo, ranking: 'unranked' };
  if (session.skipped) return { assessment };
  const placeIds = [...session.bucket.placeIds];
  let provisional = session.low < session.high && !session.tiedWith;
  let ties = [...session.bucket.ties];
  if (session.tiedWith) {
    const group = new Set([session.tiedWith]);
    let changed = true;
    while (changed) { changed = false; for (const pair of ties) if (pair.some(id => group.has(id))) for (const id of pair) if (!group.has(id)) { group.add(id); changed = true; } }
    const indices = placeIds.map((id, index) => group.has(id) ? index : -1).filter(index => index >= 0);
    const start = Math.min(...indices);
    const ordered = [...group, session.placeId].sort();
    const remaining = placeIds.filter(id => !group.has(id));
    remaining.splice(start, 0, ...ordered); placeIds.splice(0, placeIds.length, ...remaining);
    ties = [...ties, [session.placeId, session.tiedWith]]; provisional = [...group].some(id => session.bucket.provisionalIds.includes(id)); assessment.tiedWith = session.tiedWith;
  } else placeIds.splice(Math.floor((session.low + session.high) / 2), 0, session.placeId);
  assessment.ranking = provisional ? 'provisional' : 'settled';
  return { assessment, ranking: { key: session.key, placeIds, ties, provisionalIds: [...session.bucket.provisionalIds, ...(provisional ? [session.placeId] : [])] } };
}
