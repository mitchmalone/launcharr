import { describe, expect, it } from 'vitest'

import {
  CORNER_RADIUS_KEY,
  CORNER_RADIUS_MAX,
  CORNER_RADIUS_MIN,
  DEFAULT_DESKTOP,
  type DesktopConfig,
  GENERATED_HEADER,
  bordersArgs,
  clampCornerRadius,
  cornerRadiusArgs,
  cssToBordersColor,
  isManagedToml,
  normalizeDesktop,
  renderAerospaceToml,
} from './desktop'

const COLORS = { accent: '#ff6b8c', dim: '#73747c', bg: '#1c1d2a' }

function desktop(over: Partial<DesktopConfig> = {}): DesktopConfig {
  return { ...DEFAULT_DESKTOP, ...over }
}

describe('renderAerospaceToml', () => {
  const toml = renderAerospaceToml(desktop(), { barHeight: 32 })

  it('starts with the generated header so we can recognise our own file', () => {
    expect(toml.startsWith(GENERATED_HEADER)).toBe(true)
    expect(isManagedToml(toml)).toBe(true)
    expect(isManagedToml('# hand written\nconfig-version = 2\n')).toBe(false)
  })

  it('carries the fixed opinion: config-version, tiles, normalization, no start-at-login override', () => {
    expect(toml).toContain('config-version = 2')
    expect(toml).toContain('start-at-login = true')
    expect(toml).toContain("default-root-container-layout = 'tiles'")
    expect(toml).toContain('enable-normalization-flatten-containers = true')
    expect(toml).toContain('accordion-padding = 28')
    expect(toml).not.toContain('sketchybar')
    expect(toml).not.toContain('after-startup-command')
  })

  it('touches the launcharr trigger file on workspace change', () => {
    expect(toml).toContain('exec-on-workspace-change')
    expect(toml).toContain('$HOME/.config/launcharr/triggers/workspace')
  })

  it('renders gaps, with the bar height added to the outer top on external monitors', () => {
    expect(toml).toContain('inner.horizontal = 8')
    expect(toml).toContain('outer.left = 8')
    expect(toml).toContain('outer.top = [{ monitor."built-in.*" = 8 }, 40]')
    const noBar = renderAerospaceToml(desktop(), { barHeight: 0 })
    expect(noBar).toContain('outer.top = [{ monitor."built-in.*" = 8 }, 8]')
    const wide = renderAerospaceToml(
      desktop({ tiling: { ...DEFAULT_DESKTOP.tiling, gaps: 12 } }),
    )
    expect(wide).toContain('inner.vertical = 12')
    expect(wide).toContain('outer.bottom = 12')
  })

  it('persists exactly N workspaces but always binds keys 1–9', () => {
    expect(toml).toContain(
      "persistent-workspaces = ['1', '2', '3', '4', '5', '6']",
    )
    expect(toml).toContain("alt-6 = 'workspace 6'")
    expect(toml).toContain("alt-9 = 'workspace 9'")
    expect(toml).toContain(
      "alt-shift-9 = ['move-node-to-workspace 9', 'workspace 9']",
    )
    const three = renderAerospaceToml(
      desktop({ tiling: { ...DEFAULT_DESKTOP.tiling, workspaces: 3 } }),
    )
    expect(three).toContain("persistent-workspaces = ['1', '2', '3']")
    expect(three).toContain("alt-4 = 'workspace 4'")
  })

  it('clamps persistent workspaces to 1..9', () => {
    const many = renderAerospaceToml(
      desktop({ tiling: { ...DEFAULT_DESKTOP.tiling, workspaces: 40 } }),
    )
    expect(many).toContain(
      "persistent-workspaces = ['1', '2', '3', '4', '5', '6', '7', '8', '9']",
    )
    expect(many).not.toContain('workspace 10')
    const none = renderAerospaceToml(
      desktop({ tiling: { ...DEFAULT_DESKTOP.tiling, workspaces: 0 } }),
    )
    expect(none).toContain("persistent-workspaces = ['1']")
  })

  it('swaps the modifier on every main-mode binding but leaves mode keys alone', () => {
    const ctrlAlt = renderAerospaceToml(
      desktop({ tiling: { ...DEFAULT_DESKTOP.tiling, modifier: 'ctrl-alt' } }),
    )
    expect(ctrlAlt).toContain("ctrl-alt-h = 'focus left'")
    expect(ctrlAlt).toContain("ctrl-alt-shift-h = 'move left'")
    expect(ctrlAlt).toContain("ctrl-alt-1 = 'workspace 1'")
    expect(ctrlAlt).toContain("ctrl-alt-f = 'fullscreen'")
    expect(ctrlAlt).toContain("ctrl-alt-r = 'mode resize'")
    expect(ctrlAlt).not.toMatch(/^alt-h/m)
    // Resize/service modes are single keys — untouched.
    expect(ctrlAlt).toContain("h = 'resize width -50'")
    expect(ctrlAlt).toContain("esc = 'mode main'")
  })

  it('keeps ctrl-arrow workspace cycling and back-and-forth regardless of modifier', () => {
    expect(toml).toContain("ctrl-left = 'workspace --wrap-around prev'")
    expect(toml).toContain("alt-tab = 'workspace-back-and-forth'")
  })

  it('renders one on-window-detected float rule per bundle id, plus the Finder dialog rule', () => {
    expect(toml).toContain(
      "if.app-id = 'com.apple.systempreferences'\nrun = 'layout floating'",
    )
    expect(toml).toContain("if.app-id = 'com.raycast.macos'")
    expect(toml).toContain(
      "if.app-id = 'com.apple.finder'\nif.window-title-regex-substring = 'Copy|Move|Info|Preferences'",
    )
    const none = renderAerospaceToml(
      desktop({ tiling: { ...DEFAULT_DESKTOP.tiling, float: [] } }),
    )
    expect(none).not.toContain('com.raycast.macos')
    expect(none).toContain('com.apple.finder') // the dialog rule is opinion, not a user rule
  })

  it('refuses bundle ids that could break out of the TOML string', () => {
    const evil = renderAerospaceToml(
      desktop({
        tiling: { ...DEFAULT_DESKTOP.tiling, float: ["a'b", 'ok.app', ' '] },
      }),
    )
    expect(evil).not.toContain("a'b")
    expect(evil).toContain("if.app-id = 'ok.app'")
  })

  it('is deterministic', () => {
    expect(renderAerospaceToml(desktop(), { barHeight: 32 })).toBe(toml)
  })
})

