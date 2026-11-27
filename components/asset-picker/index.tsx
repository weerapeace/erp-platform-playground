"use client";

/**
 * AssetPicker — ของกลาง "ตัวเลือกรูปจากคลังกลาง" (เสียบในโมดูลไหนก็ได้)
 *
 * 2 แท็บ: เลือกจากคลัง (ค้น/ฟิลเตอร์/เลือกหลายรูป) · อัปโหลดใหม่ (ลากวาง → เด้งเข้าคลัง + เลือกให้เลย)
 * 🎬 kinds={["image","video"]} = ปุ่มสลับ 🖼 รูป | 🎬 วิดีโอ บนสุด (ช่องที่รับได้ทั้ง 2 ชนิด) · typeFilter="video" = คลังวิดีโออย่างเดียว
 *    วิดีโอเห็นภาพเฟรมแรก + ชี้แล้วเล่น (ของกลาง VideoThumb) · อัปวิดีโอ/ไฟล์ใหญ่ผ่านตัวอัปโหลดกลาง (lib/media-upload · ถึง 200 MB)
 * คืนรายการ AssetRow ที่เลือกผ่าน onSelect — โมดูลเจ้าของเอาไปเก็บ + เรียก /api/assets/usages บันทึก "ถูกใช้ที่ไหน"
 * 📦 พิมพ์ค้น = กล่อง "รูปจาก Parent SKU ที่ตรงคำค้น" บนสุด (รูป Parent + SKU ลูก + Description · /api/assets/parent-images)
 *    รูปในแกลเลอรีสินค้าที่ยังไม่อยู่ในคลัง → ลงคลังให้ตอนกด "ใช้รูปที่เลือก" (โมดูลเจ้าของได้ AssetRow id จริงเสมอ)
 * ค้นหารอพิมพ์เสร็จ ~0.3 วิ + ทิ้งผลของคำเก่าที่มาช้า (กันผลค้น "pix" มาทับ "pix22")
 * 📸 แท็บ "SAMPLE Images" (เจ้าของสั่ง 2026-11-15) = อัลบั้มรูปตัวอย่างประจำแบรนด์ หน้าตาเดียวกับหน้า /tasks/samples
 *    (components/sample-images/picker · โหลดแยกชิ้นตอนกดแท็บ) · เลือกข้ามอัลบั้ม/ข้ามแท็บได้ · ตอนกดใช้ → ดึงแถวคลังจริง (/api/assets?ids=)
 *    ซ่อนเมื่อ: ช่องวิดีโอ/เอกสารอย่างเดียว · ล็อกอัลบั้ม · ต้องมีโฟลเดอร์ Drive
 *
 * ⏱ แท็บ "ใช้ล่าสุด" (2026-11-17) = รูปที่ฉันกด "ใช้" ล่าสุด 30 รูป (จำในเครื่อง · lib/recent-picks RECENT_KEYS.assets) · ไม่มีประวัติ = ไม่โชว์แท็บ
 * ✂️ แท็บ "แยกชิ้นจากไฟล์ออกแบบ" (2026-11-27) = โยน .ai/.eps/.pdf/.svg → ตัวแยกชิ้นกลาง (components/vector-splitter) → ชิ้นที่บันทึกถูกติ๊กให้เลย
 *    โยน .ai/.eps ในแท็บอัปโหลด = เปิดตัวแยกชิ้นให้เอง · ช่องรูปเท่านั้น (เงื่อนไขเดียวกับแท็บ SAMPLE)
 * 📁 เลือกอัลบั้มแม่ + ติ๊ก "รวมอัลบั้มย่อย" (ค่าเริ่ม) = โชว์รูปในอัลบั้มย่อยทั้งต้นด้วย (/api/assets?collection_ids=)
 * 🔢 เลือกหลายรูป: ลำดับที่ส่งให้โมดูล = ลำดับที่คลิก · ช่องรูปโชว์เลข 1, 2, 3 …
 *
 * ตัวอย่าง:
 *   <AssetPicker open={open} onClose={...} multiple typeFilter="image"
 *     contextLabel="ใบเสนอสินค้า OS-2026-0012"
 *     onSelect={(assets) => { ...เก็บ asset.id/asset.url... }} />
 */
import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { type AssetType } from "@/lib/assets";
import { withImageWidth } from "@/lib/r2-image";
import { HoverPreview } from "@/components/hover-image";
import { type AssetRow } from "@/app/api/assets/shared";
import { DesignSheetImagesPanel, type PickerDesignSheet } from "./design-sheet-images-panel";
import { VideoThumb } from "@/components/video-thumb";
import { MediaUploadError, SMALL_UPLOAD_BYTES, normalizeMediaFile, uploadMediaAsset } from "@/lib/media-upload";
import { Icon } from "@/components/icon";
import { AlbumSelect } from "@/components/album-picker";
import { useGalleryColumns, GalleryColumnsControl, galleryTemplate } from "@/components/gallery-columns";   // ขนาดรูป − N + / Ctrl+ลูกกลิ้ง (มุมมองการ์ดกลาง)
import {
  PARENT_ATT_PREFIX, PARENT_IMAGE_GROUP_LABEL, isPendingParentImage, type ParentImageGroup, type ParentImageHit,
} from "@/lib/parent-sku-images";
import type { SamplePhoto } from "@/lib/sample-images";
import { RECENT_KEYS, loadRecent, pushRecent } from "@/lib/recent-picks";
import { useUserPref } from "@/lib/use-user-pref";
import { albumDescendantIds } from "@/lib/album-options";
import { VECTOR_ACCEPT } from "@/lib/vector-split";

const RECENT_ASSET_LIMIT = 30;

// 📸 แท็บ SAMPLE Images — โหลดโค้ดเฉพาะตอนกดแท็บ (19 ช่องรูปที่ใช้ตัวเลือกนี้ไม่ต้องแบกโค้ดส่วนนี้)
const SamplePickerPanel = dynamic(() => import("@/components/sample-images/picker"), {
  ssr: false,
  loading: () => <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>,
});

// ✂️ ตัวแยกชิ้นจากไฟล์ออกแบบ (ของกลาง) — โหลดโค้ดเฉพาะตอนเปิด
const VectorSplitterModal = dynamic(() => import("@/components/vector-splitter").then((m) => m.VectorSplitterModal), { ssr: false });

