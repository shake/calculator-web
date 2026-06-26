<script setup lang="ts">
import { ArrowsLeftRight, ArrowsUpDown, Calculator, Check, ChevronDown, LayoutSidebarLeftCollapse, Math } from '@vicons/tabler';
import { useHead } from '@vueuse/head';
import { appendToken, backspaceExpression, clearExpression, evaluateExpression, formatDisplayNumber, percentExpression, toggleSignExpression, type AngleMode, type CalculatorMode } from './calculator.utils';
import { currencyOptions, formatCurrencyAmount, getCurrencyName, normalizeCurrencyCode } from '../shared/currencies';

type BaseCalculatorMode = 'basic' | 'scientific';

type CalculatorAction =
  | { type: 'append'; value: string }
  | { type: 'clear' }
  | { type: 'backspace' }
  | { type: 'evaluate' }
  | { type: 'percent' }
  | { type: 'toggle-sign' }
  | { type: 'toggle-mode' }
  | { type: 'set-mode'; value: CalculatorMode }
  | { type: 'toggle-shift' }
  | { type: 'toggle-angle' }
  | { type: 'memory-clear' }
  | { type: 'memory-add' }
  | { type: 'memory-subtract' }
  | { type: 'memory-recall' };

type ButtonTone = 'number' | 'operator' | 'utility' | 'memory' | 'selected' | 'equals';

interface ButtonDefinition {
  label: string;
  action: CalculatorAction;
  tone?: ButtonTone;
  span?: number;
}

const persistedMode = useStorage<CalculatorMode>('apple-calculator:mode', 'basic');
const persistedAngle = useStorage<AngleMode>('apple-calculator:angle', 'rad');
const persistedMemory = useStorage<number>('apple-calculator:memory', 0);
const persistedBaseMode = useStorage<BaseCalculatorMode>('apple-calculator:base-mode', 'basic');
const persistedConvertMode = useStorage<boolean>('apple-calculator:convert-mode', false);
const persistedExchangeSourceCurrency = useStorage<string>('apple-calculator:exchange-source-currency', 'CNY');
const persistedExchangeTargetCurrency = useStorage<string>('apple-calculator:exchange-target-currency', 'USD');

const requestedMode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('mode') : null;
const legacyMode = persistedMode.value;
const hasPersistedBaseMode = typeof window !== 'undefined' ? window.localStorage.getItem('apple-calculator:base-mode') !== null : false;
const hasPersistedConvertMode = typeof window !== 'undefined' ? window.localStorage.getItem('apple-calculator:convert-mode') !== null : false;
const usePersistedDualMode = hasPersistedBaseMode || hasPersistedConvertMode;
const mode = ref<BaseCalculatorMode>(
  requestedMode === 'scientific'
    ? 'scientific'
    : requestedMode === 'basic'
      ? 'basic'
      : usePersistedDualMode
        ? persistedBaseMode.value
        : legacyMode === 'scientific' || legacyMode === 'basic'
        ? legacyMode
        : persistedBaseMode.value,
);
const convertMode = ref<boolean>(
  requestedMode === 'convert'
    ? true
    : usePersistedDualMode
      ? persistedConvertMode.value
      : legacyMode === 'convert'
        ? true
        : persistedConvertMode.value,
);
const angleMode = ref<AngleMode>(persistedAngle.value);
const memory = ref(persistedMemory.value);
const exchangeSourceCurrency = ref(normalizeCurrencyCode(persistedExchangeSourceCurrency.value) ?? 'CNY');
const exchangeTargetCurrency = ref(normalizeCurrencyCode(persistedExchangeTargetCurrency.value) ?? 'USD');
const exchangeRate = ref<number | null>(null);
const exchangeLastRefreshed = ref('');
const exchangeLoading = ref(false);
const exchangeError = ref('');
const exchangeMenuOpen = ref<null | 'source' | 'target'>(null);
const exchangePanelRef = ref<HTMLElement | null>(null);
let exchangeRequestToken = 0;
const shift = ref(false);
const expression = ref('');
const lastResult = ref('0');
const modeMenuOpen = ref(false);
const modeMenuRef = ref<HTMLElement | null>(null);

const calculatorTitle = computed(() => {
  if (convertMode.value) {
    return '汇率转换';
  }

  if (mode.value === 'scientific') {
    return '科学计算器';
  }

  return '基础计算器';
});

useHead(() => ({
  title: `${calculatorTitle.value} - Apple 风格计算器`,
  meta: [
    {
      name: 'description',
      content: 'Apple 风格的基础版、科学版和汇率转换计算器 Web 应用。',
    },
  ],
}));

