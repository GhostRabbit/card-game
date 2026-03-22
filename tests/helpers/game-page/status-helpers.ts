import { Page } from '@playwright/test';

export async function getStatusText(page: Page, id: string): Promise<string | null> {
  return await page.evaluate((statusId) => {
    const map = (window as any).__GAME_STATUS_TEXT_MAP__ as Record<string, string> | undefined;
    if (!map) return null;
    return map[statusId] ?? null;
  }, id);
}

export async function getStatusTextMap(page: Page): Promise<Record<string, string>> {
  return await page.evaluate(() => {
    return ((window as any).__GAME_STATUS_TEXT_MAP__ as Record<string, string> | undefined) ?? {};
  });
}
