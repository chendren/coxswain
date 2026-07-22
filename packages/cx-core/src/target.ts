/** The three CXOS build/operate targets. */
export type CxTargetId = "artifacts" | "local" | "aws";

export const CX_TARGET_IDS: readonly CxTargetId[] = ["artifacts", "local", "aws"];

/** What an adapter can do — declared by `CxTargetAdapter.capabilities()`. */
export type CxCapability =
  | "build"
  | "deploy"
  | "status"
  | "simulate"
  | "teardown"
  | "autonomousRemediate";

/** Per-target operate mode, switchable at any time via `/cx mode`. */
export type CxOpsMode = "commands" | "console" | "autonomous";
