import { test as base } from '@playwright/test';
import { GamePage } from './game-page';

export { expect } from '@playwright/test';

/**
 * Custom test fixture that includes GamePage
 * 
 * For E2E tests, we navigate to /?test=1 which:
 * 1. Triggers test mode detection in main.ts
 * 2. Starts MockGameScene instead of MenuScene
 * 3. MockGameScene auto-transitions to GameScene with test data
 * This allows tests to skip user interaction and go straight to the game
 */
export const test = base.extend<{ gamePage: GamePage }>({
  gamePage: async ({ page }, use) => {
    const gamePage = new GamePage(page);
    
    // Navigate to page with test mode enabled (/?test=1)
    // This triggers MockGameScene startup in main.ts
    await gamePage.goto(true);
    
    // Wait for GameScene to be active and phase chips to be visible
    await gamePage.waitForGameStart();
    
    await use(gamePage);
  },
});

