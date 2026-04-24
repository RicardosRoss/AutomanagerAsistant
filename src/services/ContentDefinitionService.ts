import ContentDefinition from '../models/ContentDefinition.js';
import {
  getRuntimeContentNameMap,
  getRuntimeReadyContentBatch,
  type BattleArtRegistryEntry,
  type DivinePowerRegistryEntry
} from '../config/xuanjianV2Registry.js';
import type { RealmId } from '../types/cultivationCanonical.js';
import type { RuntimeReadyBattleArtProfile, RuntimeReadyDivinePowerProfile } from '../types/cultivationV2.js';
import type { IContentDefinition } from '../models/ContentDefinition.js';

type RuntimeReadyContentBatch = ReturnType<typeof getRuntimeReadyContentBatch>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNumber(record: Record<string, unknown>, key: string, definitionId: string): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid content definition ${definitionId}: ${key}`);
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string, definitionId: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Invalid content definition ${definitionId}: ${key}`);
  }
  return value;
}

function requirePayload(document: IContentDefinition): Record<string, unknown> {
  if (!isRecord(document.payload)) {
    throw new Error(`Invalid content definition ${document.definitionId}: payload`);
  }
  return document.payload;
}

function requireBalanceProfile(document: IContentDefinition): Record<string, unknown> {
  if (!isRecord(document.balanceProfile)) {
    throw new Error(`Invalid content definition ${document.definitionId}: balanceProfile`);
  }
  return document.balanceProfile;
}

function projectBattleArt(document: IContentDefinition): {
  entry: BattleArtRegistryEntry;
  runtimeProfile: RuntimeReadyBattleArtProfile;
} {
  const payload = requirePayload(document);
  const balance = requireBalanceProfile(document);
  const category = requireString(payload, 'category', document.definitionId) as BattleArtRegistryEntry['category'];
  if (!['attack', 'guard', 'movement', 'support'].includes(category)) {
    throw new Error(`Invalid content definition ${document.definitionId}: category`);
  }
  const actionType = requireString(balance, 'actionType', document.definitionId) as RuntimeReadyBattleArtProfile['actionProfile']['actionType'];
  if (!['attack', 'guard', 'movement', 'support'].includes(actionType)) {
    throw new Error(`Invalid content definition ${document.definitionId}: actionType`);
  }

  const entry: BattleArtRegistryEntry = {
    id: document.definitionId,
    runtimeReady: payload.runtimeReady === true,
    category,
    tags: [...document.tags],
    requiredRealmId: requireString(payload, 'requiredRealmId', document.definitionId) as RealmId,
    requiredRealmSubStageId: typeof payload.requiredRealmSubStageId === 'string'
      ? payload.requiredRealmSubStageId
      : undefined
  };

  return {
    entry,
    runtimeProfile: {
      definitionId: document.definitionId,
      balanceProfile: {
        version: 1,
        attackWeight: requireNumber(balance, 'attackWeight', document.definitionId),
        defenseWeight: requireNumber(balance, 'defenseWeight', document.definitionId),
        senseWeight: requireNumber(balance, 'senseWeight', document.definitionId),
        speedWeight: requireNumber(balance, 'speedWeight', document.definitionId)
      },
      actionProfile: {
        actionType,
        tags: [...document.tags]
      }
    }
  };
}

function projectDivinePower(document: IContentDefinition): {
  entry: DivinePowerRegistryEntry;
  runtimeProfile: RuntimeReadyDivinePowerProfile;
} {
  const payload = requirePayload(document);
  const balance = requireBalanceProfile(document);
  const category = requireString(payload, 'category', document.definitionId) as DivinePowerRegistryEntry['category'];
  if (!['burst', 'control', 'ward', 'domain'].includes(category)) {
    throw new Error(`Invalid content definition ${document.definitionId}: category`);
  }
  const actionType = requireString(balance, 'actionType', document.definitionId) as RuntimeReadyDivinePowerProfile['actionProfile']['actionType'];
  if (!['burst', 'control', 'ward', 'domain'].includes(actionType)) {
    throw new Error(`Invalid content definition ${document.definitionId}: actionType`);
  }

  const entry: DivinePowerRegistryEntry = {
    id: document.definitionId,
    runtimeReady: payload.runtimeReady === true,
    category,
    tags: [...document.tags],
    requiredRealmId: requireString(payload, 'requiredRealmId', document.definitionId) as RealmId,
    requiredRealmSubStageId: typeof payload.requiredRealmSubStageId === 'string'
      ? payload.requiredRealmSubStageId
      : undefined
  };

  return {
    entry,
    runtimeProfile: {
      definitionId: document.definitionId,
      balanceProfile: {
        version: 1,
        attackWeight: requireNumber(balance, 'attackWeight', document.definitionId),
        defenseWeight: requireNumber(balance, 'defenseWeight', document.definitionId),
        senseWeight: requireNumber(balance, 'senseWeight', document.definitionId),
        speedWeight: requireNumber(balance, 'speedWeight', document.definitionId),
        stabilityWeight: requireNumber(balance, 'stabilityWeight', document.definitionId)
      },
      actionProfile: {
        actionType,
        tags: [...document.tags]
      }
    }
  };
}

class ContentDefinitionService {
  async loadRuntimeContentNameMap(): Promise<Record<string, string>> {
    const builtin = getRuntimeContentNameMap();
    const documents = await ContentDefinition.find({ status: 'runtime_ready' }).lean<IContentDefinition[]>();
    const names = { ...builtin };

    for (const document of documents) {
      names[document.definitionId] = document.name;
    }

    return names;
  }

  async loadRuntimeReadyContentBatch(): Promise<RuntimeReadyContentBatch> {
    const builtin = getRuntimeReadyContentBatch();
    const documents = await ContentDefinition.find({ status: 'runtime_ready' }).lean<IContentDefinition[]>();
    const dbBattleArts = [];
    const dbDivinePowers = [];

    for (const document of documents) {
      if (document.category === 'battle_art') {
        dbBattleArts.push(projectBattleArt(document));
      } else if (document.category === 'divine_power') {
        dbDivinePowers.push(projectDivinePower(document));
      }
    }

    return {
      battleArts: [...builtin.battleArts, ...dbBattleArts],
      divinePowers: [...builtin.divinePowers, ...dbDivinePowers]
    };
  }
}

export default ContentDefinitionService;
