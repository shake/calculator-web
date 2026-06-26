export type CalculatorMode = 'basic' | 'scientific' | 'convert';
export type AngleMode = 'deg' | 'rad';

const operatorReplacements: Record<string, string> = {
  '×': '*',
  '÷': '/',
  '−': '-',
};

function factorial(input: number) {
  if (!Number.isFinite(input) || input < 0 || !Number.isInteger(input)) {
    return Number.NaN;
  }

  let result = 1;
  for (let index = 2; index <= input; index += 1) {
    result *= index;
  }
  return result;
}

function toRadians(value: number, angleMode: AngleMode) {
  return angleMode === 'deg' ? (value * Math.PI) / 180 : value;
}

function fromRadians(value: number, angleMode: AngleMode) {
  return angleMode === 'deg' ? (value * 180) / Math.PI : value;
}

function replaceTerminalFactorial(expression: string) {
  let result = expression;
  const factorialPattern = /(\([^()]+\)|-?\d*\.?\d+|[a-zA-Z_][a-zA-Z0-9_]*)!/g;

  while (factorialPattern.test(result)) {
    factorialPattern.lastIndex = 0;
    result = result.replace(factorialPattern, 'fact($1)');
  }

  return result;
}

function buildScope(angleMode: AngleMode) {
  return {
    sin: (value: number) => Math.sin(toRadians(value, angleMode)),
    cos: (value: number) => Math.cos(toRadians(value, angleMode)),
    tan: (value: number) => Math.tan(toRadians(value, angleMode)),
    asin: (value: number) => fromRadians(Math.asin(value), angleMode),
    acos: (value: number) => fromRadians(Math.acos(value), angleMode),
    atan: (value: number) => fromRadians(Math.atan(value), angleMode),
    sinh: (value: number) => Math.sinh(value),
    cosh: (value: number) => Math.cosh(value),
    tanh: (value: number) => Math.tanh(value),
    asinh: (value: number) => Math.asinh(value),
    acosh: (value: number) => Math.acosh(value),
    atanh: (value: number) => Math.atanh(value),
    sqrt: (value: number) => Math.sqrt(value),
    cbrt: (value: number) => Math.cbrt(value),
    root: (degree: number, value: number) => Math.pow(value, 1 / degree),
    pow: (base: number, exponent: number) => Math.pow(base, exponent),
    log2: (value: number) => Math.log2(value),
    log10: (value: number) => Math.log10(value),
    logy: (value: number, base: number) => Math.log(value) / Math.log(base),
    ln: (value: number) => Math.log(value),
    fact: factorial,
    abs: (value: number) => Math.abs(value),
    floor: (value: number) => Math.floor(value),
    ceil: (value: number) => Math.ceil(value),
    round: (value: number) => Math.round(value),
    sign: (value: number) => Math.sign(value),
    rand: () => Math.random(),
    pi: Math.PI,
    e: Math.E,
    EE: (value: number) => value,
  };
}

function normalizeExpression(expression: string) {
  const cleaned = expression
    .replace(/\s+/g, '')
    .replace(/π/g, 'pi')
    .replace(/EE/g, 'e')
    .replace(/\^/g, '**');

  const withOperators = [...cleaned].map(char => operatorReplacements[char] ?? char).join('');
  return replaceTerminalFactorial(withOperators);
}

function evaluateSafely(expression: string, angleMode: AngleMode) {
  const normalized = normalizeExpression(expression);
  if (!normalized) {
    return 0;
  }

  const scope = buildScope(angleMode);
  const scopeNames = Object.keys(scope);
  const scopeValues = Object.values(scope);

  const evaluator = new Function(...scopeNames, `return (${normalized});`);
  return evaluator(...scopeValues);
}

function findTrailingOperandRange(expression: string) {
  let end = expression.length - 1;
  while (end >= 0 && /\s/.test(expression[end] ?? '')) {
    end -= 1;
  }

  if (end < 0) {
    return null;
  }

  if (expression[end] === ')') {
    let depth = 0;
    for (let index = end; index >= 0; index -= 1) {
      const char = expression[index];
      if (char === ')') depth += 1;
      if (char === '(') depth -= 1;
      if (depth === 0) {
        return { start: index, end: end + 1 };
      }
    }
  }

  const numberMatch = expression.slice(0, end + 1).match(/(-?\d*\.?\d+)$/);
  if (numberMatch?.index !== undefined) {
    return { start: numberMatch.index, end: end + 1 };
  }

  const identifierMatch = expression.slice(0, end + 1).match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
  if (identifierMatch?.index !== undefined) {
    return { start: identifierMatch.index, end: end + 1 };
  }

  return { start: end, end: end + 1 };
}

export function appendToken(expression: string, token: string) {
  if (!expression) {
    if (token === '×' || token === '÷' || token === '−' || token === '+') {
      return '';
    }
    return token;
  }

  return `${expression}${token}`;
}

export function backspaceExpression(expression: string) {
  return expression.slice(0, -1);
}

export function clearExpression() {
  return '';
}

export function toggleSignExpression(expression: string) {
  if (!expression) {
    return '-';
  }

  const range = findTrailingOperandRange(expression);
  if (!range) {
    return expression.startsWith('-') ? expression.slice(1) : `-${expression}`;
  }

  const operand = expression.slice(range.start, range.end);
  if (operand.startsWith('(-') && operand.endsWith(')')) {
    return `${expression.slice(0, range.start)}${operand.slice(2, -1)}${expression.slice(range.end)}`;
  }

  if (operand.startsWith('-')) {
    return `${expression.slice(0, range.start)}${operand.slice(1)}${expression.slice(range.end)}`;
  }

  return `${expression.slice(0, range.start)}(-${operand})${expression.slice(range.end)}`;
}

export function percentExpression(expression: string) {
  if (!expression) {
    return '';
  }

  const range = findTrailingOperandRange(expression);
  if (!range) {
    return expression;
  }

  const operand = expression.slice(range.start, range.end);
  return `${expression.slice(0, range.start)}(${operand}/100)${expression.slice(range.end)}`;
}

export function formatDisplayNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '错误';
  }

  if (Number.isInteger(value) && Math.abs(value) < 1e12) {
    return new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 0 }).format(value);
  }

  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute >= 1e12 || absolute < 1e-6)) {
    return value
      .toExponential(8)
      .replace(/\.?0+e/, 'e')
      .replace(/e\+?/, 'e');
  }

  const formatted = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    maximumFractionDigits: 10,
  }).format(value);

  return formatted.replace(/(\.\d*?[1-9])0+$/, '$1').replace(/\.0+$/, '');
}

export function evaluateExpression(expression: string, angleMode: AngleMode) {
  try {
    const value = evaluateSafely(expression, angleMode);
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return Number(value);
  }
  catch {
    return Number.NaN;
  }
}

export function isExpressionValid(expression: string, angleMode: AngleMode) {
  return Number.isFinite(evaluateExpression(expression, angleMode));
}
