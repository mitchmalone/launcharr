import { describe, expect, it } from 'vitest';
import { acceleratorFromEvent, prettyAccelerator } from './accelerator';

// Minimal stand-in for the KeyboardEvent fields the formatter reads.
const ev = (
  code: string,
  mods: Partial<Record<'meta' | 'ctrl' | 'alt' | 'shift', boolean>> = {}
) => ({
  code,
  metaKey: mods.meta ?? false,
  ctrlKey: mods.ctrl ?? false,
  altKey: mods.alt ?? false,
  shiftKey: mods.shift ?? false,
});

describe('acceleratorFromEvent', () => {
  it('formats letter keys with Cmd', () => {
    expect(acceleratorFromEvent(ev('KeyS', { meta: true }))).toBe('Cmd+S');
  });

  it('orders modifiers Ctrl, Alt, Shift, Cmd', () => {
    expect(
      acceleratorFromEvent(
        ev('KeyA', { meta: true, ctrl: true, alt: true, shift: true })
      )
    ).toBe('Ctrl+Alt+Shift+Cmd+A');
  });

  it('formats Space and digits', () => {
    expect(acceleratorFromEvent(ev('Space', { alt: true }))).toBe('Alt+Space');
    expect(acceleratorFromEvent(ev('Digit3', { meta: true }))).toBe('Cmd+3');
  });

  it('shortens arrow keys', () => {
    expect(acceleratorFromEvent(ev('ArrowUp', { meta: true }))).toBe('Cmd+Up');
    expect(acceleratorFromEvent(ev('ArrowLeft', { ctrl: true }))).toBe(
      'Ctrl+Left'
    );
  });

  it('passes punctuation and nav codes through', () => {
    expect(acceleratorFromEvent(ev('Comma', { meta: true }))).toBe('Cmd+Comma');
    expect(acceleratorFromEvent(ev('PageDown', { meta: true }))).toBe(
      'Cmd+PageDown'
    );
  });

  it('allows F-keys without any modifier', () => {
    expect(acceleratorFromEvent(ev('F5'))).toBe('F5');
    expect(acceleratorFromEvent(ev('F12', { shift: true }))).toBe('Shift+F12');
  });

  it('rejects a bare key or shift-only chord (not a usable global hotkey)', () => {
    expect(acceleratorFromEvent(ev('KeyS'))).toBeNull();
    expect(acceleratorFromEvent(ev('KeyS', { shift: true }))).toBeNull();
  });

  it('rejects modifier-only presses (still held, nothing chosen yet)', () => {
    expect(acceleratorFromEvent(ev('MetaLeft', { meta: true }))).toBeNull();
    expect(acceleratorFromEvent(ev('ShiftRight', { shift: true }))).toBeNull();
  });

  it('rejects keys the recorder reserves or the parser cannot express', () => {
    expect(acceleratorFromEvent(ev('Escape', { meta: true }))).toBeNull();
    expect(acceleratorFromEvent(ev('Backspace', { meta: true }))).toBeNull();
    expect(
      acceleratorFromEvent(ev('IntlBackslash', { meta: true }))
    ).toBeNull();
  });
});

describe('prettyAccelerator', () => {
  it('renders mac modifier glyphs in conventional order', () => {
    expect(prettyAccelerator('Cmd+Shift+S')).toBe('⇧⌘S');
    expect(prettyAccelerator('Ctrl+Alt+Space')).toBe('⌃⌥Space');
    expect(prettyAccelerator('Alt+Space')).toBe('⌥Space');
  });

  it('normalizes alias spellings', () => {
    expect(prettyAccelerator('CommandOrControl+K')).toBe('⌘K');
    expect(prettyAccelerator('option+super+p')).toBe('⌥⌘P');
  });

  it('renders arrows as glyphs', () => {
    expect(prettyAccelerator('Cmd+Up')).toBe('⌘↑');
  });

  it('passes unknown strings through untouched', () => {
    expect(prettyAccelerator('')).toBe('');
    expect(prettyAccelerator('garbage')).toBe('garbage');
  });
});
