export interface Link {
  id: string;
  projectId: string;
  source: string;
  target: string;
  sourceHandle: string | null;
  targetHandle: string | null;
  type: string | null;
  animated: number;
  data: string | null;
  createdAt: Date;
}
