"use client";
// แผงข้างของกระดานแคมเปญ: รายละเอียดการ์ดไฟล์ / SKU · สรุปการ์ด · เมนูเครื่องมือ — แยกจาก page.tsx (Y1)
import { useEffect, useRef, useState } from "react";
import { useT } from "@/components/i18n";
import { DrawerShell } from "@/components/modal";
import { FloatingDropdown } from "@/components/floating-dropdown";
import { withImageWidth } from "@/lib/r2-image";
import { type ToastVariant } from "@/components/toast";

// ── ปุ่มกลุ่มเครื่องมือบนแถบกระดาน (dropdown) ───────────────────────────────
// เดิมปุ่มเรียงยาว 14 ปุ่มจนแถบรก → รวมตามประเภทเป็นเมนู กดแล้วกางรายการ
export const TOOL_TONE: Record<string, string> = {
  violet: "text-violet-700 border-violet-200 hover:bg-violet-50",
  teal: "text-teal-700 border-teal-200 hover:bg-teal-50",
  slate: "text-slate-600 border-slate-200 hover:bg-slate-50",
};

export function ToolMenu({ label, icon, tone = "slate", items }: {
  label: string; icon: string; tone?: "violet" | "teal" | "slate";
  items: { icon: string; label: string; hint?: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // ปิดด้วย Esc (คลิกนอก FloatingDropdown จัดการให้แล้ว)
  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open]);
  return (
    <div className="relative" ref={boxRef}>
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className={`h-9 px-3 inline-flex items-center gap-1 text-sm font-medium border rounded-lg ${TOOL_TONE[tone]} ${open ? "bg-white ring-2 ring-violet-200" : ""}`}>
        <span>{icon}</span>{label}<span className="text-[10px] text-slate-400">▾</span>
      </button>
      {/* ของกลาง FloatingDropdown: portal ไป body + position:fixed → ไม่จมใต้กระดาน/แถบเครื่องมือ Excalidraw
          (ของเดิมเป็น absolute z-40 เลยโดนแถบกระดานทับ) */}
      <FloatingDropdown anchorRef={boxRef} open={open} onClose={() => setOpen(false)} minWidth={256} maxWidth={320}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-2xl">
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-slate-50">
              <span className="w-5 shrink-0 text-center text-base leading-5">{it.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-700">{it.label}</span>
                {it.hint && <span className="block text-[11px] leading-tight text-slate-400">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      </FloatingDropdown>
    </div>
  );
}

// Drawer รูปจากคลัง (snapshot บนการ์ด): รูปใหญ่ + ข้อมูล + คัดลอก location / เปิดลิงก์
export function AssetCardDrawer({ data, onClose, pushToast }: { data: Record<string, unknown>; onClose: () => void; pushToast: (type: ToastVariant, m: string) => void }) {
  const t = useT();
  const title = String(data.title ?? "");
  const url = data.url ? String(data.url) : null;
  const masterPath = data.master_path ? String(data.master_path) : null;
  const masterUrl = data.master_url ? String(data.master_url) : null;
  const tags = Array.isArray(data.tags) ? (data.tags as string[]) : [];
  const w = data.width != null ? Number(data.width) : null;
  const h = data.height != null ? Number(data.height) : null;
  const desc = data.description ? String(data.description) : null;
  const copyPath = () => { if (!masterPath) return; navigator.clipboard?.writeText(masterPath).catch(() => {}); pushToast("info", t("คัดลอกที่อยู่ไฟล์แล้ว", "Path copied")); };
  return (
    <>
      <DrawerShell onClose={onClose} className="w-[420px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <h3 className="text-base font-semibold text-slate-900 truncate">🖼️ {t("รูปจากคลัง", "Library image")}</h3>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={withImageWidth(url, 800) ?? url} alt={title} className="w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
            : <div className="w-full h-40 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-sm">{t("ไม่มีรูป", "No image")}</div>}
          <div><p className="text-xs text-slate-400 mb-0.5">{t("ชื่อไฟล์", "Name")}</p><p className="text-base font-medium text-slate-800">{title || "—"}</p></div>
          {w && h ? <div><p className="text-xs text-slate-400 mb-0.5">{t("ขนาด", "Dimensions")}</p><p className="text-sm text-slate-700">{w}×{h}</p></div> : null}
          {tags.length > 0 && <div><p className="text-xs text-slate-400 mb-1">{t("แท็ก", "Tags")}</p><div className="flex flex-wrap gap-1">{tags.map((tg) => <span key={tg} className="text-xs bg-pink-50 text-pink-700 rounded-full px-2 py-0.5">{tg}</span>)}</div></div>}
          {desc && <div><p className="text-xs text-slate-400 mb-0.5">{t("คำอธิบาย", "Description")}</p><p className="text-sm text-slate-700 whitespace-pre-wrap">{desc}</p></div>}
          {masterPath && <div><p className="text-xs text-slate-400 mb-0.5">📍 {t("ที่เก็บต้นฉบับ (location)", "Source location")}</p><p className="text-xs font-mono text-slate-600 break-all">{masterPath}</p><button onClick={copyPath} className="mt-1.5 h-8 px-3 text-xs text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50">📋 {t("คัดลอกที่อยู่", "Copy path")}</button></div>}
          {masterUrl && <a href={masterUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-pink-700 underline hover:text-pink-900">🔗 {t("เปิดไฟล์ต้นฉบับ", "Open source file")}</a>}
          {url && <a href={url} target="_blank" rel="noopener noreferrer" className="block text-sm text-slate-500 underline hover:text-slate-700">{t("เปิดรูปเต็มในแท็บใหม่", "Open full image in new tab")}</a>}
          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">* {t("ข้อมูลนี้เป็น snapshot ณ ตอนวางการ์ดบนกระดาน", "This data is a snapshot from when the card was placed")}</p>
        </div>
      </DrawerShell>
    </>
  );
}

// Drawer รายละเอียดสินค้า (จาก snapshot บนการ์ด -- เปิดได้แม้รีเฟรช)
export function SkuDrawer({ data, onClose }: { data: Record<string, unknown>; onClose: () => void }) {
  const t = useT();
  const code = String(data.code ?? "");
  const name = String(data.name ?? "");
  const color = data.color ? String(data.color) : null;
  const price = data.price != null ? Number(data.price) : null;
  const img = data.image_url ? String(data.image_url) : null;
  return (
    <>
      <DrawerShell onClose={onClose} className="w-[420px]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">📦 {t("รายละเอียดสินค้า", "Product Details")}</h3>
            <span className="font-mono text-xs text-slate-500">{code}</span>
          </div>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {img
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={img} alt={name} className="w-full rounded-xl border border-slate-200 object-contain bg-slate-50" />
            : <div className="w-full h-40 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-slate-300 text-sm">{t("ไม่มีรูปสินค้า", "No product image")}</div>}
          <div>
            <p className="text-xs text-slate-400 mb-0.5">{t("ชื่อสินค้า", "Product name")}</p>
            <p className="text-base font-medium text-slate-800">{name || "—"}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div><p className="text-xs text-slate-400 mb-0.5">{t("สี", "Color")}</p><p className="font-medium text-slate-800">{color || "—"}</p></div>
            <div><p className="text-xs text-slate-400 mb-0.5">{t("ราคา", "Price")}</p><p className="font-medium text-slate-800">{price != null ? `${price.toLocaleString()}฿` : "--"}</p></div>
          </div>
          <p className="text-[11px] text-slate-400 border-t border-slate-100 pt-3">* {t("ข้อมูลนี้เป็น snapshot ณ ตอนวางการ์ดบนกระดาน", "This data is a snapshot from when the card was placed on the board")}</p>
        </div>
      </DrawerShell>
    </>
  );
}

// สรุปการ์ดบนกระดาน (Task / SKU) + กดเปิด
export function CardsSummary({ cards, onOpen }: { cards: { kind: string; data: Record<string, unknown> }[]; onOpen: (c: { kind: string; data: Record<string, unknown> }) => void }) {
  const t = useT();
  const tasks = cards.filter((c) => c.kind === "task");
  const skus = cards.filter((c) => c.kind === "sku");
  const parentSkus = cards.filter((c) => c.kind === "parent_sku");
  const mktSkus = cards.filter((c) => c.kind === "marketing_sku");
  const contents = cards.filter((c) => c.kind === "content");
  const folders = cards.filter((c) => c.kind === "folder");
  const assets = cards.filter((c) => c.kind === "asset");
  const designSheets = cards.filter((c) => c.kind === "design_sheet");
  if (cards.length === 0) return <p className="text-sm text-slate-400 text-center py-6">{t("ยังไม่มีการ์ดบนกระดาน — กด ✅ Task / 📦 SKU / 📱 Content / 📁 โฟลเดอร์ เพื่อเพิ่ม", "No cards on the board yet — click ✅ Task / 📦 SKU / 📱 Content / 📁 Folder to add")}</p>;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">✅ {t("การ์ดงาน", "Task cards")} ({tasks.length})</p>
        {tasks.length === 0 ? <p className="text-sm text-slate-400 italic">--</p> : (
          <div className="space-y-1.5">
            {tasks.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-violet-300 hover:bg-violet-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.title ?? t("งาน", "Task"))}</span>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{String(c.data.task_no ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {mktSkus.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">🎯 {t("การ์ด SKU การตลาด", "Marketing SKU cards")} ({mktSkus.length})</p>
          <div className="space-y-1.5">
            {mktSkus.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-orange-300 hover:bg-orange-50/40 text-left">
                <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{String(c.data.code ?? "")}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.name ?? "")}</span>
                {c.data.label ? <span className="text-[10px] text-orange-700 bg-orange-50 rounded px-1.5 py-0.5 shrink-0">{String(c.data.label)}</span> : null}
                <span className="text-[10px] text-slate-400 shrink-0">🎨 {String(c.data.sku_active ?? "")}/{String(c.data.sku_total ?? "")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {parentSkus.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">🧬 {t("การ์ด Parent SKU", "Parent SKU cards")} ({parentSkus.length})</p>
          <div className="space-y-1.5">
            {parentSkus.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-teal-300 hover:bg-teal-50/40 text-left">
                <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{String(c.data.code ?? "")}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.name ?? "")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📦 {t("การ์ดสินค้า", "Product cards")} ({skus.length})</p>
        {skus.length === 0 ? <p className="text-sm text-slate-400 italic">--</p> : (
          <div className="space-y-1.5">
            {skus.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-violet-300 hover:bg-violet-50/40 text-left">
                <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{String(c.data.code ?? "")}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.name ?? "")}</span>
                {c.data.price != null && <span className="text-xs text-slate-400 shrink-0">{Number(c.data.price).toLocaleString()}฿</span>}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📱 {t("การ์ดคอนเทนต์", "Content cards")} ({contents.length})</p>
        {contents.length === 0 ? <p className="text-sm text-slate-400 italic">--</p> : (
          <div className="space-y-1.5">
            {contents.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-amber-300 hover:bg-amber-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.title ?? t("คอนเทนต์", "Content"))}</span>
                <span className="font-mono text-[11px] text-slate-400 shrink-0">{String(c.data.content_no ?? "")}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {designSheets.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📐 {t("การ์ดใบงานออกแบบ", "Design sheet cards")} ({designSheets.length})</p>
          <div className="space-y-1.5">
            {designSheets.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-indigo-300 hover:bg-indigo-50/40 text-left">
                <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 shrink-0">{String(c.data.code ?? "")}</span>
                <span className="text-sm text-slate-700 flex-1 truncate">{String(c.data.name ?? "")}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{String(c.data.brand_name ?? "")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {assets.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">🖼️ {t("การ์ดรูปจากคลัง", "Library image cards")} ({assets.length})</p>
          <div className="space-y-1.5">
            {assets.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-pink-300 hover:bg-pink-50/40 text-left">
                <span className="text-sm text-slate-700 flex-1 truncate">🖼️ {String(c.data.title ?? t("รูป", "Image"))}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {folders.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">📁 {t("การ์ดโฟลเดอร์", "Folder cards")} ({folders.length})</p>
          <div className="space-y-1.5">
            {folders.map((c, i) => (
              <button key={i} onClick={() => onOpen(c)} title={t("คัดลอก path", "Copy path")} className="w-full flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 hover:border-cyan-300 hover:bg-cyan-50/40 text-left">
                <span className="text-sm text-slate-700 shrink-0">📁 {String(c.data.label ?? t("โฟลเดอร์", "Folder"))}</span>
                <span className="font-mono text-[11px] text-slate-400 flex-1 truncate text-right">{String(c.data.path ?? "")}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
