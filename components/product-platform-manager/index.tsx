"use client";

// ============================================================
// ProductPlatformManager (ของกลาง) — ศูนย์เตรียมลงขายหลายแพลตฟอร์ม (เฟส 1a, MVP ในบ้าน)
// เปิดต่อ Parent SKU · sub-tab ตาม erp_platforms (ไม่ hardcode) · ร่างต่อแพลตฟอร์ม +
// ตาราง SKU/variant จริง (MiniTable) + รูป (HoverImage, ย่อผ่าน /api/r2-image) + checklist
// ยังไม่ publish จริง (เฟส 2 — ต่อ API/queue) · มี toast ในตัว (droppable ทุกที่)
// ============================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { ERPInput, ERPTextarea } from "@/components/form";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { r2ImageUrl } from "@/lib/r2-image";
import { apiFetch } from "@/lib/api";

type Platform = { id: string; code: string; name_th: string; icon_key: string | null; theme_color: string | null };
type Draft = { title?: string | null; description?: string | null; category_path?: string | null; status?: string | null };
type Variant = { id: string; code: string; name: string; color: string | null; price: number | null; image_key: string | null; is_active: boolean; has_price: boolean; has_image: boolean };
type Toast = { id: number; type: "success" | "error" | "info"; msg: string };

const PLATFORM_ICON: Record<string, string> = { shopee: "🛍️", lazada: "🛒", tiktok: "🎵", tiktok_shop: "🎵", website: "🌐", instagram: "📸", facebook: "👍", line_oa: "💬", youtube: "▶️", pinterest: "📌", x: "✖️" };

