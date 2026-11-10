"use client";
/**
 * เลือกสินค้าในระบบที่ยังไม่ได้ลงร้านนี้ → ส่งต่อให้ตัวช่วยลงสินค้า (ปุ่ม "เพิ่มสินค้าขึ้นร้าน" หน้าสินค้าบนแพลตฟอร์ม)
 * ข้อมูล: GET /api/platform-catalog?view=notlisted (กฎเดียวกับแท็บ "ยังไม่ลง" ของมุมมองหน้าร้าน)
 * ลงจริง/ตรวจความพร้อม/แก้ที่ขาด = AddToPlatformWizard (ของกลางเดิม) — ตัวนี้แค่เลือก
 * ของกลางที่ใช้: ERPModal · MiniTable · HoverImage · state-views
 */
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { r2ImageUrl } from "@/lib/r2-image";
import { ERPModal } from "@/components/modal";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { ErrorState, LoadingState } from "@/components/state-views";
import type { ShopParent } from "@/lib/platform-listing-health";
import type { AddWizardParent } from "@/components/platform-listing/add-to-platform-wizard";

const MAX_PICK = 200;

export function NotListedPicker({ open, onClose, platformId, brandId, where, onPick }: {
  open: boolean;
  onClose: () => void;
  platformId: string;
  brandId: string;
  /** ชื่อร้าน · แบรนด์ (ไว้ในหัวป๊อป) */
  where: string;
  onPick: (parents: AddWizardParent[]) => void;
}) {
  const [rows, setRows] = useState<ShopParent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !platformId || !brandId) return;
    let alive = true;
    setRows(null); setErr(null); setSelected(new Set());
    apiFetch(`/api/platform-catalog?${new URLSearchParams({ view: "notlisted", platform_id: platformId, brand_id: brandId })}`).then((r) => r.json())
      .then((j: { parents?: ShopParent[]; error?: string | null }) => { if (!alive) return; if (j.error) setErr(j.error); else setRows(j.parents ?? []); })
      .catch(() => { if (alive) setErr("โหลดรายการสินค้าไม่สำเร็จ"); });
    return () => { alive = false; };
  }, [open, platformId, brandId, retry]);

  const cols: MiniColumn<ShopParent>[] = [
    {
      key: "p", header: "สินค้าในระบบ", width: "2.5fr", sortValue: (p) => p.code,
      cell: (p) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <HoverImage url={r2ImageUrl(p.cover_key, 160)} size={40} previewSize={280} rounded="rounded-md" fallback="—" />
          <div className="min-w-0">
            <div className="truncate" title={p.name ?? ""}>{p.name || p.code}</div>
            <div className="truncate font-mono text-[11px] text-slate-400">{p.code}</div>
          </div>
        </div>
      ),
    },
    { key: "img", header: "รูปปก", width: "6rem", align: "center", sortValue: (p) => (p.cover_key ? 1 : 0), cell: (p) => (p.cover_key ? <span className="text-xs text-slate-500">มี</span> : <span className="text-xs text-amber-700">ไม่มี</span>) },
  ];
  const picked = (rows ?? []).filter((p) => selected.has(p.id));
  const tooMany = picked.length > MAX_PICK;

  return (
    <ERPModal open={open} onClose={onClose} size="lg" title={`เพิ่มสินค้าขึ้นร้าน — ${where}`} storageKey="platform-not-listed-picker"
      description="เลือกสินค้าในระบบที่ยังไม่ได้ลงร้านนี้ แล้วกดถัดไป — ตัวช่วยจะตรวจความพร้อม (หมวด/รูป/ราคา) ให้แก้ที่ขาดก่อนลงจริง"
      footer={(
        <div className="flex w-full items-center gap-2">
          <span className="flex-1 text-xs text-slate-500">{tooMany ? <span className="text-rose-600">ลงได้ครั้งละไม่เกิน {MAX_PICK} รุ่น</span> : `เลือก ${picked.length.toLocaleString()} รุ่น`}</span>
          <button type="button" onClick={onClose} className="h-9 rounded-lg border border-slate-200 px-3 text-sm text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button type="button" disabled={picked.length === 0 || tooMany} onClick={() => onPick(picked.map((p) => ({ id: p.id, code: p.code, name: p.name })))}
            className="h-9 rounded-lg bg-violet-600 px-3 text-sm text-white hover:bg-violet-700 disabled:opacity-40">ถัดไป — ตรวจความพร้อม ({picked.length.toLocaleString()})</button>
        </div>
      )}>
      {err ? <ErrorState title={err} onRetry={() => setRetry((n) => n + 1)} />
        : !rows ? <LoadingState label="กำลังหาสินค้าที่ยังไม่ได้ลง…" />
        : (
          <MiniTable rows={rows} columns={cols} rowKey={(p) => p.id} selectable selected={selected} onSelectedChange={setSelected}
            searchText={(p) => `${p.code} ${p.name ?? ""}`} searchPlaceholder="ค้นรหัส / ชื่อสินค้า" dense
            emptyText="สินค้าของแบรนด์นี้ลงร้านนี้ครบแล้ว" />
        )}
    </ERPModal>
  );
}
