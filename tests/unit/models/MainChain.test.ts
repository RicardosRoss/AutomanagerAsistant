import { describe, expect, it } from 'vitest';
import { MainChain } from '../../../src/models/index.js';

describe('MainChain Model', () => {
  describe('schema validation', () => {
    it('should create a MainChain with required fields', async () => {
      const chain = new MainChain({
        userId: 111111,
        chainId: 'mc_test_001',
        sacredMarker: { type: 'seat', label: 'my-seat' },
        nodes: []
      });

      const saved = await chain.save();

      expect(saved.userId).toBe(111111);
      expect(saved.chainId).toBe('mc_test_001');
      expect(saved.sacredMarker.type).toBe('seat');
      expect(saved.sacredMarker.label).toBe('my-seat');
      expect(saved.levelCounters.unit).toBe(0);
      expect(saved.levelCounters.group).toBe(0);
      expect(saved.levelCounters.cluster).toBe(0);
      expect(saved.nodes).toEqual([]);
      expect(saved.status).toBe('active');
    });

    it('should require userId', async () => {
      const chain = new MainChain({
        chainId: 'mc_test_002',
        sacredMarker: { type: 'seat', label: 'test' }
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should require chainId', async () => {
      const chain = new MainChain({
        userId: 222222,
        sacredMarker: { type: 'seat', label: 'test' }
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should require sacredMarker with type and label', async () => {
      const chain = new MainChain({
        userId: 333333,
        chainId: 'mc_test_003'
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should enforce sacredMarker.type enum', async () => {
      const chain = new MainChain({
        userId: 444444,
        chainId: 'mc_test_004',
        sacredMarker: { type: 'invalid', label: 'test' }
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should accept all valid sacredMarker types', async () => {
      const types = ['seat', 'object', 'message', 'custom'] as const;

      for (const markerType of types) {
        const chain = new MainChain({
          userId: 500000 + types.indexOf(markerType),
          chainId: `mc_test_type_${markerType}`,
          sacredMarker: { type: markerType, label: `label-${markerType}` }
        });

        const saved = await chain.save();
        expect(saved.sacredMarker.type).toBe(markerType);
      }
    });

    it('should enforce unique chainId', async () => {
      const chain1 = new MainChain({
        userId: 600001,
        chainId: 'mc_unique_test',
        sacredMarker: { type: 'seat', label: 'test' }
      });
      await chain1.save();

      const chain2 = new MainChain({
        userId: 600002,
        chainId: 'mc_unique_test',
        sacredMarker: { type: 'seat', label: 'test' }
      });

      await expect(chain2.save()).rejects.toThrow();
    });

    it('should enforce status enum', async () => {
      const chain = new MainChain({
        userId: 777777,
        chainId: 'mc_test_status',
        sacredMarker: { type: 'seat', label: 'test' },
        status: 'invalid_status'
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should accept valid status values', async () => {
      const chain1 = new MainChain({
        userId: 800001,
        chainId: 'mc_test_status_active',
        sacredMarker: { type: 'seat', label: 'test' },
        status: 'active'
      });
      const saved1 = await chain1.save();
      expect(saved1.status).toBe('active');

      const chain2 = new MainChain({
        userId: 800002,
        chainId: 'mc_test_status_broken',
        sacredMarker: { type: 'seat', label: 'test' },
        status: 'broken'
      });
      const saved2 = await chain2.save();
      expect(saved2.status).toBe('broken');
    });
  });

  describe('nodes subdocument', () => {
    it('should store nodes with correct fields', async () => {
      const chain = new MainChain({
        userId: 900001,
        chainId: 'mc_node_test',
        sacredMarker: { type: 'seat', label: 'test' },
        nodes: [
          { nodeNo: 1, level: 'unit', taskId: 'task_001', status: 'running' },
          { nodeNo: 2, level: 'group', taskId: 'task_002', status: 'completed' },
          { nodeNo: 3, level: 'cluster', taskId: 'task_003', status: 'failed' }
        ]
      });

      const saved = await chain.save();

      expect(saved.nodes).toHaveLength(3);
      expect(saved.nodes[0].nodeNo).toBe(1);
      expect(saved.nodes[0].level).toBe('unit');
      expect(saved.nodes[0].taskId).toBe('task_001');
      expect(saved.nodes[0].status).toBe('running');
      expect(saved.nodes[1].level).toBe('group');
      expect(saved.nodes[2].status).toBe('failed');
    });

    it('should enforce node level enum', async () => {
      const chain = new MainChain({
        userId: 900002,
        chainId: 'mc_node_enum_test',
        sacredMarker: { type: 'seat', label: 'test' },
        nodes: [
          { nodeNo: 1, level: 'invalid', taskId: 'task_001', status: 'running' }
        ]
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should enforce node status enum', async () => {
      const chain = new MainChain({
        userId: 900003,
        chainId: 'mc_node_status_test',
        sacredMarker: { type: 'seat', label: 'test' },
        nodes: [
          { nodeNo: 1, level: 'unit', taskId: 'task_001', status: 'invalid' }
        ]
      });

      await expect(chain.save()).rejects.toThrow();
    });
  });

  describe('levelCounters defaults', () => {
    it('should default levelCounters to 0', async () => {
      const chain = new MainChain({
        userId: 1000001,
        chainId: 'mc_counter_defaults',
        sacredMarker: { type: 'seat', label: 'test' }
      });

      const saved = await chain.save();

      expect(saved.levelCounters.unit).toBe(0);
      expect(saved.levelCounters.group).toBe(0);
      expect(saved.levelCounters.cluster).toBe(0);
    });

    it('should accept custom levelCounter values', async () => {
      const chain = new MainChain({
        userId: 1000002,
        chainId: 'mc_counter_custom',
        sacredMarker: { type: 'seat', label: 'test' },
        levelCounters: { unit: 5, group: 2, cluster: 1 }
      });

      const saved = await chain.save();

      expect(saved.levelCounters.unit).toBe(5);
      expect(saved.levelCounters.group).toBe(2);
      expect(saved.levelCounters.cluster).toBe(1);
    });
  });

  describe('timestamps', () => {
    it('should have createdAt and updatedAt', async () => {
      const chain = new MainChain({
        userId: 1100001,
        chainId: 'mc_timestamp_test',
        sacredMarker: { type: 'seat', label: 'test' }
      });

      const saved = await chain.save();

      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('static method: findOrCreateActive', () => {
    it('should create a new chain when no active chain exists', async () => {
      const chain = await MainChain.findOrCreateActive(1200001, 'my-seat');

      expect(chain).toBeDefined();
      expect(chain.userId).toBe(1200001);
      expect(chain.status).toBe('active');
      expect(chain.sacredMarker.label).toBe('my-seat');
      expect(chain.sacredMarker.type).toBe('seat');
      expect(chain.chainId).toMatch(/^mc_/);
      expect(chain.nodes).toEqual([]);
      expect(chain.isNew).toBe(false);
    });

    it('should return existing active chain for the same user', async () => {
      const first = await MainChain.findOrCreateActive(1300001, 'first-seat');

      const second = await MainChain.findOrCreateActive(1300001, 'second-seat');

      expect(second._id.toString()).toBe(first._id.toString());
      // Should NOT update the marker label when returning existing
      expect(second.sacredMarker.label).toBe('first-seat');
    });

    it('should create a new chain if existing one is broken', async () => {
      const first = await MainChain.findOrCreateActive(1400001, 'broken-seat');
      first.status = 'broken';
      await first.save();

      const second = await MainChain.findOrCreateActive(1400001, 'new-seat');

      expect(second._id.toString()).not.toBe(first._id.toString());
      expect(second.status).toBe('active');
      expect(second.sacredMarker.label).toBe('new-seat');
    });
  });

  describe('indexes', () => {
    it('should have userId index', () => {
      const indexes = MainChain.schema.indexes();
      const hasUserIdIndex = indexes.some(([fields]) => 'userId' in fields);
      expect(hasUserIdIndex).toBe(true);
    });

    it('should have unique chainId index', () => {
      const indexes = MainChain.schema.indexes();
      const hasChainIdIndex = indexes.some(
        ([fields]) => 'chainId' in fields
      );
      expect(hasChainIdIndex).toBe(true);
    });
  });
});
