# AGENTS.md — launcharr

Project-specific deltas from the global AGENTS.md (dotfiles). Global rules apply unless
overridden here. This file also carries the Rust standards, which the global file doesn't cover.

## Project shape

- Single pnpm package (no workspace) + a Tauri `src-tauri/` Rust crate. Not a monorepo.
- **Rust owns the OS, TypeScript owns the experience** (see CLAUDE.md). If a change puts product
  opinion in Rust or AppKit calls in TypeScript, it's in the wrong layer.
- Keep the IPC command surface tiny and typed; adding a Tauri command is an architectural
  decision — record it in `docs/DECISIONS.md`.

## Rust standards

Same spirit as the TypeScript rules: strict, minimal, boring.

### Toolchain & formatting

- Stable Rust, pinned via `rust-toolchain.toml`. Edition 2024.
- `cargo fmt` with default rustfmt settings — don't fight the formatter.
- `cargo clippy --all-targets -- -D warnings` must pass. No `#[allow]` without a one-line
  comment saying why.

### Code style

- No `unwrap()`/`expect()` outside tests. The only exception is a truly infallible case, with a
  comment proving it (`// infallible: regex is a literal`).
- Errors: `thiserror` for typed errors inside modules; Tauri command boundaries map errors to a
  serializable error type for the frontend. Never stringly-typed errors across IPC.
- `unsafe` (and raw `objc2`/AppKit bindings) live in dedicated, small modules with a safety
  comment per block — never inline in command handlers.
- Tauri commands are thin: validate input, call a plain function, map the result. Logic lives in
  plain functions so it's testable without a Tauri runtime.
- Types crossing IPC derive `Serialize`/`Deserialize` and have a mirrored TypeScript type;
  keep the pair adjacent in naming (`AppItem` ↔ `AppItem`).
- Naming: `snake_case` items, `PascalCase` types, `SCREAMING_SNAKE_CASE` consts — rustc's
  defaults, enforced by clippy.

### Testing

- TDD applies to Rust the same as TypeScript wherever the code is testable in-process: index
  parsing, frecency SQL, config parsing get failing tests first (`#[cfg(test)]` colocated
  modules; `cargo test`).
- Native AppKit behavior (panel focus, activation, AppleScript hand-off) can't be meaningfully
  unit-tested — verify manually against a written checklist in the task's plan file and record
  quirks in `docs/JOURNAL.md`.
- `cargo test` runs in the Lefthook pre-push hook alongside `pnpm test`.

### Dependencies

- Same discipline as npm-land: every crate is a liability, prefer std, keep the tree shallow.
- Run `cargo audit` before shipping (release milestones, not every commit).

## TypeScript deltas

- The fuzzy matcher and ranking are the highest-value test targets in the repo — exhaustive
  Vitest coverage, property-style cases welcome (`saf`→Safari, `ps`→Photoshop ordering, etc.).
- No UI animation on the hot path (keystroke → results). Perf budgets in CLAUDE.md are
  requirements.

## Performance instrumentation

- Changes touching summon, matching, or launch paths must not regress the budgets in CLAUDE.md.
  Measure before claiming; record numbers in the plan file or JOURNAL.
