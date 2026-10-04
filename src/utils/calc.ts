export const OPS = ['+', '−', '×', '÷'] as const
type Op = (typeof OPS)[number]

const isOp = (s: string): s is Op => (OPS as readonly string[]).includes(s)

/** Вычисляет «150+50×2» с приоритетом × ÷. null — если выражение некорректно */
export function evaluate(expr: string): number | null {
  const tokens = expr.match(/\d+(?:\.\d*)?|\.\d+|[+−×÷]/g)
  if (!tokens) return null
  const nums: number[] = []
  const ops: Op[] = []
  for (const t of tokens) {
    if (isOp(t)) ops.push(t)
    else nums.push(parseFloat(t))
  }
  if (nums.length !== ops.length + 1) {
    if (nums.length === ops.length) ops.pop() // висящий оператор в конце
    else return null
  }
  // сначала × ÷
  const n2 = [nums[0]]
  const o2: Op[] = []
  ops.forEach((op, i) => {
    const v = nums[i + 1]
    if (op === '×') n2[n2.length - 1] *= v
    else if (op === '÷') n2[n2.length - 1] = v === 0 ? NaN : n2[n2.length - 1] / v
    else {
      n2.push(v)
      o2.push(op)
    }
  })
  const res = o2.reduce((acc, op, i) => (op === '+' ? acc + n2[i + 1] : acc - n2[i + 1]), n2[0])
  return Number.isFinite(res) ? Math.round(res * 100) / 100 : null
}

export const hasOps = (expr: string) => /[+−×÷]/.test(expr.slice(1))

/** Ввод с клавиатуры калькулятора */
export function pressKey(expr: string, key: string): string {
  if (key === '⌫') return expr.slice(0, -1)
  const last = expr.slice(-1)
  if (isOp(key)) {
    if (!expr) return expr
    return isOp(last) ? expr.slice(0, -1) + key : expr + key
  }
  const current = expr.split(/[+−×÷]/).pop() ?? ''
  if (key === '.') {
    if (current.includes('.')) return expr
    return expr + (current === '' ? '0.' : '.')
  }
  // цифра
  if (/\.\d{2}$/.test(current)) return expr // не больше 2 знаков после точки
  if (current === '0') return expr.slice(0, -1) + key
  if (current.replace('.', '').length >= 10) return expr
  return expr + key
}

export function toExpr(n: number) {
  return n ? String(Math.round(n * 100) / 100) : ''
}

/** Разбор пользовательского ввода «1 234,5» */
export function parseNumber(s: string): number | null {
  const v = parseFloat(s.replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : null
}
