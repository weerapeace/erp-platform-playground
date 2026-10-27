"use client";

// 🔗 แท็บ "รอยืนยันสินค้า" — สินค้าจากเมลที่ระบบยังไม่แน่ใจว่าเป็น SKU ไหน (รวมกลุ่มตาม สินค้า + ตัวเลือก)
// ยืนยันครั้งเดียว → ผูกทุกรายการที่ค้างด้วยคู่นี้ + จำไว้ (เมลครั้งหน้าระบบจับเอง) · ใช้ SkuPicker กลางถ้าไม่มีในตัวเลือก

import { useCallback, useEffect, useState } from "react";
import { SkuPicker, type SkuPickerValue } from "@/components/pickers";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import { PLATFORM_LABEL, type PendingGroup } from "./types";

export function PendingTab({ onChanged }: { onChanged: () => void }) {
  const toast = useToast();
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await apiFetch("/api/platform-email/inbox?view=pending");
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "โหลดไม่สำเร็จ");
      setGroups(j.groups as PendingGroup[]);
    } catch (e) { setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการโหลดข้อมูล กรุณาลองใหม่"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const confirm = async (g: PendingGroup, sku: { id: string; code: string }) => {
    try {
      const res = await apiFetch("/api/platform-email/inbox", { method: "POST", body: JSON.stringify({ action: "confirm_sku", platform_code: g.platform_code, item_key: g.item_key, sku_id: sku.id }) });
      const j = await res.json();
      if (!res.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      toast.success(`ผูก ${j.updated} รายการกับ ${j.sku_code} แล้ว — ครั้งหน้าระบบจับคู่นี้เอง`);
      setGroups((list) => list.filter((x) => !(x.platform_code === g.platform_code && x.item_key === g.item_key)));
      onChanged();
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
  };

  if (loading) return <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-100" />)}</div>;
  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">⚠ {error} <button onClick={() => void load()} className="ml-2 underline">ลองใหม่</button></div>;
  if (!groups.length) return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center">
      <div className="font-medium text-emerald-700">✅ ไม่มีสินค้ารอยืนยัน</div>
      <div className="mt-1 text-sm text-slate-500">ทุกสินค้าจากเมลจับคู่กับ SKU ใน ERP ได้แล้ว</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">สินค้าเหล่านี้ระบบยังไม่แน่ใจว่าเป็น SKU ไหน (ยังนับในรายงาน แต่โชว์เป็นชื่อจากร้าน) — เลือกครั้งเดียว ระบบจะจำไว้ใช้กับเมลครั้งต่อไป</p>
      {groups.map((g) => <GroupCard key={`${g.platform_code}|${g.item_key}`} g={g} onConfirm={(sku) => confirm(g, sku)} />)}
    </div>
  );
}

function GroupCard({ g, onConfirm }: { g: PendingGroup; onConfirm: (sku: { id: string; code: string }) => Promise<void> }) {
  const [pick, setPick] = useState<{ id: string; code: string } | null>(g.suggest);
  const [other, setOther] = useState<SkuPickerValue | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = other ? { id: other.id, code: other.code } : pick;

  const save = async () => {
    if (!chosen) return;
    setSaving(true);
    try { await onConfirm(chosen); } finally { setSaving(false); }
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-slate-800"><span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{PLATFORM_LABEL[g.platform_code] ?? g.platform_code}</span>{g.title}</div>
          <div className="mt-1 text-xs text-slate-500">
            ตัวเลือก: <b className="text-slate-700">{g.variant ?? "—"}</b> · {g.qty.toLocaleString("th-TH")} ชิ้น ใน {g.items} รายการ · ออเดอร์ {g.orders.join(", ")}{g.items > g.orders.length ? " …" : ""}
          </div>
          {g.reason && <div className="mt-0.5 text-xs text-amber-700">💡 {g.reason}</div>}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {g.candidates.length ? g.candidates.map((c) => {
          const on = !other && pick?.id === c.id;
          return (
            <button key={c.id} onClick={() => { setOther(null); setPick({ id: c.id, code: c.code }); }}
              className={`rounded-lg border px-2.5 py-1 text-xs ${on ? "border-emerald-500 bg-emerald-50 font-medium text-emerald-800 ring-1 ring-emerald-300" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              {on && "✓ "}<code className="font-mono">{c.code}</code>{c.color ? ` · ${c.color}` : ""}
            </button>
          );
        }) : <span className="text-xs text-slate-400">{g.model_code ? `ไม่พบรหัส ${g.model_code} ใน ERP` : "ชื่อสินค้าไม่มีรหัสรุ่น"} — เลือก SKU เองด้านขวา</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="w-72"><SkuPicker value={other} onChange={setOther} placeholder="🔍 หรือค้นหา SKU อื่น..." /></div>
        <button onClick={() => void save()} disabled={!chosen || saving}
          className="h-9 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40">
          {saving ? "กำลังบันทึก..." : chosen ? `✓ ยืนยันเป็น ${chosen.code}` : "เลือก SKU ก่อน"}
        </button>
      </div>
    </section>
  );
}
