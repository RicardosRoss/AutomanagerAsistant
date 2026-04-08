import mongoose, { Schema } from 'mongoose';
import type {
  IPatternNode,
  IPatternTree,
  IPatternTreeModel,
  PatternTreeDocument
} from '../types/models.js';
import { generateId } from '../utils/index.js';

const patternNodeSchema = new Schema<IPatternNode>(
  {
    nodeId: { type: String, required: true },
    parentId: { type: String, default: null },
    title: { type: String, required: true },
    status: {
      type: String,
      enum: ['pending', 'active', 'failed', 'deleted'],
      default: 'pending'
    },
    createdOn: { type: String, required: true }, // YYYY-MM-DD
    children: [{ type: String }]
  },
  { _id: false }
);

const patternTreeSchema = new Schema<IPatternTree, IPatternTreeModel>(
  {
    userId: { type: Number, index: true, required: true },
    treeId: { type: String, unique: true, required: true },
    nodes: [patternNodeSchema],
    limits: {
      maxNewPatternsPerDay: { type: Number, default: 1 }
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

patternTreeSchema.statics.findOrCreateForUser = async function findOrCreateForUser(
  this: IPatternTreeModel,
  userId: number
): Promise<PatternTreeDocument> {
  const existing = await this.findOne({ userId });
  if (existing) return existing;

  const treeId = generateId('pt');
  return this.create({ userId, treeId, nodes: [], limits: { maxNewPatternsPerDay: 1 } });
};

const PatternTree = mongoose.model<IPatternTree, IPatternTreeModel>('PatternTree', patternTreeSchema);

export type { IPatternTree, IPatternTreeModel, PatternTreeDocument } from '../types/models.js';
export default PatternTree;
