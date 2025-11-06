/**
 * Tests for artifact metadata loading utilities
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadArtifactMetadata } from "./artifact-loader.js";

describe("artifact-loader", () => {
  let tempDir: string;
  let artifactsDir: string;

  beforeEach(async () => {
    // Create temporary directory
    tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "artifact-loader-test-"),
    );
    artifactsDir = path.join(tempDir, ".kodebase", "artifacts");
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadArtifactMetadata", () => {
    it("should load artifact by ID", async () => {
      // Create artifact file structure
      const artifactPath = path.join(artifactsDir, "C", "C.7", "C.7.4.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Test Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Test artifact for loader
`,
      );

      const artifact = await loadArtifactMetadata("C.7.4", {
        gitRoot: tempDir,
        artifactsDir: ".kodebase/artifacts",
      });

      expect(artifact).toBeDefined();
      expect(artifact.metadata.title).toBe("Test Artifact");
      expect(artifact.metadata.priority).toBe("high");
      expect(artifact.content.summary).toBe("Test artifact for loader");
    });

    it("should load nested artifact IDs", async () => {
      // Create nested artifact (C.7.4.1)
      const artifactPath = path.join(
        artifactsDir,
        "C",
        "C.7",
        "C.7.4",
        "C.7.4.1.yml",
      );
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Nested Artifact
  priority: medium
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: [C.7.4]
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Nested test artifact
`,
      );

      const artifact = await loadArtifactMetadata("C.7.4.1", {
        gitRoot: tempDir,
        artifactsDir: ".kodebase/artifacts",
      });

      expect(artifact).toBeDefined();
      expect(artifact.metadata.title).toBe("Nested Artifact");
      expect(artifact.metadata.relationships.blocked_by).toEqual(["C.7.4"]);
    });

    it("should use default gitRoot when not provided", async () => {
      // Create artifact in current directory structure
      const currentArtifactsDir = path.join(
        process.cwd(),
        ".kodebase",
        "artifacts",
        "C",
        "C.7",
      );
      const artifactPath = path.join(currentArtifactsDir, "C.7.4.yml");

      // Check if the artifact exists (this is our real artifacts directory)
      const exists = await fs.promises
        .access(artifactPath)
        .then(() => true)
        .catch(() => false);

      if (exists) {
        const artifact = await loadArtifactMetadata("C.7.4", {
          artifactsDir: ".kodebase/artifacts",
        });

        expect(artifact).toBeDefined();
        expect(artifact.metadata.title).toBeDefined();
      } else {
        // Skip this test if we're not in the repo
        expect(true).toBe(true);
      }
    });

    it("should use default artifactsDir when not provided", async () => {
      // Create artifact with default path
      const defaultArtifactsPath = path.join(
        tempDir,
        ".kodebase",
        "artifacts",
        "A",
        "A.1",
        "A.1.1.yml",
      );
      await fs.promises.mkdir(path.dirname(defaultArtifactsPath), {
        recursive: true,
      });
      await fs.promises.writeFile(
        defaultArtifactsPath,
        `metadata:
  title: Default Path Test
  priority: low
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Test default path
`,
      );

      const artifact = await loadArtifactMetadata("A.1.1", {
        gitRoot: tempDir,
      });

      expect(artifact).toBeDefined();
      expect(artifact.metadata.title).toBe("Default Path Test");
    });

    it("should throw error when artifact not found", async () => {
      // Create empty artifacts directory first
      await fs.promises.mkdir(artifactsDir, { recursive: true });

      await expect(
        loadArtifactMetadata("Z.99.99", {
          gitRoot: tempDir,
          artifactsDir: ".kodebase/artifacts",
        }),
      ).rejects.toThrow(/Artifact Z\.99\.99 not found/);
    });

    it("should throw error with helpful message when directory is empty", async () => {
      // Create empty artifacts directory
      await fs.promises.mkdir(artifactsDir, { recursive: true });

      await expect(
        loadArtifactMetadata("C.7.4", {
          gitRoot: tempDir,
          artifactsDir: ".kodebase/artifacts",
        }),
      ).rejects.toThrow(/Searched 0 artifact files/);
    });

    it("should load artifact with complex event history", async () => {
      const artifactPath = path.join(artifactsDir, "B", "B.2", "B.2.3.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Complex Event Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: [B.3.1]
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
    - event: ready
      timestamp: "2025-11-06T12:05:00Z"
      actor: "test@example.com"
      trigger: dependencies_met
    - event: in_progress
      timestamp: "2025-11-06T12:10:00Z"
      actor: "test@example.com"
      trigger: branch_created
content:
  summary: Artifact with multiple events
`,
      );

      const artifact = await loadArtifactMetadata("B.2.3", {
        gitRoot: tempDir,
        artifactsDir: ".kodebase/artifacts",
      });

      expect(artifact).toBeDefined();
      expect(artifact.metadata.events).toHaveLength(3);
      expect(artifact.metadata.events[2].event).toBe("in_progress");
      expect(artifact.metadata.relationships.blocks).toEqual(["B.3.1"]);
    });

    it("should handle artifacts with special characters in content", async () => {
      const artifactPath = path.join(artifactsDir, "D", "D.1", "D.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: "Special: Characters & Symbols!"
  priority: medium
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: >-
    This artifact has special characters: @#$%^&*()
    And multiple lines with "quotes" and 'apostrophes'
`,
      );

      const artifact = await loadArtifactMetadata("D.1.1", {
        gitRoot: tempDir,
        artifactsDir: ".kodebase/artifacts",
      });

      expect(artifact).toBeDefined();
      expect(artifact.metadata.title).toBe("Special: Characters & Symbols!");
      expect(artifact.content.summary).toContain("special characters");
    });

    it("should load multiple artifacts from same directory", async () => {
      // Create two artifacts in same directory
      const dir = path.join(artifactsDir, "E", "E.1");
      await fs.promises.mkdir(dir, { recursive: true });

      await fs.promises.writeFile(
        path.join(dir, "E.1.1.yml"),
        `metadata:
  title: First Artifact
  priority: high
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: []
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: First
`,
      );

      await fs.promises.writeFile(
        path.join(dir, "E.1.2.yml"),
        `metadata:
  title: Second Artifact
  priority: low
  schema_version: "0.0.1"
  relationships:
    blocks: []
    blocked_by: [E.1.1]
  events:
    - event: draft
      timestamp: "2025-11-06T12:00:00Z"
      actor: "test@example.com"
      trigger: artifact_created
content:
  summary: Second
`,
      );

      const artifact1 = await loadArtifactMetadata("E.1.1", {
        gitRoot: tempDir,
        artifactsDir: ".kodebase/artifacts",
      });

      const artifact2 = await loadArtifactMetadata("E.1.2", {
        gitRoot: tempDir,
        artifactsDir: ".kodebase/artifacts",
      });

      expect(artifact1.metadata.title).toBe("First Artifact");
      expect(artifact2.metadata.title).toBe("Second Artifact");
      expect(artifact2.metadata.relationships.blocked_by).toEqual(["E.1.1"]);
    });

    it("should throw error for malformed YAML", async () => {
      const artifactPath = path.join(artifactsDir, "F", "F.1", "F.1.1.yml");
      await fs.promises.mkdir(path.dirname(artifactPath), { recursive: true });
      await fs.promises.writeFile(
        artifactPath,
        `metadata:
  title: Bad YAML
  priority: high
  this is not valid yaml: [unclosed bracket
`,
      );

      await expect(
        loadArtifactMetadata("F.1.1", {
          gitRoot: tempDir,
          artifactsDir: ".kodebase/artifacts",
        }),
      ).rejects.toThrow();
    });
  });
});
