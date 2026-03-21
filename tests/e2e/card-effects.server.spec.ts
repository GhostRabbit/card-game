import { test } from '../helpers/fixtures';

/**
 * Server-backed card-effect E2E coverage plan.
 *
 * IMPORTANT:
 * - These are intentionally marked fixme until the test harness can drive
 *   full non-mock multiplayer setup (menu -> room create/join -> draft -> game)
 *   with deterministic card/effect fixtures.
 * - Once harness support lands, each test below should assert both:
 *   1) Required user-decision UI appears and is actionable
 *   2) Server state transition/outcome is reflected in the synced client state
 */

test.describe('Card Effects (server-backed e2e)', () => {
  test.fixme('draw resolves through server and updates hand/deck counts', async () => {});
  test.fixme('discard resolves through server and moves card to trash', async () => {});
  test.fixme('flip resolves through server and toggles target card face', async () => {});
  test.fixme('flip_draw_equal resolves through server and draws based on flipped value', async () => {});
  test.fixme('delete resolves through server and removes target from line', async () => {});
  test.fixme('shift resolves through server and moves target card between lines', async () => {});
  test.fixme('return resolves through server and moves target to hand', async () => {});
  test.fixme('rearrange_protocols resolves through server and applies new line mapping', async () => {});
  test.fixme('play_facedown resolves through server and places selected hand card face-down', async () => {});
  test.fixme('reveal_own_hand resolves through server and exposes selected card to opponent', async () => {});
  test.fixme('exchange_hand resolves through server and swaps selected/random cards', async () => {});
  test.fixme('give_to_draw resolves through server for both give and skip branches', async () => {});
  test.fixme('discard_to_flip resolves through server across discard/skip and target selection stages', async () => {});
  test.fixme('opponent_discard resolves through server and updates opponent hand/trash', async () => {});
  test.fixme('flip_self resolves through server and toggles source card face', async () => {});
  test.fixme('deny_compile resolves through server and blocks opponent compile check', async () => {});
});
