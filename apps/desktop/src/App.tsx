import { untilDeadline } from '@launcharr/core/awake'
import { parseInput } from '@launcharr/core/grammar'
import {
  type QuicklinkDraft,
  type Row,
  type RowEnter,
  awakeRows,
  clipRows,
  draftRows,
  emojiRows,
  launchRows,
  panelRows,
  quicklinkRows,
  scriptRows,
} from '@launcharr/core/rows'
import type {
  Clip,
  FrecencyMap,
  IndexItem,
  ScriptInfo,
  ScriptItem,
} from '@launcharr/core/types'
import '@launcharr/tui/styles.css'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { parseAskLine } from './lib/ask'
import { awakeWatchTick, freshAwakeMemory } from './lib/awake'
import {
  type Config,
  DEFAULT_AGENTS_CONFIG,
  DEFAULT_BAR_LAYOUT,
} from './lib/config'
import { applyDesktop } from './lib/desktop'
import { type Span, parseMarkdownLite } from './lib/markdown'
import { markInput, reportResultsPainted } from './lib/perf'
import { applyTheme } from './lib/themes'
import { AgentsPanelContainer } from './panels/AgentsPanelContainer'
import { AudioPanelContainer } from './panels/AudioPanelContainer'
import { AwakePanelContainer } from './panels/AwakePanelContainer'
import { ClipboardPanelContainer } from './panels/ClipboardPanelContainer'
import { DnsPanelContainer } from './panels/DnsPanelContainer'
import { HelpPanelContainer } from './panels/HelpPanelContainer'
import { UsagePanelContainer } from './panels/UsagePanelContainer'
import { WifiPanelContainer } from './panels/WifiPanelContainer'
import { PANEL_ICONS, PANEL_INFO, panelEnabled } from './panels/registry'

/** Keep in sync with the CSS: input row + result rows + container border. */
const INPUT_HEIGHT = 54
const ROW_HEIGHT = 40
const BORDER = 2
const SCRIPT_DEBOUNCE_MS = 120
/** Full-panel modes get a fixed tall window. */
const PANEL_MODE_HEIGHT = 480

/** The panel registry: trigger word → row copy + container. Adding a tenant
 * is one entry in panels/registry.ts (metadata) plus its component here. */
const PANEL_COMPONENTS: Record<string, React.FC<{ onClose: () => void }>> = {
  agents: AgentsPanelContainer,
  usage: UsagePanelContainer,
  awake: AwakePanelContainer,
  wifi: WifiPanelContainer,
  dns: DnsPanelContainer,
  audio: AudioPanelContainer,
  clipboard: ClipboardPanelContainer,
  help: HelpPanelContainer,
}

const PANELS: Record<
  string,
  { title: string; hint: string; component: React.FC<{ onClose: () => void }> }
> = Object.fromEntries(
  PANEL_INFO.flatMap((p) => {
    const component = PANEL_COMPONENTS[p.id]
    return component
      ? [[p.id, { title: p.title, hint: p.hint, component }] as const]
      : []
  }),
)

const KNOWN_BROWSERS = [
  'Safari',
  'Google Chrome',
  'Arc',
  'Firefox',
  'Brave Browser',
  'Microsoft Edge',
  'Vivaldi',
  'Opera',
  'Orion',
  'Zen Browser',
]

const DEFAULT_CONFIG: Config = {
  hotkey: 'Alt+Space',
  terminal: 'iTerm2',
  bangNewWindow: true,
  sigil: '❯',
  bangSigil: '$',
  launchAtLogin: true,
  links: [],
  shortcuts: {},
  searchFallback: 'https://www.google.com/search?q={query}',
  indexBookmarks: false,
  theme: 'launcharr',
  themes: {},
  bar: { enabled: false, layout: DEFAULT_BAR_LAYOUT },
  agents: DEFAULT_AGENTS_CONFIG,
  desktop: undefined,
}

/** Panel rows draw their lucide icon; everything else keeps its text glyph. */
function rowGlyph(row: Row): React.ReactNode {
  if (row.enter.kind === 'open-panel') {
    const Icon = PANEL_ICONS[row.enter.panel]
    if (Icon) return <Icon size={16} strokeWidth={2} aria-hidden />
  }
  return row.glyph
}

