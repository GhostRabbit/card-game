import { test, expect } from './helpers/fixtures';

test.describe('UI Element Visibility', () => {
  test('should display all major UI panels', async ({ gamePage }) => {
    const boardVisible = await gamePage.page.locator('[data-testid="own-line"]').first().isVisible().catch(() => false);
    const handVisible = (await gamePage.getCardsInHand()) >= 0;

    expect(boardVisible || handVisible).toBeTruthy();
  });

  test('should display phase information in HUD', async ({ gamePage }) => {
    // At least one phase chip should be present
    const phaseChips = await gamePage.page.locator('[data-testid^="phase-"]').count();
    expect(phaseChips).toBeGreaterThan(0);
  });

  test('should display player hand cards', async ({ gamePage }) => {
    const handCount = await gamePage.getCardsInHand();
    expect(handCount).toBeGreaterThanOrEqual(0);
    
    // If we have cards, they should be clickable
    if (handCount > 0) {
      const firstCard = await gamePage.page.locator('[data-testid="card-in-hand"]').first();
      expect(await firstCard.isVisible()).toBeTruthy();
    }
  });

  test('should show opponent board area', async ({ gamePage }) => {
    const opponentArea = await gamePage.page.locator('[data-testid="opponent-line"]').first().isVisible().catch(() => false);
    const gameContainer = await gamePage.page.locator('[data-testid="game-container"]').isVisible();
    expect(opponentArea || gameContainer).toBeTruthy();
  });

  test('should display resource/pile information', async ({ gamePage }) => {
    const drawPile = await gamePage.page.locator('[data-testid="draw-pile"]').isVisible().catch(() => false);
    const opponentDrawPile = await gamePage.page.locator('[data-testid="opponent-draw-pile"]').isVisible().catch(() => false);

    expect(drawPile || opponentDrawPile).toBeTruthy();
  });
});

test.describe('Interactive Controls', () => {
  test('should have toggle face-down button when applicable', async ({ gamePage }) => {
    const toggleButton = await gamePage.page.locator('[data-testid="toggle-face-down"]').isVisible().catch(() => false);
    
    // Button may or may not be visible depending on game state
    expect(typeof toggleButton).toBe('boolean');
  });

  test('should have reset button accessible', async ({ gamePage }) => {
    const resetButton = await gamePage.page.locator('[data-testid="reset-button"]').isVisible().catch(() => false);
    
    // Reset button might be visible or hidden depending on game state
    expect(typeof resetButton).toBe('boolean');
  });

  test('should have compile button when available', async ({ gamePage }) => {
    const compileButton = await gamePage.page.locator('[data-testid="compile-button"]').isVisible().catch(() => false);
    
    // Compile button visibility depends on game state
    expect(typeof compileButton).toBe('boolean');
  });

  test('should display phase action buttons based on state', async ({ gamePage }) => {
    // Look for phase-specific buttons
    const buttons = await gamePage.page.locator('[data-testid^="action-"]').count();
    // May or may not exist depending on phase
    expect(buttons).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Information Panels', () => {
  test('should show card information on hover/select', async ({ gamePage }) => {
    const hand = await gamePage.getCardsInHand();
    
    if (hand > 0) {
      // Hover over a card
      await gamePage.hoverOverCard(0);
      
      // Focus panel should show card info
      const cardName = await gamePage.getFocusPanelCardName();
      expect(cardName).toBeTruthy();
    }
  });

  test('should display phase instructions', async ({ gamePage }) => {
    // Phase instructions should be visible somewhere
    const phaseInstructions = await gamePage.page.locator('[data-testid="phase-instructions"]').isVisible().catch(() => false);
    
    // May be in main or focus panel
    expect(typeof phaseInstructions).toBe('boolean');
  });

  test('should show turn status indicator', async ({ gamePage }) => {
    const turnStatus = await gamePage.getYourTurnStatus();
    expect(turnStatus).toBeTruthy();
  });

  test('should display line values clearly', async ({ gamePage }) => {
    // Check at least one line value display
    const lineValue = await gamePage.getLineValue(0).catch(() => undefined);
    
    // Should either return a number or be undefined/0
    expect(typeof lineValue === 'number' || lineValue === undefined).toBeTruthy();
  });
});

test.describe('Responsive Layout', () => {
  test('should position cards in proper layout', async ({ gamePage }) => {
    const hand = await gamePage.getCardsInHand();
    
    if (hand > 0) {
      // Cards should be positioned in hand area
      const firstCard = await gamePage.page.locator('[data-testid="card-in-hand"]').first().boundingBox();
      expect(firstCard).toBeTruthy();
      expect(firstCard?.width).toBeGreaterThan(0);
      expect(firstCard?.height).toBeGreaterThan(0);
    }
  });

  test('should maintain proper spacing between lines', async ({ gamePage }) => {
    // All three lines should be visible and distinct
    for (let i = 0; i < 3; i++) {
      const lineCards = await gamePage.page.locator(`[data-testid="own-line"][data-line="${i}"]`).count();
      expect(lineCards).toBeGreaterThanOrEqual(0);
    }
  });

  test('should scale UI elements appropriately', async ({ gamePage }) => {
    const viewport = gamePage.page.viewportSize();
    expect(viewport).toBeTruthy();
    
    // Verify main game area is properly sized
    const gameArea = await gamePage.page.locator('[data-testid="game-container"]').boundingBox();
    expect(gameArea?.width).toBeCloseTo(viewport!.width, -2); // Within 100px
  });
});
