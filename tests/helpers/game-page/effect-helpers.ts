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
  const fromMap = await page.evaluate(() => {
    const map = (window as any).__GAME_STATUS_TEXT_MAP__ as Record<string, string> | undefined;
    return map?.['effect-description'] ?? '';
  });
  if (fromMap) return fromMap;

  const fromDom = await page.locator('[data-testid="effect-description"]').textContent().catch(() => null);
  return fromDom ?? '';
}

export async function getEffectHint(page: Page): Promise<string> {
  const fromDom = await page.locator('[data-testid="effect-hint"]').textContent().catch(() => null);
  if (fromDom) return fromDom;

  const fromMap = await page.evaluate(() => {
    const map = (window as any).__GAME_STATUS_TEXT_MAP__ as Record<string, string> | undefined;
    return map?.['effect-hint'] ?? '';
  });
  return fromMap;
}

export async function hasConfirmButton(page: Page): Promise<boolean> {
  const visible = await page.locator('[data-testid="confirm-effect-button"]').isVisible().catch(() => false);
  if (visible) return true;

  return await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    const scene = game?.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return false;
    return scene.children.list.some((go: any) =>
      typeof go?.getData === 'function' && go.getData('testid') === 'confirm-effect-button'
    );
  });
}

export async function hasSkipButton(page: Page): Promise<boolean> {
  const visible = await page.locator('[data-testid="skip-effect-button"]').isVisible().catch(() => false);
  if (visible) return true;

  return await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    const scene = game?.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return false;
    return scene.children.list.some((go: any) =>
      typeof go?.getData === 'function' && go.getData('testid') === 'skip-effect-button'
    );
  });
}

export async function hasLinePickButtons(page: Page): Promise<boolean> {
  const visible = await page.locator('[data-testid^="line-pick-button-"]').first().isVisible().catch(() => false);
  if (visible) return true;

  return await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    const scene = game?.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return false;
    return scene.children.list.some((go: any) => {
      if (typeof go?.getData !== 'function') return false;
      const testId = go.getData('testid');
      return typeof testId === 'string' && testId.startsWith('line-pick-button-');
    });
  });
}

export async function countLinePickButtons(page: Page): Promise<number> {
  const fromDom = await page.locator('[data-testid^="line-pick-button-"]').count();
  if (fromDom > 0) return fromDom;

  return await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    const scene = game?.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return 0;
    return scene.children.list.filter((go: any) => {
      if (typeof go?.getData !== 'function') return false;
      const testId = go.getData('testid');
      return typeof testId === 'string' && testId.startsWith('line-pick-button-');
    }).length;
  });
}

export async function isEffectResolutionActive(page: Page): Promise<boolean> {
  const visible = await page.locator('[data-testid="effect-description"]').isVisible().catch(() => false);
  if (visible) return true;

  return await page.evaluate(() => {
    const map = (window as any).__GAME_STATUS_TEXT_MAP__ as Record<string, string> | undefined;
    return typeof map?.['effect-description'] === 'string' && map['effect-description'].length > 0;
  });
}
