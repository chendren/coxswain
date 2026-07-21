import { describe, expect, it } from "vitest";
import type { SpecTask } from "@cox/core";
import { parseTasks, renderTasks } from "../src/parser.js";
import { VALID_TASKS_MD } from "./helpers.js";

describe("parseTasks", () => {
  it("R6.1: parses well-formed task lines incl. sub-ids", () => {
    const md = `# Tasks — x

- [ ] 1. First task
  requirements: R1.1
  complexity: 2

- [x] 2.1. A sub-task, already done
  requirements: R1.2, R2.3
  complexity: 4
`;
    const { tasks, errors } = parseTasks(md);
    expect(errors).toEqual([]);
    expect(tasks).toEqual<SpecTask[]>([
      { id: "1", title: "First task", requirements: ["R1.1"], complexity: 2, status: "pending" },
      {
        id: "2.1",
        title: "A sub-task, already done",
        requirements: ["R1.2", "R2.3"],
        complexity: 4,
        status: "done",
      },
    ]);
  });

  it("R6.1: parses the VALID_TASKS_MD fixture cleanly", () => {
    const { tasks, errors } = parseTasks(VALID_TASKS_MD);
    expect(errors).toEqual([]);
    expect(tasks).toHaveLength(3);
    expect(tasks.map((t) => t.id)).toEqual(["1", "2", "3"]);
  });

  it("R6.2: ignores headings, prose, and blank lines without erroring", () => {
    const md = `# Tasks — x

Some human-written prose explaining context.

- [ ] 1. Only task
  requirements: R1.1
  complexity: 1

More trailing prose.
`;
    const { tasks, errors } = parseTasks(md);
    expect(errors).toEqual([]);
    expect(tasks).toHaveLength(1);
  });

  it("R6.2: ignores unknown metadata keys under a task", () => {
    const md = `- [ ] 1. Task with an extra key
  requirements: R1.1
  complexity: 1
  notes: this key is not part of the grammar
`;
    const { tasks, errors } = parseTasks(md);
    expect(errors).toEqual([]);
    expect(tasks[0]?.requirements).toEqual(["R1.1"]);
  });

  it("R6.3: requires at least one task", () => {
    const { errors } = parseTasks("# Tasks — x\n\nNo tasks here.\n");
    expect(errors).toContain("no tasks found");
  });

  it("R6.3: catches duplicate task ids", () => {
    const md = `- [ ] 1. First
  requirements: R1.1
  complexity: 1

- [ ] 1. Duplicate of first
  requirements: R1.2
  complexity: 1
`;
    const { errors } = parseTasks(md);
    expect(errors.some((e) => e.includes('duplicate task id "1"'))).toBe(true);
  });

  it("R6.3: catches out-of-range and non-integer complexity", () => {
    const md = `- [ ] 1. Too high
  requirements: R1.1
  complexity: 6

- [ ] 2. Not an integer
  requirements: R1.1
  complexity: 2.5
`;
    const { errors } = parseTasks(md);
    expect(errors.some((e) => e.includes('task 1: complexity "6"'))).toBe(true);
    expect(errors.some((e) => e.includes('task 2: complexity "2.5"'))).toBe(true);
  });

  it("R6.3: catches malformed requirement ids", () => {
    const md = `- [ ] 1. Bad r-id
  requirements: R1, not-an-id
  complexity: 1
`;
    const { errors } = parseTasks(md);
    expect(errors.some((e) => e.includes('requirement id "R1"'))).toBe(true);
    expect(errors.some((e) => e.includes('requirement id "not-an-id"'))).toBe(true);
  });

  it("R6.3: catches missing metadata lines", () => {
    const md = `- [ ] 1. Missing both metadata lines entirely

- [ ] 2. Missing only complexity
  requirements: R1.1
`;
    const { errors } = parseTasks(md);
    expect(errors).toContain('task 1: missing "requirements:" metadata line');
    expect(errors).toContain('task 1: missing "complexity:" metadata line');
    expect(errors).toContain('task 2: missing "complexity:" metadata line');
  });
});

describe("renderTasks", () => {
  it("R6.1: emits the strict format (heading, checkbox, id, title, metadata)", () => {
    const tasks: SpecTask[] = [
      { id: "1", title: "Do the thing", requirements: ["R1.1", "R2.3"], complexity: 2, status: "pending" },
    ];
    const md = renderTasks("widget", tasks);
    expect(md).toBe(
      "# Tasks — widget\n\n- [ ] 1. Do the thing\n  requirements: R1.1, R2.3\n  complexity: 2\n",
    );
  });

  it('R6.1: renders status "done" as a checked box', () => {
    const tasks: SpecTask[] = [
      { id: "1", title: "Finished", requirements: ["R1.1"], complexity: 1, status: "done" },
    ];
    expect(renderTasks("widget", tasks)).toContain("- [x] 1. Finished");
  });
});

describe("R6.4: parse(render(tasks)) round-trip", () => {
  const representative: SpecTask[][] = [
    [{ id: "1", title: "Single task", requirements: ["R1.1"], complexity: 1, status: "pending" }],
    [
      { id: "1", title: "Scaffold", requirements: ["R1.1"], complexity: 1, status: "done" },
      { id: "2", title: "Implement core logic", requirements: ["R1.2", "R2.1"], complexity: 3, status: "pending" },
      { id: "2.1", title: "Sub-task of 2", requirements: ["R2.2"], complexity: 4, status: "pending" },
      { id: "3", title: "Wire up integration, with a comma in the title", requirements: ["R3.1"], complexity: 5, status: "done" },
    ],
    [
      { id: "10", title: "Double-digit id", requirements: ["R1.1", "R1.2", "R1.3"], complexity: 2, status: "pending" },
      { id: "10.10", title: "Double-digit sub-id", requirements: ["R2.1"], complexity: 1, status: "pending" },
    ],
  ];

  for (const [i, tasks] of representative.entries()) {
    it(`round-trips representative task list #${i} (${tasks.length} tasks)`, () => {
      const rendered = renderTasks("roundtrip", tasks);
      const { tasks: parsed, errors } = parseTasks(rendered);
      expect(errors).toEqual([]);
      expect(parsed).toEqual(tasks);
    });
  }
});
