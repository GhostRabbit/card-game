import { Page, expect } from '@playwright/test';

/**
 * Page Object Model for the Game Board
 * Encapsulates all UI interactions with the game
 */
export class GamePage {
  constructor(private _page: Page) {}

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
    // Wait until test infrastructure is ready and phase chips are present
    await this.page.waitForSelector('[data-testid="game-container"]', { timeout: 15000 });
    await this.page.waitForSelector('[data-testid="phase-START"]', { timeout: 15000 });

    // Keep the selector-based mapping in sync by giving Phaser a moment
    await this.page.waitForTimeout(100);
  }

  async getCardsInHand(): Promise<number> {
    const cards = await this.page.locator('[data-testid="card-in-hand"]').count();
    return cards;
  }

  async selectCard(index: number) {
    const card = this.page.locator('[data-testid="card-in-hand"]').nth(index);
    await card.click();
    await this.page.waitForTimeout(100); // Allow animation
  }

  async isCardSelected(index: number): Promise<boolean> {
    const card = this.page.locator('[data-testid="card-in-hand"]').nth(index);
    return (await card.getAttribute('data-selected')) === 'true';
  }

  async playCardToLine(lineIndex: number) {
    const zone = this.page.locator(`[data-testid="own-line-zone"][data-line="${lineIndex}"]`);
    await zone.click();
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
    await button.click();
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
    await button.click();
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
    await card.hover();
    await this.page.waitForTimeout(300); // Wait for focus panel to update
  }

  async getFocusPanelCardName(): Promise<string | null> {
    const name = this.page.locator('[data-testid="focus-panel-card-name"]');
    return await name.textContent();
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
}
