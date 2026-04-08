import { beforeEach, describe, expect, it } from 'vitest';
import { PrecedentRule } from '../../../src/models/index.js';
import type { PrecedentRuleDocument } from '../../../src/types/models.js';

// Lazy-import so the model is registered by the time the service loads
let PrecedentService: typeof import('../../../src/services/PrecedentService.js').default;

describe('PrecedentService', () => {
  let precedentService: InstanceType<typeof PrecedentService>;

  const testUserId = 123456789;

  beforeEach(async () => {
    const mod = await import('../../../src/services/PrecedentService.js');
    PrecedentService = mod.default;
    precedentService = new PrecedentService();
  });

  // ─── reportViolation ──────────────────────────────────────────────────

  describe('reportViolation', () => {
    it('should require decision when no precedent exists for the behavior', async () => {
      const result = await precedentService.reportViolation({
        userId: testUserId,
        chainType: 'main',
        chainId: 'chain_test_001',
        behaviorKey: 'reply_message'
      });

      expect(result.requiresDecision).toBe(true);
      expect(result.options).toEqual(['break_chain', 'allow_forever']);
      expect(result.decision).toBeUndefined();
    });

    it('should NOT require decision when a precedent rule already allows the behavior', async () => {
      // Pre-create an allow_forever rule
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'phone_call'
      });

      const result = await precedentService.reportViolation({
        userId: testUserId,
        chainType: 'main',
        chainId: 'chain_test_002',
        behaviorKey: 'phone_call'
      });

      expect(result.requiresDecision).toBe(false);
      expect(result.decision).toBe('allow_forever');
      expect(result.options).toBeUndefined();
    });

    it('should distinguish between main and aux chain types', async () => {
      // Allow for main chain
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'social_media'
      });

      // Same behaviorKey but different chainType should still require decision
      const result = await precedentService.reportViolation({
        userId: testUserId,
        chainType: 'aux',
        chainId: 'chain_test_003',
        behaviorKey: 'social_media'
      });

      expect(result.requiresDecision).toBe(true);
      expect(result.options).toEqual(['break_chain', 'allow_forever']);
    });

    it('should distinguish between different users', async () => {
      // User A allows a behavior
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'stretch_break'
      });

      // User B with same behavior should still require decision
      const result = await precedentService.reportViolation({
        userId: 987654321,
        chainType: 'main',
        chainId: 'chain_test_004',
        behaviorKey: 'stretch_break'
      });

      expect(result.requiresDecision).toBe(true);
    });
  });

  // ─── allowForever ─────────────────────────────────────────────────────

  describe('allowForever', () => {
    it('should create a PrecedentRule document', async () => {
      const doc = await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'email_check'
      });

      expect(doc).toBeDefined();
      expect(doc.userId).toBe(testUserId);
      expect(doc.scope.behaviorKey).toBe('email_check');
      expect(doc.scope.chainType).toBe('main');
      expect(doc.decision).toBe('allow_forever');
      expect(doc.createdAt).toBeDefined();
    });

    it('should persist the rule in the database', async () => {
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'aux',
        behaviorKey: 'water_break'
      });

      const found = await PrecedentRule.findOne({
        userId: testUserId,
        'scope.behaviorKey': 'water_break',
        'scope.chainType': 'aux'
      });

      expect(found).not.toBeNull();
      expect(found!.decision).toBe('allow_forever');
    });

    it('should not create duplicate rules (upsert behavior)', async () => {
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'duplicate_test'
      });

      // Second call should not throw and should still result in only one document
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'duplicate_test'
      });

      const count = await PrecedentRule.countDocuments({
        userId: testUserId,
        'scope.behaviorKey': 'duplicate_test',
        'scope.chainType': 'main'
      });

      expect(count).toBe(1);
    });
  });

  // ─── isBehaviorAllowed ────────────────────────────────────────────────

  describe('isBehaviorAllowed', () => {
    it('should return false when no rule exists', async () => {
      const allowed = await precedentService.isBehaviorAllowed(
        testUserId,
        'nonexistent_behavior',
        'main'
      );

      expect(allowed).toBe(false);
    });

    it('should return true when an allow_forever rule exists', async () => {
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'allowed_behavior'
      });

      const allowed = await precedentService.isBehaviorAllowed(
        testUserId,
        'allowed_behavior',
        'main'
      );

      expect(allowed).toBe(true);
    });

    it('should be chainType-specific', async () => {
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'chain_specific_test'
      });

      // Same behaviorKey, different chainType
      const allowedAux = await precedentService.isBehaviorAllowed(
        testUserId,
        'chain_specific_test',
        'aux'
      );

      expect(allowedAux).toBe(false);

      // Same behaviorKey, matching chainType
      const allowedMain = await precedentService.isBehaviorAllowed(
        testUserId,
        'chain_specific_test',
        'main'
      );

      expect(allowedMain).toBe(true);
    });

    it('should be userId-specific', async () => {
      await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'user_specific_test'
      });

      const allowedOther = await precedentService.isBehaviorAllowed(
        999999999,
        'user_specific_test',
        'main'
      );

      expect(allowedOther).toBe(false);
    });
  });

  // ─── Integration: full violation-to-resolution flow ───────────────────

  describe('full violation flow', () => {
    it('first violation requires decision, then allow_forever skips future violations', async () => {
      // 1. First violation of 'email_check' requires a decision
      const v1 = await precedentService.reportViolation({
        userId: testUserId,
        chainType: 'main',
        chainId: 'chain_flow_001',
        behaviorKey: 'email_check'
      });

      expect(v1.requiresDecision).toBe(true);
      expect(v1.options).toEqual(['break_chain', 'allow_forever']);

      // 2. User chooses allow_forever
      const rule = await precedentService.allowForever({
        userId: testUserId,
        chainType: 'main',
        behaviorKey: 'email_check'
      });

      expect(rule.decision).toBe('allow_forever');

      // 3. Second violation of same behavior is auto-allowed
      const v2 = await precedentService.reportViolation({
        userId: testUserId,
        chainType: 'main',
        chainId: 'chain_flow_002',
        behaviorKey: 'email_check'
      });

      expect(v2.requiresDecision).toBe(false);
      expect(v2.decision).toBe('allow_forever');
    });
  });
});
