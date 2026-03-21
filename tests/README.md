# E2E Testing with Playwright

This directory contains end-to-end (E2E) tests for the Compile game using Playwright. The tests verify game mechanics, UI interactions, and multiplayer synchronization through the user interface.

## Setup

### Installation

Playwright is already configured in the root `package.json`. Install it with:

```bash
npm install
```

This will install `@playwright/test` and other dependencies.

### Configuration

The Playwright configuration is in `playwright.config.ts` at the root of the project. Key settings:

- **Web Servers**: Automatically starts both client (port 5173) and server (port 3000) before running tests
- **Base URL**: Tests target `http://localhost:5173`
- **Browsers**: Tests run in Chromium (headless by default)
- **Artifacts**: Test results, screenshots, and videos save to `test-results/`
- **Parallel Execution**: Supports running multiple test instances on alternate ports

## Running Tests

### Standard Test Execution
```bash
npm run test:e2e              # Standard headless mode
npm run test:e2e:headed      # See browser window
npm run test:e2e:ui          # Interactive UI mode (recommended for debugging)
npm run test:e2e:debug       # Step-by-step debugging with Inspector
```

### Parallel Test Execution (Exploratory)

Run multiple test instances in parallel on separate client/server ports:

```bash
# Run 2 separate game instances in parallel
npm run test:e2e:parallel:2

# Run 3 separate game instances in parallel (default)
npm run test:e2e:parallel:3

# Run 4 separate game instances in parallel
npm run test:e2e:parallel:4

# Interactive UI mode with parallel execution (2 instances)
npm run test:e2e:parallel:ui
```

**How Parallel Execution Works:**
- Each test instance runs on its own client port (5173, 5273, 5373, etc.)
- Each test instance runs on its own server port (3000, 3100, 3200, etc.)
- Tests run concurrently without interfering with each other
- Each instance gets its own independent game state
- Useful for exploratory testing, load testing, and multi-player scenario testing

**Port Mapping:**
```
Instance 0: Client 5173, Server 3000  (standard ports)
Instance 1: Client 5273, Server 3100  (parallel:2 adds this)
Instance 2: Client 5373, Server 3200  (parallel:3 adds this)
Instance 3: Client 5473, Server 3300  (parallel:4 adds this)
```

### Run Specific Test File
```bash
npx playwright test tests/e2e/card-interactions.spec.ts
```

### Run Specific Test
```bash
npx playwright test tests/e2e/card-interactions.spec.ts -g "should select card"
```

## Test Structure

Tests are organized in the `tests/e2e/` directory:

### `card-interactions.spec.ts`
**Purpose**: Card selection, playing, and hand management
- Card selection and display
- Playing cards face-up to lines
- Playing cards face-down
- Hand reset functionality
- Line value tracking

### `game-flow.spec.ts`
**Purpose**: Game phase progression and card effects
- Compile flow and phase transitions
- Effect resolution and skipping
- Turn end and opponent turn display

### `multiplayer.spec.ts`
**Purpose**: Multiplayer game state synchronization
- Turn switching
- Opponent board state updates
- Hand size changes on sync
- Draw and discard pile tracking
- Network resilience

### `ui-elements.spec.ts`
**Purpose**: Visual UI element rendering and layout
- Panel visibility
- Phase information display
- Control button accessibility
- Information panel content
- Responsive layout

## Helper Files

### `tests/helpers/game-page.ts` (Page Object Model)
Encapsulates all game UI interactions:
- **Card Interactions**: `selectCard()`, `playCardToLine()`, `playCardFaceDown()`, `toggleFaceDownMode()`
- **Phase Actions**: `compileToLine()`, `skipCompile()`, `resolveEffect()`, `skipEffect()`
- **Game Queries**: `getCardsInHand()`, `getLineValue()`, `getActivePhase()`, `getYourTurnStatus()`
- **Navigation**: `goto()`, `waitForGameStart()`, `waitForPhase()`, `waitForOpponentTurn()`
- **Visuals**: `hoverOverCard()`, `getFocusPanelCardName()`, `screenshotBoard()`

