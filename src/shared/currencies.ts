export interface CurrencyOption {
  code: string;
  name: string;
}

export const currencyOptions: CurrencyOption[] = [
  { code: 'USD', name: '美元' },
  { code: 'CNY', name: '人民币' },
  { code: 'EUR', name: '欧元' },
  { code: 'JPY', name: '日元' },
  { code: 'GBP', name: '英镑' },
  { code: 'HKD', name: '港币' },
  { code: 'SGD', name: '新加坡元' },
  { code: 'AUD', name: '澳元' },
  { code: 'CAD', name: '加拿大元' },
  { code: 'CHF', name: '瑞士法郎' },
  { code: 'KRW', name: '韩元' },
  { code: 'THB', name: '泰铢' },
  { code: 'MYR', name: '马来西亚林吉特' },
  { code: 'NZD', name: '新西兰元' },
  { code: 'AED', name: '阿联酋迪拉姆' },
  { code: 'TRY', name: '土耳其里拉' },
];

const currencyNameMap = new Map(currencyOptions.map(option => [option.code, option.name]));

export function normalizeCurrencyCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase();
  if (!code || !/^[A-Z]{3}$/.test(code)) {
    return null;
  }

  return code;
}

export function getCurrencyName(code: string) {
  return currencyNameMap.get(code) ?? code;
}

export function formatCurrencyAmount(value: number) {
  if (!Number.isFinite(value)) {
    return '错误';
  }

  return new Intl.NumberFormat('en-US', {
    useGrouping: true,
    maximumFractionDigits: 6,
  })
    .format(value)
    .replace(/(\.\d*?[1-9])0+$/, '$1')
    .replace(/\.0+$/, '');
}
