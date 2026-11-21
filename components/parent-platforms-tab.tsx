"use client";

/**
 * ParentPlatformsTab — แท็บ "🏬 แพลตฟอร์ม" ใน Parent SKU (drawer/หน้าเต็ม)
 * แสดงทุกแพลตฟอร์มที่เปิดใช้เป็นแถว: สถานะ (ยังไม่ทำ/มีร่าง/ลงขายแล้ว) + ฟิลด์สรุป
 * (ชื่อ/หมวดหมู่/รูปที่จะส่ง/ร้าน) + ปุ่ม "จัดการ"
 *
 * หมวดกลางสำหรับลงขาย (platform_category_id → platform_central_categories):
 *   เลือกครั้งเดียวที่หัวแท็บ → หมวดของแต่ละร้านเติมอัตโนมัติตามที่จับคู่ไว้
 *   (/master/platform-categories) · ร่างต่อร้านยัง override ได้
 *
 * เจ้าของขอ 2026-11-11: ร้านที่แบรนด์นี้ยังไม่เชื่อม → ซ่อน (พับเป็นบรรทัดเดียว กด "แสดง" ได้) จะได้ไม่รก
 *   · ลงขายแล้ว → ปุ่ม "ดูหน้าร้าน/หลังร้าน" (ของกลาง ListingLinks) + "จัดการบนร้าน" เปิดลิ้นชักสินค้าบนร้าน (ListingDrawer)
 *   กฎแบ่งแถว = lib/platform-visibility (pure + เทสต์)
 * เจ้าของขอ 2026-11-15 (3 ข้อ):
 *   1) "จัดการ →" ของร้านที่มีหน้าดูก่อนส่ง (LINE/Shopee/Lazada/TikTok · lib/platform-create-registry) = หน้าเดียวกับตัวช่วยลงสินค้า
 *      (PlatformDraftEditorModal — ดึงชื่อ/รายละเอียด/รูปจากสินค้าให้เลย · แก้ลงร่าง ไม่ส่งขึ้นร้าน) · ร้านอื่นยังใช้ ProductPlatformManager
 *   2) "ซ่อนร้านนี้" ทั้งแบรนด์ (เช่น Instagram ที่เชื่อมไว้แค่โพสต์) — lib/listing-hidden-platforms · ร้านที่ซ่อนไม่อยู่ใน "ลงทุกร้าน"
 *   3) ป้ายต่อแถว "พร้อมลง / ขาด N: …" — GET /api/product-platforms/create-readiness (ตัวประกอบข้อมูลตัวเดียวกับตัวช่วย · คำขอเดียวทุกร้าน)
 *      กดป้าย = เปิดหน้าแก้ของร้านนั้น · ตรวจตอนเปิดแท็บ / หลังแก้ / กดรีเฟรช (ไม่ตรวจซ้ำตอนสลับหน้าต่าง — ตัวตรวจถามร้านจริง)
 * เจ้าของขอ 2026-11-21 ("ถ้าเปลี่ยนรูป/รายละเอียด/สี/ราคา แล้วร้านไม่ตรง เช็กได้ไหม + ปุ่มเปลี่ยนให้เลย"):
 *   ร้านที่ลงขายแล้ว → ป้าย "ไม่ตรงระบบ: รูป · ราคา …" / "ตรงกับระบบ" + ปุ่ม "อัปเดตให้ตรง" (MatchSystemDialog — เทียบก่อน/หลังแล้วค่อยยืนยันส่ง)
 *   ผลตรวจ = /api/platform-catalog/drift (ของกลาง lib/platform-listing-drift-server) · เปิดแท็บแล้วผลเก่าเกิน 20 ชม. = ตรวจใหม่เอง
 * เจ้าของเลือก 2026-11-21 ข้อ 3 (บั๊ก LY22 ลง Lazada ทางอื่นแล้วแต่ขึ้น "พร้อมลง"): แถวร้านที่เช็กได้ (Lazada/Shopee/TikTok) บอก "ข้อมูลร้าน X ก่อน"
 *      + ปุ่ม "เช็กกับร้าน" (POST /api/product-platforms/shop-check · ดึงเฉพาะตัวที่เปลี่ยนแล้วจับคู่) · ข้อมูลเก่าเกิน 2 ชม. → "ลงร้านนี้" เป็น "เช็กกับร้านก่อนลง"
 * ของกลาง: /api/product-platforms (guardApi products.platforms.view) · MatchSystemDialog · ProductPlatformManager · PlatformDraftEditorModal · AddToPlatformWizard · ListingDrawer · ListingLinks
 */
import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { PlatformIcon } from "@/components/platform-icon";
import { CentralCategoryPicker } from "@/components/central-category-picker";
import { Icon } from "@/components/icon";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { isSellingPlatform } from "@/lib/selling-platforms";
import { hasCreatePreview } from "@/lib/platform-create-registry";
import { splitPlatformsByConnection } from "@/lib/platform-visibility";
import { readinessText, type CreateReadiness } from "@/lib/platform-create-readiness";
import { catalogAgeText, isCatalogStale } from "@/lib/catalog-refresh-plan";
import { ListingLinks } from "@/components/platform-catalog/listing-links";
import { DRIFT_STALE_HOURS, driftBadgeText, type DriftItem, type DriftKey } from "@/lib/platform-listing-drift";

