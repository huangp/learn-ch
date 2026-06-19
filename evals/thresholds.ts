import { KNOWN_COVERAGE_TARGET } from '../lib/generation/constants.js';

// Regression gate (§12). PROVISIONAL — these are the §8 acceptance numbers; tune as
// the eval corpus grows. The runner exits non-zero if an aggregate falls below these.
export const THRESHOLDS = {
  /** Fraction of runs passing validation+coverage within ≤2 repair iterations. */
  withinTwoRepairsRate: 0.8,
  /** Mean knownCoverage over successful runs (§8 acceptance). */
  meanKnownCoverage: KNOWN_COVERAGE_TARGET,
  /** Fraction of successful runs where every target met the ≥K bar. */
  targetCoverageRate: 0.95,
  /** Fraction of runs that ultimately produced a story (after fallbacks). Must be 1. */
  successRate: 1,
};

export type Aggregate = {
  withinTwoRepairsRate: number;
  meanKnownCoverage: number;
  targetCoverageRate: number;
  successRate: number;
};

export interface GateFailure {
  metric: string;
  actual: number;
  threshold: number;
}

/** Returns the list of thresholds violated (empty = gate passes). */
export function checkGate(agg: Aggregate): GateFailure[] {
  const failures: GateFailure[] = [];
  const cmp = (metric: keyof typeof THRESHOLDS) => {
    if (agg[metric] < THRESHOLDS[metric]) failures.push({ metric, actual: agg[metric], threshold: THRESHOLDS[metric] });
  };
  cmp('withinTwoRepairsRate');
  cmp('meanKnownCoverage');
  cmp('targetCoverageRate');
  cmp('successRate');
  return failures;
}
