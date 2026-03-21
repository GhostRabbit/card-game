# Adding Data-TestID Attributes for E2E Tests

This guide explains how to add the data-testid attributes to GameScene.ts elements so that Playwright E2E tests can locate and interact with UI elements.

## Overview

Playwright tests use CSS selectors with `[data-testid="..."]` attributes to find elements. These are added to DOM elements but Phaser's Text, Image, and other game objects don't directly attach to the DOM.

**Solution**: We add semantic names and data properties to Phaser objects that can be queried during test setup with JavaScript injection.

## Implementation Strategy

### Option 1: HTML Overlay Elements (Recommended for Tests)

For accessibility and testing, some UI elements should also have HTML counterparts:

```typescript
// In GameScene, create optional test elements
private createTestElements() {
  // Create hidden HTML divs for test selectors
  const gameContainer = document.getElementById('game-container') || 
    document.createElement('div');
  gameContainer.id = 'game-container';
  gameContainer.dataset.testid = 'game-container';
  document.body.appendChild(gameContainer);
}
```

### Option 2: Phaser Object Names and Data

Use Phaser's built-in `setName()` and `setData()` methods:

```typescript
// In render methods or initialization
cardSprite.setName('card-in-hand');
cardSprite.setData('testid', 'card-in-hand');
cardSprite.setData('index', index);

lineContainer.setName(`own-line`);
lineContainer.setData('testid', 'own-line');
lineContainer.setData('line', lineIndex);
```

### Option 3: Playwright Fixture Setup

The test fixture can inject a helper that finds elements:

```typescript
// tests/helpers/fixtures.ts
await gamePage.page.addInitScript(() => {
  (window as any).getGameElement = (testid: string) => {
    // Query Phaser scene for named objects
    // Return position, visibility, etc. for testing
  };
});
```

## Specific Elements Needing Data-TestID

### Game Container
**Location**: GameScene constructor or init()
```typescript
// Add to Phaser scene or as HTML element
const container = document.createElement('div');
container.id = 'game-container';
container.dataset.testid = 'game-container';
document.body.appendChild(container);
```

### Cards in Hand
**Location**: renderHand() or CardSprite initialization
```typescript
// In renderHand() method
cardSprite.setName(`card-in-hand`);
cardSprite.setData('testid', 'card-in-hand');
cardSprite.setData('cardIndex', index);
cardSprite.setData('cardId', card.id);
```

### Board Lines
**Location**: renderBoard() or OwnBoardPanel
```typescript
// For each line container
lineContainer.setName(`own-line`);
lineContainer.setData('testid', 'own-line');
lineContainer.setData('line', lineIndex);

// For cards on line
boardCard.setName('board-card');
boardCard.setData('testid', 'board-card');
boardCard.setData('line', lineIndex);
boardCard.setData('position', cardIndex);
```

### Control Buttons
**Location**: createHUD() or button creation
```typescript
// Reset button
resetButton.setName('reset-button');
resetButton.setData('testid', 'reset-button');

// Face down toggle
faceDownToggle.setName('toggle-face-down');
faceDownToggle.setData('testid', 'toggle-face-down');

// Compile button (if applicable)
compileButton?.setName('compile-button');
compileButton?.setData('testid', 'compile-button');
```

### Phase Information
**Location**: createHUD() or phase display
```typescript
// Phase chips in HUD
for (const phase of TURN_PHASES) {
  const chip = /* create phase chip */;
  chip.setName(`phase-${phase}`);
  chip.setData('testid', `phase-${phase}`);
  chip.setData('phase', phase);
}

// Active phase indicator
if (isActive) {
  activeChip.setData('phaseActive', 'true');
  // Or add to name
  activeChip.setName('phase-active');
}
```

### Status Text
**Location**: showFocusState(), HUD creation
```typescript
// Your turn status
yourTurnText.setName('your-turn-status');
yourTurnText.setData('testid', 'your-turn-status');

// Opponent turn status
opponentTurnText.setName('opponent-turn-status');
opponentTurnText.setData('testid', 'opponent-turn-status');

// Phase instructions
instructionsText.setName('phase-instructions');
instructionsText.setData('testid', 'phase-instructions');
```

### Piles (Draw/Discard)
**Location**: renderCenterPanel() or pile creation
```typescript
// Draw pile
drawPileContainer.setName('draw-pile');
drawPileContainer.setData('testid', 'draw-pile');

// Draw pile count
drawPileCount.setName('draw-pile-count');
drawPileCount.setData('testid', 'draw-pile-count');

// Discard pile
discardPileContainer.setName('discard-pile');
discardPileContainer.setData('testid', 'discard-pile');

// Discard pile count
discardPileCount.setName('discard-pile-count');
discardPileCount.setData('testid', 'discard-pile-count');
```

