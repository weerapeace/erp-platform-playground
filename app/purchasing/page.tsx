"use client";

/**
 * PR Shopping — ขอซื้อแบบช้อปปิ้งสโตร์ (2 แหล่งสินค้า)
 * - SKU จริง: การ์ด = skus_v2 โดยตรง (ค้นหา/กรอง/เลื่อนหน้า ฝั่ง server) → คลิก → popup ยืนยัน
 * - Product Group: product_groups (การ์ด) → product_variations (popup เลือกตัวเลือก)
 * Filter ฝั่งซ้ายไม่ hardcode — ติ๊กเลือก field กรองเองจากทะเบียน field (skus-v2)
 * เลือก → ตะกร้า → สร้างใบขอซื้อ (PR + lines). currency: ร้าน CN → YUAN
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlaygroundShell } from "@/components/playground-shell";
import { useAuth, usePermission, AccessDenied } from "@/components/auth";
import { apiFetch } from "@/lib/api";
import { SkuFormModal } from "@/components/sku-form-modal";
import { RecordFormModal } from "@/components/record-form-modal";
import { ERPModal, useBackdropDismiss } from "@/components/modal";
import { useToast } from "@/components/toast";
import { SkuImagePicker, type PickedSku } from "@/components/sku-image-picker";
import { ImageGallery, HoverZoomImage } from "@/components/image-input";

type SkuInfo = { code: string | null; seller: string; country: string; price: number; currency: string; uom: string };
type Card = { id: string; name: string; sub: string | null; image_key: string | null; sku?: SkuInfo };
type Variation = { key: string; label: string; color: string | null; seller: string; country: string; price: number; currency: string; uom: string; image: string | null; variationId: string | null; skuRef: string | null; skuId: string | null };
type Line = { label: string; qty: number; uom: string; seller: string; price: number; currency: string; image: string | null; variationId: string | null; skuRef: string | null; skuId: string | null; note: string; usedForId?: string | null; usedForLabel?: string | null };
type Source = "sku" | "group" | "favorite" | "frequent";

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

export default function PurchasingShopPage() {
  const { user } = useAuth();
  const canView = usePermission("products.view");
  const toast = useToast();
  const [source, setSource] = useState<Source>("sku");

  // grid
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);   // ข้อ 2: error state
  const [page, setPage] = useState(0);   // หน้า (0-based)
  const [q, setQ] = useState("");
  const [cols, setCols] = useState(4);

  // filter (SKU mode, configurable)
  const [filterFields, setFilterFields] = useState<FilterField[]>([]);
  const [activeKeys, setActiveKeys] = useState<string[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, ColFilter>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  // กฎกลาง: แท็ก (ประเภทสินค้า) ที่ตั้งว่า "ห้ามขอซื้อ" → ซ่อนสินค้าที่ติดแท็กนี้ทั้งบริษัท
  const [hiddenTagIds, setHiddenTagIds] = useState<string[]>([]);
  const [tagNames, setTagNames] = useState<Record<string, string>>({});        // id → ชื่อแท็ก (ไว้โชว์บนการ์ด)
  const [cardTags, setCardTags] = useState<Record<string, string[]>>({});       // sku_id → [tag_id] ของการ์ดที่แสดงอยู่
  const [m2mMode, setM2mMode] = useState<Record<string, "hide" | "show">>({});  // โหมดตัวกรองแต่ละ field: ซ่อน/โชว์เฉพาะ

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
  // ฟอร์มเพิ่ม/แก้ไขสินค้า (SKU) แบบ popup
  const [skuForm, setSkuForm] = useState<{ mode: "create" | "edit"; id?: string } | null>(null);

  // cart + save
  const [cart, setCart] = useState<Line[]>([]);
  const [partnerCountry, setPartnerCountry] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // วันที่สั่ง — ใส่ครั้งเดียวตอนกดสร้าง ใช้กับทุกใบ (default = วันนี้)
  const [orderDate, setOrderDate] = useState(() => new Date().toISOString().slice(0, 10));
  // ข้อ 4: ใช้กับสินค้า (ปลายทาง) ระดับตะกร้า — เติมเฉพาะใบที่ยังไม่ได้ตั้งรายชิ้น
  const [cartUsedFor, setCartUsedFor] = useState<PickedSku | null>(null);
  const [cartPickerOpen, setCartPickerOpen] = useState(false);

  // ⭐ favorite (รายการโปรด) — แบบรวมทั้งบริษัท
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const favoritesRef = useRef(favorites);
  useEffect(() => { favoritesRef.current = favorites; }, [favorites]);
  // โหลดรายการโปรดครั้งแรก
  useEffect(() => {
    apiFetch("/api/purchasing/favorites").then(r => r.json())
      .then(j => { if (Array.isArray(j.ids)) setFavorites(new Set(j.ids as string[])); })
      .catch(() => {});
  }, []);

  // โหลดรายชื่อแท็กทั้งหมด (id→ชื่อ) + แท็กที่ตั้ง "ห้ามขอซื้อ" (กฎกลาง) ในครั้งเดียว
  useEffect(() => {
    apiFetch(`/api/master-v2/product_families?limit=500`).then(r => r.json())
      .then(j => {
        const rows = (j.data ?? []) as Record<string, unknown>[];
        const names: Record<string, string> = {};
        const hidden: string[] = [];
        rows.forEach(t => {
          names[String(t.id)] = String(t.name ?? t.id);
          if (t.hide_in_purchasing === true) hidden.push(String(t.id));
        });
        setTagNames(names); setHiddenTagIds(hidden);
      })
      .catch(() => {});
  }, []);
  // แยกแท็กที่เลือกเป็น 2 กอง ตามโหมดของแต่ละตัวกรอง: ซ่อน (hide) / โชว์เฉพาะ (show)
  // ซ่อน = กฎกลาง (ห้ามขอซื้อ) + ที่ผู้ใช้เลือกโหมดซ่อน ; โชว์เฉพาะ = ที่ผู้ใช้เลือกโหมดโชว์
  const { exclTagIds, inclTagIds } = useMemo(() => {
    const ex = new Set<string>(hiddenTagIds);
    const inc = new Set<string>();
    for (const k of activeKeys) {
      const fd = filterFields.find(f => f.key === k);
      if (!fd?.m2m || fd.m2m.junction !== "skus_v2_product_family_m2m") continue;
      const v = filterValues[k];
      if (!(v && v.type === "select")) continue;
      const target = (m2mMode[k] ?? "hide") === "show" ? inc : ex;
      v.selected.forEach(id => target.add(id));
    }
    return { exclTagIds: [...ex], inclTagIds: [...inc] };
  }, [hiddenTagIds, activeKeys, filterFields, filterValues, m2mMode]);
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
    apiFetch("/api/master-v2/daily-rates?limit=1&sort_by=rate_date&sort_dir=desc").then(r => r.json())
      .then(j => { const rt = num((j.data ?? [])[0]?.rate); if (rt > 0) setCnyRate(rt); })
      .catch(() => {});
  }, []);

  // โหลด preference (จำนวนคอลัมน์ + filter ที่เคยเลือก)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = Number(localStorage.getItem(COLS_KEY)); if (c >= 2 && c <= 10) setCols(c);
    try { const k = JSON.parse(localStorage.getItem(FILT_KEY) ?? "[]"); if (Array.isArray(k)) setActiveKeys(k); } catch { /* ignore */ }
    // ข้อ 4: กู้ตะกร้าที่ค้างไว้ (กันหายเมื่อรีเฟรช)
    try { const c2 = JSON.parse(localStorage.getItem(CART_KEY) ?? "[]"); if (Array.isArray(c2) && c2.length) setCart(c2 as Line[]); } catch { /* ignore */ }
  }, []);
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
  };

  // โหลด partner country (สำหรับ currency rule) + filterable fields ของ SKU
  useEffect(() => {
    apiFetch("/api/master-v2/partners?limit=500").then(r => r.json()).then(j => {
      const m: Record<string, string> = {};
      (j.data ?? []).forEach((p: Record<string, unknown>) => { m[String(p.id)] = String(p.country ?? "TH"); });
      setPartnerCountry(m);
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
  }, []);

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
    const country = partnerCountry[sid] ?? "TH";
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
  }, [partnerCountry]);

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
        const fp = Object.keys(builtFilters).length ? `&filters=${encodeURIComponent(JSON.stringify(builtFilters))}` : "";
        const sp = q ? `&search=${encodeURIComponent(q)}` : "";
        const j = await apiFetch(`/api/master-v2/skus?limit=${PAGE}&offset=${pg * PAGE}${sp}${fp}${exclParam}`).then(r => r.json());
        const mapped: Card[] = (j.data ?? []).map(mapSku);
        // จัดเรียงตามความใกล้เคียงกับคำค้น: ตรงเป๊ะ → ขึ้นต้น → มีอยู่ในโค้ด → มีอยู่ในชื่อ
        if (q) {
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
      } else if (source === "group") {
        const j = await apiFetch("/api/master-v2/product-groups?limit=500").then(r => r.json());
        nextCards = (j.data ?? []).map((g: Record<string, unknown>) => ({
          id: String(g.id), name: String(g.name ?? ""), sub: (g.brand as string) ?? null,
          image_key: (g.image_key as string) ?? null,
        }));
        nextTotal = nextCards.length;
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
    }
  }, [source, q, builtFilters, mapSku, fetchSkusByIds, exclParam]);

  // refetch + reset ไปหน้าแรก — หน่วงเวลา (debounce) เฉพาะตอน "พิมพ์ค้นหา" เท่านั้น
  // ส่วนการสลับโหมด / เปลี่ยน filter → ดึงทันที ไม่หน่วง (ให้กดแล้วเปลี่ยนทันที ไม่กระตุก)
  useEffect(() => {
    const qChanged = prevQ.current !== q;
    prevQ.current = q;
    setPage(0);
    if (qChanged) {
      const t = setTimeout(() => { void fetchCards(0); }, 300);
      return () => clearTimeout(t);
    }
    void fetchCards(0);
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
  const addSku = (c: Card, qty: number, note: string, usedFor?: PickedSku | null) => {
    const s = c.sku!;
    setCart(p => [...p, { label: c.name, qty, uom: s.uom, seller: s.seller, price: s.price, currency: s.currency, image: c.image_key, variationId: null, skuRef: s.code, skuId: c.id, note, usedForId: usedFor?.id ?? null, usedForLabel: usedFor?.name ?? null }]);
    setConfirmSku(null);
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
            used_for_sku_id: l.usedForId ?? cartUsedFor?.id ?? null,        // รายชิ้นก่อน → ไม่มีค่อยใช้ระดับตะกร้า
            used_for_label:  l.usedForLabel ?? cartUsedFor?.name ?? null,
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
      <div className="flex flex-col md:flex-row md:h-[calc(100vh-3.5rem)]">
        {/* Filter sidebar */}
        <aside className="w-full md:w-60 flex-shrink-0 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:overflow-auto">
          <h2 className="font-semibold text-slate-800 mb-3">🛒 ขอซื้อ</h2>
          {/* source toggle (โหมดแสดงสินค้า) */}
          <div className="grid grid-cols-2 gap-1 mb-3 text-xs">
            {([
              ["sku", "SKU จริง"], ["group", "Product Group"],
              ["favorite", "⭐ รายการโปรด"], ["frequent", "🔁 ซื้อบ่อย"],
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
                      {fd.m2m ? (
                        <div className="flex items-center justify-between mb-1 gap-1">
                          <span className="text-xs font-medium text-slate-600">{fd.label}</span>
                          <div className="flex rounded-md border border-slate-200 overflow-hidden text-[10px] flex-shrink-0">
                            {([["hide", "🙈 ซ่อน"], ["show", "👁 โชว์เฉพาะ"]] as ["hide" | "show", string][]).map(([m, lbl]) => (
                              <button key={m} type="button" onClick={() => setM2mMode(p => ({ ...p, [k]: m }))}
                                className={`px-1.5 py-0.5 ${(m2mMode[k] ?? "hide") === m ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>{lbl}</button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-slate-600 mb-1">{fd.label}</div>
                      )}
                      {fd.m2m ? (
                        <>
                          <FilterCombobox
                            column={fd.column}
                            label={fd.label}
                            allFrom={fd.m2m}
                            values={cur && cur.type === "select" ? cur.selected : []}
                            onChange={(vals) => setFV(k, vals.length ? { type: "select", selected: vals } : null)}
                          />
                          <p className="text-[10px] text-slate-400 mt-1">{(m2mMode[k] ?? "hide") === "show" ? "โชว์เฉพาะสินค้าที่ติดแท็กที่เลือก" : "เลือกแล้วสินค้าที่ติดแท็กนั้นจะไม่แสดง"}</p>
                        </>
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
        </aside>

        {/* Grid */}
        <main className="flex-1 md:overflow-auto p-5">
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h1 className="text-xl font-semibold text-slate-800 flex-shrink-0">เลือกสินค้าที่ต้องการขอซื้อ</h1>
            {/* ช่องค้นหาด้านบน (ใช้ร่วมกับช่องค้นหาแถบซ้าย) */}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 ค้นหาสินค้า (ชื่อ/รหัส)..."
              className="flex-1 min-w-[180px] max-w-md h-9 px-3 text-sm border border-slate-200 rounded-md" />
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

          {/* ข้อ 1: ปุ่มเลื่อนหน้าด้านบน (เฉพาะ SKU ที่แบ่งหน้าฝั่ง server) */}
          {!loading && source === "sku" && total > PAGE && (
            <div className="flex items-center justify-end gap-2 mb-3">
              <span className="text-xs text-slate-400 mr-1">{total.toLocaleString()} รายการ</span>
              <button onClick={() => goToPage(page - 1)} disabled={page <= 0}
                className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">◀ หน้าก่อน</button>
              <span className="text-xs font-semibold text-slate-700">หน้า {page + 1} / {totalPages}</span>
              <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                className="h-8 px-3 text-xs font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">หน้าถัดไป ▶</button>
            </div>
          )}

          <div className={`grid gap-4 transition-opacity duration-200 ${loading ? "opacity-40" : "opacity-100"}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
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
                {/* ข้อ 6: ป้ายบอกว่าอยู่ในตะกร้าแล้ว + จำนวน */}
                {c.sku && cartQtyBySku.has(c.id) && (
                  <span className="absolute top-2 left-2 z-10 px-1.5 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-medium shadow-sm">🛒 {cartQtyBySku.get(c.id)}</span>
                )}
                <button onClick={() => onCardClick(c)}
                  className="w-full text-left bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-blue-300 hover:shadow-md transition-all">
                  <div className="aspect-square bg-slate-50 flex items-center justify-center">
                    {img(c.image_key)
                      ? <HoverZoomImage src={img(c.image_key)!} className="w-full h-full object-cover" />
                      : <span className="text-slate-300 text-3xl">📦</span>}
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-slate-800 text-sm line-clamp-2">{c.name}</div>
                    {c.sku ? (
                      <>
                        {c.sub && <div className="text-[11px] font-mono text-slate-500 bg-slate-50 inline-block px-1.5 py-0.5 rounded mt-0.5 max-w-full truncate">{c.sub}</div>}
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">🏪 {c.sku.seller}</div>
                        <div className="text-sm font-semibold text-blue-600 mt-1">{c.sku.price.toLocaleString()} {c.sku.currency}<span className="text-xs font-normal text-slate-400"> / {c.sku.uom}</span></div>
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
            {!loading && !error && cards.length === 0 && <div className="col-span-full text-center text-slate-300 py-16">ไม่พบสินค้า</div>}
          </div>

          {loading && <div className="text-center text-slate-400 py-6 text-sm">กำลังโหลด…</div>}

          {/* แถบล่าง: เลื่อนหน้า (ตัวหลัก) + ตัวปรับขนาดการ์ด */}
          {!loading && cards.length > 0 && (
            <div className="flex items-center justify-center gap-6 py-6 flex-wrap">
              {/* เลื่อนหน้า — ตัวควบคุมหลัก (เฉพาะ SKU ที่แบ่งหน้าฝั่ง server) */}
              {source === "sku" && total > PAGE && (
                <div className="flex items-center gap-2">
                  <button onClick={() => goToPage(page - 1)} disabled={page <= 0}
                    className="h-10 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">◀ หน้าก่อน</button>
                  <span className="text-sm font-semibold text-slate-700 px-2">หน้า {page + 1} / {totalPages}</span>
                  <button onClick={() => goToPage(page + 1)} disabled={page >= totalPages - 1}
                    className="h-10 px-4 text-sm font-medium border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40">หน้าถัดไป ▶</button>
                </div>
              )}
              {/* จำนวน + ขนาดการ์ด/แถว (ตัวเลือกรอง) */}
              <div className="flex items-center gap-3 text-slate-400">
                <span className="text-sm">{total.toLocaleString()} รายการ</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <span>การ์ด/แถว</span>
                  <select value={cols} onChange={e => changeCols(Number(e.target.value))}
                    className="h-9 px-2 text-sm border border-slate-200 rounded-lg bg-white text-slate-600">
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
            </div>
          )}
        </main>

        {/* Cart */}
        <aside className="w-full md:w-80 flex-shrink-0 border-t md:border-t-0 md:border-l border-slate-200 flex flex-col">
          <div className="p-4 border-b border-slate-100 font-semibold text-slate-800">ใบขอซื้อ ({cart.length})</div>
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
                  <input type="number" value={l.qty} min={1} step="any" onChange={e => setCart(c => c.map((x, j) => j === i ? { ...x, qty: Number(e.target.value) } : x))}
                    className="w-16 h-6 px-1 border border-slate-200 rounded" /> {l.uom}
                  <span className="ml-auto text-right leading-tight">
                    <span className="block text-sm font-semibold text-slate-700 tabular-nums">{(l.price * (Number(l.qty) || 0)).toLocaleString()} {l.currency}</span>
                    {l.currency === "YUAN" && cnyRate > 0 && <span className="block text-[10px] text-slate-400">≈ ฿{Math.round(l.price * (Number(l.qty) || 0) * cnyRate).toLocaleString()}</span>}
                    <span className="block text-[10px] text-slate-400">@ {l.price.toLocaleString()} / {l.uom}</span>
                  </span>
                </div>
                {l.note && <div className="text-[11px] text-amber-600 mt-0.5">📝 {l.note}</div>}
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
                      <span className="text-sm text-slate-500">ยอดรวมทั้งหมด{multi ? ` (${cur})` : ""}</span>
                      <span className="text-right">
                        <span className="block text-base font-bold text-blue-600 tabular-nums">{sum.toLocaleString()} {cur}</span>
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
            {/* ข้อ 4: ใช้กับสินค้า (ปลายทาง) — ใช้กับทุกใบ (เติมเฉพาะใบที่ยังไม่ได้ตั้งรายชิ้น) */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">🎯 ใช้กับสินค้า (ทุกใบ)</label>
              {cartUsedFor ? (
                <div className="flex items-center gap-2 h-9 px-2 border border-slate-200 rounded-md bg-slate-50">
                  <span className="text-sm text-slate-700 truncate flex-1">{cartUsedFor.name}{cartUsedFor.code ? ` (${cartUsedFor.code})` : ""}</span>
                  <button type="button" onClick={() => setCartPickerOpen(true)} className="text-xs text-blue-600 hover:underline shrink-0">เปลี่ยน</button>
                  <button type="button" onClick={() => setCartUsedFor(null)} className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
                </div>
              ) : (
                <button type="button" onClick={() => setCartPickerOpen(true)}
                  className="w-full h-9 px-3 text-sm text-left text-slate-400 border border-dashed border-slate-300 rounded-md hover:border-blue-300 hover:text-blue-600">
                  + เลือกสินค้าปลายทาง (ใช้กับใบที่ยังไม่ได้ตั้ง)
                </button>
              )}
            </div>
            <button onClick={save} disabled={saving || cart.length === 0}
              className="w-full h-10 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              {saving ? "กำลังสร้าง..." : `สร้างใบขอซื้อ (${cart.length} ใบ) →`}
            </button>
          </div>
        </aside>
      </div>

      {/* ข้อ 4: picker เลือกสินค้าปลายทางระดับตะกร้า */}
      <SkuImagePicker open={cartPickerOpen} onClose={() => setCartPickerOpen(false)}
        title="เลือกสินค้าปลายทาง (ใช้กับทุกใบในตะกร้า)"
        onPick={(sku) => { setCartUsedFor(sku); setCartPickerOpen(false); }} />

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
        <ConfirmSku card={confirmSku} rate={cnyRate} onClose={() => setConfirmSku(null)}
          onAdd={(qty, note, usedFor) => addSku(confirmSku, qty, note, usedFor)}
          onEdit={() => setSkuForm({ mode: "edit", id: confirmSku.id })} />
      )}

      {/* ฟอร์มเพิ่ม/แก้ไขสินค้า (SKU) */}
      {skuForm && (
        <SkuFormModal mode={skuForm.mode} skuId={skuForm.id} onClose={() => setSkuForm(null)}
          onSaved={() => { setSkuForm(null); setConfirmSku(null); setPage(0); void fetchCards(0); }} />
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

    </PlaygroundShell>
  );
}

function AddBtn({ onAdd }: { onAdd: (qty: number) => void }) {
  const [qty, setQty] = useState(1);
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <input type="number" value={qty} min={1} step="any" onChange={e => setQty(Number(e.target.value))} className="w-14 h-8 px-1 text-sm border border-slate-200 rounded" />
      <button onClick={() => onAdd(qty)} className="h-8 px-3 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700">+ เพิ่ม</button>
    </div>
  );
}

function ConfirmSku({ card, rate, onClose, onAdd, onEdit }: { card: Card; rate: number; onClose: () => void; onAdd: (qty: number, note: string, usedFor: PickedSku | null) => void; onEdit: () => void }) {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [usedFor, setUsedFor] = useState<PickedSku | null>(null);   // 🎯 ใช้กับสินค้า (ปลายทาง)
  const [pickerOpen, setPickerOpen] = useState(false);
  const s = card.sku!;
  return (
    <ERPModal open onClose={onClose} size="md" title="เพิ่มลงใบขอซื้อ"
      footer={
        <>
          <button onClick={onEdit} className="mr-auto h-9 px-3 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">✎ แก้ไขสินค้า</button>
          <button onClick={onClose} className="px-4 h-9 text-sm border border-slate-200 rounded-lg text-slate-600 hover:bg-slate-50">ยกเลิก</button>
          <button onClick={() => onAdd(qty, note, usedFor)} disabled={qty <= 0} className="px-5 h-9 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">+ เพิ่มลงตะกร้า</button>
        </>
      }>
      <div className="flex gap-3">
        <div className="w-20 h-20 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 overflow-hidden" title="คลิกเพื่อดูรูปใหญ่">
          {card.image_key
            ? <ImageGallery r2Key={card.image_key} />
            : <span className="text-slate-300 text-2xl">📦</span>}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-slate-800 text-sm">{card.name}</div>
          <div className="text-xs text-slate-400 mt-0.5">{s.code}</div>
          <div className="text-xs text-slate-500 mt-0.5">🏪 {s.seller}</div>
          <div className="text-sm font-semibold text-blue-600 mt-1">{s.price.toLocaleString()} {s.currency} / {s.uom}</div>
          {s.currency === "YUAN" && rate > 0 && <div className="text-xs text-slate-400">≈ ฿{Math.round(s.price * rate).toLocaleString()} / {s.uom}</div>}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน ({s.uom})</label>
          <input type="number" value={qty} min={1} step="any" onChange={e => setQty(Number(e.target.value))} className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ (ถ้ามี)</label>
          <input value={note} onChange={e => setNote(e.target.value)} placeholder="เช่น สีพิเศษ / ด่วน" className="w-full h-9 px-3 text-sm border border-slate-200 rounded-md" />
        </div>
        {/* 🎯 ใช้กับสินค้า (ปลายทาง) — เลือกจาก SKU แบบมีรูป */}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">🎯 ใช้กับสินค้า (ปลายทาง) — ถ้ามี</label>
          {usedFor ? (
            <div className="flex items-center gap-2 h-9 px-2 border border-slate-200 rounded-md bg-slate-50">
              <span className="text-sm text-slate-700 truncate flex-1">{usedFor.name}{usedFor.code ? ` (${usedFor.code})` : ""}</span>
              <button type="button" onClick={() => setPickerOpen(true)} className="text-xs text-blue-600 hover:underline shrink-0">เปลี่ยน</button>
              <button type="button" onClick={() => setUsedFor(null)} className="text-slate-400 hover:text-red-500 shrink-0">✕</button>
            </div>
          ) : (
            <button type="button" onClick={() => setPickerOpen(true)}
              className="w-full h-9 px-3 text-sm text-left text-slate-400 border border-dashed border-slate-300 rounded-md hover:border-blue-300 hover:text-blue-600">
              + เลือกสินค้าปลายทาง (เช่น PIX10)
            </button>
          )}
        </div>
      </div>
      <SkuImagePicker open={pickerOpen} onClose={() => setPickerOpen(false)}
        title="เลือกสินค้าปลายทาง (ที่จะเอาของนี้ไปใช้)"
        onPick={(sku) => { setUsedFor(sku); setPickerOpen(false); }} />
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

  // relation / m2m: โหลดทันที (เพื่อโชว์ "ชื่อ" ของค่าที่เลือกไว้) / text: โหลดตอนเปิด
  useEffect(() => { if (relation || allFrom) void load(); }, [relation, allFrom, load]);

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
