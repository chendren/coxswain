# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

Security fixes are applied to `main` and the latest `0.1.x` release. Pin to a tagged release and run `pnpm audit` locally before deploying.

## Reporting a Vulnerability

**Do not open a public issue for security vulnerabilities.**

1. Use **GitHub Security Advisories**: go to the repository Security tab > Report a vulnerability (private disclosure).
2. Alternatively, email the maintainer listed in `package.json` / GitHub profile with subject `[SECURITY] coxswain`.
3. Include: affected version/commit, reproduction steps, impact, and any PoC (redact secrets).

What to expect:

- Acknowledgment within **3 business days**.
- Triage and initial assessment within **7 business days**.
- Fix and coordinated disclosure window communicated once triage is complete.
- Credit offered if desired once the fix is released.

Please avoid automated bulk scanning that triggers abuse detection and do not exfiltrate data beyond what is needed to demonstrate impact.

## Threat Model

Coxswain (cox) is a local-first CLI and agent orchestrator. It intentionally spawns shell commands and long-lived daemons on the developer's machine and in CI. The primary trust boundary is **the local workspace and the user who invoked `cox`**. Remote code (model outputs, MCP tool results, fleet peers) is untrusted input that must not gain host capabilities outside the declared tool contracts.

### 1. Bash tool unsandboxed spawn

**Surface:** The agent `bash` tool executes arbitrary shell commands via `child_process.spawn` / `exec` on the host. There is no container or seccomp sandbox by default; commands inherit the user's UID, env, filesystem, and network.

**Threats:**

- Prompt injection or poisoned tool output causes the model to emit a destructive command (e.g., `rm -rf`, credential exfiltration via `curl`, supply-chain install).
- Workspace path traversal (e.g., `../../`) or env expansion (`$HOME`, `$AWS_*`) escapes the intended project root.
- Long-running or forking commands outlive the agent turn and leave orphaned processes.

**Mitigations in place / required:**

- Treat every bash invocation as privileged. Require explicit user approval when an agent session would run shell commands outside the workspace root or with network access, where the host supports an approval gate.
- Default to allowlisting: prefer project-scoped commands (`pnpm`, `git`, `node scripts/*`) and validate `workdir` is inside `$WORKSPACE_ROOT` before spawn.
- Enforce timeouts and `max_output_tokens` / output truncation so unbounded output cannot fill disk or OOM the controller.
- Log every spawn (command, workdir, exit code, truncated output) to `.cox/sessions/` for audit.
- In CI, run with `concurrency` cancellation, `timeout-minutes`, and least-privilege `GITHUB_TOKEN` permissions.

**Contributor guidance:** Any new code that adds a `bash` call must document the exact command shape, validate `workdir`, and add a test that asserts traversal is rejected.

### 2. Hook shell

**Surface:** Lifecycle hooks (`.cox/hooks/*`, `scripts/*`, Husky `pre-commit`, and `.pre-commit-config.yaml` hooks) execute shell code automatically on `git commit`, `cx run`, or daemon start. Hooks run with the same privileges as the user.

**Threats:**

- A malicious or compromised hook script persists across clones and executes on every commit or run (supply-chain persistence).
- Hook scripts that `eval` untrusted config (e.g., `board-sync.json`, journey YAML) lead to code execution.
- Secrets printed by hooks leak into logs or artifacts.

**Mitigations in place / required:**

- Hooks are **not auto-installed** on clone. `cx init` copies hook templates explicitly and `git config core.hooksPath` is opt-in.
- All shipped hooks are checked into version control and reviewed; local overrides in `.cox/` are gitignored and must be inspected before enabling.
- Hooks must be idempotent, non-networked, and must not `eval` workspace data. Parse JSON/YAML with a safe parser, never `bash -c "$(cat file)"`.
- `gitleaks` pre-commit (see `.pre-commit-config.yaml`) blocks accidental secret commits before hooks push.
- CI never executes local hooks (`--no-verify` equivalent for automated commits) and runs hooks in `bash -euo pipefail` mode so failures are visible.

**Contributor guidance:** Adding a hook requires updating this file and `docs/` with the hook's purpose, trigger, and privilege level. Never add a hook that fetches remote code at runtime.

### 3. Daemon PID race

**Surface:** `cx` daemons write `daemon.pid`, `daemon.json`, and `daemon.log` under `.cox/cx/<stack>/` (gitignored). The controller reads `daemon.pid` to decide if a daemon is live, to send signals, or to reuse a port.

**Threats:**

- TOCTOU race: PID file is read after an attacker or stale process replaces it, causing a signal to be sent to the wrong PID (PID reuse / symlink attack).
- Two concurrent `cx stack-up` invocations both see no PID file, both write, and one daemon is orphaned while the other is killed.
- Stale `daemon.pid` after unclean exit causes denial of service (controller refuses to start a new daemon).

**Mitigations in place / required:**

- Daemon start uses **atomic write + `O_EXCL` + `fsync`** for the PID file and records `{ pid, startTime, nonce }` in `daemon.json`. Liveness is verified by `pid + startTime` (via `process` start time / `/proc` on Linux, `ps -o lstart` on macOS), not PID alone.
- PID file is created with `0600` permissions and lives under `.cox/cx/<stack>/` which is gitignored and not world-writable. Symlink following is rejected (`lstat` check).
- Lock file (`.cox/cx/<stack>/.lock`) is held with `flock` / file-lock during start/stop so concurrent invocations serialize.
- Shutdown removes `daemon.pid` only if the stored nonce matches the current daemon; stale files are detected by failed liveness probe and reaped after a grace period.
- CI and local `cx doctor` verify no orphaned daemons and clean stale PID files before starting.

**Contributor guidance:** Do not change daemon lifecycle code without preserving the atomic-write, liveness-by-startTime, and lock-file invariants. Add a regression test that simulates concurrent start and PID reuse.

### Additional hardening

- **Secrets:** `.env` and `.env.local` are gitignored. Use `gitleaks` pre-commit and `pnpm audit` in CI; never commit tokens. Rotate any accidentally committed secret immediately.
- **Dependencies:** Dependabot (pnpm + github-actions, monthly) and `pnpm audit` (CI, `continue-on-error`) surface known CVEs. Pin GitHub Actions to commit SHAs where feasible.
- **Supply chain:** `pnpm-lock.yaml` is committed; `pnpm install --frozen-lockfile` is enforced in CI. Verify `packageManager` field.
- **OSSF Scorecard:** `.github/workflows/scorecard.yml` runs weekly and publishes results to the Security tab.

## Security Checklist for Contributors

- [ ] No new unsandboxed `spawn` without workdir validation and timeout.
- [ ] No new hook that executes untrusted workspace content.
- [ ] No PID file handling without atomic write and startTime verification.
- [ ] `pnpm audit` passes or new advisories are triaged.
- [ ] `gitleaks` pre-commit passes locally (`pre-commit run --all-files`).

## Acknowledgements

Thanks to reporters who follow coordinated disclosure. Contributors who improve the threat model or mitigations above will be credited in release notes unless they prefer anonymity.
