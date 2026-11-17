export type IdeaType = 'Content' | 'Product';
export type IdeaStatus = 'queued' | 'building' | 'shipped';

export interface IdeaItem {
  id: string;
  type: IdeaType;
  format: string; // e.g., 'Video', 'Essay', 'Micro-App', 'Feature'
  title: string;
  hook: string;
  cantWaitCount: number;
  passCount: number;
  status: IdeaStatus;
  createdAt: number;
}
