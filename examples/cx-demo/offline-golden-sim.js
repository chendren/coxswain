#!/usr/bin/env node
/**
 * Self-driven terminal sim for VHS: offline CX OS golden path.
 * Output matches real `pnpm cox` offline behavior (captured 2026-08-09).
 */

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function stream(text, base = 4) {
  for (const ch of text) {
    process.stdout.write(ch);
    await sleep(base);
  }
}

async function line(text, base = 3) {
  await stream(text + "\n", base);
}

async function typeCmd(cmd) {
  process.stdout.write("$ ");
  await stream(cmd + "\n", 18);
  await sleep(200);
}

async function main() {
  await line("\x1b[1;36m# CX OS + Coxswain - offline golden path (no API keys)\x1b[0m", 2);
  await sleep(400);

  await typeCmd("pnpm cox doctor --offline");
  await line("✓ node >= 20 (found v22.x)");
  await line("✓ config parses");
  await line("✓ ANTHROPIC_API_KEY (optional offline) - not set - offline CX path still works");
  await line("✓ .cox/ is writable");
  await sleep(500);

  await typeCmd(
    'pnpm cox --cwd /tmp/cx-demo cx run retail-demo "returns, loyalty, support, retention" --target all',
  );
  await line("runtime mode=offline platform=down url=-");
  await line("wiring artifacts=offline local=offline aws=offline");
  await line('creating CX spec "retail-demo"');
  await line("idea: Customer experience: returns, loyalty, support, retention");
  await line('approving requirements for "retail-demo"');
  await line("building retail-demo targets=artifacts,local,aws mode=offline");
  await line("  build artifacts: ok steps=6 artifacts=6 deployed=true wiring=offline");
  await line("  build local: ok steps=1 artifacts=3 deployed=true wiring=offline");
  await line("  build aws: ok steps=2 artifacts=2 deployed=true wiring=offline");
  await line("  status artifacts: healthy  artifactCount=6 missingCount=0");
  await line("  status local: healthy  artifactCount=3 missingCount=0 activeJourneys=1");
  await line("  status aws: healthy  artifactCount=4 missingCount=0 liveMutation=0");
  await line("  report artifacts: healthy");
  await line("  report local: healthy");
  await line("  report aws: healthy");
  await line("ok=true deployments=artifacts,local,aws");
  await line(
    "\x1b[32mhard rules held: offline · plan-only AWS · no CreateStack · no silent mutation\x1b[0m",
  );
  await sleep(500);

  await typeCmd("pnpm cox --cwd /tmp/cx-demo cx board");
  await line("CXOS board  specs=1 deployed=1 proposals_open=0 tasks_open=0 daemons=0");
  await line("retail-demo  [R=a D=a T=m] deps=artifacts,local,aws prop=0+0c tasks_open=0");
  await line("  idea: Customer experience: returns, loyalty, support, retention");
  await line("path: list_specs → load_each → rollup → emit");
  await sleep(400);

  await typeCmd("pnpm cox --cwd /tmp/cx-demo cx cab-export retail-demo");
  await line('CAB package for "retail-demo"');
  await line("out: /tmp/cx-demo/cx-cab/retail-demo");
  await line("files: aws/template.yaml, aws/APPLY.md, BRIEF.md, MANIFEST.md, ...");
  await line("path: load_workspace → copy_aws → write_brief → emit");
  await line("next: review MANIFEST.md + aws/APPLY.md (human CFN only)");
  await sleep(400);

  await line("");
  await line(
    "\x1b[1;32m✓ Offline golden path complete - idea -> healthy multi-target -> CAB handoff\x1b[0m",
  );
  await line("\x1b[90mgithub.com/chendren/coxswain  ·  Apache-2.0\x1b[0m");
  await sleep(1200);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
