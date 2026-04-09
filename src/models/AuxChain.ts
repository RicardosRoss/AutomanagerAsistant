import mongoose, { Schema } from 'mongoose';
import type {
  IAuxChain,
  IAuxChainModel,
  IPendingReservation,
  IReservationHistoryEntry
} from '../types/models.js';

const pendingReservationSchema = new Schema<IPendingReservation>(
  {
    reservationId: { type: String },
    signal: { type: String },
    duration: { type: Number },
    createdAt: { type: Date },
    deadlineAt: { type: Date },
    status: { type: String, enum: ['pending', 'fulfilled', 'expired', 'cancelled'] }
  },
  { _id: false }
);

const reservationHistorySchema = new Schema<IReservationHistoryEntry>(
  {
    reservationId: { type: String },
    signal: { type: String },
    duration: { type: Number },
    createdAt: { type: Date },
    fulfilledAt: { type: Date },
    delayedAt: { type: Date },
    delayMinutes: { type: Number },
    status: { type: String, enum: ['fulfilled', 'expired', 'cancelled', 'delayed'], required: true }
  },
  { _id: false }
);

const auxChainSchema = new Schema<IAuxChain, IAuxChainModel>(
  {
    userId: { type: Number, required: true },
    chainId: { type: String, unique: true, required: true },
    pendingReservation: pendingReservationSchema,
    reservationHistory: [reservationHistorySchema],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

auxChainSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);

const AuxChain = mongoose.model<IAuxChain, IAuxChainModel>('AuxChain', auxChainSchema);

export type { IAuxChain, IAuxChainModel, AuxChainDocument } from '../types/models.js';
export default AuxChain;
