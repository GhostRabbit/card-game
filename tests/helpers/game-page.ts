import { Page, expect } from '@playwright/test';
import {
  clickCanvasBoardCard,
  clickCanvasObjectByTestId,
  clickFirstInteractiveBoardCard,
  getFocusPanelCardNameFallback,
  hoverCanvasObjectByTestId,
} from './game-page/canvas-helpers';
import {
  countLinePickButtons,
  getEffectDescription,
  getEffectHint,
  gotoForEffect,
  hasConfirmButton,
  hasLinePickButtons,
  hasSkipButton,
  isEffectResolutionActive,
} from './game-page/effect-helpers';
import { getStatusText, getStatusTextMap } from './game-page/status-helpers';

/**
 * Page Object Model for the Game Board
 * Encapsulates all UI interactions with the game
 */
export class GamePage {
  constructor(private _page: Page) {}

  private async clickCanvasObjectByTestId(testId: string, index: number = 0): Promise<boolean> {
    return await clickCanvasObjectByTestId(this._page, testId, index);
  }

  /** Get the underlying Playwright Page for advanced operations */
  get page(): Page {
    return this._page;
  }

  async goto(testMode: boolean = true) {
    const url = testMode ? '/?test=1' : '/';
    // Navigate to the URL
    await this._page.goto(url);
    // For test mode, wait for the app to fully load and initialize MockGameScene
    await this._page.waitForLoadState(testMode ? 'domcontentloaded' : 'networkidle');
    // Give the game engine a moment to initialize
    await this._page.waitForTimeout(1000);
  }

  async waitForGameStart() {
    const waitOnce = async () => {
      // Wait until test infrastructure is ready and phase chips are present
      await this.page.waitForSelector('[data-testid="game-container"]', { timeout: 15000 });
      await this.page.waitForSelector('[data-testid="phase-START"]', { timeout: 15000 });
      // Keep the selector-based mapping in sync by giving Phaser a moment
      await this.page.waitForTimeout(100);
    };

    try {
      await waitOnce();
    } catch {
      // Rare startup race in CI/local runs: reload once and retry.
      await this.page.reload({ waitUntil: 'domcontentloaded' });
      await waitOnce();
    }
  }

  async getCardsInHand(): Promise<number> {
    const cards = await this.page.locator('[data-testid="card-in-hand"]').count();
    return cards;
  }

  async selectCard(index: number) {
    const card = this.page.locator('[data-testid="card-in-hand"]').nth(index);
    await card.click({ force: true });
    await this.page.waitForTimeout(100); // Allow animation
  }

  async isCardSelected(index: number): Promise<boolean> {
    const card = this.page.locator('[data-testid="card-in-hand"]').nth(index);
    return (await card.getAttribute('data-selected')) === 'true';
  }

  async playCardToLine(lineIndex: number) {
    const zone = this.page.locator(`[data-testid="own-line-zone"][data-line="${lineIndex}"]`);
    await zone.click({ force: true });
    await this.page.waitForTimeout(300); // Allow card to animate into place
  }

  async playCardFaceDown(lineIndex: number) {
    // Toggle face-down mode first
    await this.toggleFaceDownMode();
    // Then play to line
    await this.playCardToLine(lineIndex);
    // Toggle face-down mode off
    await this.toggleFaceDownMode();
  }

  async toggleFaceDownMode() {
    const button = this.page.locator('[data-testid="toggle-face-down"]');
    await button.click({ force: true });
    await this.page.waitForTimeout(100);
  }

  async getLineCardCount(lineIndex: number, isOpponent: boolean = false): Promise<number> {
    const prefix = isOpponent ? 'opp' : 'own';
    const cards = await this.page.locator(`[data-testid="${prefix}-line"][data-line="${lineIndex}"] [data-testid="board-card"]`).count();
    return cards;
  }

  async getLineValue(lineIndex: number, isOpponent: boolean = false): Promise<number> {
    const prefix = isOpponent ? 'opp' : 'own';
    const text = await this.page.locator(`[data-testid="${prefix}-line"][data-line="${lineIndex}"] [data-testid="line-value"]`).textContent();
    return text ? parseInt(text) : 0;
  }

