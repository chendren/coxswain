import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyProposal,
  buildCfnSkeleton,
  createOfflineAwsAdapter,
  loadCxTasks,
  transitionTask,
} from "../src/index";
import type { CxProposal } from "../src/proposals";

describe("buildCfnSkeleton", () => {
  it("emits CloudFormation with Connect/Lex and apply hint", () => {
    const cfn = buildCfnSkeleton({
      specName: "billing-dispute",
      journeyType: "billing_dispute",
      journeyMap: {
        kind: "journeyMap",
        id: "billing_dispute",
        name: "Billing Dispute",
        provenance: {
          specName: "billing-dispute",
          phase: "design",
          targetId: "aws",
        },
        stages: [
          { id: "initiated", name: "Initiated", description: "", touchpoints: [] },
          { id: "resolved", name: "Resolved", description: "", touchpoints: [] },
        ],
      },
    });
    expect(cfn.yaml).toContain("AWSTemplateFormatVersion");
    expect(cfn.yaml).toContain("AWS::Connect::Instance");
    expect(cfn.yaml).toContain("AWS::Lex::Bot");
    expect(cfn.markdown).toContain("plan-only");
  });
});

describe("applyProposal + tasks", () => {
  let cxRoot: string;
  const now = () => "2026-08-06T12:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-tasks-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("creates task and remediation file, claims proposal", async () => {
    const prop: CxProposal = {
      id: "prop_test_1",
      specName: "demo",
      targetId: "local",
      kind: "investigate",
      summary: "local degraded",
      nbaAction: "retention_offer",
      nbaRuleId: "CHURN_RISK_HIGH",
      status: "open",
      createdAt: now(),
      updatedAt: now(),
      path: ["test"],
    };
    // seed proposal file via apply which only transitions existing — apply doesn't need store preseed for transition if we call transition after...
    // applyProposal calls transitionProposal which needs proposal in store
    const { appendProposalsFromTick } = await import("../src/proposals");
    await appendProposalsFromTick({ cxRoot, now }, "demo", [
      {
        targetId: "local",
        kind: "investigate",
        summary: "local degraded",
        nba: {
          rules: [],
          primary: {
            id: "CHURN_RISK_HIGH",
            name: "x",
            priority: 100,
            conditions: [],
            logic: "AND",
            action: "retention_offer",
            actionType: "retention",
            urgency: "critical",
          },
        },
        path: ["test"],
      },
    ]);
    const { loadProposals } = await import("../src/proposals");
    const props = await loadProposals({ cxRoot, now }, "demo");
    const p = props[0]!;
    const result = await applyProposal({ cxRoot, now }, "demo", p);
    expect(result.task.status).toBe("pending");
    expect(result.task.sourceProposalId).toBe(p.id);
    const md = await readFile(result.remediationPath, "utf8");
    expect(md).toContain("Remediation");
    const tasks = await loadCxTasks({ cxRoot, now }, "demo");
    expect(tasks).toHaveLength(1);
    const done = await transitionTask({ cxRoot, now }, "demo", result.task.id, "done");
    expect(done?.status).toBe("done");
  });
});

describe("offline aws writes template.yaml", () => {
  let cxRoot: string;
  const now = () => "2026-08-06T12:00:00Z";

  beforeEach(async () => {
    cxRoot = await mkdtemp(join(tmpdir(), "cox-aws-cfn-"));
  });
  afterEach(async () => {
    await rm(cxRoot, { recursive: true, force: true });
  });

  it("deploy produces template.yaml and APPLY.md", async () => {
    const adapter = createOfflineAwsAdapter({ cxRoot, now });
    const plan = await adapter.plan({
      state: {
        name: "demo",
        createdAt: now(),
        phases: { requirements: "approved", design: "approved", tasks: "missing" },
        tasks: [],
        approvals: [],
      },
      requirements: [],
      design: {
        journeyMaps: [
          {
            kind: "journeyMap",
            id: "billing_dispute",
            name: "Billing Dispute",
            provenance: { specName: "demo", phase: "design", targetId: "artifacts" },
            stages: [
              { id: "initiated", name: "Initiated", description: "x", touchpoints: ["chat"] },
            ],
          },
        ],
        personas: [],
      },
    });
    const arts = await adapter.build(plan);
    const dep = await adapter.deploy(arts);
    expect(dep.resources.some((r) => r.id === "template.yaml")).toBe(true);
    const yaml = await readFile(join(cxRoot, "demo", "aws", "template.yaml"), "utf8");
    expect(yaml).toContain("AWS::Connect::Instance");
    const apply = await readFile(join(cxRoot, "demo", "aws", "APPLY.md"), "utf8");
    expect(apply).toContain("cloudformation deploy");
  });
});