/** รูปจาก SAMPLE Images → แถวชั่วคราวไว้โชว์ว่าเลือกแล้ว (id จริงของคลัง) — ตอนกดใช้ จะดึงแถวคลังตัวจริงมาแทน */
function sampleAsRow(p: SamplePhoto): AssetRow {
  const ext = (p.file_name.split(".").pop() ?? "").toLowerCase() || null;
  return {
    id: p.id, title: p.file_name.replace(/\.[^.]+$/, ""), file_name: p.file_name, r2_key: p.r2_key,
    url: `/api/r2-image?key=${encodeURIComponent(p.r2_key)}`, asset_type: "image", content_type: null, ext, size_bytes: null,
    width: p.width, height: p.height, description: null, collection_id: null, status: "active", trashed_at: null, uploaded_by: null,
    created_at: p.created_at, master_path: null, master_url: null, source: "sample", print_type: null, print_items: [],
    artwork_type: null, artwork_types: [], keywords: null, sizes: [], parent_sku_codes: [], tags: [], usage_count: 0,
  };
}

const TYPE_ICON: Record<AssetType, string> = { image: "🖼️", design: "🎨", document: "📄", video: "🎬", other: "📦" };
const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: "", label: "ทั้งหมด" }, { key: "image", label: "🖼️ รูป" }, { key: "design", label: "🎨 ออกแบบ" },
  { key: "document", label: "📄 เอกสาร" }, { key: "video", label: "🎬 วิดีโอ" },
];

export type AssetPickerProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (assets: AssetRow[]) => void;
  multiple?: boolean;
  typeFilter?: AssetType;          // ล็อกให้เลือกได้เฉพาะชนิดนี้ (เช่น "image" · "video")
  kinds?: AssetType[];             // 🎬 ชนิดที่เลือกได้ (≥ 2 = ปุ่มสลับบนสุด เช่น ["image","video"]) — ตัวแรก = เปิดมาที่หน้านี้
  title?: string;
  contextLabel?: string;           // ข้อความบอกว่าเลือกให้ record ไหน
  defaultSource?: string;          // ที่มาเริ่มต้น เช่น "artwork" (เปิดมาที่คลัง Artwork เลย)
  defaultSearch?: string;          // คำค้นเริ่มต้น (เปิดมากรองรายการที่เกี่ยวข้องเลย)
  requireDriveFolder?: boolean;    // โชว์เฉพาะรูปที่มีโฟลเดอร์ Drive แล้ว (เลือกรูปต้นทางเพื่อผูกโฟลเดอร์)
  /** ส่งมา = มีแท็บ "ใบงานออกแบบ" (รูปของใบงาน · ใบที่ส่งมาขึ้นก่อน · ค้นใบอื่นได้) — รูปไม่ได้อยู่ในคลัง id ขึ้นต้น "ds:" */
  designSheets?: PickerDesignSheet[];
  lockCollectionName?: string;     // ล็อกให้เลือกได้เฉพาะอัลบั้มชื่อนี้ (ซ่อนตัวกรอง+แท็บอัปโหลด) เช่น "งานพิมพ์ DFT UV (Printed)"
  defaultCollectionId?: string;    // เปิดมาที่อัลบั้มนี้ก่อน (ยังเปลี่ยนอัลบั้ม/ล้างตัวกรองได้) เช่น อัลบั้มปกโปรของชุด
};

const KIND_LABEL: Partial<Record<AssetType, string>> = { image: "🖼 รูป", video: "🎬 วิดีโอ", document: "📄 เอกสาร", design: "🎨 ออกแบบ" };

