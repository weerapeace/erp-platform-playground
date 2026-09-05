"use client";

/**
 * 📋 แท็บ "ขั้นตอนงาน" ในป๊อปเช็กลิสต์ของบอร์ดจ่ายงาน
 *   • รายการขั้นตอนผลิตของสินค้า (เก็บที่สูตร BOM — แก้ครั้งเดียวใช้ทุกใบ)
 *   • ผูกกับงานเหมาได้: เลือกงานจากทะเบียน piecework_jobs → โชว์ ฿/ชิ้น + จำนวนรวม + สถานะจากแท็บ 🧵 ของใบนี้
 *   • "ดึงจากงานเหมา" = สร้างขั้นตอนให้จากงานเหมาที่อยู่ในสูตร (ที่ยังไม่ถูกผูก)
 *   • ทุกการแก้บันทึกทันที (PUT ทั้งชุด) — คนหน้างานไม่ต้องจำกดบันทึก
 * ของกลาง: /api/bom/work-steps · ทะเบียนงานเหมา /api/admin/piecework-jobs
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { WorkStep } from "@/app/api/bom/work-steps/route";
import type { MoPieceRow } from "@/app/api/mo/piecework/route";

type Job = { id: string; name: string; default_rate: number | null; is_detail?: boolean };
type Draft = { step_name: string; instruction: string; piecework_job_id: string; station: string };

const money = (n: number) => "฿" + (Math.round(n * 100) / 100).toLocaleString("th-TH");

export function WorkStepsTab({ moId, bomCode, pieceRows, canEdit, steps, onSteps }: {
  moId: string;
  bomCode: string | null;
  pieceRows: MoPieceRow[];
  canEdit: boolean;
  steps: WorkStep[] | null;              // null = ยังไม่โหลด
  onSteps: (s: WorkStep[], bomCode: string | null) => void;
}) {
  const toast = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);
  const [editIdx, setEditIdx] = useState<number | null>(null);   // -1 = แถวใหม่
  const [draft, setDraft] = useState<Draft>({ step_name: "", instruction: "", piecework_job_id: "", station: "" });

  useEffect(() => {
    if (steps !== null) return;
    void (async () => {
      try { const j = await apiFetch(`/api/bom/work-steps?mo_id=${encodeURIComponent(moId)}`).then((r) => r.json()); onSteps((j.data ?? []) as WorkStep[], (j.bom_code as string) ?? null); }
      catch { onSteps([], null); }
    })();
  }, [moId, steps, onSteps]);
  useEffect(() => {
    void (async () => {
      try { const j = await apiFetch("/api/admin/piecework-jobs").then((r) => r.json()); setJobs((j.data ?? []) as Job[]); } catch { /* ไม่มีทะเบียนก็พิมพ์ชื่อเองได้ */ }
    })();
  }, []);

  const list = steps ?? [];
  const pieceOf = (jobId: string | null) => (jobId ? pieceRows.find((p) => p.job_id === jobId) ?? null : null);

  const save = async (next: { step_name: string; instruction: string | null; piecework_job_id: string | null; station: string | null }[], okMsg: string) => {
    if (!bomCode) { toast.error("สินค้านี้ยังไม่มีสูตร BOM — สร้างสูตรก่อนจึงจะบันทึกขั้นตอนได้"); return; }
    setBusy(true);
    try {
      const res = await apiFetch("/api/bom/work-steps", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bom_code: bomCode, steps: next }) });
      const j = await res.json(); if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      onSteps((j.data ?? []) as WorkStep[], bomCode);
      toast.success(okMsg);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const plain = (s: WorkStep) => ({ step_name: s.step_name, instruction: s.instruction, piecework_job_id: s.piecework_job_id, station: s.station });

  const startEdit = (i: number) => {
    if (i === -1) setDraft({ step_name: "", instruction: "", piecework_job_id: "", station: "" });
    else { const s = list[i]; setDraft({ step_name: s.step_name, instruction: s.instruction ?? "", piecework_job_id: s.piecework_job_id ?? "", station: s.station ?? "" }); }
    setEditIdx(i);
  };
  const commit = async () => {
    if (!draft.step_name.trim()) { toast.error("ใส่ชื่อขั้นตอนก่อน"); return; }
    const row = { step_name: draft.step_name.trim(), instruction: draft.instruction.trim() || null, piecework_job_id: draft.piecework_job_id || null, station: draft.station.trim() || null };
    const next = list.map(plain);
    if (editIdx === -1) next.push(row); else if (editIdx != null) next[editIdx] = row;
    await save(next, editIdx === -1 ? "เพิ่มขั้นตอนแล้ว" : "แก้ขั้นตอนแล้ว");
    setEditIdx(null);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= list.length) return;
    const next = list.map(plain); [next[i], next[j]] = [next[j], next[i]];
    void save(next, "จัดลำดับแล้ว");
  };
  const remove = (i: number) => { const next = list.map(plain); next.splice(i, 1); void save(next, "ลบขั้นตอนแล้ว"); };
  const pullFromPiecework = () => {
    const linked = new Set(list.map((s) => s.piecework_job_id).filter(Boolean));
    const add = pieceRows.filter((p) => p.job_id && !linked.has(p.job_id));
    if (add.length === 0) { toast.info("งานเหมาทุกตัวถูกผูกเป็นขั้นตอนแล้ว"); return; }
    void save([...list.map(plain), ...add.map((p) => ({ step_name: p.job_name, instruction: p.note ?? null, piecework_job_id: p.job_id, station: null }))], `ดึงงานเหมา ${add.length} รายการมาเป็นขั้นตอนแล้ว`);
  };
  // เลือกงานเหมาในฟอร์ม → เติมชื่อขั้นตอนให้ถ้ายังว่าง
  const pickJob = (id: string) => {
    const j = jobs.find((x) => x.id === id);
    setDraft((d) => ({ ...d, piecework_job_id: id, step_name: d.step_name.trim() ? d.step_name : (j?.name ?? "") }));
  };

  const editor = (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_8rem] gap-2">
        <label className="block"><span className="text-[11px] text-slate-500">ชื่อขั้นตอน *</span>
          <input autoFocus value={draft.step_name} onChange={(e) => setDraft({ ...draft, step_name: e.target.value })} placeholder="เช่น ตัดผ้า / เย็บตัว / ติดซิป / QC"
            className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" /></label>
        <label className="block"><span className="text-[11px] text-slate-500">🧵 ผูกงานเหมา (ถ้ามี)</span>
          <select value={draft.piecework_job_id} onChange={(e) => pickJob(e.target.value)} className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg bg-white">
            <option value="">— ไม่ผูก —</option>
            {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}{j.default_rate ? ` · ${money(j.default_rate)}/ชิ้น` : ""}</option>)}
          </select></label>
        <label className="block"><span className="text-[11px] text-slate-500">โต๊ะ/แผนก</span>
          <input value={draft.station} onChange={(e) => setDraft({ ...draft, station: e.target.value })} placeholder="เช่น โต๊ะเย็บ 2"
            className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg" /></label>
      </div>
      <label className="block"><span className="text-[11px] text-slate-500">วิธีทำ / ข้อควรระวัง (พิมพ์ลงใบขั้นตอน)</span>
        <textarea value={draft.instruction} onChange={(e) => setDraft({ ...draft, instruction: e.target.value })} rows={2}
          className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg" /></label>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditIdx(null)} className="h-8 px-3 text-sm border border-slate-200 rounded-lg bg-white">ยกเลิก</button>
        <button type="button" onClick={() => void commit()} disabled={busy} className="h-8 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{busy ? "กำลังบันทึก…" : editIdx === -1 ? "เพิ่มขั้นตอน" : "บันทึก"}</button>
      </div>
    </div>
  );

  if (steps === null) return <div className="text-center py-8 text-slate-400 text-sm">กำลังโหลดขั้นตอนงาน…</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] text-slate-500">
          ขั้นตอนเก็บที่ <b>สูตร BOM</b> ของสินค้า{bomCode ? <code className="ml-1 text-[10px] text-slate-400">{bomCode}</code> : <span className="text-amber-600 ml-1">— ยังไม่มีสูตร</span>} · แก้แล้วมีผลทุกใบที่ใช้สูตรนี้ · ขั้นตอนที่ผูกงานเหมาจะโชว์ราคา/จำนวนจากแท็บ 🧵
        </p>
        {canEdit && bomCode && (
          <div className="flex gap-1">
            {pieceRows.length > 0 && <button type="button" onClick={pullFromPiecework} disabled={busy} className="h-8 px-3 text-[12px] border border-indigo-200 text-indigo-700 rounded-lg hover:bg-indigo-50">🧵 ดึงจากงานเหมา</button>}
            <button type="button" onClick={() => startEdit(-1)} disabled={busy || editIdx !== null} className="h-8 px-3 text-[12px] bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">＋ เพิ่มขั้นตอน</button>
          </div>
        )}
      </div>

      {list.length === 0 && editIdx === null && (
        <div className="text-center py-8 border border-dashed border-slate-200 rounded-lg">
          <p className="text-slate-400 text-sm">ยังไม่มีขั้นตอนงานของสินค้านี้</p>
          <p className="text-[11px] text-slate-400 mt-1">กด ＋ เพิ่มขั้นตอน หรือ 🧵 ดึงจากงานเหมา · หรือกด "พิมพ์ขั้นตอนงาน" ด้านล่างเพื่อพิมพ์แม่แบบเปล่าให้ช่างเขียนเอง</p>
        </div>
      )}

      <ol className="space-y-1">
        {list.map((s, i) => {
          const p = pieceOf(s.piecework_job_id);
          if (editIdx === i) return <li key={s.id}>{editor}</li>;
          return (
            <li key={s.id} className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
              <span className="w-6 h-6 shrink-0 rounded-full bg-slate-800 text-white text-[11px] flex items-center justify-center font-semibold mt-0.5">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-slate-800">{s.step_name}</span>
                  {s.station && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">📍 {s.station}</span>}
                  {s.piecework_job_id && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${p?.status === "done" ? "bg-emerald-50 text-emerald-700" : p?.selected_id ? "bg-indigo-50 text-indigo-700" : "bg-amber-50 text-amber-700"}`}
                      title={p ? `จำนวน ${p.total_qty} × ${money(p.rate)} = ${money(p.total_qty * p.rate)}` : "งานเหมานี้ไม่อยู่ในสูตร/ใบนี้"}>
                      🧵 {s.job_name ?? "งานเหมา"}{p ? ` · ${money(p.rate)}/ชิ้น · ${p.total_qty.toLocaleString()} ชิ้น = ${money(p.total_qty * p.rate)}` : s.job_rate ? ` · ${money(s.job_rate)}/ชิ้น` : ""}
                      {p?.status === "done" ? " · เสร็จแล้ว" : p?.selected_id ? " · จ่ายแล้ว" : p ? " · ยังไม่จ่าย" : ""}
                    </span>
                  )}
                </div>
                {s.instruction && <div className="text-[12px] text-slate-500 whitespace-pre-line mt-0.5">{s.instruction}</div>}
              </div>
              {canEdit && bomCode && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => move(i, -1)} disabled={busy || i === 0} className="h-7 w-7 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="เลื่อนขึ้น">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={busy || i === list.length - 1} className="h-7 w-7 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="เลื่อนลง">↓</button>
                  <button type="button" onClick={() => startEdit(i)} disabled={busy || editIdx !== null} className="h-7 w-7 text-slate-400 hover:text-blue-600" title="แก้ไข">✎</button>
                  <button type="button" onClick={() => remove(i)} disabled={busy} className="h-7 w-7 text-slate-300 hover:text-rose-600" title="ลบขั้นตอน">✕</button>
                </div>
              )}
            </li>
          );
        })}
        {editIdx === -1 && <li>{editor}</li>}
      </ol>
    </div>
  );
}
