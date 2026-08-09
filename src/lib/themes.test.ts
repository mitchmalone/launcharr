import { describe, expect, it } from 'vitest';
import {
  BUILTIN_THEMES,
  isLightColor,
  resolveTheme,
  themeNames,
  themeVars,
} from './themes';

describe('resolveTheme', () => {
  it('returns a built-in by name', () => {
    expect(resolveTheme('dracula', {})).toEqual(BUILTIN_THEMES.dracula);
    expect(resolveTheme('terminal', {})).toEqual(BUILTIN_THEMES.terminal);
  });

  it('falls back to the launcharr theme for unknown names', () => {
    expect(resolveTheme('nope', {})).toEqual(BUILTIN_THEMES.launcharr);
    expect(resolveTheme('', undefined)).toEqual(BUILTIN_THEMES.launcharr);
  });

  it('custom themes overlay the launcharr defaults', () => {
    const custom = resolveTheme('mine', { mine: { accent: '#ff0000' } });
    expect(custom.accent).toBe('#ff0000');
    expect(custom.bg).toBe(BUILTIN_THEMES.launcharr.bg);
  });

  it('a custom entry named after a built-in overlays that built-in', () => {
    const tweaked = resolveTheme('dracula', { dracula: { sigil: '#ffffff' } });
    expect(tweaked.sigil).toBe('#ffffff');
    expect(tweaked.bg).toBe(BUILTIN_THEMES.dracula.bg);
  });
});

describe('themeNames', () => {
  it('lists built-ins first, then customs, deduped', () => {
    const builtins = Object.keys(BUILTIN_THEMES);
    expect(themeNames({ zebra: {}, dracula: {} })).toEqual([
      ...builtins,
      'zebra',
    ]);
    expect(themeNames(undefined)).toEqual(builtins);
  });

  it('ships the full built-in roster', () => {
    for (const name of [
      'launcharr',
      'dracula',
      'terminal',
      'amber',
      'catppuccin',
      'gruvbox',
      'monokai',
      'nord',
      'one-dark',
      'rose-pine',
      'solarized',
      'solarized-light',
      'synthwave',
      'tokyo-night',
    ]) {
      expect(BUILTIN_THEMES[name], name).toBeDefined();
    }
  });
});

describe('isLightColor', () => {
  it('classifies the light and dark solarized grounds', () => {
    expect(isLightColor(BUILTIN_THEMES['solarized-light'].bg)).toBe(true);
    expect(isLightColor(BUILTIN_THEMES.solarized.bg)).toBe(false);
    expect(isLightColor('#fff')).toBe(true);
    expect(isLightColor('rgba(0,0,0,0.9)')).toBe(false);
  });
});

describe('themeVars', () => {
  it('maps panel vars with the translucent glass background', () => {
    const vars = themeVars(BUILTIN_THEMES.launcharr, 'panel');
    expect(vars['--bg']).toBe(BUILTIN_THEMES.launcharr.glass);
    expect(vars['--sigil']).toBe(BUILTIN_THEMES.launcharr.sigil);
    expect(vars['--selected']).toBe(BUILTIN_THEMES.launcharr.selected);
  });

  it('maps settings vars with the opaque background and surface', () => {
    const vars = themeVars(BUILTIN_THEMES.dracula, 'settings');
    expect(vars['--bg']).toBe(BUILTIN_THEMES.dracula.bg);
    expect(vars['--panel']).toBe(BUILTIN_THEMES.dracula.surface);
    expect(vars['--danger']).toBe(BUILTIN_THEMES.dracula.danger);
  });

  it('renders the checkmark glyph in the theme fg', () => {
    const vars = themeVars(BUILTIN_THEMES['solarized-light'], 'settings');
    expect(vars['--check']).toContain(
      encodeURIComponent(BUILTIN_THEMES['solarized-light'].fg)
    );
  });
});