export function AssetPicker({ open, onClose, onSelect, multiple = false, typeFilter, kinds, title, contextLabel, defaultSource, defaultSearch, requireDriveFolder, lockCollectionName, designSheets, defaultCollectionId }: AssetPickerProps) {
  const firstKind = typeFilter ?? kinds?.[0] ?? "";
  const kindTabs = !typeFilter && (kinds?.length ?? 0) > 1 ? kinds! : null;
  const toast = useToast();
  const [tab, setTab] = useState<"library" | "upload" | "sample" | "recent" | "sheet" | "split">("library");
  const [splitter, setSplitter] = useState<{ file: File | null } | null>(null);   // ✂️ ตัวแยกชิ้นที่เปิดอยู่
  const [recentAssets, setRecentAssets] = useState<AssetRow[]>([]);
  useEffect(() => { if (open) setRecentAssets(loadRecent<AssetRow>(RECENT_KEYS.assets)); }, [open]);
  // 📸 SAMPLE Images: ช่องที่รับรูปได้เท่านั้น (ไม่ใช่ช่องวิดีโอ/เอกสารอย่างเดียว · ไม่ล็อกอัลบั้ม · ไม่บังคับโฟลเดอร์ Drive)
  const sampleOk = !lockCollectionName && !requireDriveFolder && (!typeFilter || typeFilter === "image") && (!kinds || kinds.includes("image"));
  const splitOk = sampleOk;   // ✂️ ได้ PNG = รูป → เงื่อนไขเดียวกับ SAMPLE
  const fromSample = useRef<Set<string>>(new Set());   // id ที่เลือกมาจากแท็บ SAMPLE (ตอนกดใช้ ดึงแถวคลังจริงมาแทน)
  const [rows, setRows] = useState<AssetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);              // จำนวนทั้งหมด (จาก API) — ใช้รู้ว่ามีให้โหลดเพิ่มไหม
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 120;
  const [search, setSearch] = useState(defaultSearch ?? "");
  const [query, setQuery] = useState(defaultSearch ?? "");            // คำค้นที่ใช้จริง (รอพิมพ์เสร็จ ~0.3 วิ)
  const reqSeq = useRef(0);                                          // ลำดับคำขอ — ผลของคำขอเก่าที่มาช้าถูกทิ้ง
  const [type, setType] = useState<string>(firstKind);
  const [source, setSource] = useState(defaultSource ?? "");          // ที่มา: ""=อัปเอง · artwork · odoo_product · all · parent (รูปจาก Parent SKU)
  const [parentHits, setParentHits] = useState<ParentImageHit[]>([]);  // 📦 Parent SKU ที่ตรงคำค้น + รูปของมัน
  const [parentLoading, setParentLoading] = useState(false);
  const [parentGroup, setParentGroup] = useState<"" | ParentImageGroup>("");
  const parentSeq = useRef(0);
  const [confirming, setConfirming] = useState(false);
  const [collectionId, setCollectionId] = useState(""); // อัลบั้ม
  const [tagId, setTagId] = useState("");            // แท็ก
  const [withSub, setWithSub] = useState(true);      // 📁 รวมอัลบั้มย่อยของอัลบั้มที่เลือก
  const [collections, setCollections] = useState<{ id: string; name: string; count: number; parent_id?: string | null; group?: string | null }[]>([]);
  const [tags, setTags] = useState<{ id: string; name: string; count: number }[]>([]);
  const [selected, setSelected] = useState<Map<string, AssetRow>>(new Map());
  const [actor, setActor] = useState<string | null>(null);

  useEffect(() => { supabaseBrowser.auth.getUser().then(({ data }) => setActor(data.user?.email ?? null)).catch(() => {}); }, []);
  useEffect(() => { if (open) { setSelected(new Map()); fromSample.current = new Set(); setTab(designSheets?.length ? "sheet" : "library"); setSearch(defaultSearch ?? ""); setQuery(defaultSearch ?? ""); setType(firstKind); setSource(defaultSource ?? ""); setCollectionId(defaultCollectionId ?? ""); setTagId(""); setParentGroup(""); } }, [open, firstKind, defaultSource, defaultSearch, defaultCollectionId]); // eslint-disable-line react-hooks/exhaustive-deps
  // พิมพ์ค้น → รอหยุดพิมพ์ 0.3 วิ ค่อยค้นจริง (ไม่ยิงทุกตัวอักษร)
  useEffect(() => {
    if (search === query) return;
    const t = setTimeout(() => setQuery(search), 300);
    return () => clearTimeout(t);
  }, [search, query]);

  // โหลดรายการอัลบั้ม + แท็ก (ไว้ทำตัวกรอง) — ครั้งเดียวตอนเปิด
  useEffect(() => {
    if (!open) return;
    apiFetch("/api/assets/collections").then((r) => r.json()).then((j) => setCollections(j.data ?? [])).catch(() => {});
    apiFetch("/api/assets/tags").then((r) => r.json()).then((j) => setTags(j.data ?? [])).catch(() => {});
  }, [open]);

  // โหมดล็อกอัลบั้ม: เมื่ออัลบั้มโหลดเสร็จ → หา id จากชื่อแล้วบังคับเลือกอัลบั้มนั้น (ตัวกรอง/แท็บอัปโหลดถูกซ่อนใน UI)
  useEffect(() => {
    if (!open || !lockCollectionName) return;
    const c = collections.find((x) => x.name === lockCollectionName);
    if (c && c.id !== collectionId) setCollectionId(c.id);
  }, [open, lockCollectionName, collections]); // eslint-disable-line react-hooks/exhaustive-deps

  // อัลบั้มย่อยทั้งต้นของอัลบั้มที่เลือก (string = ค่าคงที่ ไม่โหลดซ้ำทุก render)
  const subIds = collectionId ? albumDescendantIds(collections, collectionId) : [];
  const subKey = withSub && !lockCollectionName ? subIds.join(",") : "";
  const buildParams = useCallback((off: number) => {
    const p = new URLSearchParams({ status: "active", limit: String(PAGE), offset: String(off) });
    if (query) p.set("search", query);
    if (type) p.set("type", type);
    if (collectionId && subKey) p.set("collection_ids", `${collectionId},${subKey}`);
    else if (collectionId) p.set("collection_id", collectionId);
    if (tagId) p.set("tag", tagId);
    // ที่มา: เลือกเอง → ใช้ค่านั้น · ไม่เลือก → ค้น/กรองอัลบั้ม/แท็ก = รวมทุกที่มา ไม่งั้นเฉพาะรูปอัปเอง
    const eff = source || ((query || collectionId || tagId) ? "all" : "upload");
    p.set("source", eff);
    if (requireDriveFolder) p.set("has_folder", "1");   // โชว์เฉพาะรูปที่มีโฟลเดอร์ Drive แล้ว
    return p;
  }, [query, type, source, collectionId, subKey, tagId, requireDriveFolder]);
  const load = useCallback(async () => {   // โหลดหน้าแรก (รีเซ็ตตอนเปลี่ยนตัวกรอง/ค้นหา)
    const seq = ++reqSeq.current;
    if (source === "parent") { setRows([]); setTotal(0); setLoading(false); return; }   // ดูเฉพาะรูปจาก Parent SKU
    setLoading(true);
    try {
      const res = await apiFetch(`/api/assets?${buildParams(0).toString()}`);
      const j = await res.json();
      if (seq !== reqSeq.current) return;   // มีคำค้นใหม่กว่าแล้ว — ทิ้งผลเก่า
      setRows(j.data ?? []); setTotal(j.total ?? (j.data?.length ?? 0));
    } catch { /* ignore */ } finally { if (seq === reqSeq.current) setLoading(false); }
  }, [buildParams, source]);
  const loadMore = useCallback(async () => {   // โหลดหน้าถัดไป (ต่อท้าย)
    const seq = reqSeq.current;
    setLoadingMore(true);
    try {
      const res = await apiFetch(`/api/assets?${buildParams(rows.length).toString()}`);
      const j = await res.json();
      if (seq !== reqSeq.current) return;   // เปลี่ยนคำค้น/ตัวกรองระหว่างโหลด — ไม่ต่อท้ายผลเก่า
      setRows((r) => [...r, ...((j.data ?? []) as AssetRow[])]); setTotal(j.total ?? 0);
    } catch { /* ignore */ } finally { setLoadingMore(false); }
  }, [buildParams, rows.length]);

  // 📦 รูปจาก Parent SKU ที่ตรงคำค้น — เฉพาะตอนค้น · ไม่ใช่ป๊อปวิดีโอ/ล็อกอัลบั้ม/ต้องมีโฟลเดอร์ Drive · ที่มาเป็น ทุกที่/อัปเอง/รูปสินค้า/Parent
  const parentEnabled = !lockCollectionName && !requireDriveFolder && type !== "video" && ["", "all", "odoo_product", "parent"].includes(source);
  useEffect(() => {
    const seq = ++parentSeq.current;
    const q = query.trim();
    if (!open || !parentEnabled || !q) { setParentHits([]); setParentLoading(false); return; }
    setParentLoading(true);
    const p = new URLSearchParams({ search: q, limit: source === "parent" ? "10" : "5" });
    if (type) p.set("type", type);
    apiFetch(`/api/assets/parent-images?${p.toString()}`).then((r) => r.json())
      .then((j) => { if (seq === parentSeq.current) setParentHits((j.parents ?? []) as ParentImageHit[]); })
      .catch(() => { if (seq === parentSeq.current) setParentHits([]); })
      .finally(() => { if (seq === parentSeq.current) setParentLoading(false); });
  }, [open, parentEnabled, query, type, source]);
  // โหมดล็อกอัลบั้ม: ข้ามโหลดแรก (collectionId ยังว่าง) จนกว่าจะ resolve ชื่อ→id ได้
  // ไม่งั้นโหลด "ทุกรูป" (collectionId="") จะยิงก่อน แล้ว response มาทับผลที่กรองอัลบั้มแล้ว (race → โชว์ทุกรูป)
  useEffect(() => {
    if (!open) return;
    if (lockCollectionName && !collectionId) { setLoading(true); return; }
    void load();
  }, [open, load, lockCollectionName, collectionId]);

  const pick = (a: AssetRow) => {
    setSelected((m) => {
      const n = new Map(multiple ? m : []);
      if (n.has(a.id)) n.delete(a.id); else n.set(a.id, a);
      return n;
    });
  };
  // 📸 เลือกจากแท็บ SAMPLE Images (รูปเดียว / ทั้งอัลบั้ม)
  const pickSample = (p: SamplePhoto) => { fromSample.current.add(p.id); pick(sampleAsRow(p)); };
  const pickSampleMany = (ps: SamplePhoto[], on: boolean) => {
    if (!multiple) return;
    setSelected((m) => {
      const n = new Map(m);
      for (const p of ps) {
        if (!on) { n.delete(p.id); continue; }
        if (!n.has(p.id)) { fromSample.current.add(p.id); n.set(p.id, sampleAsRow(p)); }
      }
      return n;
    });
  };

  const confirm = async () => {
    const list = Array.from(selected.values());
    if (list.length === 0) { toast.error("ยังไม่ได้เลือกไฟล์"); return; }
    // รูปจากแกลเลอรีสินค้าที่ยังไม่อยู่ในคลัง → ลงคลังก่อน (ได้ id จริง) แล้วค่อยส่งให้โมดูลเจ้าของ
    const pending = list.filter((a) => isPendingParentImage(a.id));
    let final = list;
    if (pending.length) {
      setConfirming(true);
      try {
        const res = await apiFetch("/api/assets/parent-images", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachment_ids: pending.map((a) => a.id.slice(PARENT_ATT_PREFIX.length)) }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || j.error) throw new Error(res.status === 403 ? "คุณยังไม่มีสิทธิ์เพิ่มรูปเข้าคลัง — ให้ผู้ดูแลเปิดสิทธิ์อัปโหลดคลังไฟล์ หรือเลือกรูปที่อยู่ในคลังแล้ว" : j.error || "ใช้รูปนี้ไม่สำเร็จ");
        const map = (j.data ?? {}) as Record<string, AssetRow>;
        final = list.map((a) => (isPendingParentImage(a.id) ? map[a.id.slice(PARENT_ATT_PREFIX.length)] : a)).filter((a): a is AssetRow => !!a);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ใช้รูปนี้ไม่สำเร็จ");
        return;
      } finally { setConfirming(false); }
    }
    // 📸 รูปจาก SAMPLE Images → ดึงแถวคลังตัวจริง (ชื่อ/แท็ก/ขนาดครบ) — รูปเดิมในคลัง ไม่อัปซ้ำ
    const sampleIds = final.filter((a) => fromSample.current.has(a.id)).map((a) => a.id);
    if (sampleIds.length) {
      setConfirming(true);
      try {
        const real = new Map<string, AssetRow>();
        for (let i = 0; i < sampleIds.length; i += 100) {
          const p = new URLSearchParams({ ids: sampleIds.slice(i, i + 100).join(","), source: "all", status: "active", limit: "200" });
          const res = await apiFetch(`/api/assets?${p.toString()}`);
          const j = await res.json().catch(() => ({}));
          if (!res.ok || j.error) throw new Error(j.error || "ดึงรูปจาก SAMPLE Images ไม่สำเร็จ");
          for (const r of (j.data ?? []) as AssetRow[]) real.set(r.id, r);
        }
        const missing = sampleIds.filter((id) => !real.has(id)).length;
        final = final.map((a) => (fromSample.current.has(a.id) ? real.get(a.id) : a)).filter((a): a is AssetRow => !!a);
        if (missing) toast.warning(`${missing} รูปถูกย้ายไปถังขยะแล้ว — ข้ามไป`);
        if (!final.length) return;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "ดึงรูปจาก SAMPLE Images ไม่สำเร็จ");
        return;
      } finally { setConfirming(false); }
    }
    // ⏱ จำไว้ในแท็บ "ใช้ล่าสุด" (ตัวแรกที่เลือก = บนสุด)
    for (const a of [...final].reverse()) pushRecent(RECENT_KEYS.assets, a, RECENT_ASSET_LIMIT);
    onSelect(final);
    onClose();
  };
  // ✂️ แยกชิ้นเสร็จ → ติ๊กชิ้นที่บันทึกให้เลย (ช่องรูปเดียว = ชิ้นแรก) แล้วกลับแท็บคลัง
  const onSplitDone = (saved: AssetRow[]) => {
    setSplitter(null);
    if (!saved.length) return;
    setSelected((m) => {
      const n = new Map(multiple ? m : []);
      for (const a of multiple ? saved : saved.slice(0, 1)) n.set(a.id, a);
      return n;
    });
    if (type && type !== "image") setType(kindTabs?.includes("image") ? "image" : ""); else void load();
    setTab("library");
    toast.success(multiple ? `ติ๊กชิ้นที่แยกไว้ให้แล้ว ${saved.length} รูป` : `เลือก ${saved[0].title} ให้แล้ว (ช่องนี้ใช้ได้รูปเดียว)`);
  };
  // ใช้ล่าสุด — กรองให้ตรงชนิดที่ช่องนี้รับ
  const recentShown = recentAssets.filter((a) => (typeFilter ? a.asset_type === typeFilter : kindTabs ? kindTabs.includes(a.asset_type as AssetType) : true));
  const orderOf = (id: string) => (multiple ? Array.from(selected.keys()).indexOf(id) + 1 : 0);
  const unitType = tab === "sample" ? "image" : type;   // คำในปุ่ม/ตัวนับ: รูป · คลิป · ไฟล์
  // ขนาดช่องรูป (ของกลาง) — จำรายคน · Ctrl+ลูกกลิ้งบนรูป = ย่อ/ขยาย
  const gallery = useGalleryColumns("asset-picker", 6, "0.5rem", { enabled: open });
  const tileGrid = galleryTemplate(gallery.cols, "0.5rem");

  if (!open) return null;

  return (
    <ERPModal open onClose={onClose} title={title ?? (typeFilter === "video" ? "เลือกวิดีโอจากคลัง" : kindTabs ? "เลือกจากคลัง" : "เลือกรูปจากคลัง")} description={contextLabel} size="lg"
      footer={
        <div className="flex items-center justify-between w-full">
          <span className="text-sm text-indigo-600 font-medium">{selected.size > 0 ? `เลือกแล้ว ${selected.size} ${unitType === "video" ? "คลิป" : unitType === "image" ? "รูป" : "ไฟล์"}` : "ยังไม่ได้เลือก"}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="h-9 px-4 text-sm border border-slate-200 rounded-lg hover:bg-slate-50">ยกเลิก</button>
            <button onClick={() => void confirm()} disabled={selected.size === 0 || confirming}
              className="h-9 px-4 text-sm font-medium bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50">{confirming ? "กำลังเตรียมรูป…" : unitType === "video" ? "ใช้วิดีโอที่เลือก" : unitType === "image" ? "ใช้รูปที่เลือก" : "ใช้ไฟล์ที่เลือก"}</button>
          </div>
        </div>
      }>
      {/* tabs */}
      <div className="flex gap-4 border-b border-slate-200 mb-3 overflow-x-auto whitespace-nowrap">
        <button onClick={() => setTab("library")}
          className={`pb-2 text-sm ${tab === "library" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}>📁 เลือกจากคลัง</button>
        {sampleOk && (
          <button onClick={() => setTab("sample")}
            className={`pb-2 text-sm inline-flex items-center gap-1 ${tab === "sample" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}><Icon value="i:camera" /> SAMPLE Images</button>
        )}
        {designSheets && (
          <button onClick={() => setTab("sheet")}
            className={`pb-2 text-sm inline-flex items-center gap-1 ${tab === "sheet" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}><Icon value="i:palette" /> ใบงานออกแบบ</button>
        )}
        {recentShown.length > 0 && !lockCollectionName && (
          <button onClick={() => setTab("recent")}
            className={`pb-2 text-sm ${tab === "recent" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}>⏱ ใช้ล่าสุด</button>
        )}
        {splitOk && (
          <button onClick={() => setTab("split")}
            className={`pb-2 text-sm inline-flex items-center gap-1 whitespace-nowrap ${tab === "split" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}><Icon name="scissors" /> แยกชิ้นจากไฟล์ออกแบบ</button>
        )}
        {!lockCollectionName && (
          <button onClick={() => setTab("upload")}
            className={`pb-2 text-sm ${tab === "upload" ? "border-b-2 border-indigo-500 text-indigo-700 font-medium" : "text-slate-500"}`}>⬆ อัปโหลดใหม่</button>
        )}
        {(tab === "library" || tab === "recent") && (
          <GalleryColumnsControl as="stepper" cols={gallery.cols} onChange={gallery.setCols} options={gallery.options} className="ml-auto mb-1.5 self-end" />
        )}
      </div>

      <div ref={gallery.wheelRef} {...gallery.compactAttr}>
      {tab === "library" ? (
        <>
          {kindTabs && (
            <div className="mb-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="tablist" aria-label="ชนิดไฟล์">
              {kindTabs.map((k) => (
                <button key={k} role="tab" aria-selected={type === k} onClick={() => { setType(k); setSelected(new Map()); }}
                  className={`h-8 px-4 text-sm rounded-md ${type === k ? "bg-white shadow-sm text-indigo-700 font-medium" : "text-slate-500 hover:text-slate-700"}`}>
                  {KIND_LABEL[k] ?? k}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { if (search !== query) setQuery(search); else void load(); } }}
              placeholder="ค้นหา ชื่อไฟล์ / รหัส Parent SKU…"
              className="flex-1 min-w-[140px] h-8 px-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
            {!typeFilter && !kindTabs && TYPE_FILTERS.map((f) => (
              <button key={f.key} onClick={() => setType(f.key)}
                className={`h-8 px-2.5 text-[12px] rounded-lg border ${type === f.key ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-600"}`}>{f.label}</button>
            ))}
          </div>
          {/* ตัวกรอง: ที่มา (หมวด) · อัลบั้ม · แท็ก — ซ่อนเมื่อล็อกอัลบั้ม (โชว์ป้ายอัลบั้มแทน) */}
          {lockCollectionName ? (
            <div className="mb-3">
              <span className="inline-flex items-center gap-1.5 h-8 px-2.5 text-[12px] rounded-lg border border-teal-200 bg-teal-50 text-teal-700">📚 อัลบั้ม: {lockCollectionName}</span>
            </div>
          ) : (
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <select value={source} onChange={(e) => setSource(e.target.value)} title="ที่มา"
              className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">📤 รูปอัปเอง</option>
              <option value="artwork">🎨 Artwork</option>
              <option value="odoo_product">🛍️ รูปสินค้า</option>
              <option value="parent">📦 รูปจาก Parent SKU</option>
              <option value="all">ทุกที่มา</option>
            </select>
            <AlbumSelect albums={collections} value={collectionId} onChange={setCollectionId} compact showCount noneLabel="ทุกอัลบั้ม" className="w-48 max-w-full" />
            {subIds.length > 0 && (
              <label className="inline-flex items-center gap-1 h-8 px-2 text-[12px] rounded-lg border border-slate-200 bg-white text-slate-600 cursor-pointer" title="โชว์รูปในอัลบั้มย่อยของอัลบั้มนี้ด้วย">
                <input type="checkbox" checked={withSub} onChange={(e) => setWithSub(e.target.checked)} /> รวมอัลบั้มย่อย ({subIds.length})
              </label>
            )}
            <select value={tagId} onChange={(e) => setTagId(e.target.value)} title="แท็ก"
              className="h-8 px-2 text-[12px] border border-slate-200 rounded-lg bg-white text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="">🏷 ทุกแท็ก</option>
              {tags.map((tg) => <option key={tg.id} value={tg.id}>{tg.name} ({tg.count})</option>)}
            </select>
            {(source || collectionId || tagId) && (
              <button onClick={() => { setSource(""); setCollectionId(""); setTagId(""); }}
                className="h-8 px-2.5 text-[12px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">ล้างตัวกรอง</button>
            )}
          </div>
          )}
          {parentEnabled && (
            <ParentImagesSection hits={parentHits} loading={parentLoading} query={query.trim()} only={source === "parent"}
              group={parentGroup} onGroup={setParentGroup} selected={selected} onPick={pick} grid={tileGrid} />
          )}
          {source === "parent" ? null : loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">กำลังโหลด…</div>
          ) : rows.length === 0 && parentEnabled && parentHits.length > 0 ? (
            <div className="py-4 text-center text-slate-400 text-[12px]">ไม่มีไฟล์ในคลังที่ชื่อตรงคำค้น — เลือกจากรูปของ Parent SKU ด้านบนได้เลย</div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">{type === "video" ? "ยังไม่มีวิดีโอในคลัง — กดแท็บ ⬆ อัปโหลดใหม่ (MP4 / WebM ถึง 200 MB)" : "ไม่พบไฟล์ — ลองเปลี่ยนคำค้น หรืออัปโหลดใหม่"}</div>
          ) : (
            <>
            {parentEnabled && parentHits.length > 0 && <p className="mb-1.5 text-[12px] text-slate-500">รูปในคลัง (ชื่อไฟล์ / แท็ก ตรงคำค้น) · {total}</p>}
            <div className="grid gap-2 max-h-[360px] overflow-auto pr-1" style={{ gridTemplateColumns: tileGrid }}>
              {rows.map((a) => <AssetTile key={a.id} a={a} on={selected.has(a.id)} order={orderOf(a.id)} onPick={pick} />)}
              {rows.length < total && (
                <div style={{ gridColumn: "1 / -1" }} className="flex justify-center py-2">
                  <button onClick={() => void loadMore()} disabled={loadingMore}
                    className="h-9 px-4 text-sm font-medium text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50 disabled:opacity-50">
                    {loadingMore ? "กำลังโหลด…" : `▾ โหลดเพิ่ม (${rows.length}/${total})`}
                  </button>
                </div>
              )}
            </div>
            </>
          )}
        </>
      ) : tab === "recent" ? (
        <div className="grid gap-2 max-h-[420px] overflow-auto pr-1" style={{ gridTemplateColumns: tileGrid }}>
          {recentShown.map((a) => <AssetTile key={a.id} a={a} on={selected.has(a.id)} order={orderOf(a.id)} onPick={pick} />)}
        </div>
      ) : tab === "sheet" && designSheets ? (
        <DesignSheetImagesPanel sheets={designSheets} grid={tileGrid}
          renderTile={(a) => <AssetTile a={a} on={selected.has(a.id)} order={orderOf(a.id)} onPick={pick} />} />
      ) : tab === "split" ? (
        <SplitTab onFile={(file) => setSplitter({ file })} />
      ) : tab === "sample" ? (
        <SamplePickerPanel multiple={multiple} isSelected={(id) => selected.has(id)} onToggle={pickSample} onPickMany={pickSampleMany} />
      ) : (
        <UploadTab onVectorFile={splitOk ? (file) => setSplitter({ file }) : undefined} actor={actor} typeFilter={typeFilter} kinds={kinds} albums={collections} viewingAlbumId={collectionId}
          onCreateAlbum={async (name) => {
            try {
              const j = await apiFetch("/api/assets/collections", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json());
              if (j.error || !j.data?.id) throw new Error(j.error || "สร้างอัลบั้มไม่สำเร็จ");
              setCollections((cs) => [...cs, { id: String(j.data.id), name: String(j.data.name ?? name), count: 0 }]);
              return String(j.data.id);
            } catch (e) { toast.error((e as Error).message); return null; }
          }}
          onUploaded={(assets) => {
            setSelected((m) => {
              const n = new Map(multiple ? m : []);
              for (const a of assets) { if (!multiple) n.clear(); n.set(a.id, a); if (!multiple) break; }
              return n;
            });
            // อัปวิดีโอ (ป๊อปที่มีปุ่มสลับ รูป | วิดีโอ) → ไปหน้าวิดีโอ ให้เห็นคลิปที่เพิ่งอัปและถูกเลือกอยู่ (เปลี่ยนชนิด = โหลดใหม่เอง)
            const kind = assets[0]?.asset_type;
            if (kindTabs && kind && kindTabs.includes(kind) && kind !== type) setType(kind);
            else void load();
            setTab("library");
            toast.success(`อัปแล้ว ${assets.length} ไฟล์ — เลือกให้อัตโนมัติ`);
          }} />
      )}
      </div>
      {splitter && (
        <VectorSplitterModal initialFile={splitter.file} actor={actor} defaultCollectionId={collectionId || null}
          collections={collections.map((c) => ({ ...c, description: null }))}
          onClose={() => setSplitter(null)} onDone={onSplitDone} />
      )}
    </ERPModal>
  );
}

