---
inclusion: fileMatch
fileMatchPattern: "packages/**"
---
# Structure steering
One package per concern (see docs/01-ARCHITECTURE.md). Only @cox/cli composes.
Tests beside code in test/; fixtures in /fixtures; specs in docs/specs/<ws>/.
