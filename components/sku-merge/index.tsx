"use client";

// ============================================================
// SkuMergeModal (ของกลาง) — จัดการ SKU ซ้ำ: รวม/ยุบตัวซ้ำเข้าตัวหลัก
//   1) เลือก SKU หลัก (เก็บไว้) + SKU ซ้ำ (ยุบ) ด้วย SkuPicker กลาง
//   2) เทียบฟิลด์ที่ต่างกัน → เลือกใช้ค่าของตัวไหน (ค่าเริ่ม = ตัวหลัก)
//   3) พรีวิวจำนวนความเชื่อมโยงที่จะโอน (รูป/แท็ก/สต๊อก/BOM ฯลฯ)
//   4) ยืนยัน → POST /api/skus/merge (โอนทั้งหมด + ยุบตัวซ้ำเข้าถังขยะ)
// ============================================================

import { useState, useEffect, useCallback } from "react";
import { ERPModal } from "@/components/modal";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { Spinner } from "@/components/spinner";

type Rec = Record<string, unknown>;
type RegField = { column_name: string | null; field_label: string; is_visible?: boolean; is_sensitive?: boolean };

// คอลัมน์ที่ไม่เอามาให้เลือก (ระบบ/สงวน) — ตรงกับฝั่ง server
const SKIP = new Set(["id", "code", "is_active", "created_at", "updated_at", "created_by", "updated_by", "parent_sku_id", "cover_image_r2_key"]);

// ป้ายชื่อกลุ่มความเชื่อมโยง (key จาก erp_merge_skus_preview)
const REL_LABELS: { key: string; label: string }[] = [
  { key: "images", label: "🖼️ รูปภาพ" },
  { key: "tags", label: "🏷️ แท็ก/หมวด" },
  { key: "supplier_items", label: "💰 ราคาต่อร้าน" },
  { key: "supplier_history", label: "📈 ประวัติราคา" },
  { key: "stock_movements", label: "📦 การเคลื่อนไหวสต๊อก" },
  { key: "favorites", label: "⭐ รายการโปรด" },
  { key: "attribute_values", label: "🧩 คุณสมบัติ" },
  { key: "creative", label: "🎨 งานครีเอทีฟ" },
  { key: "purchase", label: "🛒 จัดซื้อ/รับของ" },
  { key: "sales", label: "🧾 ขาย/ป้ายกล่อง/มาร์เก็ตเพลส" },
  { key: "bom_lines", label: "🧾 สูตรผลิต BOM (บรรทัด)" },
  { key: "bom_headers", label: "🧾 หัว BOM" },
  { key: "mo", label: "🏭 ใบสั่งผลิต MO" },
];

const fmt = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "ใช่" : "ไม่";
  return String(v);
};
const isScalar = (v: unknown) => v === null || ["string", "number", "boolean"].includes(typeof v);

