export type IdeaType = 'Content' | 'Product';
export type IdeaStatus = 'queued' | 'building' | 'shipped';

export interface IdeaItem {
  id: string;
  no?: string;
  type: IdeaType;
  format: string;
  title: string; // One-liner Description
  hook: string; // Full Description (or summary)
  furtherRead?: string; // Further Read/Listen URL or reference
  inPot: boolean; // Pot column (true = active in swipe feed)
  cantWaitCount: number;
  passCount: number;
  status: IdeaStatus;
  createdAt: number;
}

export interface LabSchedule {
  enabled: boolean;
  time: string; // e.g. "09:00"
  timezone: string;
}

export interface Lab {
  id: string;
  code: string;
  name: string;
  ownerId: string;
  ownerName: string;
  memberIds: string[];
  schedule: LabSchedule;
  googleDocId?: string;
  lastSyncedAt?: number;
  createdAt: number;
}