const basicButtons = computed<ButtonDefinition[][]>(() => [
  [
    { label: '⌫', action: { type: 'backspace' }, tone: 'utility' },
    { label: 'AC', action: { type: 'clear' }, tone: 'utility' },
    { label: '%', action: { type: 'percent' }, tone: 'utility' },
    { label: '÷', action: { type: 'append', value: '÷' }, tone: 'operator' },
  ],
  [
    { label: '7', action: { type: 'append', value: '7' }, tone: 'number' },
    { label: '8', action: { type: 'append', value: '8' }, tone: 'number' },
    { label: '9', action: { type: 'append', value: '9' }, tone: 'number' },
    { label: '×', action: { type: 'append', value: '×' }, tone: 'operator' },
  ],
  [
    { label: '4', action: { type: 'append', value: '4' }, tone: 'number' },
    { label: '5', action: { type: 'append', value: '5' }, tone: 'number' },
    { label: '6', action: { type: 'append', value: '6' }, tone: 'number' },
    { label: '−', action: { type: 'append', value: '−' }, tone: 'operator' },
  ],
  [
    { label: '1', action: { type: 'append', value: '1' }, tone: 'number' },
    { label: '2', action: { type: 'append', value: '2' }, tone: 'number' },
    { label: '3', action: { type: 'append', value: '3' }, tone: 'number' },
    { label: '+', action: { type: 'append', value: '+' }, tone: 'operator' },
  ],
  [
    { label: '+/-', action: { type: 'toggle-sign' }, tone: 'utility' },
    { label: '0', action: { type: 'append', value: '0' }, tone: 'number' },
    { label: '.', action: { type: 'append', value: '.' }, tone: 'number' },
    { label: '=', action: { type: 'evaluate' }, tone: 'equals' },
  ],
]);

function scientificButtons(): ButtonDefinition[][] {
  const inverse = shift.value;
  return [
    [
      { label: '(', action: { type: 'append', value: '(' }, tone: 'memory' },
      { label: ')', action: { type: 'append', value: ')' }, tone: 'memory' },
      { label: 'mc', action: { type: 'memory-clear' }, tone: 'memory' },
      { label: 'm+', action: { type: 'memory-add' }, tone: 'memory' },
      { label: 'm-', action: { type: 'memory-subtract' }, tone: 'memory' },
      { label: 'mr', action: { type: 'memory-recall' }, tone: 'memory' },
      { label: '⌫', action: { type: 'backspace' }, tone: 'utility' },
      { label: 'AC', action: { type: 'clear' }, tone: 'utility' },
      { label: '%', action: { type: 'percent' }, tone: 'utility' },
      { label: '÷', action: { type: 'append', value: '÷' }, tone: 'operator' },
    ],
    [
      { label: '2nd', action: { type: 'toggle-shift' }, tone: inverse ? 'selected' : 'memory' },
      { label: 'x²', action: { type: 'append', value: '**2' }, tone: 'memory' },
      { label: 'x³', action: { type: 'append', value: '**3' }, tone: 'memory' },
      { label: 'xʸ', action: { type: 'append', value: '**' }, tone: 'memory' },
      { label: 'yˣ', action: { type: 'append', value: '**' }, tone: 'memory' },
      { label: '2ˣ', action: { type: 'append', value: '2**' }, tone: 'memory' },
      { label: '7', action: { type: 'append', value: '7' }, tone: 'number' },
      { label: '8', action: { type: 'append', value: '8' }, tone: 'number' },
      { label: '9', action: { type: 'append', value: '9' }, tone: 'number' },
      { label: '×', action: { type: 'append', value: '×' }, tone: 'operator' },
    ],
    [
      { label: '1/x', action: { type: 'append', value: '1/' }, tone: 'memory' },
      { label: '²√x', action: { type: 'append', value: 'sqrt(' }, tone: 'memory' },
      { label: '³√x', action: { type: 'append', value: 'cbrt(' }, tone: 'memory' },
      { label: 'y√x', action: { type: 'append', value: 'root(' }, tone: 'memory' },
      { label: 'logᵧ', action: { type: 'append', value: 'logy(' }, tone: 'memory' },
      { label: 'log₂', action: { type: 'append', value: 'log2(' }, tone: 'memory' },
      { label: '4', action: { type: 'append', value: '4' }, tone: 'number' },
      { label: '5', action: { type: 'append', value: '5' }, tone: 'number' },
      { label: '6', action: { type: 'append', value: '6' }, tone: 'number' },
      { label: '−', action: { type: 'append', value: '−' }, tone: 'operator' },
    ],
    [
      { label: 'x!', action: { type: 'append', value: '!' }, tone: 'memory' },
      { label: inverse ? 'sin' : 'sin⁻¹', action: { type: 'append', value: inverse ? 'sin(' : 'asin(' }, tone: 'memory' },
      { label: inverse ? 'cos' : 'cos⁻¹', action: { type: 'append', value: inverse ? 'cos(' : 'acos(' }, tone: 'memory' },
      { label: inverse ? 'tan' : 'tan⁻¹', action: { type: 'append', value: inverse ? 'tan(' : 'atan(' }, tone: 'memory' },
      { label: inverse ? 'e' : 'e', action: { type: 'append', value: 'e' }, tone: 'memory' },
      { label: 'EE', action: { type: 'append', value: 'EE' }, tone: 'memory' },
      { label: '1', action: { type: 'append', value: '1' }, tone: 'number' },
      { label: '2', action: { type: 'append', value: '2' }, tone: 'number' },
      { label: '3', action: { type: 'append', value: '3' }, tone: 'number' },
      { label: '+', action: { type: 'append', value: '+' }, tone: 'operator' },
    ],
    [
      { label: 'Rand', action: { type: 'append', value: 'rand()' }, tone: 'memory' },
      { label: inverse ? 'sinh' : 'sinh⁻¹', action: { type: 'append', value: inverse ? 'sinh(' : 'asinh(' }, tone: 'memory' },
      { label: inverse ? 'cosh' : 'cosh⁻¹', action: { type: 'append', value: inverse ? 'cosh(' : 'acosh(' }, tone: 'memory' },
      { label: inverse ? 'tanh' : 'tanh⁻¹', action: { type: 'append', value: inverse ? 'tanh(' : 'atanh(' }, tone: 'memory' },
      { label: 'π', action: { type: 'append', value: 'π' }, tone: 'memory' },
      { label: angleMode.value === 'deg' ? 'Deg' : 'Rad', action: { type: 'toggle-angle' }, tone: 'memory' },
      { label: '+/-', action: { type: 'toggle-sign' }, tone: 'utility' },
      { label: '0', action: { type: 'append', value: '0' }, tone: 'number' },
      { label: '.', action: { type: 'append', value: '.' }, tone: 'number' },
      { label: '=', action: { type: 'evaluate' }, tone: 'equals' },
    ],
  ];
}

