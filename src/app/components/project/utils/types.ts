import { Node, Edge as Link } from "@xyflow/react";

export interface GraphMutationPayload {
  block?: Node;
  blockId?: string;
  position?: { x: number; y: number };
  dimensions?: { width: number; height: number };
  link?: Link;
  linkId?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
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
