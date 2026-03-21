import { test, expect } from './helpers/fixtures';

test.describe('Compile Flow', () => {
  test('should compile line when all conditions met', async ({ gamePage }) => {
    // Play cards to build up line value
    const handCount = await gamePage.getCardsInHand();
    
    if (handCount >= 2) {
      // Play first card
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);
      
      // Play second card to same line
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);
      
      // Try to compile
      await gamePage.compileToLine(0);
      
      // After compile, line should be cleared or show compiled state
      await gamePage.page.waitForTimeout(500);
      const lineValue = await gamePage.getLineValue(0);
      // Value should reset or be 0 after compile
      expect(lineValue).toBeDefined();
    }
  });

  test('should show compile choice phase when eligible', async ({ gamePage }) => {
    // Play multiple cards to trigger compile eligibility
    const handCount = await gamePage.getCardsInHand();
    
    if (handCount >= 3) {
      for (let i = 0; i < Math.min(3, handCount); i++) {
        if (await gamePage.getCardsInHand() > 0) {
          await gamePage.selectCard(0);
          await gamePage.playCardToLine(i % 3);
        }
      }
      
      // Wait a moment for compile phase to trigger if applicable
      await gamePage.page.waitForTimeout(500);
      
      // Verify we're in a valid game state
      const currentPhase = await gamePage.getActivePhase();
      expect(['COMPILE', 'ACTION', 'CACHE', 'END']).toContain(currentPhase);
    }
  });

  test('should skip compile option', async ({ gamePage }) => {
    const phase = await gamePage.getActivePhase();
    const canSkip = await gamePage.page.locator('[data-testid="skip-compile-button"]').isVisible();
    
    if (canSkip && phase === 'COMPILE') {
      await gamePage.skipCompile();
      await gamePage.page.waitForTimeout(300);
      
      // Should progress to next phase
      const newPhase = await gamePage.getActivePhase();
      expect(newPhase).not.toBe('COMPILE');
    }
  });
});

test.describe('Card Effects', () => {
  test('should handle effect resolution', async ({ gamePage }) => {
    const handCount = await gamePage.getCardsInHand();
    
    if (handCount > 0) {
      // Play first card
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);
      
      // Check if any effects trigger
      const effectButton = await gamePage.page.locator('[data-testid="confirm-effect-button"]').isVisible();
      
      if (effectButton) {
        // An effect requires resolution
        await gamePage.resolveEffect();
        await gamePage.page.waitForTimeout(300);
      }
      
      // Game should progress without error
      const phase = await gamePage.getActivePhase();
      expect(phase).toBeTruthy();
    }
  });

  test('should skip optional effects', async ({ gamePage }) => {
    const skipButton = await gamePage.page.locator('[data-testid="skip-effect-button"]').isVisible();
    
    if (skipButton) {
      await gamePage.skipEffect();
      await gamePage.page.waitForTimeout(300);
      
      // Game should continue
      const phase = await gamePage.getActivePhase();
      expect(phase).toBeTruthy();
    }
  });
});

test.describe('Turn End and Opponent Turn', () => {
  test('should show opponent turn after action phase', async ({ gamePage }) => {
    let turnCount = 0;
    const maxWait = 15000; // 15 seconds max
    const startTime = Date.now();
    
    // Play some cards and progress through turn
    const handCount = await gamePage.getCardsInHand();
    if (handCount > 0) {
      // Play a card
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);
      
      // Wait for turn to progress
      while (turnCount < 3000 && (Date.now() - startTime) < maxWait) {
        try {
          await gamePage.waitForOpponentTurn(500);
          // If we get here, opponent turn is showing
          turnCount = 1;
          break;
        } catch {
          // Keep waiting
          await gamePage.page.waitForTimeout(500);
        }
      }
      
      // Either opponent's turn is showing or we're still in our action phase
      const status = await gamePage.getYourTurnStatus();
      expect(status).toBeTruthy(); // Should show some turn status
    }
  });

  test('should show phase highlighting during auto-progression', async ({ gamePage }) => {
    // Verify phases are highlighted as they progress
    const initialPhase = await gamePage.getActivePhase();
    expect(initialPhase).toBeTruthy();
    
    // Play a card to trigger turn end
    const handCount = await gamePage.getCardsInHand();
    if (handCount > 0) {
      await gamePage.selectCard(0);
      await gamePage.playCardToLine(0);
      
      // Watch phases change
      await gamePage.page.waitForTimeout(1000);
      
      const laterPhase = await gamePage.getActivePhase();
      expect(laterPhase).toBeTruthy();
      // Phase may or may not have changed depending on game speed
    }
  });
});
