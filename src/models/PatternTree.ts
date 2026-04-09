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
    userId: { type: Number, required: true },
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

patternTreeSchema.index({ userId: 1 }, { unique: true });

patternTreeSchema.statics.findOrCreateForUser = async function findOrCreateForUser(
  this: IPatternTreeModel,
  userId: number
): Promise<PatternTreeDocument> {
  try {
    await this.init();

    const tree = await this.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          treeId: generateId('pt'),
          nodes: [],
          limits: { maxNewPatternsPerDay: 1 }
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );

    if (!tree) {
      throw new Error(`无法为用户 ${userId} 初始化定式树`);
    }

    return tree;
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      const existing = await this.findOne({ userId });
      if (existing) {
        return existing;
      }
    }

    throw error;
  }
};

const PatternTree = mongoose.model<IPatternTree, IPatternTreeModel>('PatternTree', patternTreeSchema);

export type { IPatternTree, IPatternTreeModel, PatternTreeDocument } from '../types/models.js';
export default PatternTree;
