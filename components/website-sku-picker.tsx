"use client";

/**
 * WebsiteSkuPicker — เลือก "SKU บนเว็บร้านนี้" ทีละตัว (รุ่น + สี) · เก็บเป็น "CODE:sku-xxxxxxxx"[] (ไม่มีสี = "CODE")
 *
 * ใช้ใน Section "ตารางสินค้า / คอลเลกชัน" แหล่ง "เลือก SKU เองทีละตัว" (schema field type = skus) → 1 การ์ด / SKU
 * ดึงจาก /api/public/storefront/products?shop= (ชุดเดียวกับที่เว็บร้านเห็น: สินค้าที่เผยแพร่ + ตัวเลือกสีพร้อมรูป)
 * หน้าตา/การใช้งานเหมือน WebsiteProductPicker: ป๊อปกลาง WebsitePickModal (☰ ตาราง / ▦ การ์ด · เรียงเลือกล่าสุดก่อน) · ลาก ⠿ เรียง · ✕ เอาออก
 * เว็บร้านแปลงรหัสเป็นการ์ดที่ src/lib/sku-cards.ts (pickSkuCards)
 */
import { useEffect, useMemo, useState } from "react";
import { WebsitePickModal, rememberWebPicks } from "@/components/website-pick-modal";
import { RECENT_KEYS } from "@/lib/recent-picks";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import { loadStorefrontProducts } from "@/lib/website-data";
import { useT } from "@/components/i18n";

type WebOption = { id: string; label: string; image?: string | null; images?: string[] };
/** API สาธารณะส่งตัวเลือกสีเป็น { label, items } (เว็บร้านแปลงเป็น options[] เอง) */
type WebProduct = { code?: string; slug: string; name: string; images?: string[]; options?: { label?: string; items?: WebOption[] } | WebOption[] | null; category?: string; categories?: string[] };
export type SkuRow = { ref: string; code: string; name: string; color: string; image: string | null; cat: string };

/** SKU ที่เผยแพร่ของร้าน — แคชต่อร้านที่ตัวดึงกลาง lib/website-data (โหลดใหม่เมื่อเปิดป๊อปเลือก) */
export function loadSkus(shopSlug: string, fresh = false): Promise<SkuRow[]> {
  return loadStorefrontProducts<WebProduct>(shopSlug, fresh)
    .then((j) =>
      (j.products ?? []).flatMap((p): SkuRow[] => {
        const code = String(p.code ?? p.slug).toUpperCase();
        // รหัสหมวด (ไว้ค้นหา เช่น พิมพ์ crossbody)
        const cat = [p.category, ...(p.categories ?? [])].filter(Boolean).join(" ");
        const opts = Array.isArray(p.options) ? p.options : p.options?.items ?? [];
        if (!opts.length) return [{ ref: code, code, name: p.name, color: "", image: p.images?.[0] ?? null, cat }];
        return opts.map((o) => ({ ref: `${code}:${o.id}`, code, name: p.name, color: o.label, image: o.images?.[0] ?? o.image ?? p.images?.[0] ?? null, cat }));
      })
    )
    .catch(() => []);
}

