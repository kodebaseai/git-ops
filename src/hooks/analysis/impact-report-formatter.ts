/**
 * CLI Output Formatting for Impact Analysis Reports
 *
 * Formats impact analysis reports for CLI display with colors, indentation,
 * and actionable guidance. Supports both human-readable and JSON output.
 *
 * @module impact-report-formatter
 */

import type {
  CancellationImpactReport,
  DeletionImpactReport,
  ImpactedArtifact,
  ImpactOperation,
  ImpactReport,
} from "./impact-analyzer.js";

/**
 * Output format options
 */
export type OutputFormat = "cli" | "json";

/**
 * ANSI color codes for CLI output
 */
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
} as const;

/**
 * Symbols for different impact levels
 */
const symbols = {
  error: "✗",
  warning: "⚠️",
  success: "✓",
  info: "ℹ",
  bullet: "•",
} as const;

/**
 * Options for formatting impact reports
 */
export interface FormatOptions {
  /**
   * Output format (cli or json)
   * @default "cli"
   */
  format?: OutputFormat;

  /**
   * Disable colors in CLI output
   * @default false
   */
  noColor?: boolean;

  /**
   * Include detailed artifact information
   * @default false
   */
  verbose?: boolean;
}

/**
 * Formats impact analysis reports for CLI display
 */
export class ImpactReportFormatter {
  private readonly options: Required<FormatOptions>;

  constructor(options: FormatOptions = {}) {
    this.options = {
      format: options.format ?? "cli",
      noColor: options.noColor ?? false,
      verbose: options.verbose ?? false,
    };
  }

  /**
   * Format an impact report
   */
  format(
    report: ImpactReport | CancellationImpactReport | DeletionImpactReport,
    operation?: ImpactOperation,
  ): string {
    if (this.options.format === "json") {
      return this.formatJson(report);
    }

    // Determine the operation type
    const op = operation ?? this.inferOperation(report);

    // Route to appropriate formatter based on report type
    if (this.isCancellationReport(report)) {
      return this.formatCancellationReport(report);
    }

    if (this.isDeletionReport(report)) {
      return this.formatDeletionReport(report);
    }

    return this.formatGenericReport(report, op);
  }

  /**
   * Format as JSON
   */
  private formatJson(
    report: ImpactReport | CancellationImpactReport | DeletionImpactReport,
  ): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Infer operation type from report
   */
  private inferOperation(
    report: ImpactReport | CancellationImpactReport | DeletionImpactReport,
  ): ImpactOperation {
    if ("operation" in report) {
      return report.operation;
    }
    // Default to cancel if we can't determine
    return "cancel";
  }

  /**
   * Type guard for CancellationImpactReport
   */
  private isCancellationReport(
    report: unknown,
  ): report is CancellationImpactReport {
    return (
      typeof report === "object" &&
      report !== null &&
      "parentCompletionAffected" in report &&
      "dependentsUnblocked" in report
    );
  }

  /**
   * Type guard for DeletionImpactReport
   */
  private isDeletionReport(report: unknown): report is DeletionImpactReport {
    return (
      typeof report === "object" &&
      report !== null &&
      "orphanedDependents" in report &&
      "brokenParent" in report &&
      "affectedSiblings" in report
    );
  }

  /**
   * Format a cancellation impact report
   */
  private formatCancellationReport(report: CancellationImpactReport): string {
    const lines: string[] = [];

    // Header
    lines.push(
      `${this.colorize(this.bold("Impact Analysis:"), "cyan")} Cancel ${report.artifactId}`,
    );
    lines.push("");

    // Parent completion impact
    if (
      report.parentCompletionAffected &&
      report.parentCompletionAffected.length > 0
    ) {
      lines.push(
        this.colorize(`${symbols.success} Parent Completion`, "green"),
      );
      for (const parent of report.parentCompletionAffected) {
        lines.push(
          `  ${symbols.bullet} ${parent.id} - ${this.getArtifactTitle(parent.artifact)}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(parent.message)}`);
        }
      }
      lines.push("");
    }

