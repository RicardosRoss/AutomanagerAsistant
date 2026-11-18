import { expect, test } from 'vitest';
import PrecedentService from '../../src/services/PrecedentService.js';
import PrecedentRule from '../../src/models/PrecedentRule.js';

test('the explicit allowance lookup cannot apply a previous chain precedent to a new chain', async () => {
  const service = new PrecedentService();
  await service.allowForever({ userId: 830004, chainType: 'main', chainId: 'chain-old', behaviorKey: 'phone' });
  expect(await (service.isBehaviorAllowed as any)(830004, 'phone', 'main', 'chain-new')).toBe(false);
  expect(await (service.isBehaviorAllowed as any)(830004, 'phone', 'main', 'chain-old')).toBe(true);
});

test('new unbound precedents are rejected while historical unbound records stay intact', async () => {
  const service = new PrecedentService();
  await PrecedentRule.collection.insertOne({
    userId: 830005,
    scope: { behaviorKey: 'legacy', chainType: 'main' },
    decision: 'allow_forever'
  });
  const before = await PrecedentRule.collection.findOne({ userId: 830005 });
  await expect(
    service.allowForever({ userId: 830005, chainType: 'main', chainId: '', behaviorKey: 'phone' })
  ).rejects.toThrow();
  await expect((service.isBehaviorAllowed as any)(830005, 'legacy', 'main', '')).rejects.toThrow();
  expect(await PrecedentRule.collection.findOne({ userId: 830005 })).toEqual(before);
  expect(await PrecedentRule.countDocuments({ userId: 830005 })).toBe(1);
});
