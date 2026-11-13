// เส้นลูกศรของกระดาน flowchart ตามแบบ (หักมุม · ตรง · โค้ง) — ใช้ทั้งบนจอ (nodes.tsx) และตอนบันทึกเป็นรูป (export-html.ts)
// สูตรเส้นจาก React Flow ตัวเดียวกัน → รูปที่บันทึกหน้าตาเหมือนบนจอ · แบบลูกศรเก็บใน lib/flowchart (FlowSceneEdge.shape)

import { ConnectionLineType, getBezierPath, getSmoothStepPath, getStraightPath, type Position } from "@xyflow/react";
import type { FlowEdgeShape } from "@/lib/flowchart";

export type EdgeEnds = { sourceX: number; sourceY: number; sourcePosition: Position; targetX: number; targetY: number; targetPosition: Position };

/** → [path d, จุดวางป้าย x, y] */
export function flowEdgePath(shape: FlowEdgeShape, p: EdgeEnds): [string, number, number] {
  if (shape === "straight") {
    const [d, x, y] = getStraightPath({ sourceX: p.sourceX, sourceY: p.sourceY, targetX: p.targetX, targetY: p.targetY });
    return [d, x, y];
  }
  if (shape === "curve") {
    const [d, x, y] = getBezierPath({ ...p, curvature: 0.35 });
    return [d, x, y];
  }
  const [d, x, y] = getSmoothStepPath({ ...p, borderRadius: 10 });
  return [d, x, y];
}

/** เส้นตอนกำลังลากต่อ ให้เป็นแบบเดียวกับลูกศรที่จะได้ */
export const CONNECTION_LINE: Record<FlowEdgeShape, ConnectionLineType> = {
  step: ConnectionLineType.SmoothStep,
  straight: ConnectionLineType.Straight,
  curve: ConnectionLineType.Bezier,
};
