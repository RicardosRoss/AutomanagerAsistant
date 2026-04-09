import { describe, expect, it } from 'vitest';
import { AuxChain } from '../../../src/models/index.js';

describe('AuxChain Model', () => {
  describe('schema validation', () => {
    it('should create an AuxChain with required fields', async () => {
      const chain = new AuxChain({
        userId: 210001,
        chainId: 'ac_test_001'
      });

      const saved = await chain.save();

      expect(saved.userId).toBe(210001);
      expect(saved.chainId).toBe('ac_test_001');
      expect(saved.status).toBe('active');
      expect(saved.pendingReservation).toBeUndefined();
      expect(saved.reservationHistory).toEqual([]);
    });

    it('should require userId', async () => {
      const chain = new AuxChain({
        chainId: 'ac_test_002'
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should require chainId', async () => {
      const chain = new AuxChain({
        userId: 210002
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should enforce unique chainId', async () => {
      const chain1 = new AuxChain({
        userId: 210010,
        chainId: 'ac_unique_test'
      });
      await chain1.save();

      const chain2 = new AuxChain({
        userId: 210011,
        chainId: 'ac_unique_test'
      });

      await expect(chain2.save()).rejects.toThrow();
    });

    it('should enforce status enum', async () => {
      const chain = new AuxChain({
        userId: 210020,
        chainId: 'ac_status_enum',
        status: 'invalid'
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should accept valid status values', async () => {
      const chain1 = new AuxChain({
        userId: 210030,
        chainId: 'ac_status_active',
        status: 'active'
      });
      const saved1 = await chain1.save();
      expect(saved1.status).toBe('active');

      const chain2 = new AuxChain({
        userId: 210031,
        chainId: 'ac_status_inactive',
        status: 'inactive'
      });
      const saved2 = await chain2.save();
      expect(saved2.status).toBe('inactive');
    });
  });

  describe('pendingReservation subdocument', () => {
    it('should store pending reservation with all fields', async () => {
      const now = new Date();
      const deadline = new Date(now.getTime() + 15 * 60 * 1000);

      const chain = new AuxChain({
        userId: 220001,
        chainId: 'ac_pending_test',
        pendingReservation: {
          reservationId: 'res_001',
          signal: 'start-focus',
          duration: 60,
          createdAt: now,
          deadlineAt: deadline,
          status: 'pending'
        }
      });

      const saved = await chain.save();

      expect(saved.pendingReservation).toBeDefined();
      expect(saved.pendingReservation!.reservationId).toBe('res_001');
      expect(saved.pendingReservation!.signal).toBe('start-focus');
      expect(saved.pendingReservation).toMatchObject({ duration: 60 });
      expect(saved.pendingReservation!.createdAt).toEqual(now);
      expect(saved.pendingReservation!.deadlineAt).toEqual(deadline);
      expect(saved.pendingReservation!.status).toBe('pending');
    });

    it('should enforce pendingReservation status enum', async () => {
      const chain = new AuxChain({
        userId: 220002,
        chainId: 'ac_pending_enum',
        pendingReservation: {
          reservationId: 'res_002',
          status: 'invalid'
        }
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should accept all valid pendingReservation statuses', async () => {
      const statuses = ['pending', 'fulfilled', 'expired', 'cancelled'] as const;
      const savedChains = await Promise.all(
        statuses.map((status, index) => {
          const chain = new AuxChain({
            userId: 220100 + index,
            chainId: `ac_pending_status_${status}`,
            pendingReservation: {
              reservationId: `res_${status}`,
              status
            }
          });

          return chain.save();
        })
      );

      savedChains.forEach((saved, index) => {
        expect(saved.pendingReservation!.status).toBe(statuses[index]);
      });
    });
  });

  describe('reservationHistory subdocument', () => {
    it('should store reservation history entries', async () => {
      const now = new Date();

      const chain = new AuxChain({
        userId: 230001,
        chainId: 'ac_history_test',
        reservationHistory: [
          {
            reservationId: 'res_hist_001',
            signal: 'start-focus',
            duration: 25,
            createdAt: now,
            fulfilledAt: new Date(now.getTime() + 14 * 60 * 1000),
            status: 'fulfilled'
          },
          {
            reservationId: 'res_hist_002',
            signal: 'start-task',
            duration: 30,
            createdAt: now,
            delayedAt: new Date(now.getTime() + 15 * 60 * 1000),
            delayMinutes: 5,
            status: 'delayed'
          }
        ]
      });

      const saved = await chain.save();

      expect(saved.reservationHistory).toHaveLength(2);
      expect(saved.reservationHistory[0].reservationId).toBe('res_hist_001');
      expect(saved.reservationHistory[0].status).toBe('fulfilled');
      expect(saved.reservationHistory[1]).toMatchObject({
        reservationId: 'res_hist_002',
        status: 'delayed',
        delayMinutes: 5
      });
    });

    it('should enforce reservationHistory status enum', async () => {
      const chain = new AuxChain({
        userId: 230002,
        chainId: 'ac_history_enum',
        reservationHistory: [
          {
            reservationId: 'res_hist_003',
            status: 'invalid'
          }
        ]
      });

      await expect(chain.save()).rejects.toThrow();
    });

    it('should accept all valid reservationHistory statuses', async () => {
      const statuses = ['fulfilled', 'expired', 'cancelled', 'delayed'] as const;
      const savedChains = await Promise.all(
        statuses.map((status, index) => {
          const chain = new AuxChain({
            userId: 230100 + index,
            chainId: `ac_hist_status_${status}`,
            reservationHistory: [
              {
                reservationId: `res_${status}`,
                status
              }
            ]
          });

          return chain.save();
        })
      );

      savedChains.forEach((saved, index) => {
        expect(saved.reservationHistory[0].status).toBe(statuses[index]);
      });
    });
  });

  describe('timestamps', () => {
    it('should have createdAt and updatedAt', async () => {
      const chain = new AuxChain({
        userId: 240001,
        chainId: 'ac_timestamp_test'
      });

      const saved = await chain.save();

      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });
  });

  describe('indexes', () => {
    it('should have userId index', () => {
      const indexes = AuxChain.schema.indexes();
      const hasUserIdIndex = indexes.some(([fields]) => 'userId' in fields);
      expect(hasUserIdIndex).toBe(true);
    });
  });
});
