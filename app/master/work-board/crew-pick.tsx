"use client";

/**
 * 👥 CrewPick — เลือก "คนรับงาน" ได้หลายคน (ป๊อปจ่ายงานทั้ง 2 แบบ + แก้คนรับในรายละเอียดใบงาน)
 *
 * เก็บลงใบงานรูปแบบเดียวกับป๊อป 👤 ของบอร์ดแผน (ของเดิม):
 *   assignees = [{id, name}] · assignee_name = ชื่อต่อกันด้วย ", " · assignee_id = คนแรก · assignee_type = craftsman
 *   ไม่เลือกใคร = "ทั้งโต๊ะ" (assignee_type department · assignee_name = ชื่อโต๊ะ)
 * ค่าแรงรายเดือนไม่ได้คิดจากช่องนี้ — เลือกหลายคนไม่กระทบเงินเดือน (ใช้จำว่าใครรับงาน + แจ้งเตือนรายคน)
 */
import { useMemo, useState } from "react";

export type CrewPerson = { id: string; name: string; code?: string | null; nickname?: string | null };
export type CrewMember = { id: string | null; name: string };
type CrewWO = { department_id?: string | null; created_at?: string | null; assignees?: CrewMember[] | null; assignee_type?: string | null; assignee_id?: string | null };

/** ช่องผู้รับงานของใบงาน จากรายชื่อที่เลือก — ว่าง = ทั้งโต๊ะ */
export function crewFields(list: CrewMember[], deskName: string) {
  return list.length
    ? { assignee_type: "craftsman", assignee_id: list[0].id ?? null, assignee_name: list.map((x) => x.name).join(", "), assignees: list }
    : { assignee_type: "department", assignee_id: null, assignee_name: deskName, assignees: [] as CrewMember[] };
}

/** id ที่เลือก → [{id, name}] ตามลำดับที่กด (คนที่ไม่อยู่ในรายชื่อแล้วตัดทิ้ง) */
export function crewList(ids: string[], people: CrewPerson[]): CrewMember[] {
  return ids.map((id) => people.find((p) => p.id === id)).filter((p): p is CrewPerson => !!p).map((p) => ({ id: p.id, name: p.name }));
}

/** คนรับงานของใบงานเดิม — ของเก่าที่เป็นช่างเดี่ยว (ไม่มี assignees) ก็อ่านได้ */
export function crewIdsOf(w: CrewWO): string[] {
  const ids = (w.assignees ?? []).map((a) => a.id).filter((x): x is string => !!x);
  if (!ids.length && w.assignee_type === "craftsman" && w.assignee_id) ids.push(w.assignee_id);
  return ids;
}

/** ชุดคนล่าสุดที่โต๊ะนี้จ่ายไป (ใบงานล่าสุดที่ระบุคน) — กดเดียวใช้ชุดเดิม ตอนจำไม่ได้ว่าปกติให้ใคร */
export function lastCrewIds(wos: CrewWO[], deptId: string | null | undefined, people: CrewPerson[]): string[] {
  if (!deptId) return [];
  const have = new Set(people.map((p) => p.id));
  const mine = wos.filter((w) => w.department_id === deptId).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const w of mine) { const ids = crewIdsOf(w).filter((id) => have.has(id)); if (ids.length) return ids; }
  return [];
}

const chipCls = (on: boolean) => `inline-flex items-center gap-1 h-8 px-2.5 rounded-full border text-[12px] transition-colors ${
  on ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-slate-200 text-slate-700 hover:border-violet-300 hover:bg-violet-50"}`;

export function CrewPick({ people, value, onChange, required = false, recent = [], flag }: {
  people: CrewPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** งานเหมา = ต้องเลือกอย่างน้อย 1 คน (ไม่มีปุ่ม "ทั้งโต๊ะ") */
  required?: boolean;
  /** ชุดคนล่าสุดของโต๊ะนี้ (lastCrewIds) */
  recent?: string[];
  /** คำเตือนรายคน เช่น "เคยทำรุ่นนี้เสีย 2 ครั้ง" → ขึ้น ⚠️ ที่ชื่อ */
  flag?: (p: CrewPerson) => string | null;
}) {
  const [q, setQ] = useState("");
  const sel = useMemo(() => new Set(value), [value]);
  const many = people.length > 12;   // คนเยอะ (เช่นโต๊ะเหมา = ทุกคน) → มีช่องค้นหา
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = !s ? people : people.filter((p) => `${p.code ?? ""} ${p.name} ${p.nickname ?? ""}`.toLowerCase().includes(s));
    return [...people.filter((p) => sel.has(p.id) && !hit.includes(p)), ...hit];   // คนที่เลือกแล้วโชว์เสมอ
  }, [people, q, sel]);
  const toggle = (id: string) => onChange(sel.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const picked = value.filter((id) => people.some((p) => p.id === id));   // นับเฉพาะคนที่ยังอยู่ในรายชื่อ (ย้ายโต๊ะไปแล้วไม่นับ)
  const recentOk = recent.filter((id) => people.some((p) => p.id === id));
  const sameAsRecent = recentOk.length === picked.length && recentOk.every((id) => sel.has(id));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? "";

  return (
    <div className="space-y-1.5">
      {many && (
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 พิมพ์ชื่อ/รหัสค้นหา"
          className="w-full h-8 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      )}
      <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
        {!required && (
          <button type="button" onClick={() => onChange([])} aria-pressed={picked.length === 0} className={chipCls(picked.length === 0)}>🏢 ทั้งโต๊ะ (ไม่ระบุคน)</button>
        )}
        {shown.map((p) => {
          const on = sel.has(p.id); const f = flag?.(p) ?? null;
          return (
            <button key={p.id} type="button" onClick={() => toggle(p.id)} aria-pressed={on} title={f ?? undefined} className={chipCls(on)}>
              {on && <span>✓</span>}{f && <span>⚠️</span>}
              {p.code && <span className="opacity-60">[{p.code}]</span>}
              <span className="truncate max-w-[14rem]">{p.name}</span>
            </button>
          );
        })}
        {shown.length === 0 && <span className="self-center text-[11px] text-slate-400">{people.length ? "ไม่พบชื่อที่ค้นหา" : "โต๊ะนี้ยังไม่มีคน — จ่ายเป็นทั้งโต๊ะได้"}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="text-slate-500">
          {picked.length ? <>เลือก <b className="text-violet-700">{picked.length}</b> คน — ชื่อทุกคนขึ้นบนการ์ดงาน</>
            : required ? <span className="text-rose-500">งานเหมา — ต้องเลือกอย่างน้อย 1 คน</span> : "ไม่เลือกใคร = ทั้งโต๊ะรับงาน · กดชื่อได้หลายคน"}
        </span>
        {recentOk.length > 0 && !sameAsRecent && (
          <button type="button" onClick={() => onChange(recentOk)} className="text-violet-700 hover:underline truncate max-w-full">
            ↺ ชุดล่าสุดของโต๊ะนี้: {recentOk.map(nameOf).join(", ")}
          </button>
        )}
      </div>
    </div>
  );
}
