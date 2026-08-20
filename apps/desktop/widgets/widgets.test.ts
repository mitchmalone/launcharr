import { describe, expect, it } from 'vitest'

import * as actions from './github-actions'
import * as trmnl from './trmnl'
import * as uptime from './uptime'
import * as vercel from './vercel'

/**
 * The reference widgets' pure halves (docs/WIDGETS.md). Each `view` turns a
 * payload into a WidgetView; the network/credential halves stay untested here
 * and are proven by running `<widget> tick` by hand.
 */

const NOW = Date.parse('2026-08-19T12:00:00Z')

describe('uptime', () => {
  it('is blue with no label while everything is up', () => {
    const v = uptime.view([
      { name: 'a', url: 'https://a', status: 'up', time: 200 },
      { name: 'b', url: 'https://b', status: 'up', time: 300 },
    ])
    expect(v.tone).toBe('ok')
    expect(v.icon).toBe('arrow-big-up')
    expect(v.label).toBeNull()
    expect(v.card?.subtitle).toBe('all 2 up')
    expect(v.card?.rows?.[0]).toMatchObject({
      dot: 'ok',
      text: 'a',
      hint: '200 ms',
      action: { type: 'open', value: 'https://a' },
    })
  })

  it('counts the down sites on the cell and marks their rows', () => {
    const v = uptime.view([
      { name: 'a', status: 'up', time: 1 },
      { name: 'b', status: 'down' },
    ])
    expect(v).toMatchObject({
      tone: 'error',
      icon: 'arrow-big-down',
      label: '1',
    })
    expect(v.card?.rows?.[1]).toMatchObject({ dot: 'error', hint: 'down' })
  })
})

describe('github-actions', () => {
  const items = [
    {
      repo: 'x/a',
      workflow: 'CI',
      state: 'success',
      url: 'https://gh/a',
      createdAt: '2026-08-19T11:00:00Z',
    },
    {
      repo: 'x/b',
      workflow: 'Deploy',
      state: 'failure',
      url: 'https://gh/b',
      createdAt: '2026-08-19T11:30:00Z',
    },
  ]

  it('declares the optional token override and the gh prerequisite', () => {
    const m = actions.manifest()
    // Sign-in is offered only with a client id baked in (none in test env).
    expect(m.auth).toBeUndefined()
    expect(m.settings.map((s) => s.key)).toEqual(['GITHUB_TOKEN'])
    expect(m.settings[0]).toMatchObject({ secret: true })
    expect('required' in m.settings[0]!).toBe(false)
    expect(m.requires[0]).toMatchObject({
      fix: 'brew install gh && gh auth login',
    })
  })

  it('sorts newest first, tones by state, and counts failures', () => {
    const v = actions.view(items, 'https://gh', NOW)
    expect(v).toMatchObject({ tone: 'error', icon: 'monitor-x', label: '1' })
    expect(v.click).toEqual({ type: 'open', value: 'https://gh' })
    expect(v.card?.rows?.map((r) => r.text)).toEqual([
      'x/b · Deploy',
      'x/a · CI',
    ])
    expect(v.card?.rows?.[0]).toMatchObject({ dot: 'error', hint: '30m' })
    expect(v.card?.rows?.[1]).toMatchObject({ dot: 'ok', hint: '1h' })
  })

  it('goes amber while something runs, quiet with no runs', () => {
    const v = actions.view(
      [
        {
          repo: 'r',
          workflow: 'w',
          state: 'in_progress',
          url: '',
          createdAt: '',
        },
      ],
      'https://gh',
      NOW,
    )
    expect(v).toMatchObject({
      tone: 'warn',
      label: null,
      icon: 'monitor-check',
    })
    expect(actions.view([], 'https://gh', NOW).card?.subtitle).toBe('no runs')
  })

  it('parses the repo list setting', () => {
    expect(actions.parseRepos('a/b, c/d\n a/b')).toEqual(['a/b', 'c/d'])
    expect(actions.parseRepos('not a repo')).toEqual([])
    expect(actions.parseRepos(undefined)).toEqual([])
  })

  it('formats ages', () => {
    expect(actions.age('2026-08-19T11:59:00Z', NOW)).toBe('1m')
    expect(actions.age('2026-08-17T12:00:00Z', NOW)).toBe('2d')
    expect(actions.age('nope', NOW)).toBeNull()
    expect(actions.age(undefined, NOW)).toBeNull()
  })
})