export function WebsiteSkuPicker({ shopSlug, value, max = 24, onChange }: { shopSlug: string; value: string[]; max?: number; onChange: (refs: string[]) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<SkuRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set(value));

  // โหลดตั้งแต่แรก (โชว์รูป/ชื่อในรายการที่เลือก) · เปิดป๊อป = โหลดใหม่ (เผื่อเพิ่งเพิ่มสินค้า)
  useEffect(() => {
    let alive = true;
    if (open) {
      setSel(new Set(value));
      setLoading(true);
    }
    loadSkus(shopSlug, open)
      .then((r) => alive && setRows(r))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, shopSlug]);

  const byRef = useMemo(() => new Map(rows.map((r) => [r.ref, r])), [rows]);
  const { rowProps, handleProps, rowCls } = useDragReorder((from, to) => onChange(moveItem(value, from, to)));
  const thumb = (u: string | null, cls: string) =>
    u ? (
      /* eslint-disable-next-line @next/next/no-img-element */
      <img src={u} alt="" className={`${cls} rounded object-cover bg-slate-100 shrink-0`} />
    ) : (
      <span className={`${cls} rounded bg-slate-100 shrink-0 inline-block`} />
    );

  const confirm = () => {
    // คงลำดับเดิมของตัวที่เลือกไว้แล้ว + ต่อท้ายตัวใหม่ตามลำดับในตาราง
    const keep = value.filter((c) => sel.has(c));
    const added = rows.map((r) => r.ref).filter((c) => sel.has(c) && !keep.includes(c));
    onChange([...keep, ...added].slice(0, max));
    rememberWebPicks(RECENT_KEYS.webSkus, [...added, ...keep]); // ตัวที่เพิ่งเพิ่ม = ล่าสุด
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-xs text-slate-400">{t("ยังไม่ได้เลือก SKU", "No SKUs selected")}</p>
      ) : (
        <ul className="space-y-1">
          {value.map((ref, i) => {
            const r = byRef.get(ref);
            return (
              <li key={ref} {...rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-1.5 py-1 ${rowCls(i)}`}>
                <DragHandle {...handleProps(i)} title={t("ลากเพื่อเรียงลำดับ", "Drag to reorder")} />
                <span className="text-[10px] text-slate-400 tabular-nums w-3 text-right">{i + 1}</span>
                {thumb(r?.image ?? null, "w-8 h-8")}
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] text-slate-700">
                    <span className="font-mono">{r?.code ?? ref.split(":")[0]}</span>
                    {r?.color && <span className="font-medium"> · {r.color}</span>}
                  </span>
                  <span className={`block text-[10px] truncate ${r ? "text-slate-400" : "text-amber-600"}`}>{r ? r.name : rows.length ? t("ไม่อยู่บนเว็บแล้ว", "No longer on the web") : ""}</span>
                </span>
                <button type="button" onClick={() => onChange(value.filter((c) => c !== ref))} className="text-slate-400 hover:text-red-500 px-1.5" title={t("เอาออก", "Remove")}>
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" onClick={() => setOpen(true)} className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-700 hover:border-slate-500">
        {t(`🎨 เลือก SKU (${value.length}/${max})`, `🎨 Pick SKUs (${value.length}/${max})`)}
      </button>

      {open && (
        <WebsitePickModal<SkuRow>
          open
          onClose={() => setOpen(false)}
          title={t("เลือก SKU ที่จะแสดง (1 การ์ด / SKU)", "Pick SKUs to show (1 card / SKU)")}
          unit="SKU"
          max={max}
          rows={rows}
          rowKey={(r) => r.ref}
          loading={loading}
          loadingText={t("กำลังโหลด SKU บนเว็บ…", "Loading web SKUs…")}
          selected={sel}
          onSelectedChange={setSel}
          chosen={value}
          recentKey={RECENT_KEYS.webSkus}
          onConfirm={confirm}
          searchText={(r) => `${r.code} ${r.name} ${r.color} ${r.cat}`}
          searchPlaceholder={t("ค้นหารหัส/ชื่อ/สี", "Search code / name / color")}
          emptyText={t('ยังไม่มีสินค้าที่เผยแพร่บนเว็บ — เพิ่มได้ที่แท็บ "สินค้าบนเว็บ"', 'No products published on the web yet — add them in the "Web products" tab')}
          card={(r) => ({ image: r.image, code: r.code, sub: r.color || undefined, title: r.name })}
          note={
            byRef.size > 0 && value.some((c) => !byRef.has(c)) ? (
              <p className="mt-2 text-[11px] text-amber-600">{t("บาง SKU ที่เลือกไว้ไม่อยู่บนเว็บแล้ว (ถูกปิดเผยแพร่/ลบสี) — จะไม่แสดงบนเว็บ", "Some selected SKUs are no longer on the web (unpublished / color removed) — they won't be shown")}</p>
            ) : null
          }
          columns={[
            { key: "img", header: "", width: "3rem", cell: (r) => thumb(r.image, "w-9 h-9") },
            { key: "code", header: t("รหัสรุ่น", "Model code"), width: "7rem", cell: (r) => <span className="font-mono text-xs">{r.code}</span>, sortValue: (r) => r.code },
            { key: "color", header: t("สี / แบบ", "Color / style"), width: "8rem", cell: (r) => <span className="text-sm font-medium">{r.color || <span className="text-slate-400 font-normal">{t("— ไม่มีสี —", "— no color —")}</span>}</span>, sortValue: (r) => r.color },
            { key: "name", header: t("ชื่อบนเว็บ", "Web name"), width: "1fr", cell: (r) => <span className="text-sm line-clamp-2">{r.name}</span>, sortValue: (r) => r.name },
          ]}
        />
      )}
    </div>
  );
}
