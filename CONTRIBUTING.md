# Contributing

Thanks for your interest. Before opening a PR:

1. Read `AGENTS.md` and `docs/STANDARDS.md` — they're the rules this repo actually runs on (TDD, conventional commits, the verify gate).
2. Open an issue first for anything non-trivial.
3. `pnpm install` sets up git hooks via lefthook. Don't bypass them (`--no-verify` is never acceptable).
4. Every change: failing test first, then the fix, then `verify` green.
5. One logical change per PR, conventional-commit title, description covering what/why/how-to-test.
