# DECISIONS

> Append-only log of decisions with reasoning so choices aren't relitigated. Dated entries,
> **newest at the top.** Lightweight ADR format. The standing stack lives in `CLAUDE.md`.

---

### 2026-08-08 · v1.1: scripts-first Sol parity; invariants hold; three features deferred

- **Decision.** Sol feature-matching lands as v1.1 by pulling the v2 script protocol forward:
  bundled, user-editable scripts (lorem, JSON-format, local IP) + built-ins only where scripts
  can't reach (inline math on the hot path, clipboard watcher, custom links/shortcuts from
  config). **Zero-network and zero-permissions stand** (Mitch, 2026-08-08): Google Translate,
  public IP, and Calendar (EventKit consent) are deferred, not built; clipboard is
  copy-on-Enter only — auto-paste would need Accessibility, which stays banned.
- **Why scripts-first.** Hackability is the differentiator; every feature built as a script is
  both a feature and living documentation of the plugin surface. Built-ins would Raycast-ify
  the codebase and make the v2 protocol a second-class retrofit.
- **Deferred triggers.** Translate/public-IP: if zero-network is ever relaxed, as opt-in
  config. Calendar: if the permission stance softens to "consent-gated, Accessibility still
  banned."

### 2026-08-08 · Repo conventions: pnpm + Lefthook (and a global AGENTS.md change)

- **Decision.** launcharr uses pnpm and Lefthook (pre-commit format/lint on staged files,
  commit-msg commitlint, pre-push tests incl. `cargo test`). This settled PRD open question
  §11.4 and updated the _global_ AGENTS.md at the same time — npm→pnpm and Husky→Lefthook are
  now the standard everywhere, matching emberstash in practice.
- **Why.** The global file said npm+Husky while real projects had moved to pnpm+lefthook; docs
  that disagree with practice are worse than either choice. pnpm's speed/strictness and
  Lefthook's single-binary, YAML-config model won on merits and on incumbency.

### 2026-08-08 · Docs system: adopt the emberstash structure wholesale

- **Decision.** `CLAUDE.md` (stable rules) + `docs/` (STATUS/ROADMAP/JOURNAL/DECISIONS/plans
  with `_TEMPLATE.md → active/ → done/`), docs shipping in the same commit as code. Plus the
  globally-required `AGENTS.md` (project deltas, incl. Rust standards) and `LEARNINGS.md`.
- **Why.** Proven on emberstash; session continuity for agent-driven development depends on it.
  JOURNAL/LEARNINGS overlap resolved by role: JOURNAL is the dated raw log, LEARNINGS the
  pruned per-topic reference — single source of truth per fact, promote don't duplicate.

### 2026-08-08 · Stack: Tauri 2 + tauri-nspanel + TS/React UI, matching in TypeScript

- **Decision.** Tauri 2 (Rust) shell with the community tauri-nspanel plugin for the
  non-activating floating panel; React/TS in the system WKWebView for all UI; fuzzy matching
  and frecency ranking in pure TypeScript in the frontend; Rust owns indexing, FSEvents, icon
  cache, launch, and the AppleScript hand-off; SQLite via rusqlite. (PRD §6.)
- **Why.** The panel/focus problem is the hard native part and tauri-nspanel exists precisely
  for it (Sol/SuperCmd as references). TS matching keeps the product-opinion layer hackable —
  the long-term differentiator — and the index is a few hundred items, so Rust-speed matching
  is premature. The architecture isolates the matcher so it _can_ move to Rust if the 16 ms
  keystroke budget fails (risk R2).
- **Alternatives.** Pure AppKit/Swift (fastest, least hackable, slowest to build); Electron
  (weight budget dead on arrival). Revisit only if M0's exit criterion fails.

### 2026-08-08 · System Settings panes: static curated table, not enumeration

- **Decision.** A versioned, hand-curated table of pane names → `x-apple.systempreferences:`
  deep-link IDs for the current macOS version. (PRD §5.1, risk R4.)
- **Why.** Programmatic enumeration of panes is unreliable and the IDs are undocumented. A
  broken pane link is low-severity; a curated table is greppable and fixable in one line.
