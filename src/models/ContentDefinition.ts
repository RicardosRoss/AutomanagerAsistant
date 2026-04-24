import mongoose, { Schema } from 'mongoose';

export type ContentDefinitionCategory =
  | 'battle_art'
  | 'divine_power'
  | 'breakthrough_method'
  | 'main_method'
  | 'material'
  | 'consumable'
  | 'gold_nature'
  | 'breakthrough_route'
  | 'effect_label';

export type ContentDefinitionStatus = 'draft' | 'review' | 'runtime_ready' | 'disabled';

export interface IContentDefinition {
  definitionId: string;
  category: ContentDefinitionCategory;
  name: string;
  version: number;
  status: ContentDefinitionStatus;
  source: 'builtin_seed' | 'manual' | 'migration' | 'generated';
  tags: string[];
  realmFloor: string;
  realmCeiling?: string;
  payload: unknown;
  balanceProfile?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
}

const contentDefinitionSchema = new Schema<IContentDefinition>(
  {
    definitionId: {
      type: String,
      required: true
    },
    category: {
      type: String,
      required: true,
      enum: [
        'battle_art',
        'divine_power',
        'breakthrough_method',
        'main_method',
        'material',
        'consumable',
        'gold_nature',
        'breakthrough_route',
        'effect_label'
      ]
    },
    name: {
      type: String,
      required: true
    },
    version: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      required: true,
      enum: ['draft', 'review', 'runtime_ready', 'disabled']
    },
    source: {
      type: String,
      required: true,
      enum: ['builtin_seed', 'manual', 'migration', 'generated']
    },
    tags: {
      type: [String],
      default: []
    },
    realmFloor: {
      type: String,
      required: true
    },
    realmCeiling: String,
    payload: {
      type: Schema.Types.Mixed,
      required: true
    },
    balanceProfile: Schema.Types.Mixed
  },
  {
    timestamps: true
  }
);

contentDefinitionSchema.index({ definitionId: 1, version: 1 }, { unique: true });
contentDefinitionSchema.index({ category: 1, status: 1 });
contentDefinitionSchema.index({ tags: 1 });

const ContentDefinition = mongoose.model<IContentDefinition>('ContentDefinition', contentDefinitionSchema);

export default ContentDefinition;