/** ✂️ แท็บแยกชิ้น: ลากไฟล์ออกแบบมาวาง / คลิกเลือก → เปิดตัวแยกชิ้นกลาง */
function SplitTab({ onFile }: { onFile: (f: File) => void }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center ${over ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}>
      <div className="mb-2 flex justify-center text-3xl text-slate-500"><Icon name="scissors" /></div>
      <p className="text-sm font-medium text-slate-700">ลากไฟล์ .ai · .eps · .pdf · .svg มาวาง หรือ คลิกเลือก</p>
      <p className="text-[12px] text-slate-400 mt-1">ระบบหาชิ้นให้อัตโนมัติ · ติ๊ก/ลากกรอบ/รวม/แยก · แปลงเป็น PNG พื้นใสเข้าคลัง → ชิ้นที่แปลงถูกเลือกให้เลย</p>
      <input ref={inputRef} type="file" accept={VECTOR_ACCEPT} className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onFile(f); }} />
    </div>
  );
}

/** ช่องรูป 1 ใบในตารางเลือก (ใช้ทั้งรูปในคลัง + รูปจาก Parent SKU) · badge = ป้ายบอกว่าเป็นรูปของใคร เช่น PIX22-01 */
function AssetTile({ a, on, onPick, badge, order = 0 }: { a: AssetRow; on: boolean; onPick: (a: AssetRow) => void; badge?: string; order?: number }) {
  return (
    <button onClick={() => onPick(a)}
      className={`relative rounded-lg border overflow-hidden text-left ${on ? "border-indigo-500 ring-2 ring-indigo-300" : "border-slate-200 hover:border-slate-300"}`}>
      {on && <span className="absolute top-1 right-1 z-10 min-w-4 h-4 px-0.5 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center tabular-nums" title={order > 0 ? `ลำดับที่ ${order}` : undefined}>{order > 0 ? order : "✓"}</span>}
      {/* ชี้เมาส์ที่รูป = เด้งรูปใหญ่ลอยข้าง ๆ (ของกลาง HoverPreview) — คลิกยังเป็นการ "เลือกรูป" เหมือนเดิม
          📱 ทัช (มือถือ/แท็บเล็ต) ไม่เด้ง เพราะของกลางกันไว้ด้วย useCanHover */}
      {a.asset_type === "image" ? (
        <HoverPreview url={a.url} previewW={420}>
          <div className="aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={withImageWidth(a.url, 240) ?? a.url} alt={a.title} loading="lazy" className="w-full h-full object-cover" />
          </div>
        </HoverPreview>
      ) : a.asset_type === "video" ? (
        <VideoThumb url={a.url} className="h-20" />
      ) : (
        <div className="h-20 bg-slate-100 flex items-center justify-center overflow-hidden">
          <span className="text-2xl">{TYPE_ICON[a.asset_type]}</span>
        </div>
      )}
      {badge && <span className="block mx-1.5 mt-1 w-fit max-w-[calc(100%-12px)] truncate rounded bg-indigo-50 px-1 text-[9px] font-medium text-indigo-700">{badge}</span>}
      <p className="text-[10px] px-1.5 pt-1 truncate">{a.title}</p>
      {/* ขนาดที่ตั้งไว้ (artwork sizes) — เห็นก่อนเลือกว่ารูปนี้มีขนาดอะไรบ้าง */}
      {(a.sizes?.length ?? 0) > 0 ? (
        <p className="text-[9px] px-1.5 pb-1 text-indigo-500 truncate">
          📐 {a.sizes.slice(0, 2).map((s) => s.label?.trim() || (s.w != null || s.h != null ? `${s.w ?? "?"}×${s.h ?? "?"}${s.unit}` : "")).filter(Boolean).join(" · ")}{a.sizes.length > 2 ? ` +${a.sizes.length - 2}` : ""}
        </p>
      ) : <span className="block pb-1" />}
    </button>
  );
}

