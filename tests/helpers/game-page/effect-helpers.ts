import { Page } from '@playwright/test';

export async function gotoForEffect(
  page: Page,
  effectType: string,
  waitForGameStart: () => Promise<void>,
): Promise<void> {
  await page.goto(`/?test=1&effect=${effectType}`);
  await page.waitForLoadState('domcontentloaded');
  await waitForGameStart();
  await page.waitForTimeout(1000);
}

export async function getEffectDescription(page: Page): Promise<string> {
  return await page.locator('[data-testid="effect-description"]').textContent() ?? '';
}

export async function getEffectHint(page: Page): Promise<string> {
  return await page.locator('[data-testid="effect-hint"]').textContent() ?? '';
}

export async function hasConfirmButton(page: Page): Promise<boolean> {
  return await page.locator('[data-testid="confirm-effect-button"]').isVisible();
}

export async function hasSkipButton(page: Page): Promise<boolean> {
  return await page.locator('[data-testid="skip-effect-button"]').isVisible();
}

export async function hasLinePickButtons(page: Page): Promise<boolean> {
  return await page.locator('[data-testid^="line-pick-button-"]').first().isVisible();
}

export async function countLinePickButtons(page: Page): Promise<number> {
  return await page.locator('[data-testid^="line-pick-button-"]').count();
}

export async function isEffectResolutionActive(page: Page): Promise<boolean> {
  return await page.locator('[data-testid="effect-description"]').isVisible();
}
