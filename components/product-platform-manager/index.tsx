"use client";

// ============================================================
// ProductPlatformManager (ของกลาง) — ศูนย์เตรียมลงขายหลายแพลตฟอร์ม (เฟส 1a, MVP ในบ้าน)
// เปิดต่อ Parent SKU · sub-tab ตาม erp_platforms (ไม่ hardcode) · ร่างต่อแพลตฟอร์ม +
// ตาราง SKU/variant จริง (MiniTable) + รูป (HoverImage, ย่อผ่าน /api/r2-image) + checklist
// ยังไม่ publish จริง (เฟส 2 — ต่อ API/queue) · มี toast ในตัว (droppable ทุกที่)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { ERPInput, ERPTextarea } from "@/components/form";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { HoverImage } from "@/components/hover-image";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { r2ImageUrl } from "@/lib/r2-image";
import { apiFetch } from "@/lib/api";
import { requiredChecks } from "@/lib/platform-required-fields";
import { PlatformIcon } from "@/components/platform-icon";

// ตัวแก้สินค้ากลาง (SKU) — เปิดจากตัวจัดการเพื่อแก้ราคา/สี/รูป หรือเพิ่มสีใหม่ · dynamic กัน import วน
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
// ตัวช่วยสร้าง SKU หลายชั้น (สี × ตัวเลือก) — ของกลาง
const VariantMatrixModal = dynamic(() => import("@/components/variant-matrix").then((m) => m.VariantMatrixModal), { ssr: false });

type Platform = { id: string; code: string; name_th: string; icon_key: string | null; theme_color: string | null; capabilities?: Record<string, unknown> };
type Draft = { title?: string | null; description?: string | null; category_path?: string | null; status?: string | null; image_keys?: string[]; description_image_keys?: string[]; extra?: Record<string, unknown>; platform_product_id?: string | null; review_link?: string | null; last_sync_status?: string | null; last_error?: string | null };
type ParentInfo = { id: string; code: string; name_th: string; name_platform: string; description: string; category_id: string | null; category_name: string | null; platform_category_id: string | null; platform_category_name: string | null; brand_name: string | null; weight_kg: number | null; box_width: number | null; box_length: number | null; box_height: number | null };
type ImageItem = { key: string; source: string };
type Account = { label: string | null; is_active: boolean; external_shop_id?: string | null };
type Variant = { id: string; code: string; name: string; color: string | null; fake_price: number | null; sale_price: number | null; discount: number; image_key: string | null; is_active: boolean; has_price: boolean; has_image: boolean; option_name?: string | null; option_value?: string | null };
type Toast = { id: number; type: "success" | "error" | "info"; msg: string };