const PARENT_GROUPS: ParentImageGroup[] = ["parent", "sku", "description"];

/** 📦 กล่อง "รูปจาก Parent SKU ที่ตรงคำค้น" — แยกตาม Parent · ปุ่มกรองย่อย รูป Parent / SKU ลูก / Description */
function ParentImagesSection({ hits, loading, query, only, group, onGroup, selected, onPick, grid }: {
  /** grid-template-columns จากขนาดรูปที่ผู้ใช้เลือก (ของกลาง gallery-columns) */
  grid: string;
  hits: ParentImageHit[]; loading: boolean; query: string; only: boolean;
  group: "" | ParentImageGroup; onGroup: (g: "" | ParentImageGroup) => void;
  selected: Map<string, AssetRow>; onPick: (a: AssetRow) => void;
}) {
  const note = (text: string) => <div className={`text-center text-slate-400 text-sm ${only ? "py-12" : "pb-3 text-[12px]"}`}>{text}</div>;
  if (!query) return only ? note("พิมพ์รหัสหรือชื่อ Parent SKU (เช่น PIX22) เพื่อดูรูปทั้งชุด — รูป Parent + SKU ลูก + Description") : null;
  if (hits.length === 0) {
    if (loading) return note("กำลังหารูปจาก Parent SKU…");
    return only ? note("ไม่พบ Parent SKU ที่ตรงคำค้น หรือ Parent นั้นยังไม่มีรูป") : null;
  }
  const counts = new Map<ParentImageGroup, number>();
  for (const h of hits) for (const it of h.items) counts.set(it.group, (counts.get(it.group) ?? 0) + 1);
  const total = hits.reduce((n, h) => n + h.items.length, 0);
  const chip = (key: "" | ParentImageGroup, label: string) => (
    <button key={key || "all"} onClick={() => onGroup(key)}
      className={`h-6 px-2 text-[11px] rounded-md border ${group === key ? "bg-white border-indigo-400 text-indigo-700 font-medium" : "bg-white/60 border-slate-200 text-slate-600 hover:border-slate-300"}`}>{label}</button>
  );
  return (
    <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50/40 p-2.5">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-700 mr-1"><Icon name="package" /> รูปจาก Parent SKU ที่ตรงคำค้น</span>
        {counts.size > 1 && chip("", `ทั้งหมด ${total}`)}
        {counts.size > 1 && PARENT_GROUPS.filter((g) => counts.get(g)).map((g) => chip(g, `${PARENT_IMAGE_GROUP_LABEL[g]} ${counts.get(g)}`))}
        {loading && <span className="text-[11px] text-slate-400">กำลังโหลด…</span>}
      </div>
      <div className={`space-y-2.5 overflow-auto pr-1 ${only ? "max-h-[420px]" : "max-h-[250px]"}`}>
        {hits.map((h) => {
          const items = group ? h.items.filter((it) => it.group === group) : h.items;
          if (items.length === 0) return null;
          return (
            <div key={h.id}>
              <p className="mb-1 flex items-baseline gap-1.5 text-[11px] text-slate-500">
                <span className="font-mono font-medium text-slate-700">{h.code}</span>
                <span className="truncate min-w-0">{h.name}</span>
                <span className="shrink-0">· {h.items.length} รูป</span>
                {!h.is_active && <span className="shrink-0 rounded bg-slate-200 px-1 text-[10px] text-slate-600">ปิดใช้งาน</span>}
              </p>
              <div className="grid gap-2" style={{ gridTemplateColumns: grid }}>
                {items.map((it) => (
                  <AssetTile key={it.asset.id} a={it.asset} on={selected.has(it.asset.id)} onPick={onPick}
                    badge={it.group === "sku" ? it.owner : it.group === "description" ? "Description" : "Parent"} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UploadTab({ actor, typeFilter, kinds, onUploaded, albums, viewingAlbumId, onCreateAlbum, onVectorFile }: {
  /** ✂️ ส่งมา = โยน .ai/.eps แล้วเปิดตัวแยกชิ้นแทนการอัปทั้งไฟล์ */
  onVectorFile?: (f: File) => void;
  actor: string | null; typeFilter?: AssetType; kinds?: AssetType[]; onUploaded: (assets: AssetRow[]) => void;
  /** อัปเข้าอัลบั้ม (เจ้าของเลือก 2026-11-27): รายการอัลบั้ม · อัลบั้มที่เปิดดูในแท็บคลัง (ค่าเริ่ม) · สร้างอัลบั้มใหม่ */
  albums: { id: string; name: string; count: number; parent_id?: string | null; group?: string | null }[];
  viewingAlbumId: string;
  onCreateAlbum: (name: string) => Promise<string | null>;
}) {
  const toast = useToast();
  // ค่าเริ่ม = อัลบั้มที่เปิดดูอยู่ในแท็บ "เลือกจากคลัง" · ไม่ได้เปิด = อัลบั้มที่อัปครั้งล่าสุด (จำรายคน) · "" = ไม่ใส่อัลบั้ม
  const [lastAlbum, setLastAlbum] = useUserPref<string>("asset_upload_album", "", (r) => (typeof r === "string" ? r : null));
  const [albumPick, setAlbumPick] = useState<string | null>(null);
  const albumId = albumPick ?? (viewingAlbumId || lastAlbum);
  const albumName = albums.find((a) => a.id === albumId)?.name ?? "";
  const [recentAlbums, setRecentAlbums] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { setRecentAlbums(loadRecent<{ id: string; name: string }>(RECENT_KEYS.uploadAlbums).filter((r) => albums.some((a) => a.id === r.id)).slice(0, 3)); }, [albums]);
  const chooseAlbum = (id: string) => { setAlbumPick(id); setLastAlbum(id); };
  const [busy, setBusy] = useState(false);
  /** ไฟล์ใหญ่/วิดีโอ: แถบ % ของไฟล์ที่กำลังส่ง */
  const [pct, setPct] = useState<{ name: string; pct: number | null } | null>(null);
  const allowed: AssetType[] | null = typeFilter ? [typeFilter] : kinds ?? null;
  const baseAccept = allowed ? allowed.map((k) => (k === "image" ? "image/*" : k === "video" ? "video/mp4,video/webm,video/quicktime,.mp4,.m4v,.webm,.mov" : "")).filter(Boolean).join(",") || undefined : undefined;
  const accept = baseAccept && onVectorFile ? `${baseAccept},.ai,.eps` : baseAccept;
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const imgDims = (file: File): Promise<{ w: number; h: number } | null> =>
    new Promise((res) => {
      if (!file.type.startsWith("image/")) return res(null);
      const img = new Image(); const url = URL.createObjectURL(file);
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
      img.onerror = () => { res(null); URL.revokeObjectURL(url); };
      img.src = url;
    });

  const handle = async (input: FileList | File[]) => {
    let files = Array.from(input);
    // ✂️ .ai / .eps = ไฟล์ออกแบบหลายชิ้น → เปิดตัวแยกชิ้น (ทีละไฟล์) · ไฟล์อื่นอัปตามปกติ
    if (onVectorFile) {
      const vec = files.filter((f) => /\.(ai|eps)$/i.test(f.name));
      if (vec.length) {
        files = files.filter((f) => !vec.includes(f));
        if (vec.length > 1) toast.info(`เปิดตัวแยกชิ้นกับ ${vec[0].name} ก่อน — ไฟล์ออกแบบอื่นโยนต่อได้ทีหลัง`);
        onVectorFile(vec[0]);
        if (!files.length) return;
      }
    }
    setBusy(true);
    const done: AssetRow[] = [];
    for (const picked of files) {
      // ชนิดจริงจากหัวไฟล์ (บางเครื่องส่ง MP4 มาไม่บอกชนิด)
      const file = await normalizeMediaFile(picked);
      const isVideo = file.type.startsWith("video/");
      if (allowed && !allowed.some((k) => (k === "image" ? file.type.startsWith("image/") : k === "video" ? isVideo : true))) {
        toast.error(`${file.name} — ช่องนี้รับเฉพาะ${allowed.map((k) => KIND_LABEL[k] ?? k).join(" / ")} · ข้าม`);
        continue;
      }
      // 🎬 วิดีโอ / ไฟล์ใหญ่กว่า 4 MB → ตัวอัปโหลดกลาง (ส่งตรงเข้าที่เก็บไฟล์ · ลงคลังเอง · กันไฟล์ซ้ำ)
      if (isVideo || file.size > SMALL_UPLOAD_BYTES) {
        try {
          setPct({ name: file.name, pct: null });
          const r = await uploadMediaAsset(file, {
            folder: isVideo ? "storefront-videos" : "storefront-images",
            onProgress: (p) => setPct({ name: file.name, pct: p }),
            onNotice: (m) => toast.info(m),
          });
          if (r.asset) done.push(r.asset);
          else toast.warning(`${file.name} อัปแล้ว แต่ยังไม่ขึ้นในคลัง — ลองกดรีเฟรชคลัง`);
        } catch (e) {
          toast.error(e instanceof MediaUploadError || e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
        } finally {
          setPct(null);
        }
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", file);
        if (actor) fd.append("actor", actor);
        if (albumId) fd.append("collection_id", albumId);
        const d = await imgDims(file);
        if (d) { fd.append("width", String(d.w)); fd.append("height", String(d.h)); }
        const res = await apiFetch("/api/assets", { method: "POST", body: fd });
        const j = await res.json();
        if (!res.ok || j.error) throw new Error(j.error || "อัปโหลดไม่สำเร็จ");
        if (j.data) done.push(j.data as AssetRow);
      } catch (e) { toast.error(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ"); }
    }
    setBusy(false);
    if (done.length && albumId && albumName) setRecentAlbums(pushRecent(RECENT_KEYS.uploadAlbums, { id: albumId, name: albumName }).slice(0, 3));
    if (done.length) onUploaded(done);
  };

  return (
    <div className="space-y-2">
    {/* อัปเข้าอัลบั้ม (ตัวเลือกอัลบั้มกลาง · สร้างใหม่ได้ตามสิทธิ์) + อัลบั้มที่ใช้ล่าสุด */}
    <div className="flex flex-wrap items-center gap-2 text-[13px]">
      <span className="font-medium text-slate-700">อัปเข้าอัลบั้ม</span>
      <AlbumSelect albums={albums} value={albumId} onChange={chooseAlbum} noneLabel="ไม่ใส่อัลบั้ม (คลังกลางเฉย ๆ)" compact showCount className="w-72 max-w-full" onCreate={onCreateAlbum} />
      {recentAlbums.filter((r) => r.id !== albumId).length > 0 && (
        <span className="flex flex-wrap items-center gap-1 text-[12px]">
          <span className="text-slate-400">ใช้ล่าสุด:</span>
          {recentAlbums.filter((r) => r.id !== albumId).map((r) => (
            <button key={r.id} type="button" onClick={() => chooseAlbum(r.id)} className="h-6 max-w-[12rem] truncate rounded-full border border-slate-200 bg-white px-2 text-slate-600 hover:border-indigo-300">{r.name}</button>
          ))}
        </span>
      )}
    </div>
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) void handle(e.dataTransfer.files); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center ${dragOver ? "border-indigo-400 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}
    >
      <div className="text-4xl mb-2">{busy ? "⏳" : "⬆️"}</div>
      <p className="text-sm font-medium text-slate-700">{busy ? (pct ? (pct.pct === 100 ? `ส่ง ${pct.name} ครบแล้ว · กำลังบันทึกเข้าคลัง…` : `กำลังอัปโหลด ${pct.name}${pct.pct != null ? ` · ${pct.pct}%` : "…"}`) : "กำลังอัปโหลด…") : "ลากไฟล์มาวาง หรือ คลิกเลือก"}</p>
      {pct?.pct != null && (
        <div className="mx-auto mt-2 h-1.5 w-56 overflow-hidden rounded-full bg-indigo-100">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${pct.pct}%` }} />
        </div>
      )}
      <p className="text-[12px] text-slate-400 mt-1">{albumName ? `อัปแล้วจะเข้าอัลบั้ม "${albumName}" + ถูกเลือกให้อัตโนมัติ (ไฟล์เกิน 4 MB / วิดีโอ เข้าคลังกลางเท่านั้น)` : "อัปแล้วจะเข้าคลังกลาง + ถูกเลือกให้อัตโนมัติ"}{!allowed || allowed.includes("video") ? " · วิดีโอ MP4 / WebM ถึง 200 MB" : ""}</p>
      <input ref={inputRef} type="file" multiple={true} accept={accept}
        className="hidden" onChange={(e) => e.target.files && handle(e.target.files)} />
    </div>
    </div>
  );
}
