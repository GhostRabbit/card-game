import { Page } from '@playwright/test';

async function getCanvasPointByPredicate(
  page: Page,
  predicateSource: string,
  arg: unknown,
): Promise<{ x: number; y: number } | null> {
  return await page.evaluate(({ predicateSource: src, arg: input }) => {
    const game = (window as any).__PHASER_GAME__;
    if (!game) return null;

    const scene = game.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return null;

    const predicate = new Function('go', 'arg', src) as (go: any, arg: any) => boolean;
    const target = scene.children.list.find((go: any) => predicate(go, input));
    if (!target) return null;

    let worldX = target.x ?? 0;
    let worldY = target.y ?? 0;
    if (typeof target.getBounds === 'function') {
      const b = target.getBounds();
      if (b) {
        worldX = b.centerX ?? (b.x + b.width / 2);
        worldY = b.centerY ?? (b.y + b.height / 2);
      }
    }

    const canvas = game.canvas as HTMLCanvasElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const worldW = scene.scale?.width ?? game.config.width ?? 1600;
    const worldH = scene.scale?.height ?? game.config.height ?? 720;

    return {
      x: rect.left + worldX * (rect.width / worldW),
      y: rect.top + worldY * (rect.height / worldH),
    };
  }, { predicateSource, arg });
}

export async function clickCanvasObjectByTestId(page: Page, testId: string, index = 0): Promise<boolean> {
  const point = await page.evaluate(({ id, idx }) => {
    const game = (window as any).__PHASER_GAME__;
    if (!game) return null;

    const scene = game.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return null;

    const matches = scene.children.list.filter((go: any) =>
      typeof go?.getData === 'function' && go.getData('testid') === id
    );
    const target = matches[idx];
    if (!target) return null;

    let worldX = target.x ?? 0;
    let worldY = target.y ?? 0;
    if (typeof target.getBounds === 'function') {
      const b = target.getBounds();
      if (b) {
        worldX = b.centerX ?? (b.x + b.width / 2);
        worldY = b.centerY ?? (b.y + b.height / 2);
      }
    }

    const canvas = game.canvas as HTMLCanvasElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const worldW = scene.scale?.width ?? game.config.width ?? 1600;
    const worldH = scene.scale?.height ?? game.config.height ?? 720;

    return {
      x: rect.left + worldX * (rect.width / worldW),
      y: rect.top + worldY * (rect.height / worldH),
    };
  }, { id: testId, idx: index });

  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}

export async function hoverCanvasObjectByTestId(page: Page, testId: string, index = 0): Promise<boolean> {
  const point = await page.evaluate(({ id, idx }) => {
    const game = (window as any).__PHASER_GAME__;
    if (!game) return null;

    const scene = game.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return null;

    const matches = scene.children.list.filter((go: any) =>
      typeof go?.getData === 'function' && go.getData('testid') === id
    );
    const target = matches[idx];
    if (!target) return null;

    let worldX = target.x ?? 0;
    let worldY = target.y ?? 0;
    if (typeof target.getBounds === 'function') {
      const b = target.getBounds();
      if (b) {
        worldX = b.centerX ?? (b.x + b.width / 2);
        worldY = b.centerY ?? (b.y + b.height / 2);
      }
    }

    const canvas = game.canvas as HTMLCanvasElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const worldW = scene.scale?.width ?? game.config.width ?? 1600;
    const worldH = scene.scale?.height ?? game.config.height ?? 720;

    return {
      x: rect.left + worldX * (rect.width / worldW),
      y: rect.top + worldY * (rect.height / worldH),
    };
  }, { id: testId, idx: index });

  if (!point) return false;
  await page.mouse.move(point.x, point.y);
  return true;
}

export async function clickCanvasBoardCard(
  page: Page,
  lineIndex: number,
  isOpponent = false,
  position = 0,
): Promise<boolean> {
  const point = await page.evaluate(({ li, opp, pos }) => {
    const game = (window as any).__PHASER_GAME__;
    if (!game) return null;
    const scene = game.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return null;

    const target = scene.children.list.find((go: any) =>
      typeof go?.getData === 'function' &&
      go.getData('testid') === 'board-card' &&
      go.getData('line') === li &&
      go.getData('isOwn') === !opp &&
      go.getData('position') === pos
    );
    if (!target) return null;

    let worldX = target.x ?? 0;
    let worldY = target.y ?? 0;
    if (typeof target.getBounds === 'function') {
      const b = target.getBounds();
      if (b) {
        worldX = b.centerX ?? (b.x + b.width / 2);
        worldY = b.centerY ?? (b.y + b.height / 2);
      }
    }

    const canvas = game.canvas as HTMLCanvasElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const worldW = scene.scale?.width ?? game.config.width ?? 1600;
    const worldH = scene.scale?.height ?? game.config.height ?? 720;

    return {
      x: rect.left + worldX * (rect.width / worldW),
      y: rect.top + worldY * (rect.height / worldH),
    };
  }, { li: lineIndex, opp: isOpponent, pos: position });

  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}

export async function clickFirstInteractiveBoardCard(page: Page): Promise<boolean> {
  const point = await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    if (!game) return null;
    const scene = game.scene?.getScene?.('GameScene');
    if (!scene?.children?.list) return null;

    const cards = scene.children.list.filter((go: any) =>
      typeof go?.getData === 'function' &&
      go.getData('testid') === 'board-card' &&
      !!go.input?.enabled
    );
    const target = cards[0];
    if (!target) return null;

    let worldX = target.x ?? 0;
    let worldY = target.y ?? 0;
    if (typeof target.getBounds === 'function') {
      const b = target.getBounds();
      if (b) {
        worldX = b.centerX ?? (b.x + b.width / 2);
        worldY = b.centerY ?? (b.y + b.height / 2);
      }
    }

    const canvas = game.canvas as HTMLCanvasElement;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const worldW = scene.scale?.width ?? game.config.width ?? 1600;
    const worldH = scene.scale?.height ?? game.config.height ?? 720;

    return {
      x: rect.left + worldX * (rect.width / worldW),
      y: rect.top + worldY * (rect.height / worldH),
    };
  });

  if (!point) return false;
  await page.mouse.click(point.x, point.y);
  return true;
}

export async function getFocusPanelCardNameFallback(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const game = (window as any).__PHASER_GAME__;
    if (!game) return null;
    const scene = game.scene?.getScene?.('GameScene');
    if (!scene) return null;

    const group = (scene as any).focusPanelGroup;
    const children = group?.getChildren?.() ?? [];
    const banned = new Set([
      'CARD DETAIL', 'CONTROL TOKEN', 'PHASE', 'OPP REVEALED', 'FACE DOWN',
    ]);

    const candidates = children
      .filter((go: any) => typeof go?.text === 'string')
      .map((go: any) => {
        const raw = String(go.text ?? '').trim();
        const fontSizeRaw = String(go.style?.fontSize ?? '0').replace('px', '');
        const fontSize = Number.parseInt(fontSizeRaw, 10) || 0;
        return { raw, fontSize };
      })
      .filter((t: any) => t.raw.length > 0)
      .filter((t: any) => !t.raw.includes('\n'))
      .filter((t: any) => !banned.has(t.raw))
      .filter((t: any) => !/^\d+$/.test(t.raw))
      .sort((a: any, b: any) => b.fontSize - a.fontSize);

    return candidates[0]?.raw ?? null;
  });
}
