"use client";

/**
 * 📝 ตรวจใบจดผลงาน 1 รูป (/master/work-logs/<sheet_id>)
 *   ซ้าย = รูปจริง (กดขยายได้) · ขวา = บรรทัดที่ AI อ่าน แก้ได้ทุกช่อง
 *   เหลือง = AI ไม่แน่ใจ / ข้อมูลไม่ครบ (ยังบันทึกได้) · แดง = ผิด ต้องแก้ก่อนบันทึก — กติกา lib/work-log-read.ts (เซิร์ฟเวอร์ตรวจซ้ำ)
 *   บรรทัดที่เคยบันทึกจากรูปก่อนหน้า (ใบเดียวกัน หน้าเดียวกัน) = ยืนยันแล้วจะอัปเดตทับ
 */
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePermission } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/modal";
import { ERPTime24 } from "@/components/form";
import { DateInput } from "@/components/date-input";
import { RealEmployeePicker } from "@/components/real-employee-picker";
import { MoMultiPickerModal } from "@/components/mo-picker";
import { ImageLightbox } from "@/components/image-lightbox";
import { useFileRefUrl } from "@/components/file-ref";
import { ErrorState, LoadingState } from "@/components/state-views";
import {
  employeeLabel, lineKeyExtra, validateWorkLogRow, workMinutes,
  type RowField, type RowIssue, type WorkLogEmployee, type WorkLogRow,
} from "@/lib/work-log-read";
import type { WorkLogLayout } from "@/lib/work-log-server";

type SheetHead = { id: string; mo_id: string | null; mo_no: string | null; page_no: number | null; page_total: number | null; qr_text: string | null; file_ref: string; status: string; ai_error: string | null; ai_model: string | null; confirmed_by_name: string | null; confirmed_at: string | null };
type Existing = { line_key: string; qty_done: number | null; work_date: string | null; sheet_id: string | null };
type Data = { sheet: SheetHead; layout: WorkLogLayout; rows: WorkLogRow[]; employees: WorkLogEmployee[]; existing: Existing[]; today: string };

const cellCls = (issues: RowIssue[], f: RowField) => {
  const hit = issues.filter((i) => i.field === f);
  return hit.some((i) => i.level === "error") ? "ring-2 ring-rose-400 rounded-lg" : hit.length ? "ring-2 ring-amber-300 rounded-lg" : "";
};
const UNSURE_OF: Record<string, string> = { employee_id: "name", work_date: "date", start_time: "start", end_time: "end", qty_done: "done", qty_waste: "waste" };
const numIn = "h-9 w-[72px] rounded-lg border border-slate-200 px-2 text-right text-sm tabular-nums";

