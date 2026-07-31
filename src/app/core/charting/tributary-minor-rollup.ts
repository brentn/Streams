import { FlowDirection } from '../models/flow';
import { Tributary } from './tributaries';

/** Below this fraction of the window's max magnitude, an item counts as "minor" — see issue #67. */
export const MINOR_THRESHOLD_FRACTION = 0.05;

/** Sums magnitude and centers x across a direction's minor members, into one aggregate Tributary tagged `kind: 'minor'`. */
function buildRollup(direction: FlowDirection, members: Tributary[]): Tributary {
  const total = members.reduce((sum, m) => sum + m.amount, 0);
  const centerX = members.reduce((sum, m) => sum + m.x, 0) / members.length;
  const id = `minor-${direction}-${members
    .map((m) => m.id)
    .slice()
    .sort()
    .join('|')}`;

  return {
    id,
    kind: 'minor',
    direction,
    date: members[0].date,
    x: centerX,
    amount: total,
    label: '',
    members,
  };
}

/**
 * Rolls same-direction items under `MINOR_THRESHOLD_FRACTION` of the window's own max magnitude
 * into one aggregate Tributary per direction, sized from their combined magnitude — see #60's
 * resolution and issue #67. A direction with only one qualifying minor item is left as-is: a
 * single thin line isn't the crowding this rollup exists to fix, so it's not worth the ceremony
 * of a one-member aggregate (mirrors #59/#66's own "a cluster of one is just an item" rule).
 *
 * Runs before ticket #66's proximity clustering, per #67's recommended composition order — the
 * resulting aggregate is just another Tributary as far as that clustering is concerned, so it
 * can itself end up folded into a proximity bundle alongside real (major) occurrences.
 */
export function applyMinorRollup(tributaries: Tributary[]): Tributary[] {
  const max = tributaries.reduce((m, t) => Math.max(m, t.amount), 0);
  if (max <= 0) return tributaries;

  const minorsByDirection = new Map<FlowDirection, Tributary[]>();
  for (const t of tributaries) {
    if (t.amount / max < MINOR_THRESHOLD_FRACTION) {
      const list = minorsByDirection.get(t.direction) ?? [];
      list.push(t);
      minorsByDirection.set(t.direction, list);
    }
  }

  const rolledIds = new Set<string>();
  const rollups: Tributary[] = [];
  for (const [direction, members] of minorsByDirection) {
    if (members.length < 2) continue;
    for (const m of members) rolledIds.add(m.id);
    rollups.push(buildRollup(direction, members));
  }

  if (rollups.length === 0) return tributaries;

  const rest = tributaries.filter((t) => !rolledIds.has(t.id));
  return [...rest, ...rollups];
}
