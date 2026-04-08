import mongoose, { Schema } from 'mongoose';
import type {
  IPrecedentRule,
  IPrecedentRuleModel,
  IPrecedentRuleScope,
  PrecedentRuleDocument
} from '../types/models.js';

const scopeSchema = new Schema<IPrecedentRuleScope>(
  {
    behaviorKey: { type: String, index: true, required: true },
    chainType: { type: String, enum: ['main', 'aux'], required: true }
  },
  { _id: false }
);

const precedentRuleSchema = new Schema<IPrecedentRule, IPrecedentRuleModel>(
  {
    userId: { type: Number, index: true, required: true },
    scope: {
      type: scopeSchema,
      required: true
    },
    decision: { type: String, enum: ['allow_forever'], required: true },
    createdAt: { type: Date, default: () => new Date() }
  },
  {}
);

precedentRuleSchema.index({ userId: 1, 'scope.behaviorKey': 1, 'scope.chainType': 1 }, { unique: true });

const PrecedentRule = mongoose.model<IPrecedentRule, IPrecedentRuleModel>(
  'PrecedentRule',
  precedentRuleSchema
);

export type { IPrecedentRule, IPrecedentRuleModel, PrecedentRuleDocument } from '../types/models.js';
export default PrecedentRule;
