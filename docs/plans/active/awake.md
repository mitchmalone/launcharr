---
title: awake — keep-alive sessions
status: active # planned | active | done — only the slice actually in flight is `active`
created: 2026-08-16
updated: 2026-08-17
links:
  - ../done/battery-hover-card.md # battery readings + hover card this reuses
  - ../done/agent-monitoring.md # agent state that drives the "while agents work" trigger
  - ../done/panel-framework-and-wifi.md # panel + keyboard idiom
  - ../../AGENTS.md # invariant 1 (zero granted permissions)
---

# awake — keep-alive sessions

## Goal

Retire Amphetamine and Caffeinated into launcharr: `awake ⏎` opens one panel where you
arrow down a short list of plain-English options, pick what stays on and what ends the
session, and hit ⏎. Everything ships with **zero granted permissions** except one
opt-in, off-by-default case (lid closed on battery) that is deliberately deferred.

The reason to build it here rather than keep two menubar apps: launcharr already knows
what the agents are doing. A keep-awake session that **follows the work** — up while
agents run, released when they're all idle — is something neither app can express, and
it's the case that actually matters for an agent-first machine.

## Context

- **The core API is free.** `IOPMAssertionCreateWithName` needs no entitlement and no TCC
  prompt. `/usr/bin/caffeinate` is a thin wrapper around it. Holding assertions in-process
  (rather than spawning `caffeinate`) gives us named assertions visible in
  `pmset -g assertions`, introspection, and clean release on quit.
- **Every trigger we want is already a permission-free reading**, and most already exist in
  the repo: `battery.rs` (AC / percent), `wifi.rs` (SSID without Location Services),
  `agents.rs` (agent state), NSWorkspace (running apps), CGDisplay (external display),
  `iostat`/`netstat -ib`/`ps` (busy detection).
- **Existing footgun to remove.** `system_commands.rs` ships `caffeinate` (`caffeinate -d -t
3600`, fire-and-forget) and `decaffeinate` (`pkill -x caffeinate`). The `pkill` kills
  _every_ caffeinate on the machine, including ones held by build scripts or agent
  sessions. Both entries get replaced by this feature.
- **The one hard gap.** Lid closed **on battery**. macOS ignores `PreventSystemSleep` off
  AC by policy (documented in `man caffeinate`), and lid-close sleep is a different
  mechanism from idle sleep, so no assertion of any type overrides it. The only override is
  `pmset -b disablesleep 1`, which is root. That's a privileged helper, not a permission —
  there is nothing to consent to. **On AC, lid closed is free** and ships in slice A.
- Amphetamine solves this with a _second app_ (Enhancer) only because App Store sandboxing
  forbids it from installing a privileged helper. launcharr ships as a signed cask, so the
  helper can live inside the bundle and register via `SMAppService` — one app, one download,
  one admin prompt, and only if the user asks for it.

## Approach

Four shipping slices plus one deferred. The assertion layer is small and boring Rust; the
session/trigger model and every word of copy is TypeScript.

**The copy is the feature.** Amphetamine's surface is capable and near-unreadable — you arm
a trigger and can't tell what it will actually do or when it will let go. Three rules govern
every string in this panel:

1. **Say what the user will observe, never what we hold.** No "assertion", no "idle sleep",
   no API names anywhere in the UI. "Your Mac keeps working. The screen still turns off."
2. **Every option states how it ends.** The commonest Amphetamine failure is a session you
   can't predict the end of. Each end-condition row spells out its release in the same
   breath as its start.
3. **State the limitation inline, at the option it limits.** Not in a docs page, not in a
   tooltip. If macOS won't obey on battery, the row that depends on it says so where you
   read it.

### The panel

`awake ⏎` (aliases: `caffeine`, `caffeinate`, `keep awake`, `stay awake` — the deleted
system-command slugs' aliases must resolve here so muscle memory lands; **not** `sleep`,
which a user types to sleep the Mac now, the opposite of this panel). It's a form you run
top to bottom: ↑↓ move, ←→ change the value on the selected row, space toggles, ⏎ arms (or
disarms), Esc closes. Arming from a fresh open with pure defaults is `awake ⏎ ⏎`.

