import type { UserDocument } from '../types/models.js';

export function pickLegacyShell(user: Pick<UserDocument, 'cultivation'>) {
  return {
    spiritualPower: user.cultivation.spiritualPower,
    realm: user.cultivation.realm,
    realmId: user.cultivation.realmId,
    realmStage: user.cultivation.realmStage,
    immortalStones: user.cultivation.immortalStones
  };
}

export function hasLegacyShellChanged(
  before: ReturnType<typeof pickLegacyShell>,
  after: ReturnType<typeof pickLegacyShell>
): boolean {
  return (
    before.spiritualPower !== after.spiritualPower
    || before.realm !== after.realm
    || before.realmId !== after.realmId
    || before.realmStage !== after.realmStage
    || before.immortalStones !== after.immortalStones
  );
}

export interface CanonicalMigrationPreparation {
  hadCanonical: boolean;
  hasCanonical: boolean;
  canonicalModified: boolean;
  shellChanged: boolean;
  changed: boolean;
  beforeShell: ReturnType<typeof pickLegacyShell>;
  afterShell: ReturnType<typeof pickLegacyShell>;
}

export function prepareCanonicalMigrationForUser(user: UserDocument): CanonicalMigrationPreparation {
  const hadCanonical = Boolean(user.cultivation.canonical?.state);
  const beforeShell = pickLegacyShell(user);

  user.ensureCanonicalCultivation();
  user.syncLegacyCultivationShell();

  const hasCanonical = Boolean(user.cultivation.canonical?.state);
  const afterShell = pickLegacyShell(user);
  const canonicalModified = user
    .modifiedPaths()
    .some((path) => path === 'cultivation.canonical' || path.startsWith('cultivation.canonical.'));
  const shellChanged = hasLegacyShellChanged(beforeShell, afterShell);
  const changed = canonicalModified || (!hadCanonical && hasCanonical) || shellChanged;

  return {
    hadCanonical,
    hasCanonical,
    canonicalModified,
    shellChanged,
    changed,
    beforeShell,
    afterShell
  };
}
