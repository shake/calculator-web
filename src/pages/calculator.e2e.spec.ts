import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

function createExchangeRateResponse(from: string, to: string) {
  if (from === 'CNY' && to === 'USD') {
    return { rate: 0.147, lastRefreshed: '2026-06-26T08:01:37.000Z' };
  }

  if (from === 'USD' && to === 'CNY') {
    return { rate: 6.802721, lastRefreshed: '2026-06-26T08:01:37.000Z' };
  }

  return { rate: 1, lastRefreshed: '2026-06-26T08:01:37.000Z' };
}

async function openConvertMode(page: Page) {
  await page.getByRole('button', { name: '打开模式菜单' }).click();
  await page.getByRole('button', { name: '汇率转换', exact: true }).click();
}

async function fillExpression(page: Page, value: string) {
  await page.getByRole('button', { name: 'AC' }).click();

  for (const digit of value) {
    await page.getByRole('button', { name: digit, exact: true }).click();
  }
}

async function expectFrameContainsKeypad(page: Page) {
  const frame = page.locator('.calculator-frame');
  const keypad = page.locator('.keypad');

  await expect(frame).toBeVisible();
  await expect(keypad).toBeVisible();

  const frameBox = await frame.boundingBox();
  const keypadBox = await keypad.boundingBox();

  expect(frameBox).not.toBeNull();
  expect(keypadBox).not.toBeNull();

  if (frameBox && keypadBox) {
    expect(keypadBox.y + keypadBox.height).toBeLessThanOrEqual(frameBox.y + frameBox.height + 1);
  }
}

async function getKeypadTop(page: Page) {
  const box = await page.locator('.keypad').boundingBox();
  expect(box).not.toBeNull();
  return box?.y ?? 0;
}

test.describe('Calculator page', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.route('**/exchange-rate**', async (route) => {
      const url = new URL(route.request().url());
      const from = url.searchParams.get('from') ?? '';
      const to = url.searchParams.get('to') ?? '';
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(createExchangeRateResponse(from, to)),
      });
    });
  });

  test('swaps currencies in convert mode from the basic calculator', async ({ page }) => {
    await page.goto('/');

    await fillExpression(page, '1000');
    await openConvertMode(page);

    await expect(page.getByRole('button', { name: /选择源货币，当前为 CNY/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /选择目标货币，当前为 USD/ })).toBeVisible();
    await expect(page.locator('.converter-swap')).toBeVisible();
    await expect(page.locator('.converter-entry.bottom .converter-value')).toContainText('147');

    await page.locator('.converter-swap').click();

    await expect(page.getByRole('button', { name: /选择源货币，当前为 USD/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /选择目标货币，当前为 CNY/ })).toBeVisible();
    await expect(page.locator('.converter-entry.bottom .converter-value')).toContainText('6,802.721');

    await expectFrameContainsKeypad(page);
  });

  test('keeps scientific keypad available while swapping currencies', async ({ page }) => {
    await page.goto('/');

    const basicKeypadTop = await getKeypadTop(page);
    await page.getByRole('button', { name: '打开模式菜单' }).click();
    await page.getByRole('button', { name: '科学', exact: true }).click();
    const scientificKeypadTop = await getKeypadTop(page);
    expect(scientificKeypadTop).toBeCloseTo(basicKeypadTop, 1);

    await expect(page.getByRole('button', { name: '2nd' })).toBeVisible();
    await expect(page.locator('.display-subvalue')).toHaveText(/模式：(Rad|Deg)/);

    await fillExpression(page, '1000');
    await openConvertMode(page);
    const convertKeypadTop = await getKeypadTop(page);
    expect(convertKeypadTop).toBeCloseTo(basicKeypadTop, 1);

    await expect(page.getByRole('button', { name: '2nd' })).toBeVisible();
    await expect(page.locator('.converter-swap')).toBeVisible();
    await expect(page.getByRole('button', { name: /选择源货币，当前为 CNY/ })).toBeVisible();
    await expect(page.locator('.converter-entry.bottom .converter-value')).toContainText('147');

    await page.locator('.converter-swap').click();

    await expect(page.getByRole('button', { name: '2nd' })).toBeVisible();
    await expect(page.getByRole('button', { name: /选择源货币，当前为 USD/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /选择目标货币，当前为 CNY/ })).toBeVisible();
    await expect(page.locator('.converter-entry.bottom .converter-value')).toContainText('6,802.721');

    await expectFrameContainsKeypad(page);
  });
});