describe('vercel', () => {
  it('declares one optional secret token and the CLI prerequisite', () => {
    const m = vercel.manifest()
    expect(m.settings.map((s) => s.key)).toEqual(['VERCEL_TOKEN'])
    expect(m.settings[0]).toMatchObject({ secret: true })
    expect('required' in m.settings[0]!).toBe(false)
    expect(m.requires[0]).toMatchObject({ fix: 'vercel login' })
  })

  it('picks the newest production deployment per project and links its inspector', () => {
    const v = vercel.view(
      [
        {
          name: 'site',
          latestDeployments: [
            {
              id: 'dpl_old',
              readyState: 'READY',
              target: 'production',
              createdAt: NOW - 7200_000,
              alias: ['site.vercel.app', 'site.com'],
            },
            {
              id: 'dpl_new',
              readyState: 'ERROR',
              target: 'production',
              createdAt: NOW - 60_000,
              alias: ['site.com'],
            },
            {
              id: 'dpl_preview',
              readyState: 'READY',
              target: null,
              createdAt: NOW,
            },
          ],
        },
        {
          name: 'other',
          latestDeployments: [
            {
              id: 'dpl_o',
              readyState: 'BUILDING',
              target: 'production',
              createdAt: NOW,
            },
          ],
        },
        { name: 'empty', latestDeployments: [] },
      ],
      'team',
      NOW,
    )
    expect(v).toMatchObject({
      tone: 'error',
      icon: 'triangle-dashed',
      label: '1',
    })
    expect(v.card?.subtitle).toBe('1 failed')
    expect(v.card?.rows?.map((r) => r.text)).toEqual([
      'other',
      'site → site.com',
    ])
    expect(v.card?.rows?.[1]).toMatchObject({
      dot: 'error',
      hint: '1m',
      action: { type: 'open', value: 'https://vercel.com/team/site/new' },
    })
    expect(v.click).toEqual({ type: 'open', value: 'https://vercel.com/team' })
  })

  it('is amber while deploying and blue when all ready', () => {
    const building = vercel.view(
      [
        {
          name: 'a',
          latestDeployments: [{ readyState: 'QUEUED', target: 'production' }],
        },
      ],
      null,
      NOW,
    )
    expect(building.tone).toBe('warn')
    expect(building.card?.subtitle).toBe('deploying…')
    const ready = vercel.view(
      [
        {
          name: 'a',
          latestDeployments: [{ readyState: 'READY', target: 'production' }],
        },
      ],
      null,
      NOW,
    )
    expect(ready).toMatchObject({ tone: 'ok', icon: 'triangle' })
    expect(ready.card?.subtitle).toBe('1 projects ready')
  })
})

describe('trmnl', () => {
  it('tones by the lowest device and prints the number only in the red tier', () => {
    const v = trmnl.view(
      [
        { name: 'Desk', percent_charged: 87.4, battery_voltage: 4.1 },
        {
          name: 'Kitchen',
          percent_charged: 12,
          hardware_last_ping_at: '2026-08-19T11:50:00Z',
        },
      ],
      NOW,
    )
    expect(v).toMatchObject({ tone: 'error', label: '12%', icon: 'tablet' })
    expect(v.card?.subtitle).toBe('2 devices')
    expect(v.card?.rows?.[0]).toMatchObject({
      dot: 'ok',
      text: 'Desk · 87%',
      hint: '4.1V',
    })
    expect(v.card?.rows?.[1]).toMatchObject({
      dot: 'error',
      text: 'Kitchen · 12%',
      hint: '10m ago',
    })
  })

  it('is amber at 40 % and muted with no readings', () => {
    expect(trmnl.tone(40)).toBe('warn')
    expect(trmnl.tone(41)).toBe('ok')
    const v = trmnl.view([{ name: 'x' }], NOW)
    expect(v.tone).toBe('muted')
    expect(v.label).toBeNull()
    expect(v.card?.rows?.[0]?.text).toBe('x')
  })
})
