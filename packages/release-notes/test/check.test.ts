import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isUserFacing, main, readCovered, uncovered } from "../scripts/check.mjs";

describe("isUserFacing", () => {
  it("counts feat and fix, with scope and with !", () => {
    expect(isUserFacing("feat: x")).toBe(true);
    expect(isUserFacing("fix(api): x")).toBe(true);
    expect(isUserFacing("feat(landing)!: x")).toBe(true);
  });
  it("ignores internal kinds and merges", () => {
    for (const s of [
      "chore: x",
      "docs(guides): x",
      "test: x",
      "ci: x",
      "refactor: x",
      "style: x",
      "build: x",
      "perf: x",
      "Merge branch 'a' into dev",
      "feature: x",
    ]) {
      expect(isUserFacing(s)).toBe(false);
    }
  });
});

describe("uncovered", () => {
  const commits = [
    { hash: "aaaaaaaa1111", subject: "feat: one" },
    { hash: "bbbbbbbb2222", subject: "fix: two" },
    { hash: "cccccccc3333", subject: "chore: three" },
  ];
  it("an abbreviated hash covers its commit", () => {
    expect(uncovered(commits, ["aaaaaaa"]).map((c) => c.subject)).toEqual(["fix: two"]);
  });
  it("never asks for internal commits", () => {
    expect(uncovered(commits, ["aaaaaaaa", "bbbbbbbb"])).toEqual([]);
  });
});

describe("the CLI on a real git repository", () => {
  let repo: string;
  let root: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  const commit = (subject: string) => {
    writeFileSync(join(repo, "f.txt"), subject);
    git("add", ".");
    git("commit", "-q", "-m", subject);
    return git("rev-parse", "HEAD");
  };
  const record = (hashes: string[]) => {
    mkdirSync(join(root, "2026-10-26-x"), { recursive: true });
    writeFileSync(
      join(root, "2026-10-26-x", "es.md"),
      `---\ntitle: X\ncommits:\n${hashes.map((h) => `  - ${h}`).join("\n")}\n---\n\n## Nuevo\n\n- x\n`,
    );
  };
  let errors: string[];
  let logs: string[];

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), "rn-repo-"));
    root = mkdtempSync(join(tmpdir(), "rn-root-"));
    git("init", "-q");
    git("config", "user.email", "t@t.t");
    git("config", "user.name", "t");
    git("config", "commit.gpgsign", "false");
    commit("chore: base");
    errors = [];
    logs = [];
    vi.spyOn(console, "error").mockImplementation((m: string) => void errors.push(m));
    vi.spyOn(console, "log").mockImplementation((m: string) => void logs.push(m));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(repo, { recursive: true, force: true });
    rmSync(root, { recursive: true, force: true });
  });

  const run = (...extra: string[]) =>
    main(["--range", "HEAD~2..HEAD", "--root", root, "--cwd", repo, ...extra]);

  it("fails naming an uncovered feat", () => {
    commit("docs: notes");
    const feat = commit("feat(web): a new screen");
    expect(run()).toBe(1);
    expect(errors.join("\n")).toContain(`${feat.slice(0, 8)}  feat(web): a new screen`);
  });

  it("passes when the record lists it (abbreviated)", () => {
    const fix = commit("fix: a bug");
    commit("feat!: breaking");
    const feat = git("rev-parse", "HEAD");
    record([fix.slice(0, 7), feat.slice(0, 8)]);
    expect(run()).toBe(0);
  });

  it("passes with only internal commits and no record at all", () => {
    commit("chore: deps");
    commit("docs: readme");
    expect(run()).toBe(0);
  });

  it("--pending prints the block to paste and succeeds", () => {
    commit("chore: x");
    const feat = commit("feat: y");
    expect(run("--pending")).toBe(0);
    expect(logs.join("\n")).toContain(`commits:\n  - ${feat.slice(0, 8)}`);
  });

  it("--ref reads the records from the pushed commit, not the working tree", () => {
    const feat = commit("feat: pushed");
    const dir = join(repo, "packages/release-notes/releases/2026-10-26-x");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "es.md"), `---\ntitle: X\ncommits:\n  - ${feat.slice(0, 8)}\n---\n`);
    const docs = commit("docs(release): x");
    git("checkout", "-q", "HEAD~2"); // the working tree no longer has the record
    expect(main(["--range", `HEAD..${docs}`, "--ref", docs, "--cwd", repo])).toBe(0);
    expect(main(["--range", `HEAD..${docs}`, "--root", root, "--cwd", repo])).toBe(1);
  });

  it("a bad range is a usage error, not a pass", () => {
    expect(main(["--range", "nope..HEAD", "--root", root, "--cwd", repo])).toBe(2);
  });

  it("readCovered reads the record's hashes", () => {
    record(["abcdef12", "1234567"]);
    expect(readCovered(root)).toEqual(["abcdef12", "1234567"]);
  });
});

describe("the repository's own records", () => {
  it("cover the deploy of 2026-10-26 (8af6853d..acae5486)", () => {
    const covered = readCovered();
    for (const hash of [
      "5b300ed0",
      "db79124f",
      "d0c614f1",
      "bb9b1b05",
      "3c88225b",
      "b02704aa",
      "da687eaf",
      "63ef2940",
      "d2e55c25",
      "43ba2dfc",
    ]) {
      expect(covered).toContain(hash);
    }
  });
});
