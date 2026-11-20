/**
 * แม่แบบเริ่มต้นของ "แผนผังการเก็บไฟล์" (entity storage_plan_flow/main)
 * ใช้ 2 ที่: หน้า /master/storage-plan + แท็บ "ที่เก็บไฟล์" ในผังระบบของแผนงาน (components/team-plan/flow-view) — กระดานเดียวกัน แก้ที่ไหนก็ตรงกัน
 */
import type { FlowScene, FlowSceneEdge, FlowSceneNode } from "@/lib/flowchart";

export const STORAGE_PLAN_ENTITY = { type: "storage_plan_flow", id: "main" } as const;

/** แม่แบบเริ่มต้น: ไฟล์ใหม่ → ถามทีละข้อ → ไปที่เก็บไหน (ตามหลักที่ตกลงกันในกฎที่เก็บไฟล์) — ลบ/ย้าย/แก้ได้ทั้งหมด */
export function storagePlanStarter(t: (th: string, en: string) => string): FlowScene {
  const node = (id: string, type: FlowSceneNode["type"], x: number, y: number, w: number, h: number, label: string, color?: FlowSceneNode["data"]["color"]): FlowSceneNode =>
    ({ id, type, position: { x, y }, width: w, height: h, data: color ? { label, color } : { label } });
  const edge = (id: string, source: string, sh: string, target: string, th: string, label = ""): FlowSceneEdge =>
    ({ id, source, target, sourceHandle: sh, targetHandle: th, label });
  return {
    kind: "flowchart", v: 1,
    nodes: [
      node("in", "start", 0, 220, 180, 64, t("ไฟล์ใหม่เข้าระบบ\nอัปโหลด · Ctrl+V · ลากวาง", "New file comes in\nupload · Ctrl+V · drag-drop")),
      node("q1", "question", 260, 200, 200, 104, t("ลับ / ผูกสิทธิ์?", "Private / permission-bound?")),
      node("sb", "storage", 560, 40, 220, 96, t("Supabase\nบิล · สัญญา · เอกสารพนักงาน", "Supabase\nbills · contracts · HR documents"), "emerald"),
      node("q2", "question", 540, 320, 220, 104, t("ต้องเปิดแก้ในโปรแกรม?", "Opened and edited in an app?")),
      node("gd", "storage", 860, 220, 220, 96, t("Google Drive\nงานพิมพ์ · AI / PSD · ไฟล์ทำงาน", "Google Drive\nprint files · AI / PSD · working files"), "blue"),
      node("r2", "storage", 860, 440, 220, 96, t("R2\nรูปโชว์บนจอบ่อย · รูปสินค้า · รูปเว็บ", "R2\nimages shown often · product · website"), "violet"),
      node("note", "note", 0, 420, 260, 120, t("โน้ตของคุณ\nเขียนกฎตั้งชื่อไฟล์ · โครงโฟลเดอร์ · ใครรับผิดชอบ\n(แม่แบบนี้ ลบ ย้าย แก้ได้ทั้งหมด)", "Your notes\nfile naming · folder structure · owner\n(this starter can be edited freely)")),
    ],
    edges: [
      edge("e1", "in", "r", "q1", "l"),
      edge("e2", "q1", "t", "sb", "l", t("ใช่", "Yes")),
      edge("e3", "q1", "b", "q2", "l", t("ไม่ใช่", "No")),
      edge("e4", "q2", "t", "gd", "l", t("ใช่", "Yes")),
      edge("e5", "q2", "b", "r2", "l", t("ไม่ใช่", "No")),
    ],
  };
}
