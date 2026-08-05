import { CategorizationRule } from '../models/categorization-rule';
import { Flow, FlowDirection } from '../models/flow';
import { Transaction } from '../models/transaction';
import { isSubstringMatch } from './categorization';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DATE_SCORE_WEIGHT = 0.3;
const AMOUNT_SCORE_WEIGHT = 0.3;
const TEXT_SCORE_WEIGHT = 0.4;
/** How much a name-only text match is damped relative to a Categorization Rule match — see `bestTextScore`. */
const NAME_MATCH_DAMPING = 0.7;

export interface MatchCandidate {
  transaction: Transaction;
  score: number;
}

/** Overlap of normalized, whitespace-split tokens, ignoring order and duplicates. 0..1. */
function tokenSimilarity(a: string, b: string): number {
  const tokensOf = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter(Boolean));
  const setA = tokensOf(a);
  const setB = tokensOf(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const token of setA) if (setB.has(token)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

/** A full substring hit is the same signal automatic categorization uses, so it scores at the max; anything softer falls back to word overlap. */
function textSimilarity(description: string, candidateText: string): number {
  if (!candidateText.trim()) return 0;
  return isSubstringMatch(description, candidateText) ? 1 : tokenSimilarity(description, candidateText);
}

/**
 * Best text-similarity score for `description` against the Flow's own name and any Categorization
 * Rule already targeting it. A prior rule is the stronger signal — a recurring Flow usually
 * already has one — so a name-only match is damped relative to it, but both are considered and
 * the higher score wins.
 */
function bestTextScore(description: string, flowName: string, ruleMatchTexts: string[]): number {
  const nameScore = textSimilarity(description, flowName) * NAME_MATCH_DAMPING;
  const ruleScore = ruleMatchTexts.reduce((best, text) => Math.max(best, textSimilarity(description, text)), 0);
  return Math.max(nameScore, ruleScore);
}

function dateScore(transactionDate: Date, occurrenceDate: Date): number {
  const daysApart = Math.abs(transactionDate.getTime() - occurrenceDate.getTime()) / MS_PER_DAY;
  return 1 / (1 + daysApart);
}

function amountScore(transactionAmount: number, expectedAmount: number): number {
  if (expectedAmount === 0) return transactionAmount === 0 ? 1 : 0;
  const relativeDiff = Math.abs(Math.abs(transactionAmount) - expectedAmount) / expectedAmount;
  return 1 / (1 + relativeDiff);
}

function matchesDirection(transaction: Transaction, direction: FlowDirection): boolean {
  return direction === 'in' ? transaction.amount > 0 : transaction.amount < 0;
}

/**
 * Ranks every Transaction that could plausibly be this Outstanding occurrence's missing match —
 * any Transaction sharing the Flow's direction, not just already-unmatched ones, since correcting
 * an existing match is a valid resolution too. Combines date closeness, amount closeness, and
 * description similarity (against the Flow's name and its Categorization Rules) into one
 * descending-sorted list. See #97.
 */
export function rankMatchCandidates(
  flow: Flow,
  occurrenceDate: Date,
  expectedAmount: number,
  transactions: Transaction[],
  categorizationRules: CategorizationRule[],
): MatchCandidate[] {
  const ruleMatchTexts = categorizationRules
    // Optional chaining guards a rule left behind with no `target` by an old schema/migration —
    // this scans every stored rule on every tile click, a far more exposed path than the rarer
    // call sites that assume well-formed data.
    .filter((rule) => rule.target?.kind === 'flow' && rule.target.id === flow.id)
    .map((rule) => rule.matchText);

  return transactions
    .filter((transaction) => matchesDirection(transaction, flow.direction))
    .map((transaction) => ({
      transaction,
      score:
        dateScore(transaction.date, occurrenceDate) * DATE_SCORE_WEIGHT +
        amountScore(transaction.amount, expectedAmount) * AMOUNT_SCORE_WEIGHT +
        bestTextScore(transaction.description, flow.name, ruleMatchTexts) * TEXT_SCORE_WEIGHT,
    }))
    .sort((a, b) => b.score - a.score);
}