### `tests/helpers/fixtures.ts` (Test Fixture)
Custom Playwright fixture that:
- Extends Playwright's base test
- Injects custom `gamePage` fixture into tests
- Handles game initialization (goto, wait for start)
- Provides `test` and `expect` pre-configured

## Page Object Model (Selectors)

Tests rely on data-testid attributes in GameScene.ts. The GamePage class uses these selectors:

```typescript
// Cards in hand
[data-testid="card-in-hand"]

// Board areas
[data-testid="board-panel"]
[data-testid="hand-panel"]
[data-testid="opponent-area"]
[data-testid="game-container"]

// Lines
[data-testid="own-line"][data-line="0"]
[data-testid="own-line"][data-line="1"]
[data-testid="own-line"][data-line="2"]

// Buttons
[data-testid="toggle-face-down"]
[data-testid="reset-button"]
[data-testid="compile-button"]
[data-testid="confirm-effect-button"]
[data-testid="skip-effect-button"]
[data-testid="skip-compile-button"]

// Piles
[data-testid="draw-pile"]
[data-testid="draw-pile-count"]
[data-testid="discard-pile"]
[data-testid="discard-pile-count"]

// Status and phase
[data-testid="your-turn-status"]
[data-testid="opponent-turn-status"]
[data-testid^="phase-"]           // phase-START, phase-CONTROL, etc.
[data-testid="phase-instructions"]

// Other
[data-testid="phase-active"]      // Apply to active phase chip
[data-testid="opponent-board"]
[data-testid="board-card"]
[data-testid="opponent-card"]
[data-testid="game-over-screen"]
[data-testid="winner-display"]
```

## Adding Data-Test-ID Attributes

For tests to work, GameScene.ts must have data-testid attributes on UI elements. Here's what needs to be added:

### Example Modifications Needed

```typescript
// In GameScene.ts renderAll() or initialization

// For cards in hand:
cardSprite.setName(`card-in-hand-${index}`);
// OR in click handler show it's a test-identifiable element

// For buttons:
resetButton.setAttribute?.('data-testid', 'reset-button');
// OR use game objects with setName()

// For phase chips:
phaseChip.setName(`phase-${phaseName}`);
// And for active phase indicator:
activePhaseChip.setName('phase-active');

// For lines:
lineContainer.setName(`own-line-${lineIndex}`);
lineContainer.setData('line', lineIndex);
```

## Test Development Workflow

1. **Write the test** in appropriate spec file
2. **Use GamePage methods** - don't write Playwright selectors directly
3. **Add data-testid** to GameScene.ts elements if needed
4. **Run test**: `npm run test:e2e:ui` or `npm run test:e2e:headed`
5. **Debug failures** using UI mode or headed mode
6. **Iterate** on selectors and test logic

## Common Issues

### Tests Can't Find Elements
- Check that relevant data-testid attributes exist in GameScene.ts
- Use UI mode (`npm run test:e2e:ui`) to visually inspect element presence
- Check selector in GamePage matches actual element

### Tests Timeout
- Increase timeout for specific actions: `await gamePage.page.waitForTimeout(5000)`
- Check that server and client are running
- Verify network connectivity and game state loading

### Game State Not Updating
- Add explicit waits: `await gamePage.page.waitForTimeout(300)` after actions
- Use `waitForPhase()` or `waitForOpponentTurn()` for phase-dependent tests
- Check that socket.io connection is established

### Parallel Tests: Port Already in Use
- Kill any processes using the specified ports: `lsof -ti:5173,5273,5373,3000,3100,3200`
- Or use fewer parallel instances: `npm run test:e2e:parallel:2`

### Parallel Tests: Tests Interfering with Each Other
- Each parallel instance has fully isolated ports/servers
- If tests still interfere, check for shared state in GameScene (should be reset per game)
- Check socket.io messages for cross-instance communication

