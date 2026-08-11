/**
 * Inline math (Sol parity, decided 2026-08-08): a launch-mode query that parses as an
 * arithmetic expression gets its result as the top row. Pure evaluator — tokenizer +
 * shunting-yard, no eval(), no Function(). Supports + - * / % ^ and parentheses.
 */

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'op'; op: string }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

const PRECEDENCE: Record<string, number> = {
  '+': 1,
  '-': 1,
  '*': 2,
  '/': 2,
  '%': 2,
  '^': 3,
  'u-': 4, // unary minus: binds tighter than everything
}
const RIGHT_ASSOC = new Set(['^', 'u-'])

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]!
    if (ch === ' ') {
      i++
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < expr.length && /[0-9._,]/.test(expr[j]!)) j++
      const raw = expr.slice(i, j).replace(/[_,]/g, '')
      const value = Number(raw)
      if (!Number.isFinite(value)) return null
      tokens.push({ kind: 'num', value })
      i = j
      continue
    }
    if (ch in PRECEDENCE) {
      // Unary minus: at the start or after an operator/open paren.
      const prev = tokens[tokens.length - 1]
      if (
        ch === '-' &&
        (!prev || prev.kind === 'op' || prev.kind === 'lparen')
      ) {
        tokens.push({ kind: 'op', op: 'u-' })
        i++
        continue
      }
      tokens.push({ kind: 'op', op: ch })
      i++
      continue
    }
    if (ch === '(') {
      tokens.push({ kind: 'lparen' })
      i++
      continue
    }
    if (ch === ')') {
      tokens.push({ kind: 'rparen' })
      i++
      continue
    }
    return null // any other character: not a math expression
  }
  return tokens
}

function toRpn(tokens: Token[]): Token[] | null {
  const out: Token[] = []
  const ops: Token[] = []
  for (const token of tokens) {
    if (token.kind === 'num') {
      out.push(token)
    } else if (token.kind === 'op') {
      while (ops.length > 0) {
        const top = ops[ops.length - 1]!
        if (top.kind !== 'op') break
        const higher =
          PRECEDENCE[top.op]! > PRECEDENCE[token.op]! ||
          (PRECEDENCE[top.op] === PRECEDENCE[token.op] &&
            !RIGHT_ASSOC.has(token.op))
        if (!higher) break
        out.push(ops.pop() as Token)
      }
      ops.push(token)
    } else if (token.kind === 'lparen') {
      ops.push(token)
    } else {
      let matched = false
      while (ops.length > 0) {
        const top = ops.pop() as Token
        if (top.kind === 'lparen') {
          matched = true
          break
        }
        out.push(top)
      }
      if (!matched) return null
    }
  }
  while (ops.length > 0) {
    const top = ops.pop() as Token
    if (top.kind === 'lparen') return null
    out.push(top)
  }
  return out
}

function evalRpn(rpn: Token[]): number | null {
  const stack: number[] = []
  for (const token of rpn) {
    if (token.kind === 'num') {
      stack.push(token.value)
      continue
    }
    if (token.kind !== 'op') return null
    if (token.op === 'u-') {
      const v = stack.pop()
      if (v === undefined) return null
      stack.push(-v)
      continue
    }
    const b = stack.pop()
    const a = stack.pop()
    if (a === undefined || b === undefined) return null
    switch (token.op) {
      case '+':
        stack.push(a + b)
        break
      case '-':
        stack.push(a - b)
        break
      case '*':
        stack.push(a * b)
        break
      case '/':
        stack.push(a / b)
        break
      case '%':
        stack.push(a % b)
        break
      case '^':
        stack.push(a ** b)
        break
      default:
        return null
    }
  }
  return stack.length === 1 ? stack[0]! : null
}

/**
 * Evaluate a query as arithmetic. Returns null unless the whole string is a well-formed
 * expression containing at least one operator (so app queries like "1password" or plain
 * numbers never trigger the math row).
 */
export function evaluate(query: string): number | null {
  const tokens = tokenize(query.trim())
  if (!tokens || tokens.length < 3) return null
  if (!tokens.some((t) => t.kind === 'op')) return null
  const rpn = toRpn(tokens)
  if (!rpn) return null
  const result = evalRpn(rpn)
  if (result === null || !Number.isFinite(result)) return null
  return result
}

/** Human-friendly formatting: kill float noise, keep precision that matters. */
export function formatResult(value: number): string {
  const rounded = Math.round(value * 1e10) / 1e10
  return String(rounded)
}