/** ร้านที่เทียบกับระบบได้ (ตรงกับ DRIFT_PLATFORMS ฝั่งเซิร์ฟเวอร์) */
const DRIFT_CODES = ["shopee", "lazada", "tiktok", "line_shopping"];
type DriftRow = { listing_id: string; platform_code: string; issues: DriftKey[]; items: DriftItem[] | null; error: string | null; checked_at: string };

// dynamic กัน import วน (ProductPlatformManager → master-crud → ParentPlatformsTab)
const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });
// ตัวช่วยลงสินค้า (ของกลาง) — ปุ่ม "ลงร้านนี้" (ทาง 2 ของ flow ลงสินค้า · ทาง 1 = หน้าสินค้าบนแพลตฟอร์ม)
const AddToPlatformWizard = dynamic(() => import("@/components/platform-listing/add-to-platform-wizard").then((m) => m.AddToPlatformWizard), { ssr: false });
// หน้าแก้ร่าง = หน้าดูก่อนส่งตัวเดียวกับตัวช่วย (ร้านที่มีตัวสร้าง)
const PlatformDraftEditorModal = dynamic(() => import("@/components/platform-listing/draft-editor-modal").then((m) => m.PlatformDraftEditorModal), { ssr: false });
// ลิ้นชักสินค้าบนร้าน (ของกลาง — ตัวเดียวกับหน้าสินค้าบนแพลตฟอร์ม) · เปิดเมื่อสินค้านี้มีรายการบนร้านจับคู่อยู่
const ListingDrawer = dynamic(() => import("@/components/platform-catalog/listing-drawer").then((m) => m.ListingDrawer), { ssr: false });
// หน้าเทียบ "บนร้าน → ตามระบบ" แล้วส่งให้ตรง (ของกลาง)
const MatchSystemDialog = dynamic(() => import("@/components/platform-catalog/match-system-dialog").then((m) => m.MatchSystemDialog), { ssr: false });

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Draft = { title?: string | null; category_path?: string | null; image_keys?: string[]; status?: string | null; platform_product_id?: string | null; last_sync_status?: string | null };
type Account = { label: string | null; is_active: boolean; external_shop_id?: string | null };
type Parent = { code?: string; name_platform?: string; name_th?: string; platform_category_id?: string | null; platform_category_name?: string | null; brand_id?: string | null; brand_name?: string | null };
type Matched = Record<string, { id?: string; external_id: string | null; title?: string | null }>;
/** ร้านที่เช็กกับร้านจริงได้ (ดึงเฉพาะตัวที่เปลี่ยน · app/api/platform-catalog/refresh-changed) */
const SHOP_CHECKABLE = new Set(["lazada", "shopee", "tiktok"]);

const isOnSaleOf = (d: Draft | undefined, m: Matched[string] | undefined) =>
  !!d && (d.status === "published" || d.last_sync_status === "success" || !!d.platform_product_id) || !!m;

