import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AskPinned, AskSurface } from './ask'

/** Structural checks on the SSR markup — the states the workbench stories show. */
describe('AskSurface', () => {
  it('omits the pinned first prompt from the transcript, repeats follow-ups', () => {
    const html = renderToStaticMarkup(
      <AskSurface
        turns={[
          { prompt: 'first question', answer: 'A1', done: true },
          { prompt: 'follow-up', answer: 'A2', done: true },
        ]}
      />,
    )
    expect(html).not.toContain('first question')
    expect(html).toContain('follow-up')
    expect(html).toContain('A1')
    expect(html).toContain('A2')
    expect(html).not.toContain('tui-ask-thinking')
    expect(html).not.toContain('tui-ask-cursor')
  })

  it('shows the thinking indicator before the first delta, the cursor while streaming', () => {
    const thinking = renderToStaticMarkup(
      <AskSurface turns={[{ prompt: 'q', answer: '', done: false }]} />,
    )
    expect(thinking).toContain('tui-ask-thinking')
    expect(thinking).toContain('tui-ask-spinner')

    const streaming = renderToStaticMarkup(
      <AskSurface turns={[{ prompt: 'q', answer: 'partial', done: false }]} />,
    )
    expect(streaming).not.toContain('tui-ask-thinking')
    expect(streaming).toContain('tui-ask-cursor')
  })

  it('renders markdown-lite and errors', () => {
    const html = renderToStaticMarkup(
      <AskSurface
        turns={[
          {
            prompt: 'q',
            answer: '**bold** and `code`',
            done: true,
            error: 'boom',
          },
        ]}
      />,
    )
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('⚠ boom')
  })

  it('pinned header carries the prompt and a spinner only while busy', () => {
    expect(renderToStaticMarkup(<AskPinned prompt="hello" busy />)).toContain(
      'tui-ask-pinned-spinner',
    )
    expect(
      renderToStaticMarkup(<AskPinned prompt="hello" busy={false} />),
    ).not.toContain('tui-ask-pinned-spinner')
  })
})
