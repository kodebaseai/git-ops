/**
 * Impact analysis tools for artifact operations
 *
 * @module analysis
 */

export type {
  AffectedSibling,
  BrokenParent,
  CancellationImpactReport,
  DeletionImpactReport,
  DependentUnblocked,
  ImpactedArtifact,
  ImpactOperation,
  ImpactReport,
  ImpactType,
  OrphanedDependent,
  ParentCompletionImpact,
} from "./impact-analyzer.js";
export { ImpactAnalyzer } from "./impact-analyzer.js";
