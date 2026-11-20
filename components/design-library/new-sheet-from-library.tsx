"use client";
/**
 * 📚 Design Library — "เพิ่มงานจาก Design Library" (เปิดจากปุ่ม ＋ เพิ่มงาน ของ Design Dashboard · เจ้าของขอ 2026-11-16)
 * ขั้น 1: เลือกสูตร (ทุกแม่แบบ · ค้นหาได้ · บอกว่าสูตรไหนส่งเป็นใบงานแล้ว กันส่งซ้ำ)
 * ขั้น 2: ป๊อป "ส่งเป็นใบงาน" ตัวเดิมของ Design Library (SendToSheetModal) — ไม่มีตัวสร้างใบงานตัวที่ 2
 * ข้อมูล: GET /api/design-library/bundle?picker=1 · สิทธิ์ใช้ = design_library.edit + products.edit (เหมือนปุ่มในหน้าสูตร)
 */
import { useEffect, useMemo, useState } from "react";
import { ERPModal } from "@/components/modal";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { Icon } from "@/components/icon";
import { CardZoom } from "@/components/gallery-columns";
import { usePermission } from "@/components/auth";
import { SendToSheetModal, type LinkedSheet } from "./send-to-sheet";
import { api, img, LIB_HREF } from "./shared";

type PickerRecipe = {
  id: string; seq: number; name: string | null; updated_at: string;
  template: { id: string; code: string; name: string; image_key: string | null; category: string | null };
  cover_key: string | null; pin_count: number; colorway_count: number; render_count: number;
  sheet: LinkedSheet | null;
};

const recipeLabel = (r: PickerRecipe) => `${r.template.name} · ${r.name?.trim() || `สูตร #${r.seq}`}`;

/** ใครกดใช้ได้ (ไว้ซ่อนเมนู "จาก Design Library") */
export function useCanSheetFromLibrary(): boolean {
  const a = usePermission("design_library.edit");
  const b = usePermission("products.edit");
  return a && b;
}

export function NewSheetFromLibraryModal({ open, onClose, defaultBrandId, onCreated }: {
  open: boolean; onClose: () => void;
  /** แบรนด์ที่กรองอยู่บนหน้า → ใส่ให้ใบใหม่ */
  defaultBrandId?: string | null;
  /** สร้าง/ส่งเสร็จ → หน้าแม่รีเฟรช + เปิดใบงานนั้น */
  onCreated: (sheet: LinkedSheet) => void;
}) {
  const canCost = usePermission("products.cost.view");
  const [rows, setRows] = useState<PickerRecipe[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<PickerRecipe | null>(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setErr(null); setRows(null);
    try { setRows(await api<PickerRecipe[]>("/api/design-library/bundle?picker=1")); } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => {
    if (!open) return;
    setQ(""); setPicked(null); setSending(false);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (rows ?? []).filter((r) => !s || `${r.template.code} ${r.template.name} ${r.name ?? ""} ${r.seq} ${r.sheet?.code ?? ""}`.toLowerCase().includes(s));
  }, [rows, q]);

  return (
    <>
      <ERPModal open={open && !sending} onClose={onClose} title="เพิ่มงานจาก Design Library" description="เลือกสูตร แล้วสร้างเป็นใบงานออกแบบ (รูป GPT · หน้ารูป+หมุด · ตารางสี · ตีราคา)"
        size="lg" defaultExpanded={false} storageKey="dd-new-from-library"
        footer={<div className="flex w-full items-center justify-between gap-2">
          <a href={LIB_HREF} className="text-sm text-indigo-600 hover:underline inline-flex items-center gap-1"><Icon value="i:external-link" />ไปที่ Design Library</a>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-9 px-3 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50">ยกเลิก</button>
            <button type="button" disabled={!picked} onClick={() => setSending(true)} className="h-9 px-4 text-sm rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40">ถัดไป</button>
          </div>
        </div>}>
        <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 h-10 mb-3 bg-white focus-within:ring-2 focus-within:ring-indigo-500">
          <Icon value="i:search" className="text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหา รหัสแม่แบบ / ชื่อสูตร / เลขใบงาน" className="flex-1 h-full text-sm outline-none bg-transparent" autoFocus />
        </div>
        {err ? <ErrorState title="โหลดสูตรไม่สำเร็จ" hint={err} onRetry={() => void load()} />
          : !rows ? <LoadingState label="กำลังโหลดสูตร…" />
          : shown.length === 0 ? (
            <EmptyState icon={<Icon value="i:shopping-bag" />} title={rows.length ? "ไม่พบสูตรที่ตรงกับคำค้น" : "ยังไม่มีสูตรใน Design Library"}
              hint={rows.length ? "ลองเปลี่ยนคำค้น" : "สร้างสูตรจากแม่แบบใน Design Library ก่อน แล้วกลับมาเพิ่มงานที่นี่"} />
          ) : (
<CardZoom scope="design-library-pick-recipe" initial={6} gap="0.5rem" minPx={160}>{(z) => (
          <div className="grid gap-2" style={{ gridTemplateColumns: z.template }}>
              {shown.map((r) => {
                const on = picked?.id === r.id;
                const cover = r.cover_key ?? r.template.image_key;
                return (
                  <button key={r.id} type="button" onClick={() => setPicked(r)} onDoubleClick={() => { setPicked(r); setSending(true); }} aria-pressed={on}
                    className={`text-left rounded-xl border bg-white overflow-hidden flex flex-col transition ${on ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-indigo-300"}`}>
                    <div className="aspect-[5/4] flex items-center justify-center overflow-hidden border-b border-slate-100 bg-white">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {cover ? <img src={img(cover, 360)} alt="" loading="lazy" className="w-full h-full object-contain" /> : <Icon value="i:photo" className="text-2xl text-slate-300" />}
                    </div>
                    <div className="p-2">
                      <div className="text-[11px] font-mono text-slate-400">{r.template.code}</div>
                      <div className="text-[13px] font-medium text-slate-800 line-clamp-2">{recipeLabel(r)}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{r.pin_count} จุด{r.colorway_count > 1 ? ` · ${r.colorway_count} ชุดสี` : ""}{r.render_count ? ` · รูป ${r.render_count}` : ""}</div>
                      {r.sheet
                        ? <div className="mt-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 truncate" title={`ส่งเป็นใบงาน ${r.sheet.code} แล้ว — เลือกต่อ = ส่งเข้าใบเดิมหรือสร้างใบใหม่ได้`}>ส่งแล้ว → {r.sheet.code}</div>
                        : <div className="mt-1 text-[11px] text-slate-400">ยังไม่เคยส่งเป็นใบงาน</div>}
                    </div>
                  </button>
                );
              })}
            </div>
            )}</CardZoom>
          )}
      </ERPModal>
      {picked && (
        <SendToSheetModal open={open && sending} onClose={() => setSending(false)} recipeId={picked.id}
          defaultName={recipeLabel(picked)} linked={picked.sheet} defaultBrandId={defaultBrandId}
          colorwayId={null} colorwayName={picked.colorway_count > 1 ? "สีหลัก" : null} colorwayCount={picked.colorway_count}
          renderCount={picked.render_count} canCost={canCost}
          onSent={(s) => { onClose(); onCreated(s); }} />
      )}
    </>
  );
}
