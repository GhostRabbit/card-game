/**
 * Card Effect UI Contract Tests (mock scene)
 *
 * These tests intentionally run against `/?test=1&effect=TYPE`, which uses
 * MockGameScene and pre-seeded `pendingEffect` payloads. This suite validates
 * effect-decision UX contracts (hints, button presence, and required user input)
 * independent of server-side effect resolution.
 */

import { test, expect } from './helpers/fixtures';

// ── Auto-execute effects ──────────────────────────────────────────────────────

test.describe('Auto-execute effects', () => {
  test('cache discard effect highlights CACHE instead of ACTION', async ({ gamePage }) => {
    await gamePage.gotoForEffect('cache_discard');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);
    expect(await gamePage.getActivePhase()).toBe('CACHE');

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Cache');
  });

  test('draw effect shows CONFIRM button and description', async ({ gamePage }) => {
    await gamePage.gotoForEffect('draw');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';

    expect(description).toContain('Darkness');
    expect(description).toContain('Draw 3 cards');

    expect(await gamePage.hasConfirmButton()).toBe(true);
    expect(await gamePage.hasSkipButton()).toBe(false);
  });

  test('flip_self effect shows CONFIRM button', async ({ gamePage }) => {
    await gamePage.gotoForEffect('flip_self');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Water');

    expect(await gamePage.hasConfirmButton()).toBe(true);
  });

  test('opponent_discard effect shows CONFIRM button', async ({ gamePage }) => {
    await gamePage.gotoForEffect('opponent_discard');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Plague');
    expect(description).toContain('opponent discards');

    expect(await gamePage.hasConfirmButton()).toBe(true);
  });

  test('deny_compile effect shows CONFIRM button', async ({ gamePage }) => {
    await gamePage.gotoForEffect('deny_compile');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Metal');

    expect(await gamePage.hasConfirmButton()).toBe(true);
    expect(await gamePage.hasSkipButton()).toBe(false);
  });
});

// ── Discard from hand ─────────────────────────────────────────────────────────

test.describe('Discard from hand', () => {
  test('discard effect shows hand-selection hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('discard');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Apathy');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('discard');

    expect(await gamePage.hasConfirmButton()).toBe(false);
    expect(await gamePage.hasSkipButton()).toBe(false);

    const handCount = await gamePage.getCardsInHand();
    expect(handCount).toBeGreaterThan(0);
  });

  test('discard effect: clicking a hand card is the interaction', async ({ gamePage }) => {
    await gamePage.gotoForEffect('discard');

    await gamePage.clickHandCardForEffect(0);
    expect(await gamePage.isEffectResolutionActive()).toBe(true);
  });
});

// ── Board-pick effects ────────────────────────────────────────────────────────

test.describe('Board-pick effects', () => {
  test('flip effect shows board-pick hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('flip');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toMatch(/flip|click.*card/i);

    expect(await gamePage.hasConfirmButton()).toBe(false);
  });

  test('flip optional effect shows board-pick hint AND SKIP button', async ({ gamePage }) => {
    await gamePage.gotoForEffect('flip_optional');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.length).toBeGreaterThan(0);

    expect(await gamePage.hasSkipButton()).toBe(true);
    expect(await gamePage.hasConfirmButton()).toBe(false);
  });

  test('delete effect shows board-pick hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('delete');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Hate');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toMatch(/card|delete/i);

    expect(await gamePage.hasConfirmButton()).toBe(false);
    expect(await gamePage.hasSkipButton()).toBe(false);
  });

  test('return effect shows board-pick hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('return');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Water');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.length).toBeGreaterThan(0);
  });

  test('plg_4 delete step shows opponent face-down targeting hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('plg4_delete_opponent_facedown');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Plague');
    expect(description.toLowerCase()).toContain('face-down');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('opponent');
    expect(hint.toLowerCase()).toContain('face-down');

    expect(await gamePage.hasSkipButton()).toBe(false);
    expect(await gamePage.hasConfirmButton()).toBe(false);
  });

});

// ── Shift (board-pick + line-pick) ───────────────────────────────────────────

test.describe('Shift effect - two-stage board then line', () => {
  test('shift effect shows board-pick hint and no confirm', async ({ gamePage }) => {
    await gamePage.gotoForEffect('shift');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Speed');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toMatch(/card|shift/i);

    expect(await gamePage.hasConfirmButton()).toBe(false);
    expect(await gamePage.hasSkipButton()).toBe(false);
  });
});

// ── Hand-pick effects ─────────────────────────────────────────────────────────

