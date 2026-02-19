import { Node, Edge as Link } from "@xyflow/react";

export interface GraphMutationPayload {
  block?: Node;
  blockId?: string;
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  link?: Link;
  linkId?: string;
  data?: Record<string, unknown>;
  intent?: string;
  isLocked?: boolean;
  ownerId?: string;
  color?: string;
  blocks?: Node[];
  links?: Link[];
}

export interface ProjectCanvasProps {
  initialProjectId?: string;
}
