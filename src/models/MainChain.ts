import mongoose, { Schema } from 'mongoose';
import type {
  IMainChain,
  IMainChainModel,
  IMainChainNode,
  MainChainDocument
} from '../types/models.js';
import { generateId } from '../utils/index.js';

const nodeSchema = new Schema<IMainChainNode>(
  {
    nodeNo: { type: Number, required: true },
    level: { type: String, enum: ['unit', 'group', 'cluster'], required: true },
    taskId: { type: String, required: true },
    status: { type: String, enum: ['running', 'completed', 'failed'], required: true }
  },
  { _id: false }
);

const mainChainSchema = new Schema<IMainChain, IMainChainModel>(
  {
    userId: { type: Number, index: true, required: true },
    chainId: { type: String, unique: true, required: true },
    sacredMarker: {
      type: { type: String, enum: ['seat', 'object', 'message', 'custom'], required: true },
      label: { type: String, required: true }
    },
    levelCounters: {
      unit: { type: Number, default: 0 },
      group: { type: Number, default: 0 },
      cluster: { type: Number, default: 0 }
    },
    nodes: [nodeSchema],
    status: { type: String, enum: ['active', 'broken'], default: 'active' }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

mainChainSchema.statics.findOrCreateActive = async function findOrCreateActive(
  this: IMainChainModel,
  userId: number,
  markerLabel: string
): Promise<MainChainDocument> {
  const existing = await this.findOne({ userId, status: 'active' });
  if (existing) {
    return existing;
  }

  const chainId = generateId('mc');
  return this.create({
    userId,
    chainId,
    sacredMarker: { type: 'seat', label: markerLabel },
    nodes: [],
    status: 'active'
  });
};

const MainChain = mongoose.model<IMainChain, IMainChainModel>('MainChain', mainChainSchema);

export type { IMainChain, IMainChainModel, MainChainDocument } from '../types/models.js';
export default MainChain;
