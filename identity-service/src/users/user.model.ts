import { Schema, model } from 'mongoose';
import type { Rol } from '@smartparking/contracts';

export interface UserDoc {
  email: string;
  passwordHash: string;
  roles: Rol[];
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  roles: { type: [String], enum: ['ADMIN', 'CLIENTE'], required: true },
  createdAt: { type: Date, default: Date.now },
});

export const UserModel = model<UserDoc>('User', userSchema);
