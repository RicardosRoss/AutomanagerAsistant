import mongoose, { Schema } from 'mongoose';
import { isValidTaskDescription } from '../utils/taskText.js';

export interface ITaskDraft {
  userId: number;
  token: string;
  mode: 'start' | 'reserve';
  stage: 'description' | 'ready' | 'submitting';
  description: string;
  duration: number;
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const schema = new Schema<ITaskDraft>(
  {
    userId: { type: Number, required: true, unique: true },
    token: { type: String, required: true },
    mode: { type: String, enum: ['start', 'reserve'], required: true },
    stage: { type: String, enum: ['description', 'ready', 'submitting'], required: true },
    description: {
      type: String, default: '',
      validate: {
        validator: (value: string) => isValidTaskDescription(value, true), message: 'Invalid task description'
      }
    },
    duration: { type: Number, required: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } }
  },
  { timestamps: true }
);

export default mongoose.model<ITaskDraft>('TaskDraft', schema);