## Debugging with Inspector

```bash
npm run test:e2e:debug
```

Then in the Playwright Inspector:
- Step through test execution
- Inspect element selectors
- Check network requests
- View game state

## CI/CD Integration

For continuous integration, tests run with `playwright test` which:
- Uses fresh browser instances
- Runs in headless mode
- Captures screenshots/videos on failure
- Outputs HTML report to `test-results/`

### Parallel in CI
For CI environments, you can use:
```bash
PARALLEL_EXPLORATORY=true PARALLEL_INSTANCES=3 npm run test:e2e
```

Note: This requires sufficient resources (CPU, memory, ports) on the CI runner.

## Test Maintenance

As the game evolves:
1. Update GamePage methods if UI interactions change
2. Update selectors if element structure changes
3. Add new tests for new features
4. Ensure all tests have appropriate waits for animations

## Extending Tests

### Adding New Test Suite
```typescript
// tests/e2e/my-feature.spec.ts
import { test, expect } from '../helpers/fixtures';

test.describe('My Feature', () => {
  test('should do something', async ({ gamePage }) => {
    // Use gamePage methods
    await gamePage.selectCard(0);
    expect(await gamePage.isCardSelected(0)).toBeTruthy();
  });
});
```

### Adding New GamePage Method
```typescript
// tests/helpers/game-page.ts
async myNewMethod(param: string) {
  await this.page.locator('[data-testid="my-element"]').click();
  await this.page.waitForTimeout(200);
}
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
- [Parallel Execution Guide](https://playwright.dev/docs/test-parallel)

## Test Structure

Tests are organized in the `tests/e2e/` directory:

### `card-interactions.spec.ts`
**Purpose**: Card selection, playing, and hand management
- Card selection and display
- Playing cards face-up to lines
- Playing cards face-down
- Hand reset functionality
- Line value tracking

### `game-flow.spec.ts`
**Purpose**: Game phase progression and card effects
- Compile flow and phase transitions
- Effect resolution and skipping
- Turn end and opponent turn display

### `multiplayer.spec.ts`
**Purpose**: Multiplayer game state synchronization
- Turn switching
- Opponent board state updates
- Hand size changes on sync
- Draw and discard pile tracking
- Network resilience

### `ui-elements.spec.ts`
**Purpose**: Visual UI element rendering and layout
- Panel visibility
- Phase information display
- Control button accessibility
- Information panel content
- Responsive layout

## Helper Files

### `tests/helpers/game-page.ts` (Page Object Model)
Encapsulates all game UI interactions:
- **Card Interactions**: `selectCard()`, `playCardToLine()`, `playCardFaceDown()`, `toggleFaceDownMode()`
- **Phase Actions**: `compileToLine()`, `skipCompile()`, `resolveEffect()`, `skipEffect()`
- **Game Queries**: `getCardsInHand()`, `getLineValue()`, `getActivePhase()`, `getYourTurnStatus()`
- **Navigation**: `goto()`, `waitForGameStart()`, `waitForPhase()`, `waitForOpponentTurn()`
- **Visuals**: `hoverOverCard()`, `getFocusPanelCardName()`, `screenshotBoard()`

### `tests/helpers/fixtures.ts` (Test Fixture)
Custom Playwright fixture that:
- Extends Playwright's base test
- Injects custom `gamePage` fixture into tests
- Handles game initialization (goto, wait for start)
- Provides `test` and `expect` pre-configured

## Page Object Model (Selectors)

Tests rely on data-testid attributes in GameScene.ts. The GamePage class uses these selectors:

```typescript
// Cards in hand
[data-testid="card-in-hand"]

// Board areas
[data-testid="board-panel"]
[data-testid="hand-panel"]
[data-testid="opponent-area"]
[data-testid="game-container"]

// Lines
[data-testid="own-line"][data-line="0"]
[data-testid="own-line"][data-line="1"]
[data-testid="own-line"][data-line="2"]