export function SkuMergeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [primary, setPrimary] = useState<SkuPickerValue | null>(null);
  const [dup, setDup] = useState<SkuPickerValue | null>(null);

  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const [visibleCols, setVisibleCols] = useState<Set<string>>(new Set());
  const [pRec, setPRec] = useState<Rec | null>(null);
  const [dRec, setDRec] = useState<Rec | null>(null);
  const [choice, setChoice] = useState<Record<string, "primary" | "dup">>({});   // ต่อฟิลด์ที่ต่างกัน
  const [preview, setPreview] = useState<Rec | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [done, setDone] = useState<Rec | null>(null);

  // ทะเบียนฟิลด์ (label + คอลัมน์ที่โชว์ได้) — ครั้งเดียว
  useEffect(() => {
    apiFetch("/api/admin/field-registry-v2?module=skus-v2").then((r) => r.json()).then((j) => {
      const fields = (j.fields ?? []) as RegField[];
      const lb = new Map<string, string>(); const vis = new Set<string>();
      for (const f of fields) {
        if (!f.column_name) continue;
        lb.set(f.column_name, f.field_label || f.column_name);
        if (f.is_visible && !f.is_sensitive && !SKIP.has(f.column_name)) vis.add(f.column_name);
      }
      setLabels(lb); setVisibleCols(vis);
    }).catch(() => {});
  }, []);

  const bothPicked = !!primary && !!dup && primary.id !== dup.id;

  // ดึง record เต็ม 2 ตัว + พรีวิวความเชื่อมโยง เมื่อเลือกครบ
  const loadCompare = useCallback(async () => {
    if (!primary || !dup) return;
    setLoading(true); setPRec(null); setDRec(null); setPreview(null); setChoice({}); setConfirmed(false);
    try {
      const [pr, dr, pv] = await Promise.all([
        apiFetch(`/api/master-v2/skus-v2/${primary.id}`).then((r) => r.json()),
        apiFetch(`/api/master-v2/skus-v2/${dup.id}`).then((r) => r.json()),
        apiFetch(`/api/skus/merge?primary=${primary.id}&duplicate=${dup.id}`).then((r) => r.json()),
      ]);
      setPRec((pr.data ?? null) as Rec | null);
      setDRec((dr.data ?? null) as Rec | null);
      if (pv.error) toast.error(pv.error); else setPreview((pv.preview ?? {}) as Rec);
    } catch { toast.error("โหลดข้อมูลเปรียบเทียบไม่สำเร็จ"); }
    finally { setLoading(false); }
  }, [primary, dup, toast]);

  useEffect(() => { if (bothPicked) void loadCompare(); }, [bothPicked, loadCompare]);

  // ฟิลด์ที่ต่างกัน (เฉพาะคอลัมน์ที่โชว์ได้ + เป็นค่าเดี่ยว)
  const diffs = (pRec && dRec)
    ? [...visibleCols].filter((c) => isScalar(pRec[c]) && isScalar(dRec[c]) && String(pRec[c] ?? "") !== String(dRec[c] ?? "")).sort()
    : [];

  const submit = async () => {
    if (!primary || !dup) return;
    setSubmitting(true);
    try {
      const field_overrides: Record<string, unknown> = {};
      for (const c of diffs) if (choice[c] === "dup" && dRec) field_overrides[c] = dRec[c];
      const res = await apiFetch("/api/skus/merge", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ primary_id: primary.id, duplicate_id: dup.id, field_overrides }),
      });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "รวม SKU ไม่สำเร็จ");
      setDone((j.result ?? {}) as Rec);
      toast.success("รวม SKU สำเร็จ");
    } catch (e) { toast.error(e instanceof Error ? e.message : "รวม SKU ไม่สำเร็จ"); }
    finally { setSubmitting(false); }
  };

  const previewTotal = preview ? REL_LABELS.reduce((s, r) => s + (Number(preview[r.key]) || 0), 0) : 0;
  const stockQty = preview ? Number(preview.stock_qty) || 0 : 0;

  // ---------- หน้าจอ "เสร็จแล้ว" ----------
  if (done) {
    const counts = (done.counts ?? {}) as Rec;
    return (
      <ERPModal open onClose={() => { onDone(); }} title="✅ รวม SKU สำเร็จ" size="md"
        footer={<button onClick={() => onDone()} className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">เสร็จ</button>}>
        <div className="space-y-2 text-sm">
          <p className="text-slate-700">โอนความเชื่อมโยงของ <b className="font-mono">{String(done.dup_code ?? "")}</b> มาที่ <b className="font-mono">{String(done.primary_code ?? "")}</b> แล้ว · ตัวซ้ำถูกยุบเข้าถังขยะ (กู้คืนได้)</p>
          <div className="grid grid-cols-2 gap-1.5 text-[12px]">
            {Object.entries(counts).filter(([, n]) => Number(n) > 0).map(([k, n]) => (
              <div key={k} className="flex justify-between px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-100">
                <span className="text-slate-500">{REL_LABELS.find((r) => r.key === k)?.label ?? k}</span>
                <span className="font-medium text-slate-700">{String(n)}</span>
              </div>
            ))}
          </div>
        </div>
      </ERPModal>
    );
  }

  return (
    <ERPModal open onClose={onClose} title="🔗 จัดการ SKU ซ้ำ (รวม/ยุบ)" size="xl"
      description="เลือก SKU หลักที่จะเก็บ + SKU ซ้ำที่จะยุบ → ระบบโอนรูป/แท็ก/สต๊อก/ราคา/BOM ฯลฯ มาตัวหลัก แล้วยุบตัวซ้ำเข้าถังขยะ"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <label className={`flex items-center gap-2 text-[12px] ${bothPicked ? "text-slate-600" : "text-slate-300"}`}>
            <input type="checkbox" checked={confirmed} disabled={!bothPicked} onChange={(e) => setConfirmed(e.target.checked)} className="w-4 h-4 accent-rose-600" />
            เข้าใจแล้วว่าตัวซ้ำจะถูกยุบเข้าถังขยะ และ BOM/MO จะชี้มาตัวหลัก
          </label>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose} disabled={submitting} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
            <button onClick={submit} disabled={!bothPicked || !confirmed || submitting || loading}
              className="h-9 px-4 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 inline-flex items-center gap-2">
              {submitting && <Spinner />}{submitting ? "กำลังรวม…" : "🔗 รวม SKU"}
            </button>
          </div>
        </div>
      }>
      <div className="space-y-4">
        {/* 1) เลือก SKU */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border-2 border-emerald-200 bg-emerald-50/40">
            <p className="text-[12px] font-semibold text-emerald-700 mb-1.5">✔ SKU หลัก (เก็บไว้)</p>
            <SkuPicker value={primary} onChange={setPrimary} placeholder="เลือก SKU หลัก…" />
          </div>
          <div className="p-3 rounded-lg border-2 border-rose-200 bg-rose-50/40">
            <p className="text-[12px] font-semibold text-rose-700 mb-1.5">✕ SKU ซ้ำ (ยุบเข้าถังขยะ)</p>
            <SkuPicker value={dup} onChange={setDup} placeholder="เลือก SKU ซ้ำ…" />
          </div>
        </div>

        {primary && dup && primary.id === dup.id && (
          <p className="text-[12px] text-rose-600">⚠️ SKU หลักและ SKU ซ้ำต้องเป็นคนละตัว</p>
        )}

        {loading && <div className="py-6 flex items-center justify-center gap-2 text-sm text-slate-400"><Spinner /> กำลังโหลดข้อมูลเปรียบเทียบ…</div>}

        {bothPicked && !loading && (
          <>
            {/* 2) เทียบฟิลด์ที่ต่างกัน */}
            <div>
              <p className="text-[13px] font-semibold text-slate-600 mb-1.5">เลือกข้อมูลที่จะใช้ (ฟิลด์ที่ต่างกัน {diffs.length})</p>
              {diffs.length === 0 ? (
                <p className="text-[12px] text-slate-400 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">ฟิลด์หลักเหมือนกันหมด — ตัวหลักจะใช้ค่าเดิม</p>
              ) : (
                <div className="rounded-lg border border-slate-200 overflow-hidden">
                  <div className="grid grid-cols-[1fr_1fr_1fr] gap-px bg-slate-100 text-[11px] font-medium text-slate-500">
                    <div className="bg-slate-50 px-2.5 py-1.5">ฟิลด์</div>
                    <div className="bg-emerald-50 px-2.5 py-1.5">ตัวหลัก ({primary!.code})</div>
                    <div className="bg-rose-50 px-2.5 py-1.5">ตัวซ้ำ ({dup!.code})</div>
                  </div>
                  <div className="max-h-[30vh] overflow-y-auto divide-y divide-slate-100">
                    {diffs.map((c) => {
                      const sel = choice[c] ?? "primary";
                      return (
                        <div key={c} className="grid grid-cols-[1fr_1fr_1fr] gap-px items-stretch text-[12px]">
                          <div className="px-2.5 py-2 text-slate-600">{labels.get(c) ?? c}</div>
                          <label className={`px-2.5 py-2 flex items-center gap-1.5 cursor-pointer ${sel === "primary" ? "bg-emerald-50/70 font-medium text-slate-800" : "text-slate-500 hover:bg-slate-50"}`}>
                            <input type="radio" name={`f_${c}`} checked={sel === "primary"} onChange={() => setChoice((m) => ({ ...m, [c]: "primary" }))} className="w-3.5 h-3.5 accent-emerald-600 shrink-0" />
                            <span className="truncate">{fmt(pRec![c])}</span>
                          </label>
                          <label className={`px-2.5 py-2 flex items-center gap-1.5 cursor-pointer ${sel === "dup" ? "bg-rose-50/70 font-medium text-slate-800" : "text-slate-500 hover:bg-slate-50"}`}>
                            <input type="radio" name={`f_${c}`} checked={sel === "dup"} onChange={() => setChoice((m) => ({ ...m, [c]: "dup" }))} className="w-3.5 h-3.5 accent-rose-600 shrink-0" />
                            <span className="truncate">{fmt(dRec![c])}</span>
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* 3) พรีวิวความเชื่อมโยง */}
            {preview && (
              <div>
                <p className="text-[13px] font-semibold text-slate-600 mb-1.5">จะโอนมาตัวหลัก (จากตัวซ้ำ {dup!.code})</p>
                {previewTotal === 0 && stockQty === 0 ? (
                  <p className="text-[12px] text-slate-400 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">ตัวซ้ำนี้ไม่มีความเชื่อมโยงอื่น — จะแค่ยุบเข้าถังขยะ</p>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[12px]">
                    {stockQty !== 0 && (
                      <div className="flex justify-between px-2.5 py-1.5 rounded-md bg-amber-50 border border-amber-100">
                        <span className="text-slate-500">📦 สต๊อกคงเหลือ</span><span className="font-medium text-slate-700">+{stockQty}</span>
                      </div>
                    )}
                    {REL_LABELS.map((r) => {
                      const n = Number(preview[r.key]) || 0; if (!n) return null;
                      return (
                        <div key={r.key} className="flex justify-between px-2.5 py-1.5 rounded-md bg-slate-50 border border-slate-100">
                          <span className="text-slate-500 truncate">{r.label}</span><span className="font-medium text-slate-700 shrink-0 ml-1">{n}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </ERPModal>
  );
}
