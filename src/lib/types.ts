export type ItemKind = 'app' | 'settings' | 'launcharr' | 'link';

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
  launchAtLogin: boolean;
};

export type FrecencyMap = Record<string, number>;

export type ScriptInfo = {
  trigger: string;
  name: string;
  description: string;
  path: string;
};

export type ScriptAction =
  | { type: 'copy'; value: string }
  | { type: 'open'; value: string }
  | { type: 'none' };

export type ScriptItem = {
  title: string;
  subtitle: string;
  action: ScriptAction;
};

export type Clip = {
  id: number;
  content: string;
  ts: number;
};
