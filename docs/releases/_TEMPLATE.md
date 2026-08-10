<!-- Copy to vX.Y.Z.md. The release script REFUSES to run without this file: writing the
     notes is the one human step, done before releasing, not after. Keep the sections;
     "none" is a valid entry. -->

## Breaking changes

- none

## Highlights

- <what this version _is_, in one or two human sentences per feature — show, don't list;
  screenshots/GIFs for visual features>

## Performance receipts

| Metric                         | Budget   | This release |
| ------------------------------ | -------- | ------------ |
| Hotkey → panel visible         | < 100 ms | _ ms         |
| Cold start → hotkey registered | < 1 s    | _ ms         |
| Idle memory (panel hidden)     | < 120 MB | _ MB         |

## Install

```sh
brew install mitchmalone/launcharr/launcharr
```

Or grab the dmg / zip below, or build from source (README).

## All changes

<!-- git log --oneline vPREV..HEAD — pasted by hand or via `scripts/release.sh --log` -->