  async clickReset() {
    const button = this.page.locator('[data-testid="reset-button"]');
    await button.click({ force: true });
    await this.page.waitForTimeout(200);
  }

  async getActivePhase(): Promise<string> {
    const active = this.page.locator('[data-testid^="phase-"][data-phase-active="true"]');
    const testId = await active.first().getAttribute('data-testid');
    return testId?.replace('phase-', '') || 'UNKNOWN';
  }

  async waitForPhase(phase: string, timeout: number = 5000) {
    await this.page.waitForSelector(`[data-testid="phase-${phase}"][data-phase-active="true"]`, { timeout });
  }

  async waitForOpponentTurn(timeout: number = 5000) {
    await this.page.waitForSelector('[data-testid="opponent-turn-status"]', { timeout });
  }

  async getYourTurnStatus(): Promise<string> {
    const status = this.page.locator('[data-testid="your-turn-status"]');
    return await status.textContent() || '';
  }

  async hoverOverCard(index: number) {
    const card = this.page.locator('[data-testid="card-in-hand"]').nth(index);
    try {
      await card.hover({ timeout: 1000 });
    } catch {
      const hovered = await hoverCanvasObjectByTestId(this._page, 'card-in-hand', index);
      if (!hovered) throw new Error('Unable to locate hand card hover point in Phaser scene.');
    }
    await this.page.waitForTimeout(300); // Wait for focus panel to update
  }

  async getFocusPanelCardName(): Promise<string | null> {
    const name = this.page.locator('[data-testid="focus-panel-card-name"]');
    if (await name.count()) {
      return await name.first().textContent();
    }
    return await getFocusPanelCardNameFallback(this._page);
  }

  async compileToLine(lineIndex: number) {
    const button = this.page.locator(`[data-testid="compile-button-line-${lineIndex}"]`);
    if (await button.isVisible()) {
      await button.click();
      await this.page.waitForTimeout(500);
    }
  }

  async skipCompile() {
    const button = this.page.locator('[data-testid="skip-compile-button"]');
    if (await button.isVisible()) {
      await button.click();
      await this.page.waitForTimeout(200);
    }
  }

  async resolveEffect(targetAction?: string) {
    if (targetAction === 'discard') {
      // Click a card to discard
      const card = this.page.locator('[data-testid="card-in-hand"]').first();
      await card.click();
    }

    // Click confirm/skip button
    const button = this.page.locator('[data-testid="confirm-effect-button"]');
    if (await button.isVisible()) {
      await button.click();
      await this.page.waitForTimeout(300);
    }
  }

  async skipEffect() {
    const button = this.page.locator('[data-testid="skip-effect-button"]');
    if (await button.isVisible()) {
      await button.click();
      await this.page.waitForTimeout(200);
    }
  }

  async screenshotBoard(name: string) {
    await this.page.screenshot({ path: `./test-results/${name}.png` });
  }

  // ── Effect-resolution helpers ───────────────────────────────────────────

  /** Navigate to a game scene pre-loaded with the given effect type pending. */
  async gotoForEffect(effectType: string) {
    await gotoForEffect(this._page, effectType, () => this.waitForGameStart());
  }

  /** Text content of the effect description label (card name ▸ description). */
  async getEffectDescription(): Promise<string> {
    return await getEffectDescription(this._page);
  }

  /** Text content of the effect action-hint (what the player must do). */
  async getEffectHint(): Promise<string> {
    return await getEffectHint(this._page);
  }

  /** True when the CONFIRM button is visible (auto-execute effects). */
  async hasConfirmButton(): Promise<boolean> {
    return await hasConfirmButton(this._page);
  }

  /** True when the SKIP button is visible (optional effects). */
  async hasSkipButton(): Promise<boolean> {
    return await hasSkipButton(this._page);
  }

  /** Click the CONFIRM effect button. */
  async clickConfirmEffect() {
    const clicked = await this.clickCanvasObjectByTestId('confirm-effect-button');
    if (!clicked) {
      await this._page.locator('[data-testid="confirm-effect-button"]').click({ force: true });
    }
    await this._page.waitForTimeout(200);
  }