// Buttons
[data-testid="toggle-face-down"]
[data-testid="reset-button"]
[data-testid="compile-button"]
[data-testid="confirm-effect-button"]
[data-testid="skip-effect-button"]
[data-testid="skip-compile-button"]

// Piles
[data-testid="draw-pile"]
[data-testid="draw-pile-count"]
[data-testid="discard-pile"]
[data-testid="discard-pile-count"]

// Status and phase
[data-testid="your-turn-status"]
[data-testid="opponent-turn-status"]
[data-testid^="phase-"]           // phase-START, phase-CONTROL, etc.
[data-testid="phase-instructions"]

// Other
[data-testid="phase-active"]      // Apply to active phase chip
[data-testid="opponent-board"]
[data-testid="board-card"]
[data-testid="opponent-card"]
[data-testid="game-over-screen"]
[data-testid="winner-display"]
```

## Adding Data-Test-ID Attributes

For tests to work, GameScene.ts must have data-testid attributes on UI elements. Here's what needs to be added:

### Example Modifications Needed

```typescript
// In GameScene.ts renderAll() or initialization

// For cards in hand:
cardSprite.setName(`card-in-hand-${index}`);
// OR in click handler show it's a test-identifiable element

// For buttons:
resetButton.setAttribute?.('data-testid', 'reset-button');
// OR use game objects with setName()

// For phase chips:
phaseChip.setName(`phase-${phaseName}`);
// And for active phase indicator:
activePhaseChip.setName('phase-active');

// For lines:
lineContainer.setName(`own-line-${lineIndex}`);
lineContainer.setData('line', lineIndex);
```

## Test Development Workflow

1. **Write the test** in appropriate spec file
2. **Use GamePage methods** - don't write Playwright selectors directly
3. **Add data-testid** to GameScene.ts elements if needed
4. **Run test**: `npm run test:e2e:ui` or `npm run test:e2e:headed`
5. **Debug failures** using UI mode or headed mode
6. **Iterate** on selectors and test logic

## Common Issues

### Tests Can't Find Elements
- Check that relevant data-testid attributes exist in GameScene.ts
- Use UI mode (`npm run test:e2e:ui`) to visually inspect element presence
- Check selector in GamePage matches actual element

### Tests Timeout
- Increase timeout for specific actions: `await gamePage.page.waitForTimeout(5000)`
- Check that server and client are running
- Verify network connectivity and game state loading

### Game State Not Updating
- Add explicit waits: `await gamePage.page.waitForTimeout(300)` after actions
- Use `waitForPhase()` or `waitForOpponentTurn()` for phase-dependent tests
- Check that socket.io connection is established

## Debugging with Inspector

```bash
npm run test:e2e:debug
```

Then in the Playwright Inspector:
- Step through test execution
- Inspect element selectors
- Check network requests
- View game state

## CI/CD Integration

For continuous integration, tests run with `playwright test` which:
- Uses fresh browser instances
- Runs in headless mode
- Captures screenshots/videos on failure
- Outputs HTML report to `test-results/`

## Test Maintenance

As the game evolves:
1. Update GamePage methods if UI interactions change
2. Update selectors if element structure changes
3. Add new tests for new features
4. Ensure all tests have appropriate waits for animations

## Extending Tests

### Adding New Test Suite
```typescript
// tests/e2e/my-feature.spec.ts
import { test, expect } from '../helpers/fixtures';

test.describe('My Feature', () => {
  test('should do something', async ({ gamePage }) => {
    // Use gamePage methods
    await gamePage.selectCard(0);
    expect(await gamePage.isCardSelected(0)).toBeTruthy();
  });
});
```

### Adding New GamePage Method
```typescript
// tests/helpers/game-page.ts
async myNewMethod(param: string) {
  await this.page.locator('[data-testid="my-element"]').click();
  await this.page.waitForTimeout(200);
}
```

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Page Object Model Pattern](https://playwright.dev/docs/pom)
- [Test Fixtures](https://playwright.dev/docs/test-fixtures)
