"use client";

// สินค้าบนแพลตฟอร์ม (Platform Catalog) — ดูว่าแต่ละร้านมีสินค้าอะไร แล้วจับคู่กับสินค้าในระบบเรา + ตั้งค่าส่งข้อมูล (field mapping)
// หน้าหลัก: ปุ่มเลือกร้าน · การ์ดตัวเลขกดกรอง (StatFilterCards) · ตารางกลาง MiniTable · ยืนยัน/จับคู่ในแถว (MatchCandidates)
// โหมดจับคู่ทีละตัว: components/platform-catalog/match-workbench
// เดาคู่: /api/platform-catalog/suggest (ของกลาง lib/platform-match-suggest) · บันทึก: /api/platform-catalog/match (+ประวัติ เดิม→ใหม่)
// 🐛 เคยเจอ: เลือก Lazada แต่ตารางโชว์ของ Shopee — คำตอบของร้านเดิมที่มาช้ามาทับ → ทุกการโหลดมีเลขรอบ ทิ้งคำตอบของรอบเก่า

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useToast } from "@/components/toast";
import { MiniTable, type MiniColumn } from "@/components/mini-table";
import { ERPModal, ConfirmDialog } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { EmptyState, ErrorState, LoadingState } from "@/components/state-views";
import { StatFilterCards } from "@/components/stat-filter-cards";
import { PlatformIcon } from "@/components/platform-icon";
import { MatchCandidates, type PickedParent } from "@/components/platform-catalog/match-candidates";
import { MatchWorkbench } from "@/components/platform-catalog/match-workbench";
import { PLATFORM_SOURCE_FIELDS } from "@/lib/platform-source-fields";
import { isSellingPlatform } from "@/lib/selling-platforms";
import type { MatchSuggestion } from "@/lib/platform-match-suggest";
import { detectProfile, profilesForPlatform, getProfile, dbRowToProfile, type ImportMatrix, type ImportProfile, type DbProfileRow } from "@/lib/platform-import-profiles";
import PlatformImportProfileManager from "@/components/platform-import-profile-manager";

// Drawer รายละเอียดต่อแพลตฟอร์ม (ของกลาง เปิดจาก Parent SKUs ด้วย) — dynamic กัน bundle หนัก
const ProductPlatformManager = dynamic(() => import("@/components/product-platform-manager").then((m) => m.ProductPlatformManager), { ssr: false });

type Platform = { id: string; code: string; name_th: string; icon_key: string | null };
type Brand = { id: string; name: string };
type FieldRow = { field_key: string; field_label: string | null; data_type: string | null; is_required: boolean; sample: string | null; source: string };
type Listing = { id: string; external_product_id: string | null; title: string | null; sku_code: string | null; matched_parent_sku_id: string | null; matched_code?: string | null; matched_name?: string | null; price: number | null; status: string | null };
type Filter = "all" | "ok" | "guess" | "none";

// คะแนนตั้งแต่นี้ = นับเป็น "ระบบเดาให้" (ต่ำกว่านี้เดาจากชื่ออย่างเดียว → อยู่กลุ่ม "ยังไม่มีคู่" แต่ยังโชว์ให้เลือกตอนกาง)
const GUESS_MIN = 60;
// ยืนยันทีเดียวเกินนี้ต้องพิมพ์คำยืนยัน (กฎ bulk ของระบบ)
const TYPED_CONFIRM_OVER = 100;
const LAST_KEY = "platform-catalog:last";
function readLast(): { platformId?: string; brandId?: string } {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? "{}") as { platformId?: string; brandId?: string }; } catch { return {}; }
}

