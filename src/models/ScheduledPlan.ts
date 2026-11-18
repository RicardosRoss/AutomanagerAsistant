import mongoose, { Schema } from 'mongoose';
import type { ScheduleItemSnapshot } from '../utils/scheduleSnapshot.js';

export type ReminderStatus = 'pending' | 'sending' | 'sent' | 'dismissed' | 'expired' | 'failed' | 'unknown';
export interface IScheduledItem extends ScheduleItemSnapshot {
  token: string;
  status: ReminderStatus;
  attempts: number;
  claimedAt?: Date;
  claim?: string;
  retryAt?: Date;
  sentAt?: Date;
  messageId?: number;
}
export interface IScheduledPlan {
  userId: number;
  date: string;
  timezone: string;
  revision: string;
  generatedAt: Date;
  items: IScheduledItem[];
  __v: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const itemSchema = new Schema<IScheduledItem>({
  key: { type: String, required: true },
  token: { type: String, required: true },
  title: { type: String, required: true, maxlength: 2000 },
  kind: { type: String, required: true, enum: ['fixed', 'pinned', 'flex'] },
  startMinute: { type: Number, required: true },
  endMinute: { type: Number, required: true },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'sending', 'sent', 'dismissed', 'expired', 'failed', 'unknown'],
    required: true },
  attempts: { type: Number, default: 0 },
  claimedAt: Date,
  claim: String,
  retryAt: Date,
  sentAt: Date,
  messageId: Number
}, { _id: false });
const schema = new Schema<IScheduledPlan>({
  userId: { type: Number, required: true },
  date: { type: String, required: true },
  timezone: { type: String, required: true },
  revision: { type: String, required: true },
  generatedAt: { type: Date, required: true },
  items: { type: [itemSchema], default: [] }
}, { timestamps: true });
schema.index({ userId: 1, date: 1 }, { unique: true });
schema.index({ 'items.status': 1, 'items.startAt': 1 });
schema.index({ userId: 1, 'items.token': 1 });

export default mongoose.model<IScheduledPlan>('ScheduledPlan', schema);
