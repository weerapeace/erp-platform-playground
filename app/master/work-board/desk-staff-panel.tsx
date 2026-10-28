"use client";

/**
 * 👥 คนในโต๊ะ (แผนก) — แผงในตัวสำหรับป๊อปจ่ายงาน (บอร์ด + ตาราง) ไม่เด้งป๊อปซ้อน
 *   • ทุกคนเห็นรายชื่อคนในโต๊ะ
 *   • ย้ายคนออก/ไปโต๊ะอื่น · ดึงคนจากโต๊ะอื่นเข้าโต๊ะนี้ = เฉพาะคนมีสิทธิ์ฝ่ายบุคคล (app.payroll + employees.edit)
 *     → /api/mo/dept-staff (เปลี่ยนแผนกในข้อมูลพนักงานจริง + ประวัติย้ายแผนก + audit) · ย้ายแล้วมีปุ่มย้อนกลับ 10 วินาที
 *   • ช่างใหม่ที่ยังไม่มีในระบบ = ปุ่มเพิ่มช่างเดิมของบอร์ด (/api/mo/assignees · สิทธิ์จ่ายงาน)
 *   • (สิทธิ์ฝ่ายบุคคล) ＋ โต๊ะใหม่ · ✏️ เปลี่ยนชื่อโต๊ะ · 🔒 ปิดโต๊ะ 3 ขั้น (คนไปไหน → งานค้างไปไหน → สรุปแล้วยืนยัน)
 *     ปิดโต๊ะ = ซ่อนจากบอร์ด + ไม่รับงานใหม่ (status inactive) ไม่ลบ · เปิดกลับได้ที่ ⚙️ ตั้งค่าแผนก
 * เจ้าของเรื่องสั่ง 2026-10-28: "ตั้งค่าพนักงานในโต๊ะจากป๊อปจ่ายงานได้เลย · ย้ายได้เฉพาะคนมีสิทธิ์บุคคล"
 *   + "อยากให้สร้างโต๊ะใหม่ ปิดโต๊ะเก่าได้ด้วย หัวหน้าลาออก"
 */
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { SearchableSelect } from "@/components/searchable-select";