  /** Click the SKIP effect button. */
  async clickSkipEffect() {
    const clicked = await this.clickCanvasObjectByTestId('skip-effect-button');
    if (!clicked) {
      await this._page.locator('[data-testid="skip-effect-button"]').click({ force: true });
    }
    await this._page.waitForTimeout(200);
  }

  /** Click a line-pick button (0, 1, or 2). */
  async clickLinePickButton(lineIndex: number) {
    const clicked = await this.clickCanvasObjectByTestId(`line-pick-button-${lineIndex}`);
    if (!clicked) {
      await this._page.locator(`[data-testid="line-pick-button-${lineIndex}"]`).first().click({ force: true });
    }
    await this._page.waitForTimeout(200);
  }

  /** True when at least one line-pick button is visible. */
  async hasLinePickButtons(): Promise<boolean> {
    return await hasLinePickButtons(this._page);
  }

  /** Number of visible line-pick buttons. */
  async countLinePickButtons(): Promise<number> {
    return await countLinePickButtons(this._page);
  }

  /** Click the nth card in hand (for effect targeting). */
  async clickHandCardForEffect(index: number) {
    const clicked = await this.clickCanvasObjectByTestId('card-in-hand', index);
    if (!clicked) {
      await this._page.locator('[data-testid="card-in-hand"]').nth(index).click({ force: true });
    }
    await this._page.waitForTimeout(200);
  }

  /** Click one of the 3 rearrange-protocol chips by displayed slot index (0..2). */
  async clickRearrangeProtocolChip(index: number) {
    const testId = `rearrange-protocol-chip-${index}`;
    const clicked = await this.clickCanvasObjectByTestId(testId);
    if (!clicked) {
      await this._page.locator(`[data-testid="${testId}"]`).first().click({ force: true });
    }
    await this._page.waitForTimeout(200);
  }

  async hasRearrangeResetButton(): Promise<boolean> {
    return await this._page.locator('[data-testid="rearrange-reset-button"]').isVisible();
  }

  async clickRearrangeResetButton() {
    const clicked = await this.clickCanvasObjectByTestId('rearrange-reset-button');
    if (!clicked) {
      await this._page.locator('[data-testid="rearrange-reset-button"]').first().click({ force: true });
    }
    await this._page.waitForTimeout(200);
  }

  /** Click the nth board card in an own line (for effect targeting). */
  async clickBoardCard(lineIndex: number, isOpponent = false) {
    const prefix = isOpponent ? 'opponent-line' : 'own-line';
    const cards = this._page.locator(
      `[data-testid="board-card"]`
    );
    // Filter to cards within the right line zone
    const lineCards = this._page.locator(
      `[data-testid="${prefix}"][data-line="${lineIndex}"] [data-testid="board-card"]`
    );
    const count = await lineCards.count();
    if (count > 0) {
      await lineCards.first().click();
      await this._page.waitForTimeout(200);
      return;
    }

    await this.clickCanvasBoardCard(lineIndex, isOpponent, 0);
  }

  /** Click a board-card via Phaser object data (line/isOwn/position). */
  async clickCanvasBoardCard(lineIndex: number, isOpponent = false, position = 0): Promise<boolean> {
    const clicked = await clickCanvasBoardCard(this._page, lineIndex, isOpponent, position);
    if (!clicked) return false;
    await this._page.waitForTimeout(200);
    return true;
  }

  /** Click the first currently interactive board card (effect-target style). */
  async clickFirstInteractiveBoardCard(): Promise<boolean> {
    const clicked = await clickFirstInteractiveBoardCard(this._page);
    if (!clicked) return false;
    await this._page.waitForTimeout(200);
    return true;
  }

  /** True when the effect resolution HUD is active (effect-description visible). */
  async isEffectResolutionActive(): Promise<boolean> {
    return await isEffectResolutionActive(this._page);
  }

  /** Return one tracked HUD status text by id from window.__GAME_STATUS_TEXT_MAP__. */
  async getStatusText(id: string): Promise<string | null> {
    return await getStatusText(this._page, id);
  }

  /** Return all tracked HUD status texts from window.__GAME_STATUS_TEXT_MAP__. */
  async getStatusTextMap(): Promise<Record<string, string>> {
    return await getStatusTextMap(this._page);
  }
}
