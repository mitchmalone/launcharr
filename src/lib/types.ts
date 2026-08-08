export type ItemKind = 'app' | 'settings' | 'launcharr';

export type IndexItem = {
  id: string;
  name: string;
  kind: ItemKind;
  path: string;
  hint: string;
  icon: string | null;
  aliases: string[];
};

export type Config = {
  hotkey: string;
  terminal: 'iTerm2' | 'Terminal';
  bangNewWindow: boolean;
  sigil: string;
  bangSigil: string;
};

export type FrecencyMap = Record<string, number>;
