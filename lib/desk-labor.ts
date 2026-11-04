/**
 * ของกลาง — แบ่งค่าแรงของโต๊ะให้ "ทุกคนในโต๊ะ" (บอร์ดจ่ายงาน โหมดผู้บริหาร · แผงโต๊ะ)
 *   เจ้าของขอ 2026-11-04: "ค่าแรงรวมต้องรวมคนทั้งโต๊ะสิ"
 *
 * กติกา (ประมาณการ — ระบบไม่รู้ว่าใครทำชิ้นไหนจริง):
 *   งานจ่ายให้ "ทั้งโต๊ะ" (assignee_type = department / ไม่ระบุคน) → แบ่งเท่ากันทุกคนประจำโต๊ะ
 *   งานจ่ายหลายคน (assignees[])                                  → แบ่งเท่ากันตามจำนวนคนที่รับ
 *   งานคนเดียว                                                    → คนนั้นได้ทั้งหมด
 *   โต๊ะไม่มีคนประจำ + งานทั้งโต๊ะ → เข้าก้อน "ยังไม่มีคนรับ" (unassigned)
 *   ผลรวมทุกคน + unassigned = ค่าแรงรวมทั้งโต๊ะ เสมอ (ไม่หาย ไม่ซ้ำ)
 *
 * จับคู่คน: id ก่อน → ไม่มี id ใช้ชื่อ (ชื่อเต็ม / ชื่อเล่น / "ชื่อเต็ม (ชื่อเล่น)") ให้ตรงกับคนประจำโต๊ะ
 * ใช้ที่: app/master/work-board/exec-dispatch.tsx · ทดสอบ: lib/__tests__/desk-labor.test.ts
 */

export type LaborWo = {
  assignee_type?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  assignees?: { id?: string | null; name?: string | null }[] | null;
  /** ค่าแรงตามแผนของใบนี้ (บาท) */
  plan: number;
  /** ค่าแรงของส่วนที่รับคืนแล้ว (บาท) */
  got: number;
};
export type LaborMember = { id: string; name: string; aliases?: (string | null | undefined)[] };
export type PersonLabor = {
  key: string; name: string;
  /** คนประจำโต๊ะนี้ (false = คนนอกโต๊ะที่ถูกเลือกให้รับงาน) */
  member: boolean;
  /** งานที่รับคนเดียว */
  solo: number;
  /** ส่วนแบ่งงานที่รับหลายคน */
  shared: number;
  /** ส่วนแบ่งงานทั้งโต๊ะ */
  desk: number;
  total: number;
  /** ส่วนที่รับคืนแล้ว (แบ่งแบบเดียวกัน) */
  got: number;
  /** จำนวนใบที่มีส่วน */
  jobs: number;
};
export type DeskLabor = {
  total: number; got: number;
  people: PersonLabor[];
  /** งานทั้งโต๊ะที่ยังไม่มีคนประจำให้แบ่ง */
  unassigned: number; unassignedGot: number;
  /** จำนวนใบที่จ่ายให้ทั้งโต๊ะ */
  deskJobs: number;
  memberCount: number;
};

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function splitDeskLabor(wos: LaborWo[], members: LaborMember[]): DeskLabor {
  const map = new Map<string, PersonLabor>();
  const memberIds = new Set(members.map((m) => m.id));
  const idByName = new Map<string, string>();
  for (const m of members) for (const n of [m.name, ...(m.aliases ?? [])]) { const k = norm(n); if (k && !idByName.has(k)) idByName.set(k, m.id); }
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const person = (id: string | null | undefined, name: string | null | undefined): PersonLabor => {
    const mid = id && memberIds.has(id) ? id : idByName.get(norm(name)) ?? null;
    const key = mid ?? (id ? `id:${id}` : `n:${norm(name)}`);
    let p = map.get(key);
    if (!p) {
      p = { key, name: (mid && memberName.get(mid)) || (name ?? "").trim() || "ไม่ระบุชื่อ", member: !!mid, solo: 0, shared: 0, desk: 0, total: 0, got: 0, jobs: 0 };
      map.set(key, p);
    }
    return p;
  };
  for (const m of members) person(m.id, m.name);

  let total = 0, got = 0, unassigned = 0, unassignedGot = 0, deskJobs = 0;
  for (const w of wos) {
    const plan = Number(w.plan) || 0, rec = Number(w.got) || 0;
    total += plan; got += rec;
    const multi = (w.assignees ?? []).filter((a) => a && (a.id || norm(a.name)));
    const ppl = multi.length ? multi.map((a) => ({ id: a.id ?? null, name: a.name ?? "" }))
      : w.assignee_type !== "department" && (w.assignee_id || norm(w.assignee_name)) ? [{ id: w.assignee_id ?? null, name: w.assignee_name ?? "" }]
      : [];
    if (!ppl.length) {   // ทั้งโต๊ะ
      deskJobs++;
      if (!members.length) { unassigned += plan; unassignedGot += rec; continue; }
      for (const m of members) { const p = person(m.id, m.name); p.desk += plan / members.length; p.got += rec / members.length; p.jobs++; }
      continue;
    }
    for (const a of ppl) {
      const p = person(a.id, a.name);
      if (ppl.length > 1) p.shared += plan / ppl.length; else p.solo += plan;
      p.got += rec / ppl.length; p.jobs++;
    }
  }
  const people = [...map.values()].map((p) => ({ ...p, total: p.solo + p.shared + p.desk }))
    .sort((a, b) => b.total - a.total || Number(b.member) - Number(a.member) || a.name.localeCompare(b.name, "th"));
  return { total, got, people, unassigned, unassignedGot, deskJobs, memberCount: members.length };
}
