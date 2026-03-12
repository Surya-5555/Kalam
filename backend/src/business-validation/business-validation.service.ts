import { Injectable } from '@nestjs/common';
import type { NormalizedInvoice } from '../normalization/dto/normalized-invoice.dto';
import type {
  BusinessValidationResult,
  RuleConfig,
  Rule,
  ValidationIssue,
} from './types';
import { DEFAULT_RULE_CONFIG } from './types';
import { totalsRule }    from './rules/totals.rule';
import { lineItemsRule } from './rules/line-items.rule';
import { taxRule }       from './rules/tax.rule';
import { datesRule }     from './rules/dates.rule';
import { gstinRule }     from './rules/gstin.rule';

/**
 * Registry of all active business validation rules.
 *
 * Order is intentional: totals and line items first (most critical),
 * then tax, dates, and identifier rules.  Any rule can be toggled by
 * adjusting RuleConfig rather than removing it from the registry.
 */
const RULE_REGISTRY: Rule[] = [
  totalsRule,
  lineItemsRule,
  taxRule,
  datesRule,
  gstinRule,
];

@Injectable()
export class BusinessValidationService {
  /**
   * Run all registered business rules against a normalized invoice.
   *
   * @param invoice  Output of NormalizationService.normalize()
   * @param config   Optional partial config; merged with DEFAULT_RULE_CONFIG
   */
  validate(
    invoice: NormalizedInvoice,
    config: Partial<RuleConfig> = {},
  ): BusinessValidationResult {
    const effectiveConfig: RuleConfig = { ...DEFAULT_RULE_CONFIG, ...config };
    const allIssues: ValidationIssue[] = [];
    let rulesPassed = 0;

    for (const rule of RULE_REGISTRY) {
      const issues = rule(invoice, effectiveConfig);
      if (issues.length === 0) rulesPassed++;
      allIssues.push(...issues);
    }

    const errors   = allIssues.filter(i => i.severity === 'error');
    const warnings = allIssues.filter(i => i.severity === 'warning');

    return {
      isValid:     errors.length === 0,
      errors,
      warnings,
      allIssues,
      rulesRun:    RULE_REGISTRY.length,
      rulesPassed,
    };
  }
}
