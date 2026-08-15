import { describe, expect, it } from 'vitest'

import { type MenuNode, drillIn, drillOut, nodesAtPath } from './menu'

const tree: MenuNode[] = [
  { id: 'package', label: 'Package' },
  {
    id: 'style',
    label: 'Style',
    children: [
      { id: 'theme', label: 'Theme' },
      {
        id: 'font',
        label: 'Font',
        children: [{ id: 'mono', label: 'Monospace' }],
      },
    ],
  },
]

describe('nodesAtPath', () => {
  it('returns the root list for an empty path', () => {
    expect(nodesAtPath(tree, [])).toBe(tree)
  })

  it('descends into children', () => {
    const nodes = nodesAtPath(tree, ['style'])
    expect(nodes?.map((n) => n.id)).toEqual(['theme', 'font'])
    expect(nodesAtPath(tree, ['style', 'font'])?.[0]?.id).toBe('mono')
  })

  it('returns null for a broken path', () => {
    expect(nodesAtPath(tree, ['nope'])).toBeNull()
    expect(nodesAtPath(tree, ['package'])).toBeNull()
  })
})

describe('drillIn / drillOut', () => {
  it('drills into a node with children', () => {
    expect(drillIn(tree, [], 'style')).toEqual(['style'])
    expect(drillIn(tree, ['style'], 'font')).toEqual(['style', 'font'])
  })

  it('refuses to drill into a leaf or unknown id', () => {
    expect(drillIn(tree, [], 'package')).toBeNull()
    expect(drillIn(tree, [], 'ghost')).toBeNull()
  })

  it('drills out one level and stops at the root', () => {
    expect(drillOut(['style', 'font'])).toEqual(['style'])
    expect(drillOut(['style'])).toEqual([])
    expect(drillOut([])).toEqual([])
  })
})
