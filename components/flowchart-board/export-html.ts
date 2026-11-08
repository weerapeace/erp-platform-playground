// แปลงกระดาน flowchart → HTML ที่ใส่ style ในบรรทัดล้วน (ไม่พึ่ง class/Tailwind)
// เพื่อส่งเข้าตัวแปลงรูปกลาง lib/html-to-png (htmlToPngBlob) → ปุ่ม "บันทึกเป็นรูป"
// สี/รูปทรงอ่านจาก lib/flowchart ชุดเดียวกับบนจอ · เส้นใช้สูตรหักมุมเดียวกับ React Flow (getSmoothStepPath)

import { Position, getSmoothStepPath } from "@xyflow/react";
import { fileTypeSvg } from "@/lib/file-types";
import { FLOW_PALETTE, flowSceneBounds, handlePoint, nodeColor, splitFlowLabel, type FlowScene, type FlowSceneNode } from "@/lib/flowchart";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SIDE: Record<string, Position> = { t: Position.Top, r: Position.Right, b: Position.Bottom, l: Position.Left };
const FONT = "'Sarabun','Leelawadee UI','Tahoma',sans-serif";

function nodeHtml(n: FlowSceneNode, ox: number, oy: number): string {
  const color = nodeColor(n.type, n.data);
  const p = FLOW_PALETTE[color];
  const x = n.position.x - ox, y = n.position.y - oy, w = n.width, h = n.height;
  const { title, sub } = splitFlowLabel(n.data.label);
  const labelHtml = `<div style="width:100%;text-align:${n.type === "note" ? "left" : "center"};white-space:pre-wrap;word-break:break-word;line-height:1.35"><div style="font-size:13px;font-weight:700;color:${p.text}">${esc(title) || "&nbsp;"}</div>${sub ? `<div style="font-size:11px;margin-top:2px;color:${p.sub}">${esc(sub)}</div>` : ""}</div>`;
  const exts = n.data.exts?.length ? n.data.exts : [""];
  const icons = n.type === "file"
    ? `<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;line-height:0">${exts.map((e) => fileTypeSvg(e, exts.length > 4 ? 30 : 36)).join("")}</div>`
    : "";
  const text = n.type === "file"
    ? `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;width:100%">${icons}${labelHtml}</div>`
    : n.type === "folder"
    ? `<div style="text-align:left;min-width:0"><div style="font-size:13px;font-weight:700;color:${p.text}">${esc(n.data.label || "—")}</div>${n.data.path ? `<div style="font-size:10px;color:${p.sub};word-break:break-all">${esc(n.data.path)}</div>` : ""}</div>`
    : labelHtml;
  let shape = "";
  let box = `background:${p.fill};border:2px solid ${p.stroke};border-radius:${n.type === "start" ? 999 : n.type === "note" ? 4 : n.type === "file" ? 12 : 10}px;`;
  let pad = n.type === "note" ? "10px 12px" : n.type === "file" ? "8px 10px" : "6px 12px";
  if (n.type === "question") {
    box = ""; pad = `${Math.round(h * 0.18)}px ${Math.round(w * 0.22)}px`;
    shape = `<svg width="${w}" height="${h}" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;overflow:visible"><polygon points="50,1 99,50 50,99 1,50" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  } else if (n.type === "storage") {
    box = ""; pad = `${Math.round(h * 0.22)}px ${Math.round(w * 0.1)}px ${Math.round(h * 0.1)}px`;
    shape = `<svg width="${w}" height="${h}" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute;left:0;top:0;overflow:visible"><path d="M1,12 A49,11 0 0,1 99,12 L99,88 A49,11 0 0,1 1,88 Z" fill="${p.fill}" stroke="${p.stroke}" stroke-width="2" vector-effect="non-scaling-stroke"/><path d="M1,12 A49,11 0 0,0 99,12" fill="none" stroke="${p.stroke}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const align = n.type === "note" ? "flex-start" : "center";
  return `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;box-sizing:border-box;display:flex;align-items:${align};justify-content:center;padding:${pad};${box}">${shape}<div style="position:relative;width:100%;display:flex;justify-content:center">${text}</div></div>`;
}

/** กระดานทั้งหมด → HTML (ขนาดเท่ากรอบที่ครอบทุกกล่อง + ขอบ 40px) */
export function flowSceneToHtml(s: FlowScene): { html: string; width: number; height: number } {
  const b = flowSceneBounds(s, 40);
  const byId = new Map(s.nodes.map((n) => [n.id, n]));
  const paths: string[] = [];
  const labels: string[] = [];
  for (const e of s.edges) {
    const a = byId.get(e.source), z = byId.get(e.target);
    if (!a || !z) continue;
    const sp = handlePoint(a, e.sourceHandle), tp = handlePoint(z, e.targetHandle ?? "l");
    const [d, lx, ly] = getSmoothStepPath({
      sourceX: sp.x - b.x, sourceY: sp.y - b.y, sourcePosition: SIDE[sp.side],
      targetX: tp.x - b.x, targetY: tp.y - b.y, targetPosition: SIDE[tp.side], borderRadius: 10,
    });
    paths.push(`<path d="${d}" fill="none" stroke="#64748b" stroke-width="1.75" marker-end="url(#fc-arrow)"/>`);
    if (e.label) labels.push(`<div style="position:absolute;left:${lx}px;top:${ly}px;transform:translate(-50%,-50%);background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600;color:#475569;white-space:nowrap">${esc(e.label)}</div>`);
  }
  const svg = `<svg width="${b.w}" height="${b.h}" style="position:absolute;left:0;top:0;overflow:visible"><defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker></defs>${paths.join("")}</svg>`;
  const nodes = s.nodes.map((n) => nodeHtml(n, b.x, b.y)).join("");
  const html = `<div style="position:relative;width:${b.w}px;height:${b.h}px;background:#ffffff;font-family:${FONT}">${svg}${nodes}${labels.join("")}</div>`;
  return { html, width: Math.ceil(b.w), height: Math.ceil(b.h) };
}