```
AWAKE                                        sleeping normally

  WHAT STAYS ON
  ● Mac stays awake, screen can sleep
    Work keeps running. The screen turns off as usual and locks if you've set it to.
  ○ Mac and screen both stay on
    Nothing turns off. For dashboards, presentations, or watching a long run.
  ☐ Also keep connected drives spinning
    Stops external disks parking mid-copy. No effect on internal storage.

  UNTIL
  ○ I turn it off
  ○ For 2 hours              ←→ 15m · 30m · 1h · 2h · 4h · 8h
  ○ 6:00 pm                  ←→ adjust
  ● While agents are working
    Releases about a minute after the last agent goes idle. An agent waiting on you
    still counts as working; a finished agent doesn't.
  ○ While Ghostty is running  ←→ pick app
  ○ While plugged in
  ○ While on <SSID>
  ○ While an external display is attached
  ○ While the Mac is busy
    Watches processor, disk and network. Releases after 5 quiet minutes.

  RAILS
  ☑ Release if the battery drops below 20%
    Protects an unattended Mac. It sleeps normally once it hits the floor.
  ☐ Stay awake with the lid closed on battery                        needs helper
    macOS always sleeps on lid-close off AC. Overriding it installs a small helper
    (one admin password). launcharr removes the override when it stops running.
    Plugged in, lid closed already works — no helper needed.

  ALSO KEEPING THIS MAC AWAKE
  Terminal                                                     4h 12m
  Music                                                          22m

  ↑↓ move   ←→ adjust   space toggle   ⏎ start   esc close
```

Armed, the header becomes the state and its end (`awake — 42m · until agents idle`), and ⏎
releases. `awake off` and the bar cell both release too.

### The grammar

`awake` alone opens the panel. `awake 2h`, `awake until 6pm`, `awake while agents`,
`awake off` arm directly without it — the panel is for choosing, the grammar for repeating.
`while agents` is the agents trigger; `while <name>` otherwise matches a running app —
agents win the tie so `awake while claude` never silently binds to an app.

### The bar

A cell next to battery: dim when sleeping normally, lit when armed. Hover card shows what's
held, what ends it, elapsed and remaining, plus the same "also keeping this Mac awake"
list — reusing `src/bar/hover.ts` and the battery card's shape.

## Steps

### Slice A — the assertion core

- [ ] **Measure first**: `PreventSystemSleep` held on AC, lid closed, confirm the machine
      stays up on current macOS/Apple Silicon — it's an acceptance criterion resting on
      documented-but-unverified behaviour, same category as slice E's measurement.
      _Code shipped; needs a human to close the lid: arm via `awake ⏎` once slice B
      lands (or `pmset -g assertions` while a test holds), lid closed, plugged in._
- [x] `power.rs`: small `unsafe` module over IOKit (`IOPMAssertionCreateWithName` /
      `IOPMAssertionRelease`), safety comment per block, assertions named `launcharr`.
      Types: system-awake, display-awake, disk-awake, and system-awake-on-AC (the one that
      covers lid-closed while plugged in).
- [x] Owned handle type so assertions release on drop, on quit, and on panel-driven
      disarm. Never spawn `caffeinate`.
- [x] `pmset -g assertions` parse → "also keeping this Mac awake" list (plain function over
      captured output, unit-tested like `battery.rs`). Fetched on panel open / hover-card
      open only — never on the bar tick. _Verified against this Mac's live output — it
      lists Amphetamine's 81-hour hold, `>24h` hours field included._
- [x] Delete the `caffeinate` / `decaffeinate` entries from `system_commands.rs`; the
      `pkill -x caffeinate` behaviour goes with them.
- [x] Tauri commands: `awake_arm`, `awake_release`, `awake_status`. Thin; logic in plain
      functions. Record the additions in `docs/DECISIONS.md` per the tiny-IPC rule.
      _Done — DECISIONS 2026-08-16 "awake: in-process power assertions"._

### Slice B — the panel

- [x] `AwakePanel.tsx` + container + stories (incl. sleeping / armed / helper-not-installed
      / battery-floor-tripped states), registered in `panels/registry.ts`.
- [x] Keyboard model above; arming from defaults is two keystrokes. _Deviations, on
      purpose: the agents row hides when agent monitoring is off (an option that can
      never release is a lie), the SSID row hides when there is no SSID, and the default
      end is "while agents are working" only when an agent is actually working at open —
      else "until I turn it off"._
- [x] **Copy pass against the three rules**, reviewed as its own step, not as a byproduct.
      _All strings live in `@launcharr/core/awake` (untilLabel/endsLabel/holdLabel) so the
      panel, grammar rows and bar card can't drift apart._
- [x] `awake` grammar forms in `packages/core` (`awake 2h/45m/until 6pm/while agents/
while <app>/off`); `caffeine`/`caffeinate`/`keep-awake` are fuzzy aliases of the
      panel item.

### Slice C — triggers

- [x] Trigger model in `packages/core`: a pure reducer `(reading, prev) -> next` (hysteresis
      needs the previous state), exhaustively tested. No I/O.