describe('bordersArgs', () => {
  it('renders JankyBorders flags from theme colours', () => {
    expect(bordersArgs(desktop(), COLORS)).toEqual([
      'active_color=0xffff6b8c',
      'inactive_color=0x8073747c',
      'background_color=0x301c1d2a',
      'width=5',
      'hidpi=on',
      'style=round',
    ])
  })
  it('honours width and style', () => {
    const args = bordersArgs(
      desktop({ borders: { enabled: true, width: 2.5, style: 'square' } }),
      COLORS,
    )
    expect(args).toContain('width=2.5')
    expect(args).toContain('style=square')
  })
  it('clamps width to a sane range', () => {
    expect(
      bordersArgs(
        desktop({ borders: { enabled: true, width: 99, style: 'round' } }),
        COLORS,
      ),
    ).toContain('width=20')
    expect(
      bordersArgs(
        desktop({ borders: { enabled: true, width: -1, style: 'round' } }),
        COLORS,
      ),
    ).toContain('width=1')
  })
})

describe('cssToBordersColor', () => {
  it('converts #rrggbb, #rgb, #rrggbbaa and rgba() to 0xAARRGGBB', () => {
    expect(cssToBordersColor('#ff6b8c')).toBe('0xffff6b8c')
    expect(cssToBordersColor('#F6C')).toBe('0xffff66cc')
    expect(cssToBordersColor('#ff6b8c80')).toBe('0x80ff6b8c')
    expect(cssToBordersColor('rgba(28, 29, 42, 0.96)')).toBe('0xf51c1d2a')
    expect(cssToBordersColor('rgb(0,0,0)')).toBe('0xff000000')
  })
  it('accepts an alpha override', () => {
    expect(cssToBordersColor('#ff6b8c', 0.5)).toBe('0x80ff6b8c')
  })
  it('falls back to opaque white for garbage', () => {
    expect(cssToBordersColor('nope')).toBe('0xffffffff')
  })
})

describe('corner radius', () => {
  it('clamps to 1..26 — 0 is read by AppKit as unset', () => {
    expect(CORNER_RADIUS_MIN).toBe(1)
    expect(CORNER_RADIUS_MAX).toBe(26)
    expect(clampCornerRadius(0)).toBe(1)
    expect(clampCornerRadius(-5)).toBe(1)
    expect(clampCornerRadius(100)).toBe(26)
    expect(clampCornerRadius(10.7)).toBe(11)
    expect(clampCornerRadius(Number.NaN)).toBe(CORNER_RADIUS_MAX)
  })
  it('renders defaults(1) arguments: write for a number, delete for null', () => {
    expect(cornerRadiusArgs(10)).toEqual([
      'write',
      '-g',
      CORNER_RADIUS_KEY,
      '-float',
      '10',
    ])
    expect(cornerRadiusArgs(0)).toEqual([
      'write',
      '-g',
      CORNER_RADIUS_KEY,
      '-float',
      '1',
    ])
    expect(cornerRadiusArgs(null)).toEqual(['delete', '-g', CORNER_RADIUS_KEY])
    expect(CORNER_RADIUS_KEY).toBe('NSConvolutionOverride1')
  })
})

describe('normalizeDesktop', () => {
  it('fills a missing/partial section with defaults', () => {
    expect(normalizeDesktop(undefined)).toEqual(DEFAULT_DESKTOP)
    expect(normalizeDesktop({ tiling: { gaps: 4 } })).toEqual({
      ...DEFAULT_DESKTOP,
      tiling: { ...DEFAULT_DESKTOP.tiling, gaps: 4 },
    })
    expect(normalizeDesktop({ cornerRadius: 12 }).cornerRadius).toBe(12)
  })
  it('rejects unknown modifiers and non-numeric knobs', () => {
    const d = normalizeDesktop({
      tiling: { modifier: 'hyper', gaps: 'lots' },
      cornerRadius: 'x',
    })
    expect(d.tiling.modifier).toBe('alt')
    expect(d.tiling.gaps).toBe(8)
    expect(d.cornerRadius).toBeNull()
  })
})
