# Playwright E2E Test Framework Setup - Complete

## Summary

The E2E testing infrastructure for the Compile game has been implemented using Playwright. The framework includes:

✅ **Configuration**: `playwright.config.ts` with auto-startup for client (5173) and server (3000)
✅ **Page Object Model**: `tests/helpers/game-page.ts` with 22+ methods for game interactions
✅ **Custom Fixtures**: `tests/helpers/fixtures.ts` for test setup
✅ **Test Suites**: 4 comprehensive test suites with 30+ tests
✅ **Package Configuration**: Root `package.json` updated with Playwright dependency and test scripts
✅ **Documentation**: Complete guides for running tests and adding data-testid attributes

## What's Included

### Test Suites
1. **Card Interactions** (`tests/e2e/card-interactions.spec.ts`) - 9 tests
   - Card selection, hovering, face-up/face-down play, line values, reset, phase transitions

2. **Game Flow** (`tests/e2e/game-flow.spec.ts`) - 8 tests
   - Compile mechanics, effect resolution, turn end detection

3. **Multiplayer** (`tests/e2e/multiplayer.spec.ts`) - 13 tests
   - Turn switching, state synchronization, piles, network resilience, game end

4. **UI Elements** (`tests/e2e/ui-elements.spec.ts`) - 13 tests
   - Panel visibility, controls, information displays, responsive layout

**Total: 43 tests** across all suites

### Helper Files
- **GamePage (Page Object Model)**: Abstracts all UI selectors from tests
- **Fixtures**: Test setup with game initialization
- **Documentation**: README.md and DATA_TESTID_GUIDE.md

## Next Steps to Run Tests

### Step 1: Install Dependencies
```bash
npm install
```
This installs `@playwright/test` and other dependencies.

### Step 2: Add Data-TestID Attributes to GameScene.ts

Tests require data-testid attributes on game UI elements. See `tests/DATA_TESTID_GUIDE.md` for detailed instructions, or use this quick checklist:

**Essential elements to add data-testid:**
- `[data-testid="card-in-hand"]` - Cards in player's hand
- `[data-testid="own-line"]` - Lines where player builds
- `[data-testid="phase-START"]`, `[data-testid="phase-CONTROL"]`, etc. - Phase chips
- `[data-testid="reset-button"]` - Reset button
- `[data-testid="toggle-face-down"]` - Face-down toggle
- `[data-testid="your-turn-status"]` - Turn indicator text
- Plus 15+ other UI elements (see DATA_TESTID_GUIDE.md for complete list)

Phaser code example:
```typescript
// In GameScene.ts renderHand() or similar:
cardSprite.setName('card-in-hand');
cardSprite.setData('testid', 'card-in-hand');
cardSprite.setData('cardIndex', index);
```

### Step 3: Run Tests

#### Full test suite
```bash
npm run test:e2e
```

#### Interactive UI mode (recommended for development)
```bash
npm run test:e2e:ui
```
- Visual test runner with inspection
- Click to see element locators
- Step through execution with Inspector

#### Headed mode (see browser)
```bash
npm run test:e2e:headed
```

#### Specific test file
```bash
npx playwright test tests/e2e/card-interactions.spec.ts
```

#### Specific test
```bash
npx playwright test -g "should select card"
```

## Test Architecture

### Page Object Model Pattern
The `GamePage` class encapsulates all UI selectors:
```typescript
// Tests use clean, semantic methods
await gamePage.selectCard(0);
await gamePage.playCardToLine(0);
expect(await gamePage.getLineValue(0)).toBe(expectedValue);

// Selectors hidden in GamePage
async selectCard(index: number) {
  await this.page.locator('[data-testid="card-in-hand"]').nth(index).click();
}
```

This means if UI selectors change, you only update GamePage - all tests continue working.

### Test Fixture Pattern
Custom fixture injects GamePage and initializes the game:
```typescript
test('example', async ({ gamePage }) => {
  // gamePage is ready, game is loaded and started
  const cards = await gamePage.getCardsInHand();
});
```

### Automatic Server Setup
Playwright automatically starts:
1. Server (port 3000) - `npm run dev --workspace=server`
2. Client (port 5173) - `npm run dev --workspace=client`

Tests can run immediately without manual server startup.

## Test Coverage

### What Tests Verify
- ✅ Card selection and deselection
- ✅ Playing cards face-up and face-down to lines
- ✅ Line value calculation
- ✅ Hand reset
- ✅ Phase transitions and animations
- ✅ Turn switching between players
- ✅ Opponent board synchronization
- ✅ Resource piles (draw/discard)
- ✅ Effect resolution
- ✅ UI element visibility and layout
- ✅ Network synchronization

### What Tests Can't Verify (Yet)
- Win/loss conditions (would need game to finish - time consuming)
- Specific card effects (depends on card implementation)
- Audio/visual effects beyond element visibility
- Performance metrics