export function ParentPlatformsTab({ parentId }: { parentId: string | null }) {
  const [loading, setLoading] = useState(true);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [accounts, setAccounts] = useState<Record<string, Account>>({});
  const [mappings, setMappings] = useState<Record<string, string>>({});   // platform_id → หมวดของร้าน (จากหมวดกลาง)
  const [parent, setParent] = useState<Parent | null>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [manage, setManage] = useState<string | null>(null); // platform id ที่เปิดตัวจัดการรุ่นแรกอยู่ (ร้านที่ไม่มีหน้าดูก่อนส่ง)
  const [draftFor, setDraftFor] = useState<string | null>(null);  // platform id ที่เปิดหน้าแก้ร่าง (หน้าดูก่อนส่งของร้าน)
  const [matched, setMatched] = useState<Matched>({});   // platform_id → รายการบนร้านที่จับคู่สินค้านี้อยู่
  const [addOn, setAddOn] = useState<string | null>(null);    // platform code ที่เปิดตัวช่วยลงสินค้า
  const [openListing, setOpenListing] = useState<string | null>(null);   // id รายการบนร้าน (platform_catalog_listings) ที่เปิดลิ้นชักอยู่
  const [showHidden, setShowHidden] = useState(false);        // กด "แสดง" ร้านที่ยังไม่เชื่อม
  const [showBrandHidden, setShowBrandHidden] = useState(false);   // กด "แสดง" ร้านที่แบรนด์สั่งซ่อน
  const [hiddenCodes, setHiddenCodes] = useState<string[]>([]);    // ร้านที่แบรนด์สั่งซ่อน (platform code)
  const [hidingCode, setHidingCode] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Record<string, CreateReadiness>>({});   // platform code → ความพร้อมลง
  const [checkingReady, setCheckingReady] = useState(false);
  const [drift, setDrift] = useState<Record<string, DriftRow>>({});      // listing id → ผลเทียบกับระบบล่าสุด
  const [checkingDrift, setCheckingDrift] = useState(false);
  const [matchFor, setMatchFor] = useState<{ listingId: string; name: string } | null>(null);
  const driftSeqRef = useRef(0);
  const [freshness, setFreshness] = useState<Record<string, string | null>>({});   // platform code → ข้อมูลร้านสดถึงเมื่อไร
  const [checkingShop, setCheckingShop] = useState<string | null>(null);              // platform code ที่กำลังเช็กกับร้าน
  const { can } = useAuth();
  const toast = useToast();
  const canAdd = can("products.platforms.edit");
  const canPublish = can("products.platforms.publish");
  const canEditPrice = can("products.edit");
  const lastLoadRef = useRef(0);                              // เวลาที่โหลดล่าสุด (ใช้หน่วง auto-refresh)
  // สินค้าที่โหลดเสร็จล่าสุด — โหลดซ้ำของสินค้าเดิม (กดรีเฟรช / ตัวช่วยลงสินค้าเสร็จ) ต้องไม่ซ่อนทั้งแท็บ
  // 🐛 2026-11-15: เดิมโหลดซ้ำ = แสดง "กำลังโหลด…" แทนทั้งแท็บ → ตัวช่วยลงสินค้าถูกถอดแล้วเปิดใหม่ที่ขั้น 1 (ผลการลงหาย · เจ้าของเห็นว่า "เด้งกลับ")
  const loadedForRef = useRef<string | null>(null);
  const readySeqRef = useRef(0);                              // กันผลตรวจรอบเก่ามาทับรอบใหม่

  // ตรวจความพร้อมลง (คำขอเดียวทุกร้าน) — ไม่บล็อกแท็บ แถวโชว์ก่อน ป้ายตามมา
  const loadReadiness = useCallback(async (codes: string[]) => {
    if (!parentId) return;
    const seq = ++readySeqRef.current;
    if (!codes.length) { setReadiness({}); setCheckingReady(false); return; }
    setCheckingReady(true);
    try {
      const j = await apiFetch(`/api/product-platforms/create-readiness?parent_sku_id=${encodeURIComponent(parentId)}&codes=${encodeURIComponent(codes.join(","))}`).then((r) => r.json());
      if (seq === readySeqRef.current) setReadiness((j.data ?? {}) as Record<string, CreateReadiness>);
    } catch { if (seq === readySeqRef.current) setReadiness({}); }
    finally { if (seq === readySeqRef.current) setCheckingReady(false); }
  }, [parentId]);

  // ร้านที่ลงขายแล้ว ตรงกับระบบไหม — อ่านผลที่จดไว้ก่อน · ผลเก่า/ยังไม่เคยตรวจ = ตรวจสด (ดึงจากร้านจริง) ตามหลัง ไม่บล็อกแท็บ
  const loadDrift = useCallback(async (listed: string[]) => {
    if (!parentId || !listed.length) { setDrift({}); return; }
    const seq = ++driftSeqRef.current;
    const toMap = (rows: DriftRow[]) => Object.fromEntries(rows.map((r) => [r.listing_id, r]));
    try {
      const j = await apiFetch(`/api/platform-catalog/drift?parent_sku_id=${encodeURIComponent(parentId)}`).then((r) => r.json());
      if (seq !== driftSeqRef.current) return;
      const m = toMap((j.rows ?? []) as DriftRow[]);
      setDrift(m);
      const stale = listed.some((id) => !m[id] || Date.now() - Date.parse(m[id].checked_at) > DRIFT_STALE_HOURS * 3600_000);
      if (!stale) return;
      setCheckingDrift(true);
      const k = await apiFetch("/api/platform-catalog/drift", { method: "POST", body: JSON.stringify({ action: "recheck", parent_sku_id: parentId }) }).then((r) => r.json());
      if (seq === driftSeqRef.current && !k.error) setDrift(toMap((k.rows ?? []) as DriftRow[]));
    } catch { /* ป้ายไม่ขึ้นก็ยังใช้แท็บได้ */ }
    finally { if (seq === driftSeqRef.current) setCheckingDrift(false); }
  }, [parentId]);

  const load = useCallback(async (opts?: { readiness?: boolean }) => {
    if (!parentId) return;
    setLoading(true);
    try {
      const j = await apiFetch(`/api/product-platforms?parent_sku_id=${encodeURIComponent(parentId)}&with=freshness`).then((r) => r.json());
      const pfs = (j.platforms ?? []) as Platform[];
      const ds = (j.drafts ?? {}) as Record<string, Draft>;
      const accts = (j.accounts ?? {}) as Record<string, Account>;
      const ms = (j.matchedListings ?? {}) as Matched;
      const hid = (j.hiddenPlatformCodes ?? []) as string[];
      setPlatforms(pfs); setDrafts(ds); setAccounts(accts); setMatched(ms); setHiddenCodes(hid);
      setMappings((j.mappings ?? {}) as Record<string, string>);
      setParent((j.parent ?? null) as Parent | null);
      setFreshness((j.catalog_freshness ?? {}) as Record<string, string | null>);
      lastLoadRef.current = Date.now();
      loadedForRef.current = parentId;
      // ตรวจเฉพาะร้านที่โชว์ + มีตัวสร้าง + สินค้านี้ยังไม่อยู่บนร้าน
      if (opts?.readiness !== false) {
        void loadReadiness(pfs.filter((p) => hasCreatePreview(p.code) && !!accts[p.id]?.is_active && !hid.includes(p.code) && !isOnSaleOf(ds[p.id], ms[p.id])).map((p) => p.code));
        void loadDrift(pfs.filter((p) => DRIFT_CODES.includes(p.code) && !!ms[p.id]?.id).map((p) => ms[p.id]!.id!));
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [parentId, loadReadiness, loadDrift]);
  const refreshAll = useCallback(() => { void load(); }, [load]);
  useEffect(() => { setReadiness({}); void load(); }, [load]);

  // โหลดใหม่เมื่อกลับมาที่แท็บ — หน่วง 15 วิ กัน spam (เบา ไม่กระทบความเร็ว) · ไม่ตรวจความพร้อมซ้ำ (ตัวตรวจถามร้านจริง)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLoadRef.current < 15000) return;
      void load({ readiness: false });
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [load]);

  const saveCat = useCallback(async (v: string) => {
    if (!parentId) return;
    setSavingCat(true);
    try {
      await apiFetch("/api/product-platforms", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ set_platform_category: true, parent_sku_id: parentId, platform_category_id: v || null }),
      });
      await load();
    } finally { setSavingCat(false); }
  }, [parentId, load]);

  // ซ่อน/เลิกซ่อนร้านนี้ทั้งแบรนด์
  const setBrandHidden = useCallback(async (p: Platform, hidden: boolean) => {
    const brandId = parent?.brand_id;
    if (!brandId) return;
    setHidingCode(p.code);
    try {
      const j = await apiFetch("/api/product-platforms", { method: "PATCH", body: JSON.stringify({ set_platform_hidden: true, brand_id: brandId, platform_code: p.code, hidden }) }).then((r) => r.json());
      if (j.error) { toast.error(`บันทึกไม่สำเร็จ: ${j.error}`); return; }
      setHiddenCodes((j.hidden_codes ?? []) as string[]);
      const brand = parent?.brand_name ? `แบรนด์ ${parent.brand_name}` : "แบรนด์นี้";
      toast.success(hidden ? `ซ่อน ${p.name_th} สำหรับทุกสินค้าของ${brand}แล้ว — กด "แสดง" ด้านล่างเพื่อดู/เลิกซ่อน` : `แสดง ${p.name_th} สำหรับทุกสินค้าของ${brand}แล้ว`);
      if (!hidden) void load();
    } catch (e) { toast.error(`บันทึกไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setHidingCode(null); }
  }, [parent, toast, load]);

  // เช็กกับร้านตอนนี้ (ดึงเฉพาะตัวที่เปลี่ยน แล้วดูว่าสินค้านี้อยู่บนร้านไหม) · thenAdd = ไม่เจอแล้วเปิดตัวช่วยลงสินค้าต่อ
  const checkShop = useCallback(async (p: Platform, thenAdd = false) => {
    if (!parentId) return;
    setCheckingShop(p.code);
    try {
      const j = await apiFetch("/api/product-platforms/shop-check", { method: "POST", body: JSON.stringify({ parent_sku_id: parentId, platform_code: p.code }) }).then((r) => r.json()) as
        { error: string | null; on_shop: { external_id: string | null } | null; fresh_at: string | null; refreshed: { ok: boolean; error: string | null } | null };
      if (j.error) { toast.error(`เช็กกับ ${p.name_th} ไม่สำเร็จ: ${j.error}`); return; }
      if (j.fresh_at) setFreshness((f) => ({ ...f, [p.code]: j.fresh_at }));
      if (j.on_shop) { toast.success(`เจอสินค้านี้บน ${p.name_th} แล้ว${j.on_shop.external_id ? ` (#${j.on_shop.external_id})` : ""} — จับคู่ให้แล้ว ไม่ต้องลงซ้ำ`); void load(); return; }
      if (j.refreshed && !j.refreshed.ok) { toast.error(`เช็กกับ ${p.name_th} ไม่สำเร็จ: ${j.refreshed.error ?? "ไม่ทราบสาเหตุ"} — ยังไม่แน่ใจว่ามีบนร้านหรือยัง`); return; }
      toast.success(`ยังไม่มีบน ${p.name_th} (เช็กกับร้านเมื่อสักครู่)`);
      if (thenAdd) setAddOn(p.code);
    } catch (e) { toast.error(`เช็กกับ ${p.name_th} ไม่สำเร็จ: ${(e as Error).message}`); }
    finally { setCheckingShop(null); }
  }, [parentId, toast, load]);

  if (!parentId) return <div className="text-sm text-slate-400 py-8 text-center">บันทึกสินค้าก่อน แล้วค่อยตั้งค่าการขายแต่ละแพลตฟอร์ม</div>;
  if (loading && loadedForRef.current !== parentId) return <div className="text-sm text-slate-400 py-8 text-center">กำลังโหลด…</div>;
  if (platforms.length === 0) return <div className="text-sm text-slate-400 py-8 text-center">ยังไม่มีแพลตฟอร์มที่เปิดใช้ — เพิ่มที่ตั้งค่า</div>;

  const isOnSale = (p: Platform) => isOnSaleOf(drafts[p.id], matched[p.id]);
  // ร้านที่แบรนด์ยังไม่เชื่อม / แบรนด์สั่งซ่อน → พับซ่อน (กฎ lib/platform-visibility · ของที่ขายอยู่ยังโชว์)
  const { shown, hidden, brandHidden } = splitPlatformsByConnection(platforms, (p) => !!accounts[p.id]?.is_active, isOnSale, (p) => hiddenCodes.includes(p.code));
  const rows = [...shown, ...(showBrandHidden ? brandHidden : []), ...(showHidden ? hidden : [])];
  // ลงทุกร้านในครั้งเดียว: ร้านที่โชว์ (เชื่อมแล้ว · ไม่ถูกซ่อน) + มีตัวสร้างสินค้า (lib/platform-create-registry) + สินค้านี้ยังไม่อยู่บนร้านนั้น
  const allCodes = shown.filter((p) => hasCreatePreview(p.code) && !isOnSale(p)).map((p) => p.code);
  const draftPf = draftFor ? platforms.find((p) => p.id === draftFor) ?? null : null;
  const parentLabel = [parent?.code, parent?.name_th || parent?.name_platform].filter(Boolean).join(" · ") || null;
  const openEditor = (p: Platform) => { if (hasCreatePreview(p.code) && !isOnSale(p)) setDraftFor(p.id); else setManage(p.id); };

  return (
    <div className="space-y-3">
      {/* หมวดกลางสำหรับลงขาย — เลือกครั้งเดียว เติมทุกร้านอัตโนมัติ */}
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs font-medium text-indigo-900 shrink-0">🗂️ หมวดกลางสำหรับลงขาย</span>
        <CentralCategoryPicker value={parent?.platform_category_id ?? null} disabled={savingCat}
          onChange={(id) => void saveCat(id ?? "")} placeholder="— ยังไม่เลือก —" className="min-w-[16rem] flex-1 max-w-md" webParentId={parentId ?? null} />
        <span className="basis-full text-[11px] text-indigo-700/70">เลือกครั้งเดียว → หมวดของแต่ละร้านจะเติมให้อัตโนมัติตามที่จับคู่ไว้ (ยังแก้เองรายร้านได้)</span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">รายละเอียดการขายแต่ละแพลตฟอร์ม — กด “จัดการ” เพื่อดู/แก้ชื่อ หมวดหมู่ รูป ราคา ที่จะส่งขึ้นร้าน (ดึงจากสินค้าให้แล้ว)</p>
        {canAdd && allCodes.length > 1 && (
          <button type="button" onClick={() => setAddOn("__all")} title="ดูก่อนส่งทีละร้าน แล้วลงทุกร้านในครั้งเดียว (ร้านที่ยังไม่เปิดลงจริงจะบันทึกร่างไว้ · ไม่รวมร้านที่ซ่อน)"
            className="ml-auto shrink-0 text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5">ลงทุกร้าน ({allCodes.length})</button>
        )}
        <button type="button" onClick={refreshAll} disabled={loading || checkingReady} title="โหลดข้อมูลล่าสุด + ตรวจความพร้อมลงใหม่"
          className="shrink-0 text-xs text-slate-500 hover:text-violet-700 border border-slate-200 rounded-lg px-2 py-1 hover:bg-violet-50 disabled:opacity-40">
          <span className={loading || checkingReady ? "inline-block animate-spin" : ""}>🔄</span> รีเฟรช
        </button>
      </div>
      {shown.length === 0 && !showHidden && !showBrandHidden && (
        <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500">
          แบรนด์ของสินค้านี้ยังไม่ได้เชื่อมร้านไหน — เชื่อมร้านได้ที่ตั้งค่าบัญชีร้านของแบรนด์
        </div>
      )}
      {rows.map((p) => {
        const d = drafts[p.id] ?? {};
        const acct = accounts[p.id];
        const onShop = matched[p.id];   // มีรายการบนร้านจับคู่อยู่ (เช่น นำเข้า/ดึงจากร้าน) แม้ร่างยังไม่มีรหัส
        const onSale = isOnSale(p);
        const extId = d.platform_product_id || onShop?.external_id || null;
        const showAdd = canAdd && !onSale && isSellingPlatform(p.code);
        const hasDraft = !!(d.title || d.category_path || (d.image_keys?.length));
        const isBrandHidden = hiddenCodes.includes(p.code) && !onSale;
        const status = onSale ? { t: "ลงขายแล้ว", c: "text-emerald-700 bg-emerald-50 border-emerald-200" }
          : hasDraft ? { t: "มีร่าง", c: "text-blue-700 bg-blue-50 border-blue-200" }
          : { t: "ยังไม่ทำ", c: "text-slate-500 bg-slate-50 border-slate-200" };
        // ร้านที่มีตัวสร้าง: ค่าที่จะส่งจริงจากตัวประกอบข้อมูลของร้าน (ดึงจากสินค้าให้แล้ว) · ร้านอื่น = ค่าในร่าง
        const rd = !onSale && hasCreatePreview(p.code) ? readiness[p.code] : undefined;
        const rdv = rd && !rd.error ? rd : null;   // ตรวจสำเร็จ
        // ลงขายแล้ว = ชื่อบนร้านจริง (รอบดึงสินค้าล่าสุด) · ยังไม่ลง = ชื่อที่จะส่ง
        //   🐛 2026-11-21 LY22: เดิมโชว์ชื่อในร่าง (ชื่อเวอร์ชันเก่า) ทั้งที่ลงขายแล้ว → ดูเหมือนตรงกับระบบ
        const shopTitle = onSale && onShop?.title ? onShop.title : null;
        const name = shopTitle || rdv?.title || d.title || parent?.name_platform || parent?.name_th || "—";
        const auto = (mappings[p.id] ?? "").trim();            // หมวดของร้านนี้จากหมวดกลาง
        const catValue = rdv?.category || d.category_path || auto || "— ยังไม่ตั้ง";
        const fromCentral = !rdv && !d.category_path && !!auto;   // เติมมาจากหมวดกลาง (ยังไม่ได้ override)
        const imgCount = rdv ? rdv.images : d.image_keys?.length ?? 0;
        const badge = rd ? readinessText(rd) : null;
        // ลงขายแล้ว → ตรงกับระบบไหม
        const dr = onShop?.id && DRIFT_CODES.includes(p.code) ? drift[onShop.id] : undefined;
        const drIssues = dr && !dr.error ? dr.issues : [];
        const drDiff = dr && !dr.error ? (dr.items ?? []).filter((i) => i.state === "diff") : [];
        const openMatch = () => { if (onShop?.id) setMatchFor({ listingId: onShop.id, name: p.name_th }); };
        // เช็กกับร้านจริงได้ (ยังไม่อยู่บนร้าน · เชื่อมร้านแล้ว) — ข้อมูลร้านเก่าเกิน 2 ชม. = เตือน + ต้องเช็กก่อนลง
        const checkable = SHOP_CHECKABLE.has(p.code) && !onSale && !!acct?.is_active && !isBrandHidden;
        const freshAt = freshness[p.code] ?? null;
        const stale = checkable && isCatalogStale(freshAt, Date.now());
        return (
          <div key={p.id} className={`rounded-xl border border-slate-200 overflow-hidden ${isBrandHidden ? "opacity-70" : ""}`}>
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 border-b border-slate-200 flex-wrap">
              <span className="text-sm font-medium text-slate-800 inline-flex items-center gap-1.5"><PlatformIcon code={p.code} iconKey={p.icon_key} size={18} /> {p.name_th}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full border ${status.c}`}>{status.t}</span>
              {isBrandHidden && <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 bg-white text-slate-500">ซ่อนอยู่ (ทั้งแบรนด์)</span>}
              {/* ความพร้อมลง (ตัวประกอบข้อมูลตัวเดียวกับตัวช่วย) — กด = เปิดหน้าแก้ของร้านนี้ */}
              {badge ? (
                <button type="button" onClick={() => openEditor(p)} title={rd && rd.missing.length ? `ยังขาด:\n• ${rd.missing.join("\n• ")}\n\nกดเพื่อเปิดหน้าแก้` : "กดเพื่อดู/แก้ข้อมูลที่จะส่งขึ้นร้าน"}
                  className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${badge.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : badge.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-500"}`}>
                  <Icon name={badge.tone === "ok" ? "done" : badge.tone === "warn" ? "warning" : "info"} />
                  <span className="truncate max-w-[18rem]">{badge.text}</span>
                </button>
              ) : checkingReady && !onSale && hasCreatePreview(p.code) && !!acct?.is_active && !isBrandHidden ? (
                <span className="text-[11px] text-slate-400">กำลังตรวจความครบ…</span>
              ) : null}
              {/* ลงขายแล้ว: ตรงกับระบบไหม (รูป/รายละเอียด/ชื่อตัวเลือก/ราคา) — กด = หน้าเทียบก่อนส่ง */}
              {onShop?.id && DRIFT_CODES.includes(p.code) && (dr ? (
                <button type="button" onClick={openMatch}
                  title={dr.error ? `เทียบไม่สำเร็จ: ${dr.error}` : `ตรวจล่าสุด ${new Date(dr.checked_at).toLocaleString("th-TH")}\nกดเพื่อดูความต่าง`}
                  className={`inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${dr.error ? "border-slate-200 bg-white text-slate-500" : drIssues.length ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                  <Icon name={dr.error ? "info" : drIssues.length ? "warning" : "done"} />
                  <span className="truncate max-w-[18rem]">{dr.error ? "เทียบกับระบบไม่ได้" : driftBadgeText(drIssues)}</span>
                </button>
              ) : checkingDrift ? <span className="text-[11px] text-slate-400">กำลังเทียบกับระบบ…</span> : null)}
              {stale && (
                <span title="รายการสินค้าจากร้านนี้ในระบบยังไม่อัปเดต — ถ้าเพิ่งลงสินค้านี้ทางอื่น (เช่น BigSeller) ระบบอาจยังไม่รู้ กดเช็กกับร้านก่อน"
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                  <Icon name="clock" />ข้อมูลร้าน {catalogAgeText(freshAt, Date.now())}
                </span>
              )}
              {extId && <span className="text-[11px] text-slate-400 font-mono truncate max-w-[10rem]">#{extId}</span>}
              <span className="ml-auto" />
              {checkable && canAdd && (
                <button type="button" disabled={checkingShop === p.code} onClick={() => void checkShop(p)}
                  title={`ถาม ${p.name_th} ตอนนี้ว่ามีสินค้านี้แล้วหรือยัง (อ่านจากร้านอย่างเดียว · เจอแล้วจับคู่ให้)`}
                  className="inline-flex items-center gap-1 text-xs border border-slate-200 text-slate-600 hover:bg-slate-100 rounded-lg px-2 py-1.5 disabled:opacity-50">
                  <span className={checkingShop === p.code ? "inline-flex animate-spin" : "inline-flex"}><Icon name="refresh" /></span>{checkingShop === p.code ? "กำลังเช็ก…" : "เช็กกับร้าน"}
                </button>
              )}
              {/* ลงขายแล้ว → ลิงก์ไปดูสินค้าที่ร้านจริง (หน้าร้าน + หลังร้าน) — ของกลาง lib/platform-links */}
              {onSale && extId && <ListingLinks platformCode={p.code} externalProductId={extId} shopRef={acct?.external_shop_id ?? null} />}
              {/* ซ่อน/แสดงร้านนี้ทั้งแบรนด์ (ไม่โชว์กับร้านที่สินค้านี้ขายอยู่ — ของที่ขายอยู่ห้ามหาย) */}
              {canAdd && parent?.brand_id && !onSale && (
                <button type="button" disabled={hidingCode === p.code} onClick={() => void setBrandHidden(p, !isBrandHidden)}
                  title={isBrandHidden ? `แสดงร้านนี้อีกครั้งในทุกสินค้าของ${parent.brand_name ? `แบรนด์ ${parent.brand_name}` : "แบรนด์นี้"}` : `ซ่อนร้านนี้ในทุกสินค้าของ${parent.brand_name ? `แบรนด์ ${parent.brand_name}` : "แบรนด์นี้"} (เช่น ร้านที่ไม่ได้ขายของ) — กด "แสดง" ด้านล่างเพื่อเลิกซ่อน`}
                  className="inline-flex items-center gap-1 text-xs border border-slate-200 text-slate-500 hover:bg-slate-100 rounded-lg px-2 py-1.5 disabled:opacity-50">
                  <Icon name={isBrandHidden ? "view" : "hide"} />{isBrandHidden ? "แสดงร้านนี้" : "ซ่อน"}
                </button>
              )}
              {showAdd && !isBrandHidden && (stale ? (
                <button type="button" disabled={checkingShop === p.code} onClick={() => void checkShop(p, true)} title="ข้อมูลร้านยังไม่อัปเดต — เช็กกับร้านก่อนว่ายังไม่มีสินค้านี้ แล้วเปิดตัวช่วยลงสินค้า (กันลงซ้ำ)"
                  className="text-xs border border-violet-300 text-violet-700 hover:bg-violet-50 rounded-lg px-3 py-1.5 disabled:opacity-50">เช็กกับร้านก่อนลง</button>
              ) : (
                <button type="button" onClick={() => setAddOn(p.code)} title="ตรวจความครบ แล้วลงสินค้านี้ขึ้นร้าน (หรือบันทึกร่าง)"
                  className="text-xs border border-violet-300 text-violet-700 hover:bg-violet-50 rounded-lg px-3 py-1.5">ลงร้านนี้</button>
              ))}
              {onShop?.id ? (
                <>
                  {drIssues.length > 0 && (
                    <button type="button" onClick={openMatch} title="ดูสิ่งที่ไม่ตรง แล้วเลือกส่งข้อมูลตามระบบขึ้นร้าน (ถามยืนยันก่อนส่ง)"
                      className="text-xs border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 rounded-lg px-2.5 py-1.5">อัปเดตให้ตรง</button>
                  )}
                  <button type="button" onClick={() => setManage(p.id)} title="ร่างในระบบ (ชื่อ/หมวด/รูป ที่จะส่งขึ้นร้าน)"
                    className="text-xs border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg px-2.5 py-1.5">ร่างในระบบ</button>
                  <button type="button" onClick={() => setOpenListing(onShop.id ?? null)} title="เปิดสินค้าบนร้าน — แก้ชื่อ/รูป/ราคา/เปิด-ปิดขาย (ร้านที่รองรับ)"
                    className="text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5">จัดการบนร้าน →</button>
                </>
              ) : (
                <button type="button" onClick={() => openEditor(p)} className="text-xs bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-3 py-1.5">จัดการ →</button>
              )}
            </div>
            <div className="p-3 grid sm:grid-cols-2 gap-y-1.5 gap-x-4">
              <Row label={shopTitle ? "ชื่อบนร้าน" : "ชื่อ"} value={name} />
              <Row label="หมวดหมู่" value={catValue} warn={catValue === "— ยังไม่ตั้ง"} hint={fromCentral ? "จากหมวดกลาง" : undefined} />
              <Row label={rdv ? "รูปที่จะส่ง" : "รูปที่เลือกส่ง"} value={`${imgCount} รูป`} warn={!imgCount} hint={rdv && !d.image_keys?.length && imgCount ? "จากสินค้า" : undefined} />
              <Row label="ร้าน" value={acct?.is_active ? (acct.label || "มีร้าน") : "ยังไม่มีร้าน"} warn={!acct?.is_active}
                hint={checkable ? `ข้อมูลร้าน ${catalogAgeText(freshAt, Date.now())}` : undefined} />
              {drDiff.length > 0 && (
                <div className="sm:col-span-2 flex flex-wrap gap-1 pt-1">
                  {drDiff.map((i) => <span key={i.key} className="max-w-full truncate rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">{i.summary}</span>)}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {brandHidden.length > 0 && (
        <button type="button" onClick={() => setShowBrandHidden((v) => !v)}
          className="w-full text-left text-xs text-slate-500 hover:text-violet-700 px-1 py-1">
          {showBrandHidden
            ? `▴ ซ่อน ${brandHidden.length} ร้านที่แบรนด์นี้สั่งซ่อน`
            : `▾ แบรนด์นี้ซ่อนไว้ ${brandHidden.length} ร้าน (${brandHidden.map((p) => p.name_th).join(", ")}) · แสดง`}
        </button>
      )}
      {hidden.length > 0 && (
        <button type="button" onClick={() => setShowHidden((v) => !v)}
          className="w-full text-left text-xs text-slate-500 hover:text-violet-700 px-1 py-1">
          {showHidden
            ? `▴ ซ่อน ${hidden.length} ช่องทางที่ยังไม่เชื่อมร้าน`
            : `▾ ซ่อนไว้ ${hidden.length} ช่องทางที่แบรนด์นี้ยังไม่เชื่อมร้าน (${hidden.map((p) => p.name_th).join(", ")}) · แสดง`}
        </button>
      )}
      {matchFor && (
        <MatchSystemDialog open listingId={matchFor.listingId} shopName={matchFor.name} canPublish={canPublish}
          onChanged={(c) => setDrift((m) => ({ ...m, [c.listing_id]: { listing_id: c.listing_id, platform_code: c.platform_code, issues: c.issues, items: c.items, error: null, checked_at: c.checked_at } }))}
          onClose={() => setMatchFor(null)} />
      )}
      {openListing && (
        <ListingDrawer listingId={openListing} canPublish={canPublish} onClose={() => { setOpenListing(null); void load(); }} />
      )}
      {addOn && parentId && (
        <AddToPlatformWizard open parents={[{ id: parentId, code: parent?.code ?? "", name: parent?.name_th || parent?.name_platform || null }]}
          initialPlatformCodes={addOn === "__all" ? allCodes : [addOn]} onClose={() => setAddOn(null)} onDone={() => void load()} />
      )}
      {draftPf && parentId && (
        <PlatformDraftEditorModal open parentId={parentId} parentLabel={parentLabel} platform={draftPf} canEdit={canAdd} canEditPrice={canEditPrice}
          onAdd={canAdd && isSellingPlatform(draftPf.code) ? () => { const code = draftPf.code; setDraftFor(null); setAddOn(code); } : undefined}
          onClose={() => { setDraftFor(null); void load(); }} />
      )}
      {manage && parentId && (
        <ProductPlatformManager parentSkuId={parentId} initialPlatformId={manage} onClose={() => { setManage(null); void load(); }} />
      )}
    </div>
  );
}

function Row({ label, value, warn, hint }: { label: string; value: string; warn?: boolean; hint?: string }) {
  return (
    <div className="flex gap-2 text-xs min-w-0">
      <span className="text-slate-400 shrink-0 w-20">{label}</span>
      <span className={`truncate ${warn ? "text-amber-600" : "text-slate-700"}`} title={value}>
        {value}
        {hint && <span className="ml-1 text-[10px] text-indigo-500 align-middle">({hint})</span>}
      </span>
    </div>
  );
}
