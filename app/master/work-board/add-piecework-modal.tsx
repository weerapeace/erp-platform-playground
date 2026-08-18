"use client";

/**
 * Popup: เพิ่มงานเหมาเข้า BOM ของสินค้า (จากบอร์ดจ่ายงาน — แท็บงานเหมา)
 * เลือกงานจากทะเบียน หรือเพิ่มงานใหม่ → ผูกเข้า BOM ที่ใช้งานของสินค้านั้น (ผ่าน /api/piecework/from-po)
 * แก้ชื่องานในทะเบียนได้จากตรงนี้เลย (เผลอพิมพ์ผิดไม่ต้องไปหน้าแอดมิน) — PATCH /api/admin/piecework-jobs
 */
import { useEffect, useState } from "react";
import { ERPModal } from "@/components/modal";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { apiSave } from "@/lib/save-toast";
import type { PieceworkJob } from "@/app/api/admin/piecework-jobs/route";

export function AddPieceworkModal({ open, productSku, productName, onClose, onAdded }: {
  open: boolean; productSku: string | null; productName?: string | null; onClose: () => void; onAdded: () => void;
}) {
  const toast = useToast();
  const [jobs, setJobs] = useState<PieceworkJob[]>([]);
  const [sel, setSel] = useState("");          // "" | jobId | "__new__"
  const [name, setName] = useState(""); const [rate, setRate] = useState(0);
  const [qtyPer, setQtyPer] = useState(1); const [isDetail, setIsDetail] = useState(false); const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  // แก้ชื่องานในทะเบียน (พิมพ์ผิดแก้ได้เลย ไม่ต้องออกไปหน้าแอดมิน)
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  // ใส่งานนี้ให้ทุกสินค้าใต้ Parent SKU เดียวกัน (รุ่นเดียวกันงานเหมามักเหมือนกัน)
  const [allSiblings, setAllSiblings] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSel(""); setName(""); setRate(0); setQtyPer(1); setIsDetail(false); setNote(""); setAllSiblings(false);
    setRenaming(false); setRenameVal("");
    void loadJobs();
  }, [open]);

  const loadJobs = async () => {
    try { const r = await apiFetch("/api/admin/piecework-jobs"); const j = await r.json(); setJobs((j.data ?? []) as PieceworkJob[]); } catch { /* ignore */ }
  };

  // บันทึกชื่อใหม่ของงานในทะเบียน — มีผลกับทุกสินค้าที่ใช้งานนี้
  const saveRename = async () => {
    const v = renameVal.trim();
    const job = jobs.find((x) => x.id === sel);
    if (!job || !v || v === job.name) { setRenaming(false); return; }
    const r = await apiSave(toast, "/api/admin/piecework-jobs", { method: "PATCH", body: { id: job.id, name: v } },
      { ok: `เปลี่ยนชื่องานเป็น “${v}” แล้ว`, fail: "เปลี่ยนชื่องานไม่สำเร็จ" });
    if (r.ok) { setName(v); setRenaming(false); await loadJobs(); }
  };

  const pick = (v: string) => {
    setSel(v);
    if (v === "__new__" || v === "") { setName(""); setRate(0); setIsDetail(false); return; }
    const j = jobs.find((x) => x.id === v);
    if (j) { setName(j.name); setRate(j.default_rate); setIsDetail(j.is_detail); }
  };

  const submit = async () => {
    if (!name.trim()) { toast.error("กรุณาเลือกหรือกรอกชื่องาน"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/api/piecework/from-po", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_name: name.trim(), rate, is_detail: isDetail, note: note.trim() || null, qty_per: qtyPer, product_sku: productSku, all_siblings: allSiblings }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      if (j.warn) toast.error(j.warn);
      else toast.success(`เพิ่มงานเหมา “${name.trim()}” เข้า BOM แล้ว${allSiblings && j.attached_count > 1 ? ` (${j.attached_count} รุ่น)` : ""}`);
      onAdded(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "เพิ่มไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  const isNew = sel === "__new__";
  return (
    <ERPModal open={open} onClose={onClose} size="sm" title="🧵 เพิ่มงานเหมาเข้า BOM"
      footer={<>
        <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 mr-auto">ยกเลิก</button>
        <button onClick={() => void submit()} disabled={saving} className="h-9 px-4 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังบันทึก…" : "เพิ่มเข้า BOM"}</button>
      </>}>
      <div className="space-y-3">
        {productName && <p className="text-[12px] text-slate-500">สินค้า: <b className="text-slate-700">{productName}</b> — งานนี้จะถูกเพิ่มเข้า BOM ที่ใช้งานของสินค้า</p>}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">เลือกงาน</label>
          <div className="flex items-center gap-1.5">
            <select value={sel} onChange={(e) => pick(e.target.value)} className="flex-1 h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">— เลือกงานจากทะเบียน —</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
              <option value="__new__">＋ เพิ่มงานใหม่…</option>
            </select>
            {sel && sel !== "__new__" && !renaming && (
              <button type="button" onClick={() => { setRenameVal(jobs.find((x) => x.id === sel)?.name ?? ""); setRenaming(true); }}
                title="แก้ชื่องานนี้ในทะเบียน (พิมพ์ผิดแก้ได้)"
                className="h-9 px-2.5 text-sm border border-slate-200 rounded-lg text-slate-500 hover:text-amber-600 hover:border-amber-300">✏️</button>
            )}
          </div>
          {renaming && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <input autoFocus value={renameVal} onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); if (e.key === "Escape") setRenaming(false); }}
                className="flex-1 h-9 px-3 text-sm border border-amber-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400" />
              <button type="button" onClick={() => void saveRename()} className="h-9 px-3 text-xs font-medium bg-amber-500 text-white rounded-lg hover:bg-amber-600">💾 บันทึกชื่อ</button>
              <button type="button" onClick={() => setRenaming(false)} className="h-9 px-2 text-xs border border-slate-200 rounded-lg text-slate-500">ยกเลิก</button>
            </div>
          )}
          {renaming && <p className="mt-1 text-[11px] text-amber-600">แก้ชื่อในทะเบียน = เปลี่ยนทุกที่ที่ใช้งานนี้ (ใบเก่าที่จ่ายไปแล้วยังใช้ชื่อเดิม)</p>}
        </div>
        {isNew && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ชื่องานใหม่</label>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น งานเย็บริม" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ราคา/ชิ้น</label>
            <input type="number" inputMode="decimal" value={rate || ""} onChange={(e) => setRate(Number(e.target.value) || 0)} className="w-full h-9 px-2 text-sm text-right border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน×</label>
            <input type="number" inputMode="numeric" value={qtyPer || ""} onChange={(e) => setQtyPer(Number(e.target.value) || 0)} placeholder="1" className="w-full h-9 px-2 text-sm text-center border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-end gap-1.5 pb-2 text-sm text-slate-600">
            <input type="checkbox" checked={isDetail} onChange={(e) => setIsDetail(e.target.checked)} className="w-4 h-4 accent-blue-600" /> ละเอียด
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={allSiblings} onChange={(e) => setAllSiblings(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          📌 ใส่ให้ทุกตัวในรุ่นเดียวกัน (Parent SKU เดียวกัน)
        </label>
        <p className="text-[11px] text-slate-400">จำนวน× = ตัวคูณต่อ 1 ใบสั่ง (เช่น เย็บ 4 จุด ใส่ 4) · ตัวที่มีงานนี้อยู่แล้วจะไม่เพิ่มซ้ำ</p>
      </div>
    </ERPModal>
  );
}
