// Test doubles for the side-effecting ports. RecordingOrchestrator records every
// call as {method, args} and resolves immediately — letting integration tests
// assert the right Unit-02 command was dispatched without a real Agent run.
// noopNotify is a NotifyPort that does nothing (notification is v0.0.x).
import type {
  OrchestratorPort,
  RunLaunch,
  EvalLaunch,
  ResumeRun,
  RetryLaunch,
} from "../../src/app/ports/orchestrator";
import type { NotifyPort } from "../../src/app/ports/notify";
import type { RunId } from "../../src/domain/shared/ids";

export type OrchestratorCall =
  | { readonly method: "launch"; readonly args: RunLaunch }
  | { readonly method: "launchEval"; readonly args: EvalLaunch }
  | { readonly method: "resume"; readonly args: ResumeRun }
  | { readonly method: "retry"; readonly args: RetryLaunch }
  | { readonly method: "cancel"; readonly args: { readonly runId: RunId } };

export class RecordingOrchestrator implements OrchestratorPort {
  readonly calls: OrchestratorCall[] = [];

  async launch(cmd: RunLaunch): Promise<void> {
    this.calls.push({ method: "launch", args: cmd });
  }
  async launchEval(cmd: EvalLaunch): Promise<void> {
    this.calls.push({ method: "launchEval", args: cmd });
  }
  async resume(cmd: ResumeRun): Promise<void> {
    this.calls.push({ method: "resume", args: cmd });
  }
  async retry(cmd: RetryLaunch): Promise<void> {
    this.calls.push({ method: "retry", args: cmd });
  }
  async cancel(cmd: { readonly runId: RunId }): Promise<void> {
    this.calls.push({ method: "cancel", args: cmd });
  }

  /** Convenience: all calls of one method, narrowed. */
  ofMethod<M extends OrchestratorCall["method"]>(
    method: M,
  ): readonly Extract<OrchestratorCall, { method: M }>[] {
    return this.calls.filter(
      (c): c is Extract<OrchestratorCall, { method: M }> => c.method === method,
    );
  }
}

export const noopNotify: NotifyPort = {
  questionRaised(): void {
    // no-op (US-31 notification is v0.0.x)
  },
};

// FailingOrchestrator — every method rejects, simulating the live spawner
// throwing AFTER the DB commit. Lets tests assert post-commit compensation (a
// run driven to failed/stalled instead of stuck "running") and the 502 mapping.
export class FailingOrchestrator implements OrchestratorPort {
  async launch(): Promise<void> {
    throw new Error("launch failed (test)");
  }
  async launchEval(): Promise<void> {
    throw new Error("launchEval failed (test)");
  }
  async resume(): Promise<void> {
    throw new Error("resume failed (test)");
  }
  async retry(): Promise<void> {
    throw new Error("retry failed (test)");
  }
  async cancel(): Promise<void> {
    throw new Error("cancel failed (test)");
  }
}