- [x] Agent trigger state mapping: `working` and `attention`/blocked hold; `idle` **and
      `done` (unread)** release — a finished agent is finished work, and holding on
      done-unread recreates the Amphetamine all-night failure. Stale-session pruning in
      `agents.rs` means dead hooks decay to release for free.
- [x] Sources wired via one `awake_readings` command; the bar window evaluates on each
      Rust-pushed snapshot only while a conditional session is armed (zero idle cost);
      launcher window is the 10 s fallback when the bar is off (DECISIONS 2026-08-16).
- [x] Busy trigger: CPU via libc `getloadavg` (in-process), network via `netstat -ib`
      behind a 30 s cache paid only while a busy session is armed. **Disk dropped** — no
      cheap permission-free cumulative counter; the copy says "processor and network".
- [x] Hysteresis on every trigger (60 s agents/wifi, 10–15 s app/power/display, 5 min
      busy); missing readings fail toward holding.
- [x] Battery floor rail — enforced in Rust's watchdog with the deadline, so both fire
      with every webview asleep; the panel shows why a session ended (`released` reason).

### Slice D — the bar cell

- [x] Cell + hover card (`BarAwakeCell`/`BarAwakeCard` in `packages/tui`, invariant 10),
      zone-board entry, `bar.enabled` respecting. Coffee glyph: dim asleep, accent armed;
      click releases; card shows hold/ends/elapsed + the others list (pmset on card-open
      only).

### Slice E — lid closed on battery (deferred, own milestone)

- [ ] **Measure first**: `sudo pmset -b disablesleep 1`, lid closed on battery, confirm the
      machine survives. If it doesn't hold on current macOS, drop the slice entirely.
- [ ] Helper bundled in the .app, registered via `SMAppService` on first toggle only.
- [ ] **Watchdog is mandatory**: heartbeat from launcharr; helper reverts `disablesleep` on
      silence, crash, or quit. `disablesleep` is persistent global state — a crash while set
      leaves a Mac that never sleeps again.
- [ ] Invariant 1 carve-out written into `docs/DECISIONS.md` before any code, same shape as
      the invariant 2 amendment for usage limits: opt-in, off by default, user-initiated.

## Acceptance criteria

- [x] `pnpm verify` green.
- [x] Arming from a fresh `awake ⏎` takes one further keystroke with defaults (⏎ opens,
      ⏎ arms — the form's Enter always starts).
- [x] Every option's label and description says what the user observes and how it ends; no
      API vocabulary survives in the UI. Verified by reading the panel cold.
- [ ] A session armed on "while agents are working" holds through a real agent run and
      releases within ~1 min of the last agent going idle. _Needs a real run — Mitch._
- [ ] `pmset -g assertions` shows launcharr's assertions by name while armed, and nothing
      after release/quit/crash. _Verify live after first real arm._
- [x] No other process's `caffeinate` is ever killed.
- [x] Trigger evaluation costs no new spawn per bar tick; budgets unregressed (idle bar
      pays only the in-memory `awake` field on the existing snapshot).
- [ ] Lid closed **on AC** keeps the machine up with no helper and no prompt.
- [ ] With slice E unshipped, the lid-on-battery row is visible, off, and explains itself.

## Out of scope

- **Input simulation / mouse jiggling.** Needs Accessibility (invariant 1 forbids it), and
  it doesn't do what people want it for anyway — power assertions never make a chat app
  think you're at your desk. Explicit non-goal, not a backlog item.
- Session-start notifications — UserNotifications is a consent prompt; the bar is the
  surface.
- "While a file is downloading" — needs Files-and-Folders TCC. The busy trigger covers it.
- Waking a sleeping Mac, scheduled wake, or anything writing `pmset repeat`.

## Risks / open questions

- **Assertions die with the process.** If launcharr crashes mid-agent-run the Mac sleeps.
  Amphetamine has the identical property, so it's parity rather than regression — but the
  bar cell should make "armed" unmissable so a silent loss is noticed.
- **Does a blocked agent count as working?** Drafted as yes (it's waiting on _you_, and
  sleeping the Mac loses the session). Wrong answer means the Mac stays up all night when an
  agent stalls overnight — the battery rail is the backstop. Wants a real-use verdict before
  it hardens.
- **Does `disablesleep` still work on current macOS / Apple Silicon?** Unverified. Slice E's
  first step is the measurement, and a negative result kills the slice — no helper gets
  built on an assumption.
- Naming: `awake` vs `caffeine`. `awake` reads better in the grammar (`awake until 6pm`) and
  isn't borrowed from another app; `caffeine`/`caffeinate` stay as aliases.
- The "also keeping this Mac awake" list is the one genuinely novel read here — worth
  checking whether `pmset -g assertions` output is stable enough across macOS versions to
  parse fail-soft (it should degrade to an empty list, never an error).
