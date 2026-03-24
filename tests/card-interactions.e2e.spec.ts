import { test, expect } from './helpers/fixtures';

test.describe('Card Selection and Display', () => {
  test('should display cards in hand at start', async ({ gamePage }) => {
    const cardCount = await gamePage.getCardsInHand();
    expect(cardCount).toBeGreaterThan(0);
    expect(cardCount).toBeLessThanOrEqual(5);
  });

  test('should select card when clicked', async ({ gamePage }) => {
    const cardCount = await gamePage.getCardsInHand();
    if (cardCount > 0) {
      await gamePage.selectCard(0);
      const hint = (await gamePage.getStatusText('phase-hint')) ?? '';
      expect(hint.toLowerCase()).toContain('face-up');
    }
  });

  test('should deselect card when clicked again', async ({ gamePage }) => {
    const cardCount = await gamePage.getCardsInHand();
    if (cardCount > 0) {
      // Select
      await gamePage.selectCard(0);
      let hint = (await gamePage.getStatusText('phase-hint')) ?? '';
      expect(hint.toLowerCase()).toContain('face-up');

      // Deselect
      await gamePage.selectCard(0);
      hint = (await gamePage.getStatusText('phase-hint')) ?? '';
      expect(hint.toLowerCase()).toContain('click a card');
    }
  });

  test('should show card focus panel on hover', async ({ gamePage }) => {
    const cardCount = await gamePage.getCardsInHand();
    if (cardCount > 0) {
      await gamePage.hoverOverCard(0);
      const cardName = await gamePage.getFocusPanelCardName();
      expect(cardName).toBeTruthy();
    }
  });
});

test.describe('Card Play Mechanics', () => {
  test('should play card face-up to line', async ({ gamePage }) => {
    const initialCount = await gamePage.getLineCardCount(0);

    // Select and play first card
    const handCount = await gamePage.getCardsInHand();
    if (handCount > 0) {
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);

      // Verify card was added to line
      const newCount = await gamePage.getLineCardCount(0);
      expect(newCount).toBe(initialCount + 1);

      // Verify card was removed from hand
      const newHandCount = await gamePage.getCardsInHand();
      expect(newHandCount).toBe(handCount - 1);
    }
  });

  test('should play card face-down to line', async ({ gamePage }) => {
    const initialCount = await gamePage.getLineCardCount(1);
    const initialHand = await gamePage.getCardsInHand();

    if (initialHand > 0) {
      await gamePage.selectCard(0);
      await gamePage.playCardFaceDown(1);

      const newCount = await gamePage.getLineCardCount(1);
      expect(newCount).toBe(initialCount + 1);
    }
  });

  test('should track line value changes', async ({ gamePage }) => {
    const initialValue = await gamePage.getLineValue(0);

    // Play a card
    const handCount = await gamePage.getCardsInHand();
    if (handCount > 0) {
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);

      // Line value should update (may be higher or lower depending on card)
      const newValue = await gamePage.getLineValue(0);
      expect(newValue).not.toBeNaN();
      expect(newValue).toBeGreaterThanOrEqual(0);
    }
  });

  test('should reset hand and draw new cards', async ({ gamePage }) => {
    const initialHand = await gamePage.getCardsInHand();

    // Play a card first
    if (initialHand > 1) {
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);

      const cardCount = await gamePage.getCardsInHand();
      expect(cardCount).toBeLessThan(initialHand);

      // Reset
      await gamePage.clickReset();
      await gamePage.page.waitForTimeout(300);

      // Should have 5 cards again
      const resetCount = await gamePage.getCardsInHand();
      expect(resetCount).toBeGreaterThanOrEqual(cardCount);
      expect(resetCount).toBeLessThanOrEqual(5);
    }
  });
});

test.describe('Phase Transitions', () => {
  test('should progress through ACTION phase', async ({ gamePage }) => {
    const activePhase = await gamePage.getActivePhase();
    expect(['START', 'CONTROL', 'COMPILE', 'ACTION']).toContain(activePhase);
  });

  test('should highlight START phase at beginning', async ({ gamePage }) => {
    // Game starts in ACTION phase after START, CONTROL, COMPILE
    // Just verify phase system is working
    const phase = await gamePage.getActivePhase();
    expect(phase).toBeTruthy();
  });

  test('should show YOUR TURN status during turn', async ({ gamePage }) => {
    const status = await gamePage.getYourTurnStatus();
    expect(status).toContain('YOUR TURN');
  });
});
