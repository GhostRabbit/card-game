/**
 * Black-box rule-oracle tests for card effects.
 *
 * Oracle source: card rule text / game rules (what players should see/do),
 * not server/client implementation branches.
 */

import { test, expect } from './helpers/fixtures';

type RuleOracle = {
  effectType: string;
  cardName: string;
  descriptionNeedle: string;
  expectsConfirmInitially: boolean;
  expectsSkipInitially: boolean;
  hintRegex?: RegExp;
};

// Rule-derived interaction oracle for all mock effect scenarios.
const RULE_ORACLE: RuleOracle[] = [
  { effectType: 'draw', cardName: 'Darkness', descriptionNeedle: 'Draw 3 cards', expectsConfirmInitially: true, expectsSkipInitially: false },
  { effectType: 'flip_self', cardName: 'Water', descriptionNeedle: 'Flip this card', expectsConfirmInitially: true, expectsSkipInitially: false },
  { effectType: 'opponent_discard', cardName: 'Plague', descriptionNeedle: 'opponent discards', expectsConfirmInitially: true, expectsSkipInitially: false },
  { effectType: 'deny_compile', cardName: 'Metal', descriptionNeedle: 'cannot compile next turn', expectsConfirmInitially: true, expectsSkipInitially: false },

  { effectType: 'discard', cardName: 'Apathy', descriptionNeedle: 'discard 1 card', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /discard|hand/i },
  { effectType: 'flip', cardName: 'Apathy', descriptionNeedle: 'Flip 1', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /flip|card/i },
  { effectType: 'flip_optional', cardName: 'Spirit', descriptionNeedle: 'may flip 1 card', expectsConfirmInitially: false, expectsSkipInitially: true, hintRegex: /flip|card/i },
  { effectType: 'delete', cardName: 'Hate', descriptionNeedle: 'Delete 1 card', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /delete|card/i },
  { effectType: 'return', cardName: 'Water', descriptionNeedle: 'Return 1', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /return|card/i },
  { effectType: 'shift', cardName: 'Speed', descriptionNeedle: 'Shift 1', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /shift|card/i },

  { effectType: 'exchange_hand', cardName: 'Love', descriptionNeedle: 'Give 1 card from your hand', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /hand|give/i },
  { effectType: 'give_to_draw', cardName: 'Love', descriptionNeedle: 'may give 1 card', expectsConfirmInitially: false, expectsSkipInitially: true, hintRegex: /give|hand/i },
  { effectType: 'reveal_own_hand', cardName: 'Love', descriptionNeedle: 'Reveal 1 card from your hand', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /reveal|hand/i },

  { effectType: 'discard_to_flip', cardName: 'Fire', descriptionNeedle: 'may discard 1 card', expectsConfirmInitially: false, expectsSkipInitially: true, hintRegex: /discard|hand/i },
  { effectType: 'play_facedown', cardName: 'Darkness', descriptionNeedle: 'face-down', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /face-down|hand/i },
  { effectType: 'rearrange_protocols', cardName: 'Water', descriptionNeedle: 'Rearrange your protocols', expectsConfirmInitially: false, expectsSkipInitially: false, hintRegex: /protocol/i },
];

test.describe('Black-box rule oracle: card effect UX', () => {
  for (const rule of RULE_ORACLE) {
    test(`${rule.effectType}: UI matches rule-derived expectations`, async ({ gamePage }) => {
      await gamePage.gotoForEffect(rule.effectType);

      await expect.poll(() => gamePage.isEffectResolutionActive()).toBe(true);

      const description = await gamePage.getEffectDescription();
      expect(description).toContain(rule.cardName);
      expect(description.toLowerCase()).toContain(rule.descriptionNeedle.toLowerCase());

      if (rule.hintRegex) {
        const hint = await gamePage.getEffectHint();
        expect(hint).toMatch(rule.hintRegex);
      }

      await expect.poll(() => gamePage.hasConfirmButton()).toBe(rule.expectsConfirmInitially);
      await expect.poll(() => gamePage.hasSkipButton()).toBe(rule.expectsSkipInitially);
    });
  }

  test('play_facedown: hand pick transitions to line-pick stage', async ({ gamePage }) => {
    await gamePage.gotoForEffect('play_facedown');
    await gamePage.clickHandCardForEffect(0);

    await expect.poll(() => gamePage.hasLinePickButtons()).toBe(true);
    await expect.poll(() => gamePage.countLinePickButtons()).toBeGreaterThanOrEqual(3);
    const hint = await gamePage.getEffectHint();
    expect(hint.toLowerCase()).toMatch(/line|choose/i);
  });

  test('shift: board pick transitions to line-pick stage', async ({ gamePage }) => {
    await gamePage.gotoForEffect('shift');
    // Pick a deterministic non-source own card (line 2, top position).
    const clicked = await gamePage.clickCanvasBoardCard(2, false, 2);
    expect(clicked).toBe(true);

    await expect.poll(() => gamePage.hasLinePickButtons()).toBe(true);
    await expect.poll(() => gamePage.countLinePickButtons()).toBeGreaterThanOrEqual(3);
    const hint = await gamePage.getEffectHint();
    expect(hint.toLowerCase()).toMatch(/line|destination|choose/i);
  });

  test('rearrange_protocols: confirm appears only after 3 protocol picks', async ({ gamePage }) => {
    await gamePage.gotoForEffect('rearrange_protocols');

    await expect.poll(() => gamePage.hasConfirmButton()).toBe(false);
    await gamePage.clickRearrangeProtocolChip(0);
    await gamePage.clickRearrangeProtocolChip(1);
    await gamePage.clickRearrangeProtocolChip(2);
    await expect.poll(() => gamePage.hasConfirmButton()).toBe(true);
  });

  test('rearrange_protocols: reset clears picks and hides confirm', async ({ gamePage }) => {
    await gamePage.gotoForEffect('rearrange_protocols');

    await gamePage.clickRearrangeProtocolChip(0);
    await expect.poll(() => gamePage.hasRearrangeResetButton()).toBe(true);
    await expect.poll(() => gamePage.hasConfirmButton()).toBe(false);

    await gamePage.clickRearrangeResetButton();
    await expect.poll(() => gamePage.hasRearrangeResetButton()).toBe(false);
    await expect.poll(() => gamePage.hasConfirmButton()).toBe(false);

    const hint = await gamePage.getEffectHint();
    expect(hint).toMatch(/\(0\/3\)/);
  });
});
