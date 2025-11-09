import { beforeEach, describe, expect, it, vi } from "vitest";
import { PostCheckoutOrchestrator } from "./post-checkout-orchestrator.js";
import type { PostCheckoutOrchestratorResult } from "./post-checkout-orchestrator-types.js";

const getCurrentStateMock = vi.hoisted(() => vi.fn());
const getArtifactSlugMock = vi.hoisted(() => vi.fn());
const execMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  exec: execMock,
}));

vi.mock("../../utils/artifact-utils.js", async () => {
  const actual = await vi.importActual<
    typeof import("../../utils/artifact-utils.js")
  >("../../utils/artifact-utils.js");

  return {
    ...actual,
    getCurrentState: getCurrentStateMock,
    getArtifactSlug: getArtifactSlugMock,
  };
});

describe("PostCheckoutOrchestrator (unit)", () => {
  const artifactService = {
    getArtifact: vi.fn(),
    appendEvent: vi.fn(),
  };

  const draftPRService = {
    createDraftPR: vi.fn(),
  };

  beforeEach(() => {
    artifactService.getArtifact.mockReset();
    artifactService.appendEvent.mockReset();
    draftPRService.createDraftPR.mockReset();
    getCurrentStateMock.mockReset();
    getArtifactSlugMock.mockReset();
    execMock.mockReset();

    // Mock git config calls for getGitActor
    execMock.mockImplementation(
      (
        cmd: string,
        _opts: Record<string, unknown>,
        callback: (
          error: Error | null,
          stdout: { stdout: string; stderr: string },
        ) => void,
      ) => {
        if (cmd === "git config user.name") {
          callback(null, { stdout: "Tester", stderr: "" });
        } else if (cmd === "git config user.email") {
          callback(null, { stdout: "tester@example.com", stderr: "" });
        } else {
          callback(new Error(`Unexpected command: ${cmd}`), {
            stdout: "",
            stderr: "",
          });
        }
      },
    );
  });

  const makeDetection = () => ({
    shouldExecute: true,
    reason: "ok",
    metadata: {
      previousHead: "a1",
      newHead: "a1",
      branchName: "feature/C.1.2",
      artifactIds: ["C.1.2"],
      invalidArtifactIds: [],
      isNewBranch: true,
    },
  });

  const buildOrchestrator = () => {
    const orchestrator = new PostCheckoutOrchestrator({
      baseDir: "/repo",
      draftPRService,
      artifactService: artifactService as never,
      enableDraftPR: true,
      enableCascade: true,
    }) as unknown as PostCheckoutOrchestrator & {
      detector: { detectCheckout: ReturnType<typeof vi.fn> };
      cascadeService: {
        executeProgressCascade: ReturnType<typeof vi.fn>;
      };
    };

    orchestrator.detector = {
      detectCheckout: vi.fn().mockResolvedValue(makeDetection()),
    };

    orchestrator.cascadeService = {
      executeProgressCascade: vi.fn().mockResolvedValue({
        updatedArtifacts: [],
        events: [{ artifactId: "P.1", event: "in_progress" }],
      }),
    };

    getArtifactSlugMock.mockResolvedValue("C/C.1.2/C.1.2");
    getCurrentStateMock.mockReturnValue("draft");
    artifactService.getArtifact.mockResolvedValue({ metadata: {}, events: [] });
    artifactService.appendEvent.mockResolvedValue(undefined);
    draftPRService.createDraftPR.mockResolvedValue({
      url: "https://example/pr/1",
    });

    return orchestrator;
  };

  it("returns detector reason when checkout should not execute", async () => {
    const orchestrator = buildOrchestrator();
    orchestrator.detector.detectCheckout.mockResolvedValueOnce({
      shouldExecute: false,
      reason: "File checkout",
    });

    const result = await orchestrator.execute("a1", "b1", 0);

    expect(result).toEqual<PostCheckoutOrchestratorResult>({
      success: false,
      reason: "File checkout",
      errors: [],
      warnings: [],
    });
  });

  it("transitions artifacts, cascades parents, and creates draft PR", async () => {
    const orchestrator = buildOrchestrator();

    const result = await orchestrator.execute("a1", "a1", 1);

    expect(result.success).toBe(true);
    expect(result.artifactsTransitioned).toEqual(["C.1.2"]);
    expect(result.parentsCascaded).toEqual(["P.1"]);
    expect(result.prUrl).toBe("https://example/pr/1");
    expect(artifactService.appendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ id: "C.1.2" }),
    );
    expect(draftPRService.createDraftPR).toHaveBeenCalledWith(
      expect.objectContaining({
        branchName: "feature/C.1.2",
        artifactIds: ["C.1.2"],
      }),
    );
  });
});