type Person = { id: string; name: string; code?: string | null; department_id?: string | null };
type Desk = { id: string; name: string; show_on_board?: boolean };
type OpenWo = { id: string; department_id: string | null; status: string };
const jsonOk = async (r: Response, fallback: string) => {
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || fallback);
  return j as Record<string, unknown>;
};
const deptApi = (method: "POST" | "PATCH", body: Record<string, unknown>) =>
  apiFetch("/api/mo/departments", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** ย้ายพนักงานไปโต๊ะ (null = ไม่ระบุโต๊ะ) — ของกลางของบอร์ด ใช้ทั้งแผงนี้และป๊อป 👥 ของบอร์ดแผน */
export async function moveDeskStaff(employeeId: string, deptId: string | null): Promise<void> {
  const r = await apiFetch("/api/mo/dept-staff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, department_id: deptId }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j?.error) throw new Error(j?.error || "ย้ายพนักงานไม่สำเร็จ");
}

export function DeskStaffPanel({ dept, desks, people, canMove, canAddNew, onChanged, wos = [], onDesksChanged }: {
  dept: Desk;
  desks: Desk[];                 // โต๊ะทั้งหมด (ปลายทางตอนย้าย — ที่ซ่อนจากบอร์ดไม่เอามาเป็นปลายทาง)
  people: Person[];              // พนักงานทุกคนที่ยังทำงาน (แผนก = โต๊ะ)
  canMove: boolean;              // มีสิทธิ์ฝ่ายบุคคล (ย้ายคน + สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะ)
  canAddNew: boolean;            // เพิ่มช่างใหม่จากบอร์ดได้ (สิทธิ์จ่ายงาน)
  onChanged: () => void | Promise<void>;   // ให้หน้าแม่โหลดรายชื่อใหม่
  wos?: OpenWo[];                // ใบจ่ายงานบนบอร์ด (ไว้นับ/ย้ายงานค้างตอนปิดโต๊ะ)
  onDesksChanged?: (focusDeskId: string | null) => void | Promise<void>;   // สร้าง/เปลี่ยนชื่อ/ปิดโต๊ะแล้ว → หน้าแม่โหลดโต๊ะใหม่ + เลือกโต๊ะนี้ (null = ไม่เลือก)
}) {
  const toast = useToast();
  // ---- จัดการโต๊ะ (สิทธิ์ฝ่ายบุคคล) ----
  const [mode, setMode] = useState<null | "new" | "rename" | "close">(null);
  const [deskName, setDeskName] = useState("");
  const [closeTo, setCloseTo] = useState<"new" | "existing" | "split">("new");
  const [closeNew, setCloseNew] = useState("");
  const [closeExisting, setCloseExisting] = useState("");
  const [closeWo, setCloseWo] = useState<"move" | "keep">("move");
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pick, setPick] = useState("");
  const [newName, setNewName] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const members = people.filter((p) => p.department_id === dept.id);
  const nameOf = (id: string | null | undefined) => (id ? desks.find((d) => d.id === id)?.name ?? "โต๊ะอื่น" : "ไม่ระบุโต๊ะ");
  const liveDesks = desks.filter((d) => d.show_on_board !== false && d.id !== dept.id);
  const openWos = wos.filter((w) => w.department_id === dept.id && w.status !== "done" && w.status !== "cancelled");

  const startMode = (m: "new" | "rename" | "close") => {
    setMode((o) => (o === m ? null : m));
    setDeskName(m === "rename" ? dept.name : "");
    setCloseTo(members.length ? "new" : "split"); setCloseNew(""); setCloseExisting(liveDesks[0]?.id ?? ""); setCloseWo("move");
  };
  const createDesk = async (name: string): Promise<string> => {
    const j = await jsonOk(await deptApi("POST", { name }), "สร้างโต๊ะไม่สำเร็จ");
    return String(j.id);
  };
  const doNew = async () => {
    const name = deskName.trim();
    if (!name) { toast.error("พิมพ์ชื่อโต๊ะก่อน"); return; }
    setProgress("กำลังสร้างโต๊ะ…");
    try { const id = await createDesk(name); toast.success(`สร้าง “${name}” แล้ว — ดึงคนเข้าโต๊ะได้เลย`); setMode(null); await onDesksChanged?.(id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "สร้างโต๊ะไม่สำเร็จ"); }
    finally { setProgress(null); }
  };
  const doRename = async () => {
    const name = deskName.trim();
    if (!name || name === dept.name) { setMode(null); return; }
    setProgress("กำลังเปลี่ยนชื่อ…");
    try { await jsonOk(await deptApi("PATCH", { id: dept.id, name }), "เปลี่ยนชื่อโต๊ะไม่สำเร็จ"); toast.success(`เปลี่ยนชื่อ “${dept.name}” → “${name}” แล้ว`); setMode(null); await onDesksChanged?.(dept.id); }
    catch (e) { toast.error(e instanceof Error ? e.message : "เปลี่ยนชื่อโต๊ะไม่สำเร็จ"); }
    finally { setProgress(null); }
  };
  // ปลายทางตอนปิดโต๊ะ (คน + งานค้าง)
  const closeDestLabel = closeTo === "new" ? `“${closeNew.trim() || "โต๊ะใหม่"}” (สร้างใหม่)` : closeTo === "existing" ? `“${nameOf(closeExisting)}”` : null;
  const woMoves = closeTo !== "split" && closeWo === "move" && openWos.length > 0;
  const closeBlocked = closeTo === "split" && members.length > 0 ? "ย้ายคนออกทีละคนให้หมดก่อน (หรือเลือกปลายทางให้ทั้งทีม)"
    : closeTo === "new" && !closeNew.trim() ? "ตั้งชื่อโต๊ะใหม่ก่อน"
    : closeTo === "existing" && !closeExisting ? "เลือกโต๊ะปลายทางก่อน" : null;
  const doClose = async () => {
    if (closeBlocked) { toast.error(closeBlocked); return; }
    const done: string[] = [];
    try {
      let dest: string | null = null;
      if (closeTo === "new") { setProgress("กำลังสร้างโต๊ะใหม่…"); dest = await createDesk(closeNew.trim()); done.push(`สร้าง “${closeNew.trim()}”`); }
      else if (closeTo === "existing") dest = closeExisting;
      if (dest && members.length) {
        for (let i = 0; i < members.length; i++) { setProgress(`กำลังย้ายคน ${i + 1}/${members.length}…`); await moveDeskStaff(members[i].id, dest); }
        done.push(`ย้ายคน ${members.length} คน`);
      }
      if (dest && woMoves) {
        const dn = closeTo === "new" ? closeNew.trim() : nameOf(dest);
        for (let i = 0; i < openWos.length; i++) {
          setProgress(`กำลังย้ายงาน ${i + 1}/${openWos.length}…`);
          await jsonOk(await apiFetch("/api/mo/work-orders", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: openWos[i].id, department_id: dest, department_name: dn }) }), "ย้ายงานไม่สำเร็จ");
        }
        done.push(`ย้ายงาน ${openWos.length} ใบ`);
      }
      setProgress("กำลังปิดโต๊ะ…");
      await jsonOk(await deptApi("PATCH", { id: dept.id, show_on_board: false, status: "inactive" }), "ปิดโต๊ะไม่สำเร็จ");
      done.push(`ปิด “${dept.name}”`);
      toast.success(`${done.join(" · ")} แล้ว — เปิดโต๊ะกลับได้ที่ ⚙️ ตั้งค่าแผนก`);
      setMode(null);
      await onChanged();
      await onDesksChanged?.(dest);
    } catch (e) {
      toast.error(`${e instanceof Error ? e.message : "ทำไม่สำเร็จ"}${done.length ? ` (ทำไปแล้ว: ${done.join(" · ")})` : ""}`);
      await onChanged(); await onDesksChanged?.(dept.id);
    } finally { setProgress(null); }
  };
  const others = people.filter((p) => p.department_id !== dept.id);

  const move = async (p: Person, to: string | null) => {
    const from = p.department_id ?? null;
    setBusy(p.id);
    try {
      await moveDeskStaff(p.id, to);
      await onChanged();
      toast.action(`ย้าย ${p.name} จาก${nameOf(from)} → ${nameOf(to)} แล้ว`, "ย้อนกลับ", () => {
        void (async () => {
          try { await moveDeskStaff(p.id, from); await onChanged(); toast.info(`ย้าย ${p.name} กลับ${nameOf(from)}แล้ว`); }
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
        {openWos.length > 0 && <span className="text-[11px] text-slate-500">· งานค้าง {openWos.length} ใบ</span>}
        {!canMove && <span className="text-[11px] text-slate-500">ย้ายคนเข้า/ออกโต๊ะได้เฉพาะคนที่มีสิทธิ์ฝ่ายบุคคล</span>}
        {canMove && (
          <span className="ml-auto flex flex-wrap gap-1">
            <button type="button" onClick={() => startMode("new")} className={`h-7 rounded-md border px-2 text-[11px] ${mode === "new" ? "border-violet-400 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>＋ โต๊ะใหม่</button>
            <button type="button" onClick={() => startMode("rename")} className={`h-7 rounded-md border px-2 text-[11px] ${mode === "rename" ? "border-violet-400 bg-violet-100 text-violet-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>✏️ เปลี่ยนชื่อ</button>
            <button type="button" onClick={() => startMode("close")} className={`h-7 rounded-md border px-2 text-[11px] ${mode === "close" ? "border-rose-400 bg-rose-50 text-rose-700" : "border-rose-200 bg-white text-rose-600 hover:bg-rose-50"}`}>🔒 ปิดโต๊ะนี้…</button>
          </span>
        )}
      </div>
      {canMove && (mode === "new" || mode === "rename") && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-200 bg-white p-2">
          <input value={deskName} onChange={(e) => setDeskName(e.target.value)} autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void (mode === "new" ? doNew() : doRename()); } }}
            placeholder={mode === "new" ? "ชื่อโต๊ะใหม่ เช่น โต๊ะ(ชื่อหัวหน้า)" : "ชื่อใหม่ของโต๊ะนี้"} className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-200 px-2 text-sm" />
          <button type="button" disabled={!!progress} onClick={() => void (mode === "new" ? doNew() : doRename())} className="h-8 rounded-md bg-violet-600 px-3 text-sm text-white disabled:opacity-40">{progress ?? (mode === "new" ? "สร้างโต๊ะ" : "บันทึกชื่อ")}</button>
          <button type="button" onClick={() => setMode(null)} className="h-8 px-2 text-sm text-slate-500">ยกเลิก</button>
          {mode === "rename" && <p className="w-full text-[10px] text-slate-400">คน/งาน/ประวัติอยู่ที่เดิมหมด · ใบงานเก่าที่บันทึกชื่อโต๊ะไว้แล้วยังเป็นชื่อเดิม</p>}
        </div>
      )}
      {canMove && mode === "close" && (
        <div className="space-y-2 rounded-md border border-rose-200 bg-white p-2.5 text-[12px] text-slate-700">
          <div>
            <div className="mb-1 font-medium">1 · คน {members.length} คนใน{dept.name} ย้ายไปที่</div>
            {members.length === 0 ? <p className="text-slate-500">โต๊ะนี้ไม่มีคนแล้ว</p> : <>
              <label className="flex flex-wrap items-center gap-1.5 py-0.5"><input type="radio" checked={closeTo === "new"} onChange={() => setCloseTo("new")} />โต๊ะใหม่ ชื่อ
                <input value={closeNew} onChange={(e) => { setCloseNew(e.target.value); setCloseTo("new"); }} placeholder="โต๊ะ(ชื่อหัวหน้าใหม่)" className="h-7 w-44 rounded border border-slate-200 px-1.5" /></label>
              <label className="flex flex-wrap items-center gap-1.5 py-0.5"><input type="radio" checked={closeTo === "existing"} onChange={() => setCloseTo("existing")} disabled={!liveDesks.length} />โต๊ะที่มีอยู่
                <select value={closeExisting} onChange={(e) => { setCloseExisting(e.target.value); setCloseTo("existing"); }} className="h-7 rounded border border-slate-200 px-1">
                  {liveDesks.map((d) => <option key={d.id} value={d.id}>{d.name} · {people.filter((p) => p.department_id === d.id).length} คน</option>)}
                </select></label>
              <label className="flex items-center gap-1.5 py-0.5"><input type="radio" checked={closeTo === "split"} onChange={() => setCloseTo("split")} />แยกย้ายเองทีละคน (ใช้ปุ่ม “ย้าย…” ในรายชื่อด้านล่าง แล้วค่อยปิด)</label>
            </>}
          </div>
          {openWos.length > 0 && (
            <div>
              <div className="mb-1 font-medium">2 · งานที่ค้างใน{dept.name} {openWos.length} ใบ</div>
              <label className="flex items-center gap-1.5 py-0.5"><input type="radio" checked={closeWo === "move" && closeTo !== "split"} disabled={closeTo === "split"} onChange={() => setCloseWo("move")} />ย้ายไปโต๊ะปลายทางด้วย (ช่างที่ระบุในใบตามคนไป)</label>
              <label className="flex items-center gap-1.5 py-0.5"><input type="radio" checked={closeWo === "keep" || closeTo === "split"} onChange={() => setCloseWo("keep")} />ให้จบที่โต๊ะเดิม — ไม่รับงานใหม่ แต่งานเก่ายังโชว์จนส่งคืนครบ</label>
            </div>
          )}
          <div className="rounded-md bg-amber-50 px-2.5 py-2 text-amber-800">
            <div className="mb-0.5 font-medium">{openWos.length > 0 ? "3" : "2"} · สรุปก่อนยืนยัน</div>
            {closeDestLabel && members.length > 0 && <div>• ย้ายคน {members.length} คนไป {closeDestLabel}</div>}
            {openWos.length > 0 && <div>• {woMoves ? `ย้ายงานค้าง ${openWos.length} ใบไป ${closeDestLabel}` : `งานค้าง ${openWos.length} ใบจบที่${dept.name}เดิม`}</div>}
            <div>• ปิด{dept.name}: ซ่อนจากบอร์ด + ไม่ขึ้นในช่องเลือกโต๊ะตอนจ่ายงานใหม่ (ไม่ลบ · ประวัติงานเดิมยังอยู่)</div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {closeBlocked && <span className="mr-auto text-[11px] text-rose-600">{closeBlocked}</span>}
            <button type="button" onClick={() => setMode(null)} disabled={!!progress} className="h-8 rounded-md border border-slate-200 px-3 text-sm">ยกเลิก</button>
            <button type="button" onClick={() => void doClose()} disabled={!!progress || !!closeBlocked} className="h-8 rounded-md bg-rose-600 px-3 text-sm text-white hover:bg-rose-700 disabled:opacity-40">{progress ?? "ยืนยันปิดโต๊ะ"}</button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        {members.length === 0 && <span className="text-[12px] text-slate-500">โต๊ะนี้ยังไม่มีคน{canMove ? " — ดึงคนจากโต๊ะอื่นด้านล่างได้เลย" : ""}</span>}
        {members.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white py-0.5 pl-2 pr-1 text-[12px] text-slate-700">
            {p.code ? <span className="text-[10px] text-slate-400">{p.code}</span> : null}{p.name}
            {canMove && (
              <select value="" disabled={busy === p.id} onChange={(e) => { const v = e.target.value; if (v) void move(p, v === "__none__" ? null : v); }}
                title={`ย้าย ${p.name} ไปโต๊ะอื่น`} className="h-6 w-[4.5rem] rounded-full border border-slate-200 bg-slate-50 px-1 text-[11px] text-slate-600">
                <option value="">{busy === p.id ? "กำลังย้าย…" : "ย้าย…"}</option>
                {liveDesks.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
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
              options={others.map((p) => ({ value: p.id, label: `${p.code ? `[${p.code}] ` : ""}${p.name}`, sub: `อยู่${nameOf(p.department_id)}`, searchText: `${p.code ?? ""} ${p.name} ${nameOf(p.department_id)}` }))} />
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