## File Structure
```
tests/
├── e2e/
│   ├── card-interactions.spec.ts   # Card selection/play tests
│   ├── game-flow.spec.ts            # Compile & effect tests
│   ├── multiplayer.spec.ts          # Sync & opponent tests
│   └── ui-elements.spec.ts          # Visual & layout tests
├── helpers/
│   ├── fixtures.ts                  # Custom test fixture
│   └── game-page.ts                 # Page Object Model
├── README.md                        # This file
└── DATA_TESTID_GUIDE.md            # How to add data-testid
```

## Development Workflow

1. **Add a feature to GameScene.ts**
2. **Add data-testid** to new UI elements
3. **Write test** in appropriate spec file using GamePage methods
4. **Run test**: `npm run test:e2e:ui`
5. **Iterate** on selector/element until test passes
6. **Verify** all tests pass: `npm run test:e2e`

## Debugging Failed Tests

### Using UI Mode
```bash
npm run test:e2e:ui
```
- Click on failed test
- Click on step that failed
- Right panel shows exact locator and DOM state
- Shows element highlighted in browser

### Using Debug Mode
```bash
npm run test:e2e:debug
```
- Playwright Inspector opens
- Step through test line by line
- Inspect DOM and element locators
- Modify and re-run selectors

### Headed Mode with Logging
```bash
npm run test:e2e:headed
```
```typescript
// Add to test:
console.log('Card count:', await gamePage.getCardsInHand());
```

## Common Issues & Solutions

### "Timeout waiting for locator" - Selector Not Found
**Problem**: Data-testid attribute missing from GameScene.ts element
**Solution**: 
1. Run `npm run test:e2e:ui`
2. Inspect the element in UI mode
3. Add data-testid to that element in GameScene.ts
4. Re-run test

### "Game doesn't load in test"
**Problem**: Server or client not starting
**Solution**:
```bash
# Terminal 1:
npm run dev:server

# Terminal 2:
npm run dev:client

# Terminal 3:
npm run test:e2e:ui
```

### Tests pass individually but fail together
**Problem**: State leaking between tests
**Solution**: Tests have built-in cleanup via fixtures. Check if tests need `page.reload()` between runs.

## CI/CD Integration

To run tests in continuous integration (GitHub Actions, etc.):

```yaml
# .github/workflows/test.yml
- name: Run E2E Tests
  run: npm run test:e2e
```

Test results automatically saved to `test-results/` (in .gitignore, won't commit).

## Extending Tests

### Add New Test Suite
```bash
# Create tests/e2e/my-feature.spec.ts
touch tests/e2e/my-feature.spec.ts
```

```typescript
import { test, expect } from '../helpers/fixtures';

test.describe('My Feature', () => {
  test('should do something', async ({ gamePage }) => {
    // Use existing GamePage methods
    // All standard Playwright assertions available
  });
});
```

### Add New GamePage Method
```typescript
// In tests/helpers/game-page.ts
async myNewAction(param: string) {
  await this.page.locator('[data-testid="my-element"]').click();
  await this.page.waitForTimeout(200);
  return await this.page.locator('[data-testid="result"]').textContent();
}
```

Then use in tests:
```typescript
const result = await gamePage.myNewAction('value');
expect(result).toBe('expected');
```

## Key Files Modified

**Root**
- `package.json` - Added @playwright/test and test:e2e scripts

**TestIDGuide**
- `tests/README.md` - How to run tests
- `tests/DATA_TESTID_GUIDE.md` - How to add data-testid to GameScene

**Infrastructure Created**
- `playwright.config.ts` - Playwright configuration
- `tests/e2e/*.spec.ts` - 4 test suites, 43 tests
- `tests/helpers/game-page.ts` - Page Object Model
- `tests/helpers/fixtures.ts` - Custom test fixture

**Repository**
- `.gitignore` - Added test-results/, playwright/

## Resources

- [Playwright Documentation](https://playwright.dev)
- [Playwright Test Architecture](https://playwright.dev/docs/intro)
- [Page Object Model](https://playwright.dev/docs/pom)
- [Debugging Tests](https://playwright.dev/docs/debug)

## Testing Best Practices Used

✅ **Page Object Model** - Selectors in one place, tests are readable  
✅ **Custom Fixtures** - Consistent test setup and teardown  
✅ **Separation of Concerns** - Test logic separate from UI details  
✅ **Meaningful Assertions** - Tests verify user-visible outcomes  
✅ **Strategic Waits** - Proper timeouts for animations and network  
✅ **Comprehensive Coverage** - Multiple test suites covering all features  
✅ **Documentation** - Guides for running and extending tests  

## What to Do Now

1. **Install**: `npm install`
2. **Add data-testid** to GameScene.ts elements (see DATA_TESTID_GUIDE.md)
3. **Run tests**: `npm run test:e2e:ui`
4. **Fix selectors** if elements not found
5. **All tests pass** ✓

Questions? See `tests/README.md` or `tests/DATA_TESTID_GUIDE.md` for detailed guidance.
