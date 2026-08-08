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

export type Link = {
  name: string;
  url: string;
  /** Optional trigger word: with a {query} placeholder this becomes a Raycast-style quicklink. */
  trigger?: string | null;
};

export type Config = {
  hotkey: string;
  terminal: 'iTerm2' | 'Terminal';
  bangNewWindow: boolean;
  sigil: string;
  bangSigil: string;
  launchAtLogin: boolean;
  links: Link[];
  shortcuts: Record<string, string>;
  /** Alfred-style dead-end fallback, {query} placeholder. */
  searchFallback: string;
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
