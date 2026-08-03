"use client";

/**
 * ของกลาง — "ขอเพิ่มวัตถุดิบ" (พนักงานกรอกเท่าที่รู้ → เข้าคิวรออนุมัติ → อนุมัติแล้วค่อยกลายเป็น SKU จริง)
 *
 *   <MaterialRequestButton />                 ปุ่ม 🙋 ขอเพิ่มวัตถุดิบ + 📋 คิวคำขอ (มีตัวเลขค้าง)
 *   <MaterialRequestForm  open onClose />     ฟอร์มขอเพิ่ม (ไม่ต้องกรอกครบ)
 *   <MaterialRequestQueue open onClose />     คิวอนุมัติ — "อนุมัติ" = เปิด SkuWizard พร้อมเติมค่าที่ขอมาให้
 *
 * ⚠️ ไม่มีตัวสร้าง SKU ในนี้ — อนุมัติแล้วส่งต่อให้ SkuWizard ตัวเดิม (กติการหัส/แท็ก/ซ้ำ ใช้ของเดิมทั้งหมด)
 * ของกลางที่ใช้: ERPModal · useToast · apiFetch · usePermission · ImageAttachKeys · SkuWizard
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { usePermission } from "@/components/auth";
import { ERPModal } from "@/components/modal";
import { ImageAttachKeys } from "@/components/image-attach";
import { UomPicker } from "@/components/uom-picker";
import { SupplierPicker, type SupplierPickerValue } from "@/components/pickers";
import { SkuWizard } from "@/app/master/skus/sku-wizard";
import type { MaterialRequest } from "@/app/api/master/material-requests/route";

type TagOpt = { id: string; name: string; code_prefix: string; group_name: string | null };

const inCls = "w-full h-9 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500";
const thDT = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/** ช่องพิมพ์ธรรมดา — ทุกช่องไม่บังคับ (หน่วย/ร้าน ใช้ picker ของกลางแยกด้านล่าง) */
const FIELDS: { key: string; label: string; hint?: string; type?: "number" }[] = [
  { key: "code", label: "รหัสที่อยากได้", hint: "ไม่รู้ก็เว้นไว้ ให้คนอนุมัติตั้งให้" },
  { key: "name_th", label: "ชื่อวัตถุดิบ" },
  { key: "color", label: "สี" },
  { key: "fabric_width_cm", label: "หน้ากว้าง (ซม.)", type: "number", hint: "กรณีผ้า" },
  { key: "standard_price", label: "ราคาซื้อ (บาท)", type: "number" },
  { key: "rmb_cost", label: "ราคาซื้อ (หยวน)", type: "number" },
  { key: "purchase_link", label: "ลิงก์ซื้อ" },
];