function renderSpans(spans: Span[]) {
  return spans.map((s, i) =>
    s.code ? (
      <code key={i}>{s.text}</code>
    ) : s.bold ? (
      <strong key={i}>{s.text}</strong>
    ) : s.italic ? (
      <em key={i}>{s.text}</em>
    ) : (
      <span key={i}>{s.text}</span>
    ),
  )
}

export default function App() {
  const [raw, setRaw] = useState('')
  const [selected, setSelected] = useState(0)
  const [index, setIndex] = useState<IndexItem[]>([])
  const [frecency, setFrecency] = useState<FrecencyMap>({})
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG)
  // True once the real config.json is in hand — DEFAULT_CONFIG is a placeholder
  // and must never drive the desktop layer (it would write a toml for a bar-less setup).
  const [configLoaded, setConfigLoaded] = useState(false)
  const [panelMode, setPanelMode] = useState<string | null>(null)
  useEffect(
    () => applyTheme(config.theme, config.themes, 'panel'),
    [config.theme, config.themes],
  )
  // Desktop layer (v0.4): this webview lives for the whole session, so it is the
  // one place that keeps aerospace.toml / borders / theme in step. A foreign toml
  // (someone's hand-written AeroSpace config) is never overwritten — the settings
  // window opens on the Desktop tab once per run to ask adopt-or-leave.
  const adoptPrompted = useRef(false)
  useEffect(() => {
    if (!configLoaded) return
    applyDesktop(config)
      .then((r) => {
        if (r.toml === 'foreign' && !adoptPrompted.current) {
          adoptPrompted.current = true
          invoke('open_settings', { tab: 'desktop' }).catch(console.error)
        }
      })
      .catch(console.error)
  }, [config, configLoaded])
  const [scripts, setScripts] = useState<ScriptInfo[]>([])
  const [clips, setClips] = useState<Clip[]>([])
  const [scriptItems, setScriptItems] = useState<ScriptItem[]>([])
  const [draft, setDraft] = useState<QuicklinkDraft | null>(null)
  const [altHeld, setAltHeld] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // Awake trigger fallback: the bar window is the primary watcher (it gets
  // Rust-pushed snapshots, immune to WebKit timer throttling). With the bar
  // off, this window watches instead — a slow interval is fine: every
  // release condition has a grace window far longer than one tick, and the
  // deadline/battery rails live in Rust regardless.
  const awakeMem = useRef(freshAwakeMemory())
  useEffect(() => {
    if (config.bar.enabled) return
    const id = setInterval(() => {
      awakeWatchTick(awakeMem.current).catch(console.error)
    }, 10_000)
    return () => clearInterval(id)
  }, [config.bar.enabled])

  const browsers = useMemo(
    () =>
      KNOWN_BROWSERS.filter((b) =>
        index.some((i) => i.kind === 'app' && i.name === b),
      ),
    [index],
  )

  // Trigger precedence on collision: clip (built-in) > scripts > quicklinks.
  const quicklinks = useMemo(
    () => config.links.filter((l) => l.trigger && l.url.includes('{query}')),
    [config.links],
  )
  const triggers = useMemo(
    () =>
      new Set([
        'clip',
        ...Object.keys(PANELS).filter((id) => panelEnabled(id, config)),
        ...scripts.map((s) => s.trigger),
        ...quicklinks.map((l) => l.trigger as string),
      ]),
    [scripts, quicklinks, config],
  )
  // Modes are keystroke-switched state: the prefix key (`!` `?` `:`) flips the
  // mode and is consumed — it never appears in the input. Esc (or Backspace on
  // an empty prompt) returns to launch; pasted `!cmd`-style text still parses
  // via the grammar. Agent mode is settings-gated.
  const [inputMode, setInputMode] = useState<
    'launch' | 'bang' | 'emoji' | 'ask'
  >('launch')
  const parsed = useMemo(() => {
    if (inputMode === 'bang') return { mode: 'bang' as const, command: raw }
    if (inputMode === 'emoji') return { mode: 'emoji' as const, query: raw }
    if (inputMode === 'ask') return { mode: 'ask' as const, prompt: raw }
    const p = parseInput(raw, triggers)
    return p.mode === 'ask' && !config.agents.askMode
      ? { mode: 'launch' as const, query: raw }
      : p
  }, [inputMode, raw, triggers, config])
  // Turning agent mode off in settings mid-conversation exits the mode.
  useEffect(() => {
    if (inputMode === 'ask' && !config.agents.askMode) setInputMode('launch')
  }, [inputMode, config.agents.askMode])

  // ? mode: streamed transcript, busy flag, whether a session can --continue.
  const [askText, setAskText] = useState('')
  const [askBusy, setAskBusy] = useState(false)
  const askStarted = useRef(false)
  const askGotDelta = useRef(false)
  const askSurfaceRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = askSurfaceRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [askText])

  const refetchIndex = useCallback(() => {
    invoke<IndexItem[]>('get_index').then(setIndex).catch(console.error)
  }, [])
  const refetchFrecency = useCallback(() => {
    invoke<FrecencyMap>('get_frecency').then(setFrecency).catch(console.error)
  }, [])
  const refetchScripts = useCallback(() => {
    invoke<ScriptInfo[]>('get_scripts').then(setScripts).catch(console.error)
  }, [])
  const refetchClips = useCallback(() => {
    invoke<Clip[]>('get_clips').then(setClips).catch(console.error)
  }, [])

  useEffect(() => {
    refetchIndex()
    refetchFrecency()
    refetchScripts()
    refetchClips()
    invoke<Config>('read_config')
      .then((c) => {
        setConfig(c)
        setConfigLoaded(true)
      })
      .catch(console.error)

    const unlisteners = [
      listen('panel-shown', () => {
        setRaw('')
        setSelected(0)
        setScriptItems([])
        setDraft(null)
        setPanelMode(null)
        setInputMode('launch')
        setAskText('')
        setAskBusy(false)
        askStarted.current = false
        refetchFrecency()
        refetchClips()
        inputRef.current?.focus()
      }),
      listen('index-updated', refetchIndex),
      listen('icons-updated', refetchIndex),
      listen('scripts-updated', refetchScripts),
      listen<Config>('config-changed', (e) => {
        setConfig(e.payload)
        setConfigLoaded(true)
      }),
      listen<string>('ask-chunk', (e) => {
        const ev = parseAskLine(e.payload)
        if (ev.delta) {
          askGotDelta.current = true
          setAskText((t) => t + ev.delta)
        } else if (ev.final && !askGotDelta.current) {
          setAskText((t) => t + ev.final)
        } else if (ev.error) {
          setAskText((t) => `${t}\n⚠ ${ev.error}`)
        }
      }),
      listen<boolean>('ask-done', () => setAskBusy(false)),
    ]
    return () => {
      for (const p of unlisteners) p.then((un) => un())
    }
  }, [refetchIndex, refetchFrecency, refetchScripts, refetchClips])

  // Script mode queries the script on a debounce; stale rows stay up meanwhile.
  const isScript = useCallback(
    (t: string) =>
      t !== 'clip' && !(t in PANELS) && scripts.some((s) => s.trigger === t),
    [scripts],
  )
  const scriptTrigger = parsed.mode === 'trigger' && isScript(parsed.trigger)
  const trigger = parsed.mode === 'trigger' ? parsed.trigger : ''
  const args = parsed.mode === 'trigger' ? parsed.args : ''
  useEffect(() => {
    if (!scriptTrigger) {
      setScriptItems([])
      return
    }
    const timer = setTimeout(() => {
      invoke<ScriptItem[]>('run_script', { trigger, args })
        .then(setScriptItems)
        .catch((err) => {
          console.error(err)
          setScriptItems([])
        })
    }, SCRIPT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [scriptTrigger, trigger, args])

  // Panel keywords fuzzy-match like apps (`usag` → Usage); an exact token still
  // dispatches through the grammar's trigger mode before launch mode sees it.
  const panelItems = useMemo<IndexItem[]>(
    () =>
      Object.entries(PANELS)
        .filter(([id]) => panelEnabled(id, config))
        .map(([id, p]) => ({
          id: `panel:${id}`,
          name: p.title,
          kind: 'panel' as const,
          path: id,
          hint: p.hint,
          icon: null,
          aliases: [
            id,
            ...(PANEL_INFO.find((info) => info.id === id)?.aliases ?? []),
          ],
        })),
    [config],
  )

  const rows: Row[] = useMemo(() => {
    if (draft) return draftRows(draft, raw, browsers)
    switch (parsed.mode) {
      case 'launch':
        return launchRows(
          parsed.query,
          [...index, ...panelItems],
          frecency,
          config.searchFallback,
        )
      case 'trigger': {
        if (parsed.trigger === 'clip') return clipRows(parsed.args, clips)
        // `awake 2h` arms straight from the prompt; bare `awake` opens the panel.
        if (parsed.trigger === 'awake' && parsed.args.trim()) {
          return awakeRows(parsed.args)
        }
        const panel = panelEnabled(parsed.trigger, config)
          ? PANELS[parsed.trigger]
          : undefined
        if (panel) return panelRows(parsed.trigger, panel.title, panel.hint)
        if (isScript(parsed.trigger)) return scriptRows(scriptItems)
        const link = quicklinks.find((l) => l.trigger === parsed.trigger)
        return link ? quicklinkRows(link, parsed.args) : []
      }
      case 'emoji':
        return emojiRows(parsed.query)
      case 'bang':
      case 'ask':
        return []
    }
  }, [
    parsed,
    index,
    panelItems,
    frecency,
    clips,
    scriptItems,
    config,
    quicklinks,
    isScript,
    draft,
    raw,
    browsers,
  ])

  const askActive = parsed.mode === 'ask' && (askText.length > 0 || askBusy)
  const rowCount =
    parsed.mode === 'ask'
      ? askActive
        ? 8
        : 1
      : parsed.mode === 'bang'
        ? 1
        : rows.length > 0
          ? rows.length
          : raw
            ? 1
            : 0
  useEffect(() => {
    const height = panelMode
      ? PANEL_MODE_HEIGHT
      : INPUT_HEIGHT + rowCount * ROW_HEIGHT + BORDER
    invoke('resize_panel', { height }).catch(console.error)
  }, [rowCount, panelMode])

  // Runs after the commit that rendered the new results — the §7 keystroke budget.
  useEffect(() => {
    reportResultsPainted(rows.length)
  }, [rows])

  const clampedSelection = Math.min(selected, Math.max(rows.length - 1, 0))

  const enterRow = useCallback(
    (enter: RowEnter) => {
      switch (enter.kind) {
        case 'execute': {
          const query = parsed.mode === 'launch' ? parsed.query : ''
          invoke('execute', { id: enter.id, query }).catch(console.error)
          break
        }
        case 'copy':
          invoke('copy_text', { text: enter.text }).catch(console.error)
          break
        case 'open-url':
          invoke('open_url', { url: enter.url }).catch(console.error)
          break
        case 'script-action': {
          const item = scriptItems[enter.index]
          if (item) {
            invoke('script_action', { action: item.action }).catch(
              console.error,
            )
          }
          break
        }
        case 'copy-clip':
          invoke('copy_clip', { content: enter.content }).catch(console.error)
          break
        case 'clear-clips':
          invoke('clear_clips').then(refetchClips).catch(console.error)
          break
        case 'open-panel':
          setPanelMode(enter.panel)
          setRaw('')
          setSelected(0)
          break
        case 'awake-arm':
          // The grammar's defaults: screen sleeps, no drives, 20% floor —
          // the panel is where anything else gets chosen.
          invoke('awake_arm', {
            display: false,
            disks: false,
            untilEpochMs: untilDeadline(enter.until, new Date()),
            batteryFloor: 20,
            spec: JSON.stringify({
              screen: false,
              disks: false,
              until: enter.until,
              floor: 20,
            }),
          }).catch(console.error)
          invoke('hide_panel').catch(console.error)
          break
        case 'awake-release':
          invoke('awake_release').catch(console.error)
          invoke('hide_panel').catch(console.error)
          break
        case 'add-quicklink':
          setDraft({ url: enter.url, name: '', step: 'name' })
          setRaw('')
          setSelected(0)
          break
        case 'draft-commit-name':
          if (draft && raw.trim()) {
            setDraft({ ...draft, name: raw.trim(), step: 'browser' })
            setRaw('')
            setSelected(0)
          }
          break
        case 'pick-browser':
          if (draft) {
            invoke('add_quicklink', {
              name: draft.name,
              url: draft.url,
              browser: enter.browser,
            }).catch(console.error)
            setDraft(null)
          }
          break
        case 'reveal':
          invoke('reveal_item', { path: enter.path }).catch(console.error)
          break
        case 'delete-clip':
          // Deleting keeps the panel open — you're grooming the list.
          invoke('delete_clip', { id: enter.id })
            .then(refetchClips)
            .catch(console.error)
          break
        case 'script-alt-action': {
          const alt = scriptItems[enter.index]?.altAction
          if (alt) {
            invoke('script_action', { action: alt }).catch(console.error)
          }
          break
        }
      }
    },
    [parsed, scriptItems, refetchClips, draft, raw],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Alt') setAltHeld(true)
      const move = (delta: number) => {
        e.preventDefault()
        if (rows.length > 0) {
          setSelected((s) => (s + delta + rows.length) % rows.length)
        }
      }

      // Mode switching is a keystroke, from any mode: the prefix char is
      // consumed, never typed. Hopping modes ends an ask conversation.
      if (
        raw === '' &&
        !draft &&
        (e.key === '?' || e.key === '!' || e.key === ':')
      ) {
        const next = e.key === '?' ? 'ask' : e.key === '!' ? 'bang' : 'emoji'
        if (next === 'ask' && !config.agents.askMode) {
          // Agent mode off: `?` is an ordinary character.
        } else if (next !== inputMode) {
          e.preventDefault()
          if (inputMode === 'ask') {
            setAskText('')
            setAskBusy(false)
            askStarted.current = false
          }
          setInputMode(next)
          return
        } else {
          e.preventDefault()
          return
        }
      }

      if (e.key === 'Escape') {
        e.preventDefault()
        // In the quicklink form, Esc backs out to the launcher; a second Esc dismisses.
        if (draft) {
          setDraft(null)
          setRaw('')
          setSelected(0)
        } else if (inputMode !== 'launch') {
          // Esc returns to launch mode (ending any conversation); a second
          // Esc dismisses.
          if (inputMode === 'ask') {
            setAskText('')
            setAskBusy(false)
            askStarted.current = false
          }
          setInputMode('launch')
          setRaw('')
          setSelected(0)
        } else {
          invoke('hide_panel').catch(console.error)
        }
        return
      }
      // Backspace on an empty prompt backs out of the mode, like deleting the
      // sigil — except mid-conversation, where the transcript stays (Esc ends).
      if (
        e.key === 'Backspace' &&
        raw === '' &&
        inputMode !== 'launch' &&
        !draft
      ) {
        e.preventDefault()
        if (inputMode === 'ask' && (askText || askBusy)) return
        setInputMode('launch')
        return
      }
      if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) return move(1)
      if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) return move(-1)

      if (e.metaKey && e.key >= '1' && e.key <= '8') {
        e.preventDefault()
        const row = rows[Number(e.key) - 1]
        if (row) enterRow(row.enter)
        return
      }

      if (e.key === 'Enter') {
        e.preventDefault()
        if (parsed.mode === 'ask') {
          const prompt = parsed.prompt.trim()
          if (!prompt || askBusy) return
          askGotDelta.current = false
          setAskText((t) => `${t ? `${t}\n\n` : ''}❯ ${prompt}\n\n`)
          setAskBusy(true)
          invoke('ask', {
            prompt,
            continueConversation: askStarted.current,
          }).catch((err) => {
            setAskText((t) => `${t}⚠ ${String(err)}`)
            setAskBusy(false)
          })
          askStarted.current = true
          // The mode persists; the prompt clears for the follow-up.
          setRaw('')
        } else if (parsed.mode === 'bang') {
          invoke('run_bang', { command: parsed.command }).catch(console.error)
        } else {
          const row = rows[clampedSelection]
          if (!row) return
          if (e.altKey && row.alt) {
            enterRow(row.alt.enter)
          } else {
            enterRow(row.enter)
          }
        }
      }
    },
    [
      rows,
      parsed,
      clampedSelection,
      enterRow,
      draft,
      askText,
      askBusy,
      inputMode,
      raw,
      config,
    ],
  )

  const closePanel = useCallback(() => {
    setPanelMode(null)
    setRaw('')
    // Hand the keyboard back to the prompt.
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [])

  const sigil = draft
    ? '+'
    : parsed.mode === 'ask'
      ? '?'
      : parsed.mode === 'emoji'
        ? ':'
        : parsed.mode === 'bang'
          ? config.bangSigil
          : config.sigil
  const placeholder = draft
    ? draft.step === 'name'
      ? 'name this quicklink…'
      : 'choose a browser (↑↓ then ⏎)'
    : 'Search for apps and commands…'

  if (panelMode) {
    return (
      <div className="panel panel-mode">
        <div className="input-row">
          <span className="sigil">{config.sigil}</span>
          <span className="breadcrumb">{panelMode}</span>
        </div>
        {(() => {
          const Active = PANELS[panelMode]?.component
          return Active ? <Active onClose={closePanel} /> : null
        })()}
      </div>
    )
  }

  return (
    <div className={`panel ${parsed.mode}`}>
      <div className="input-row">
        <span className="sigil">{sigil}</span>
        <input
          ref={inputRef}
          className="prompt"
          type="text"
          value={raw}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          autoFocus
          placeholder={placeholder}
          onChange={(e) => {
            markInput()
            setRaw(e.target.value)
            setSelected(0)
          }}
          onKeyDown={onKeyDown}
          onKeyUp={(e) => {
            if (e.key === 'Alt') setAltHeld(false)
          }}
          onBlur={() => setAltHeld(false)}
        />
      </div>

      {askActive ? (
        <div className="ask-surface" ref={askSurfaceRef}>
          <div className="ask-text">
            {parseMarkdownLite(askText).map((block, i) => {
              switch (block.kind) {
                case 'code':
                  return (
                    <pre key={i} className="md-code">
                      {block.text}
                    </pre>
                  )
                case 'heading':
                  return (
                    <div key={i} className={`md-h md-h${block.level}`}>
                      {renderSpans(block.spans)}
                    </div>
                  )
                case 'bullet':
                  return (
                    <div
                      key={i}
                      className="md-li"
                      style={{ paddingLeft: 14 + block.indent * 14 }}
                    >
                      • {renderSpans(block.spans)}
                    </div>
                  )
                case 'numbered':
                  return (
                    <div key={i} className="md-li" style={{ paddingLeft: 14 }}>
                      {block.marker}. {renderSpans(block.spans)}
                    </div>
                  )
                case 'para':
                  return (
                    <div key={i} className="md-p">
                      {renderSpans(block.spans)}
                    </div>
                  )
              }
            })}
            {askBusy ? <span className="md-cursor">▊</span> : null}
          </div>
        </div>
      ) : parsed.mode === 'ask' ? (
        <div className="row bang-row">
          <span className="bang-action">ask claude ▸</span>
          <span className="bang-command">
            {parsed.prompt || 'type a question, Enter to send'}
          </span>
        </div>
      ) : parsed.mode === 'bang' ? (
        <div className="row bang-row">
          <span className="bang-action">run in {config.terminal} ▸</span>
          <span className="bang-command">{parsed.command || 'new window'}</span>
        </div>
      ) : rows.length > 0 ? (
        <ul className="results">
          {rows.map((row, i) => (
            <li
              key={row.key}
              className={`row result ${i === clampedSelection ? 'selected' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault()
                enterRow(e.altKey && row.alt ? row.alt.enter : row.enter)
              }}
            >
              {row.icon ? (
                <img className="icon" src={convertFileSrc(row.icon)} alt="" />
              ) : (
                <span className="icon glyph">{rowGlyph(row)}</span>
              )}
              <span className="name">
                {row.title.split('').map((ch, j) => (
                  <span
                    key={j}
                    className={row.positions.includes(j) ? 'hit' : ''}
                  >
                    {ch}
                  </span>
                ))}
              </span>
              <span className="hint">
                {i < 8 ? <kbd>⌘{i + 1}</kbd> : null}
                {altHeld && row.alt ? `⌥⏎ ${row.alt.label}` : row.hint}
              </span>
            </li>
          ))}
        </ul>
      ) : raw ? (
        <div className="row empty">nothing on the horizon</div>
      ) : null}
    </div>
  )
}
