/**
 * ตรรกะกระดานแคนวาสของบอร์ดจ่ายงาน (แยกออกมาเป็นฟังก์ชันล้วน ๆ เพื่อเทสต์ได้)
 *
 * ใช้คู่กับ app/master/work-board/canvas-view.tsx — กระดาน Excalidraw ที่ 1 กรอบ (frame) = 1 โต๊ะ
 *  • deskOfPlanCards() : อ่าน element บนกระดาน → การ์ด "แผน" แต่ละใบตอนนี้อยู่โต๊ะไหน
 *  • diffDeskMoves()   : เทียบกับที่เห็นครั้งก่อน → ใบไหนถูกลากย้ายโต๊ะ (ต้องเขียนกลับเข้าแผน)
 *
 * กฎกันข้อมูลพัง: การ์ดที่อยู่นอกกรอบที่ระบบรู้จัก จะ "ไม่นับ" (ไม่ใช่แปลว่าไม่มีโต๊ะ)
 * — กันเคสวางการ์ดใหม่กลางจอ/ผู้ใช้ลากออกมาพักไว้ แล้วระบบเผลอล้างโต๊ะออกจากแผน
 */

/** element ดิบจากกระดาน — เอาเฉพาะ field ที่ใช้ */
export type CanvasEl = {
  id?: string;
  type?: string;
  name?: string;
  frameId?: string | null;
  customData?: Record<string, unknown> | null;
};
export type DeskDept = { id: string; name: string };

/** กรอบไหนคือโต๊ะไหน — ยึด customData.kind="wb_desk" ก่อน · ไม่มีค่อยเทียบชื่อกรอบกับชื่อโต๊ะ (เผื่อผู้ใช้วาดกรอบเอง)
 *  ค่า null = กรอบ "ยังไม่ระบุโต๊ะ" (ตั้งใจให้แปลว่าไม่มีโต๊ะ) */
export function deskFrames(els: CanvasEl[], departments: DeskDept[]): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const el of els) {
    if (el?.type !== "frame" || !el.id) continue;
    const d = el.customData as { kind?: string; id?: string } | undefined | null;
    if (d?.kind === "wb_desk") { out.set(String(el.id), d.id ? String(d.id) : null); continue; }
    const byName = departments.find((x) => x.name === String(el.name ?? "").trim());
    if (byName) out.set(String(el.id), byName.id);
  }
  return out;
}

/** การ์ด "แผน" แต่ละใบอยู่โต๊ะไหนบนกระดานตอนนี้ (เฉพาะใบที่อยู่ในกรอบที่รู้จัก) */
export function deskOfPlanCards(els: CanvasEl[], departments: DeskDept[]): Map<string, string | null> {
  const frames = deskFrames(els, departments);
  const out = new Map<string, string | null>();
  for (const el of els) {
    const d = el?.customData as { kind?: string; id?: string } | undefined | null;
    if (d?.kind !== "wb_plan" || !d.id) continue;
    const fid = el.frameId ? String(el.frameId) : "";
    if (!fid || !frames.has(fid)) continue;          // นอกกรอบที่รู้จัก → ไม่ยุ่ง
    out.set(String(d.id), frames.get(fid) ?? null);
  }
  return out;
}

/** เทียบกับครั้งก่อน → ใบที่ต้องเขียนกลับเข้าแผน
 *  - ใบที่เพิ่งเห็นครั้งแรก = แค่จำไว้ ไม่ถือว่าย้าย (กันเขียนทับตอนเปิดกระดานครั้งแรก)
 *  - ฟังก์ชันนี้ไม่แก้ seen — ผู้เรียกอัปเดตเองหลังใช้ (จะได้ตัดสินใจตอน error ได้) */
export function diffDeskMoves(
  now: Map<string, string | null>,
  seen: Map<string, string | null>,
): { lineId: string; deptId: string | null }[] {
  const moves: { lineId: string; deptId: string | null }[] = [];
  for (const [lineId, deskNow] of now) {
    if (!seen.has(lineId)) continue;                       // ครั้งแรกที่เห็นใบนี้
    if ((seen.get(lineId) ?? null) === deskNow) continue;  // อยู่ที่เดิม
    moves.push({ lineId, deptId: deskNow });
  }
  return moves;
}