export function MaterialRequestForm({ open, onClose, onSaved, prefill }: {
  open: boolean; onClose: () => void; onSaved?: () => void;
  prefill?: Record<string, unknown>;
}) {
  const toast = useToast();
  const [v, setV] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [imgs, setImgs] = useState<string[]>([]);
  const [tags, setTags] = useState<TagOpt[]>([]);
  const [tagId, setTagId] = useState("");
  const [uom, setUom] = useState<string | null>(null);                       // ของกลาง UomPicker (เก็บเป็นชื่อหน่วย)
  const [seller, setSeller] = useState<SupplierPickerValue | null>(null);    // ของกลาง SupplierPicker (ได้ id จริง)
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setV(Object.fromEntries(Object.entries(prefill ?? {}).map(([k, val]) => [k, String(val ?? "")])));
    setNote(""); setImgs([]); setTagId(""); setUom(null); setSeller(null);
    apiFetch("/api/skus/tag-prefix").then((r) => r.json()).then((j) => setTags((j.data ?? []) as TagOpt[])).catch(() => setTags([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const set = (k: string, val: string) => setV((s) => ({ ...s, [k]: val }));

  const submit = async () => {
    const values: Record<string, unknown> = {};
    const labels: Record<string, string> = {};
    for (const f of FIELDS) {
      const raw = (v[f.key] ?? "").trim();
      if (!raw) continue;
      values[f.key] = f.type === "number" ? Number(raw) : raw;
    }
    // หน่วย/ร้าน มาจาก picker ของกลาง → ได้ค่าจริงที่ Wizard เอาไปใช้ต่อได้เลย
    if (uom) { values.uom_label = uom; labels.uom_label = uom; }
    if (seller) { values.seller_partner_id = seller.id; labels.seller_label = seller.name; labels.seller_partner_id = seller.name; }
    const tag = tags.find((t) => t.id === tagId) ?? null;
    if (!Object.keys(values).length && !note.trim()) { toast.error("ใส่อย่างน้อย ชื่อ หรือ รหัส หรือ หมายเหตุ"); return; }

    setSaving(true);
    try {
      const res = await apiFetch("/api/master/material-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          values, labels, family_tag_id: tag?.id ?? null, family_tag_name: tag?.name ?? null,
          note: note.trim() || null, image_key: imgs[0] ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "ส่งคำขอไม่สำเร็จ");
      toast.success("ส่งคำขอแล้ว — รอคนดูแลข้อมูลอนุมัติ");
      onSaved?.(); onClose();
    } catch (e) { toast.error(e instanceof Error ? e.message : "ส่งคำขอไม่สำเร็จ"); }
    finally { setSaving(false); }
  };

  return (
    <ERPModal open={open} onClose={() => !saving && onClose()} size="lg" storageKey="material-request-form"
      title="🙋 ขอเพิ่มวัตถุดิบ"
      footer={<>
        <button onClick={onClose} disabled={saving} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
        <button onClick={() => void submit()} disabled={saving}
          className="h-9 px-5 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? "กำลังส่ง…" : "ส่งคำขอ"}
        </button>
      </>}>
      <div className="space-y-3">
        <p className="text-[12px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
          กรอก<b>เท่าที่รู้ ไม่ต้องครบ</b> · ระบบ<b>ยังไม่สร้าง SKU</b> — คำขอจะเข้าคิวให้คนดูแลข้อมูลตรวจแล้วสร้างให้
        </p>

        <label className="block">
          <span className="text-[12px] text-slate-600">ประเภท (ถ้ารู้)</span>
          <select value={tagId} onChange={(e) => setTagId(e.target.value)} className={`${inCls} mt-0.5`}>
            <option value="">— ไม่ระบุ —</option>
            {tags.map((t) => <option key={t.id} value={t.id}>{t.name}{t.group_name ? ` · ${t.group_name}` : ""}</option>)}
          </select>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {FIELDS.map((f) => (
            <label key={f.key} className="block">
              <span className="text-[12px] text-slate-600">{f.label}</span>
              <input type={f.type === "number" ? "number" : "text"} step="any" value={v[f.key] ?? ""}
                onChange={(e) => set(f.key, e.target.value)} className={`${inCls} mt-0.5`} />
              {f.hint && <span className="text-[10px] text-slate-400">{f.hint}</span>}
            </label>
          ))}

          {/* หน่วย + ร้าน — ใช้ picker ของกลาง (ค้นหาได้ · ได้ค่าจริงในระบบ ไม่ใช่ข้อความมั่ว) */}
          <div>
            <span className="text-[12px] text-slate-600">หน่วย</span>
            <div className="mt-0.5"><UomPicker value={uom} onChange={setUom} /></div>
            <span className="text-[10px] text-slate-400">เลือกจากทะเบียนหน่วย · ไม่มีในรายการก็พิมพ์เองได้</span>
          </div>
          <div>
            <span className="text-[12px] text-slate-600">ร้าน / ผู้ขาย</span>
            <div className="mt-0.5"><SupplierPicker value={seller} onChange={setSeller} placeholder="ค้นหาร้าน…" /></div>
            <span className="text-[10px] text-slate-400">ค้นหาจากทะเบียนร้าน · ยังไม่มีร้านนี้ เขียนบอกในหมายเหตุได้</span>
          </div>
        </div>

        <label className="block">
          <span className="text-[12px] text-slate-600">หมายเหตุ / ใช้กับงานอะไร</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
            placeholder="เช่น ใช้กับ MO-2026-00020 · ซื้อจากร้านเดิมข้างโรงงาน"
            className="w-full mt-0.5 px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        </label>

        <div>
          <span className="text-[12px] text-slate-600">แนบรูป (ถ่ายของจริงก็ได้)</span>
          <div className="mt-1"><ImageAttachKeys value={imgs} onChange={setImgs} folder="material-requests" /></div>
        </div>
      </div>
    </ERPModal>
  );
}

export function MaterialRequestQueue({ open, onClose, onChanged }: {
  open: boolean; onClose: () => void; onChanged?: () => void;
}) {
  const toast = useToast();
  const canReview = usePermission("products.edit");
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [rows, setRows] = useState<MaterialRequest[] | null>(null);
  const [approving, setApproving] = useState<MaterialRequest | null>(null);   // เปิด SkuWizard ให้สร้างจริง
  const [rejecting, setRejecting] = useState<MaterialRequest | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    apiFetch(`/api/master/material-requests?status=${tab}`).then((r) => r.json())
      .then((j) => setRows((j.data ?? []) as MaterialRequest[])).catch(() => setRows([]));
  }, [tab]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const finish = async (r: MaterialRequest, action: "approve" | "reject", extra: Record<string, unknown> = {}) => {
    try {
      const res = await apiFetch("/api/master/material-requests", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, action, ...extra }),
      });
      const j = await res.json();
      if (!res.ok || j?.error) throw new Error(j?.error || "บันทึกไม่สำเร็จ");
      toast.success(action === "approve" ? "อนุมัติแล้ว" : "ไม่อนุมัติแล้ว");
      load(); onChanged?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  const STATUS: Record<string, { label: string; cls: string }> = {
    pending: { label: "รออนุมัติ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    approved: { label: "อนุมัติแล้ว", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    rejected: { label: "ไม่อนุมัติ", cls: "bg-slate-100 text-slate-500 border-slate-200" },
  };

  return (
    <>
      <ERPModal open={open} onClose={onClose} size="xl" storageKey="material-request-queue" title="📋 คำขอเพิ่มวัตถุดิบ"
        footer={<button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ปิด</button>}>
        <div className="space-y-2">
          <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
            <button onClick={() => setTab("pending")} className={`h-8 px-3 text-[12px] ${tab === "pending" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>รออนุมัติ</button>
            <button onClick={() => setTab("all")} className={`h-8 px-3 text-[12px] border-l border-slate-200 ${tab === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>ทั้งหมด</button>
          </div>

          {rows === null ? <div className="py-10 text-center text-slate-400 text-sm">กำลังโหลด…</div>
            : rows.length === 0 ? <div className="py-10 text-center text-slate-300 text-sm">{tab === "pending" ? "ไม่มีคำขอค้าง 🎉" : "ยังไม่มีคำขอ"}</div>
            : (
              <div className="space-y-1.5">
                {rows.map((r) => {
                  const st = STATUS[r.status] ?? STATUS.pending;
                  const val = r.values ?? {};
                  return (
                    <div key={r.id} className="border border-slate-200 rounded-lg p-2.5">
                      <div className="flex items-start gap-2">
                        {r.image_key
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={`/api/r2-image?key=${encodeURIComponent(r.image_key)}&w=120`} alt="" className="w-12 h-12 rounded object-cover border border-slate-200 shrink-0" />
                          : <div className="w-12 h-12 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-xl text-slate-300 shrink-0">📦</div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-slate-800">{String(val.name_th ?? "") || String(val.code ?? "") || "(ไม่ได้ใส่ชื่อ)"}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${st.cls}`}>{st.label}</span>
                            {r.family_tag_name && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{r.family_tag_name}</span>}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 flex flex-wrap gap-x-2">
                            {val.code ? <span>รหัสที่ขอ: <code className="text-slate-600">{String(val.code)}</code></span> : null}
                            {val.color ? <span>สี {String(val.color)}</span> : null}
                            {r.labels?.uom_label ? <span>หน่วย {r.labels.uom_label}</span> : null}
                            {r.labels?.seller_label ? <span>ร้าน {r.labels.seller_label}</span> : null}
                            {val.standard_price ? <span>฿{String(val.standard_price)}</span> : null}
                            {val.rmb_cost ? <span>¥{String(val.rmb_cost)}</span> : null}
                          </div>
                          {r.note && <div className="text-[11px] text-slate-600 mt-0.5">📝 {r.note}</div>}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            ขอโดย {r.requested_by_name ?? "—"} · {thDT(r.created_at)}
                            {r.status === "approved" && r.created_sku_code && <span className="text-emerald-600"> → สร้างเป็น {r.created_sku_code}</span>}
                            {r.status === "rejected" && r.reject_reason && <span className="text-slate-500"> · {r.reject_reason}</span>}
                          </div>
                        </div>
                        {r.status === "pending" && canReview && (
                          <div className="shrink-0 flex flex-col gap-1">
                            <button onClick={() => setApproving(r)}
                              className="h-7 px-2.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 whitespace-nowrap">✓ อนุมัติ → สร้าง</button>
                            <button onClick={() => { setRejecting(r); setReason(""); }}
                              className="h-7 px-2.5 text-[11px] border border-slate-200 text-slate-500 rounded hover:bg-slate-50">ไม่อนุมัติ</button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          {!canReview && <p className="text-[11px] text-slate-400">คุณดูได้อย่างเดียว — การอนุมัติต้องมีสิทธิ์แก้ข้อมูลสินค้า</p>}
        </div>
      </ERPModal>

      {/* อนุมัติ = เปิด SkuWizard เดิม พร้อมเติมค่าที่ขอมาให้ → สร้างเสร็จค่อยปิดคำขอ */}
      {approving && (
        <SkuWizard open onClose={() => setApproving(null)}
          // uom_label ไม่ใช่คอลัมน์จริง (server กรองทิ้งอยู่แล้ว) — ตัดออกกันสับสนใน Wizard
          prefill={Object.fromEntries(Object.entries(approving.values ?? {}).filter(([k]) => k !== "uom_label"))}
          onCreated={(res) => {
            const sku = res?.skus?.[0];
            void finish(approving, "approve", { sku_id: sku?.id ?? null, sku_code: sku?.code ?? null });
            setApproving(null);
          }} />
      )}

      {/* ไม่อนุมัติ */}
      <ERPModal open={!!rejecting} onClose={() => setRejecting(null)} size="sm" title="ไม่อนุมัติคำขอ"
        footer={<>
          <button onClick={() => setRejecting(null)} className="h-9 px-4 text-sm border border-slate-200 rounded-lg">ยกเลิก</button>
          <button onClick={() => { const r = rejecting; setRejecting(null); if (r) void finish(r, "reject", { reason }); }}
            className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg">ไม่อนุมัติ</button>
        </>}>
        <label className="block">
          <span className="text-[12px] text-slate-600">เหตุผล (บอกผู้ขอด้วยว่าทำไม)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} autoFocus
            placeholder="เช่น มีในระบบแล้ว ใช้รหัส XXX แทน" className={`${inCls} mt-0.5`} />
        </label>
      </ERPModal>
    </>
  );
}

/** ปุ่มคู่: ขอเพิ่ม + คิวคำขอ (มีตัวเลขค้าง) — เสียบหน้าไหนก็ได้ */
export function MaterialRequestButton({ compact = false }: { compact?: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [pending, setPending] = useState(0);

  const refresh = useCallback(() => {
    apiFetch("/api/master/material-requests?status=pending").then((r) => r.json())
      .then((j) => setPending(Number(j?.pending ?? 0))).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <button onClick={() => setFormOpen(true)}
        className="h-9 px-3 text-sm rounded-lg border border-indigo-200 text-indigo-700 bg-white hover:bg-indigo-50 whitespace-nowrap">
        🙋 ขอเพิ่มวัตถุดิบ
      </button>
      <button onClick={() => setQueueOpen(true)} title="คำขอเพิ่มวัตถุดิบ"
        className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 whitespace-nowrap">
        📋 {compact ? "" : "คำขอ"}{pending > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-amber-100 text-amber-700">{pending}</span>}
      </button>

      <MaterialRequestForm open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
      <MaterialRequestQueue open={queueOpen} onClose={() => setQueueOpen(false)} onChanged={refresh} />
    </>
  );
}
