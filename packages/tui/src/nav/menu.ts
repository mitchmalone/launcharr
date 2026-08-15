/**
 * Drill-down menu state (the Omarchy "Install…" pattern): a tree of nodes and a
 * path of ids into it. Selection within a level is `moveSelection`'s job.
 */

export interface MenuNode {
  id: string
  label: string
  /** Optional right-aligned hint (e.g. a hotkey or "›" is drawn from children). */
  hint?: string
  /** Optional glyph rendered before the label. */
  icon?: string
  children?: MenuNode[]
}

/** The node list visible at `path`, or null if the path no longer resolves. */
export function nodesAtPath(
  root: MenuNode[],
  path: readonly string[],
): MenuNode[] | null {
  let nodes = root
  for (const id of path) {
    const next = nodes.find((n) => n.id === id)?.children
    if (!next) return null
    nodes = next
  }
  return nodes
}

/** New path after entering `id`, or null if `id` isn't a drillable node here. */
export function drillIn(
  root: MenuNode[],
  path: readonly string[],
  id: string,
): string[] | null {
  const nodes = nodesAtPath(root, path)
  const target = nodes?.find((n) => n.id === id)
  if (!target?.children?.length) return null
  return [...path, id]
}

/** New path after backing out one level; the root is a floor, not an error. */
export function drillOut(path: readonly string[]): string[] {
  return path.slice(0, -1)
}