const currentValue = computed(() => {
  if (!expression.value) {
    return lastResult.value;
  }

  const value = evaluateExpression(expression.value, angleMode.value);
  if (Number.isFinite(value)) {
    return formatDisplayNumber(value);
  }

  return expression.value;
});

const expressionPreview = computed(() => {
  if (!expression.value) {
    return '';
  }

  return expression.value
    .replace(/\*\*/g, '^')
    .replace(/sqrt\(/g, '√(')
    .replace(/cbrt\(/g, '∛(')
    .replace(/root\(/g, 'ʸ√(')
    .replace(/logy\(/g, 'logᵧ(')
    .replace(/log2\(/g, 'log₂(')
    .replace(/rand\(\)/g, 'Rand')
    .replace(/pi/g, 'π')
    .replace(/\bEE\b/g, 'EE');
});

const scientificRows = computed(() => scientificButtons());

const boardClass = computed(() => `calculator-board mode-${mode.value}`);
const resolvedExchangeSourceCurrency = computed(() => normalizeCurrencyCode(exchangeSourceCurrency.value) ?? 'CNY');
const resolvedExchangeTargetCurrency = computed(() => normalizeCurrencyCode(exchangeTargetCurrency.value) ?? 'USD');

const currentExpressionValue = computed(() => {
  const value = evaluateExpression(expression.value || lastResult.value, angleMode.value);
  return Number.isFinite(value) ? value : null;
});

const exchangeSourceCurrencyLabel = computed(() => getCurrencyName(resolvedExchangeSourceCurrency.value));
const exchangeTargetCurrencyLabel = computed(() => getCurrencyName(resolvedExchangeTargetCurrency.value));

const exchangeSourceAmount = computed(() => {
  const value = currentExpressionValue.value;
  return value === null ? null : value;
});

const exchangeTargetAmount = computed(() => {
  if (exchangeSourceAmount.value === null || exchangeRate.value === null) {
    return null;
  }

  return exchangeSourceAmount.value * exchangeRate.value;
});

const exchangeRateLabel = computed(() => {
  if (exchangeRate.value === null) {
    return '';
  }

  return `1 ${resolvedExchangeSourceCurrency.value} = ${formatCurrencyAmount(exchangeRate.value)} ${resolvedExchangeTargetCurrency.value}`;
});

function persistState() {
  persistedMode.value = convertMode.value ? 'convert' : mode.value;
  persistedAngle.value = angleMode.value;
  persistedMemory.value = memory.value;
  persistedBaseMode.value = mode.value;
  persistedConvertMode.value = convertMode.value;
}

function closeModeMenu() {
  modeMenuOpen.value = false;
}

onClickOutside(modeMenuRef, closeModeMenu);

onClickOutside(exchangePanelRef, () => {
  exchangeMenuOpen.value = null;
});

function setMode(next: CalculatorMode) {
  if (next === 'convert') {
    convertMode.value = !convertMode.value;
    modeMenuOpen.value = false;
    exchangeMenuOpen.value = null;
    persistState();
    if (convertMode.value) {
      void loadExchangeRate();
    }
    return;
  }

  mode.value = next;
  modeMenuOpen.value = false;
  exchangeMenuOpen.value = null;
  shift.value = false;
  persistState();
}

function toggleMode() {
  setMode(mode.value === 'basic' ? 'scientific' : 'basic');
}

function setExchangeCurrency(kind: 'source' | 'target', code: string) {
  if (kind === 'source') {
    exchangeSourceCurrency.value = code;
  }
  else {
    exchangeTargetCurrency.value = code;
  }

  exchangeMenuOpen.value = null;

  if (convertMode.value) {
    void loadExchangeRate();
  }
}

function swapExchangeCurrencies() {
  const source = exchangeSourceCurrency.value;
  exchangeSourceCurrency.value = exchangeTargetCurrency.value;
  exchangeTargetCurrency.value = source;
  exchangeMenuOpen.value = null;

  if (convertMode.value) {
    void loadExchangeRate();
  }
}

async function loadExchangeRate() {
  if (!convertMode.value) {
    return;
  }

  const fromCurrency = resolvedExchangeSourceCurrency.value;
  const toCurrency = resolvedExchangeTargetCurrency.value;

  if (fromCurrency === toCurrency) {
    exchangeRate.value = 1;
    exchangeLastRefreshed.value = new Date().toISOString();
    exchangeError.value = '';
    exchangeLoading.value = false;
    return;
  }

  const requestToken = ++exchangeRequestToken;
  exchangeLoading.value = true;
  exchangeError.value = '';

  try {
    const response = await fetch(`/exchange-rate?from=${encodeURIComponent(fromCurrency)}&to=${encodeURIComponent(toCurrency)}`);
    const payload = await response.json().catch(() => null) as { rate?: number; lastRefreshed?: string; error?: string; message?: string } | null;

    if (requestToken !== exchangeRequestToken) {
      return;
    }

    if (!response.ok) {
      throw new Error(payload?.message ?? payload?.error ?? '汇率加载失败');
    }

    if (typeof payload?.rate !== 'number' || !Number.isFinite(payload.rate)) {
      throw new Error('汇率数据无效');
    }

    exchangeRate.value = payload.rate;
    exchangeLastRefreshed.value = payload.lastRefreshed ?? '';
  }
  catch (error) {
    if (requestToken !== exchangeRequestToken) {
      return;
    }

    exchangeRate.value = null;
    exchangeLastRefreshed.value = '';
    exchangeError.value = error instanceof Error ? error.message : '汇率加载失败';
  }
  finally {
    if (requestToken === exchangeRequestToken) {
      exchangeLoading.value = false;
    }
  }
}

function applyAction(action: CalculatorAction) {
  switch (action.type) {
    case 'append':
      expression.value = appendToken(expression.value, action.value);
      break;
    case 'clear':
      expression.value = clearExpression();
      lastResult.value = '0';
      break;
    case 'backspace':
      expression.value = backspaceExpression(expression.value);
      break;
    case 'evaluate': {
      const result = evaluateExpression(expression.value, angleMode.value);
      if (Number.isFinite(result)) {
        lastResult.value = formatDisplayNumber(result);
        expression.value = lastResult.value;
      }
      else {
        lastResult.value = '错误';
      }
      break;
    }
    case 'percent':
      expression.value = percentExpression(expression.value);
      break;
    case 'toggle-sign':
      expression.value = toggleSignExpression(expression.value);
      break;
    case 'toggle-mode':
      toggleMode();
      break;
    case 'set-mode':
      setMode(action.value);
      break;
    case 'toggle-shift':
      shift.value = !shift.value;
      break;
    case 'toggle-angle':
      angleMode.value = angleMode.value === 'rad' ? 'deg' : 'rad';
      persistState();
      break;
    case 'memory-clear':
      memory.value = 0;
      persistState();
      break;
    case 'memory-add': {
      const value = evaluateExpression(expression.value || lastResult.value, angleMode.value);
      if (Number.isFinite(value)) {
        memory.value += value;
        persistState();
      }
      break;
    }
    case 'memory-subtract': {
      const value = evaluateExpression(expression.value || lastResult.value, angleMode.value);
      if (Number.isFinite(value)) {
        memory.value -= value;
        persistState();
      }
      break;
    }
    case 'memory-recall':
      expression.value = formatDisplayNumber(memory.value);
      break;
  }
}

function keyToAction(key: string): CalculatorAction | null {
  if (key >= '0' && key <= '9') {
    return { type: 'append', value: key };
  }

  const keyMap: Record<string, CalculatorAction> = {
    '.': { type: 'append', value: '.' },
    '+': { type: 'append', value: '+' },
    '-': { type: 'append', value: '−' },
    '*': { type: 'append', value: '×' },
    '/': { type: 'append', value: '÷' },
    '%': { type: 'percent' },
    Enter: { type: 'evaluate' },
    Escape: { type: 'clear' },
    Backspace: { type: 'backspace' },
    '(': { type: 'append', value: '(' },
    ')': { type: 'append', value: ')' },
  };

  return keyMap[key] ?? null;
}

function onKeydown(event: KeyboardEvent) {
  const action = keyToAction(event.key);
  if (!action) {
    return;
  }

  event.preventDefault();
  applyAction(action);
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
});

watch([mode, angleMode, memory, convertMode], persistState);

watch(convertMode, () => {
  closeModeMenu();
  exchangeMenuOpen.value = null;
  if (convertMode.value) {
    void loadExchangeRate();
  }
});

watch([exchangeSourceCurrency, exchangeTargetCurrency], () => {
  if (convertMode.value) {
    void loadExchangeRate();
  }
}, { immediate: true });
</script>

<template>
  <div class="calculator-shell">
    <div class="calculator-frame" :class="{ 'convert-layout': convertMode }">
      <div class="topbar">
        <div class="traffic-lights" aria-hidden="true">
          <span class="traffic-light close" />
          <span class="traffic-light minimize" />
          <span class="traffic-light zoom" />
        </div>

        <button class="mode-pill" type="button" aria-label="切换计算器模式" @click="toggleMode">
          <n-icon size="24" :component="LayoutSidebarLeftCollapse" />
        </button>

        <div class="topbar-spacer" />

        <div ref="modeMenuRef" class="mode-trigger">
          <button class="mode-pill right" type="button" aria-label="打开模式菜单" @click="modeMenuOpen = !modeMenuOpen">
            <n-icon size="24" :component="Calculator" />
          </button>

          <transition name="fade-scale">
            <div v-if="modeMenuOpen" class="mode-menu">
              <button class="mode-menu-item" :class="{ active: mode === 'basic' }" type="button" @click="setMode('basic')">
                <n-icon v-if="mode === 'basic'" size="18" :component="Check" />
                <n-icon size="18" :component="Calculator" />
                <span>基础</span>
              </button>
              <button class="mode-menu-item" :class="{ active: mode === 'scientific' }" type="button" @click="setMode('scientific')">
                <n-icon v-if="mode === 'scientific'" size="18" :component="Check" />
                <n-icon size="18" :component="Math" />
                <span>科学</span>
              </button>
              <button class="mode-menu-item" :class="{ active: convertMode }" type="button" @click="setMode('convert')">
                <n-icon v-if="convertMode" size="18" :component="Check" />
                <n-icon size="18" :component="ArrowsLeftRight" />
                <span>转换</span>
              </button>
            </div>
          </transition>
        </div>
      </div>

      <div v-if="!convertMode" class="display-area">
        <button class="swap-button" type="button" :aria-label="mode === 'basic' ? '切换到科学计算器' : '切换到基础计算器'" @click="toggleMode">
          <n-icon size="18" :component="ArrowsLeftRight" />
        </button>

        <div class="display-stack">
          <div v-if="expressionPreview" class="display-expression">
            {{ expressionPreview }}
          </div>
          <div v-else class="display-expression ghost">
            &nbsp;
          </div>
          <div class="display-value">
            {{ currentValue }}
          </div>
          <div v-if="mode === 'scientific'" class="display-subvalue">
            {{ memory !== 0 ? `M ${formatDisplayNumber(memory)}` : `模式：${angleMode === 'rad' ? 'Rad' : 'Deg'}` }}
          </div>
        </div>
      </div>

      <div v-else ref="exchangePanelRef" class="display-area convert-display-area">
        <div class="converter-panel">
          <div class="converter-entry top">
            <div class="converter-value">{{ currentValue }}</div>
            <button class="converter-currency" type="button" :aria-label="`选择源货币，当前为 ${resolvedExchangeSourceCurrency}`" @click="exchangeMenuOpen = exchangeMenuOpen === 'source' ? null : 'source'">
              <span class="converter-currency-code">{{ resolvedExchangeSourceCurrency }}</span>
              <span class="converter-currency-name">{{ exchangeSourceCurrencyLabel }}</span>
              <n-icon size="14" :component="ChevronDown" />
            </button>

            <transition name="fade-scale">
              <div v-if="exchangeMenuOpen === 'source'" class="currency-menu">
                <button
                  v-for="option in currencyOptions"
                  :key="option.code"
                  class="currency-menu-item"
                  :class="{ active: resolvedExchangeSourceCurrency === option.code }"
                  type="button"
                  @click="setExchangeCurrency('source', option.code)"
                >
                  <span class="currency-menu-label">{{ option.name }}</span>
                  <span class="currency-menu-code">{{ option.code }}</span>
                  <n-icon v-if="resolvedExchangeSourceCurrency === option.code" size="16" :component="Check" />
                </button>
              </div>
            </transition>
          </div>

          <div class="converter-divider-row">
            <button class="converter-swap" type="button" aria-label="交换单位" title="交换单位" @click="swapExchangeCurrencies">
              <n-icon size="18" :component="ArrowsUpDown" />
            </button>
            <div class="converter-divider" />
          </div>

          <div class="converter-entry bottom">
            <div class="converter-value target">
              {{ exchangeTargetAmount === null ? '—' : formatCurrencyAmount(exchangeTargetAmount) }}
            </div>
            <button class="converter-currency" type="button" :aria-label="`选择目标货币，当前为 ${resolvedExchangeTargetCurrency}`" @click="exchangeMenuOpen = exchangeMenuOpen === 'target' ? null : 'target'">
              <span class="converter-currency-code">{{ resolvedExchangeTargetCurrency }}</span>
              <span class="converter-currency-name">{{ exchangeTargetCurrencyLabel }}</span>
              <n-icon size="14" :component="ChevronDown" />
            </button>

            <transition name="fade-scale">
              <div v-if="exchangeMenuOpen === 'target'" class="currency-menu right">
                <button
                  v-for="option in currencyOptions"
                  :key="option.code"
                  class="currency-menu-item"
                  :class="{ active: resolvedExchangeTargetCurrency === option.code }"
                  type="button"
                  @click="setExchangeCurrency('target', option.code)"
                >
                  <span class="currency-menu-label">{{ option.name }}</span>
                  <span class="currency-menu-code">{{ option.code }}</span>
                  <n-icon v-if="resolvedExchangeTargetCurrency === option.code" size="16" :component="Check" />
                </button>
              </div>
            </transition>
          </div>

          <div class="converter-meta">
            <span v-if="exchangeLoading">正在更新汇率…</span>
            <span v-else-if="exchangeError">{{ exchangeError }}</span>
            <span v-else-if="exchangeRateLabel">{{ exchangeRateLabel }}</span>
            <span v-else>选择货币后自动更新</span>
            <span v-if="exchangeLastRefreshed" class="converter-meta-time">
              {{ `更新于 ${new Date(exchangeLastRefreshed).toLocaleString('zh-CN', { hour12: false })}` }}
            </span>
          </div>
        </div>
      </div>

      <div class="keypad" :class="boardClass">
        <template v-if="mode === 'basic'">
          <div
            v-for="(row, rowIndex) in basicButtons"
            :key="rowIndex"
            class="key-row basic-row"
          >
            <span v-for="placeholder in 6" :key="placeholder" class="key-placeholder" aria-hidden="true" />
            <button
              v-for="button in row"
              :key="button.label"
              class="key"
              :class="[
                `tone-${button.tone ?? 'number'}`,
                { 'span-2': button.span === 2 },
              ]"
              type="button"
              @click="applyAction(button.action)"
            >
              {{ button.label }}
            </button>
          </div>
        </template>

        <template v-else>
          <div v-for="(row, rowIndex) in scientificRows" :key="rowIndex" class="key-row scientific-row">
            <button
              v-for="button in row"
              :key="button.label"
              class="key"
              :class="`tone-${button.tone ?? 'memory'}`"
              type="button"
              @click="applyAction(button.action)"
            >
              {{ button.label }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="less">
:global(body) {
  margin: 0;
  min-height: 100vh;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Helvetica Neue', sans-serif;
  background:
    radial-gradient(circle at 15% 10%, rgba(255, 255, 255, 0.14), transparent 34%),
    radial-gradient(circle at 80% 15%, rgba(255, 255, 255, 0.08), transparent 28%),
    linear-gradient(180deg, #201d1f 0%, #161314 100%);
  color: #f5f2ef;
}

.calculator-shell {
  min-height: 100vh;
  padding: 24px;
  display: grid;
  place-items: center;
}

.calculator-frame {
  position: relative;
  width: min(100%, 1120px);
  height: calc(100vh - 48px);
  max-height: 1180px;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 32px;
  padding: 14px 14px 16px;
  background:
    radial-gradient(circle at top, rgba(255, 255, 255, 0.045), transparent 56%),
    linear-gradient(180deg, #2d282a 0%, #231f21 100%);
  box-shadow:
    0 22px 56px rgba(0, 0, 0, 0.48),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.18);
}

.calculator-frame.convert-layout {
  display: flex;
  flex-direction: column;
}

.topbar {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 50px;
}

.traffic-lights {
  display: flex;
  gap: 12px;
  align-items: center;
}

.traffic-light {
  width: 26px;
  height: 26px;
  border-radius: 999px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24);
}

.close {
  background: #ff5f57;
}

.minimize {
  background: #ffbd2e;
}

.zoom {
  background: #5f5f61;
}

.topbar-spacer {
  flex: 1;
}

.mode-pill {
  width: 56px;
  height: 56px;
  padding: 0;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(245, 242, 239, 0.94);
  display: grid;
  place-items: center;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.mode-pill.right {
  margin-left: auto;
}

.mode-trigger {
  position: relative;
}

.mode-menu {
  position: absolute;
  top: calc(100% + 12px);
  right: 0;
  z-index: 10;
  min-width: 235px;
  padding: 14px 10px 12px;
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(84, 80, 82, 0.94);
  backdrop-filter: blur(24px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.45);
}

.mode-menu-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: 0;
  border-radius: 16px;
  padding: 13px 12px;
  background: transparent;
  color: rgba(246, 243, 239, 0.96);
  font-size: 18px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  &:hover,
  &.active {
    background: rgba(255, 255, 255, 0.12);
  }

  :deep(svg:first-child) {
    opacity: 0.96;
  }

  :deep(svg:nth-child(2)) {
    opacity: 0.92;
  }
}

.display-area {
  position: relative;
  min-height: 190px;
  padding: 18px 2px 6px;
}

.swap-button {
  position: absolute;
  left: -2px;
  bottom: 30px;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  color: #ff9f0a;
  background: transparent;
  cursor: pointer;
}

.display-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
  padding-left: 64px;
}

.display-expression {
  min-height: 28px;
  color: rgba(255, 255, 255, 0.65);
  font-size: 22px;
  line-height: 1.1;
  letter-spacing: 0.02em;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.display-expression.ghost {
  opacity: 0;
}

.display-value {
  color: rgba(255, 255, 255, 0.95);
  font-size: clamp(52px, 6.8vw, 78px);
  font-weight: 300;
  line-height: 0.95;
  letter-spacing: -0.05em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.display-subvalue {
  min-height: 24px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 18px;
  font-weight: 500;
}

.convert-display-area {
  min-height: 0;
  flex: 1 1 auto;
  padding-top: 10px;
}

.converter-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 100%;
  padding-bottom: 12px;
}

.converter-entry {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.converter-value {
  color: rgba(255, 255, 255, 0.94);
  font-size: clamp(40px, 6vw, 72px);
  font-weight: 300;
  line-height: 0.95;
  letter-spacing: -0.05em;
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.converter-value.target {
  color: rgba(255, 255, 255, 0.92);
}

.converter-currency {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  padding: 0;
  background: transparent;
  color: rgba(255, 255, 255, 0.56);
  cursor: pointer;
  font-family: inherit;
}

.converter-currency-code {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.converter-currency-name {
  font-size: 13px;
  font-weight: 500;
  opacity: 0.9;
}

.converter-divider-row {
  position: relative;
  display: grid;
  grid-template-columns: 24px 1fr;
  align-items: center;
  gap: 6px;
  min-height: 24px;
}

.converter-divider {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.085);
}

.converter-swap {
  width: 22px;
  height: 22px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 159, 10, 0.82);
  cursor: pointer;
  padding: 0;
  display: grid;
  place-items: center;
  justify-self: start;
  margin-left: -1px;

  &:hover {
    color: rgba(255, 159, 10, 0.96);
  }
}

.currency-menu {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 12;
  min-width: 320px;
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  border-radius: 22px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(70, 66, 68, 0.96);
  backdrop-filter: blur(22px);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.42);
}

.currency-menu.right {
  right: 0;
}

.currency-menu-item {
  width: 100%;
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 10px;
  border: 0;
  border-radius: 14px;
  padding: 12px 12px;
  background: transparent;
  color: rgba(246, 243, 239, 0.96);
  font-size: 16px;
  font-weight: 600;
  text-align: left;
  cursor: pointer;

  &:hover,
  &.active {
    background: rgba(255, 255, 255, 0.12);
  }
}

.currency-menu-label {
  text-align: left;
}

.currency-menu-code {
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  font-weight: 600;
}

.converter-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  color: rgba(255, 255, 255, 0.48);
  font-size: 12px;
  line-height: 1.05;
  margin-top: 2px;
}

.converter-meta-time {
  color: rgba(255, 255, 255, 0.36);
  font-size: 11px;
}

.keypad {
  display: grid;
  gap: 10px;
}

.calculator-frame.convert-layout .keypad {
  margin-top: 16px;
  padding-top: 2px;
  padding-bottom: 2px;
}

.mode-basic {
  width: min(100%, 1120px);
  margin-inline: auto;
}

.mode-scientific {
  width: min(100%, 1120px);
  margin-inline: auto;
}

.mode-convert {
  width: min(100%, 1120px);
  margin-inline: auto;
}

.key-row {
  display: grid;
  gap: 10px;
}

.scientific-row {
  grid-template-columns: repeat(10, minmax(0, 1fr));
}

.mode-basic .key-row {
  grid-template-columns: repeat(10, minmax(0, 1fr));
}

.key-placeholder {
  aspect-ratio: 1;
  border-radius: 999px;
  visibility: hidden;
}

.key {
  border: 0;
  border-radius: 999px;
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  color: #f5f2ef;
  font-size: 28px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.12s ease, filter 0.12s ease, background-color 0.12s ease;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.12),
    inset 0 -1px 0 rgba(0, 0, 0, 0.12);

  &:active {
    transform: scale(0.98);
    filter: brightness(1.08);
  }
}

.tone-number {
  background: #605c5f;
}

.tone-memory {
  background: #3d383b;
}

.tone-utility {
  background: #a09b9f;
  color: #222;
}

.tone-selected {
  background: #f0c36a;
  color: #1b1718;
}

.tone-operator,
.tone-equals {
  background: #ff9f0a;
  color: white;
}

.span-2 {
  grid-column: span 2;
  justify-content: flex-start;
  padding-left: 28px;
}

.mode-scientific .key {
  aspect-ratio: 1;
  font-size: clamp(12px, 1.45vw, 18px);
}

.mode-scientific .tone-number {
  background: #5d595c;
}

.mode-scientific .tone-memory {
  background: #3c383a;
}

.mode-scientific .tone-utility {
  background: #a19ca0;
  color: #1d191b;
}

.mode-scientific .tone-selected {
  background: #efc75d;
  color: #1d191b;
}

.mode-scientific .tone-operator,
.mode-scientific .tone-equals {
  background: #ff9f0a;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}

@media (max-width: 980px) {
  .calculator-frame {
    padding: 12px;
    border-radius: 28px;
  }

  .scientific-row {
    gap: 8px;
  }

  .mode-scientific .key {
    font-size: 13px;
  }

  .display-area {
    min-height: 168px;
  }

  .calculator-frame.convert-layout .keypad {
    margin-top: 14px;
    padding-top: 0;
    padding-bottom: 0;
  }
}

@media (max-height: 820px) {
  .calculator-shell {
    padding: 8px;
  }

  .calculator-frame {
    padding: 8px 8px 10px;
    border-radius: 26px;
  }

  .topbar {
    min-height: 36px;
  }

  .traffic-lights {
    gap: 8px;
  }

  .traffic-light {
    width: 20px;
    height: 20px;
  }

  .mode-pill {
    width: 44px;
    height: 44px;
  }

  .display-area {
    min-height: 118px;
    padding: 8px 2px 2px;
  }

  .calculator-frame.convert-layout .display-area {
    min-height: 0;
  }

  .calculator-frame.convert-layout .convert-display-area {
    padding-top: 6px;
  }

  .converter-panel {
    gap: 6px;
    padding-bottom: 10px;
  }

  .display-stack {
    padding-left: 52px;
  }

  .display-expression {
    font-size: 17px;
  }

  .display-value {
    font-size: clamp(40px, 5.5vw, 58px);
  }

  .display-subvalue {
    font-size: 13px;
  }

  .converter-value {
    font-size: clamp(34px, 5vw, 48px);
  }

  .converter-currency-code {
    font-size: 14px;
  }

  .converter-currency-name {
    font-size: 11px;
  }

  .converter-meta {
    font-size: 11px;
  }

  .converter-meta-time {
    font-size: 10px;
  }

  .keypad {
    gap: 7px;
  }

  .key-row {
    gap: 7px;
  }

  .key {
    font-size: 22px;
  }

  .mode-basic .key {
    font-size: 22px;
  }

  .mode-basic {
    width: min(100%, 360px);
  }

  .mode-scientific .key {
    font-size: clamp(10px, 1vw, 13px);
  }

  .mode-scientific {
    width: min(100%, 940px);
  }

  .calculator-frame.convert-layout .keypad {
    gap: 6px;
    margin-top: 12px;
    padding-top: 0;
    padding-bottom: 0;
  }
}

@media (max-height: 960px) {
  .calculator-shell {
    padding: 12px;
  }

  .calculator-frame {
    padding: 10px 10px 12px;
    border-radius: 28px;
  }

  .topbar {
    min-height: 42px;
  }

  .traffic-lights {
    gap: 10px;
  }

  .traffic-light {
    width: 22px;
    height: 22px;
  }

  .mode-pill {
    width: 48px;
    height: 48px;
  }

  .display-area {
    min-height: 140px;
    padding: 12px 2px 4px;
  }

  .calculator-frame.convert-layout .display-area {
    min-height: 0;
  }

  .calculator-frame.convert-layout .convert-display-area {
    padding-top: 4px;
  }

  .converter-panel {
    gap: 6px;
    padding-bottom: 8px;
  }

  .converter-entry {
    gap: 2px;
  }

  .converter-value {
    font-size: clamp(34px, 5vw, 56px);
  }

  .converter-currency-code {
    font-size: 15px;
  }

  .converter-currency-name {
    font-size: 11px;
  }

  .converter-divider-row {
    min-height: 20px;
    gap: 4px;
  }

  .converter-meta {
    gap: 4px;
    margin-top: 0;
    font-size: 10px;
    line-height: 1;
  }

  .converter-meta-time {
    font-size: 9px;
  }

  .calculator-frame.convert-layout .keypad {
    margin-top: 8px;
    padding-top: 0;
    padding-bottom: 0;
    gap: 6px;
  }

  .key-row {
    gap: 6px;
  }
}
</style>
