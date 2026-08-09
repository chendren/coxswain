# Support

Thanks for using Coxswain and CX OS.

## Where to get help

| Need | Where |
|---|---|
| **Bug reports** | [GitHub Issues](https://github.com/chendren/coxswain/issues) using the Bug report template |
| **Feature ideas** | [GitHub Issues](https://github.com/chendren/coxswain/issues) using the Feature request template |
| **Vertical pack ideas** | [GitHub Issues](https://github.com/chendren/coxswain/issues) using the Pack request template |
| **Security vulnerabilities** | [SECURITY.md](./SECURITY.md) only (private disclosure; never public issues) |
| **Usage questions / design chat** | GitHub Discussions will be enabled later; until then, use Issues with a clear question title |

## Before you open an issue

1. Search existing open and closed issues.
2. Reproduce on current `main` when possible.
3. For install/runtime problems, include:
   - OS and Node version (`node -v`)
   - pnpm version (`pnpm -v`)
   - Exact command and full error output (redact secrets)
4. For CX OS offline failures, note whether `pnpm cx:golden:ci` passes on your machine.

## What this project is not (yet)

- A hosted SaaS support channel
- A place to request live AWS deploys from the tool (AWS remains plan-only)
- A security disclosure inbox via public issues

## Companion repos

- Fleet workspace: [chendren/CXOS](https://github.com/chendren/CXOS)
- Telco demo workspace: [chendren/TelcoCXOS](https://github.com/chendren/TelcoCXOS)

Engine bugs and package PRs belong in **coxswain**. Workspace-only content
(programs, dashboards, CAB exports) may belong in the companion repos.

## Code of Conduct

Community interaction is covered by [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
