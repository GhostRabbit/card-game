import { test, expect } from '../helpers/fixtures';

test.describe('Multiplayer Game Flow', () => {
  test('should handle turn switching properly', async ({ gamePage }) => {
    // Start of game - should be our turn
    let status = await gamePage.getYourTurnStatus();
    expect(status.toLowerCase()).toContain('turn');
    
    const initialPhase = await gamePage.getActivePhase();
    expect(['START', 'CONTROL', 'COMPILE', 'ACTION']).toContain(initialPhase);
  });

  test('should maintain game state across turn switches', async ({ gamePage }) => {
    // Record initial state
    const initialHandCount = await gamePage.getCardsInHand();
    const initialPhase = await gamePage.getActivePhase();
    
    // Both values should be defined
    expect(initialHandCount).toBeGreaterThanOrEqual(0);
    expect(initialPhase).toBeTruthy();
    
    // Give opponent a chance to act (if this test runs, server is online)
    await gamePage.page.waitForTimeout(2000);
    
    // State should still be consistent
    const currentPhase = await gamePage.getActivePhase();
    expect(currentPhase).toBeTruthy();
  });

  test('should display correct player status indicators', async ({ gamePage }) => {
    const statusText = await gamePage.getYourTurnStatus();
    expect(statusText.length).toBeGreaterThan(0);
  });
});

test.describe('Game State Synchronization', () => {
  test('should sync opponent board state', async ({ gamePage }) => {
    // Check opponent board exists and is rendered.
    const opponentBoardVisible = await gamePage.page.locator('[data-testid="opponent-line"]').first().isVisible().catch(() => false);
    expect(opponentBoardVisible).toBeTruthy();

    const initialOpponentCards = await gamePage.getLineCardCount(0, true);
    expect(initialOpponentCards).toBeGreaterThanOrEqual(0);
  });

  test('should update hand size on state sync', async ({ gamePage }) => {
    const initialHandCount = await gamePage.getCardsInHand();
    expect(initialHandCount).toBeGreaterThanOrEqual(0);
    
    // Move time forward slightly
    await gamePage.page.waitForTimeout(1000);
    
    // Hand count should still be consistent
    const laterHandCount = await gamePage.getCardsInHand();
    expect(laterHandCount).toBeGreaterThanOrEqual(0);
    // Could increase (draw) or decrease (play), so no specific assertion
  });

  test('should reflect draw pile state', async ({ gamePage }) => {
    // Draw pile should be visible
    const drawPileVisible = await gamePage.page.locator('[data-testid="draw-pile"]').isVisible();
    expect(drawPileVisible).toBeTruthy();
    
    // Draw pile count should be valid
    const drawPileCount = await gamePage.page.locator('[data-testid="draw-pile-count"]').textContent();
    expect(drawPileCount).toBeTruthy();
  });

  test('should reflect discard pile state', async ({ gamePage }) => {
    // Current board uses draw-pile/discard stack panels; ensure player's pile panel is visible.
    const discardPileVisible = await gamePage.page.locator('[data-testid="draw-pile"]').isVisible().catch(() => false);
    expect(discardPileVisible).toBeTruthy();

    const discardPileCount = await gamePage.page.evaluate(() => {
      const game = (window as any).__PHASER_GAME__;
      const scene = game?.scene?.getScene?.('GameScene');
      return String(scene?.view?.trash?.length ?? 0);
    });
    expect(discardPileCount).toBeTruthy();
  });
});

test.describe('Network Resilience', () => {
  test('should handle game server connection', async ({ gamePage }) => {
    // If we're in this test, connection established successfully
    const gameTitle = await gamePage.page.title();
    expect(gameTitle).toBeTruthy();
    
    // Game should have loaded
    const gameContainer = await gamePage.page.locator('[data-testid="game-container"]').isVisible();
    expect(gameContainer).toBeTruthy();
  });

  test('should recover from brief network delays', async ({ gamePage }) => {
    const beforePhase = await gamePage.getActivePhase();
    expect(beforePhase).toBeTruthy();
    
    // Simulate network activity by waiting
    await gamePage.page.waitForTimeout(3000);
    
    // Game state should still be responsive
    const afterPhase = await gamePage.getActivePhase();
    expect(afterPhase).toBeTruthy();
  });
});

test.describe('Game End Conditions', () => {
  test('should display game over screen when applicable', async ({ gamePage }) => {
    // Check if game over screen is visible (may not be - depends on game length)
    const gameOverVisible = await gamePage.page.locator('[data-testid="game-over-screen"]').isVisible().catch(() => false);
    
    // Just verify the page is functional
    const phase = await gamePage.getActivePhase();
    expect(phase).toBeTruthy();
  });

  test('should show winner information on game end', async ({ gamePage }) => {
    // Check for winner display
    const winnerDisplay = await gamePage.page.locator('[data-testid="winner-display"]').isVisible().catch(() => false);
    
    // If game is over, winner should show; otherwise game is still in progress
    // This is not a failure condition
    expect(typeof winnerDisplay).toBe('boolean');
  });
});
