"use client";

/**
 * 👥 คนในโต๊ะ (แผนก) — แผงในตัวสำหรับป๊อปจ่ายงาน (บอร์ด + ตาราง) ไม่เด้งป๊อปซ้อน
 *   • ทุกคนเห็นรายชื่อคนในโต๊ะ
 *   • ย้ายคนออก/ไปโต๊ะอื่น · ดึงคนจากโต๊ะอื่นเข้าโต๊ะนี้ = เฉพาะคนมีสิทธิ์ฝ่ายบุคคล (app.payroll + employees.edit)
 *     → /api/mo/dept-staff (เปลี่ยนแผนกในข้อมูลพนักงานจริง + ประวัติย้ายแผนก + audit) · ย้ายแล้วมีปุ่มย้อนกลับ 10 วินาที
 *   • ช่างใหม่ที่ยังไม่มีในระบบ = ปุ่มเพิ่มช่างเดิมของบอร์ด (/api/mo/assignees · สิทธิ์จ่ายงาน)
 * เจ้าของเรื่องสั่ง 2026-10-28: "ตั้งค่าพนักงานในโต๊ะจากป๊อปจ่ายงานได้เลย · ย้ายได้เฉพาะคนมีสิทธิ์บุคคล"
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { SearchableSelect } from "@/components/searchable-select";

type Person = { id: string; name: string; code?: string | null; department_id?: string | null };
type Desk = { id: string; name: string };

/** ย้ายพนักงานไปโต๊ะ (null = ไม่ระบุโต๊ะ) — ของกลางของบอร์ด ใช้ทั้งแผงนี้และป๊อป 👥 ของบอร์ดแผน */
export async function moveDeskStaff(employeeId: string, deptId: string | null): Promise<void> {
  const r = await apiFetch("/api/mo/dept-staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, department_id: deptId }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || "ย้ายพนักงานไม่สำเร็จ");
}

export function DeskStaffPanel({ dept, desks, people, canMove, canAddNew, onChanged }: {
  dept: Desk;
  desks: Desk[];                 // โต๊ะทั้งหมด (ปลายทางตอนย้าย)
  people: Person[];              // พนักงานทุกคนที่ยังทำงาน (แผนก = โต๊ะ)
  canMove: boolean;              // มีสิทธิ์ฝ่ายบุคคล
  canAddNew: boolean;            // เพิ่มช่างใหม่จากบอร์ดได้ (สิทธิ์จ่ายงาน)
  onChanged: () => void | Promise<void>;   // ให้หน้าแม่โหลดรายชื่อใหม่
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const members = people.filter((p) => p.department_id === dept.id);
  const deskName = (id: string | null | undefined) => (id ? desks.find((d) => d.id === id)?.name ?? "โต๊ะอื่น" : "ไม่ระบุโต๊ะ");
  const others = people.filter((p) => p.department_id !== dept.id);

  const move = async (p: Person, to: string | null) => {
    const from = p.department_id ?? null;
    setBusy(p.id);
    try {
      await moveDeskStaff(p.id, to);
      await onChanged();
      toast.action(`ย้าย ${p.name} จาก${deskName(from)} → ${deskName(to)} แล้ว`, "ย้อนกลับ", () => {
        void (async () => {
          try { await moveDeskStaff(p.id, from); await onChanged(); toast.info(`ย้าย ${p.name} กลับ${deskName(from)}แล้ว`); }
          catch (e) { toast.error(e instanceof Error ? e.message : "ย้อนกลับไม่สำเร็จ"); }
        })();
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "ย้ายพนักงานไม่สำเร็จ"); }
    finally { setBusy(null); }
  };
  const addNew = async () => {
    const name = newName.trim();
    if (!name) { toast.error("พิมพ์ชื่อช่างก่อน"); return; }
    setBusy("new");
    try {
      const r = await apiFetch("/api/mo/assignees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, department_id: dept.id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j?.error) throw new Error(j?.error || "เพิ่มช่างไม่สำเร็จ");
      await onChanged();
      toast.success(`เพิ่ม ${name} เข้า${dept.name}แล้ว`);
      setNewName(""); setNewOpen(false);
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มช่างไม่สำเร็จ"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <b className="text-slate-700">👥 คนใน{dept.name} ({members.length})</b>
        {!canMove && <span className="text-[11px] text-slate-500">ย้ายคนเข้า/ออกโต๊ะได้เฉพาะคนที่มีสิทธิ์ฝ่ายบุคคล</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {members.length === 0 && <span className="text-[12px] text-slate-500">โต๊ะนี้ยังไม่มีคน{canMove ? " — ดึงคนจากโต๊ะอื่นด้านล่างได้เลย" : ""}</span>}
        {members.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-[12px] text-slate-700">
            {p.code ? <span className="text-[10px] text-slate-400">{p.code}</span> : null}{p.name}
            {canMove && (
              <select value="" disabled={busy === p.id} onChange={(e) => { const v = e.target.value; if (v) void move(p, v === "__none__" ? null : v); }}
                title={`ย้าย ${p.name} ไปโต๊ะอื่น`} className="h-6 w-[4.5rem] rounded-full border border-slate-200 bg-slate-50 px-1 text-[11px] text-slate-600">
                <option value="">{busy === p.id ? "กำลังย้าย…" : "ย้าย…"}</option>
                {desks.filter((d) => d.id !== dept.id).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                <option value="__none__">— เอาออก (ไม่ระบุโต๊ะ) —</option>
              </select>
            )}
          </span>
        ))}
      </div>
      {canMove && others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="min-w-[14rem] flex-1">
            <SearchableSelect value={pick} onChange={setPick} placeholder="＋ ดึงคนจากโต๊ะอื่น — พิมพ์ชื่อ/รหัส"
              options={others.map((p) => ({ value: p.id, label: `${p.code ? `[${p.code}] ` : ""}${p.name}`, sub: `อยู่${deskName(p.department_id)}`, searchText: `${p.code ?? ""} ${p.name} ${deskName(p.department_id)}` }))} />
          </div>
          <button type="button" disabled={!pick || busy !== null}
            onClick={() => { const p = others.find((x) => x.id === pick); if (p) { setPick(""); void move(p, dept.id); } }}
            className="h-9 rounded-lg bg-violet-600 px-3 text-sm text-white hover:bg-violet-700 disabled:opacity-40">ย้ายเข้าโต๊ะนี้</button>
        </div>
      )}
      {canAddNew && (newOpen ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addNew(); } }}
            placeholder="ชื่อช่างใหม่ (ยังไม่มีในระบบ)" autoFocus className="h-9 min-w-[12rem] flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
          <button type="button" onClick={() => void addNew()} disabled={busy === "new"} className="h-9 rounded-lg border border-violet-300 bg-white px-3 text-sm text-violet-700 disabled:opacity-40">{busy === "new" ? "กำลังเพิ่ม…" : "เพิ่มเข้าโต๊ะนี้"}</button>
          <button type="button" onClick={() => { setNewOpen(false); setNewName(""); }} className="h-9 px-2 text-sm text-slate-500">ยกเลิก</button>
        </div>
      ) : (
        <button type="button" onClick={() => setNewOpen(true)} className="text-[12px] text-violet-700 hover:underline">＋ ช่างใหม่ที่ยังไม่มีในระบบ</button>
      ))}
      {canMove && <p className="text-[10px] text-slate-400">ย้ายแล้ว = เปลี่ยนแผนกในข้อมูลพนักงาน (ผังพนักงาน/เงินเดือนเห็นตาม) · มีประวัติว่าใครย้าย · กดย้อนกลับได้ 10 วินาที</p>}
    </div>
  );
}
