import { COMBAT_BALANCE } from '../config/xuanjianCombat.js';
import {
  getRuntimeReadyContentBatch
} from '../config/xuanjianCanonical.js';
import type {
  CombatActionType,
  CombatResolution,
  CombatantSnapshot
} from '../types/cultivationCombat.js';

const RUNTIME_READY_CONTENT_BATCH = getRuntimeReadyContentBatch();
const RUNTIME_READY_BATTLE_ART_ACTIONS = new Map(
  RUNTIME_READY_CONTENT_BATCH.battleArts.map((item) => [
    item.entry.id,
    item.runtimeProfile.actionProfile.actionType
  ])
);
const RUNTIME_READY_DIVINE_POWER_ACTIONS = new Map(
  RUNTIME_READY_CONTENT_BATCH.divinePowers.map((item) => [
    item.entry.id,
    item.runtimeProfile.actionProfile.actionType
  ])
);

function mulberry32(seed: number) {
  let value = seed >>> 0;

  return () => {
    value += 0x6D2B79F5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildRuntimeReadyActionPool(snapshot: CombatantSnapshot): CombatActionType[] {
  const battleArtActions = snapshot.battleArtIds.flatMap((id) => {
    const actionType = RUNTIME_READY_BATTLE_ART_ACTIONS.get(id);
    return actionType ? [actionType] : [];
  });
  const divinePowerActions = snapshot.divinePowerIds.flatMap((id) => {
    const actionType = RUNTIME_READY_DIVINE_POWER_ACTIONS.get(id);
    return actionType ? [actionType] : [];
  });
  const pool = [...battleArtActions, ...divinePowerActions];
  return pool.length > 0 ? pool : ['attack'];
}

function pickActionType(snapshot: CombatantSnapshot, rng: () => number): CombatActionType {
  const pool = buildRuntimeReadyActionPool(snapshot);
  const index = Math.floor(rng() * pool.length);
  return pool[index] ?? pool[0] ?? 'attack';
}

export function buildOutcomeSummary(input: {
  outcome: CombatResolution['outcome'];
  firstAction: CombatActionType;
  enemyTags: string[];
}) {
  if (input.outcome === 'loss') {
    return input.enemyTags.includes('rush')
      ? '你被对手抢先逼近，仓促应对后败退。'
      : '你连斗数合后气机渐散，只得暂避锋芒。';
  }

  if (input.firstAction === 'movement') {
    return input.outcome === 'narrow_win'
      ? '你先以身法游走拉开空档，几经周旋后险险压过对手。'
      : '你先以身法游走拉开空档，随后趁势压制对手。';
  }

  if (input.firstAction === 'guard' || input.firstAction === 'ward') {
    return input.outcome === 'narrow_win'
      ? '你先稳住护势，借对手破绽艰难反制。'
      : '你先稳住护势，借对手破绽反手制胜。';
  }

  if (input.firstAction === 'control' || input.firstAction === 'domain') {
    return input.outcome === 'narrow_win'
      ? '你先以法意牵制对手，数合后才勉强压住局面。'
      : '你先以法意牵制对手，随后顺势压过敌手。';
  }

  if (input.firstAction === 'burst') {
    return input.outcome === 'narrow_win'
      ? '你先凝聚神通猛攻，对手虽强，终究被你艰难逼退。'
      : '你先凝聚神通猛攻，一击便压得对手气机散乱。';
  }

  return input.outcome === 'narrow_win'
    ? '你先声夺人，连进数手后艰难压过对手。'
    : '你先声夺人，连进数手后压过对手。';
}

export function resolveCombat(input: {
  encounterId: string;
  player: CombatantSnapshot;
  enemy: CombatantSnapshot;
  seed: number;
}): CombatResolution {
  const rng = mulberry32(input.seed);
  const actionRng = mulberry32(input.seed ^ 0x9E3779B9);
  const playerInitiative = input.player.dimensions.speed * COMBAT_BALANCE.initiativeSpeedWeight
    + input.player.dimensions.sense * COMBAT_BALANCE.initiativeSenseWeight;
  const enemyInitiative = input.enemy.dimensions.speed * COMBAT_BALANCE.initiativeSpeedWeight
    + input.enemy.dimensions.sense * COMBAT_BALANCE.initiativeSenseWeight;
  const firstStrike = playerInitiative >= enemyInitiative ? 'player' : 'enemy';
  const rounds: CombatResolution['rounds'] = [];
  let playerHp = input.player.vitality;
  let enemyHp = input.enemy.vitality;

  const order: Array<[CombatantSnapshot['side'], CombatantSnapshot, CombatantSnapshot]> = firstStrike === 'player'
    ? [['player', input.player, input.enemy], ['enemy', input.enemy, input.player]]
    : [['enemy', input.enemy, input.player], ['player', input.player, input.enemy]];

  for (let round = 1; round <= COMBAT_BALANCE.maxRounds && playerHp > 0 && enemyHp > 0; round += 1) {
    for (const [actor, self, target] of order) {
      const attackScore = self.dimensions.attack * COMBAT_BALANCE.attackWeight + self.dimensions.speed;
      const mitigation = target.dimensions.defense * COMBAT_BALANCE.mitigationWeight + target.dimensions.sense;
      const damage = Math.max(1, Math.floor(attackScore - mitigation / 2 + rng() * 2));

      if (actor === 'player') {
        enemyHp -= damage;
      } else {
        playerHp -= damage;
      }

      rounds.push({
        round,
        actor,
        action: pickActionType(self, actionRng),
        damage
      });

      if (playerHp <= 0 || enemyHp <= 0) {
        break;
      }
    }
  }

  const outcome = enemyHp <= 0 && playerHp > Math.floor(input.player.vitality / 3)
    ? 'win'
    : enemyHp <= 0
      ? 'narrow_win'
      : 'loss';
  const firstPlayerRound = rounds.find((item) => item.actor === 'player');
  const summary = buildOutcomeSummary({
    outcome,
    firstAction: firstPlayerRound?.action ?? 'attack',
    enemyTags: input.enemy.tags
  });

  return {
    encounterId: input.encounterId,
    outcome,
    enemyName: '拦路青狼',
    firstStrike,
    rounds,
    summary
  };
}