// สีประจำแบรนด์แต่ละแพลตฟอร์ม (fallback ตาม code ถ้าไม่ได้ตั้ง theme_color)
const PLATFORM_COLOR: Record<string, string> = {
  shopee: "#ee4d2d", lazada: "#f57224", tiktok: "#fe2c55", tiktok_shop: "#fe2c55",
  instagram: "#e1306c", facebook: "#1877f2", youtube: "#ff0000", pinterest: "#e60023",
  x: "#0f1419", line_shopping: "#06c755", line_oa: "#06c755", website: "#6366f1",
};
function platformColor(p: { code: string; theme_color: string | null }): string {
  if (p.theme_color && /^#[0-9a-fA-F]{6}$/.test(p.theme_color)) return p.theme_color;
  return PLATFORM_COLOR[p.code] ?? "#7c3aed";
}

// ค้นหา + เลือกหมวดหมู่ของแพลตฟอร์ม (จาก platform_category_options ที่นำเข้ามา) — คืนค่า "id · ชื่อ"
function CategoryOptionPicker({ platformId, onPick }: { platformId: string; onPick: (label: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ external_id: string; name_th: string; name_en: string }[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true; setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await apiFetch(`/api/platform-category-options?${new URLSearchParams({ platform_id: platformId, search: q, limit: "30" })}`).then((r) => r.json()); if (live) { setResults(j.categories ?? []); setTotal(j.total ?? 0); } }
      catch { if (live) setResults([]); } finally { if (live) setLoading(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, platformId]);
  return (
    <div className="relative">
      <input value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder="🔍 เลือกหมวดจาก LINE (พิมพ์ค้น เช่น กระเป๋า / bag)" className="h-9 w-full border border-violet-200 rounded-md px-2 text-sm" />
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {total === 0 ? <div className="p-3 text-xs text-amber-600">ยังไม่ได้นำเข้าหมวดหมู่ของแพลตฟอร์มนี้ — กด “📂 นำเข้าหมวดหมู่” ที่หน้าสินค้าบนแพลตฟอร์มก่อน</div>
            : loading ? <div className="p-3 text-xs text-slate-400">กำลังค้นหา...</div>
            : results.length === 0 ? <div className="p-3 text-xs text-slate-400">ไม่พบหมวดที่ตรง</div>
            : results.map((c) => (
              <button key={c.external_id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(`${c.external_id} · ${c.name_th || c.name_en}`); setOpen(false); setQ(""); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50">
                <span className="text-slate-400 font-mono">{c.external_id}</span> {c.name_th || c.name_en}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ค้นหา + เลือกสินค้าบนร้าน (platform_catalog_listings) เพื่อจับคู่กับ Parent SKU นี้
type ListingHit = { id: string; title: string | null; external_product_id: string | null; sku_code: string | null; matched_parent_sku_id: string | null };
function ListingMatchPicker({ platformId, onPick }: { platformId: string; onPick: (l: { id: string; title: string; external_id: string; sku_code: string }) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ListingHit[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true; setLoading(true);
    const t = setTimeout(async () => {
      try { const j = await apiFetch(`/api/platform-catalog?${new URLSearchParams({ platform_id: platformId, search: q, limit: "30" })}`).then((r) => r.json()); if (live) setResults((j.listings ?? []) as ListingHit[]); }
      catch { if (live) setResults([]); } finally { if (live) setLoading(false); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [open, q, platformId]);
  return (
    <div className="relative">
      <input value={q} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder="🔍 ค้นหาสินค้าบนร้าน (ชื่อ / รหัส SKU / รหัสสินค้า)" className="h-9 w-full border border-violet-200 rounded-md px-2 text-sm" />
      {open && (
        <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {loading ? <div className="p-3 text-xs text-slate-400">กำลังค้นหา...</div>
            : results.length === 0 ? <div className="p-3 text-xs text-amber-600">ไม่พบสินค้าบนร้านนี้ — นำเข้าแคตตาล็อกที่หน้า “สินค้าบนแพลตฟอร์ม” ก่อน</div>
            : results.map((l) => (
              <button key={l.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick({ id: l.id, title: l.title ?? "", external_id: l.external_product_id ?? "", sku_code: l.sku_code ?? "" }); setOpen(false); setQ(""); }} className="block w-full text-left px-3 py-1.5 text-xs hover:bg-violet-50">
                <span className="text-slate-700">{l.title || "(ไม่มีชื่อ)"}</span>
                <span className="text-slate-400 font-mono ml-1">{l.sku_code || l.external_product_id}</span>
                {l.matched_parent_sku_id && <span className="ml-1 text-[10px] text-amber-500">• จับคู่แล้ว</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

// ช่องแก้ราคาราย SKU (inline) — ใช้ได้ทั้งราคาเต็ม/ราคาขาย · uncontrolled เซฟตอน blur/Enter
function PriceInput({ id, field, value, onSave, warn, title }: { id: string; field: "fake_price" | "list_price"; value: number | null; onSave: (id: string, field: "fake_price" | "list_price", val: string) => void; warn?: boolean; title?: string }) {
  const cur = value == null ? "" : String(value);
  return (
    <input type="number" min={0} key={`${field}-${id}-${cur}`} defaultValue={cur}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      onBlur={(e) => { const val = e.target.value.trim(); if (val !== cur) onSave(id, field, val); }}
      placeholder="—" title={title}
      className={`h-7 w-full text-right tabular-nums border rounded-md px-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-violet-300 ${warn ? "border-rose-300 bg-rose-50/40" : "border-slate-200"}`} />
  );
}

// คอลัมน์ส่วนลด — คิดเองจาก (ราคาเต็ม − ราคาขาย) · อ่านอย่างเดียว = instantDiscount ที่จะส่ง LINE
function DiscountView({ v }: { v: Variant }) {
  const hasDisc = v.discount > 0;
  return (
    <span className={`tabular-nums text-sm ${hasDisc ? "text-violet-600" : "text-slate-300"}`} title="ส่วนลด = ราคาเต็ม − ราคาขาย (คิดอัตโนมัติ)">{hasDisc ? `−${v.discount.toLocaleString()}฿` : "—"}</span>
  );
}

// ประวัติ (audit) — แปลงเป็นข้อความคน + เวลา
type LogEntry = { at: string; actor: string | null; action: string; entity_type: string; source: string | null; metadata: Record<string, unknown> };
function fmtLogTime(at: string): string { try { return new Date(at).toLocaleString("th-TH", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return at; } }
function logLabel(e: LogEntry): string {
  const m = e.metadata ?? {};
  if (e.source === "line_push_price") return `⬆️ ส่งราคา/ส่วนลดขึ้น LINE (สำเร็จ ${m.ok ?? 0}/${m.products ?? 0})`;
  if (e.source === "line_push_details") return `📝 ส่งรายละเอียดขึ้น LINE (สำเร็จ ${m.ok ?? 0}/${m.products ?? 0})`;
  if (e.source === "line_create") return `🆕 สร้างสินค้าบน LINE${m.product_id ? ` (รหัส ${m.product_id})` : ""}`;
  if (e.source === "line_display") return m.status === "hide" ? "⏸ ปิดขายบน LINE" : "▶ เปิดขายบน LINE";
  if (e.entity_type === "sku_price") {
    if (m.mass_fill) return `⚡ ตั้ง${m.field === "fake_price" ? "ราคาเต็ม" : "ราคาขาย"}ทุก SKU = ${Number(m.price).toLocaleString()}฿ (${m.count} ตัว)`;
    return `✏️ แก้${m.field === "fake_price" ? "ราคาเต็ม" : "ราคาขาย"} ${m.sku_code ?? ""}: ${m.old ?? "—"} → ${m.new ?? "—"}`;
  }
  if (e.entity_type === "platform_listing_draft") { const f = Array.isArray(m.fields) ? (m.fields as string[]).join(", ") : ""; return `📄 แก้ร่างลงขาย${f ? ` (${f})` : ""}`; }
  if (e.entity_type === "platform_category_mapping") return "🗂 ตั้งหมวดหมู่มาตรฐาน";
  if (e.entity_type === "platform_catalog") return "📤 ส่ง/ลงขายแพลตฟอร์ม";
  return `${e.action} · ${e.entity_type}`;
}

export function ProductPlatformManager({ parentSkuId, onClose, canEdit = true, canPublish = false, initialPlatformId }: {
  parentSkuId: string; onClose: () => void; canEdit?: boolean; canPublish?: boolean;
  /** เปิดมาให้อยู่แท็บแพลตฟอร์มนี้เลย (เช่น เปิดจากหน้า catalog ของ LINE) */
  initialPlatformId?: string;
}) {
  const { width, startResize } = useDrawerResize("platformMgrWidth", 780);
  const [loading, setLoading] = useState(true);
  const [parent, setParent] = useState<ParentInfo | null>(null);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [variants, setVariants] = useState<Variant[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [images, setImages] = useState<ImageItem[]>([]);
  const [descImages, setDescImages] = useState<ImageItem[]>([]);   // รูปรายละเอียด (Description) — แยกชุด
  const [matchedListings, setMatchedListings] = useState<Record<string, { id: string; title: string | null; external_id: string | null; sku_code: string | null }>>({});   // platform_id → สินค้าบนร้านที่จับคู่
  const [matching, setMatching] = useState(false);
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [active, setActive] = useState<string>("");
  const [catInput, setCatInput] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [skuEditor, setSkuEditor] = useState<{ recordId: string | null } | null>(null); // แก้/เพิ่มสี (SKU)
  const [matrixOpen, setMatrixOpen] = useState(false); // ตัวช่วยสร้าง SKU หลายชั้น
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [massFake, setMassFake] = useState("");   // Mass fill ราคาเต็มทุก SKU
  const [massSale, setMassSale] = useState("");   // Mass fill ราคาขายทุก SKU
  // staged-save: เก็บการแก้ค้างในหน้า แล้วกด "บันทึก" ทีเดียว (ไม่ auto-save)
  const [priceEdits, setPriceEdits] = useState<Record<string, { fake_price?: number | null; list_price?: number | null }>>({});
  const [dirtyPlatforms, setDirtyPlatforms] = useState<Set<string>>(new Set());
  const [savingAll, setSavingAll] = useState(false);
  const [showLog, setShowLog] = useState(false);   // แผงประวัติ (audit)
  const [logRows, setLogRows] = useState<LogEntry[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [creating, setCreating] = useState(false);  // สร้างสินค้าใหม่บน LINE
  const [displaying, setDisplaying] = useState(false); // เปิด/ปิดการขายบน LINE
  const [pushingPrice, setPushingPrice] = useState(false); // ส่งราคา/ส่วนลดขึ้น LINE
  const [prefillTick, setPrefillTick] = useState(0); // บังคับรีเฟรชช่อง (uncontrolled) หลัง prefill
  const lastLoadRef = useRef(0);                     // เวลาที่โหลดล่าสุด (ใช้หน่วง auto-refresh)
  // F: render ผ่าน portal ไป body (เหมือน Drawer กลาง) → เปิดทับ drawer แม่ที่ค้างอยู่ ไม่ซ้อนหลัง
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
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
      setParent(j.parent ? { id: String(j.parent.id ?? ""), code: String(j.parent.code ?? ""), name_th: String(j.parent.name_th ?? ""), name_platform: String(j.parent.name_platform ?? ""), description: String(j.parent.description ?? ""), category_id: j.parent.category_id ?? null, category_name: j.parent.category_name ?? null, platform_category_id: j.parent.platform_category_id ?? null, platform_category_name: j.parent.platform_category_name ?? null, brand_name: j.parent.brand_name ?? null, weight_kg: j.parent.weight_kg ?? null, box_width: j.parent.box_width ?? null, box_length: j.parent.box_length ?? null, box_height: j.parent.box_height ?? null } : null);
      const pfs = (j.platforms ?? []) as Platform[];
      setPlatforms(pfs);
      setDrafts((j.drafts ?? {}) as Record<string, Draft>);
      setVariants((j.variants ?? []) as Variant[]);
      setMappings((j.mappings ?? {}) as Record<string, string>);
      setImages((j.images ?? []) as ImageItem[]);
      setDescImages((j.descImages ?? []) as ImageItem[]);
      setMatchedListings((j.matchedListings ?? {}) as Record<string, { id: string; title: string | null; external_id: string | null; sku_code: string | null }>);
      setAccounts((j.accounts ?? {}) as Record<string, Account>);
      setActive((prev) => prev || (initialPlatformId && pfs.some((p) => p.id === initialPlatformId) ? initialPlatformId : (pfs[0]?.id ?? "")));
      lastLoadRef.current = Date.now();
    } catch (e) { toast("error", (e as Error).message); }
    finally { setLoading(false); }
  }, [parentSkuId, toast, initialPlatformId]);
  useEffect(() => { load(); }, [load]);

  // โหลดข้อมูลใหม่เมื่อกลับมาที่แท็บ — แต่ "หน่วง" (เกิน 15 วิ) + ไม่ทับของที่แก้ค้างไว้
  // เบา ไม่ยิงถี่ (กัน request แย่งกันตาม perf) แต่แก้ปัญหา "ไปแก้ที่อื่นแล้วไม่อัปเดต"
  const dirtyRef = useRef(false);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (dirtyRef.current) return;                       // มีของค้าง — อย่าทับ
      if (Date.now() - lastLoadRef.current < 15000) return; // หน่วง กัน spam
      void load();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [load]);

  // ประวัติ (audit) — โหลดตอนเปิดแผง หรือกดรีเฟรช
  const loadLog = useCallback(async () => {
    setLogLoading(true);
    try { const j = await apiFetch(`/api/product-platforms/audit?parent_sku_id=${encodeURIComponent(parentSkuId)}`).then((r) => r.json()); setLogRows((j.entries ?? []) as LogEntry[]); }
    catch { /* ignore */ } finally { setLogLoading(false); }
  }, [parentSkuId]);
  const toggleLog = () => { const n = !showLog; setShowLog(n); if (n) void loadLog(); };

  const activeDraft = drafts[active] ?? {};
  const title = activeDraft.title ?? "";
  const description = activeDraft.description ?? "";
  const dirty = dirtyPlatforms.size > 0 || Object.keys(priceEdits).length > 0;
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);   // ให้ตัว auto-refresh รู้ว่ามีของค้างไหม
  const markDirty = () => setDirtyPlatforms((s) => (s.has(active) ? s : new Set(s).add(active)));

  // เติมชื่อ/รายละเอียดจากข้อมูลสินค้าใน ERP (ชื่อ = name_platform > name_th)
  // เติม "ทั้งชื่อ + รายละเอียด" จากข้อมูลสินค้าใน ERP ในปุ่มเดียว (ยิง 0 request — บันทึกตอนกด "บันทึก")
  const prefillAllFromErp = () => {
    const t = parent?.name_platform || parent?.name_th || "";
    const d = parent?.description || "";
    if (!t.trim() && !d.trim()) { toast("info", "ไม่มีข้อมูลใน ERP ให้เติม"); return; }
    if (t.trim()) saveField("title", t);
    if (d.trim()) saveField("description", d);
    setPrefillTick((tick) => tick + 1);
    toast("success", "เติมชื่อ + รายละเอียดจากสินค้าแล้ว");
  };
  // ดึงเฉพาะ "รายละเอียด" จากข้อมูลสินค้า (= Platform Description ตัวเต็ม) — ใช้ทับของเดิมได้ทุกเมื่อ
  const prefillDescFromErp = () => {
    const d = parent?.description || "";
    if (!d.trim()) { toast("info", "ไม่มีรายละเอียดในข้อมูลสินค้าให้ดึง"); return; }
    saveField("description", d);
    setPrefillTick((tick) => tick + 1);
    toast("success", "ดึงรายละเอียดจากสินค้าแล้ว");
  };
  const canPrefill = !!(parent?.name_platform || parent?.name_th || parent?.description);
  // Mass fill ราคา (เต็ม/ขาย) ทุก SKU — ค้างในหน้า (กด "บันทึก" ถึงเขียนจริง)
  const massFillPrice = (field: "fake_price" | "list_price", valueStr: string, onlyEmpty: boolean) => {
    const p = Number(valueStr);
    if (!Number.isFinite(p) || p < 0) { toast("error", "ใส่ราคาให้ถูกต้อง"); return; }
    const targets = variants.filter((v) => !(onlyEmpty && (((field === "fake_price" ? v.fake_price : v.sale_price) ?? 0) > 0)));
    setVariants((vs) => vs.map((v) => {
      if (!targets.some((t) => t.id === v.id)) return v;
      const nv = { ...v, ...(field === "fake_price" ? { fake_price: p } : { sale_price: p }) };
      const disc = (nv.fake_price != null && nv.sale_price != null && nv.fake_price > nv.sale_price) ? nv.fake_price - nv.sale_price : 0;
      return { ...nv, discount: disc, has_price: nv.fake_price != null && nv.fake_price > 0 };
    }));
    setPriceEdits((pe) => { const next = { ...pe }; for (const t of targets) next[t.id] = { ...next[t.id], [field]: p }; return next; });
    setMassFake(""); setMassSale("");
    toast("info", `ตั้ง${field === "fake_price" ? "ราคาเต็ม" : "ราคาขาย"} ${targets.length} SKU (ยังไม่บันทึก — กด “บันทึก”)`);
  };
  // ฟิลด์เพิ่มเติม (แบรนด์/บาร์โค้ด/น้ำหนัก-ขนาด/ของขวัญ) — เก็บรวมใน draft.extra (client ส่งทั้งก้อน)
  const extra = (activeDraft.extra ?? {}) as Record<string, unknown>;
  const exStr = (k: string) => (extra[k] == null ? "" : String(extra[k]));
  const saveExtra = (patch: Record<string, unknown>) => {
    const next = { ...extra, ...patch };
    setDrafts((d) => ({ ...d, [active]: { ...d[active], extra: next } }));
    markDirty();
  };
  const giftCats = (extra.gift_categories ?? []) as string[];
  const toggleGiftCat = (c: string) => saveExtra({ gift_categories: giftCats.includes(c) ? giftCats.filter((x) => x !== c) : [...giftCats, c] });
  // แก้ราคาราย SKU (inline) — เขียน fake_price (ราคาเต็ม) หรือ list_price (ราคาขาย) + คิดส่วนลดใหม่ในหน้าทันที
  const savePrice = useCallback((skuId: string, field: "fake_price" | "list_price", priceStr: string) => {
    const raw = priceStr.trim();
    const p = raw === "" ? null : Number(raw);
    if (p != null && (!Number.isFinite(p) || p < 0)) { toast("error", "ราคาไม่ถูกต้อง"); return; }
    setVariants((vs) => vs.map((v) => {
      if (v.id !== skuId) return v;
      const nv = { ...v, ...(field === "fake_price" ? { fake_price: p } : { sale_price: p }) };
      const disc = (nv.fake_price != null && nv.sale_price != null && nv.fake_price > nv.sale_price) ? nv.fake_price - nv.sale_price : 0;
      return { ...nv, discount: disc, has_price: nv.fake_price != null && nv.fake_price > 0 };
    }));
    setPriceEdits((pe) => ({ ...pe, [skuId]: { ...pe[skuId], [field]: p } }));   // ค้างไว้ กด "บันทึก" ถึงเขียน
  }, [toast]);
  // บันทึกทั้งหมด (staged) — ร่างต่อแพลตฟอร์มที่แก้ + ราคา SKU ที่แก้
  const saveAll = async () => {
    if (!dirty || savingAll) return;
    setSavingAll(true);
    try {
      // ยิงทุกคำขอพร้อมกัน (parallel) — เร็วกว่าเรียงทีละตัวมาก
      const jobs: Promise<Response>[] = [];
      for (const pid of dirtyPlatforms) {
        const d = drafts[pid] ?? {};
        jobs.push(apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: pid, title: d.title ?? null, description: d.description ?? null, category_path: d.category_path ?? null, image_keys: d.image_keys ?? [], description_image_keys: d.description_image_keys ?? [], extra: d.extra ?? {} }) }));
      }
      for (const [skuId, edit] of Object.entries(priceEdits)) {
        for (const field of ["fake_price", "list_price"] as const) {
          if (field in edit) jobs.push(apiFetch("/api/product-platforms/sku-price", { method: "POST", body: JSON.stringify({ sku_id: skuId, field, price: edit[field] }) }));
        }
      }
      const ress = await Promise.all(jobs);
      for (const r of ress) { const j = await r.json(); if (j.error) throw new Error(j.error); }
      setDirtyPlatforms(new Set()); setPriceEdits({});
      toast("success", "บันทึกแล้ว"); await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setSavingAll(false); }
  };
  // สร้างสินค้าใหม่บน LINE (สินค้าที่ยังไม่มีบน LINE)
  const createOnLine = async () => {
    if (dirty) { toast("info", "มีข้อมูลที่ยังไม่บันทึก — กด “บันทึก” ก่อน"); return; }
    setCreating(true);
    try {
      const r = await apiFetch("/api/line-shopping/create-product", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", `สร้างบน LINE แล้ว (รหัส ${j.product_id})`); await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setCreating(false); }
  };
  const setDisplayLine = async (status: "onsale" | "hide") => {
    if (dirty) { toast("info", "มีข้อมูลที่ยังไม่บันทึก — กด “บันทึก” ก่อน"); return; }
    setDisplaying(true);
    try {
      const r = await apiFetch("/api/line-shopping/set-display", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, status }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", status === "onsale" ? "เปิดขายบน LINE แล้ว" : "ปิดขายบน LINE แล้ว"); await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setDisplaying(false); }
  };
  // ส่งราคา + ส่วนลด (instantDiscount) ของสินค้านี้ขึ้น LINE — ใช้ push-prices โหมดสินค้าเดียว (หาแบรนด์จาก parent)
  const pushPricesLine = async () => {
    if (dirty) { toast("info", "มีข้อมูลที่ยังไม่บันทึก — กด “บันทึก” ก่อนส่ง"); return; }
    setPushingPrice(true);
    try {
      const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const res = (j.results ?? []) as { ok: boolean; variants: number; error?: string }[];
      const ok = res.filter((x) => x.ok).length;
      if (ok > 0) toast("success", `ส่งราคา/ส่วนลดขึ้น LINE แล้ว (${res[0]?.variants ?? 0} ตัวเลือก)`);
      else toast("error", res.find((x) => !x.ok)?.error || j.note || "ยังไม่มีสินค้าที่จับคู่ให้ส่ง");
    } catch (e) { toast("error", (e as Error).message); } finally { setPushingPrice(false); }
  };
  // เซ็ตช่องหมวดหมู่เมื่อสลับแพลตฟอร์ม (draft > mapping > ว่าง)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setCatInput((drafts[active]?.category_path ?? mappings[active] ?? "") as string); }, [active]);

  const saveField = (field: keyof Draft, value: string) => {
    const cur = (drafts[active]?.[field] ?? "") as string;
    if ((value || "") === (cur || "")) return;
    setDrafts((d) => ({ ...d, [active]: { ...d[active], [field]: value || null } }));
    markDirty();
  };
  // เลือกรูปส่งแพลตฟอร์ม (array) — ค้างในหน้า กด "บันทึก" ถึงเขียน
  const saveImages = (keys: string[]) => {
    setDrafts((d) => ({ ...d, [active]: { ...d[active], image_keys: keys } }));
    markDirty();
  };
  const toggleImage = (key: string) => {
    const cur = activeDraft.image_keys ?? [];
    saveImages(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };
  const allImgOn = images.length > 0 && images.every((im) => (activeDraft.image_keys ?? []).includes(im.key));
  const toggleAllImg = () => saveImages(allImgOn ? [] : images.map((im) => im.key));
  // รูปรายละเอียด (Description) — ชุดแยก เก็บใน description_image_keys
  const saveDescImages = (keys: string[]) => {
    setDrafts((d) => ({ ...d, [active]: { ...d[active], description_image_keys: keys } }));
    markDirty();
  };
  const toggleDescImage = (key: string) => {
    const cur = activeDraft.description_image_keys ?? [];
    saveDescImages(cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]);
  };
  const allDescOn = descImages.length > 0 && descImages.every((im) => (activeDraft.description_image_keys ?? []).includes(im.key));
  const toggleAllDesc = () => saveDescImages(allDescOn ? [] : descImages.map((im) => im.key));
  // จับคู่สินค้ากับ "สินค้าบนร้าน" (platform_catalog_listings) — เขียนทันที (ไม่ staged)
  const doMatch = async (l: { id: string; title: string; external_id: string; sku_code: string }) => {
    setMatching(true);
    try {
      const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ listing_id: l.id, parent_sku_id: parentSkuId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMatchedListings((m) => ({ ...m, [active]: { id: l.id, title: l.title || null, external_id: l.external_id || null, sku_code: l.sku_code || null } }));
      toast("success", "จับคู่กับสินค้าบนร้านแล้ว");
    } catch (e) { toast("error", (e as Error).message); } finally { setMatching(false); }
  };
  const doUnmatch = async () => {
    const cur = matchedListings[active]; if (!cur) return;
    if (!window.confirm("ยกเลิกการจับคู่สินค้านี้กับสินค้าบนร้าน?")) return;
    setMatching(true);
    try {
      const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ listing_id: cur.id, parent_sku_id: null }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      // ถ้าสินค้านี้เคยลง/เชื่อมกับแพลตฟอร์มไว้ (มี platform_product_id) ให้เลิกเชื่อมด้วย → ปุ่ม "สร้างสินค้าใหม่" กลับมา
      if (activeDraft.platform_product_id) {
        const r2 = await apiFetch("/api/product-platforms/unlink", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active }) });
        const j2 = await r2.json(); if (j2.error) throw new Error(j2.error);
      }
      setMatchedListings((m) => { const n = { ...m }; delete n[active]; return n; });
      setDrafts((dd) => ({ ...dd, [active]: { ...dd[active], platform_product_id: null } }));
      toast("info", "ยกเลิกการจับคู่แล้ว — กด “สร้างสินค้าใหม่” เพื่อลงใหม่ได้");
    } catch (e) { toast("error", (e as Error).message); } finally { setMatching(false); }
  };
  // เลิกเชื่อมกับแพลตฟอร์ม (ล้าง platform_product_id) — ไม่ได้ลบสินค้าจริงบนร้าน แค่ให้กด "สร้างใหม่" ได้อีก
  const unlinkFromPlatform = async () => {
    if (!window.confirm("เลิกเชื่อมสินค้านี้กับแพลตฟอร์ม?\n(ไม่ได้ลบสินค้าบนร้าน — แค่ให้ระบบลืมการเชื่อม เพื่อกด “สร้างสินค้าใหม่” ได้อีกครั้ง)")) return;
    setMatching(true);
    try {
      const r = await apiFetch("/api/product-platforms/unlink", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMatchedListings((m) => { const n = { ...m }; delete n[active]; return n; });
      setDrafts((dd) => ({ ...dd, [active]: { ...dd[active], platform_product_id: null } }));
      toast("success", "เลิกเชื่อมแล้ว — กด “สร้างสินค้าใหม่บน LINE” เพื่อลงใหม่ได้");
    } catch (e) { toast("error", (e as Error).message); } finally { setMatching(false); }
  };
  // หมวดหมู่: ใช้ค่ามาตรฐาน / บันทึกเป็นค่ามาตรฐานของหมวดกลางนี้
  const useStandard = () => { const v = mappings[active] ?? ""; if (!v) { toast("info", "ยังไม่มีค่ามาตรฐานของหมวดนี้"); return; } setCatInput(v); saveField("category_path", v); };
  const saveMapping = async () => {
    if (!parent?.platform_category_id) { toast("info", "เลือก “หมวดกลางสำหรับลงขาย” ของสินค้านี้ก่อน (แท็บแพลตฟอร์ม)"); return; }
    try {
      const r = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ save_mapping: true, central_category_id: parent.platform_category_id, platform_id: active, platform_category_path: catInput }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      setMappings((m) => ({ ...m, [active]: catInput }));
      toast("success", "บันทึกเป็นค่ามาตรฐานของหมวดนี้แล้ว");
    } catch (e) { toast("error", (e as Error).message); }
  };
  // ลงขาย (mock connector) — เดี่ยว / ทุกที่พร้อม
  const account = accounts[active];
  const published = activeDraft.last_sync_status === "success" || activeDraft.status === "published";
  // ลิงก์สินค้าบนร้าน (LINE): https://shop.line.me/@{shopId}/product/{productId} — รับทั้ง URL เต็มที่วางมา หรือ @handle
  const shopLink = (() => {
    const pid = activeDraft.platform_product_id; const sid = (account?.external_shop_id ?? "").trim();
    if (!pid || !sid) return "";
    const base = /^https?:\/\//i.test(sid) ? sid.replace(/\/+$/, "") : `https://shop.line.me/@${sid.replace(/^@/, "")}`;
    return `${base}/product/${pid}`;
  })();
  const copyShopLink = async () => {
    if (!shopLink) return;
    try { await navigator.clipboard.writeText(shopLink); toast("success", "คัดลอกลิงก์สินค้าแล้ว"); }
    catch { toast("error", "คัดลอกไม่ได้ — กดค้างที่ลิงก์เพื่อคัดลอกเอง"); }
  };
  const publishOnePlatform = async () => {
    if (!ready) { toast("error", "ข้อมูลยังไม่ครบ — ดูเช็คลิสต์"); return; }
    if (!account?.is_active) { toast("error", "แบรนด์นี้ยังไม่มีร้านสำหรับแพลตฟอร์มนี้"); return; }
    setPublishing(true);
    try {
      const r = await apiFetch("/api/product-platforms/publish", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, platform_id: active }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast("success", `ลงขายแล้ว (จำลอง) · ${j.platform_product_id ?? ""}`);
      await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setPublishing(false); }
  };
  const publishAll = async () => {
    setPublishing(true);
    try {
      const r = await apiFetch("/api/product-platforms/publish", { method: "POST", body: JSON.stringify({ parent_sku_id: parentSkuId, all: true }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const res = (j.results ?? []) as { ok: boolean }[];
      const okN = res.filter((x) => x.ok).length;
      const failN = res.length - okN;
      toast(failN ? "info" : "success", `ลงขายสำเร็จ ${okN}${failN ? ` · ไม่สำเร็จ ${failN} (ดูในแต่ละแพลตฟอร์ม)` : ""}`);
      await load();
    } catch (e) { toast("error", (e as Error).message); } finally { setPublishing(false); }
  };

  // เช็คลิสต์ "ฟิลด์จำเป็น" ตามแพลตฟอร์มที่เลือก (LINE มี spec เฉพาะ · อื่น ๆ ใช้ชุดทั่วไป)
  const checks = useMemo(() => {
    const allHavePrice = variants.length > 0 && variants.every((v) => v.has_price);
    const allHaveImage = variants.length > 0 && variants.every((v) => v.has_image);
    const code = platforms.find((p) => p.id === active)?.code ?? "";
    return requiredChecks(code, {
      title, description, category: (activeDraft.category_path ?? "") as string,
      imagesToSend: (activeDraft.image_keys ?? []).length, variantCount: variants.length, allHavePrice, allHaveImage,
    });
  }, [title, description, variants, activeDraft.category_path, activeDraft.image_keys, platforms, active]);
  const ready = checks.every((c) => !c.required || c.ok);

  // ตัวเลือกชั้นที่ 2 (เช่น แบบพิมพ์) + จัดกลุ่มตามสี — โชว์คอลัมน์/กลุ่มเฉพาะเมื่อมีประโยชน์
  const hasOption = useMemo(() => variants.some((v) => v.option_value), [variants]);
  const optionName = useMemo(() => variants.find((v) => v.option_name)?.option_name || "ตัวเลือก", [variants]);
  // จัดกลุ่มตามสีเมื่อมีสีซ้ำ (หลาย SKU สีเดียวกัน) — สินค้าที่แต่ละ SKU คนละสีล้วนไม่ต้องจัดกลุ่ม
  const hasColorGroups = useMemo(() => new Set(variants.map((v) => v.color || "—")).size < variants.length, [variants]);

  const cols: MiniColumn<Variant>[] = useMemo(() => [
    { key: "img", header: "รูป", width: "2.5rem", cell: (v) => <HoverImage url={r2ImageUrl(v.image_key)} size={32} /> },
    { key: "code", header: "SKU", width: "1fr", sortValue: (v) => v.code, cell: (v) => <span className="font-mono text-xs">{v.code}</span> },
    { key: "color", header: "สี", width: "0.9fr", sortValue: (v) => v.color ?? "", cell: (v) => v.color || "—" },
    ...(hasOption ? [{ key: "option", header: optionName, width: "0.9fr", sortValue: (v: Variant) => v.option_value ?? "", cell: (v: Variant) => v.option_value || <span className="text-slate-300">—</span> } as MiniColumn<Variant>] : []),
    { key: "fake", header: "ราคา", width: "5rem", align: "right", sortValue: (v) => v.fake_price ?? -1,
      cell: (v) => canEdit ? <PriceInput id={v.id} field="fake_price" value={v.fake_price} onSave={savePrice} warn={!(v.fake_price && v.fake_price > 0)} title="ราคาเต็ม (Fake Price) — ราคาก่อนลด" />
        : (v.fake_price ? <span className="tabular-nums">{v.fake_price.toLocaleString()}฿</span> : <span className="text-rose-500 text-xs">ไม่มี</span>) },
    { key: "sale", header: "ราคาหลังลด", width: "5.5rem", align: "right", sortValue: (v) => v.sale_price ?? -1,
      cell: (v) => canEdit ? <PriceInput id={v.id} field="list_price" value={v.sale_price} onSave={savePrice} title="ราคาขายจริง (Sale Price) — เว้นว่าง = ขายเต็มราคา" />
        : (v.sale_price ? <span className="tabular-nums text-emerald-700">{v.sale_price.toLocaleString()}฿</span> : <span className="text-slate-300">—</span>) },
    { key: "discount", header: "ส่วนลด", width: "4.5rem", align: "right", sortValue: (v) => v.discount, cell: (v) => <DiscountView v={v} /> },
    { key: "ready", header: "พร้อม", width: "3.25rem", align: "center", cell: (v) => (v.has_price && v.has_image && v.is_active) ? <span className="text-emerald-600">✓</span> : <span className="text-rose-500" title={[!v.has_price && "ไม่มีราคา", !v.has_image && "ไม่มีรูป", !v.is_active && "ปิดอยู่"].filter(Boolean).join(", ")}>✗</span> },
    { key: "edit", header: "", width: "2.25rem", align: "center", cell: (v) => canEdit ? <button onClick={() => setSkuEditor({ recordId: v.id })} title="แก้สี/รูป (หน้าสินค้าเต็ม)" className="text-violet-600 hover:underline">✏️</button> : null },
  ], [canEdit, savePrice, hasOption, optionName]);

  const activePf = platforms.find((p) => p.id === active);

  if (!mounted) return null;
  return createPortal(
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => { if (!dirty || window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก — ออกโดยไม่บันทึก?")) onClose(); }} />
      <div style={{ width }} className="fixed right-0 top-0 h-full max-w-[97vw] bg-white shadow-2xl z-50 flex flex-col border-l border-slate-200">
        <div onMouseDown={startResize} title="ลากเพื่อปรับความกว้าง" className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-violet-400/40 z-[60]" />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 truncate">🏬 ลงขายหลายแพลตฟอร์ม</h3>
            {parent && <p className="text-xs text-slate-500 truncate"><span className="font-mono">{parent.code}</span> · {parent.name_th}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={() => { if (dirty && !window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก — โหลดใหม่จะทิ้งที่แก้ค้างไว้ ต่อไหม?")) return; void load(); if (showLog) void loadLog(); }}
              disabled={loading} title="โหลดข้อมูลล่าสุด (รูป/หมวด/ราคา)" className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-violet-700 hover:bg-violet-50 disabled:opacity-40">
              <span className={loading ? "inline-block animate-spin" : ""}>🔄</span>
            </button>
            <button onClick={() => { if (!dirty || window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก — ออกโดยไม่บันทึก?")) onClose(); }} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
          </div>
        </div>

        {loading ? <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">กำลังโหลด...</div> : (
          <>
            <div className="flex gap-1 px-4 pt-3 overflow-x-auto shrink-0 border-b border-slate-100">
              {platforms.map((p) => {
                const d = drafts[p.id] ?? {};
                const onSale = d.status === "published" || d.last_sync_status === "success" || !!d.platform_product_id;
                const hasDraft = !!(d.title || d.category_path || (d.image_keys?.length));
                const dot = onSale ? "bg-emerald-500" : hasDraft ? "bg-blue-500" : "bg-slate-300";
                const stLabel = onSale ? "ลงขายแล้ว" : hasDraft ? "มีร่าง" : "ยังไม่ทำ";
                const color = platformColor(p);
                const isActive = active === p.id;
                return (
                  <button key={p.id} onClick={() => setActive(p.id)} title={`${p.name_th} · ${stLabel}`}
                    style={{ borderBottomColor: isActive ? color : `${color}40`, color: isActive ? color : undefined }}
                    className={`shrink-0 px-3 py-1.5 text-sm rounded-t-lg border-b-2 transition-colors inline-flex items-center gap-1.5 ${isActive ? "font-medium" : "text-slate-500 hover:text-slate-700"}`}>
                    <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />
                    <span>{p.name_th}</span>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                  </button>
                );
              })}
              {platforms.length === 0 && <p className="text-sm text-slate-400 py-2">ยังไม่มีแพลตฟอร์มที่เปิดใช้ — เพิ่มที่ตั้งค่า</p>}
            </div>

            {activePf && (
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${ready ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>{ready ? "✓ พร้อมลงขาย" : "⚠ ข้อมูลยังไม่ครบ"}</span>
                  {account?.is_active ? <span className="text-xs text-slate-400">ร้าน: {account.label || "—"}</span> : <span className="text-xs text-amber-600">⚠ แบรนด์นี้ยังไม่มีร้าน {activePf.name_th} <a href="/admin/platform-accounts" target="_blank" rel="noopener noreferrer" className="underline">ตั้งร้าน</a></span>}
                  {published && <span className="text-xs text-emerald-600">✅ ลงขายแล้ว (จำลอง){activeDraft.platform_product_id ? ` · ${activeDraft.platform_product_id}` : ""}</span>}
                  {activeDraft.last_sync_status === "failed" && <span className="text-xs text-rose-600" title={activeDraft.last_error ?? ""}>⚠ ส่งไม่สำเร็จ</span>}
                </div>

                {/* จับคู่กับ "สินค้าบนร้าน" (platform_catalog_listings) — เชื่อมสินค้านี้กับสินค้าที่มีอยู่แล้วบนร้าน */}
                <div className="rounded-lg border border-slate-200 p-3">
                  {matchedListings[active] ? (
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="min-w-0 text-xs">
                        <span className="text-emerald-700 font-medium">🔗 จับคู่กับสินค้าบนร้านแล้ว</span>
                        <div className="text-slate-600 truncate">{matchedListings[active].title || "(ไม่มีชื่อ)"} <span className="text-slate-400 font-mono">{matchedListings[active].sku_code || matchedListings[active].external_id || ""}</span></div>
                      </div>
                      {canEdit && <button onClick={doUnmatch} disabled={matching} className="shrink-0 text-xs text-rose-600 border border-rose-200 rounded-md px-2 py-1 hover:bg-rose-50 disabled:opacity-50">ยกเลิกจับคู่</button>}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-600">🔗 จับคู่กับสินค้าบนร้าน {activePf.name_th}</p>
                      <p className="text-[10px] text-slate-400">เชื่อมสินค้านี้กับสินค้าที่มีอยู่แล้วบนร้าน (ระบบจะรู้ว่าตัวไหนคือตัวเดียวกัน — ใช้อัปเดต/ไม่สร้างซ้ำ)</p>
                      {canEdit ? <ListingMatchPicker platformId={active} onPick={doMatch} /> : <p className="text-[11px] text-slate-400">ไม่มีสิทธิ์จับคู่</p>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-400">ชื่อสินค้าบน {activePf.name_th}</p>
                      {canEdit && canPrefill && (!title.trim() || !description.trim()) && <button onClick={prefillAllFromErp} className="text-[11px] text-violet-600 hover:underline">↙ ใช้ข้อมูลจากสินค้า (ชื่อ + รายละเอียด)</button>}
                    </div>
                    <ERPInput key={`t-${active}-${prefillTick}`} defaultValue={title} placeholder={parent?.name_platform || parent?.name_th || "ชื่อสินค้า"} disabled={!canEdit} onBlur={(e) => saveField("title", e.target.value)} />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] text-slate-400">รายละเอียดสินค้า</p>
                      {canEdit && parent?.description?.trim() && <button onClick={prefillDescFromErp} className="text-[11px] text-violet-600 hover:underline">↙ ดึงรายละเอียดจากสินค้า (Platform Description)</button>}
                    </div>
                    <ERPTextarea key={`d-${active}-${prefillTick}`} defaultValue={description} rows={4} placeholder="รายละเอียดเฉพาะแพลตฟอร์มนี้..." disabled={!canEdit} onBlur={(e) => saveField("description", e.target.value)} />
                  </div>

                  {/* รูปประกอบรายละเอียด (Description) — ชุดแยกจากรูปสินค้าหลัก */}
                  {descImages.length > 0 && (
                    <div className="rounded-lg border border-slate-200 p-3">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-slate-600">รูปประกอบรายละเอียด (Description) ({(activeDraft.description_image_keys ?? []).length}/{descImages.length})</p>
                        {canEdit && <button type="button" onClick={toggleAllDesc} className="text-[11px] text-violet-600 hover:underline">{allDescOn ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}</button>}
                      </div>
                      <p className="text-[10px] text-slate-400 mb-2">ภาพประกอบยาว ๆ ของรายละเอียดสินค้า — เพิ่ม/แก้ที่หน้าสินค้า → “รูป Description”</p>
                      <div className="flex flex-wrap gap-2">
                        {descImages.map((im) => {
                          const on = (activeDraft.description_image_keys ?? []).includes(im.key);
                          return (
                            <button key={im.key} type="button" onClick={() => canEdit && toggleDescImage(im.key)} title={im.source} className={`relative rounded-lg overflow-hidden border-2 ${on ? "border-violet-500" : "border-slate-200"}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={r2ImageUrl(im.key, 140) ?? ""} alt="" loading="lazy" className="h-16 w-16 object-cover block" />
                              {on && <span className="absolute top-0.5 right-0.5 bg-violet-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">✓</span>}
                              <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] truncate px-0.5 text-left">{im.source}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* หมวดหมู่ปลายทาง + mapping */}
                {parent?.platform_category_id ? (
                  <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                    <p className="text-xs font-medium text-slate-600">หมวดหมู่ปลายทาง — {activePf.name_th}</p>
                    <p className="text-[11px] text-slate-400">หมวดกลาง: <span className="text-slate-600">{parent.platform_category_name || "—"}</span></p>
                    {canEdit && <CategoryOptionPicker platformId={active} onPick={(label) => { setCatInput(label); saveField("category_path", label); }} />}
                    <ERPInput value={catInput} disabled={!canEdit} placeholder="หรือพิมพ์เอง เช่น Women's Bags > Shoulder Bags" onChange={(e) => setCatInput(e.target.value)} onBlur={() => saveField("category_path", catInput)} />
                    {!catInput.trim() && <p className="text-[11px] text-rose-600">⚠ ยังไม่ได้ตั้งค่าหมวดหมู่สำหรับแพลตฟอร์มนี้</p>}
                    {canEdit && (
                      <div className="flex flex-wrap gap-1.5">
                        <button onClick={useStandard} className="text-xs text-slate-600 border border-slate-200 rounded-md px-2 py-1 hover:bg-slate-50">↩︎ ใช้ค่ามาตรฐาน{mappings[active] ? "" : " (ยังไม่มี)"}</button>
                        <button onClick={saveMapping} className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-1 hover:bg-violet-50">💾 บันทึกเป็นค่ามาตรฐานของหมวดนี้</button>
                      </div>
                    )}
                  </div>
                ) : <p className="text-[11px] text-amber-600">ยังไม่ได้เลือก “หมวดกลางสำหรับลงขาย” ของสินค้านี้ — เลือกที่หัวแท็บ 🏬 แพลตฟอร์ม ก่อน จึงจะเติมหมวดของแต่ละร้านอัตโนมัติได้</p>}

                {/* เลือกรูปส่งไปแพลตฟอร์ม */}
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-slate-600">รูปสินค้าที่ส่งไป {activePf.name_th} ({(activeDraft.image_keys ?? []).length}/{images.length})</p>
                    {canEdit && images.length > 0 && <button type="button" onClick={toggleAllImg} className="text-[11px] text-violet-600 hover:underline">{allImgOn ? "ล้างทั้งหมด" : "เลือกทั้งหมด"}</button>}
                  </div>
                  {images.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีรูป — เพิ่มที่หน้าสินค้า/SKU</p> : (
                    <div className="flex flex-wrap gap-2">
                      {images.map((im) => {
                        const on = (activeDraft.image_keys ?? []).includes(im.key);
                        return (
                          <button key={im.key} type="button" onClick={() => canEdit && toggleImage(im.key)} title={im.source} className={`relative rounded-lg overflow-hidden border-2 ${on ? "border-violet-500" : "border-slate-200"}`}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r2ImageUrl(im.key, 140) ?? ""} alt="" loading="lazy" className="h-16 w-16 object-cover block" />
                            {on && <span className="absolute top-0.5 right-0.5 bg-violet-600 text-white text-[9px] rounded-full w-4 h-4 flex items-center justify-center">✓</span>}
                            <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[8px] truncate px-0.5 text-left">{im.source}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[11px] text-slate-400">SKU / สี ที่จะส่งไป {activePf.name_th} ({variants.length})</p>
                    {canEdit && (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => setMatrixOpen(true)} title="สร้าง SKU หลายชั้น (สี × ตัวเลือก เช่น แบบพิมพ์) ทีเดียว" className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50">🧬 หลายชั้น</button>
                        {activePf.capabilities?.add_variant !== false
                          ? <button onClick={() => setSkuEditor({ recordId: null })} className="text-xs text-violet-700 border border-violet-200 rounded-md px-2 py-0.5 hover:bg-violet-50">➕ เพิ่มสี</button>
                          : <span className="text-[10px] text-amber-600" title="แพลตฟอร์มนี้เพิ่มสีใหม่ใน listing เดิมไม่ได้ ต้องสร้าง listing ใหม่">⚠ เพิ่มสีใน listing เดิมไม่ได้</span>}
                      </div>
                    )}
                  </div>
                  {canEdit && variants.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 mb-2 p-2 rounded-lg bg-slate-50 border border-slate-200">
                      <span className="text-[11px] text-slate-500">⚡ ตั้งราคาทุก SKU:</span>
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <input type="number" min={0} value={massFake} onChange={(e) => setMassFake(e.target.value)} placeholder="ราคาเต็ม" className="h-8 w-24 border border-slate-200 rounded-md pl-2 pr-5 text-sm" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">฿</span>
                        </div>
                        <button onClick={() => massFillPrice("fake_price", massFake, false)} disabled={!massFake} className="h-8 px-2.5 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-40">ตั้งราคาเต็ม</button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <input type="number" min={0} value={massSale} onChange={(e) => setMassSale(e.target.value)} placeholder="ราคาขาย" className="h-8 w-24 border border-emerald-200 rounded-md pl-2 pr-5 text-sm" />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-xs">฿</span>
                        </div>
                        <button onClick={() => massFillPrice("list_price", massSale, false)} disabled={!massSale} className="h-8 px-2.5 text-sm text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 disabled:opacity-40">ตั้งราคาขาย</button>
                      </div>
                      <span className="text-[10px] text-slate-400">ส่วนลด = ราคาเต็ม − ราคาขาย (คิดให้อัตโนมัติ)</span>
                    </div>
                  )}
                  <MiniTable rows={variants} columns={cols} rowKey={(v) => v.id} searchText={(v) => `${v.code} ${v.color ?? ""} ${v.option_value ?? ""}`} dense emptyText="ยังไม่มี SKU ลูก — กด ➕ เพิ่มสี"
                    groupBy={hasColorGroups ? (v) => v.color || "— ไม่ระบุสี" : undefined} groupLabel="ตามสี"
                    footnote={activePf?.code === "line_shopping"
                      ? "ราคา = ราคาเต็ม (Fake) · ราคาหลังลด = ราคาขาย (Sale) · ส่วนลด = ราคาเต็ม−ขาย ส่งเป็น instantDiscount ตอนกด “ส่งราคา/ส่วนลดขึ้น LINE”"
                      : "ราคา = ราคาเต็ม · ราคาหลังลด = ราคาขายจริง (ราคากลางใช้ทุกช่องทาง)"} />
                </div>

                {canEdit && activePf?.code === "line_shopping" && (
                  <div className="rounded-lg border border-slate-200 p-3 space-y-3">
                    <p className="text-xs font-medium text-slate-600">ฟิลด์เพิ่มเติมของ LINE</p>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-[11px] text-slate-500">แบรนด์/ยี่ห้อ
                        <input key={`br-${active}-${prefillTick}`} defaultValue={exStr("brand") || (parent?.brand_name ?? "")} onBlur={(e) => saveExtra({ brand: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      </label>
                      <label className="text-[11px] text-slate-500">บาร์โค้ด / GTIN <span className="text-slate-300">(ว่าง = รหัสสินค้า {parent?.code})</span>
                        <input key={`gt-${active}-${prefillTick}`} defaultValue={exStr("barcode") || (parent?.code ?? "")} onBlur={(e) => saveExtra({ barcode: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" />
                      </label>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <label className="text-[11px] text-slate-500">น้ำหนัก(kg)<input key={`w-${active}-${prefillTick}`} type="number" defaultValue={exStr("weight") || (parent?.weight_kg != null ? String(parent.weight_kg) : "")} onBlur={(e) => saveExtra({ weight: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">กว้าง(cm)<input key={`wd-${active}-${prefillTick}`} type="number" defaultValue={exStr("width") || (parent?.box_width != null ? String(parent.box_width) : "")} onBlur={(e) => saveExtra({ width: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">ยาว(cm)<input key={`ln-${active}-${prefillTick}`} type="number" defaultValue={exStr("length") || (parent?.box_length != null ? String(parent.box_length) : "")} onBlur={(e) => saveExtra({ length: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                      <label className="text-[11px] text-slate-500">สูง(cm)<input key={`h-${active}-${prefillTick}`} type="number" defaultValue={exStr("height") || (parent?.box_height != null ? String(parent.box_height) : "")} onBlur={(e) => saveExtra({ height: e.target.value })} className="mt-1 w-full h-8 border border-slate-200 rounded-md px-2 text-sm" /></label>
                    </div>
                    <p className="text-[10px] text-slate-400">💡 บาร์โค้ด/น้ำหนัก/ขนาดกล่อง ดึงจากข้อมูลสินค้าให้อัตโนมัติ — แก้ทับได้ถ้าต้องการ (คลิกออกจากช่องเพื่อบันทึก)</p>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">สถานะของขวัญ</p>
                      <div className="flex gap-2">
                        {([["on", "เปิด"], ["gift_only", "เฉพาะของขวัญ"], ["off", "ปิด"]] as const).map(([v, l]) => (
                          <button key={v} onClick={() => saveExtra({ gift_status: v })} className={`h-7 px-2.5 text-xs rounded-full border ${(extra.gift_status ?? "on") === v ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600"}`}>{l}</button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] text-slate-500 mb-1">หมวดของขวัญ (เลือกได้หลายอัน)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {["For Her", "For Him", "Mom & Kids", "Seniors", "Couples", "Pet Lovers"].map((c) => (
                          <button key={c} onClick={() => toggleGiftCat(c)} className={`h-7 px-2.5 text-xs rounded-full border ${giftCats.includes(c) ? "bg-violet-600 text-white border-violet-600" : "bg-white border-slate-200 text-slate-600"}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-medium text-slate-600 mb-2">ฟิลด์จำเป็นของ {activePf?.name_th ?? "แพลตฟอร์ม"}</p>
                  <ul className="space-y-1">
                    {checks.map((c, i) => (
                      <li key={i} className={`text-xs flex items-center gap-2 ${c.ok ? "text-slate-600" : c.required ? "text-rose-600" : "text-amber-600"}`}><span>{c.ok ? "✓" : "✗"}</span>{c.label}{!c.required && <span className="text-[10px] text-slate-400">(แนะนำ)</span>}</li>
                    ))}
                  </ul>
                  {activePf?.code === "line_shopping" && (
                    activeDraft.platform_product_id
                      ? <div className="mt-2 space-y-1.5">
                          <p className="text-[11px] text-emerald-700">✓ มีบน LINE แล้ว (รหัส {String(activeDraft.platform_product_id)}) — แก้ราคา/ส่วนลดในตาราง SKU แล้วกดส่ง</p>
                          {canEdit && <div className="flex flex-wrap gap-2">
                            <button onClick={pushPricesLine} disabled={pushingPrice} className="h-8 px-3 text-xs font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{pushingPrice ? "กำลังส่ง..." : "⬆️ ส่งราคา/ส่วนลด"}</button>
                            <button onClick={() => setDisplayLine("onsale")} disabled={displaying} className="h-8 px-3 text-xs text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">▶ เปิดขาย</button>
                            <button onClick={() => setDisplayLine("hide")} disabled={displaying} className="h-8 px-3 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">⏸ ปิดขาย</button>
                            <button onClick={unlinkFromPlatform} disabled={matching} title="ให้ระบบลืมว่าสินค้านี้เชื่อมกับ LINE (ไม่ลบของจริงบนร้าน) เพื่อกดสร้างใหม่ได้" className="h-8 px-3 text-xs text-rose-600 border border-rose-200 rounded-lg hover:bg-rose-50 disabled:opacity-50">🔓 เลิกเชื่อม</button>
                          </div>}
                          {/* ลิงก์สินค้าบนร้าน LINE — ก๊อปไปแชร์/โพสต์ได้ */}
                          <div>
                            <p className="text-[11px] text-slate-400 mb-0.5">🔗 ลิงก์สินค้าบน LINE</p>
                            {shopLink ? (
                              <div className="flex items-center gap-1.5">
                                <input readOnly value={shopLink} onFocus={(e) => e.currentTarget.select()} className="flex-1 min-w-0 h-8 border border-slate-200 rounded-md px-2 text-xs text-slate-600 bg-slate-50" />
                                <button onClick={copyShopLink} className="h-8 px-2.5 text-xs text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50 shrink-0">📋 คัดลอก</button>
                                <a href={shopLink} target="_blank" rel="noopener noreferrer" className="h-8 px-2.5 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0 flex items-center">เปิด ↗</a>
                              </div>
                            ) : (
                              <p className="text-[11px] text-amber-600">ยังสร้างลิงก์ไม่ได้ — ตั้ง “Shop ID / ลิงก์ร้าน {activePf.name_th}” ที่ <a href="/admin/platform-accounts" target="_blank" rel="noopener noreferrer" className="underline">ตั้งค่าร้าน</a> ก่อน (เช่น louismontini หรือวางลิงก์ร้านเต็ม)</p>
                            )}
                          </div>
                        </div>
                      : canEdit && <button onClick={createOnLine} disabled={creating || !ready} title={!ready ? "กรอกฟิลด์จำเป็นให้ครบก่อน (ดูรายการด้านบน)" : "สร้างสินค้าใหม่บน LINE"} className="mt-2 w-full h-9 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{creating ? "กำลังสร้าง..." : "🆕 สร้างสินค้าใหม่บน LINE"}</button>
                  )}
                </div>

                {/* ประวัติการแก้/ส่งขึ้นแพลตฟอร์ม (audit) — ใครทำอะไร เมื่อไหร่ */}
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <button onClick={toggleLog} className="flex items-center gap-2 text-xs font-medium text-slate-600 hover:text-slate-800">
                      <span className="text-[10px]">{showLog ? "▲" : "▼"}</span> 📜 ประวัติการแก้/ส่งขึ้นแพลตฟอร์ม
                    </button>
                    {showLog && <button onClick={() => void loadLog()} className="text-[11px] text-violet-600 hover:underline">🔄 รีเฟรช</button>}
                  </div>
                  {showLog && (
                    <div className="mt-2">
                      {logLoading ? <p className="text-xs text-slate-400">กำลังโหลด…</p>
                        : logRows.length === 0 ? <p className="text-xs text-slate-400">ยังไม่มีประวัติ</p>
                        : <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                            {logRows.map((e, i) => (
                              <li key={i} className="flex items-start gap-2 py-1 text-xs">
                                <span className="text-slate-400 shrink-0 w-[5.5rem] tabular-nums">{fmtLogTime(e.at)}</span>
                                <span className="flex-1 text-slate-700">{logLabel(e)}</span>
                                <span className="text-slate-400 shrink-0 truncate max-w-[9rem]" title={e.actor ?? ""}>{e.actor ?? "—"}</span>
                              </li>
                            ))}
                          </ul>}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between gap-2 shrink-0">
              <span className="text-[11px] text-slate-400">{dirty ? <span className="text-amber-600 font-medium">● มีข้อมูลที่ยังไม่บันทึก</span> : "แก้แล้วกด “บันทึก” · ลงขายเป็นแบบจำลอง (mock)"}</span>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => { if (!dirty || window.confirm("มีข้อมูลที่ยังไม่ได้บันทึก — ออกโดยไม่บันทึก?")) onClose(); }} className="h-9 px-4 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">ปิด</button>
                {canEdit && <button onClick={saveAll} disabled={!dirty || savingAll} className={`h-9 px-4 text-sm font-medium rounded-lg ${dirty ? "text-white bg-emerald-600 hover:bg-emerald-700" : "text-slate-400 bg-slate-100 cursor-not-allowed"} disabled:opacity-60`}>{savingAll ? "กำลังบันทึก..." : "💾 บันทึก"}</button>}
                {canPublish && <button onClick={publishOnePlatform} disabled={!canPublish || publishing || !ready || !account?.is_active} title={!canPublish ? "ไม่มีสิทธิ์ลงขาย" : !account?.is_active ? "ยังไม่มีร้าน" : !ready ? "ข้อมูลยังไม่ครบ" : ""} className="h-9 px-4 text-sm font-medium text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:bg-slate-300 disabled:cursor-not-allowed">{publishing ? "..." : published ? "🔄 ส่ง update" : "📤 ลงขาย"}</button>}
              </div>
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
      {/* ตัวแก้สินค้ากลาง (SKU) — แก้ราคา/สี/รูป หรือเพิ่มสีใหม่ (recordId null = สร้างใต้ parent นี้) · ปิดแล้วโหลดใหม่ */}
      {skuEditor && parent && (
        <MasterRecordDrawer moduleKey="skus-v2" apiPath="skus" recordId={skuEditor.recordId} startInEdit
          createTitle="เพิ่มสี (SKU ใหม่)"
          createDefaults={skuEditor.recordId ? undefined : { parent_sku_id: parent.id }}
          onClose={() => { setSkuEditor(null); load(); }} onChanged={load} />
      )}
      {/* ตัวช่วยสร้าง SKU หลายชั้น (สี × ตัวเลือก) — ปิดแล้วโหลดตาราง SKU ใหม่ */}
      {matrixOpen && parent && (
        <VariantMatrixModal parentSkuId={parent.id} onClose={() => setMatrixOpen(false)} onCreated={load} />
      )}
    </>,
    document.body,
  );
}
