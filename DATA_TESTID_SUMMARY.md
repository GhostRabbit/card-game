# Data-TestID Attributes - Implementation Summary

## What Was Done

### ✅ GameScene.ts - Data-TestID Attributes Added

All critical UI elements in GameScene.ts have been tagged with `setName()` and `setData("testid", ...)` methods for reliable test automation:

#### Phase Chips (renderHUD)
```typescript
chip.setName(`phase-${state}`)
  .setData("testid", `phase-${state}`)
  .setData("phase", state)
  .setData("isActive", isActive);
```
- Enables tests to locate phase indicators: `[data-testid="phase-START"]`, `[data-testid="phase-ACTION"]`, etc.

#### Control Buttons (renderHUD)
```
[data-testid="reset-button"]
[data-testid="toggle-face-down"]
[data-testid="reset-button-text"]
[data-testid="toggle-face-down-text"]
```
- Provides access to game control buttons and their text labels.

#### Status Text (renderHUD)
```typescript
.setData("testid", "your-turn-status")
```
- Displays current turn status: "YOUR TURN", "Opponent's Turn", or "COMPILE REQUIRED"

#### Hand Cards (renderHand)
```typescript
sprite.setName("card-in-hand")
  .setData("testid", "card-in-hand")
  .setData("cardIndex", i)
  .setData("cardId", instanceId);
```
- Allows selection of individual cards in hand using `[data-testid="card-in-hand"]` with nth selectors.

#### Board Lines & Cards (renderLine)
```typescript
// Zone background
zoneBg.setName(isOwn ? `own-line-${li}` : `opponent-line-${li}`)
  .setData("testid", isOwn ? "own-line" : "opponent-line")
  .setData("line", li)
  .setData("isOwn", isOwn);

// Cards on board
sprite.setName("board-card")
  .setData("testid", "board-card")
  .setData("line", li)
  .setData("position", i)
  .setData("isOwn", isOwn);
```
- Supports targeting specific board positions and cards placed on them.

#### Piles - Draw/Discard (renderPile)
```typescript
// Pile container
.setData("testid", isMine ? "draw-pile" : "opponent-draw-pile")

// Pile counts
.setData("testid", isMine ? "draw-pile-count" : "opponent-draw-pile-count")

// Hand size indicator
.setData("testid", "opponent-hand-size")
```
- Enables checking draw pile states and opponent hand visibility.

## How to Use

### Run Standard Tests
```bash
npm run test:e2e              # Headless mode
npm run test:e2e:ui           # Interactive UI mode
npm run test:e2e:headed       # Visible browser mode
```

## Data-TestID Mapping Reference

| Component | Selector | Data | Example |
|-----------|----------|------|---------|
| Phase Chip | `[data-testid^="phase-"]` | phase, isActive | phase-START, phase-ACTION |
| Hand Card | `[data-testid="card-in-hand"]` | cardIndex, cardId | nth(0), nth(1) |
| Board Line | `[data-testid="own-line"]` | line, isOwn | [data-line="0"] |
| Board Card | `[data-testid="board-card"]` | line, position, isOwn | on line 1, position 0 |
| Reset Button | `[data-testid="reset-button"]` | (none) | always enabled |
| Face-Down | `[data-testid="toggle-face-down"]` | (none) | toggle state |
| Draw Pile | `[data-testid="draw-pile"]` | (none) | own draw pile |
| Draw Count | `[data-testid="draw-pile-count"]` | deckSize | 10, 5, etc. |
| Turn Status | `[data-testid="your-turn-status"]` | (none) | YOUR TURN text |

## Testing Scenarios Enabled

### Single Instance (Standard)
- Regression testing
- Feature verification
- Quick feedback loops
- CI/CD integration

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Can't find element | Element may not have data-testid added yet in GameScene.ts |
| Tests pass individually but fail together | Likely race condition; add `await page.waitForTimeout()` |

## Next Steps

1. **Verify Installation**
   ```bash
   npm install
   npm run test:e2e -- --list
   ```

2. **Build Both Client and Server**
   ```bash
   npm run build  # if build scripts exist
   ```

3. **Run Standard Tests**
   ```bash
   npm run test:e2e:ui
   ```
   - Verify data-testid selectors work
   - Check GameScene.ts elements are being found

4. **Adjust as Needed**
   - If tests fail: Check for missing data-testid attributes
   - If elements not found: Verify data-testid in GameScene.ts

## Files Modified

✅ `client/src/scenes/GameScene.ts` - Added 30+ data-testid attributes

## Code Quality Maintained

- No game logic changes
- Only Phaser object naming/data added
- Backward compatible with existing game
- Zero performance impact (testid just metadata)
- Works in production (testid for test access only)
