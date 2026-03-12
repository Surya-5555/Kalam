import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';

// ─── Severity ─────────────────────────────────────────────────────────────────

export type ValidationSeverity = 'error' | 'warning';

// ─── Single issue ─────────────────────────────────────────────────────────────

export interface ValidationIssue {
  /**
   * Machine-readable rule code, e.g. "TOTALS_GRAND_MISMATCH".
   * Stable across versions — safe to key on in downstream automation.
   */
  code: string;
  severity: ValidationSeverity;
  /**
   * Dot-path to the affected field in NormalizedInvoice.
   * e.g. "totals.grandTotal", "items[2].total", "supplier.gstin".
   * null for document-level issues that don't map to a single field.
   */
  field: string | null;
  /** Human-readable description of the problem. */
  message: string;
  /** What the rule expected to find (stringified). */
  expected?: string;
  /** What was actually found (stringified). */
  actual?: string;
}

// ─── Aggregate result ─────────────────────────────────────────────────────────

export interface BusinessValidationResult {
  /**
   * false when at least one ValidationIssue with severity='error' exists.
   * Warnings alone do NOT make a document invalid.
   */
  isValid: boolean;
  /** Subset of allIssues where severity='error'. */
  errors: ValidationIssue[];
  /** Subset of allIssues where severity='warning'. */
  warnings: ValidationIssue[];
  /** All issues in rule-execution order. */
  allIssues: ValidationIssue[];
  /** Total number of rule functions evaluated. */
  rulesRun: number;
  /** Number of rules that produced zero issues. */
  rulesPassed: number;
}

// ─── Rule configuration ───────────────────────────────────────────────────────

export interface RuleConfig {
  /**
   * Maximum absolute difference tolerated in amount comparisons before
   * raising an issue.  Accounts for display rounding.  Default: 0.01
   */
  amountTolerance: number;
  /**
   * When true, raise an ERROR if supplier GSTIN is absent.
   * Default: false (GSTIN may not be applicable for non-GST invoices).
   */
  requireSupplierGstin: boolean;
  /**
   * When true, raise an ERROR if buyer GSTIN is absent.
   * Default: false.
   */
  requireBuyerGstin: boolean;
  /**
   * Enforce that CGST rate equals SGST/UTGST rate, as required by Indian
   * GST law for intra-state supplies.  Default: true.
   */
  enforceCgstEqualsSgst: boolean;
  /**
   * Enforce that IGST and CGST/SGST are not simultaneously present.
   * An invoice is either intra-state (CGST + SGST/UTGST) or
   * inter-state (IGST only).  Default: true.
   */
  enforceIgstExcludesCgstSgst: boolean;
}

export const DEFAULT_RULE_CONFIG: RuleConfig = {
  amountTolerance:             0.01,
  requireSupplierGstin:        false,
  requireBuyerGstin:           false,
  enforceCgstEqualsSgst:       true,
  enforceIgstExcludesCgstSgst: true,
};

// ─── Rule function type ───────────────────────────────────────────────────────

/** A single named validation rule.  Pure function — no side effects. */
export type Rule = (invoice: NormalizedInvoice, config: RuleConfig) => ValidationIssue[];