export function ProductPlatformManager({ parentSkuId, onClose, canEdit = true }: {
  parentSkuId: string; onClose: () => void; canEdit?: boolean;
}) {
  const { width, startResize } = useDrawerResize("platformMgrWidth", 780);
  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<{ code: string; name_th: string; description: string } | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [variants, setVariants] = useState<Variant[]>([]);
  const [active, setActive] = useState<string>("");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toast = useCallback((type: Toast["type"], msg: string) => {
    const id = Math.floor(performance.now()) + Math.floor(performance.now() % 1000);
    setToasts((q) => [...q, { id, type, msg }]);
    setTimeout(() => setToasts((q) => q.filter((t) => t.id !== id)), 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(parentSkuId)}`).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      setParent(j.parent ? { code: String(j.parent.code ?? ""), name_th: String(j.parent.name_th ?? ""), description: String(j.parent.description ?? "") } : null);
      const pfs = (j.platforms ?? []) as Platform[];
      setPlatforms(pfs);
      setDrafts((j.drafts ?? {}) as Record<string, Draft>);
      setVariants((j.variants ?? []) as Variant[]);
      setActive((prev) => prev || (pfs[0]?.id ?? ""));
    } catch (e) { toast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [parentSkuId, toast]);
  useEffect(() => { load(); }, [load]);

  const activeDraft = drafts[active] ?? {};
  const title = activeDraft.title ?? "";
  const description = activeDraft.description ?? "";

  const saveField = async (field: keyof Draft, value: string) => {
    const cur = (drafts[active]?.[field] ?? "") as string;
    if ((value || "") === (cur || "")) return;
    setDrafts((d) => ({ ...d, [active]: { ...d[active], [field]: value || null } }));
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active, [field]: value }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", "เซฟร่างแล้ว");
    } catch (e) { toast("error", (e as Error).message); }
  };

  const checks = useMemo(() => {
    const allHavePrice = variants.length > 0 && variants.every((v) => v.has_price);
    const allHaveImage = variants.length > 0 && variants.every((v) => v.has_image);
    return [
      { ok: !!title.trim(), label: "มีชื่อสินค้าบนแพลตฟอร์มนี้" },
      { ok: !!description.trim(), label: "มีรายละเอียดสินค้า" },
      { ok: variants.length > 0, label: "มี SKU/สี อย่างน้อย 1 รายการ" },
      { ok: allHavePrice, label: "SKU ทุกตัวมีราคา" },
      { ok: allHaveImage, label: "SKU ทุกตัวมีรูป" },
      { ok: !!activeDraft.category_path?.trim(), label: "เลือกหมวดหมู่ปลายทาง (เฟส 2)" },
    ];
  }, [title, description, variants, activeDraft.category_path]);
  const ready = checks.slice(0, 5).every((c) => c.ok);

  const cols: MiniColumn<Variant>[] = useMemo(() => [
    { key: "img", header: "รูป", width: "3rem", cell: (v) => <HoverImage url={r2ImageUrl(v.image_key)} size={32} /> },
    { key: "code", header: "SKU", width: "1.3fr", sortValue: (v) => v.code, cell: (v) => <span className="font-mono text-xs">{v.code}</span> },
    { key: "color", header: "สี", width: "1fr", cell: (v) => v.color || "—" },
    { key: "price", header: "ราคา", width: "0.8fr", align: "right", sortValue: (v) => v.price ?? -1, cell: (v) => v.has_price ? <span className="tabular-nums">{v.price!.toLocaleString()}฿</span> : <span className="text-rose-500 text-xs">ไม่มี</span> },
    { key: "ready", header: "พร้อม", width: "4.5rem", align: "center", cell: (v) => (v.has_price && v.has_image && v.is_active) ? <span className="text-emerald-600">✓</span> : <span className="text-rose-500" title={[!v.has_price && "ไม่มีราคา", !v.has_image && "ไม่มีรูป", !v.is_active && "ปิดอยู่"].filter(Boolean).join(", ")}>✗</span> },
  ], []);

  const activePf = platforms.find((p) => p.id === active);
  const iconOf = (p: Platform) => p.icon_key || PLATFORM_ICON[p.code] || "🏬";

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div style={{ width }} className="fixed right-0 top-0 h-full max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div onMouseDown={startResize} title="ลากเพื่อปรับความกว้าง" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-violet-400/40 z-[60]" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">🏬 ลงขายหลายแพลตฟอร์ม</h3>
            {parent && <p className="text-xs text-slate-500 truncate"><span className="font-mono">{parent.code}</span> · {parent.name_th}</p>}
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>

        {loading ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด...</div> : (
          <>
            <div className="flex gap-1 px-4 pt-3 overflow-x-auto shrink-0 border-b border-slate-100">
              {platforms.map((p) => (
                <button key={p.id} onClick={() => setActive(p.id)} className={`shrink-0 px-3 py-1.5 text-sm rounded-t-lg border-b-2 transition-colors ${active === p.id ? "border-violet-500 text-violet-700 font-medium" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                  {iconOf(p)} {p.name_th}
                </button>
              ))}
              {platforms.length === 0 && <p className="text-sm text-slate-400 py-2">ยังไม่มีแพลตฟอร์มที่เปิดใช้ — เพิ่มที่ตั้งค่า</p>}
            </div>

            {activePf && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ready ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>{ready ? "✓ พร้อมลงขาย" : "⚠ ข้อมูลยังไม่ครบ"}</span>
                  <span className="text-xs text-slate-400">ร่างสำหรับ {activePf.name_th}</span>
                </div>

                <div className="space-y-2">
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1">ชื่อสินค้าบน {activePf.name_th}</p>
                    <ERPInput key={`t-${active}`} defaultValue={title} placeholder={parent?.name_th ?? "ชื่อสินค้า"} disabled={!canEdit} onBlur={(e) => saveField("title", e.target.value)} />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 mb-1">รายละเอียดสินค้า</p>
                    <ERPTextarea key={`d-${active}`} defaultValue={description} rows={4} placeholder="รายละเอียดเฉพาะแพลตฟอร์มนี้..." disabled={!canEdit} onBlur={(e) => saveField("description", e.target.value)} />
                  </div>
                </div>

                <div>
                  <p className="text-[11px] text-slate-400 mb-1">SKU / สี ที่จะส่งไป {activePf.name_th} ({variants.length})</p>
                  <MiniTable rows={variants} columns={cols} rowKey={(v) => v.id} searchText={(v) => `${v.code} ${v.color ?? ""}`} dense emptyText="ยังไม่มี SKU ลูก — เพิ่มที่หน้าสินค้า" />
                </div>

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">ตรวจความพร้อมก่อนลงขาย</p>
                  <ul className="space-y-1">
                    {checks.map((c, i) => (
                      <li key={i} className={`text-xs flex items-center gap-2 ${c.ok ? "text-slate-600" : "text-rose-600"}`}><span>{c.ok ? "✓" : "✗"}</span>{c.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] text-slate-400">เซฟร่างอัตโนมัติเมื่อพิมพ์เสร็จ · publish จริงเฟส 2 (ต่อ API)</span>
              <button disabled title="เฟส 2 — กำลังต่อ API แพลตฟอร์ม" className="h-9 px-4 text-sm font-medium text-white bg-slate-300 rounded-lg cursor-not-allowed shrink-0">📤 ลงขาย (เร็ว ๆ นี้)</button>
            </div>
          </>
        )}

        {/* toast ในตัว */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-1.5 items-center">
          {toasts.map((t) => (
            <div key={t.id} className={`px-3 py-1.5 rounded-lg text-xs font-medium shadow-lg ${t.type === "error" ? "bg-rose-600 text-white" : t.type === "success" ? "bg-emerald-600 text-white" : "bg-slate-800 text-white"}`}>{t.msg}</div>
          ))}
        </div>
      </div>
    </>
  );
}