### Opponent Area
**Location**: opponent board rendering
```typescript
// Opponent board area
opponentBoardArea.setName('opponent-area');
opponentBoardArea.setData('testid', 'opponent-area');

// Opponent cards
opponentCard.setName('opponent-card');
opponentCard.setData('testid', 'opponent-card');

// Opponent turn status
opponentBoardArea.setData('testid', 'opponent-board');
```

### Game Panels
**Location**: scene creation or panel initialization
```typescript
// Board panel
boardPanel.setName('board-panel');
boardPanel.setData('testid', 'board-panel');

// Hand panel
handPanel.setName('hand-panel');
handPanel.setData('testid', 'hand-panel');
```

## Implementation Example

Here's a sample of how to modify GameScene.ts:

```typescript
export class GameScene extends Phaser.Scene {
  create() {
    super.create();
    
    // Add test container
    this.addTestElements();
    
    // Rest of initialization...
  }

  private addTestElements() {
    // Create HTML container for overall game
    let container = document.getElementById('game-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'game-container';
      container.dataset.testid = 'game-container';
      document.body.appendChild(container);
    }
  }

  renderAll() {
    this.renderBoard();
    this.renderHand();
    this.renderOpponent();
    this.renderHUD();
  }

  private renderHand() {
    const cards = this.hand?.cards || [];
    
    cards.forEach((card, index) => {
      const sprite = this.add.image(/* x, y */, card.imageKey);
      sprite.setName('card-in-hand');
      sprite.setData('testid', 'card-in-hand');
      sprite.setData('cardIndex', index);
      sprite.setData('cardId', card.id);
      sprite.setInteractive();
      sprite.on('pointerdown', () => this.selectCard(index));
    });
  }

  private renderBoard() {
    // Own lines
    this.state.lines.forEach((line, lineIndex) => {
      const container = this.add.container(/* x, y */);
      container.setName('own-line');
      container.setData('testid', 'own-line');
      container.setData('line', lineIndex);
      
      line.cards.forEach((card, cardIndex) => {
        const sprite = this.add.image(/* x, y */, card.imageKey);
        sprite.setName('board-card');
        sprite.setData('testid', 'board-card');
        sprite.setData('line', lineIndex);
        sprite.setData('position', cardIndex);
        container.add(sprite);
      });
    });
    
    // Opponent lines
    const opponentArea = this.add.container(/* x, y */);
    opponentArea.setName('opponent-area');
    opponentArea.setData('testid', 'opponent-area');
    // ... render opponent cards with board-card data-testid
  }

  private renderHUD() {
    // Phase chips
    TURN_PHASES.forEach((phase, index) => {
      const chip = this.add.image(/* x, y */, 'phase-chip');
      chip.setName(`phase-${phase}`);
      chip.setData('testid', `phase-${phase}`);
      chip.setData('phase', phase);
      
      if (phase === this.turnPhase) {
        chip.setData('phaseActive', 'true');
      }
    });
    
    // Buttons
    const resetBtn = this.add.image(/* x, y */, 'button');
    resetBtn.setName('reset-button');
    resetBtn.setData('testid', 'reset-button');
    
    // Status text
    const statusText = this.add.text(/* x, y */, 'Your turn');
    statusText.setName('your-turn-status');
    statusText.setData('testid', 'your-turn-status');
  }
}
```

## Testing the Implementation

Once you've added data-testid attributes, run tests with UI mode to verify elements are found:

```bash
npm run test:e2e:ui
```

In the UI mode:
1. Select a test
2. Look at "Locators" panel
3. Verify selectors like `[data-testid="card-in-hand"]` appear highlighted on the game

If elements aren't found, the test will show which selector failed, helping you identify which elements still need data-testid attributes.

## Approach: Gradual Implementation

You don't need to add all data-testid attributes at once. Instead:

1. **Start with one test** - e.g., `card-interactions.spec.ts`
2. **Run it** - see which selectors fail
3. **Add missing data-testid** to those elements in GameScene.ts
4. **Run again** - now that test should pass
5. **Move to next test suite** - repeat process

This way you incrementally build complete test coverage while maintaining code quality.

## Maintenance

When you modify UI elements in GameScene.ts:
1. If you add a new element that tests interact with, add data-testid
2. If you change an element's name/structure, update the corresponding selector in GamePage
3. Run `npm run test:e2e:ui` to verify selectors still work

## Alternative: Playwright Inspector

If you want to verify selectors without modifying GameScene yet:

```bash
npx playwright codegen http://localhost:5173
```

This opens Playwright Inspector where you can:
1. Manually click elements in the game
2. See what selectors Playwright generates
3. Refine selectors for your GamePage methods
4. Then add appropriate data-testid attributes to match
