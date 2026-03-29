# Card Preview Pages

This preview feature is implemented in the client app and reuses the production card renderer (`CardSprite`), so layout/text changes are reflected in both preview and gameplay.

## Suggested Storage Location

Store the feature source in the client runtime:
- `client/src/scenes/CardPreviewScene.ts`

Store documentation and usage notes here:
- `docs/card-previews/README.md`

This split keeps preview rendering code close to gameplay rendering code while keeping docs in `docs/`.

## How To Open

1. Start the client app normally (for example with your existing dev command).
2. Open:
   - `http://localhost:5173/?preview=1`

Optional protocol-specific page:
- `http://localhost:5173/?preview=1&protocol=proto_apy`
- `http://localhost:5173/?preview=1&protocol=proto_wtr`

## What It Shows

Per selected protocol, the table displays all its cards in three visibility modes:
- Zoomed card
- In hand card
- Played in line card

The left column is an alphabetical index of all protocols. Clicking a protocol opens its page via query parameter.