test.describe('Hand-pick effects', () => {
  test('exchange_hand first shows confirm to receive the opponent card', async ({ gamePage }) => {
    await gamePage.gotoForEffect('exchange_hand');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Love');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('random card');

    expect(await gamePage.hasSkipButton()).toBe(false);
    expect(await gamePage.hasConfirmButton()).toBe(true);
  });

  test('exchange_hand give step shows hand-pick hint and no skip', async ({ gamePage }) => {
    await gamePage.gotoForEffect('exchange_hand_give');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('give');

    expect(await gamePage.hasSkipButton()).toBe(false);
    expect(await gamePage.hasConfirmButton()).toBe(false);

    const handCount = await gamePage.getCardsInHand();
    expect(handCount).toBeGreaterThan(0);
  });

  test('give_to_draw shows hand-pick hint AND SKIP button (optional)', async ({ gamePage }) => {
    await gamePage.gotoForEffect('give_to_draw');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Love');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('give');

    expect(await gamePage.hasSkipButton()).toBe(true);
    expect(await gamePage.hasConfirmButton()).toBe(false);
  });

  test('reveal_own_hand shows hand-pick hint and no skip', async ({ gamePage }) => {
    await gamePage.gotoForEffect('reveal_own_hand');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Love');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('hand');

    expect(await gamePage.hasSkipButton()).toBe(false);
    expect(await gamePage.hasConfirmButton()).toBe(false);
  });
});

// ── Two-stage effects ─────────────────────────────────────────────────────────

test.describe('discard_to_flip - two-stage hand then board', () => {
  test('stage 1: shows hand-pick hint and SKIP button', async ({ gamePage }) => {
    await gamePage.gotoForEffect('discard_to_flip');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Fire');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toMatch(/discard.*hand|hand.*discard/i);

    expect(await gamePage.hasSkipButton()).toBe(true);
    expect(await gamePage.hasConfirmButton()).toBe(false);
  });

  test('stage 1: player can skip discard without picking a card', async ({ gamePage }) => {
    await gamePage.gotoForEffect('discard_to_flip');
    expect(await gamePage.hasSkipButton()).toBe(true);
    await gamePage.clickSkipEffect();
    expect(await gamePage.isEffectResolutionActive()).toBe(true);
  });
});

test.describe('play_facedown - two-stage hand then line', () => {
  test('stage 1: shows hand-pick hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('play_facedown');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = await gamePage.getEffectDescription();
    expect(description).toContain('Darkness');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('face-down');

    expect(await gamePage.hasConfirmButton()).toBe(false);
    expect(await gamePage.hasSkipButton()).toBe(false);

    const handCount = await gamePage.getCardsInHand();
    expect(handCount).toBeGreaterThan(0);
  });

  test('stage 1: clicking a hand card triggers line picker', async ({ gamePage }) => {
    await gamePage.gotoForEffect('play_facedown');

    await gamePage.clickHandCardForEffect(0);
    await gamePage.page.waitForTimeout(200);

    const hint = await gamePage.getEffectHint();
    expect(hint.toLowerCase()).toMatch(/line|choose/i);

    expect(await gamePage.hasLinePickButtons()).toBe(true);
  });

  test('stage 2: can select a destination line', async ({ gamePage }) => {
    await gamePage.gotoForEffect('play_facedown');

    await gamePage.clickHandCardForEffect(0);
    await gamePage.page.waitForTimeout(200);

    expect(await gamePage.hasLinePickButtons()).toBe(true);

    await gamePage.clickLinePickButton(1);
    expect(await gamePage.isEffectResolutionActive()).toBe(true);
  });
});

test.describe('rearrange_protocols (auto-execute with protocol reorder)', () => {
  test('shows protocol reorder interaction without CONFIRM button', async ({ gamePage }) => {
    await gamePage.gotoForEffect('rearrange_protocols');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Water');

    expect(await gamePage.hasConfirmButton()).toBe(false);
    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('click protocols');
  });
});

test.describe('Plague 4 optional self flip', () => {
  test('plg_4 flip step shows SKIP and self-target hint', async ({ gamePage }) => {
    await gamePage.gotoForEffect('plg4_flip_self_optional');

    expect(await gamePage.isEffectResolutionActive()).toBe(true);

    const description = (await gamePage.getStatusText('effect-description')) ?? '';
    expect(description).toContain('Plague');
    expect(description.toLowerCase()).toContain('flip this card');

    const hint = (await gamePage.getStatusText('effect-hint')) ?? '';
    expect(hint.toLowerCase()).toContain('this card');

    expect(await gamePage.hasSkipButton()).toBe(true);
    expect(await gamePage.hasConfirmButton()).toBe(false);
  });

  test('plg_4 flip step can be skipped', async ({ gamePage }) => {
    await gamePage.gotoForEffect('plg4_flip_self_optional');

    expect(await gamePage.hasSkipButton()).toBe(true);
    await gamePage.clickSkipEffect();
    expect(await gamePage.isEffectResolutionActive()).toBe(true);
  });
});
