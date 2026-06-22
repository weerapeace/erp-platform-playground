"use client";

/**
 * PR Shopping — ขอซื้อแบบช้อปปิ้งสโตร์ (2 แหล่งสินค้า)
 * - SKU จริง: การ์ด = skus_v2 โดยตรง (ค้นหา/กรอง/เลื่อนหน้า ฝั่ง server) → คลิก → popup ยืนยัน
 * - Product Group: product_groups (การ์ด) → product_variations (popup เลือกตัวเลือก)
 * Filter ฝั่งซ้ายไม่ hardcode — ติ๊กเลือก field กรองเองจากทะเบียน field (skus-v2)
 * เลือก → ตะกร้า → สร้างใบขอซื้อ (PR + lines). currency: ร้าน CN → YUAN
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { PrHistoryButton } from "@/components/pr-history";
import { RejectedPanel } from "./orders/approval";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { SkuFormModal } from "@/components/sku-form-modal";
import { RecordFormModal } from "@/components/record-form-modal";
import { ERPModal, useBackdropDismiss } from "@/components/modal";
import { useToast } from "@/components/toast";
import { RelationPicker } from "@/components/relation-picker";
import { ImageGallery, HoverZoomImage, ImageInput } from "@/components/image-input";
import { TagGroupFilter } from "@/components/tag-filter";
import { DupOrderBadge, DupOrderList, type OpenOrder } from "./dup-order";
import type { PurchaseNeedRow } from "@/app/api/mo/purchase-needs/route";
import type { MoListItem } from "@/app/api/mo/route";

// แปลงคำสกุลเงินที่แสดง: ภายในเก็บ "YUAN" (คงข้อมูลเดิม) แต่โชว์ให้ผู้ใช้เป็น "RMB"
const curLabel = (c: string) => (c === "YUAN" ? "RMB" : c);

type SkuInfo = { code: string | null; seller: string; country: string; price: number; currency: string; uom: string };
type Card = { id: string; name: string; sub: string | null; image_key: string | null; sku?: SkuInfo };
type Variation = { key: string; label: string; color: string | null; seller: string; country: string; price: number; currency: string; uom: string; image: string | null; variationId: string | null; skuRef: string | null; skuId: string | null };
type Line = { label: string; qty: number; uom: string; seller: string; price: number; currency: string; image: string | null; variationId: string | null; skuRef: string | null; skuId: string | null; note: string; reason?: string | null; usedForId?: string | null; usedForLabel?: string | null; urgent?: boolean; useDate?: string | null; sourceMoNo?: string | null };
// เหตุผลที่ขอซื้อ (บังคับในป๊อป "เพิ่มลงใบขอซื้อ") — 2 โหมด: เลือกเหตุผล (ข้อความ) หรือ อ้างใบสั่งผลิต
type ReasonPick = { text: string; moNo: string | null; moLabel: string | null };
type Source = "sku" | "group" | "favorite" | "frequent" | "tags" | "mo";

// แท็บ "ใบสั่งผลิต": วัตถุดิบที่ต้องซื้อ 1 ตัว (ของใบใดใบหนึ่ง)
type MoMat = { code: string | null; name: string | null; image: string | null; type: string | null; uom: string | null; needed: number };
// 1 ใบสั่งผลิต + วัตถุดิบที่ยังต้องซื้อของใบนั้น
type MoEntry = { mo_no: string; mo_id: string; product_label: string; product_image: string | null; due_date: string | null; mats: MoMat[] };

// field ที่กรองได้ (ดึงจากทะเบียน field)
// relation = field ที่เป็น FK → ต้องโชว์ "ชื่อ" จากตารางปลายทาง แต่กรองด้วย id
type FilterField = { key: string; column: string; label: string; type: string; relation?: { moduleKey: string; labelField: string }; m2m?: { junction: string; moduleKey: string; labelField: string } };
type ColFilter =
  | { type: "text"; value: string }
  | { type: "number"; min: string; max: string }
  | { type: "boolean"; value: "true" | "false" }
  | { type: "select"; selected: string[] };   // dropdown เลือกค่าจริง (เช่น สี)

const img = (k: string | null | undefined) => (k ? `/api/r2-image?key=${encodeURIComponent(k)}` : null);
const num = (v: unknown) => Number(v ?? 0) || 0;
const PAGE = 48;
const COLS_KEY = "pr_shop_cols";
const FILT_KEY = "pr_shop_filter_keys";
const CART_KEY = "pr_shop_cart";
const SORT_KEY = "pr_shop_sort";
const HIDE_KEY = "pr_shop_hidden_tags";       // cache แท็ก "ห้ามขอซื้อ" → ใช้ทันทีตอนเปิดหน้า (ไม่รอ network 4s)
const PCTRY_KEY = "pr_shop_partner_country";  // cache ประเทศร้าน (id→country) → label การ์ดถูกตั้งแต่แรก
// ตัวเลือกการเรียง (sort by) — by/dir ตรงกับคอลัมน์จริงใน skus_v2 (ส่งให้ API)
const SORTS: { key: string; label: string; by?: string; dir?: "asc" | "desc" }[] = [
  { key: "",          label: "ล่าสุด (ค่าเริ่มต้น)" },
  { key: "code_asc",  label: "รหัส A → Z",        by: "code",       dir: "asc" },
  { key: "code_desc", label: "รหัส Z → A",        by: "code",       dir: "desc" },
  { key: "name_asc",  label: "ชื่อ ก → ฮ",        by: "name_th",    dir: "asc" },
  { key: "name_desc", label: "ชื่อ ฮ → ก",        by: "name_th",    dir: "desc" },
  { key: "price_asc", label: "ราคา น้อย → มาก",   by: "list_price", dir: "asc" },
  { key: "price_desc",label: "ราคา มาก → น้อย",   by: "list_price", dir: "desc" },
  { key: "new",       label: "ใหม่สุดก่อน",        by: "created_at", dir: "desc" },
  { key: "old",       label: "เก่าสุดก่อน",        by: "created_at", dir: "asc" },
];

export default function PurchasingShopPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const toast = useToast();
  const [source, setSource] = useState<Source>("sku");

  // grid
  const [cards, setCards] = useState<Card[]>([]);
  const [dupMap, setDupMap] = useState<Record<string, OpenOrder[]>>({});       // sku_id → ใบขอซื้อที่ยังค้าง (เตือนสั่งซ้ำ)
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());   // sku_id → คงเหลือในสต๊อก
  const [rejectedOpen, setRejectedOpen] = useState(false);                     // ป๊อปรายการไม่อนุมัติ
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);   // ข้อ 2: error state
  const stockReqRef = useRef(false);   // perf: โหลดยอดสต๊อกครั้งเดียวตอนกดการ์ดแรก (ไม่โหลดตอนเปิดหน้า)
  // perf: Worker↔Supabase รับ request พร้อมกันได้น้อย (ยิงพร้อมกัน 7 อัน → แต่ละอันช้า 4-9s ทั้งที่เดี่ยวๆ ~0.4s)
  // → ให้ grid ยิง "เดี่ยว" ก่อน แล้วค่อยโหลดของรอง (โปรด/เรต/ร้าน/แท็ก/ตัวกรอง) หลัง grid เสร็จ
  const bootedRef = useRef(false);
  const [bootDone, setBootDone] = useState(false);
  const [page, setPage] = useState(0);   // หน้า (0-based)
  const [q, setQ] = useState("");
  const [cols, setCols] = useState(4);
  const [sortKey, setSortKey] = useState("");   // การเรียง (sort by)

  // filter (SKU mode, configurable)
  const [filterFields, setFilterFields] = useState<FilterField[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, ColFilter>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // กฎกลาง: แท็ก (ประเภทสินค้า) ที่ตั้งว่า "ห้ามขอซื้อ" → ซ่อนสินค้าที่ติดแท็กนี้ทั้งบริษัท
  const [hiddenTagIds, setHiddenTagIds] = useState<string[]>([]);
  const [tagNames, setTagNames] = useState<Record<string, string>>({});        // id → ชื่อแท็ก (ไว้โชว์บนการ์ด)
  const [cardTags, setCardTags] = useState<Record<string, string[]>>({});       // sku_id → [tag_id] ของการ์ดที่แสดงอยู่
  const [m2mHide, setM2mHide] = useState<Record<string, string[]>>({});  // แท็กที่ "ซ่อน" ต่อ field (negative)
  const [m2mShow, setM2mShow] = useState<Record<string, string[]>>({});  // แท็กที่ "โชว์เฉพาะ" ต่อ field (positive)
  // โหมด "ตาม Tags": แท็กที่เลือกเพื่อดูสินค้าในแท็กนั้น (ใช้ RPC กรองที่ DB)
  const [tagsSel, setTagsSel] = useState<string[]>([]);

  // group-mode drill-in
  const [sel, setSel] = useState<Card | null>(null);
  const [vars, setVars] = useState<Variation[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [varQ, setVarQ] = useState("");   // ค้นหา SKU ใน popup กลุ่ม
  // จัดสมาชิกกลุ่มในป๊อปอัพ
  const [addMode, setAddMode] = useState(false);          // เปิดแผงค้นหา SKU เพื่อผูกเข้ากลุ่ม
  const [addQ, setAddQ] = useState("");
  const [addResults, setAddResults] = useState<{ id: string; label: string; code: string | null }[]>([]);
  const [addLoading, setAddLoading] = useState(false);
  const [addBusy, setAddBusy] = useState<string | null>(null);  // id ที่กำลังผูก
  const [createSku, setCreateSku] = useState(false);      // ฟอร์มสร้าง SKU ใหม่ในกลุ่ม
  const groupDismiss = useBackdropDismiss(() => { setSel(null); setVars([]); });

  // sku-mode confirm popup
  const [confirmSku, setConfirmSku] = useState<Card | null>(null);
  // ฟอร์มเพิ่ม/แก้ไขสินค้า (SKU) แบบ popup — initial/copyFromCode ใช้ตอน "คัดลอกสินค้า"
  const [skuForm, setSkuForm] = useState<{ mode: "create" | "edit"; id?: string; initial?: Record<string, unknown>; copyFromCode?: string } | null>(null);
  // ตัวเลือกสินค้าที่จะคัดลอก (เลือกจากรายการในหน้านี้)
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyQuery, setCopyQuery] = useState("");
  const [copyLoadingId, setCopyLoadingId] = useState<string | null>(null);

  // แท็บ "ใบสั่งผลิต": วัตถุดิบที่ต้องซื้อจากทุกใบ (โหลดครั้งเดียว) → เลือกใบ → โชว์การ์ดวัตถุดิบ
  const [moNeeds, setMoNeeds] = useState<PurchaseNeedRow[] | null>(null);
  const [moLoading, setMoLoading] = useState(false);
  const [moSel, setMoSel] = useState<MoEntry | null>(null);   // null = โชว์รายการใบ · มีค่า = โชว์วัตถุดิบของใบนั้น
  const [moMatQty, setMoMatQty] = useState<MoMat | null>(null);   // วัตถุดิบที่กำลังใส่จำนวน (popup)

  // cart + save
  const [cart, setCart] = useState<Line[]>([]);
  // responsive (จอ < xl = มือถือ/แท็บเล็ต): ตัวกรองเป็นลิ้นชัก + ตะกร้าลอยกดเปิดเป็นแผ่นเลื่อนขึ้น
  const [filterOpen, setFilterOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [partnerCountry, setPartnerCountry] = useState<Record<string, string>>({});
  // perf: mapSku อ่านประเทศร้านผ่าน ref → พอ partners โหลดเสร็จ (ช้า ~4s) ไม่ทำให้ grid โหลดใหม่
  // (partnerCountry ใช้แค่ทำ label country ไม่เกี่ยวกับสกุลเงิน — สกุลเงินดูจาก rmb_cost ในแถว)
  const partnerCountryRef = useRef(partnerCountry);
  useEffect(() => { partnerCountryRef.current = partnerCountry; }, [partnerCountry]);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [showReview, setShowReview] = useState(false);   // ป๊อปทวนรายการก่อนสร้าง
  // วันที่สั่ง — ใส่ครั้งเดียวตอนกดสร้าง ใช้กับทุกใบ (default = วันนี้)
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));

  // ⭐ favorite (รายการโปรด) — แบบรวมทั้งบริษัท
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const favoritesRef = useRef(favorites);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  // โหลดรายการโปรดครั้งแรก — หลัง grid เสร็จ (ของรอง ไม่ให้แย่ง resource ตอนเปิดหน้า)
  useEffect(() => {
    if (!bootDone) return;
    apiFetch("/api/purchasing/favorites").then(r => r.json())
      .then(j => { if (Array.isArray(j.ids)) setFavorites(new Set(j.ids as string[])); })
      .catch(() => {});
  }, [bootDone]);

  // โหลดยอดคงเหลือในสต๊อก (sku_id → qty) — ไว้โชว์ในป๊อปเพิ่มลงใบขอซื้อ
  // perf: เลื่อนมาโหลด "ตอนกดการ์ดเปิดป๊อปครั้งแรก" (ไม่โหลด 2,000 แถวตอนเปิดหน้า)
  useEffect(() => {
    if (!confirmSku || stockReqRef.current) return;
    stockReqRef.current = true;
    apiFetch("/api/inventory/sku-stock?limit=2000").then(r => r.json())
      .then(j => { const m = new Map<string, number>(); for (const r of (j.data ?? [])) m.set(String(r.sku_id), Number(r.qty_on_hand) || 0); setStockMap(m); })
      .catch(() => { stockReqRef.current = false; });   // พลาด → ให้ลองใหม่รอบหน้า
  }, [confirmSku]);

  // โหลดรายชื่อแท็กทั้งหมด (id→ชื่อ) + แท็กที่ตั้ง "ห้ามขอซื้อ" (กฎกลาง) — เรียกซ้ำได้หลัง admin แก้ใน ⚙
  const reloadHiddenTags = useCallback(async () => {
    try {
      const j = await apiFetch(`/api/master-v2/product_families?limit=500`).then(r => r.json());
      const rows = (j.data ?? []) as Record<string, unknown>[];
      const names: Record<string, string> = {};
      const hidden: string[] = [];
      rows.forEach(t => {
        names[String(t.id)] = String(t.name ?? t.id);
        if (t.hide_in_purchasing === true) hidden.push(String(t.id));
      });
      setTagNames(names);
      // perf: อัปเดต ref เฉพาะเมื่อค่าต่างจริง → fresh โหลดเสร็จแล้วค่าเท่าเดิม (จาก cache) จะไม่ทำให้ grid โหลดซ้ำ
      setHiddenTagIds(prev => (prev.length === hidden.length && prev.every((v, i) => v === hidden[i])) ? prev : hidden);
      try { localStorage.setItem(HIDE_KEY, JSON.stringify(hidden)); } catch { /* ignore */ }   // cache ไว้ใช้รอบหน้า
    } catch { /* ignore */ }
  }, []);
  // โหลดแท็กสด หลัง grid เสร็จ (grid ใช้ค่า cache ไปก่อนแล้ว — นี่แค่รีเฟรช/อัปเดต cache)
  useEffect(() => { if (bootDone) void reloadHiddenTags(); }, [reloadHiddenTags, bootDone]);
  // แยกแท็กที่เลือกเป็น 2 กอง ตามโหมดของแต่ละตัวกรอง: ซ่อน (hide) / โชว์เฉพาะ (show)
  // ซ่อน = กฎกลาง (ห้ามขอซื้อ) + ที่ผู้ใช้เลือกโหมดซ่อน ; โชว์เฉพาะ = ที่ผู้ใช้เลือกโหมดโชว์
  const { exclTagIds, inclTagIds } = useMemo(() => {
    const ex = new Set<string>(hiddenTagIds);
    const inc = new Set<string>();
    for (const k of activeKeys) {
      const fd = filterFields.find(f => f.key === k);
      if (!fd?.m2m || fd.m2m.junction !== "skus_v2_product_family_m2m") continue;
      (m2mHide[k] ?? []).forEach(id => ex.add(id));
      (m2mShow[k] ?? []).forEach(id => inc.add(id));
    }
    return { exclTagIds: [...ex], inclTagIds: [...inc] };
  }, [hiddenTagIds, activeKeys, filterFields, m2mHide, m2mShow]);
  // query fragment การเรียง (sort by) — ส่งให้ API skus
  const sortParam = useMemo(() => {
    const s = SORTS.find(x => x.key === sortKey);
    return s?.by ? `&sort_by=${s.by}&sort_dir=${s.dir}` : "";
  }, [sortKey]);
  const changeSort = (k: string) => { setSortKey(k); if (typeof window !== "undefined") localStorage.setItem(SORT_KEY, k); };

  // query fragment ส่งให้ API skus (ซ่อน + โชว์เฉพาะ ใช้ junction เดียวกัน)
  const exclParam = useMemo(() => {
    let s = "";
    if (exclTagIds.length) s += `&excl_junction=skus_v2_product_family_m2m&excl_tgt_ids=${exclTagIds.join(",")}`;
    if (inclTagIds.length) s += `&incl_junction=skus_v2_product_family_m2m&incl_tgt_ids=${inclTagIds.join(",")}`;
    return s;
  }, [exclTagIds, inclTagIds]);

  // เรตหยวน→บาท ล่าสุด (ใช้โชว์ราคาบาทประมาณ คู่กับ ¥)
  const [cnyRate, setCnyRate] = useState(0);
  useEffect(() => {
    if (!bootDone) return;   // perf: เรตหยวน (ใช้ในป๊อป) โหลดหลัง grid
    apiFetch("/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc").then(r => r.json())
      .then(j => { const rt = num((j.data ?? [])[0]?.rate); if (rt > 0) setCnyRate(rt); })
      .catch(() => {});
  }, [bootDone]);

  // โหลด preference (จำนวนคอลัมน์ + filter ที่เคยเลือก)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = Number(localStorage.getItem(COLS_KEY)); if (c >= 2 && c <= 10) setCols(c);
    const sk = localStorage.getItem(SORT_KEY); if (sk && SORTS.some(s => s.key === sk)) setSortKey(sk);
    try { const k = JSON.parse(localStorage.getItem(FILT_KEY) ?? "[]"); if (Array.isArray(k)) setActiveKeys(k); } catch { /* ignore */ }
    // perf: ใช้ค่าที่ cache ไว้ทันที → grid รอบแรกถูกต้อง (ซ่อนแท็กห้ามขอซื้อ + label ประเทศ) โดยไม่รอ network 4s
    try { const h = JSON.parse(localStorage.getItem(HIDE_KEY) ?? "[]"); if (Array.isArray(h) && h.length) setHiddenTagIds(h); } catch { /* ignore */ }
    try { const pc = JSON.parse(localStorage.getItem(PCTRY_KEY) ?? "{}"); if (pc && typeof pc === "object") { setPartnerCountry(pc); partnerCountryRef.current = pc; } } catch { /* ignore */ }
    // ข้อ 4: กู้ตะกร้าที่ค้างไว้ (กันหายเมื่อรีเฟรช) + แจ้งให้รู้ว่าของเก่ายังอยู่
    try {
      const c2 = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]");
      if (Array.isArray(c2) && c2.length) { setCart(c2 as Line[]); toast.info(`🛒 กู้คืนตะกร้าค้าง ${c2.length} รายการ`); }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // ข้อ 4: จำตะกร้าทุกครั้งที่เปลี่ยน
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* ignore */ }
  }, [cart]);
  const changeCols = (n: number) => { setCols(n); if (typeof window !== "undefined") localStorage.setItem(COLS_KEY, String(n)); };

  // ติดตามคำค้นรอบก่อน — ใช้แยกว่า "พิมพ์ค้นหา" (หน่วง) กับ "สลับ/กรอง" (ทันที)
  const prevQ = useRef(q);
  // สลับโหมด SKU ↔ Product Group: เคลียร์การ์ดเก่า + ล้างคำค้น + โชว์ "กำลังโหลด" ทันที (ไม่เห็นของเก่าค้าง)
  const switchSource = (s: Source) => {
    if (s === source) return;
    prevQ.current = "";   // กันไม่ให้การล้างคำค้นไปกระตุ้น debounce → สลับโหมดดึงทันที
    setSource(s); setCards([]); setTotal(0); setQ(""); setPage(0); setLoading(true);
    setMoSel(null);   // กลับมาเริ่มที่ "เลือกใบสั่งผลิต" ทุกครั้งที่สลับโหมด
    setFilterOpen(false);   // จอเล็ก: สลับโหมดแล้วหุบลิ้นชักให้เห็นผลทันที
  };

  // แท็บ "ใบสั่งผลิต": โหลดวัตถุดิบที่ต้องซื้อจากทุกใบ (ครั้งเดียว) เมื่อเข้าโหมดนี้
  useEffect(() => {
    if (source !== "mo" || moNeeds !== null) return;
    setMoLoading(true);
    apiFetch("/api/mo/purchase-needs").then(r => r.json())
      .then(j => setMoNeeds((j.data ?? []) as PurchaseNeedRow[]))
      .catch(() => setMoNeeds([]))
      .finally(() => setMoLoading(false));
  }, [source, moNeeds]);

  // จัดกลุ่มวัตถุดิบที่ต้องซื้อ → ต่อ 1 ใบสั่งผลิต (โชว์เฉพาะที่ยัง "ต้องซื้อ" remaining>0 มาจาก API อยู่แล้ว)
  const moList = useMemo<MoEntry[]>(() => {
    const map = new Map<string, MoEntry>();
    for (const r of moNeeds ?? []) for (const m of r.mos) {
      let g = map.get(m.mo_no);
      if (!g) { g = { mo_no: m.mo_no, mo_id: m.mo_id, product_label: m.product_label, product_image: m.product_image, due_date: m.due_date, mats: [] }; map.set(m.mo_no, g); }
      g.mats.push({ code: r.component_sku, name: r.component_name, image: r.component_image, type: r.material_type, uom: r.uom, needed: m.needed });
    }
    return [...map.values()].sort((a, b) => a.mo_no.localeCompare(b.mo_no));
  }, [moNeeds]);

  // เพิ่มวัตถุดิบของใบสั่งผลิตเข้าตะกร้า — ผูก source_mo_no เพื่อให้บอร์ดเด้งสถานะ "ขอแล้ว" + item_name = [รหัส] ชื่อ
  const addMoMaterial = (mat: MoMat, qty: number) => {
    if (!moSel || qty <= 0) return;
    const label = mat.code ? `[${mat.code}] ${mat.name ?? ""}`.trim() : (mat.name ?? "วัตถุดิบ");
    setCart(p => [...p, {
      label, qty, uom: mat.uom ?? "", seller: "—", price: 0, currency: "THB",
      image: null, variationId: null, skuRef: mat.code, skuId: null, note: `จากใบสั่งผลิต ${moSel.mo_no}`,
      reason: `ใบสั่งผลิต ${moSel.mo_no}`,
      usedForId: null, usedForLabel: moSel.product_label, urgent: false, useDate: moSel.due_date || null,
      sourceMoNo: moSel.mo_no,
    }]);
    setMoMatQty(null);
    toast.success(`เพิ่ม ${label} ลงตะกร้าแล้ว`);
  };

  // โหลด partner country (สำหรับ currency rule) + filterable fields ของ SKU
  useEffect(() => {
    if (!bootDone) return;   // perf: ร้าน + ตัวกรอง โหลดหลัง grid (grid ใช้ค่า cache ไปก่อนแล้ว)
    apiFetch("/api/master-v2/partners?limit=500").then(r => r.json()).then(j => {
      const m: Record<string, string> = {};
      (j.data ?? []).forEach((p: Record<string, unknown>) => { m[String(p.id)] = String(p.country ?? "TH"); });
      setPartnerCountry(m);
      try { localStorage.setItem(PCTRY_KEY, JSON.stringify(m)); } catch { /* ignore */ }   // cache ไว้ใช้รอบหน้า
    }).catch(() => {});
    apiFetch("/api/admin/field-registry-v2?module=skus-v2").then(r => r.json()).then(j => {
      const ff: FilterField[] = (j.fields ?? [])
        .filter((f: Record<string, unknown>) => f.is_filterable)
        .map((f: Record<string, unknown>) => {
          const rc = (f.relation_config ?? {}) as Record<string, unknown>;
          const isRel = f.ui_field_type === "relation" && rc.target_module_key;
          // many2many (เช่น Product Family) = แท็กในตารางเชื่อม → ใช้เป็น "ตัวกรองซ่อน" (negative)
          const isM2M = f.ui_field_type === "many2many" && rc.junction_table && rc.target_module_key;
          return {
            key: String(f.field_key), column: String(f.column_name ?? f.field_key),
            label: String(f.field_label ?? f.field_key), type: String(f.ui_field_type ?? "text"),
            relation: isRel ? { moduleKey: String(rc.target_module_key), labelField: String(rc.target_label_field ?? "name") } : undefined,
            m2m: isM2M ? { junction: String(rc.junction_table), moduleKey: String(rc.target_module_key), labelField: String(rc.target_label_field ?? "name") } : undefined,
          };
        });
      setFilterFields(ff);
    }).catch(() => {});
  }, [bootDone]);

  // แปลง activeKeys + filterValues → filters object ที่ส่งให้ API
  const builtFilters = useMemo(() => {
    const out: Record<string, ColFilter> = {};
    for (const k of activeKeys) {
      const fd = filterFields.find(f => f.key === k); if (!fd) continue;
      if (fd.m2m) continue;   // m2m = ตัวกรองซ่อน (negative) → ไม่ส่งเป็น filter ปกติ
      const v = filterValues[k];
      if (!v) continue;
      if (v.type === "boolean" && (v.value === "true" || v.value === "false")) out[fd.column] = v;
      else if (v.type === "number" && (v.min || v.max)) out[fd.column] = v;
      else if (v.type === "text" && v.value) out[fd.column] = v;
      else if (v.type === "select" && v.selected.length > 0) out[fd.column] = v;
    }
    return out;
  }, [activeKeys, filterValues, filterFields]);
  // perf: ใช้ "ค่า string" ของ filter เป็น dep แทน object → filterFields โหลดเสร็จแล้ว object สร้างใหม่
  // (ค่าเดิม {}) จะไม่ทำให้ grid โหลดซ้ำ เพราะ string เทียบด้วยค่า ไม่ใช่ reference
  const builtFiltersKey = useMemo(() => JSON.stringify(builtFilters), [builtFilters]);

  // ข้อ 6: จำนวนรวมต่อ SKU ที่อยู่ในตะกร้า (ใช้โชว์ป้ายบนการ์ด)
  const cartQtyBySku = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of cart) if (l.skuId) m.set(l.skuId, (m.get(l.skuId) ?? 0) + (Number(l.qty) || 0));
    return m;
  }, [cart]);

  // ดึงการ์ดแบบทีละหน้า (แทนที่ทั้งหน้า ไม่ใช่ต่อท้าย)
  // แปลง 1 record SKU → Card (ใช้ซ้ำทุกโหมด)
  const mapSku = useCallback((s: Record<string, unknown>): Card => {
    const sid = String(s.seller_partner_id ?? "");
    const country = partnerCountryRef.current[sid] ?? "TH";
    // สินค้าจีน = มีราคาหยวน (rmb_cost) → ใช้ ¥ เป็นราคาสั่งจริง; ที่เหลือใช้บาท
    const rmb = num(s.rmb_cost);
    const isYuan = rmb > 0;
    return {
      id: String(s.id), name: String(s.name_th || s.code || ""), sub: (s.code as string) ?? null,
      image_key: (s.cover_image_r2_key as string) ?? null,
      sku: {
        code: (s.code as string) ?? null, seller: String(s.seller_partner_label ?? "—"), country,
        price: isYuan ? rmb : (num(s.list_price) || num(s.standard_price)),
        currency: isYuan ? "YUAN" : "THB",
        uom: String(s.uom_label ?? "ชิ้น"),
      },
    };
  }, []);   // perf: ไม่พึ่ง partnerCountry (อ่านผ่าน ref) → grid ไม่โหลดใหม่ตอน partners โหลดเสร็จ

  // ดึง SKU ตามรายการ id (ใช้กับโหมด favorite/frequent) — คงลำดับ id เดิม
  const fetchSkusByIds = useCallback(async (ids: string[]): Promise<Card[]> => {
    if (ids.length === 0) return [];
    const f = encodeURIComponent(JSON.stringify({ id: { type: "select", selected: ids } }));
    const j = await apiFetch(`/api/master-v2/skus?limit=500&filters=${f}${exclParam}`).then(r => r.json());
    const mapped: Card[] = (j.data ?? []).map(mapSku);
    const order = new Map(ids.map((id, i) => [id, i]));
    mapped.sort((a, b) => (order.get(a.id) ?? 9999) - (order.get(b.id) ?? 9999));
    return mapped;
  }, [mapSku, exclParam]);

  // ข้อ 3: กำกับลำดับคำขอ — แสดงเฉพาะผลของคำค้นล่าสุด (กัน race คำขอเก่ามาทับ)
  const reqIdRef = useRef(0);
  const fetchCards = useCallback(async (pg: number) => {
    const myId = ++reqIdRef.current;
    setLoading(true); setError(null);
    try {
      let nextCards: Card[] = [];
      let nextTotal = 0;
      if (source === "sku") {
        const fp = builtFiltersKey !== "{}" ? `&filters=${encodeURIComponent(builtFiltersKey)}` : "";
        const sp = q ? `&search=${encodeURIComponent(q)}` : "";
        const j = await apiFetch(`/api/master-v2/skus?limit=${PAGE}&offset=${pg * PAGE}${sp}${fp}${exclParam}${sortParam}`).then(r => r.json());
        const mapped: Card[] = (j.data ?? []).map(mapSku);
        // จัดเรียงตามความใกล้เคียงกับคำค้น — เฉพาะตอนค้นหา และยังไม่ได้เลือกการเรียงเอง
        if (q && !sortParam) {
          const ql = q.trim().toLowerCase();
          const score = (c: Card) => {
            const code = (c.sub ?? "").toLowerCase();
            const name = (c.name ?? "").toLowerCase();
            if (code === ql) return 0;
            if (name === ql) return 1;
            if (code.startsWith(ql)) return 2;
            if (name.startsWith(ql)) return 3;
            if (code.includes(ql)) return 4;
            if (name.includes(ql)) return 5;
            return 6;
          };
          mapped.sort((a, b) => score(a) - score(b));
        }
        nextCards = mapped;
        nextTotal = num(j.total) || num(j.count) || (pg * PAGE + mapped.length);
      } else if (source === "tags") {
        // โหมด "ตาม Tags": เลือกแท็กแล้วโชว์เฉพาะสินค้าในแท็กนั้น (กรองที่ DB ผ่าน RPC)
        if (tagsSel.length === 0) { nextCards = []; nextTotal = 0; }
        else {
          const sp = q ? `&search=${encodeURIComponent(q)}` : "";
          let frag = `&incl_junction=skus_v2_product_family_m2m&incl_tgt_ids=${tagsSel.join(",")}`;
          if (hiddenTagIds.length) frag += `&excl_junction=skus_v2_product_family_m2m&excl_tgt_ids=${hiddenTagIds.join(",")}`;  // คงกฎกลาง "ห้ามขอซื้อ"
          const j = await apiFetch(`/api/master-v2/skus?limit=${PAGE}&offset=${pg * PAGE}${sp}${frag}${sortParam}`).then(r => r.json());
          nextCards = (j.data ?? []).map(mapSku);
          nextTotal = num(j.total) || num(j.count) || (pg * PAGE + nextCards.length);
        }
      } else if (source === "group") {
        const j = await apiFetch("/api/master-v2/product-groups?limit=500").then(r => r.json());
        nextCards = (j.data ?? []).map((g: Record<string, unknown>) => ({
          id: String(g.id), name: String(g.name ?? ""), sub: (g.brand as string) ?? null,
          image_key: (g.image_key as string) ?? null,
        }));
        nextTotal = nextCards.length;
      } else if (source === "mo") {
        // แท็บใบสั่งผลิต — ใช้ข้อมูลจาก /api/mo/purchase-needs (โหลดแยก) ไม่ผ่าน pipeline การ์ดปกติ
        nextCards = []; nextTotal = 0;
      } else {
        // favorite | frequent — โหลดรายการ id แล้วดึง SKU (กรองด้วยคำค้นฝั่ง client)
        let ids: string[] = [];
        if (source === "favorite") ids = [...favoritesRef.current];
        else ids = (await apiFetch("/api/purchasing/frequent").then(r => r.json()).catch(() => ({ ids: [] }))).ids ?? [];
        let mapped = await fetchSkusByIds(ids);
        if (q) {
          const ql = q.trim().toLowerCase();
          mapped = mapped.filter(c => (c.name ?? "").toLowerCase().includes(ql) || (c.sub ?? "").toLowerCase().includes(ql));
        }
        nextCards = mapped;
        nextTotal = mapped.length;
      }
      if (myId !== reqIdRef.current) return;   // มีคำขอใหม่กว่าแล้ว → ทิ้งผลเก่า
      setCards(nextCards); setTotal(nextTotal);
    } catch (e) {
      if (myId !== reqIdRef.current) return;
      setError(e instanceof Error ? e.message : "โหลดสินค้าไม่สำเร็จ");
      setCards([]); setTotal(0);
    } finally {
      if (myId === reqIdRef.current) setLoading(false);
      // perf: grid เสร็จรอบแรกแล้ว → ปลดให้ของรองเริ่มโหลด (ไม่แย่ง resource กับ grid)
      if (!bootedRef.current) { bootedRef.current = true; setBootDone(true); }
    }
  }, [source, q, builtFiltersKey, mapSku, fetchSkusByIds, exclParam, sortParam, tagsSel, hiddenTagIds]);

  // เตือนสั่งซ้ำ — เช็คใบขอซื้อที่ยังค้างของสินค้าที่โชว์อยู่ (batch) → ป้ายบนการ์ด + รายการในป๊อป
  useEffect(() => {
    const ids = cards.map(c => c.id).filter(Boolean);
    if (ids.length === 0) { setDupMap({}); return; }
    let alive = true;
    apiFetch("/api/purchasing/sku-open-orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku_ids: ids }) })
      .then(r => r.json()).then(j => { if (alive && j.data) setDupMap(j.data as Record<string, OpenOrder[]>); }).catch(() => {});
    return () => { alive = false; };
  }, [cards]);

  // refetch + reset ไปหน้าแรก — หน่วงเวลา (debounce) เฉพาะตอน "พิมพ์ค้นหา" เท่านั้น
  // ส่วนการสลับโหมด / เปลี่ยน filter → ดึงทันที ไม่หน่วง (ให้กดแล้วเปลี่ยนทันที ไม่กระตุก)
  useEffect(() => {
    const qChanged = prevQ.current !== q;
    prevQ.current = q;
    setPage(0);
    // perf: หน่วงสั้น ๆ รวบการเปลี่ยนค่าตอน mount (sort/filter settle) ให้ยิงเท่าที่จำเป็น
    // grid "วิ่งขนาน" กับ request อื่น ไม่ต้องรอตัวที่ช้า (sort/แท็ก/ประเทศ ใช้ค่า cache ทันทีแล้ว)
    const t = setTimeout(() => { void fetchCards(0); }, qChanged ? 300 : 150);
    return () => clearTimeout(t);
  }, [fetchCards, q]);

  // โหลดแท็ก (Product Family) ของการ์ด SKU ที่กำลังแสดง → โชว์เป็นป้ายบนการ์ด
  useEffect(() => {
    const ids = cards.filter(c => c.sku).map(c => c.id);
    if (ids.length === 0) { setCardTags({}); return; }
    let cancelled = false;
    apiFetch(`/api/admin/schema/m2m-links?junction=skus_v2_product_family_m2m&src_ids=${ids.join(",")}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) setCardTags((j.map ?? {}) as Record<string, string[]>); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [cards]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE));
  const goToPage = (pg: number) => {
    const clamped = Math.min(Math.max(0, pg), totalPages - 1);
    setPage(clamped);
    void fetchCards(clamped);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  // ⭐ กดดาว/เอาดาวออก (optimistic + บันทึกทันที)
  const toggleFavorite = async (skuId: string) => {
    const willOn = !favoritesRef.current.has(skuId);
    setFavorites(prev => { const n = new Set(prev); if (willOn) n.add(skuId); else n.delete(skuId); return n; });
    try {
      const res = await apiFetch("/api/purchasing/favorites", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku_id: skuId, on: willOn }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      if (source === "favorite") void fetchCards(0);   // โหมดโปรด: อัปเดตการ์ดทันที
    } catch {
      setFavorites(prev => { const n = new Set(prev); if (willOn) n.delete(skuId); else n.add(skuId); return n; });  // revert
    }
  };

  // โหลดรายการ SKU ในกลุ่ม (คอลัมน์ product_group) — ใช้ทั้งตอนเปิด popup และตอนผูกสมาชิกเพิ่ม
  const loadGroupVars = async (groupId: string) => {
    const f = encodeURIComponent(JSON.stringify({ product_group: { type: "text", value: groupId } }));
    const j = await apiFetch(`/api/master-v2/skus?limit=200&filters=${f}${exclParam}`).then(r => r.json());
    setVars((j.data ?? []).map((s: Record<string, unknown>) => {
      const sid = String(s.seller_partner_id ?? "");
      const country = partnerCountry[sid] ?? "TH";
      const rmb = num(s.rmb_cost);
      const isYuan = rmb > 0;
      return {
        key: String(s.id), label: String(s.name_th || s.code || ""), color: (s.color as string) ?? null,
        seller: String(s.seller_partner_label ?? "—"), country,
        price: isYuan ? rmb : (num(s.list_price) || num(s.standard_price)), currency: isYuan ? "YUAN" : "THB",
        uom: String(s.uom_label ?? "ชิ้น"), image: (s.cover_image_r2_key as string) ?? null,
        variationId: null, skuRef: (s.code as string) ?? null, skuId: String(s.id),
      } as Variation;
    }));
  };

  // group mode: เปิด variation modal
  const openGroup = async (c: Card) => {
    setSel(c); setVars([]); setVarQ(""); setVarsLoading(true);
    setAddMode(false); setAddQ(""); setAddResults([]);
    try { await loadGroupVars(c.id); } finally { setVarsLoading(false); }
  };

  // การ์ดที่มี c.sku = SKU จริง (โหมด sku/favorite/frequent) → popup ยืนยัน; ไม่มี = กลุ่มสินค้า → drill-in
  const onCardClick = (c: Card) => { if (c.sku) setConfirmSku(c); else void openGroup(c); };

  // คัดลอกสินค้า: ดึงข้อมูลเต็มของ SKU ต้นฉบับ → เปิดฟอร์มเพิ่มสินค้าโดยกรอกค่ามาให้ล่วงหน้า (รหัสเดิมไว้ให้แก้)
  const openCopyFrom = async (skuId: string) => {
    setCopyLoadingId(skuId);
    try {
      const j = await apiFetch(`/api/master-v2/skus/${skuId}`).then(r => r.json());
      const data = (j.data ?? {}) as Record<string, unknown>;
      const { id: _id, created_at: _c, updated_at: _u, ...initial } = data;   // ตัดฟิลด์ระบบ ไม่ก๊อป
      void _id; void _c; void _u;
      setCopyPickerOpen(false);
      setSkuForm({ mode: "create", initial, copyFromCode: (data.code as string) ?? "" });
    } catch (e) {
      alert("ดึงข้อมูลสินค้าไม่สำเร็จ: " + String((e as Error).message ?? e));
    } finally { setCopyLoadingId(null); }
  };

  // ค้นหา SKU ทั้งคลังเพื่อผูกเข้ากลุ่ม (debounce) — แสดงเฉพาะตัวที่ยังไม่อยู่ในกลุ่มนี้
  useEffect(() => {
    if (!addMode) return;
    const q = addQ.trim();
    if (q.length < 1) { setAddResults([]); return; }
    setAddLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/api/master-v2/skus?limit=20&search=${encodeURIComponent(q)}`).then(r => r.json()).then(j => {
        const inGroup = new Set(vars.map(v => v.skuId));
        setAddResults(((j.data ?? []) as Record<string, unknown>[])
          .filter(s => !inGroup.has(String(s.id)))
          .map(s => ({ id: String(s.id), label: String(s.name_th || s.code || ""), code: (s.code as string) ?? null })));
      }).catch(() => setAddResults([])).finally(() => setAddLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [addQ, addMode, vars]);

  // ผูก SKU เข้ากลุ่มนี้ (PATCH product_group) → รีโหลดรายการกลุ่ม
  const assignToGroup = async (skuId: string) => {
    if (!sel) return;
    setAddBusy(skuId);
    try {
      const res = await apiFetch(`/api/master-v2/skus/${skuId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_group: sel.id, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) { toast.error("ผูกเข้ากลุ่มไม่สำเร็จ: " + j.error); return; }
      setAddResults(p => p.filter(r => r.id !== skuId));   // เอาออกจากผลค้นหา
      await loadGroupVars(sel.id);                          // โหลดรายการกลุ่มใหม่ (คงแผงค้นหาไว้)
      toast.success("เพิ่มเข้ากลุ่มแล้ว");
    } catch (e) { toast.error(String((e as Error).message ?? e)); }
    finally { setAddBusy(null); }
  };

  const addVariation = (c: Card, v: Variation, qty: number) => {
    setCart(p => [...p, { label: `${c.name} — ${v.label}`, qty, uom: v.uom, seller: v.seller, price: v.price, currency: v.currency, image: v.image, variationId: v.variationId, skuRef: v.skuRef, skuId: v.skuId, note: "" }]);
    setSel(null); setVars([]);
  };
  const addSku = (c: Card, qty: number, note: string, reason: ReasonPick, urgent?: boolean, useDate?: string | null) => {
    const s = c.sku!;
    setCart(p => [...p, { label: c.name, qty, uom: s.uom, seller: s.seller, price: s.price, currency: s.currency, image: c.image_key, variationId: null, skuRef: s.code, skuId: c.id, note, reason: reason.text || null, usedForId: null, usedForLabel: reason.moLabel ?? null, urgent: !!urgent, useDate: useDate || null, sourceMoNo: reason.moNo ?? null }]);
    setConfirmSku(null);
  };

  // แก้รูปสินค้าในป๊อปอัป "เพิ่มลงใบขอซื้อ" → บันทึกเข้า SKU ทันที + อัปเดตการ์ด/ป๊อปที่แสดงอยู่
  const saveSkuImage = async (skuId: string, key: string | null) => {
    try {
      const res = await apiFetch(`/api/master-v2/skus/${skuId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cover_image_r2_key: key, actor: user?.name }),
      });
      const j = await res.json();
      if (j.error) { toast.error("บันทึกรูปไม่สำเร็จ: " + j.error); return; }
      setCards(cs => cs.map(c => c.id === skuId ? { ...c, image_key: key } : c));
      setConfirmSku(c => (c && c.id === skuId ? { ...c, image_key: key } : c));
      toast.success("อัปเดตรูปสินค้าแล้ว");
    } catch (e) { toast.error("บันทึกรูปไม่สำเร็จ: " + String((e as Error).message ?? e)); }
  };

  const save = async () => {
    if (cart.length === 0) return;
    setSaving(true);
    try {
      // ข้อ 1: สร้างใบขอซื้อครบในครั้งเดียวผ่าน endpoint กลาง (audit + สิทธิ์ + เลขกลาง + atomic)
      const res = await apiFetch("/api/purchasing/create-pr", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_date: orderDate, actor: user?.name,
          items: cart.map(l => ({
            sku_id: l.skuId, item_name: l.label, qty: l.qty, uom: l.uom,
            seller_name: l.seller, price_est: l.price, currency: l.currency,
            image_key: l.image, note: l.note || null,
            reason: l.reason ?? null,                                       // เหตุผลที่ขอซื้อ (ข้อความ)
            used_for_sku_id: null,                                          // เลิกใช้ "ใช้กับสินค้า (ปลายทาง)" แล้ว
            used_for_label:  l.usedForLabel ?? null,                        // คงไว้สำหรับ label ใบสั่งผลิต (ถ้ามาจาก MO)
            is_urgent: l.urgent === true, needed_date: l.useDate || null,
            source_mo_no: l.sourceMoNo ?? null,                              // ผูกใบสั่งผลิต → บอร์ดเด้ง "ขอแล้ว"
          })),
        }),
      });
      const j = await res.json();
      if (j.error) throw new Error(j.error);
      setDone(`${j.created} ใบ`); setCart([]);
      toast.success(`สร้างใบขอซื้อ ${j.created} ใบแล้ว`);
    } catch (e) { toast.error("สร้างใบขอซื้อไม่สำเร็จ: " + String((e as Error).message ?? e)); }
    finally { setSaving(false); }
  };

  const toggleFilterKey = (k: string) => {
    setActiveKeys(prev => {
      const next = prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k];
      if (typeof window !== "undefined") localStorage.setItem(FILT_KEY, JSON.stringify(next));
      return next;
    });
  };
  const setFV = (k: string, v: ColFilter | null) => setFilterValues(p => { const n = { ...p }; if (v) n[k] = v; else delete n[k]; return n; });

  if (!canView) return <PlaygroundShell><AccessDenied message="ต้องมีสิทธิ์ products.view" /></PlaygroundShell>;

  return (
    <PlaygroundShell>
      <div className="flex flex-col xl:flex-row xl:h-[calc(100vh-3.5rem)]">
        {/* Filter sidebar — จอ < xl เป็นลิ้นชักเลื่อนจากซ้าย (ซ่อนปกติ) · xl เป็นคอลัมน์ตายตัว */}
        <aside className={`fixed top-14 bottom-0 left-0 z-40 w-72 max-w-[85%] bg-white overflow-auto p-4 shadow-xl transition-transform duration-300 ${filterOpen ? "translate-x-0" : "-translate-x-full"} xl:static xl:top-auto xl:bottom-auto xl:z-auto xl:w-60 xl:max-w-none xl:translate-x-0 xl:shadow-none xl:flex-shrink-0 xl:border-r xl:border-slate-200`}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-800">🛒 ขอซื้อ</h2>
            <button onClick={() => setFilterOpen(false)} className="xl:hidden text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="ปิดตัวกรอง">✕</button>
          </div>
          {/* source toggle (โหมดแสดงสินค้า) */}
          <div className="grid grid-cols-2 gap-1 mb-3 text-xs">
            {([
              ["sku", "SKU จริง"], ["tags", "🏷️ ตาม Tags"],
              ["favorite", "⭐ รายการโปรด"], ["frequent", "🔁 ซื้อบ่อย"],
              ["mo", "🏭 ใบสั่งผลิต"],
            ] as [Source, string][]).map(([s, label]) => (
              <button key={s} onClick={() => switchSource(s)}
                className={`py-1.5 rounded-md border transition-colors ${source === s ? "bg-blue-600 text-white border-blue-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาสินค้า..."
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md mb-3" />

          {/* กฎกลาง: แจ้งว่ามีการซ่อนสินค้าตามแท็ก "ห้ามขอซื้อ" + ทางไปตั้งค่า */}
          {hiddenTagIds.length > 0 && (
            <div className="mb-3 px-2.5 py-2 rounded-md bg-amber-50 border border-amber-100 text-[11px] text-amber-700 leading-relaxed">
              🙈 ซ่อนสินค้า {hiddenTagIds.length} ประเภท (ตั้งไว้ว่า &quot;ห้ามขอซื้อ&quot;)
              <a href="/master/lookups" target="_blank" rel="noopener noreferrer" className="ml-1 underline hover:text-amber-900">จัดการ</a>
            </div>
          )}

          {source === "sku" && (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-500">ตัวกรอง</span>
                <button onClick={() => setPickerOpen(true)} className="text-xs text-blue-600 hover:underline">+ เลือก filter</button>
              </div>
              {activeKeys.length === 0 && <p className="text-xs text-slate-300 mb-2">ยังไม่ได้เลือกตัวกรอง</p>}
              <div className="space-y-3">
                {activeKeys.map(k => {
                  const fd = filterFields.find(f => f.key === k); if (!fd) return null;
                  const cur = filterValues[k];
                  return (
                    <div key={k}>
                      <div className="text-xs font-medium text-slate-600 mb-1">{fd.label}</div>
                      {fd.m2m ? (
                        <div className="space-y-2">
                          <div>
                            <div className="text-[10px] font-medium text-rose-600 mb-0.5">🙈 ซ่อนแท็กที่เลือก (สินค้าที่ติดจะไม่แสดง)</div>
                            <TagGroupFilter label="เลือกแท็กที่จะซ่อน" showNone={false}
                              value={{ tagIds: m2mHide[k] ?? [], none: false }}
                              onChange={(v) => setM2mHide(p => ({ ...p, [k]: v.tagIds }))} />
                          </div>
                          <div>
                            <div className="text-[10px] font-medium text-emerald-600 mb-0.5">👁 โชว์เฉพาะแท็กที่เลือก</div>
                            <TagGroupFilter label="เลือกแท็กที่จะโชว์" showNone={false}
                              value={{ tagIds: m2mShow[k] ?? [], none: false }}
                              onChange={(v) => setM2mShow(p => ({ ...p, [k]: v.tagIds }))} />
                          </div>
                        </div>
                      ) : fd.type === "boolean" ? (
                        <select value={cur && cur.type === "boolean" ? cur.value : ""} onChange={e => setFV(k, e.target.value ? { type: "boolean", value: e.target.value as "true" | "false" } : null)}
                          className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md bg-white">
                          <option value="">ทั้งหมด</option><option value="true">ใช่</option><option value="false">ไม่ใช่</option>
                        </select>
                      ) : fd.type === "number" ? (
                        <div className="flex gap-1">
                          <input type="number" placeholder="ต่ำสุด" value={cur && cur.type === "number" ? cur.min : ""} onChange={e => setFV(k, { type: "number", min: e.target.value, max: cur && cur.type === "number" ? cur.max : "" })} className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                          <input type="number" placeholder="สูงสุด" value={cur && cur.type === "number" ? cur.max : ""} onChange={e => setFV(k, { type: "number", min: cur && cur.type === "number" ? cur.min : "", max: e.target.value })} className="w-full h-8 px-2 text-xs border border-slate-200 rounded-md" />
                        </div>
                      ) : (
                        <FilterCombobox
                          column={fd.column}
                          label={fd.label}
                          relation={fd.relation}
                          values={cur && cur.type === "select" ? cur.selected : []}
                          onChange={(vals) => setFV(k, vals.length ? { type: "select", selected: vals } : null)}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* โหมด "ตาม Tags": เลือกแท็ก → โชว์สินค้าในแท็กนั้น (ของกลาง TagGroupFilter + RPC) */}
          {source === "tags" && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500 leading-relaxed">เลือกแท็ก (ประเภทสินค้า) เพื่อดูเฉพาะสินค้าในแท็กนั้น</p>
              <TagGroupFilter label="เลือกแท็ก" showNone={false}
                value={{ tagIds: tagsSel, none: false }}
                onChange={(v) => setTagsSel(v.tagIds)}
                manageFlag={{ field: "hide_in_purchasing", onLabel: "🙈 ห้ามขอซื้อ", offLabel: "👁 โชว์", permission: "products.edit" }}
                onManaged={() => { void reloadHiddenTags(); }} />
              {tagsSel.length > 0 ? (
                <div className="flex flex-wrap gap-1 pt-1">
                  {tagsSel.map(tid => (
                    <span key={tid} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[11px] border border-indigo-100">
                      {tagNames[tid] ?? "…"}
                      <button type="button" onClick={() => setTagsSel(s => s.filter(x => x !== tid))} className="text-indigo-400 hover:text-red-500">✕</button>
                    </span>
                  ))}
                  <button type="button" onClick={() => setTagsSel([])} className="text-[11px] text-slate-400 hover:text-red-500 ml-1">ล้างทั้งหมด</button>
                </div>
              ) : (
                <p className="text-xs text-slate-300">ยังไม่ได้เลือกแท็ก</p>
              )}
            </div>
          )}
        </aside>

        {/* Grid */}
        <main className="flex-1 xl:overflow-auto p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            {/* จอเล็ก: ปุ่มเปิดลิ้นชักตัวกรอง (PC ไม่ต้องเพราะกรองอยู่คอลัมน์ซ้ายแล้ว) */}
            <button onClick={() => setFilterOpen(true)}
              className="xl:hidden flex items-center gap-1.5 h-9 px-3 text-sm border border-slate-200 rounded-md text-slate-600 hover:bg-slate-50 flex-shrink-0">
              ⚙ ตัวกรอง
            </button>
            <h1 className="text-xl font-semibold text-slate-800 flex-shrink-0">เลือกสินค้าที่ต้องการขอซื้อ</h1>
            {/* ช่องค้นหาด้านบน (ใช้ร่วมกับช่องค้นหาแถบซ้าย) */}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหาสินค้า (ชื่อ/รหัส)..."
              className="flex-1 min-w-[180px] max-w-md h-9 px-3 text-sm border border-slate-200 rounded-md" />
            {source === "sku" && (
              <label className="flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
                <span className="whitespace-nowrap">↕ เรียงตาม</span>
                <select value={sortKey} onChange={e => changeSort(e.target.value)}
                  className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white text-slate-700">
                  {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </label>
            )}
            {source === "sku" && (
              <label className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 flex-shrink-0">
                <span className="whitespace-nowrap">▦ การ์ด/แถว</span>
                <select value={cols} onChange={e => changeCols(Number(e.target.value))}
                  className="h-9 px-2 text-sm border border-slate-200 rounded-md bg-white text-slate-700">
                  {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            )}
            <PrHistoryButton />
            <button onClick={() => setRejectedOpen(true)} className="h-10 px-3 text-sm font-medium border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 inline-flex items-center gap-1 flex-shrink-0">🚫 รายการไม่อนุมัติ</button>
            {source === "sku" && (
              <button onClick={() => { setCopyQuery(""); setCopyPickerOpen(true); }}
                className="h-9 px-3 text-xs font-medium border border-emerald-300 text-emerald-700 rounded-lg hover:bg-emerald-50 flex-shrink-0">📋 คัดลอกสินค้า</button>
            )}
            {source === "sku" && (
              <button onClick={() => setSkuForm({ mode: "create" })}
                className="h-9 px-3 text-xs font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex-shrink-0">＋ เพิ่มสินค้า</button>
            )}
          </div>

          {/* ข้อ 2: error state + ปุ่มลองใหม่ */}
          {error && !loading && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-3">
              <span>⚠ โหลดสินค้าไม่สำเร็จ: {error}</span>
              <button onClick={() => void fetchCards(page)} className="h-8 px-3 text-xs font-medium bg-red-600 text-white rounded-lg hover:bg-red-700 flex-shrink-0">ลองใหม่</button>
            </div>
          )}

          {/* แท็บ "ใบสั่งผลิต": เลือกใบ → โชว์วัตถุดิบที่ต้องซื้อของใบนั้นเป็นการ์ด */}
          {source === "mo" && (() => {
            const ql = q.trim().toLowerCase();
            if (moNeeds === null) return <div className="text-center text-slate-400 py-16 text-sm">กำลังโหลดใบสั่งผลิต…</div>;
            if (moList.length === 0) return <div className="text-center text-slate-300 py-16">ไม่มีวัตถุดิบที่ต้องซื้อจากใบสั่งผลิต 🎉</div>;
            // ----- ระดับ 1: เลือกใบสั่งผลิต -----
            if (!moSel) {
              const list = moList.filter(g => !ql || g.mo_no.toLowerCase().includes(ql) || g.product_label.toLowerCase().includes(ql));
              return (
                <>
                  <p className="text-sm text-slate-500 mb-3">เลือกใบสั่งผลิต <b className="text-slate-700">{list.length}</b> ใบ — กดเพื่อดูวัตถุดิบที่ต้องซื้อ</p>
                  <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as CSSProperties}>
                    {list.map(g => (
                      <button key={g.mo_no} onClick={() => setMoSel(g)}
                        className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-rose-300 hover:shadow-md transition-all">
                        <div className="aspect-square bg-slate-50 flex items-center justify-center">
                          {g.product_image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={g.product_image} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">🏭</span>}
                        </div>
                        <div className="p-3">
                          <div className="font-medium text-slate-800 text-[13px] leading-snug line-clamp-2" title={g.product_label}>{g.product_label}</div>
                          <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{g.mo_no}</div>
                          {g.due_date && <div className="text-[11px] text-slate-400 mt-0.5">📅 กำหนดส่ง {g.due_date}</div>}
                          <div className="text-sm font-semibold text-rose-600 mt-1">🛒 ต้องซื้อ {g.mats.length} วัตถุดิบ</div>
                        </div>
                      </button>
                    ))}
                    {list.length === 0 && <div className="col-span-full text-center text-slate-300 py-16">ไม่พบใบสั่งผลิตที่ตรงกับ “{q}”</div>}
                  </div>
                </>
              );
            }
            // ----- ระดับ 2: วัตถุดิบของใบที่เลือก -----
            const mats = moSel.mats.filter(m => !ql || (m.code ?? "").toLowerCase().includes(ql) || (m.name ?? "").toLowerCase().includes(ql));
            return (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <button onClick={() => { setMoSel(null); setQ(""); }} className="h-9 px-3 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 flex-shrink-0">← ใบสั่งผลิตอื่น</button>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-800 truncate">{moSel.product_label} <span className="font-mono text-xs text-slate-400">· {moSel.mo_no}</span></div>
                    <div className="text-[11px] text-slate-400">กดการ์ดวัตถุดิบเพื่อใส่จำนวนแล้วเพิ่มลงตะกร้า{moSel.due_date ? ` · กำหนดส่ง ${moSel.due_date}` : ""}</div>
                  </div>
                </div>
                <div className="grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))]" style={{ "--cols": cols } as CSSProperties}>
                  {mats.map((m, idx) => (
                    <button key={`${m.code ?? m.name}:${idx}`} onClick={() => setMoMatQty(m)}
                      className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-rose-300 hover:shadow-md transition-all">
                      <div className="aspect-square bg-slate-50 flex items-center justify-center">
                        {m.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={m.image} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-3xl">📦</span>}
                      </div>
                      <div className="p-3">
                        <div className="font-medium text-slate-800 text-[13px] leading-snug line-clamp-2" title={m.name ?? ""}>{m.name}</div>
                        {m.code && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{m.code}</div>}
                        {m.type && <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{m.type}</div>}
                        <div className="text-sm font-semibold text-rose-600 mt-1">ต้องซื้อ {m.needed.toLocaleString()}<span className="text-xs font-normal text-slate-400"> {m.uom ?? ""}</span></div>
                      </div>
                    </button>
                  ))}
                  {mats.length === 0 && <div className="col-span-full text-center text-slate-300 py-16">ไม่พบวัตถุดิบที่ตรงกับ “{q}”</div>}
                </div>
              </>
            );
          })()}

          {/* ข้อ 1: ปุ่มเลื่อนหน้าด้านบน (เฉพาะ SKU ที่แบ่งหน้าฝั่ง server) */}
          {source !== "mo" && !loading && (source === "sku" || source === "tags") && total > PAGE && (
            <div className="flex items-center justify-end gap-2 mb-3">
              <span className="text-xs text-slate-400 mr-1">{total.toLocaleString()} รายการ</span>
              <button onClick={() => goToPage(page - 1)} disabled={page <= 0}
                className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">◀ หน้าก่อน</button>
              <span className="text-xs font-semibold text-slate-700">หน้า {page + 1} / {totalPages}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">หน้าถัดไป ▶</button>
            </div>
          )}

          {/* การ์ดสินค้าทั่วไป (ทุกโหมดยกเว้น "ใบสั่งผลิต") */}
          {source !== "mo" && (<>
          {/* responsive: iPhone (<sm) 2 คอลัมน์ตายตัว · iPad+ ใช้ค่าที่ตั้ง (--cols, default 4 ปรับได้บนหัว) */}
          <div className={`grid gap-3 sm:gap-4 grid-cols-2 sm:[grid-template-columns:repeat(var(--cols),minmax(0,1fr))] transition-opacity duration-200 ${loading ? "opacity-40" : "opacity-100"}`} style={{ "--cols": cols } as CSSProperties}>
            {cards.map(c => (
              <div key={c.id} className="relative group">
                {/* ปุ่มดาว ⭐ (เฉพาะการ์ด SKU จริง — favorite เก็บเป็น sku_id) */}
                {c.sku && (
                  <button type="button" title={favorites.has(c.id) ? "เอาออกจากรายการโปรด" : "เพิ่มเป็นรายการโปรด"}
                    onClick={(e) => { e.stopPropagation(); void toggleFavorite(c.id); }}
                    className="absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-amber-50">
                    <span className={`text-base leading-none ${favorites.has(c.id) ? "text-amber-400" : "text-slate-300"}`}>{favorites.has(c.id) ? "★" : "☆"}</span>
                  </button>
                )}
                {/* ปุ่มคัดลอกสินค้านี้ 📋 — โผล่ตอนชี้เมาส์ (เดสก์ท็อป) / โชว์เสมอบนจอเล็ก */}
                {c.sku && (
                  <button type="button" title="คัดลอกสินค้านี้เป็นสินค้าใหม่"
                    onClick={(e) => { e.stopPropagation(); void openCopyFrom(c.id); }}
                    disabled={copyLoadingId === c.id}
                    className="absolute top-2 right-10 z-10 w-7 h-7 flex items-center justify-center rounded-full bg-white/90 border border-slate-200 shadow-sm hover:bg-emerald-50 text-emerald-600 text-sm opacity-100 xl:opacity-0 xl:group-hover:opacity-100 transition-opacity disabled:opacity-50">
                    {copyLoadingId === c.id ? "…" : "📋"}
                  </button>
                )}
                {/* ข้อ 6: ป้ายบอกว่าอยู่ในตะกร้าแล้ว + จำนวน */}
                {c.sku && cartQtyBySku.has(c.id) && (
                  <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-medium shadow-sm">🛒 {cartQtyBySku.get(c.id)}</span>
                )}
                {/* เตือนสั่งซ้ำ — มีใบขอซื้อค้างอยู่ (ซ้อนใต้ป้ายตะกร้าถ้ามี) */}
                {c.sku && <DupOrderBadge orders={dupMap[c.id]} className={`absolute left-2 z-10 ${cartQtyBySku.has(c.id) ? "top-9" : "top-2"}`} />}
                <button onClick={() => onCardClick(c)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                  <div className="aspect-square bg-slate-50 flex items-center justify-center">
                    {img(c.image_key)
                      ? <HoverZoomImage src={img(c.image_key)!} className="w-full h-full object-cover" />
                      : <span className="text-slate-300 text-3xl">📦</span>}
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-slate-800 text-[13px] leading-snug line-clamp-2" title={c.name}>{c.name}</div>
                    {c.sku ? (
                      <>
                        {c.sub && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{c.sub}</div>}
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">🏪 {c.sku.seller}</div>
                        <div className="text-sm font-semibold text-blue-600 mt-1">{c.sku.price.toLocaleString()} {curLabel(c.sku.currency)}<span className="text-xs font-normal text-slate-400"> / {c.sku.uom}</span></div>
                        {c.sku.currency === "YUAN" && cnyRate > 0 && (
                          <div className="text-[11px] text-slate-400">≈ ฿{Math.round(c.sku.price * cnyRate).toLocaleString()}</div>
                        )}
                        {/* ป้ายแท็ก Product Family ของสินค้านี้ */}
                        {(cardTags[c.id]?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {cardTags[c.id].slice(0, 3).map(tid => (
                              <span key={tid} className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 text-[10px] leading-none border border-indigo-100">
                                {tagNames[tid] ?? "…"}
                              </span>
                            ))}
                            {cardTags[c.id].length > 3 && <span className="text-[10px] text-slate-400 leading-none self-center">+{cardTags[c.id].length - 3}</span>}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-xs text-slate-400 line-clamp-1">{c.sub || "—"}</div>
                    )}
                  </div>
                </button>
              </div>
            ))}
            {!loading && !error && cards.length === 0 && (
              <div className="col-span-full text-center text-slate-300 py-16">
                {source === "tags" && tagsSel.length === 0 ? "👈 เลือกแท็กทางซ้ายเพื่อดูสินค้าในแท็กนั้น" : "ไม่พบสินค้า"}
              </div>
            )}
          </div>

          {loading && <div className="text-center text-slate-400 py-6 text-sm">กำลังโหลด…</div>}

          {/* แถบล่าง: เลื่อนหน้า (ตัวหลัก) + ตัวปรับขนาดการ์ด */}
          {!loading && cards.length > 0 && (
            <div className="flex items-center justify-center gap-6 py-6 flex-wrap">
              {/* เลื่อนหน้า — ตัวควบคุมหลัก (เฉพาะ SKU ที่แบ่งหน้าฝั่ง server) */}
              {(source === "sku" || source === "tags") && total > PAGE && (
                <div className="flex items-center gap-2">
                  <button onClick={() => goToPage(page - 1)} disabled={page <= 0}
                    className="h-10 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">◀ หน้าก่อน</button>
                  <span className="text-sm font-semibold text-slate-700 px-2">หน้า {page + 1} / {totalPages}</span>
                  <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                    className="h-10 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">หน้าถัดไป ▶</button>
                </div>
              )}
              {/* จำนวนรายการ (ตัวปรับการ์ด/แถว ย้ายไปบนหัวแล้ว) */}
              <span className="text-sm text-slate-400">{total.toLocaleString()} รายการ</span>
            </div>
          )}
          </>)}
        </main>

        {/* Cart — จอ < xl เป็นแผ่นเลื่อนขึ้นจากล่าง (เปิดด้วยปุ่มตะกร้าลอย) · xl เป็นคอลัมน์ขวา */}
        <aside className={`fixed inset-x-0 bottom-0 z-40 h-[82%] bg-white rounded-t-2xl shadow-2xl flex flex-col transition-transform duration-300 ${cartOpen ? "translate-y-0" : "translate-y-full"} xl:static xl:h-auto xl:w-80 xl:rounded-none xl:shadow-none xl:translate-y-0 xl:flex-shrink-0 xl:border-l xl:border-slate-200`}>
          <div className="flex items-center justify-between p-4 border-b border-slate-100 font-semibold text-slate-800">
            <span>ใบขอซื้อ ({cart.length})</span>
            <button onClick={() => setCartOpen(false)} className="xl:hidden text-slate-400 hover:text-slate-600 text-xl leading-none" aria-label="ปิดตะกร้า">✕</button>
          </div>
          <div className="flex-1 overflow-auto p-3 space-y-2">
            {cart.length === 0 && <div className="text-sm text-slate-300 text-center py-8">ยังไม่มีรายการ<br />กดสินค้าทางซ้ายเพื่อเพิ่ม</div>}
            {cart.map((l, i) => (
              <div key={i} className="border border-slate-200 rounded-lg p-2">
                <div className="flex justify-between gap-2">
                  <div className="flex gap-2 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {img(l.image)
                        ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(l.image)!} alt="" className="w-full h-full object-cover" />
                        : <span className="text-slate-300 text-sm">📦</span>}
                    </div>
                    <div className="text-sm text-slate-700 flex-1 min-w-0 line-clamp-2">{l.label}</div>
                  </div>
                  <button onClick={() => setCart(c => c.filter((_, j) => j !== i))} className="text-slate-400 hover:text-red-500 text-xs">✕</button>
                </div>
                <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                  <input type="number" inputMode="decimal" value={l.qty} min={1} step="any" onFocus={e => e.target.select()} onChange={e => setCart(c => c.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                    className="w-16 h-6 px-1 border border-slate-200 rounded" /> {l.uom}
                  <span className="ml-auto text-right leading-tight">
                    <span className="block text-sm font-semibold text-slate-700 tabular-nums">{(l.price * (Number(l.qty) || 0)).toLocaleString()} {curLabel(l.currency)}</span>
                    {l.currency === "YUAN" && cnyRate > 0 && <span className="block text-[10px] text-slate-400">≈ ฿{Math.round(l.price * (Number(l.qty) || 0) * cnyRate).toLocaleString()}</span>}
                    <span className="block text-[10px] text-slate-400">@ {l.price.toLocaleString()} / {l.uom}</span>
                  </span>
                </div>
                {l.reason && <div className="text-[11px] text-indigo-600 mt-0.5">🔖 {l.reason}{l.sourceMoNo && l.usedForLabel ? ` · ${l.usedForLabel}` : ""}</div>}
                {l.note && <div className="text-[11px] text-amber-600 mt-0.5">📝 {l.note}</div>}
                {l.urgent && <div className="text-[11px] text-rose-600 mt-0.5 font-medium">⚡ ส่งด่วน{l.useDate ? ` · ใช้ ${l.useDate}` : ""}</div>}
                <div className="text-[11px] text-slate-400 mt-0.5">🏪 {l.seller}</div>
              </div>
            ))}
          </div>
          <div className="p-3 border-t border-slate-100 space-y-2">
            {cart.length > 0 && (() => {
              const totals: Record<string, number> = {};
              for (const l of cart) totals[l.currency] = (totals[l.currency] ?? 0) + l.price * (Number(l.qty) || 0);
              const multi = Object.keys(totals).length > 1;
              return (
                <div className="px-1 space-y-0.5">
                  {Object.entries(totals).map(([cur, sum]) => (
                    <div key={cur} className="flex justify-between items-baseline">
                      <span className="text-sm text-slate-500">ยอดรวมทั้งหมด{multi ? ` (${curLabel(cur)})` : ""}</span>
                      <span className="text-right">
                        <span className="block text-base font-bold text-blue-600 tabular-nums">{sum.toLocaleString()} {curLabel(cur)}</span>
                        {cur === "YUAN" && cnyRate > 0 && <span className="block text-[11px] text-slate-400">≈ ฿{Math.round(sum * cnyRate).toLocaleString()}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {done && <div className="px-3 py-2 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-700">✅ สร้างใบขอซื้อ {done} แล้ว (แยกใบละ 1 สินค้า) — <a href="/m/purchase-requests-v2" className="underline">ดูใบขอซื้อ</a></div>}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">📅 วันที่สั่ง (ใช้กับทุกใบ)</label>
              <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)}
                className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
            </div>
            <button onClick={() => setShowReview(true)} disabled={saving || cart.length === 0}
              className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? "กำลังสร้าง..." : `สร้างใบขอซื้อ (${cart.length} ใบ) →`}
            </button>
          </div>
        </aside>
      </div>

      {/* จอเล็ก: ฉากหลังมืดตอนเปิดลิ้นชัก/ตะกร้า — กดเพื่อปิด */}
      {(filterOpen || cartOpen) && (
        <div className="xl:hidden fixed inset-0 z-30 bg-black/40"
          onClick={() => { setFilterOpen(false); setCartOpen(false); }} />
      )}

      {/* จอเล็ก: ปุ่มตะกร้าลอย (มุมขวาล่าง) โชว์จำนวน กดแล้วเปิดหน้าตะกร้า */}
      {!cartOpen && (
        <button onClick={() => setCartOpen(true)}
          className="xl:hidden fixed bottom-5 right-5 z-30 h-14 pl-4 pr-5 rounded-full bg-blue-600 text-white shadow-lg flex items-center gap-2 active:scale-95 transition-transform">
          <span className="relative flex items-center">
            🛒
            {cart.length > 0 && (
              <span className="absolute -top-2.5 -right-3 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-xs font-medium flex items-center justify-center">{cart.length}</span>
            )}
          </span>
          <span className="text-sm font-medium">ตะกร้า</span>
        </button>
      )}

      {/* ป๊อปทวนรายการก่อนสร้างใบขอซื้อ (recheck) — ของกลาง ERPModal */}
      {showReview && (
        <ERPModal open onClose={() => !saving && setShowReview(false)} size="lg" storageKey="pr-review"
          title="ทวนรายการก่อนสร้างใบขอซื้อ"
          description={`จะสร้างใบขอซื้อทั้งหมด ${cart.length} ใบ (แยกใบละ 1 สินค้า) · วันที่สั่ง ${orderDate}`}
          footer={<>
            <button onClick={() => setShowReview(false)} disabled={saving} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-50">← กลับไปแก้</button>
            <button onClick={async () => { await save(); setShowReview(false); }} disabled={saving || cart.length === 0}
              className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">{saving ? "กำลังสร้าง…" : `✓ ยืนยันสร้าง ${cart.length} ใบ`}</button>
          </>}>
          <div className="space-y-2">
            {cart.map((l, i) => (
              <div key={i} className="flex items-center gap-3 border border-slate-100 rounded-lg p-2">
                <div className="w-10 h-10 rounded bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden">
                  {img(l.image) ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(l.image)!} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-sm">📦</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-800 truncate">{l.label}</div>
                  {l.reason && <div className="text-[11px] text-indigo-600 truncate">🔖 {l.reason}{l.sourceMoNo && l.usedForLabel ? ` · ${l.usedForLabel}` : ""}</div>}
                  <div className="text-[11px] text-slate-400">🏪 {l.seller}{l.urgent ? <span className="text-rose-600 font-medium"> · ⚡ ส่งด่วน{l.useDate ? ` (ใช้ ${l.useDate})` : ""}</span> : ""}{l.note ? ` · 📝 ${l.note}` : ""}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm text-slate-700 tabular-nums">{l.qty.toLocaleString()} {l.uom}</div>
                  <div className="text-[11px] text-slate-500 tabular-nums">{(l.price * (Number(l.qty) || 0)).toLocaleString()} {curLabel(l.currency)}</div>
                </div>
              </div>
            ))}
            {/* ยอดรวมแยกตามสกุลเงิน */}
            <div className="mt-3 pt-2 border-t border-slate-200 space-y-0.5">
              {(() => {
                const totals: Record<string, number> = {};
                for (const l of cart) totals[l.currency] = (totals[l.currency] ?? 0) + l.price * (Number(l.qty) || 0);
                return Object.entries(totals).map(([c, sum]) => (
                  <div key={c} className="flex justify-between text-sm">
                    <span className="text-slate-500">ยอดรวม ({curLabel(c)})</span>
                    <span className="font-bold text-blue-600 tabular-nums">{sum.toLocaleString()} {curLabel(c)}{c === "YUAN" && cnyRate > 0 ? <span className="text-[11px] font-normal text-slate-400"> ≈ ฿{Math.round(sum * cnyRate).toLocaleString()}</span> : null}</span>
                  </div>
                ));
              })()}
            </div>
          </div>
        </ERPModal>
      )}

      {/* Filter picker (เลือก field ที่จะใช้กรอง) */}
      {/* เลือกตัวกรอง (ของกลาง ERPModal) */}
      <ERPModal open={pickerOpen} onClose={() => setPickerOpen(false)} size="md"
        title="เลือกตัวกรอง"
        description="ติ๊กเลือก field ที่อยากใช้เป็นตัวกรอง (มาจากทะเบียน field ของ SKU)"
        footer={<button onClick={() => setPickerOpen(false)} className="px-4 h-9 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">เสร็จ</button>}>
        <div className="space-y-1">
          {filterFields.length === 0 && <p className="text-sm text-slate-300 py-4 text-center">— ยังไม่มี field ที่ตั้งค่าให้กรองได้ —</p>}
          {filterFields.map(f => (
            <label key={f.key} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-50 cursor-pointer">
              <input type="checkbox" checked={activeKeys.includes(f.key)} onChange={() => toggleFilterKey(f.key)} />
              <span className="text-sm text-slate-700">{f.label}</span>
              <span className="ml-auto text-[11px] text-slate-300">{f.type}</span>
            </label>
          ))}
        </div>
      </ERPModal>

      {/* SKU confirm popup */}
      {confirmSku && confirmSku.sku && (
        <ConfirmSku card={confirmSku} rate={cnyRate} stockQty={stockMap.has(confirmSku.id) ? stockMap.get(confirmSku.id)! : null} dupOrders={dupMap[confirmSku.id]} onClose={() => setConfirmSku(null)}
          onAdd={(qty, note, reason, urgent, useDate) => addSku(confirmSku, qty, note, reason, urgent, useDate)}
          onSaveImage={saveSkuImage}
          onEdit={() => setSkuForm({ mode: "edit", id: confirmSku.id })} />
      )}

      {/* ฟอร์มเพิ่ม/แก้ไขสินค้า (SKU) */}
      {skuForm && (
        <SkuFormModal mode={skuForm.mode} skuId={skuForm.id} initial={skuForm.initial} copyFromCode={skuForm.copyFromCode}
          onClose={() => setSkuForm(null)}
          onSaved={() => { setSkuForm(null); setConfirmSku(null); setPage(0); void fetchCards(0); }} />
      )}

      {/* คัดลอกสินค้า — เลือกตัวที่จะคัดลอกจากรายการในหน้านี้ */}
      <ERPModal open={copyPickerOpen} onClose={() => setCopyPickerOpen(false)} size="md"
        title="📋 คัดลอกสินค้า"
        description="เลือกสินค้าที่อยากใช้เป็นต้นแบบ — ระบบจะกรอกค่าทุกช่องให้ เหลือแค่ตั้งรหัสใหม่">
        <div className="space-y-2">
          <input value={copyQuery} onChange={e => setCopyQuery(e.target.value)} autoFocus
            placeholder="ค้นหาในรายการที่โชว์อยู่ (ชื่อ / รหัส)…"
            className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
          <div className="max-h-[55vh] overflow-auto space-y-1">
            {(() => {
              const ql = copyQuery.trim().toLowerCase();
              const list = cards.filter(c => c.sku && (!ql || c.name.toLowerCase().includes(ql) || (c.sub ?? "").toLowerCase().includes(ql)));
              if (list.length === 0) return <p className="text-sm text-slate-300 py-6 text-center">— ไม่พบสินค้าในหน้านี้ —</p>;
              return list.map(c => (
                <button key={c.id} type="button" onClick={() => void openCopyFrom(c.id)} disabled={copyLoadingId === c.id}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-emerald-50 text-left disabled:opacity-50">
                  <div className="w-10 h-10 flex-shrink-0 rounded-md bg-slate-50 border border-slate-100 flex items-center justify-center overflow-hidden">
                    {img(c.image_key) ? <img src={img(c.image_key)!} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-lg">📦</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{c.name}</div>
                    {c.sub && <div className="text-[11px] font-mono text-slate-400 truncate">{c.sub}</div>}
                  </div>
                  <span className="text-xs text-emerald-600 flex-shrink-0">{copyLoadingId === c.id ? "กำลังเปิด…" : "คัดลอก →"}</span>
                </button>
              ));
            })()}
          </div>
        </div>
      </ERPModal>

      {/* ใส่จำนวนวัตถุดิบจากใบสั่งผลิต (เริ่มที่ "จำนวนที่ต้องซื้อ") → เพิ่มลงตะกร้า */}
      {moMatQty && moSel && (
        <MoMatQtyDialog mat={moMatQty} moNo={moSel.mo_no} productLabel={moSel.product_label}
          onClose={() => setMoMatQty(null)} onAdd={(qty) => addMoMaterial(moMatQty, qty)} />
      )}

      {/* Group variation modal — ดึง SKU ของกลุ่มมาเลือก + ค้นหา + จัดการกลุ่ม */}
      {sel && (() => {
        const ql = varQ.trim().toLowerCase();
        const shown = ql ? vars.filter(v => v.label.toLowerCase().includes(ql) || (v.skuRef ?? "").toLowerCase().includes(ql)) : vars;
        const fltUrl = `/m/skus-v2?flt=${encodeURIComponent(JSON.stringify({ product_group: { type: "text", value: sel.id } }))}`;
        return (
          <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4" {...groupDismiss}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-slate-800 line-clamp-1">{sel.name}</h3>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <a href={fltUrl} target="_blank" rel="noopener noreferrer"
                    className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 inline-flex items-center"
                    title="เปิดหน้า SKU กรองเฉพาะกลุ่มนี้ (จัดสมาชิก/เพิ่ม SKU เข้ากลุ่ม)">⚙ จัดการกลุ่ม</a>
                  <button onClick={() => { setSel(null); setVars([]); }} className="text-slate-400 hover:text-slate-600 text-xl">✕</button>
                </div>
              </div>
              {/* ค้นหา SKU ในกลุ่ม */}
              <div className="px-4 pt-3">
                <input value={varQ} onChange={e => setVarQ(e.target.value)} placeholder="ค้นหา SKU ในกลุ่มนี้ (ชื่อ/รหัส)..."
                  className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
              </div>
              <div className="p-4 space-y-2 overflow-auto flex-1">
                {varsLoading && <div className="text-sm text-slate-400 py-6 text-center">กำลังโหลด…</div>}
                {!varsLoading && vars.length === 0 && <div className="text-sm text-slate-300 py-6 text-center">— ยังไม่มี SKU ในกลุ่มนี้ —</div>}
                {!varsLoading && vars.length > 0 && shown.length === 0 && <div className="text-sm text-slate-300 py-6 text-center">— ไม่พบ SKU ที่ตรงกับ &quot;{varQ}&quot; —</div>}
                {shown.map(v => (
                  <div key={v.key} className="flex items-center gap-3 border border-slate-200 rounded-lg p-2.5">
                    {img(v.image) && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img(v.image)!} alt="" className="w-10 h-10 rounded object-cover border border-slate-100" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-700 line-clamp-1">{v.label}</div>
                      <div className="text-xs text-slate-400 line-clamp-1">
                        {v.skuRef && `${v.skuRef} · `}{v.color && `สี ${v.color} · `}🏪 {v.seller} ({v.country}) · {v.price.toLocaleString()} {v.currency}/{v.uom}
                      </div>
                    </div>
                    <AddBtn onAdd={(qty) => addVariation(sel, v, qty)} />
                  </div>
                ))}
              </div>

              {/* แผงค้นหา SKU เพื่อผูกเข้ากลุ่ม (จัดสมาชิก) */}
              {addMode && (
                <div className="px-4 pb-2 border-t border-slate-100 pt-3 bg-slate-50/60">
                  <input value={addQ} onChange={e => setAddQ(e.target.value)} autoFocus
                    placeholder="ค้นหา SKU ทั้งคลังเพื่อเพิ่มเข้ากลุ่ม (ชื่อ/รหัส)..."
                    className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
                  <div className="mt-2 max-h-44 overflow-auto space-y-1">
                    {addLoading && <div className="text-xs text-slate-400 py-3 text-center">กำลังค้นหา…</div>}
                    {!addLoading && addQ.trim() && addResults.length === 0 && <div className="text-xs text-slate-300 py-3 text-center">— ไม่พบ SKU (ที่ยังไม่อยู่ในกลุ่ม) —</div>}
                    {addResults.map(r => (
                      <div key={r.id} className="flex items-center gap-2 px-2 py-1.5 bg-white border border-slate-200 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-700 truncate">{r.label}</div>
                          {r.code && <div className="text-[11px] font-mono text-slate-400">{r.code}</div>}
                        </div>
                        <button onClick={() => assignToGroup(r.id)} disabled={addBusy === r.id}
                          className="h-7 px-2.5 text-xs font-medium bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50">
                          {addBusy === r.id ? "..." : "+ เข้ากลุ่ม"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ปุ่มจัดสมาชิก */}
              <div className="px-4 py-3 border-t border-slate-100 flex gap-2">
                <button onClick={() => { setAddMode(m => !m); setAddQ(""); setAddResults([]); }}
                  className={`flex-1 h-9 text-sm font-medium rounded-lg border ${addMode ? "bg-slate-100 border-slate-300 text-slate-700" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
                  {addMode ? "ปิดการค้นหา" : "＋ เพิ่ม SKU เข้ากลุ่ม"}
                </button>
                <button onClick={() => setCreateSku(true)}
                  className="flex-1 h-9 text-sm font-medium rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50">
                  ＋ สร้าง SKU ใหม่
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ฟอร์มสร้าง SKU ใหม่ในกลุ่ม (ของกลาง) — เติม product_group อัตโนมัติ */}
      {createSku && sel && (
        <RecordFormModal
          moduleKey="skus-v2"
          title={`SKU ใหม่ในกลุ่ม ${sel.name}`}
          presetLabelField="name_th"
          preset={{ product_group: sel.id }}
          onClose={() => setCreateSku(false)}
          onSaved={() => { setCreateSku(false); void loadGroupVars(sel.id); }}
        />
      )}

      <RejectedPanel open={rejectedOpen} onClose={() => setRejectedOpen(false)} onChanged={() => {}} />

    </PlaygroundShell>
  );
}

// ป๊อปใส่จำนวนวัตถุดิบจากใบสั่งผลิต — เริ่มที่ "จำนวนที่ต้องซื้อ" + ปุ่ม −/+ (กดง่ายบนมือถือ)
function MoMatQtyDialog({ mat, moNo, productLabel, onClose, onAdd }: { mat: MoMat; moNo: string; productLabel: string; onClose: () => void; onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState(() => mat.needed > 0 ? mat.needed : 1);
  const label = mat.code ? `[${mat.code}] ${mat.name ?? ""}`.trim() : (mat.name ?? "วัตถุดิบ");
  return (
    <ERPModal open onClose={onClose} size="sm" storageKey="mo-mat-qty" title="เพิ่มวัตถุดิบลงใบขอซื้อ"
      footer={<>
        <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
        <button onClick={() => onAdd(qty)} disabled={qty <= 0} className="px-5 h-9 text-sm font-medium bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-40">+ เพิ่มลงตะกร้า</button>
      </>}>
      <div className="flex gap-3 mt-1">
        <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden flex-shrink-0">
          {mat.image ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={mat.image} alt="" className="w-full h-full object-cover" /> : <span className="text-slate-300 text-2xl">📦</span>}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-800 text-sm line-clamp-2">{mat.name}</div>
          {mat.code && <div className="text-xs font-mono text-slate-400 mt-0.5">{mat.code}</div>}
          <div className="text-[11px] text-slate-400 mt-0.5">🏭 {productLabel} · {moNo}</div>
          <div className="text-xs text-rose-600 mt-1">ต้องซื้อ <b>{mat.needed.toLocaleString()}</b> {mat.uom ?? ""}</div>
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน ({mat.uom ?? ""})</label>
        <div className="flex items-stretch gap-2">
          <button type="button" aria-label="ลดจำนวน" onClick={() => setQty(q => Math.max(0, Math.round(((Number(q) || 0) - 1) * 100) / 100))}
            className="w-12 h-11 flex items-center justify-center text-2xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 active:scale-95 select-none">−</button>
          <input type="number" inputMode="decimal" value={qty} min={0} step="any"
            onFocus={e => e.target.select()} onChange={e => setQty(Number(e.target.value))}
            className="flex-1 min-w-0 h-11 px-2 text-center text-lg font-medium border border-slate-200 rounded-md tabular-nums" />
          <button type="button" aria-label="เพิ่มจำนวน" onClick={() => setQty(q => Math.round(((Number(q) || 0) + 1) * 100) / 100)}
            className="w-12 h-11 flex items-center justify-center text-2xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 active:scale-95 select-none">+</button>
        </div>
      </div>
    </ERPModal>
  );
}

function AddBtn({ onAdd }: { onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <input type="number" inputMode="decimal" value={qty} min={1} step="any" onFocus={e => e.target.select()} onChange={e => setQty(Number(e.target.value))} className="w-14 h-8 px-1 text-sm border border-slate-200 rounded" />
      <button onClick={() => onAdd(qty)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">+ เพิ่ม</button>
    </div>
  );
}

// สถานะใบสั่งผลิตที่ถือว่า "ปิดแล้ว" → ไม่ให้เลือกเป็นเหตุผลขอซื้อ
const MO_CLOSED = new Set(["completed", "done", "closed", "cancelled", "canceled"]);

// MoReasonPicker — เลือกใบสั่งผลิตที่ "ยังเปิดอยู่" เป็นเหตุผลขอซื้อ (ดึงจาก /api/mo, กรองสถานะปิดฝั่ง client)
function MoReasonPicker({ value, onPick }: { value: { no: string; label: string } | null; onPick: (v: { no: string; label: string } | null) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<MoListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const t = setTimeout(() => {
      apiFetch(`/api/mo?limit=50${q ? `&search=${encodeURIComponent(q)}` : ""}`).then(r => r.json())
        .then(j => setRows(((j.data ?? []) as MoListItem[]).filter(m => !MO_CLOSED.has(String(m.status ?? "").toLowerCase()))))
        .catch(() => setRows([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [open, q]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {value ? (
        <div className="flex items-center gap-2 h-9 px-2 border border-slate-200 rounded-md bg-slate-50">
          <span className="text-sm text-slate-700 truncate flex-1">🏭 {value.label}</span>
          <button type="button" onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 hover:underline shrink-0">เปลี่ยน</button>
          <button type="button" onClick={() => onPick(null)} className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(o => !o)}
          className="w-full h-9 px-3 text-sm text-left text-slate-400 border border-dashed border-slate-300 rounded-md hover:border-blue-300 hover:text-blue-600">
          + เลือกใบสั่งผลิต (ที่ยังเปิดอยู่)
        </button>
      )}
      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-72 overflow-auto">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาเลขใบ / รหัส / ชื่อสินค้า..."
            className="w-full h-9 px-3 text-sm border-b border-slate-100 outline-none sticky top-0 bg-white" />
          {loading && <div className="px-3 py-3 text-xs text-slate-400">กำลังโหลด…</div>}
          {!loading && rows && rows.length === 0 && <div className="px-3 py-3 text-xs text-slate-300">— ไม่พบใบสั่งผลิตที่ยังเปิด —</div>}
          {!loading && (rows ?? []).map(m => (
            <button key={m.id} type="button"
              onClick={() => { onPick({ no: m.mo_no, label: `${m.mo_no}${m.product_sku ? ` · ${m.product_sku}` : ""}${m.product_name ? ` (${m.product_name})` : ""}` }); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-blue-50 border-b border-slate-50 last:border-0">
              <div className="text-sm font-medium text-slate-700">{m.mo_no}</div>
              <div className="text-xs text-slate-500 truncate">{m.product_sku ?? ""}{m.product_name ? ` · ${m.product_name}` : ""}{m.status ? ` · ${m.status}` : ""}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ConfirmSku({ card, rate, stockQty, dupOrders, onClose, onAdd, onEdit, onSaveImage }: { card: Card; rate: number; stockQty?: number | null; dupOrders?: OpenOrder[]; onClose: () => void; onAdd: (qty: number, note: string, reason: ReasonPick, urgent: boolean, useDate: string | null) => void; onEdit: () => void; onSaveImage: (skuId: string, key: string | null) => void | Promise<void> }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  // เหตุผลที่ขอซื้อ (บังคับ) — 2 โหมด: 📋 เลือกเหตุผล / 🏭 อ้างใบสั่งผลิต
  const [reasonMode, setReasonMode] = useState<"reason" | "mo">("reason");
  const [reasonId, setReasonId] = useState<string | null>(null);    // id ของ lookup (ให้ RelationPicker แสดงผล)
  const [reasonText, setReasonText] = useState("");                 // ข้อความเหตุผล (เก็บลงใบ ไม่ใช่ id)
  const [moPick, setMoPick] = useState<{ no: string; label: string } | null>(null);
  const [editImg, setEditImg] = useState(false);   // เปิดโหมดแก้รูปในป๊อปนี้
  const [urgent, setUrgent] = useState(false);     // ⚡ ส่งด่วน
  const [useDate, setUseDate] = useState("");       // วันที่ใช้งาน (ไม่บังคับ)
  const s = card.sku!;
  // บังคับเลือกเหตุผลก่อนเพิ่มลงตะกร้า
  const reasonValid = reasonMode === "reason" ? !!reasonText : !!moPick;
  const buildReason = (): ReasonPick =>
    reasonMode === "mo" && moPick
      ? { text: `ใบสั่งผลิต ${moPick.no}`, moNo: moPick.no, moLabel: moPick.label }
      : { text: reasonText, moNo: null, moLabel: null };
  return (
    <ERPModal open onClose={onClose} size="md" storageKey="pr-add-item" title="เพิ่มลงใบขอซื้อ"
      footer={
        <>
          <button onClick={onEdit} className="mr-auto h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">✎ แก้ไขสินค้า</button>
          <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => onAdd(qty, note, buildReason(), urgent, useDate || null)} disabled={qty <= 0 || !reasonValid} title={!reasonValid ? "กรุณาเลือกเหตุผลที่ขอซื้อก่อน" : undefined} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">+ เพิ่มลงตะกร้า</button>
        </>
      }>
      {/* เตือนสั่งซ้ำ — สินค้านี้มีใบขอซื้อค้างอยู่ (ไม่บล็อก ยังกดเพิ่มได้) */}
      <DupOrderList orders={dupOrders} />
      <div className="flex gap-3 mt-3">
        <div className="flex flex-col items-center gap-1 flex-shrink-0">
          {editImg ? (
            <div className="w-24">
              <ImageInput value={card.image_key} folder="skus" onChange={(k) => { void onSaveImage(card.id, k); }} />
            </div>
          ) : (
            <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center overflow-hidden" title="คลิกเพื่อดูรูปใหญ่">
              {card.image_key
                ? <ImageGallery r2Key={card.image_key} />
                : <span className="text-slate-300 text-2xl">📦</span>}
            </div>
          )}
          <button type="button" onClick={() => setEditImg(v => !v)}
            className="text-[11px] text-blue-600 hover:underline">{editImg ? "เสร็จ" : "✎ แก้รูป"}</button>
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-800 text-sm">{card.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{s.code}</div>
          <div className="text-xs text-slate-500 mt-0.5">🏪 {s.seller}</div>
          <div className="text-sm font-semibold text-blue-600 mt-1">{s.price.toLocaleString()} {curLabel(s.currency)} / {s.uom}</div>
          {s.currency === "YUAN" && rate > 0 && <div className="text-xs text-slate-400">≈ ฿{Math.round(s.price * rate).toLocaleString()} / {s.uom}</div>}
          {stockQty != null && (
            <div className={`text-xs mt-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${stockQty > 0 ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
              📦 คงเหลือในสต๊อก: <b className="tabular-nums">{stockQty.toLocaleString()}</b> {s.uom}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน ({s.uom})</label>
          {/* ปุ่ม −/+ ตัวใหญ่ (กดง่ายบนมือถือ ไม่ต้องพิมพ์) + แป้นตัวเลขเมื่อพิมพ์ */}
          <div className="flex items-stretch gap-2">
            <button type="button" aria-label="ลดจำนวน" onClick={() => setQty(q => Math.max(0, Math.round(((Number(q) || 0) - 1) * 100) / 100))}
              className="w-12 h-11 flex items-center justify-center text-2xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 active:scale-95 select-none">−</button>
            <input type="number" inputMode="decimal" value={qty} min={0} step="any"
              onFocus={e => e.target.select()} onChange={e => setQty(Number(e.target.value))}
              className="flex-1 min-w-0 h-11 px-2 text-center text-lg font-medium border border-slate-200 rounded-md tabular-nums" />
            <button type="button" aria-label="เพิ่มจำนวน" onClick={() => setQty(q => Math.round(((Number(q) || 0) + 1) * 100) / 100)}
              className="w-12 h-11 flex items-center justify-center text-2xl text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 active:scale-95 select-none">+</button>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ (ถ้ามี)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น สีพิเศษ / ด่วน" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
        </div>
        {/* ⚡ ส่งด่วน → โชว์ช่องวันที่ใช้งาน (ไม่บังคับ) */}
        <div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={urgent} onChange={e => setUrgent(e.target.checked)} className="rounded border-slate-300" />
            <span className="font-medium">⚡ ส่งด่วน</span>
          </label>
          {urgent && (
            <div className="mt-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">วันที่ใช้งาน (ถ้ามี)</label>
              <input type="date" value={useDate} onChange={e => setUseDate(e.target.value)} className="w-full h-9 px-3 text-sm border border-amber-200 bg-amber-50/40 rounded-md" />
            </div>
          )}
        </div>
        {/* เหตุผลที่ขอซื้อ * (บังคับ) — สลับ 2 โหมด: เลือกเหตุผล / อ้างใบสั่งผลิต */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">เหตุผลที่ขอซื้อ <span className="text-rose-500">*</span></label>
          <div className="grid grid-cols-2 gap-1 mb-2 text-xs">
            <button type="button" onClick={() => setReasonMode("reason")}
              className={`py-1.5 rounded-md border transition-colors ${reasonMode === "reason" ? "bg-blue-600 text-white border-blue-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>📋 เหตุผล</button>
            <button type="button" onClick={() => setReasonMode("mo")}
              className={`py-1.5 rounded-md border transition-colors ${reasonMode === "mo" ? "bg-blue-600 text-white border-blue-600" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>🏭 ใบสั่งผลิต</button>
          </div>
          {reasonMode === "reason" ? (
            // ของกลาง RelationPicker (lookup_type=pr_reason) — มี "+ สร้างใหม่" ในตัว · เก็บเป็นข้อความ (name)
            <RelationPicker value={reasonId}
              onChange={(id, opt) => { setReasonId(id); setReasonText(opt?.label ?? ""); }}
              config={{ target_table: "erp_lookups", target_label_field: "name", lookup_type: "pr_reason" }}
              placeholder="เลือกเหตุผล (พิมพ์เพื่อเพิ่มใหม่)" required hasError={!reasonText} />
          ) : (
            <MoReasonPicker value={moPick} onPick={setMoPick} />
          )}
          {!reasonValid && <p className="mt-1 text-[11px] text-rose-500">* ต้องเลือกเหตุผลก่อนจึงเพิ่มลงตะกร้าได้</p>}
        </div>
      </div>
    </ERPModal>
  );
}

// ============================================================
// FilterCombobox — dropdown เลือก "ค่าจริง" ของ field (ของกลาง ไม่ hardcode)
// ค่าตัวเลือกดึงจาก /api/master-v2/skus/distinct (distinct ของคอลัมน์นั้น)
// ============================================================
function FilterCombobox({ column, label, values, onChange, relation, allFrom }: {
  column: string; label: string; values: string[]; onChange: (vals: string[]) => void;
  relation?: { moduleKey: string; labelField: string };
  // โหลด "ทุกตัวเลือก" จากตารางปลายทาง (ใช้กับ field many2many เช่น Product Family)
  allFrom?: { moduleKey: string; labelField: string };
}) {
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState<{ value: string; label: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  // โหลดตัวเลือก: relation → ดึง id+ชื่อ จากตารางปลายทาง / text → ดึงค่า distinct ของคอลัมน์
  const load = useCallback(async () => {
    if (opts !== null || loading) return;
    setLoading(true);
    try {
      if (allFrom) {
        // many2many: ดึงรายชื่อแท็กทั้งหมดจากตารางปลายทาง (id + ชื่อ)
        const j = await apiFetch(`/api/master-v2/${allFrom.moduleKey}?limit=500`).then(r => r.json());
        setOpts(((j.data ?? []) as Record<string, unknown>[])
          .map(r => ({ value: String(r.id), label: String(r[allFrom.labelField] ?? r.id) }))
          .sort((a, b) => a.label.localeCompare(b.label, "th")));
        return;
      }
      if (relation) {
        // โชว์เฉพาะค่าที่ "มีใช้จริง": 1) หา id ที่ถูกผูกกับสินค้าในคอลัมน์นี้ 2) ดึงชื่อเฉพาะ id เหล่านั้น
        const dj = await apiFetch(`/api/master-v2/skus/distinct?column=${encodeURIComponent(column)}&limit=2000`).then(r => r.json());
        const usedIds: string[] = Array.isArray(dj.values) ? dj.values : [];
        if (usedIds.length === 0) { setOpts([]); return; }
        const f = encodeURIComponent(JSON.stringify({ id: { type: "select", selected: usedIds } }));
        const j = await apiFetch(`/api/master-v2/${relation.moduleKey}?limit=2000&include_inactive=true&filters=${f}`).then(r => r.json());
        const byId = new Map(((j.data ?? []) as Record<string, unknown>[]).map(r => [String(r.id), String(r[relation.labelField] ?? r.id)]));
        // คงเฉพาะ id ที่ใช้จริง + เรียงตามชื่อ
        setOpts(usedIds.map(id => ({ value: id, label: byId.get(id) ?? id })).sort((a, b) => a.label.localeCompare(b.label, "th")));
      } else {
        const j = await apiFetch(`/api/master-v2/skus/distinct?column=${encodeURIComponent(column)}&limit=1000`).then(r => r.json());
        setOpts((Array.isArray(j.values) ? (j.values as string[]) : []).map(v => ({ value: v, label: v })));
      }
    } catch { setOpts([]); } finally { setLoading(false); }
  }, [opts, loading, relation, allFrom, column]);

  // perf: relation/m2m โหลดทันที "เฉพาะเมื่อมีค่าเลือกไว้" (ต้องดึงชื่อมาโชว์บนปุ่ม)
  // ถ้ายังไม่เลือกอะไร → ไม่โหลด รอจนกดเปิด dropdown (openList) — กันยิง distinct/relation หนักตอนเปิดหน้า
  useEffect(() => { if ((relation || allFrom) && values.length > 0) void load(); }, [relation, allFrom, load, values.length]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const openList = () => { setOpen(true); void load(); };
  const toggle = (val: string) => onChange(values.includes(val) ? values.filter(v => v !== val) : [...values, val]);

  const ql = q.trim().toLowerCase();
  const shown = (opts ?? []).filter(o => !ql || o.label.toLowerCase().includes(ql)).slice(0, 200);
  // ข้อความสรุปบนปุ่ม: 0 = placeholder, 1 = ชื่อค่านั้น, >1 = "N รายการ"
  const labelOf = (v: string) => opts?.find(o => o.value === v)?.label ?? "…";
  const summary = values.length === 0 ? null : values.length === 1 ? labelOf(values[0]) : `เลือก ${values.length} รายการ`;

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => (open ? setOpen(false) : openList())}
        className="w-full min-h-8 px-2 py-1 text-xs text-left border border-slate-200 rounded-md bg-white flex items-center justify-between gap-1">
        <span className={summary ? "text-slate-700 truncate" : "text-slate-400"}>{summary || `เลือก ${label}`}</span>
        {values.length > 0
          ? <span role="button" tabIndex={-1} onClick={(e) => { e.stopPropagation(); onChange([]); }} className="text-slate-400 hover:text-red-500 flex-shrink-0">✕</span>
          : <span className="text-slate-400 flex-shrink-0">▾</span>}
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหา..."
            className="w-full h-8 px-2 text-xs border-b border-slate-100 outline-none" />
          {loading && <div className="px-2 py-2 text-xs text-slate-400">กำลังโหลด…</div>}
          {!loading && shown.length === 0 && <div className="px-2 py-2 text-xs text-slate-300">— ไม่พบค่า —</div>}
          {shown.map(o => {
            const on = values.includes(o.value);
            return (
              <button key={o.value} type="button" onClick={() => toggle(o.value)}
                className={`flex items-center gap-2 w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 ${on ? "bg-blue-50/60 text-blue-700" : "text-slate-700"}`}>
                <input type="checkbox" readOnly checked={on} className="pointer-events-none" />
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