export default function WorkLogReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const toast = useToast();
  const canEdit = usePermission("products.edit");
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<WorkLogRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<null | "confirm" | "reread" | "discard">(null);
  const [ask, setAsk] = useState<null | "confirm" | "discard">(null);
  const [moPick, setMoPick] = useState(false);
  const [zoom, setZoom] = useState(-1);
  const imgUrl = useFileRefUrl(data?.sheet.file_ref);

  const load = async () => {
    setErr(null);
    try {
      const j = await apiFetch(`/api/work-logs/${id}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setData(j.data as Data); setRows((j.data as Data).rows); setDirty(false);
    } catch (e) { setErr(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); }
  };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const today = data?.today ?? "";
  const moQty = data?.layout.mo?.qty ?? null;
  const issues = useMemo(() => rows.map((r) => validateWorkLogRow(r, { moQty, today })), [rows, moQty, today]);
  const included = rows.filter((r) => r.include);
  const blocking = issues.some((is, i) => rows[i].include && is.some((x) => x.level === "error"));
  const warnCount = issues.reduce((a, is, i) => a + (rows[i].include && is.some((x) => x.level === "warn") ? 1 : 0), 0);
  const existingKeys = new Set((data?.existing ?? []).map((e) => e.line_key));
  const empById = useMemo(() => new Map((data?.employees ?? []).map((e) => [e.id, e])), [data?.employees]);
  const locked = !canEdit || data?.sheet.status === "confirmed" || data?.sheet.status === "discarded";

  // แก้ช่องไหน = คนตรวจแล้ว → ล้างป้าย "AI ไม่แน่ใจ" ของช่องนั้น
  const edit = (i: number, p: Partial<WorkLogRow>) => {
    const touched = new Set(Object.keys(p).map((f) => UNSURE_OF[f]).filter(Boolean));
    setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p, unsure: r.unsure.filter((u) => !touched.has(u)) } : r)));
    setDirty(true);
  };
  const addRow = () => {
    if (!data) return;
    const used = rows.filter((r) => r.kind === "extra").map((r) => Number(r.line_key.split(":x")[1]) || 0);
    const n = Math.max(0, ...used) + 1;
    setRows((rs) => [...rs, { line_key: lineKeyExtra(data.layout.page, n), kind: "extra", step_id: null, step_code: null, step_name: "", name_written: "", employee_id: null, work_date: data.today, start_time: null, end_time: null, qty_done: null, qty_waste: null, step_done: false, note: "", unsure: [], include: true }]);
    setDirty(true);
  };

  const act = async (action: "confirm" | "reread" | "discard", extra: Record<string, unknown> = {}) => {
    setBusy(action);
    try {
      const res = await apiFetch(`/api/work-logs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, rows, ...extra }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "ไม่สำเร็จ");
      if (action === "confirm") { toast.success(`บันทึกผลงานแล้ว ${j.saved} บรรทัด`); setDirty(false); router.push("/master/work-logs"); return; }
      if (action === "discard") { toast.success("ทิ้งใบนี้แล้ว"); setDirty(false); router.push("/master/work-logs"); return; }
      toast.success(`AI อ่านใหม่แล้ว ${j.rows} บรรทัด`); await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ไม่สำเร็จ"); }
    finally { setBusy(null); setAsk(null); }
  };

  if (err) return <div className="p-6"><ErrorState title="เปิดใบจดไม่สำเร็จ" hint={err} onRetry={() => void load()} /></div>;
  if (!data) return <div className="p-6"><LoadingState label="กำลังโหลดใบจด…" /></div>;
  const { sheet, layout } = data;
  const totalDone = included.reduce((a, r) => a + (r.qty_done ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/master/work-logs" className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm leading-9 text-slate-600 hover:bg-slate-50">← ใบจดทั้งหมด</Link>
        <h1 className="text-lg font-semibold text-slate-800">ตรวจใบจด {layout.mo?.mo_no ?? "(ยังไม่ผูกใบงาน)"}{layout.mo ? <span className="font-normal text-slate-500"> · หน้า {layout.page}/{layout.total}</span> : null}</h1>
        {layout.mo && <span className="text-sm text-slate-500">{layout.mo.product_sku} {layout.mo.product_name} · สั่ง {Number(layout.mo.qty ?? 0).toLocaleString("th-TH")} ชิ้น</span>}
        {sheet.status === "confirmed" && <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">ยืนยันแล้ว {sheet.confirmed_by_name ?? ""}</span>}
        {sheet.status === "discarded" && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-500">ทิ้งแล้ว</span>}
      </div>

      {(!layout.mo || sheet.ai_error) && sheet.status !== "confirmed" && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <span>{sheet.ai_error ?? "ไม่พบ QR บนรูป"}</span>
          {canEdit && !sheet.qr_text && <button onClick={() => setMoPick(true)} className="h-8 rounded-lg border border-amber-300 bg-white px-3 text-sm">เลือกใบสั่งผลิต</button>}
          {canEdit && layout.mo && <button onClick={() => void act("reread")} disabled={busy !== null} className="h-8 rounded-lg border border-amber-300 bg-white px-3 text-sm disabled:opacity-50">{busy === "reread" ? "AI กำลังอ่าน…" : "ให้ AI อ่านใหม่"}</button>}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="lg:sticky lg:top-2 lg:self-start">
          <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-100 lg:max-h-[calc(100vh-120px)]">
            {imgUrl ? <img src={imgUrl} alt="รูปใบจด" className="w-full cursor-zoom-in" onClick={() => setZoom(0)} /> : <div className="py-24 text-center text-sm text-slate-400">{imgUrl === null ? "เปิดรูปไม่ได้ (ไม่มีสิทธิ์หรือไฟล์หาย)" : "กำลังโหลดรูป…"}</div>}
          </div>
          <div className="mt-1 text-xs text-slate-400">กดที่รูปเพื่อขยาย/ซูม · อ่านโดย {sheet.ai_model ?? "AI"}</div>
        </div>

        <div className="space-y-2">
          {rows.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">AI ไม่เจอบรรทัดที่มีลายมือ — กด “+ เพิ่มบรรทัด” เพื่อกรอกเอง หรือกดให้ AI อ่านใหม่</div>}
          {rows.map((r, i) => {
            const is = issues[i];
            const emp = r.employee_id ? empById.get(r.employee_id) : null;
            const mins = workMinutes(r.start_time, r.end_time);
            const rate = mins && r.qty_done ? Math.round((r.qty_done / mins) * 600) / 10 : null;
            return (
              <div key={r.line_key} className={`rounded-xl border bg-white p-3 ${r.include ? "border-slate-200" : "border-slate-100 opacity-50"}`}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <input type="checkbox" checked={r.include} disabled={locked} onChange={(e) => edit(i, { include: e.target.checked })} title="ติ๊กออก = ไม่บันทึกบรรทัดนี้" />
                  {r.kind === "step"
                    ? <span className="text-sm font-medium text-slate-800"><span className="font-mono text-xs text-slate-500">{r.step_code}</span> {r.step_name} <span className="text-xs text-slate-400">บรรทัด {r.line_key.split("#")[1]}</span></span>
                    : <span className={cellCls(is, "step_name")}><input value={r.step_name} disabled={locked} onChange={(e) => edit(i, { step_name: e.target.value })} placeholder="ชื่อขั้นตอน (ขั้นตอนเพิ่ม)" className="h-9 w-56 rounded-lg border border-slate-200 px-2 text-sm" /></span>}
                  {existingKeys.has(r.line_key) && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">เคยบันทึกแล้ว · ยืนยันจะอัปเดต</span>}
                  {rate !== null && <span className="ml-auto text-xs text-slate-500">{mins} นาที · {rate} ชิ้น/ชม.</span>}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-[11px] text-slate-500">ชื่อ {r.name_written ? <span className="text-slate-400">(เขียนว่า “{r.name_written}”)</span> : null}
                    <div className={`w-52 ${cellCls(is, "employee_id")}`}>
                      <RealEmployeePicker value={emp ? { id: emp.id, code: emp.code, name: employeeLabel(emp) } : null}
                        onChange={(v) => edit(i, { employee_id: v?.id ?? null })} disabled={locked} disableCreate placeholder="เลือกพนักงาน" />
                    </div>
                  </label>
                  <label className="text-[11px] text-slate-500">วันที่<div className={`w-36 ${cellCls(is, "work_date")}`}><DateInput value={r.work_date} onChange={(v) => edit(i, { work_date: v || null })} disabled={locked} /></div></label>
                  <label className="text-[11px] text-slate-500">เริ่ม<div className={cellCls(is, "start_time")}><ERPTime24 value={r.start_time ?? ""} onChange={(v) => edit(i, { start_time: v })} disabled={locked} /></div></label>
                  <label className="text-[11px] text-slate-500">เลิก<div className={cellCls(is, "end_time")}><ERPTime24 value={r.end_time ?? ""} onChange={(v) => edit(i, { end_time: v })} disabled={locked} /></div></label>
                  <label className="text-[11px] text-slate-500">ทำได้<div className={cellCls(is, "qty_done")}><input type="number" min={0} max={9999} inputMode="numeric" value={r.qty_done ?? ""} disabled={locked} onChange={(e) => edit(i, { qty_done: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })} className={numIn} /></div></label>
                  <label className="text-[11px] text-slate-500">เสีย<div className={cellCls(is, "qty_waste")}><input type="number" min={0} max={999} inputMode="numeric" value={r.qty_waste ?? ""} disabled={locked} onChange={(e) => edit(i, { qty_waste: e.target.value === "" ? null : Math.max(0, Math.round(Number(e.target.value))) })} className={numIn} /></div></label>
                  <label className="flex h-9 items-center gap-1 text-xs text-slate-600"><input type="checkbox" checked={r.step_done} disabled={locked} onChange={(e) => edit(i, { step_done: e.target.checked })} /> เสร็จขั้นนี้</label>
                  <input value={r.note} disabled={locked} onChange={(e) => edit(i, { note: e.target.value })} placeholder="หมายเหตุ" className="h-9 min-w-[120px] flex-1 rounded-lg border border-slate-200 px-2 text-sm" />
                </div>
                {r.include && is.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {is.map((x, k) => <li key={k} className={x.level === "error" ? "text-rose-600" : "text-amber-700"}>{x.level === "error" ? "✕" : "!"} {x.msg}</li>)}
                  </ul>
                )}
              </div>
            );
          })}
          {!locked && layout.mo && <button onClick={addRow} className="h-9 rounded-lg border border-dashed border-slate-300 px-3 text-sm text-slate-600 hover:bg-slate-50">+ เพิ่มบรรทัด</button>}

          {!locked && (
            <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/95 px-1 py-2 backdrop-blur">
              <span className="text-sm text-slate-600">{included.length} บรรทัด · ทำได้รวม {totalDone.toLocaleString("th-TH")} ชิ้น{warnCount ? <span className="text-amber-700"> · เตือน {warnCount}</span> : null}{blocking ? <span className="text-rose-600"> · มีช่องผิด ต้องแก้ก่อน</span> : null}</span>
              <div className="flex-1" />
              <button onClick={() => setAsk("discard")} disabled={busy !== null} className="h-9 rounded-lg border border-rose-200 px-3 text-sm text-rose-600 hover:bg-rose-50 disabled:opacity-50">ทิ้งใบนี้</button>
              {layout.mo && <button onClick={() => void act("reread")} disabled={busy !== null} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">{busy === "reread" ? "AI กำลังอ่าน…" : "ให้ AI อ่านใหม่"}</button>}
              <button onClick={() => setAsk("confirm")} disabled={busy !== null || blocking || included.length === 0 || !layout.mo}
                title={blocking ? "แก้ช่องสีแดงก่อน" : ""} className="h-9 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">ยืนยันบันทึก {included.length} บรรทัด</button>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog open={ask === "confirm"} onClose={() => setAsk(null)} onConfirm={() => void act("confirm")} loading={busy === "confirm"}
        title="บันทึกผลงาน" confirmText="บันทึก"
        message={`บันทึก ${included.length} บรรทัด ของ ${layout.mo?.mo_no ?? ""} · ทำได้รวม ${totalDone.toLocaleString("th-TH")} ชิ้น${rows.some((r) => r.include && existingKeys.has(r.line_key)) ? " · บรรทัดที่เคยบันทึกจะถูกอัปเดต" : ""}`} />
      <ConfirmDialog open={ask === "discard"} onClose={() => setAsk(null)} onConfirm={() => void act("discard")} loading={busy === "discard"} variant="danger"
        title="ทิ้งใบนี้" confirmText="ทิ้งใบนี้" message="รูปนี้จะไม่ถูกนำไปบันทึกผลงาน (ผลงานที่เคยยืนยันจากรูปอื่นไม่ถูกแตะ)" />
      <MoMultiPickerModal open={moPick} onClose={() => setMoPick(false)} scope="open" title="เลือกใบสั่งผลิตของใบจดนี้"
        onConfirm={(picked) => { setMoPick(false); const m = picked[0]; if (m) void act("reread", { mo_id: m.mo_id || m.id }); }} />
      {imgUrl && <ImageLightbox images={[{ url: imgUrl, label: layout.mo?.mo_no ?? "ใบจด" }]} index={zoom} onClose={() => setZoom(-1)} onIndex={setZoom} />}
    </div>
  );
}
