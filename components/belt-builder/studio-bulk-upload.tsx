"use client";

/**
 * ป๊อป "อัปโหลดหลายรูป" — เลือก/ลาก PNG หลายไฟล์ → จับคู่ชื่อไฟล์กับ code ของชิ้นส่วน (STRAP-DBR-35.png → strap-dbr-35)
 *   พรีวิวคู่ (รูปใหม่ ↔ ชิ้นที่จะใส่) ก่อนยืนยัน · แก้คู่เองได้ด้วย dropdown · ไฟล์ที่จับคู่ไม่ได้ = ข้าม
 *   ยืนยัน → อัปโหลดทีละไฟล์ (upload-png) แล้ว PATCH image_key รายชิ้น (server เขียน audit) → รายงานสำเร็จ/พลาด
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { r2ImageUrl } from "@/lib/r2-image";
import { PART_TYPE_LABEL } from "@/lib/belt-builder";
import { invalidateRefParts } from "./anchor-editor";
import { patchPart, type BeltPart } from "./studio-data";
import { checkPngFile, matchFileToPart, uploadBeltPartPng } from "./upload-png";

type Row = { file: File; url: string; partId: string | null; error?: string; warnings: string[]; state: "idle" | "uploading" | "done" | "failed"; message?: string };

export function BulkUploadModal({ open, onClose, parts, shopId, onDone }: {
  open: boolean;
  onClose: () => void;
  parts: BeltPart[];
  shopId: string;
  onDone: (updated: BeltPart[]) => void;
}) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  useEffect(() => { if (!open) { rows.forEach((r) => URL.revokeObjectURL(r.url)); setRows([]); setRunning(false); } // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const addFiles = async (files: File[]) => {
    const next: Row[] = [];
    for (const f of files) {
      const chk = await checkPngFile(f);
      const m = chk.ok ? matchFileToPart(f.name, parts) : null;
      next.push({ file: f, url: URL.createObjectURL(f), partId: m?.id ?? null, error: chk.ok ? undefined : chk.error, warnings: chk.warnings, state: "idle" });
    }
    setRows((r) => [...r, ...next]);
  };

  const matched = rows.filter((r) => r.partId && !r.error);
  const dupTargets = useMemo(() => { const c = new Map<string, number>(); for (const r of matched) c.set(r.partId!, (c.get(r.partId!) ?? 0) + 1); return new Set([...c.entries()].filter(([, n]) => n > 1).map(([id]) => id)); }, [matched]);

  const run = async () => {
    if (!matched.length || running) return;
    setRunning(true);
    const updated: BeltPart[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.partId || r.error) continue;
      setRows((cur) => cur.map((x, j) => (j === i ? { ...x, state: "uploading" } : x)));
      try {
        const up = await uploadBeltPartPng(r.file);
        const saved = await patchPart(r.partId, { image_key: up.r2_key, image_url: null });
        updated.push(saved);
        setRows((cur) => cur.map((x, j) => (j === i ? { ...x, state: "done", message: "ใส่รูปแล้ว" } : x)));
      } catch (e) {
        setRows((cur) => cur.map((x, j) => (j === i ? { ...x, state: "failed", message: e instanceof Error ? e.message : "พลาด" } : x)));
      }
    }
    invalidateRefParts(shopId);
    setRunning(false);
    const failed = rows.filter((r) => r.partId && !r.error).length - updated.length;
    if (updated.length) toast.success(`ใส่รูปให้ ${updated.length} ชิ้นแล้ว${failed ? ` · พลาด ${failed}` : ""}`);
    else toast.error("ไม่มีรูปไหนอัปโหลดสำเร็จ");
    onDone(updated);
  };

  const finished = rows.length > 0 && rows.every((r) => r.state === "done" || r.state === "failed" || !r.partId || r.error);
  const sel = "rounded border border-slate-300 bg-white px-1.5 py-1 text-xs";

  return (
    <ERPModal open={open} onClose={onClose} title="อัปโหลดหลายรูปทีเดียว" size="xl" closeOnBackdrop={!running} hasUnsavedChanges={rows.length > 0 && !finished}
      description="ตั้งชื่อไฟล์ให้ตรงกับรหัสชิ้น (เช่น strap-black-35.png) ระบบจะจับคู่ให้เอง · จับคู่ไม่ตรงก็เลือกเองได้"
      footer={
        <div className="flex w-full items-center gap-2">
          <span className="text-xs text-slate-500">{rows.length} ไฟล์ · จับคู่ได้ {matched.length}{dupTargets.size ? ` · ⚠ มีชิ้นที่ถูกเลือกซ้ำ ${dupTargets.size}` : ""}</span>
          <button type="button" onClick={onClose} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50">{finished ? "ปิด" : "ยกเลิก"}</button>
          {!finished && <button type="button" onClick={run} disabled={!matched.length || running || dupTargets.size > 0} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{running ? "กำลังอัปโหลด…" : `ยืนยันอัปโหลด ${matched.length} รูป`}</button>}
        </div>
      }>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(Array.from(e.dataTransfer.files ?? [])); }}
        className={`mb-3 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-5 text-sm ${dragOver ? "border-emerald-500 bg-emerald-50" : "border-slate-300 bg-slate-50"}`}>
        <div className="text-slate-600">ลากไฟล์ PNG หลายไฟล์มาวางที่นี่</div>
        <label className="cursor-pointer rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-100">
          หรือเลือกไฟล์จากเครื่อง
          <input type="file" accept="image/png" multiple className="hidden" disabled={running} onChange={(e) => { void addFiles(Array.from(e.target.files ?? [])); e.currentTarget.value = ""; }} />
        </label>
        <div className="text-[11px] text-slate-400">รหัสที่มีในร้าน: {parts.filter((p) => p.code).slice(0, 6).map((p) => p.code).join(", ")}{parts.length > 6 ? " …" : ""}</div>
      </div>

      {rows.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {rows.map((r, i) => {
            const target = r.partId ? byId.get(r.partId) : null;
            const curImg = target ? target.image_url || r2ImageUrl(target.image_key, 200) : null;
            return (
              <div key={`${r.file.name}-${i}`} className={`flex items-center gap-3 px-3 py-2 ${r.error ? "bg-red-50/50" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={r.url} alt="" className="h-12 w-20 shrink-0 rounded bg-[linear-gradient(45deg,#f1f5f9_25%,transparent_25%,transparent_75%,#f1f5f9_75%)] [background-size:12px_12px] object-contain" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800">{r.file.name} <span className="text-xs font-normal text-slate-400">{(r.file.size / 1024).toFixed(0)} KB</span></div>
                  {r.error ? <div className="text-xs text-red-600">{r.error}</div> : r.warnings.map((w) => <div key={w} className="text-[11px] text-amber-700">⚠ {w}</div>)}
                  {r.message && <div className={`text-xs ${r.state === "done" ? "text-emerald-700" : "text-red-600"}`}>{r.state === "done" ? "✓ " : "✕ "}{r.message}</div>}
                </div>
                <span className="text-slate-300">→</span>
                <div className="flex w-[260px] shrink-0 items-center gap-2">
                  {curImg ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={curImg} alt="" className="h-10 w-14 rounded object-contain opacity-70" title="รูปเดิม (จะถูกแทน)" /> : <span className="flex h-10 w-14 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-400">ไม่มีรูป</span>}
                  {!r.error && r.state === "idle" ? (
                    <select className={`${sel} min-w-0 flex-1 ${!r.partId ? "border-amber-400" : dupTargets.has(r.partId) ? "border-red-400" : ""}`} value={r.partId ?? ""} disabled={running}
                      onChange={(e) => setRows((cur) => cur.map((x, j) => (j === i ? { ...x, partId: e.target.value || null } : x)))}>
                      <option value="">— ยังไม่จับคู่ (ข้าม) —</option>
                      {parts.map((p) => <option key={p.id} value={p.id}>{PART_TYPE_LABEL[p.part_type]?.icon} {p.code ?? p.name_th}{p.image_key ? " (มีรูปแล้ว)" : ""}</option>)}
                    </select>
                  ) : (
                    <span className="truncate text-xs text-slate-600">{target ? `${target.code ?? target.name_th}` : "—"}</span>
                  )}
                </div>
                <button type="button" disabled={running} onClick={() => setRows((cur) => cur.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-600" title="เอาออก">✕</button>
              </div>
            );
          })}
        </div>
      )}
    </ERPModal>
  );
}