export default function PlatformCatalogPage() {
  const { can } = useAuth();
  const toast = useToast();
  const canEdit = can("products.platforms.edit");
  const fileRef = useRef<HTMLInputElement>(null);
  const catFileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // คิวไฟล์ที่อ่านแล้วรอยืนยันชนิด (เลือกได้หลายไฟล์ เดาให้ทุกไฟล์ → ยืนยัน → นำเข้าตามลำดับ)
  const [queue, setQueue] = useState<{ id: number; fileName: string; matrix: ImportMatrix; profileId: string }[]>([]);
  const qid = useRef(0);
  // ชนิดไฟล์ที่ผู้ใช้สร้างเอง (custom, active) — รวมกับโปรไฟล์มาตรฐานตอนเดา/เลือก
  const [customProfiles, setCustomProfiles] = useState<ImportProfile[]>([]);
  const [showManager, setShowManager] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  // ป๊อปรายละเอียดสินค้าบนร้าน (กดแถว)
  const [openListing, setOpenListing] = useState<Listing | null>(null);
  const [modalSugs, setModalSugs] = useState<MatchSuggestion[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [managerParent, setManagerParent] = useState<string | null>(null);   // เปิด ProductPlatformManager (แก้รายละเอียดต่อแพลตฟอร์ม)
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [platformId, setPlatformId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [bootError, setBootError] = useState<string | null>(null);
  const [tab, setTab] = useState<"catalog" | "fields" | "mapping">("catalog");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [platformCounts, setPlatformCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // คู่ที่ระบบเดา (โหลดตามหลังตาราง)
  const [suggestions, setSuggestions] = useState<Record<string, MatchSuggestion[]>>({});
  const [high, setHigh] = useState<Set<string>>(new Set());
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState(false);
  // จับคู่ในแถว / ทีละตัว / ยืนยันหลายตัว
  const [filter, setFilter] = useState<Filter>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [workbench, setWorkbench] = useState(false);
  const [bulkAsk, setBulkAsk] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  // รายชื่อร้าน (เฉพาะร้านขายของ) + แบรนด์ → เปิดร้าน/แบรนด์ที่ดูล่าสุด
  useEffect(() => { (async () => {
    try {
      const j = await apiFetch("/api/platform-accounts").then((r) => r.json());
      if (j.error) throw new Error(j.error);
      const pfs = ((j.platforms ?? []) as Platform[]).filter((p) => isSellingPlatform(p.code));
      const brs = (j.brands ?? []) as Brand[];
      const last = readLast();
      setPlatforms(pfs); setBrands(brs);
      setBrandId(last.brandId && brs.some((b) => b.id === last.brandId) ? last.brandId : "");
      setPlatformId(last.platformId && pfs.some((p) => p.id === last.platformId) ? last.platformId : (pfs[0]?.id ?? ""));
      setBootError(null);
    } catch (e) { setBootError((e as Error).message); }
  })(); }, []);
  useEffect(() => {
    if (!platformId) return;
    try { localStorage.setItem(LAST_KEY, JSON.stringify({ platformId, brandId })); } catch { /* โหมดส่วนตัว — ไม่จำก็ได้ */ }
  }, [platformId, brandId]);

  // โหลดชนิดไฟล์ที่ผู้ใช้สร้างเอง (เฉพาะที่เปิดใช้งาน) สำหรับใช้เดา/เลือกตอนนำเข้า
  const profSeq = useRef(0);
  const loadCustomProfiles = useCallback(async () => {
    const my = ++profSeq.current;
    if (!platformId) { setCustomProfiles([]); return; }
    try {
      const j = await apiFetch(`/api/platform-import-profiles?platform_id=${platformId}`).then((r) => r.json());
      if (my !== profSeq.current) return;
      const code = (j.platformCode as string) ?? platforms.find((p) => p.id === platformId)?.code ?? "";
      const rows = ((j.custom ?? []) as (DbProfileRow & { is_active?: boolean })[]).filter((r) => r.is_active !== false);
      setCustomProfiles(rows.map((r) => dbRowToProfile(r, code)));
    } catch { if (my === profSeq.current) setCustomProfiles([]); }
  }, [platformId, platforms]);
  useEffect(() => { loadCustomProfiles(); }, [loadCustomProfiles]);

  // โหลดสินค้าของร้าน+แบรนด์ที่เลือก → แล้วค่อยเดาคู่ตามหลัง (ช้ากว่า) — ตารางขึ้นก่อน
  // เลขรอบ (reqSeq): สลับร้าน/แบรนด์ระหว่างโหลด → คำตอบของรอบเก่าถูกทิ้ง ไม่มาทับร้านที่เลือกอยู่
  const reqSeq = useRef(0);
  const load = useCallback(async () => {
    if (!platformId) return;
    const my = ++reqSeq.current;
    setLoading(true); setLoadError(null);
    setListings([]); setFields([]); setMappings({});
    setSuggestions({}); setHigh(new Set()); setSuggestError(false); setExpanded(new Set());
    let unmatched = 0;
    try {
      const q = new URLSearchParams({ platform_id: platformId, with_counts: "1" }); if (brandId) q.set("brand_id", brandId);
      const [j, mj] = await Promise.all([
        apiFetch(`/api/platform-catalog?${q}`).then((r) => r.json()),
        apiFetch(`/api/platform-field-mappings?platform_id=${platformId}`).then((r) => r.json()),
      ]);
      if (my !== reqSeq.current) return;
      if (j.error) throw new Error(j.error);
      const ls = (j.listings ?? []) as Listing[];
      setFields((j.fields ?? []) as FieldRow[]);
      setListings(ls);
      setMappings((mj.mappings ?? {}) as Record<string, string>);
      if (j.platform_counts) setPlatformCounts(j.platform_counts as Record<string, number>);
      unmatched = ls.filter((l) => !l.matched_parent_sku_id).length;
    } catch (e) {
      if (my === reqSeq.current) setLoadError((e as Error).message);
      return;
    } finally { if (my === reqSeq.current) setLoading(false); }

    if (unmatched === 0) return;
    setSuggestLoading(true);
    try {
      const sq = new URLSearchParams({ platform_id: platformId }); if (brandId) sq.set("brand_id", brandId);
      const sj = await apiFetch(`/api/platform-catalog/suggest?${sq}`).then((r) => r.json());
      if (my !== reqSeq.current) return;
      if (sj.error) throw new Error(sj.error);
      setSuggestions((sj.suggestions ?? {}) as Record<string, MatchSuggestion[]>);
      setHigh(new Set((sj.high ?? []) as string[]));
    } catch { if (my === reqSeq.current) setSuggestError(true); }
    finally { if (my === reqSeq.current) setSuggestLoading(false); }
  }, [platformId, brandId]);
  useEffect(() => { load(); }, [load]);

  // ---------- จับคู่ ----------
  const statusOf = useCallback((l: Listing): Exclude<Filter, "all"> =>
    l.matched_parent_sku_id ? "ok" : (suggestions[l.id]?.[0]?.score ?? 0) >= GUESS_MIN ? "guess" : "none", [suggestions]);
  const counts = useMemo(() => {
    const c = { all: listings.length, ok: 0, guess: 0, none: 0 };
    for (const l of listings) c[statusOf(l)]++;
    return c;
  }, [listings, statusOf]);
  const highRows = useMemo(() => listings.filter((l) => !l.matched_parent_sku_id && high.has(l.id) && suggestions[l.id]?.[0]), [listings, high, suggestions]);
  const shownRows = useMemo(() => filter === "all" ? listings : listings.filter((l) => statusOf(l) === filter), [listings, filter, statusOf]);

  const applyMatch = (listingId: string, r: { matched_parent_sku_id: string | null; matched_code: string | null; matched_name: string | null }) => {
    setListings((ls) => ls.map((x) => x.id === listingId ? { ...x, ...r } : x));
    setOpenListing((o) => o && o.id === listingId ? { ...o, ...r } : o);
  };
  // บันทึกคู่ 1 ตัว (parent = null คือยกเลิกจับคู่) · quiet = ไม่เด้งแจ้ง (โหมดทีละตัวมีแถบความคืบหน้าบอกอยู่แล้ว)
  const saveMatch = async (listingId: string, parent: PickedParent | null, quiet = false): Promise<boolean> => {
    setBusyIds((s) => new Set(s).add(listingId));
    try {
      const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ listing_id: listingId, parent_sku_id: parent?.id ?? null }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      applyMatch(listingId, { matched_parent_sku_id: j.matched_parent_sku_id ?? null, matched_code: j.matched_code ?? null, matched_name: j.matched_name ?? null });
      setExpanded((s) => { const n = new Set(s); n.delete(listingId); return n; });
      if (!quiet) toast.success(parent ? `จับคู่กับ ${j.matched_code ?? parent.code} แล้ว` : "ยกเลิกจับคู่แล้ว");
      return true;
    } catch (e) { toast.error("จับคู่ไม่สำเร็จ: " + (e as Error).message); return false; }
    finally { setBusyIds((s) => { const n = new Set(s); n.delete(listingId); return n; }); }
  };
  const confirmTop = (l: Listing) => {
    const s = suggestions[l.id]?.[0];
    if (s) void saveMatch(l.id, { id: s.parent_sku_id, code: s.code, name: s.name });
  };
  const toggleExpand = (id: string) => setExpanded((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ยืนยันทุกตัวที่ "รหัสตรงกันและไม่กำกวม" ทีเดียว (ส่งเป็นชุดละ 500)
  const confirmHighAll = async () => {
    const rows = highRows;
    if (rows.length === 0) return;
    setBulkBusy(true);
    let updated = 0;
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const items = rows.slice(i, i + 500).map((l) => ({ listing_id: l.id, parent_sku_id: suggestions[l.id][0].parent_sku_id }));
        const r = await apiFetch("/api/platform-catalog/match", { method: "POST", body: JSON.stringify({ items }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        for (const x of (j.results ?? []) as { listing_id: string; matched_parent_sku_id: string | null; matched_code: string | null; matched_name: string | null }[]) applyMatch(x.listing_id, x);
        updated += j.updated ?? 0;
      }
      toast.success(`จับคู่แล้ว ${updated.toLocaleString()} รายการ — แก้ทีหลังได้ทีละตัว (มีประวัติเก็บไว้)`);
      setBulkAsk(false);
    } catch (e) { toast.error(`จับคู่ได้ ${updated} รายการ แล้วสะดุด: ${(e as Error).message}`); }
    finally { setBulkBusy(false); }
  };

  // ---------- นำเข้าไฟล์ ----------
  // ขั้นที่ 1: อ่านไฟล์ (xlsx/csv) เป็น matrix ดิบ → เดาชนิดไฟล์ → เข้าคิว (รับได้หลายไฟล์)
  const importFiles = async (files: File[]) => {
    if (!platformId) { setNote("เลือกร้านก่อน"); return; }
    setImporting(true); setNote(`กำลังอ่านไฟล์... (${files.length})`);
    try {
      const XLSX = await import("xlsx");
      const code = platforms.find((p) => p.id === platformId)?.code ?? "";
      const items: { id: number; fileName: string; matrix: ImportMatrix; profileId: string }[] = [];
      for (const file of files) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as ImportMatrix;
        if (matrix.length === 0) continue;
        const guessed = detectProfile(code, matrix, customProfiles);
        items.push({ id: ++qid.current, fileName: file.name, matrix, profileId: guessed.id });
      }
      if (items.length === 0) { setNote("ไม่พบข้อมูลในไฟล์ที่เลือก"); return; }
      setQueue((q) => [...q, ...items]);
      setNote(null);
    } catch (e) { setNote("อ่านไฟล์ไม่สำเร็จ: " + (e as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  // ขั้นที่ 2: ยืนยันแล้ว → นำเข้าทีละไฟล์ตามลำดับ (ไฟล์ระดับสินค้าก่อนระดับตัวเลือก เพื่อให้ใส่ชื่อ/รหัสก่อน)
  const confirmImportAll = async () => {
    if (queue.length === 0) return;
    const items = [...queue].sort((a, b) => {
      const la = getProfile(a.profileId, customProfiles)?.level === "variation" ? 1 : 0;
      const lb = getProfile(b.profileId, customProfiles)?.level === "variation" ? 1 : 0;
      return la - lb;
    });
    setImporting(true);
    let okFiles = 0, skipped = 0; const errors: string[] = [];
    const sum = { products: 0, created: 0, updated: 0, matched: 0 };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const prof = getProfile(it.profileId, customProfiles);
      if (prof?.kind === "orders") { skipped++; continue; }
      setNote(`กำลังนำเข้า ${i + 1}/${items.length}: ${it.fileName} ...`);
      try {
        const r = await apiFetch("/api/platform-catalog/import", { method: "POST", body: JSON.stringify({ platform_id: platformId, brand_id: brandId || undefined, profile_id: it.profileId, matrix: it.matrix }) });
        const j = await r.json(); if (j.error) throw new Error(j.error);
        okFiles++; sum.products += j.products ?? 0; sum.created += j.created ?? 0; sum.updated += j.updated ?? 0; sum.matched += j.matched ?? 0;
      } catch (e) { errors.push(`${it.fileName}: ${(e as Error).message}`); }
    }
    setQueue([]); setImporting(false);
    let msg = `นำเข้าเสร็จ ${okFiles} ไฟล์ · รวม ${sum.products} สินค้า (เพิ่มใหม่ ${sum.created} · อัปเดต ${sum.updated}) · จับคู่ ERP ได้ ${sum.matched}`;
    if (skipped) msg += ` · ข้ามไฟล์ออเดอร์ ${skipped} (ให้ไปนำเข้าที่หน้ารับออเดอร์)`;
    if (errors.length) msg += ` · ผิดพลาด ${errors.length} ไฟล์: ${errors.join(" | ")}`;
    setNote(msg);
    await load();
  };
  const setQueueProfile = (id: number, profileId: string) => setQueue((q) => q.map((it) => it.id === id ? { ...it, profileId } : it));
  const removeFromQueue = (id: number) => setQueue((q) => q.filter((it) => it.id !== id));

  // ---------- ป๊อปรายละเอียด ----------
  const openRow = (l: Listing) => {
    setOpenListing(l);
    setPushMsg(null);
    setModalSugs(suggestions[l.id] ?? null);
    // ตัวที่จับคู่แล้วไม่มีคู่ที่เดาติดมา → ขอเดาเฉพาะตัวนี้ (ไว้เทียบ/เปลี่ยนคู่)
    if (!suggestions[l.id]) {
      apiFetch(`/api/platform-catalog/suggest?listing_id=${l.id}`).then((r) => r.json())
        .then((j) => setModalSugs(((j.suggestions ?? {}) as Record<string, MatchSuggestion[]>)[l.id] ?? []))
        .catch(() => setModalSugs([]));
    }
  };
  // ลบรายการที่นำเข้าผิด (สำเนาในระบบเรา — ของบนร้านจริงไม่ถูกแตะ)
  const deleteListing = async () => {
    if (!openListing) return;
    const ok = await askConfirm({
      title: "ลบรายการนี้ออกจากระบบ?",
      message: `${openListing.matched_parent_sku_id ? "การจับคู่กับสินค้าในระบบจะหายไปด้วย · " : ""}ของบนร้านจริงไม่ถูกแตะ — ถ้ายังอยู่ในไฟล์ export รอบหน้าจะกลับมาเอง`,
      confirmText: "ยืนยันลบ", variant: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      const r = await apiFetch(`/api/platform-catalog?id=${openListing.id}`, { method: "DELETE" });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      toast.success(`ลบรายการ “${openListing.title || openListing.external_product_id || ""}” แล้ว`);
      setListings((ls) => ls.filter((x) => x.id !== openListing.id));
      setOpenListing(null);
    } catch (e) { toast.error("ลบไม่สำเร็จ: " + (e as Error).message); }
    finally { setDeleting(false); }
  };
  // ส่งราคาขึ้น LINE เฉพาะสินค้านี้ (ทดสอบทีละตัวก่อนยิงทั้งหมด — ปลอดภัยกว่า)
  const pushOnePrice = async () => {
    if (!openListing?.matched_parent_sku_id) return;
    setPushing(true); setPushMsg("กำลังส่งราคาขึ้น LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", body: JSON.stringify({ brand_id: brandId, parent_sku_id: openListing.matched_parent_sku_id }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const first = (j.results ?? [])[0] as { ok?: boolean; error?: string; variants?: number } | undefined;
      setPushMsg(j.okCount > 0
        ? `✅ ส่งราคาขึ้น LINE สำเร็จ (${first?.variants ?? 0} ตัวเลือก) — ไปเช็กราคาใน MyShop ว่าถูกไหม`
        : `❌ ${first?.error ?? "ส่งไม่สำเร็จ"}`);
    } catch (e) { setPushMsg("❌ " + (e as Error).message); }
    finally { setPushing(false); }
  };
  // ส่งรายละเอียด (ชื่อ/รายละเอียด/แบรนด์/หมวด) ขึ้น LINE เฉพาะสินค้านี้
  const pushOneDetails = async () => {
    if (!openListing?.matched_parent_sku_id) return;
    setPushing(true); setPushMsg("กำลังส่งรายละเอียดขึ้น LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/push-details", { method: "POST", body: JSON.stringify({ brand_id: brandId, parent_sku_id: openListing.matched_parent_sku_id }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const first = (j.results ?? [])[0] as { ok?: boolean; error?: string; sent?: string[] } | undefined;
      setPushMsg(j.okCount > 0
        ? `✅ ส่งรายละเอียดขึ้น LINE สำเร็จ (ส่ง: ${(first?.sent ?? []).join(", ") || "-"}) — เช็กใน MyShop`
        : `❌ ${first?.error ?? "ส่งไม่สำเร็จ"}`);
    } catch (e) { setPushMsg("❌ " + (e as Error).message); }
    finally { setPushing(false); }
  };

  const platformCode = platforms.find((p) => p.id === platformId)?.code ?? "";
  const profileOptions = profilesForPlatform(platformCode, customProfiles);
  const activePf = platforms.find((p) => p.id === platformId);
  const activeBrand = brands.find((b) => b.id === brandId);

  // ดึงสินค้าจาก LINE SHOPPING (ต่อ API จริง) → catalog + จับคู่ ERP
  const syncLine = async () => {
    if (!brandId) { setNote("เลือกแบรนด์/ร้านก่อน (คีย์ LINE ผูกกับแบรนด์)"); return; }
    setImporting(true); setNote("กำลังดึงสินค้าจาก LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/sync-products", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      const totalNote = j.api_total > 0 && j.api_total !== j.fetched ? ` (LINE รายงานทั้งหมด ${j.api_total})` : "";
      setNote(`ดึงจาก LINE แล้ว: ${j.fetched} สินค้า${totalNote} · เพิ่มใหม่ ${j.created} · อัปเดต ${j.updated} · จับคู่ ERP อัตโนมัติ ${j.matched}`);
      await load();
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); }
  };

  // นำเข้ารายการหมวดหมู่แพลตฟอร์มจากไฟล์ (ชีต "ตัวเลือกหมวดสินค้า" — คอลัมน์ id/en/th)
  const importCategoryFile = async (file: File) => {
    if (!platformId) { setNote("เลือกร้านก่อน"); return; }
    setImporting(true); setNote("กำลังอ่านไฟล์หมวดหมู่...");
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const cand = wb.SheetNames.find((n) => /หมวด|categ/i.test(n)) ? [wb.SheetNames.find((n) => /หมวด|categ/i.test(n))!] : wb.SheetNames;
      let aoa: unknown[][] = [];
      for (const sn of cand) {
        const a = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: "" });
        const hdr = ((a[0] ?? []) as unknown[]).map((x) => String(x).trim().toLowerCase());
        if (hdr.includes("id") && (hdr.includes("en") || hdr.includes("th"))) { aoa = a; break; }
      }
      if (aoa.length < 2) { setNote("ไม่พบชีตหมวดหมู่ (ต้องมีคอลัมน์ id + en/th)"); return; }
      const hdr = (aoa[0] as unknown[]).map((x) => String(x).trim().toLowerCase());
      const ci = { id: hdr.indexOf("id"), en: hdr.indexOf("en"), th: hdr.indexOf("th") };
      const rows = (aoa.slice(1) as unknown[][])
        .map((r) => ({ id: r[ci.id], en: ci.en >= 0 ? r[ci.en] : "", th: ci.th >= 0 ? r[ci.th] : "" }))
        .filter((r) => String(r.id ?? "").trim());
      const res = await apiFetch("/api/platform-category-options", { method: "POST", body: JSON.stringify({ platform_id: platformId, rows }) });
      const j = await res.json(); if (j.error) throw new Error(j.error);
      setNote(`นำเข้าหมวดหมู่ ${activePf?.name_th ?? ""} แล้ว: ${j.imported} หมวด (ใช้เลือกใน "แก้รายละเอียดต่อแพลตฟอร์ม" ได้)`);
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); if (catFileRef.current) catFileRef.current.value = ""; }
  };

  // ส่งราคาขาย ERP → LINE (สินค้าที่จับคู่แล้ว)
  const pushPricesLine = async () => {
    if (!brandId) { setNote("เลือกแบรนด์/ร้านก่อน"); return; }
    setImporting(true); setNote("กำลังส่งราคาขึ้น LINE...");
    try {
      const r = await apiFetch("/api/line-shopping/push-prices", { method: "POST", body: JSON.stringify({ brand_id: brandId }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
      if (j.note) { setNote(j.note); return; }
      const fails = (j.results ?? []).filter((x: { ok: boolean }) => !x.ok);
      let msg = `ส่งราคาขึ้น LINE: สำเร็จ ${j.okCount}/${j.total} สินค้า`;
      if (fails.length) msg += " · ผิดพลาด: " + fails.map((x: { product: string; error?: string }) => `${x.product} (${x.error})`).join(" | ");
      setNote(msg);
    } catch (e) { setNote("ผิดพลาด: " + (e as Error).message); }
    finally { setImporting(false); }
  };

  const saveMapping = async (platform_field_key: string, source_key: string) => {
    setMappings((m) => { const n = { ...m }; if (source_key) n[platform_field_key] = source_key; else delete n[platform_field_key]; return n; });
    try {
      const r = await apiFetch("/api/platform-field-mappings", { method: "PATCH", body: JSON.stringify({ platform_id: platformId, platform_field_key, source_key }) });
      const j = await r.json(); if (j.error) throw new Error(j.error);
    } catch (e) { setNote("บันทึก mapping ไม่สำเร็จ: " + (e as Error).message); }
  };
  const mappedCount = fields.filter((f) => mappings[f.field_key]).length;

  // ช่อง "จับคู่ในระบบ" ของแต่ละแถว — ปุ่มในช่องนี้ไม่เปิดป๊อป (กดแถวส่วนอื่น = เปิดรายละเอียด)
  const matchCell = (l: Listing) => {
    const st = statusOf(l);
    const busy = busyIds.has(l.id);
    const stop = (e: React.MouseEvent) => e.stopPropagation();
    if (st === "ok") return (
      <span className="inline-flex items-center gap-1.5 max-w-full" onClick={stop}>
        <span className="text-xs font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 truncate" title={l.matched_name ?? ""}>✓ {l.matched_code || "จับคู่แล้ว"}</span>
        {canEdit && <button type="button" onClick={() => toggleExpand(l.id)} className="text-[11px] text-slate-400 hover:text-slate-700 hover:underline shrink-0">เปลี่ยน</button>}
      </span>
    );
    const top = suggestions[l.id]?.[0];
    if (st === "guess" && top) return (
      <span className="inline-flex items-center gap-1.5 max-w-full" onClick={stop}>
        <button type="button" onClick={() => toggleExpand(l.id)} title={`${top.name ?? ""} · ${top.score}% ${top.reason}`}
          className="text-xs font-mono text-sky-700 bg-sky-50 border border-sky-200 rounded px-1.5 py-0.5 truncate hover:bg-sky-100">{top.code} ?</button>
        {canEdit && <button type="button" disabled={busy} onClick={() => confirmTop(l)} className="h-7 px-2.5 text-xs text-white bg-emerald-600 rounded-md hover:bg-emerald-700 disabled:opacity-50 shrink-0">{busy ? "…" : "ยืนยัน"}</button>}
      </span>
    );
    return (
      <span onClick={stop}>
        <button type="button" onClick={() => toggleExpand(l.id)} className="h-7 px-2.5 text-xs text-amber-700 border border-amber-200 bg-amber-50/60 rounded-md hover:bg-amber-50">
          {suggestLoading ? "กำลังเดา…" : "🔍 จับคู่"}
        </button>
      </span>
    );
  };
  const cols: MiniColumn<Listing>[] = [
    {
      key: "title", header: "สินค้าบนร้าน", width: "2.4fr", locked: true, sortValue: (l) => l.title ?? "",
      cell: (l) => (
        <div className="min-w-0">
          <div className="truncate" title={l.title ?? ""}>{l.title || "—"}</div>
          <div className="text-[11px] text-slate-400 font-mono truncate">{l.sku_code || "ไม่มี SKU"} · #{l.external_product_id || "—"}</div>
        </div>
      ),
    },
    { key: "price", header: "ราคา", width: "0.7fr", align: "right", sortValue: (l) => l.price ?? -1, cell: (l) => l.price != null ? <span>{l.price.toLocaleString()}฿</span> : <span className="text-slate-300">—</span> },
    { key: "match", header: "จับคู่ในระบบ", width: "1.6fr", align: "right", sortValue: (l) => ({ guess: 0, none: 1, ok: 2 })[statusOf(l)], cell: matchCell },
  ];
  const fcols: MiniColumn<FieldRow>[] = [
    { key: "key", header: "Field", width: "1.3fr", sortValue: (f) => f.field_key, cell: (f) => <span className="font-mono text-xs">{f.field_key}</span> },
    { key: "label", header: "ป้าย", width: "1.3fr", cell: (f) => f.field_label || "—" },
    { key: "type", header: "ชนิด", width: "0.8fr", cell: (f) => <span className="text-xs text-slate-500">{f.data_type || "text"}</span> },
    { key: "req", header: "บังคับ", width: "4rem", align: "center", cell: (f) => f.is_required ? <span className="text-rose-600">✓</span> : <span className="text-slate-300">—</span> },
    { key: "sample", header: "ตัวอย่าง", width: "1.5fr", cell: (f) => <span className="text-xs text-slate-400 truncate">{f.sample || "—"}</span> },
  ];

  const pct = counts.all ? Math.round((counts.ok / counts.all) * 100) : 0;
  const unmatchedRows = listings.filter((l) => !l.matched_parent_sku_id);
  const where = `${activePf?.name_th ?? "ร้านนี้"}${activeBrand ? ` · ${activeBrand.name}` : ""}`;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-semibold text-slate-900">🛒 สินค้าบนแพลตฟอร์ม</h1>
        <button onClick={() => setShowHelp((v) => !v)} className="shrink-0 h-8 px-3 text-sm text-sky-700 border border-sky-200 bg-sky-50 rounded-lg hover:bg-sky-100">{showHelp ? "ซ่อนวิธีใช้" : "ℹ️ วิธีใช้"}</button>
      </div>
      <p className="text-sm text-slate-500 mb-3">ดูว่าแต่ละร้านมีสินค้าอะไร แล้วจับคู่กับสินค้าในระบบเรา — จับคู่แล้วถึงจะเทียบสต๊อก/ส่งราคาได้ถูกตัว</p>

      {showHelp && (
        <div className="mb-4 border border-sky-200 bg-sky-50/60 rounded-xl p-4 text-sm text-slate-700 space-y-2">
          <p className="font-medium text-slate-800">หน้านี้ใช้ทำอะไร?</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li><b>เลือกร้าน</b> (ปุ่มด้านบน) + แบรนด์ — ระบบจำร้านที่ดูล่าสุดไว้ให้</li>
            <li>ยังไม่มีสินค้า? กด <b>⬆️ นำเข้าสินค้าจากร้าน</b> แล้วเลือกไฟล์ export จาก Seller Center (เลือกหลายไฟล์พร้อมกันได้ ระบบดูให้เองว่าแต่ละไฟล์คืออะไร)</li>
            <li>ดู <b>การ์ดตัวเลข</b> — กดการ์ดเพื่อกรองตาราง: <span className="text-emerald-700">จับคู่แล้ว</span> · <span className="text-sky-700">ระบบเดาให้ (รอยืนยัน)</span> · <span className="text-amber-700">ยังไม่มีคู่</span></li>
            <li>จับคู่: กด <b>ยืนยัน</b> ในแถวถ้าระบบเดาถูก · กด <b>🔍 จับคู่</b> เพื่อดูตัวเลือก/ค้นหาเอง · หรือกด <b>⚡ จับคู่ทีละตัว</b> ไล่ทีละตัวด้วยคีย์ลัด (1-3 เลือก · S ข้าม)</li>
            <li>รหัสตรงกันเยอะ ๆ กด <b>✓ ยืนยันทั้งหมดที่รหัสตรงกัน</b> ได้ทีเดียว (ระบบถามก่อน · แก้ทีหลังได้ · มีประวัติว่าใครจับคู่อะไร)</li>
          </ol>
          <p className="pt-1"><b>แท็บอื่น:</b> “ช่องข้อมูลของร้าน” = คอลัมน์ที่อ่านได้จากไฟล์ · “ตั้งค่าส่งข้อมูล” = บอกว่าจะเอาข้อมูลในระบบเราตัวไหนไปใส่ช่องไหนของร้าน</p>
          <p><b>ปุ่ม ⚙️</b> = จัดการ “ชนิดไฟล์นำเข้า” เพิ่ม/แก้เองได้ถ้าร้านเปลี่ยนคอลัมน์ · ระบบแค่ <b>เดา</b> ให้ — ไม่จับคู่เองโดยไม่มีคนกดยืนยัน</p>
        </div>
      )}

      {bootError && <ErrorState className="mb-3" title="โหลดรายชื่อร้านไม่สำเร็จ" hint={bootError} onRetry={() => window.location.reload()} />}

      {/* เลือกร้าน + แบรนด์ + ปุ่มนำเข้า */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {platforms.map((p) => {
          const on = p.id === platformId;
          const n = platformCounts[p.id];
          return (
            <button key={p.id} type="button" onClick={() => setPlatformId(p.id)} aria-pressed={on}
              className={`h-9 px-3 rounded-full border text-sm inline-flex items-center gap-1.5 ${on ? "bg-violet-50 border-violet-300 text-violet-800" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
              <PlatformIcon code={p.code} iconKey={p.icon_key} size={16} />
              {p.name_th}
              {n != null && <span className={`text-xs tabular-nums ${on ? "text-violet-600" : "text-slate-400"}`}>{n.toLocaleString()}</span>}
            </button>
          );
        })}
        <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 border border-slate-200 rounded-lg px-2 text-sm bg-white">
          <option value="">ทุกแบรนด์/ร้าน</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex-1" />
        <input ref={fileRef} type="file" multiple accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) importFiles(fs); }} />
        <button onClick={() => fileRef.current?.click()} disabled={!canEdit || importing || !platformId} title={!canEdit ? "ไม่มีสิทธิ์นำเข้า" : "อัปไฟล์ export (Excel/CSV) จาก Seller Center — เลือกได้หลายไฟล์"} className="h-9 px-3 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : "⬆️ นำเข้าสินค้าจากร้าน"}</button>
        <button onClick={() => setShowManager(true)} disabled={!canEdit || !platformId} title="จัดการชนิดไฟล์นำเข้า (เพิ่ม/แก้เองได้)" aria-label="จัดการชนิดไฟล์นำเข้า" className="h-9 px-2.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">⚙️</button>
      </div>
      {platformCode === "line_shopping" && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-xs text-slate-500">LINE SHOPPING (ต่อ API):</span>
          <button onClick={syncLine} disabled={!canEdit || importing || !brandId} title={!brandId ? "เลือกแบรนด์/ร้านก่อน" : "ดึงสินค้าจาก LINE SHOPPING ผ่าน API"} className="h-8 px-3 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">{importing ? "กำลังดึง..." : "🟢 ดึงสินค้าจาก LINE"}</button>
          <button onClick={pushPricesLine} disabled={!canEdit || importing || !brandId} title="ส่งราคาขาย (ERP) ขึ้น LINE สำหรับสินค้าที่จับคู่แล้ว" className="h-8 px-3 text-sm text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-50 disabled:opacity-50">⬆️ ส่งราคาขึ้น LINE</button>
          <input ref={catFileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCategoryFile(f); }} />
          <button onClick={() => catFileRef.current?.click()} disabled={!canEdit || importing} title="นำเข้ารายการหมวดหมู่ LINE จากไฟล์ template (ชีตตัวเลือกหมวดสินค้า) — ใช้ครั้งเดียว" className="h-8 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">📂 นำเข้าหมวดหมู่</button>
        </div>
      )}
      {note && <p className="text-xs text-slate-500 mb-3 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">{note}</p>}

      {queue.length > 0 && (
        <div className="mb-3 border border-violet-200 bg-violet-50/60 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">ไฟล์รอนำเข้า ({queue.length}) — ตรวจชนิดไฟล์ก่อนกดนำเข้า</span>
            <div className="flex gap-2">
              <button onClick={() => { setQueue([]); setNote(null); }} disabled={importing} className="h-8 px-3 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-white disabled:opacity-50">ล้างทั้งหมด</button>
              <button onClick={confirmImportAll} disabled={importing} className="h-8 px-4 text-sm text-white bg-violet-600 rounded-lg hover:bg-violet-700 disabled:opacity-50">{importing ? "กำลังนำเข้า..." : `นำเข้าทั้งหมด (${queue.length})`}</button>
            </div>
          </div>
          <div className="space-y-1.5">
            {queue.map((it) => {
              const isOrders = getProfile(it.profileId, customProfiles)?.kind === "orders";
              return (
                <div key={it.id} className="flex flex-wrap items-center gap-2 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm text-slate-700 truncate max-w-[16rem]" title={it.fileName}>📄 {it.fileName}</span>
                  <span className="text-slate-300">→</span>
                  <select value={it.profileId} onChange={(e) => setQueueProfile(it.id, e.target.value)} disabled={importing} className="h-8 border border-violet-200 rounded-md px-2 text-sm bg-white max-w-full">
                    {profileOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  {isOrders && <span className="text-[11px] text-amber-600">ไฟล์ออเดอร์ — จะถูกข้าม</span>}
                  <div className="flex-1" />
                  <button onClick={() => removeFromQueue(it.id)} disabled={importing} className="text-slate-400 hover:text-rose-600 text-sm disabled:opacity-50" title="เอาออกจากคิว">✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 w-fit text-sm mb-3">
        <button onClick={() => setTab("catalog")} className={`px-3 py-1 rounded ${tab === "catalog" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>รายการสินค้า ({listings.length.toLocaleString()})</button>
        <button onClick={() => setTab("fields")} className={`px-3 py-1 rounded ${tab === "fields" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ช่องข้อมูลของ {activePf?.name_th ?? "ร้าน"} ({fields.length})</button>
        <button onClick={() => setTab("mapping")} className={`px-3 py-1 rounded ${tab === "mapping" ? "bg-white text-violet-700 shadow-sm" : "text-slate-500"}`}>ตั้งค่าส่งข้อมูล ({mappedCount}/{fields.length})</button>
      </div>

      {loading ? <LoadingState label={`กำลังโหลดสินค้าของ ${where}...`} />
        : loadError ? <ErrorState hint={loadError} onRetry={load} />
        : tab === "catalog" ? (
          listings.length === 0 ? (
            <EmptyState icon="🛒" title={`ยังไม่มีสินค้าจาก ${where}`}
              hint={platformCode === "line_shopping" ? "กด 🟢 ดึงสินค้าจาก LINE ด้านบน แล้วระบบจะช่วยจับคู่ให้" : "นำเข้าไฟล์ export จาก Seller Center เข้ามาก่อน แล้วระบบจะช่วยจับคู่ให้"}
              action={canEdit && platformCode !== "line_shopping" ? { label: `⬆️ นำเข้าสินค้าจาก ${activePf?.name_th ?? "ร้าน"}`, onClick: () => fileRef.current?.click() } : undefined} />
          ) : (
            <div className="space-y-3">
              <StatFilterCards value={filter} onChange={(k) => setFilter(k as Filter)} cards={[
                { key: "all", label: "ทั้งหมด", value: counts.all },
                { key: "ok", label: "จับคู่แล้ว", value: counts.ok, tone: "success", hint: `${pct}% ของทั้งหมด` },
                { key: "guess", label: "ระบบเดาให้ รอยืนยัน", value: suggestLoading ? null : counts.guess, tone: "info", hint: suggestError ? "เดาคู่ไม่สำเร็จ — กดโหลดใหม่" : highRows.length ? `รหัสตรงกัน ${highRows.length.toLocaleString()}` : undefined },
                { key: "none", label: "ยังไม่มีคู่", value: suggestLoading ? null : counts.none, tone: "warning" },
              ]} />
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
                <span className="text-xs text-slate-500 shrink-0">จับคู่แล้ว {pct}%</span>
              </div>
              <MiniTable
                rows={shownRows} columns={cols} rowKey={(l) => l.id} onRowClick={openRow}
                expandedKeys={expanded}
                renderExpanded={(l) => (
                  <MatchCandidates suggestions={suggestions[l.id]} loading={suggestLoading} currentId={l.matched_parent_sku_id}
                    canEdit={canEdit} busy={busyIds.has(l.id)} onPick={(p) => void saveMatch(l.id, p)}
                    onUnmatch={l.matched_parent_sku_id ? () => void saveMatch(l.id, null) : undefined} />
                )}
                searchText={(l) => `${l.title ?? ""} ${l.sku_code ?? ""} ${l.external_product_id ?? ""} ${l.matched_code ?? ""}`}
                searchPlaceholder="ค้นหาชื่อ / SKU / รหัสบนร้าน / รหัสในระบบ"
                emptyText="ไม่มีสินค้าในกลุ่มนี้"
                actions={canEdit && (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {unmatchedRows.length > 0 && (
                      <button type="button" onClick={() => setWorkbench(true)} className="h-8 px-3 text-sm whitespace-nowrap text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">⚡ จับคู่ทีละตัว ({unmatchedRows.length.toLocaleString()})</button>
                    )}
                    {highRows.length > 0 && (
                      <button type="button" onClick={() => setBulkAsk(true)} disabled={bulkBusy} className="h-8 px-3 text-sm whitespace-nowrap text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">✓ ยืนยันทั้งหมดที่รหัสตรงกัน ({highRows.length.toLocaleString()})</button>
                    )}
                  </div>
                )}
                resizable storageKey="platform-catalog-listings-v2" dense
              />
            </div>
          )
        ) : tab === "fields" ? (
          fields.length === 0
            ? <EmptyState icon="🧾" title={`ยังไม่รู้ช่องข้อมูลของ ${activePf?.name_th ?? "ร้านนี้"}`} hint="อัปไฟล์ export แล้วระบบจะอ่านหัวคอลัมน์เป็นช่องข้อมูลให้อัตโนมัติ" />
            : <MiniTable rows={fields} columns={fcols} rowKey={(f) => f.field_key} searchText={(f) => `${f.field_key} ${f.field_label ?? ""}`} dense />
        ) : (
          fields.length === 0
            ? <EmptyState icon="🔗" title={`ยังไม่รู้ช่องข้อมูลของ ${activePf?.name_th ?? "ร้านนี้"}`} hint="อัปไฟล์ export ก่อน แล้วค่อยตั้งค่าส่งข้อมูล" />
            : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
                <div className="flex items-center gap-3 px-3 py-2 bg-slate-50 text-[11px] text-slate-400 font-medium">
                  <span className="flex-1">ช่องของ {activePf?.name_th}</span>
                  <span className="text-slate-300">←</span>
                  <span className="w-64">เอาข้อมูลในระบบตัวไหนมาใส่</span>
                </div>
                {fields.map((f) => (
                  <div key={f.field_key} className="flex items-center gap-3 px-3 py-2">
                    <span className="flex-1 min-w-0"><span className="font-mono text-xs text-slate-700">{f.field_key}</span>{f.is_required && <span className="ml-1 text-[10px] text-rose-500">*</span>}{f.field_label && f.field_label !== f.field_key && <span className="text-[11px] text-slate-400 ml-1 truncate">({f.field_label})</span>}</span>
                    <span className="text-slate-300">←</span>
                    <select value={mappings[f.field_key] ?? ""} disabled={!canEdit} onChange={(e) => saveMapping(f.field_key, e.target.value)} className="w-64 h-8 border border-slate-200 rounded-md px-2 text-sm bg-white shrink-0">
                      <option value="">— ไม่ใช้ —</option>
                      {["Parent SKU", "SKU (สี)", "อื่นๆ"].map((g) => (
                        <optgroup key={g} label={g}>
                          {PLATFORM_SOURCE_FIELDS.filter((s) => s.group === g).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )
        )}

      {showManager && <PlatformImportProfileManager platformId={platformId} platformCode={platformCode} onClose={() => setShowManager(false)} onChanged={loadCustomProfiles} />}

      {managerParent && <ProductPlatformManager parentSkuId={managerParent} initialPlatformId={platformId} canEdit={canEdit} canPublish={can("products.platforms.publish")} onClose={() => { setManagerParent(null); load(); }} />}

      <MatchWorkbench
        open={workbench} onClose={() => setWorkbench(false)}
        title={`จับคู่ทีละตัว — ${where}`}
        items={unmatchedRows} suggestions={suggestions} suggestLoading={suggestLoading} canEdit={canEdit}
        total={counts.all} matchedBefore={counts.ok}
        onMatch={(listingId, p) => saveMatch(listingId, p, true)}
      />

      <ConfirmDialog
        open={bulkAsk} onClose={() => { if (!bulkBusy) setBulkAsk(false); }} onConfirm={() => void confirmHighAll()} loading={bulkBusy}
        title={`ยืนยันจับคู่ ${highRows.length.toLocaleString()} รายการที่รหัสตรงกัน?`}
        confirmText={`ยืนยัน ${highRows.length.toLocaleString()} รายการ`}
        requireTyped={highRows.length > TYPED_CONFIRM_OVER ? "ยืนยัน" : undefined}
        message={(
          <div className="space-y-2 text-sm">
            <p>ทุกรายการนี้ รหัสบนร้าน (ช่อง SKU หรือรหัสท้ายชื่อสินค้า) ตรงกับรหัสในระบบ ต่างแค่ขีด/ตัวเล็กใหญ่ และไม่มีตัวอื่นที่ตรงพอกัน — ตัวอย่าง:</p>
            <ul className="text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-2 space-y-0.5">
              {highRows.slice(0, 6).map((l) => <li key={l.id} className="truncate">{l.sku_code || (l.title ?? "").slice(0, 32)} → {suggestions[l.id]?.[0]?.code}</li>)}
              {highRows.length > 6 && <li className="text-slate-400">… และอีก {(highRows.length - 6).toLocaleString()} รายการ</li>}
            </ul>
            <p className="text-xs text-slate-500">จับคู่ผิดตัวไหนแก้ทีหลังได้ทีละตัว · มีประวัติเก็บว่าใครจับคู่อะไร</p>
          </div>
        )}
      />

      <ERPModal open={!!openListing} onClose={() => setOpenListing(null)} title="สินค้าบนร้าน" size="md" defaultExpanded={false} storageKey="platform-catalog-listing">
        {openListing && (
          <div className="space-y-4 text-sm">
            <div className="space-y-1.5">
              <div className="text-slate-800 font-medium">{openListing.title || "—"}</div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                <span>ร้าน: <span className="text-slate-700">{where}</span></span>
                <span>รหัสบนร้าน: <span className="font-mono text-slate-700">{openListing.external_product_id || "—"}</span></span>
                <span>SKU: <span className="font-mono text-slate-700">{openListing.sku_code || "—"}</span></span>
                <span>ราคา: <span className="text-slate-700">{openListing.price != null ? `${openListing.price.toLocaleString()}฿` : "—"}</span></span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl p-3 space-y-2">
              <div className="text-xs font-semibold text-slate-600">จับคู่กับสินค้าในระบบ</div>
              {openListing.matched_parent_sku_id
                ? <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-2 py-1">✓ จับคู่อยู่กับ <span className="font-mono">{openListing.matched_code}</span> {openListing.matched_name ? `· ${openListing.matched_name}` : ""}</div>
                : <div className="text-xs text-amber-600">ยังไม่จับคู่ — เลือกจากที่ระบบเดา หรือค้นหาเอง</div>}
              {openListing.matched_parent_sku_id && (
                <button onClick={() => setManagerParent(openListing.matched_parent_sku_id!)} className="w-full h-9 px-3 text-sm text-violet-700 border border-violet-200 rounded-lg hover:bg-violet-50">📝 แก้รายละเอียดต่อแพลตฟอร์ม (ชื่อ/หมวด/รูป/ราคา) →</button>
              )}
              <MatchCandidates suggestions={modalSugs ?? undefined} loading={modalSugs === null} currentId={openListing.matched_parent_sku_id}
                canEdit={canEdit} busy={busyIds.has(openListing.id)} onPick={(p) => void saveMatch(openListing.id, p)}
                onUnmatch={openListing.matched_parent_sku_id ? () => void saveMatch(openListing.id, null) : undefined} />
            </div>

            {/* ส่งราคาขึ้น LINE เฉพาะสินค้านี้ (เฉพาะ LINE + จับคู่แล้ว) */}
            {canEdit && platformCode === "line_shopping" && openListing.matched_parent_sku_id && (
              <div className="border border-emerald-200 bg-emerald-50/40 rounded-xl p-3 space-y-1.5">
                <div className="text-xs font-semibold text-slate-600">ส่งราคาขึ้น LINE</div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={pushOnePrice} disabled={pushing} className="h-9 px-3 text-sm text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50">{pushing ? "กำลังส่ง..." : "⬆️ ส่งราคา"}</button>
                  <button onClick={pushOneDetails} disabled={pushing} className="h-9 px-3 text-sm text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 disabled:opacity-50">📝 ส่งรายละเอียด (ชื่อ/แบรนด์/หมวด)</button>
                </div>
                {pushMsg && <p className="text-xs text-slate-700">{pushMsg}</p>}
                <p className="text-[11px] text-slate-400">ราคาเอาจากราคาขาย (list_price) ใน ERP · ไม่ตั้งส่วนลด · แนะนำทดสอบตัวนี้ก่อนกด “ส่งทั้งหมด”</p>
              </div>
            )}

            {canEdit && (
              <button onClick={() => void deleteListing()} disabled={deleting} className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline disabled:opacity-50">{deleting ? "กำลังลบ…" : "🗑 นำเข้าผิด? ลบรายการนี้"}</button>
            )}
          </div>
        )}
      </ERPModal>
    </div>
  );
}
