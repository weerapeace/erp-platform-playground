"use client";

/**
 * ปุ่ม "🔄 อัพเดตวัตถุดิบตาม BOM" (ของกลาง) — ใช้ทั้งหน้าแก้ใบสั่งผลิตและป๊อปเช็กลิสต์บนบอร์ดจ่ายงาน
 *
 * ทำอะไร: กางสูตร BOM ใหม่ทับรายการวัตถุดิบของใบสั่งผลิต (เลือกเวอร์ชันสูตรได้)
 *   โดย "เก็บค่าที่เคยกรอก" ของวัตถุดิบชิ้นเดิมที่ยังอยู่ในสูตร (จำนวนที่มี/เตรียมครบ/ตัดครบ/ขอซื้อ)
 *   → ใช้ตอนแก้ BOM (เปลี่ยนวัตถุดิบ/จำนวน) แล้วอยากให้ใบที่เปิดค้างอยู่ตามสูตรล่าสุด
 *
 * เบื้องหลัง = PATCH /api/mo/<id> { reexplode:true, preserve:true, bom_code, bom_version }
 * รายชื่อเวอร์ชันโหลดตอน "กดปุ่ม" เท่านั้น (lazy) — ไม่ยิงตอน render
 */
import { useState } from "react";
import { ERPModal } from "@/components/modal";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import type { BomVersion } from "@/app/api/bom/versions/route";

export function BomRefreshButton({
  moId, productSku, currentBomCode, currentBomVersion, sizeBreakdown, onDone, className, label = "🔄 อัพเดตวัตถุดิบตาม BOM",
}: {
  moId: string;
  productSku: string | null;
  currentBomCode: string | null;
  currentBomVersion?: string | null;
  /** ส่งไซส์ไปด้วย (หน้าที่แก้ไซส์ค้างอยู่ในฟอร์ม) · ไม่ส่ง = ใช้ไซส์ที่บันทึกไว้ในใบ */
  sizeBreakdown?: { label: string; qty: number }[] | null;
  onDone?: () => void | Promise<void>;
  className?: string;
  label?: string;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<BomVersion[]>([]);
  const [ver, setVer] = useState("");        // id ของเวอร์ชันที่เลือก
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const openDialog = async () => {
    setOpen(true);
    if (!productSku) { setVersions([]); return; }
    setLoading(true);
    try {
      const r = await apiFetch(`/api/bom/versions?product_sku=${encodeURIComponent(productSku)}`);
      const j = await r.json();
      const vs = (j.data ?? []) as BomVersion[];
      setVersions(vs);
      // ตั้งค่าเริ่มต้น: เวอร์ชันที่ใบนี้ใช้อยู่ → ไม่มีก็ตัวมาตรฐาน (★) → ไม่มีอีกก็ตัวแรก
      const cur = vs.find((v) => v.bom_code === currentBomCode) ?? vs.find((v) => v.is_default) ?? vs[0];
      setVer(cur?.id ?? "");
    } catch { setVersions([]); }
    finally { setLoading(false); }
  };

  const doRefresh = async () => {
    const v = versions.find((x) => x.id === ver);
    const bomCode = v?.bom_code ?? currentBomCode;
    if (!bomCode) { toast.error("สินค้านี้ยังไม่มีสูตร BOM"); return; }
    setBusy(true);
    try {
      const payload: Record<string, unknown> = { reexplode: true, preserve: true, bom_code: bomCode, bom_version: v?.version ?? currentBomVersion ?? null };
      if (sizeBreakdown && sizeBreakdown.length > 0) payload.size_breakdown = sizeBreakdown;
      const res = await apiFetch(`/api/mo/${moId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      toast.success(`อัพเดตวัตถุดิบตาม BOM แล้ว${v?.version ? ` (เวอร์ชัน ${v.version})` : ""}`);
      setOpen(false);
      await onDone?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "อัพเดตไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  return (
    <>
      <button type="button" onClick={() => void openDialog()}
        title="ดึงวัตถุดิบใหม่จากสูตร BOM (เลือกเวอร์ชันได้ + เก็บค่าที่กรอกของชิ้นเดิม)"
        className={className ?? "h-7 px-3 text-xs font-medium border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 whitespace-nowrap"}>{label}</button>

      <ERPModal open={open} onClose={() => !busy && setOpen(false)} size="sm" title="🔄 อัพเดตวัตถุดิบตาม BOM"
        footer={<>
          <button onClick={() => setOpen(false)} disabled={busy} className="h-9 px-4 text-sm border border-slate-200 rounded-lg disabled:opacity-50">ยกเลิก</button>
          <button onClick={() => void doRefresh()} disabled={busy || loading} className="h-9 px-4 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50">{busy ? "กำลังอัพเดต..." : "อัพเดตวัตถุดิบ"}</button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">ระบบจะดึงรายการวัตถุดิบใหม่จากสูตร BOM ที่เลือก (ใช้ตอนแก้สูตรให้ถูกต้องแล้วอยากให้ใบนี้ตามสูตรล่าสุด)</p>
          <label className="block">
            <span className="text-[11px] text-slate-500">เลือกเวอร์ชันสูตร (BOM)</span>
            <select value={ver} onChange={(e) => setVer(e.target.value)} disabled={loading}
              className="w-full h-9 mt-0.5 px-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50">
              {loading && <option value="">กำลังโหลด…</option>}
              {!loading && versions.length === 0 && <option value="">— ไม่มีสูตร —</option>}
              {versions.map((v) => (
                <option key={v.id} value={v.id}>{v.version ?? v.bom_code}{v.is_default ? " ★ มาตรฐาน" : ""}{v.bom_code === currentBomCode ? " (ใบนี้ใช้อยู่)" : ""}</option>
              ))}
            </select>
          </label>
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ✅ ค่าที่เคยกรอกของวัตถุดิบ <b>ชิ้นเดิมที่ยังอยู่ในสูตร</b> (จำนวนที่มี / เตรียมครบ / ตัดครบ / ขอซื้อ) จะถูกเก็บไว้ให้<br />
            ⚠️ วัตถุดิบที่ถูกเอาออกจากสูตรจะหายไป · ชิ้นใหม่จะเริ่มที่ค่าว่าง
          </div>
        </div>
      </ERPModal>
    </>
  );
}