    // Dependents unblocked
    if (report.dependentsUnblocked && report.dependentsUnblocked.length > 0) {
      const symbol =
        report.dependentsUnblocked.length > 0 ? symbols.warning : symbols.info;
      const color = report.dependentsUnblocked.length > 0 ? "yellow" : "blue";
      lines.push(
        this.colorize(
          `${symbol} Dependents Unblocked (${report.dependentsUnblocked.length})`,
          color,
        ),
      );
      for (const dependent of report.dependentsUnblocked) {
        lines.push(
          `  ${symbols.bullet} ${dependent.id} - ${this.getArtifactTitle(dependent.artifact)}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(dependent.message)}`);
        }
      }
      lines.push("");
    }

    // Children impact
    if (report.children && report.children.length > 0) {
      lines.push(
        this.colorize(
          `${symbols.info} Children (${report.children.length})`,
          "blue",
        ),
      );
      for (const child of report.children) {
        lines.push(
          `  ${symbols.bullet} ${child.id} - ${this.getArtifactTitle(child.artifact)}`,
        );
      }
      if (this.options.verbose) {
        lines.push(`    ${this.dim("Will remain in current state")}`);
      }
      lines.push("");
    }

    // Summary
    lines.push(`${this.bold("Summary:")} ${report.summary}`);

    // Guidance
    if (!report.hasImpact) {
      lines.push(
        this.colorize("Safe to proceed without --force flag", "green"),
      );
    }

    return lines.join("\n");
  }

  /**
   * Format a deletion impact report
   */
  private formatDeletionReport(report: DeletionImpactReport): string {
    const lines: string[] = [];

    // Header
    lines.push(
      `${this.colorize(this.bold("Impact Analysis:"), "cyan")} Delete ${report.artifactId}`,
    );
    lines.push("");

    // Orphaned dependents
    if (report.orphanedDependents && report.orphanedDependents.length > 0) {
      const hasFullyOrphaned = report.orphanedDependents.some(
        (d) => d.fullyOrphaned,
      );
      const symbol = hasFullyOrphaned ? symbols.error : symbols.warning;
      const color = hasFullyOrphaned ? "red" : "yellow";

      lines.push(
        this.colorize(
          `${symbol} Orphaned Dependents (${report.orphanedDependents.length})`,
          color,
        ),
      );
      for (const dependent of report.orphanedDependents) {
        const status = dependent.fullyOrphaned
          ? "[FULLY ORPHANED]"
          : "[PARTIAL]";
        lines.push(
          `  ${symbols.bullet} ${dependent.id} - ${this.getArtifactTitle(dependent.artifact)} ${this.colorize(status, dependent.fullyOrphaned ? "red" : "yellow")}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(dependent.message)}`);
        }
      }
      lines.push("");
    }

    // Broken parent
    if (report.brokenParent) {
      lines.push(this.colorize(`${symbols.error} Broken Parent`, "red"));
      lines.push(
        `  ${symbols.bullet} ${report.brokenParent.id} - ${this.getArtifactTitle(report.brokenParent.artifact)}`,
      );
      if (this.options.verbose) {
        lines.push(`    ${this.dim(report.brokenParent.message)}`);
      }
      lines.push("");
    }

    // Affected siblings
    if (report.affectedSiblings && report.affectedSiblings.length > 0) {
      lines.push(
        this.colorize(
          `${symbols.info} Affected Siblings (${report.affectedSiblings.length})`,
          "blue",
        ),
      );
      for (const sibling of report.affectedSiblings) {
        const status = sibling.canHelpComplete
          ? "[CAN HELP COMPLETE]"
          : "[BLOCKING]";
        lines.push(
          `  ${symbols.bullet} ${sibling.id} - ${this.getArtifactTitle(sibling.artifact)} ${this.colorize(status, sibling.canHelpComplete ? "green" : "yellow")}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(sibling.message)}`);
        }
      }
      lines.push("");
    }

    // Orphaned children
    if (report.orphanedChildren && report.orphanedChildren.length > 0) {
      lines.push(
        this.colorize(
          `${symbols.warning} Orphaned Children (${report.orphanedChildren.length})`,
          "yellow",
        ),
      );
      for (const child of report.orphanedChildren) {
        lines.push(
          `  ${symbols.bullet} ${child.id} - ${this.getArtifactTitle(child.artifact)}`,
        );
      }
      lines.push("");
    }

    // Summary
    lines.push(`${this.bold("Summary:")} ${report.summary}`);

    // Guidance
    if (report.requiresForce) {
      lines.push(
        this.colorize(
          `${symbols.error} --force flag required due to dependent artifacts`,
          "red",
        ),
      );
    } else if (!report.hasImpact) {
      lines.push(
        this.colorize("Safe to proceed without --force flag", "green"),
      );
    }

    return lines.join("\n");
  }

  /**
   * Format a generic impact report
   */
  private formatGenericReport(
    report: ImpactReport,
    operation: ImpactOperation,
  ): string {
    const lines: string[] = [];

    // Header
    const opName =
      operation === "remove_dependency"
        ? "Remove Dependency"
        : operation.charAt(0).toUpperCase() + operation.slice(1);
    lines.push(
      `${this.colorize(this.bold("Impact Analysis:"), "cyan")} ${opName} ${report.artifactId}`,
    );
    lines.push("");

    // Group by impact type
    const byType = this.groupByImpactType(report.impactedArtifacts);

    // Parent completion
    if (byType.blocks_parent_completion.length > 0) {
      lines.push(
        this.colorize(
          `${symbols.warning} Blocks Parent Completion (${byType.blocks_parent_completion.length})`,
          "yellow",
        ),
      );
      for (const artifact of byType.blocks_parent_completion) {
        lines.push(
          `  ${symbols.bullet} ${artifact.id} - ${this.getArtifactTitle(artifact.artifact)}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(artifact.reason)}`);
        }
      }
      lines.push("");
    }

    // Breaks dependency
    if (byType.breaks_dependency.length > 0) {
      lines.push(
        this.colorize(
          `${symbols.error} Breaks Dependencies (${byType.breaks_dependency.length})`,
          "red",
        ),
      );
      for (const artifact of byType.breaks_dependency) {
        lines.push(
          `  ${symbols.bullet} ${artifact.id} - ${this.getArtifactTitle(artifact.artifact)}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(artifact.reason)}`);
        }
      }
      lines.push("");
    }

    // Orphans children
    if (byType.orphans_children.length > 0) {
      lines.push(
        this.colorize(
          `${symbols.warning} Orphans Children (${byType.orphans_children.length})`,
          "yellow",
        ),
      );
      for (const artifact of byType.orphans_children) {
        lines.push(
          `  ${symbols.bullet} ${artifact.id} - ${this.getArtifactTitle(artifact.artifact)}`,
        );
        if (this.options.verbose) {
          lines.push(`    ${this.dim(artifact.reason)}`);
        }
      }
      lines.push("");
    }

    // Summary
    const totalAffected = report.impactedArtifacts.length;
    lines.push(
      `${this.bold("Summary:")} ${totalAffected} artifact${totalAffected !== 1 ? "s" : ""} affected`,
    );

    // Guidance
    if (!report.hasImpact) {
      lines.push(
        this.colorize("Safe to proceed without --force flag", "green"),
      );
    } else if (byType.breaks_dependency.length > 0) {
      lines.push(
        this.colorize(`${symbols.error} --force flag may be required`, "red"),
      );
    }

    return lines.join("\n");
  }

  /**
   * Group impacted artifacts by type
   */
  private groupByImpactType(artifacts: ImpactedArtifact[]) {
    return {
      blocks_parent_completion: artifacts.filter(
        (a) => a.impactType === "blocks_parent_completion",
      ),
      breaks_dependency: artifacts.filter(
        (a) => a.impactType === "breaks_dependency",
      ),
      orphans_children: artifacts.filter(
        (a) => a.impactType === "orphans_children",
      ),
    };
  }

  /**
   * Get artifact title
   */
  private getArtifactTitle(artifact: {
    metadata?: { title?: string };
  }): string {
    return artifact.metadata?.title ?? "Untitled";
  }

  /**
   * Colorize text
   */
  private colorize(text: string, color: keyof typeof colors): string {
    if (this.options.noColor) {
      return text;
    }
    return `${colors[color]}${text}${colors.reset}`;
  }

  /**
   * Make text bold
   */
  private bold(text: string): string {
    if (this.options.noColor) {
      return text;
    }
    return `${colors.bold}${text}${colors.reset}`;
  }

  /**
   * Make text dim
   */
  private dim(text: string): string {
    if (this.options.noColor) {
      return text;
    }
    return `${colors.dim}${text}${colors.reset}`;
  }
}
