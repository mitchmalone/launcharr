import { defineStories } from '../story'
import { AskPinned, AskSurface, AskThinking } from './ask'

const ANSWER = `Quicklinks are **links with a trigger word**: type the trigger, a space, then a query.

- \`gh tauri\` opens a GitHub search for *tauri*
- add one from Settings → Quicklinks, or paste a URL and pick **Add quicklink…**

\`\`\`json
{ "name": "GitHub", "url": "https://github.com/search?q={query}", "trigger": "gh" }
\`\`\`

The \`{query}\` placeholder is what makes a link a quicklink.`

const frame = (children: React.ReactNode) => (
  <div style={{ width: 640, background: 'var(--bg, #1c1d2a)' }}>{children}</div>
)

export const askStories = defineStories('AskSurface', [
  {
    name: 'thinking',
    notes:
      'First question pinned in the header with the spinner; the transcript shows the shimmering verb until the first delta.',
    render: () =>
      frame(
        <>
          <AskPinned prompt="what are quicklinks?" busy />
          <AskSurface
            turns={[
              { prompt: 'what are quicklinks?', answer: '', done: false },
            ]}
          />
        </>,
      ),
  },
  {
    name: 'streaming',
    notes:
      'Deltas arriving: block cursor pulses at the tail, header spinner still on.',
    render: () =>
      frame(
        <>
          <AskPinned prompt="what are quicklinks?" busy />
          <AskSurface
            turns={[
              {
                prompt: 'what are quicklinks?',
                answer: ANSWER.slice(0, 120),
                done: false,
              },
            ]}
          />
        </>,
      ),
  },
  {
    name: 'done, multi-turn',
    notes:
      'Follow-ups repeat their prompt as a ❯ line inside the transcript; the first question stays pinned.',
    render: () =>
      frame(
        <>
          <AskPinned prompt="what are quicklinks?" busy={false} />
          <AskSurface
            turns={[
              { prompt: 'what are quicklinks?', answer: ANSWER, done: true },
              {
                prompt: 'and how do I remove one?',
                answer:
                  'Settings → Quicklinks → **✕** on the row, or delete its entry under `"links"` in config.json.',
                done: true,
              },
            ]}
          />
        </>,
      ),
  },
  {
    name: 'error',
    notes: 'The CLI reported an error for the turn.',
    render: () =>
      frame(
        <>
          <AskPinned prompt="what are quicklinks?" busy={false} />
          <AskSurface
            turns={[
              {
                prompt: 'what are quicklinks?',
                answer: '',
                done: true,
                error: 'claude CLI not found — install it to use ? mode',
              },
            ]}
          />
        </>,
      ),
  },
  {
    name: 'thinking indicator alone',
    render: () => frame(<AskThinking />),
  },
])
