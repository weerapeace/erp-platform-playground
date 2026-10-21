"use client";
// Drawer แก้คอนเทนต์ (ของกลางในโมดูล — เปิดจากหน้าคอนเทนต์ / ปฏิทิน / งาน / แคมเปญ) · แยกจาก content.tsx — Y1
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mutateSWR } from "@/lib/swr-lite";
import { renderCaption, type ShopChannel } from "@/lib/caption-template";
import { ERPModal, ConfirmDialog, DrawerShell } from "@/components/modal";
import { ERPInput, ERPDateTime24 } from "@/components/form";
import { SkuPicker, ParentSkuPicker } from "@/components/pickers";
import type { SkuPickerValue, ParentSkuPickerValue, UserPickerValue } from "@/components/pickers";
import { ImageLightbox } from "@/components/image-lightbox";
import { r2ImageUrl } from "@/lib/r2-image";
import { getContent, createContent, updateContent, deleteContent, getTask, listSubtasks, getCaptionTemplates, getParentSkuChildren, type ParentSkuChild, getRecommendedTimes, type RecommendedTimes, listContentAttachments, addContentAttachment, deleteContentAttachment, getPlatformSettings, savePlatformSettings, getLinkPreview, PLATFORM_SETTINGS_SWR_KEY, getMetaStatus, publishToPlatform, igFinalize, type MetaConnStatus, type PostMediaRef, getCaptionConfig, defaultHashtags, resolvePrompt, resolveBrandFromProduct, type ContentItem, type ContentDetail, type ContentCaption, type ContentStatus, type BrandOption, type CaptionTemplate, type CaptionConfig, type ContentAttachment, type PlatformSettings } from "../data";
import { useCreativeOptions, platformLabel, platformMeta } from "../use-options";
import { PlatformChip } from "../platform-chip";
import { PostConfirmModal, type PostImage } from "./post-confirm-modal";
import { AddPathForm, isLocalPath, type PathItem } from "@/components/copy-path-button";
import { buildCaptionVars, captionsForDetail } from "./caption-assemble";
import { CopyButton } from "@/components/copy-button";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/components/auth";
import { useMediaQuery } from "@/lib/use-media-query";
import { useDrawerResize } from "@/lib/use-drawer-resize";
import { pushDrawerHistory, type DrawerHistoryHandle } from "@/lib/drawer-history";
import { useDragReorder, moveItem } from "@/components/sortable-list";
import { getBrandPlatforms } from "./brand-platforms-modal";
import { ExtraProductsEditor, extrasFromDetail, extraToPayload, childToSkuValue, skuValueToChild, toggleChildSelection, type ExtraProduct } from "./content-products-editor";
import { useDrawerTheme, DrawerThemeButton, drawerZoom, isHidden, densityCls, densityPad, densityGap, drawerBgStyle, orderedKeys, accentCss, btnBg, isCollapsed, toggleCollapsedList } from "../drawer-theme";
import dynamic from "next/dynamic";
import { useT } from "@/components/i18n";
import { type ToastVariant } from "@/components/toast";
import { subStatusDot, subStatusLabel } from "../subtask-status";
import { BrandSelect } from "@/components/brand-select";
import { RowMenu, CSection } from "./content-ui";
import { HashtagLibraryModal, RecommendedTimesModal, PlatformSettingsModal, CaptionTemplateSettings, CaptionConfigModal } from "./content-settings-modals";
import { CaptionToolbar, CaptionCard, AiCaptionModal, PullCaptionModal } from "./caption-card";
import { ContentAttachments } from "./content-attachments";


// drawer สินค้ากลาง (ของกลาง) — เปิดดู Parent SKU จากในคอนเทนต์ · dynamic กัน import วน
export const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });

// ============================================================
// Content detail drawer — caption หลายแพลตฟอร์ม + คลัง hashtag + ลิงก์
// ============================================================
// หมายเหตุ: export ไว้เพราะ tasks/campaigns ฝังใช้ (.next/types route-export warning 1 จุด — ไม่กระทบ build)
export function ContentDrawer({ contentId, brands, onClose, onChanged, onDelete, onDeleted, pushToast }: {
  contentId: string; brands: BrandOption[];
  onClose: () => void; onChanged: () => void; onDelete?: (c: ContentItem) => void;
  onDeleted?: (contentId: string) => void;   // ลบสำเร็จแล้ว → ให้ผู้เรียกจัดการต่อ (เช่น เอาการ์ดออกจากกระดาน)
  pushToast: (type: ToastVariant, m: string) => void;
}) {
  const t = useT();
  const { platforms } = useCreativeOptions();
  const [d, setD] = useState<ContentDetail | null>(null);
  const [titleEdit, setTitleEdit] = useState<string | null>(null);   // ดับเบิลคลิกหัว drawer = แก้ชื่อ (null = ไม่ได้แก้อยู่)
  const { can } = useAuth();
  const canAiCaption = can("ai.caption");   // สิทธิ์กดปุ่มให้ AI เขียนแคปชั่น (มีค่าใช้จ่าย)
  const [caps, setCaps] = useState<ContentCaption[]>([]);
  const [touchedCaps, setTouchedCaps] = useState<Set<string>>(new Set());   // ช่องที่ผู้ใช้ "แก้เอง" (platform|caption / platform|hashtags)
  const [pullTo, setPullTo] = useState<string | null>(null);                // ป๊อป "ดึงแคปชั่นจากแพลตฟอร์มอื่น" — แพลตฟอร์มปลายทาง
  const [applyFrom, setApplyFrom] = useState<string | null>(null);          // ป๊อป "ใช้ทั้งหมด" — แพลตฟอร์มต้นทาง
  const [links, setLinks] = useState<{ platform: string; url: string }[]>([]);
  const [status, setStatus] = useState<ContentStatus>("draft");
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishedUrl, setPublishedUrl] = useState("");
  // สถานะ/ลิงก์การโพสต์ต่อแพลตฟอร์ม (บันทึกทันทีที่กด — ไม่ต้องรอปุ่มบันทึก)
  const [postStatus, setPostStatus] = useState<Record<string, string>>({});   // platform → 'posted' | 'skip' (ไม่มี = ยังไม่โพสต์)
  const [postedLinks, setPostedLinks] = useState<Record<string, string>>({});   // platform → ลิงก์โพสต์ที่ลงแล้ว
  const [platformFormats, setPlatformFormats] = useState<Record<string, string>>({});   // platform → รูปแบบโพสต์ (โพสต์เดี่ยว/อัลบั้ม/Reels/Story)
  const [platformImages, setPlatformImages] = useState<Record<string, string[]>>({});   // platform → รูป(r2 key)ที่เลือกไว้ต่อแพลตฟอร์ม (โชว์บนการ์ดย่อย + default ตอนโพสต์)
  const [metaStatus, setMetaStatus] = useState<MetaConnStatus>({});   // เชื่อมต่อ Facebook/IG ของแบรนด์นี้แล้วหรือยัง (กด "โพสต์เลย" ยิงจริงได้ไหม)
  const [posting, setPosting] = useState<string | null>(null);   // แพลตฟอร์มที่กำลังยิงโพสต์จริง
  const [postModal, setPostModal] = useState<{ platform: string; captionText: string } | null>(null);   // ป๊อปอัปยืนยันก่อนโพสต์
  const [assignees, setAssignees] = useState<UserPickerValue[]>([]);   // ผู้รับผิดชอบคอนเทนต์ (หลายคน m2m)
  const [saving, setSaving] = useState(false);
  // ปุ่มย้อนกลับ (เบราว์เซอร์/ปัดบนแท็บเล็ต) = ปิด "ชั้นบนสุด" ทีละชั้น — ใช้สแต็กกลาง lib/drawer-history ร่วมกับ MasterRecordDrawer
  // (เดิมใช้ useBackClose ที่ฟัง popstate แยกต่างหาก → เปิด drawer สินค้าซ้อนแล้วปิด = คอนเทนต์ปิดตามไปด้วย)
  const onCloseRef = useRef(onClose); onCloseRef.current = onClose;
  const histRef = useRef<DrawerHistoryHandle | null>(null);
  useEffect(() => { const h = pushDrawerHistory(() => onCloseRef.current()); histRef.current = h; return () => h.dispose(); }, []);
  const requestClose = useCallback(() => { if (histRef.current) histRef.current.requestClose(); else onCloseRef.current(); }, []);
  // แถวติ๊กแพลตฟอร์ม (ทุกตัวในระบบ) — ติ๊ก = ลงที่นี่ (มีการ์ดแคปชั่น) · บันทึกทันทีที่กด
  const [bpMap, setBpMap] = useState<Record<string, string[]>>({});   // แพลตฟอร์มประจำของแต่ละแบรนด์ (เรียงขึ้นก่อน + ปุ่มติ๊กตามแบรนด์)
  useEffect(() => { getBrandPlatforms().then((r) => setBpMap(r.map)).catch(() => {}); }, []);
  const [platRemoveAsk, setPlatRemoveAsk] = useState<string | null>(null);   // ถามก่อนเอาแพลตฟอร์มที่มีแคปชั่นแล้วออก
  const [platBusy, setPlatBusy] = useState(false);
  // ลบไฟล์ที่อัปเองจากคลังรูป (ยืนยันก่อน)
  const [delAtt, setDelAtt] = useState<{ id: string; label: string } | null>(null);
  // แม่แบบ + ส่วนลด
  const [templates, setTemplates] = useState<CaptionTemplate[]>([]);
  const [shopChannels, setShopChannels] = useState<ShopChannel[]>([]);
  const [discountValue, setDiscountValue] = useState<string>("");
  const [discountPct, setDiscountPct] = useState(false);
  const [tplSettingsOpen, setTplSettingsOpen] = useState(false);
  // แพลตฟอร์มที่กางอยู่ (แบบพับเก็บ) — เริ่มต้นกางตัวแรกที่ยังไม่ได้โพสต์
  const [aiAllBusy, setAiAllBusy] = useState(false);   // กำลังให้ AI เขียนทุกแพลตฟอร์ม
  const [aiModal, setAiModal] = useState<{ platforms: string[] } | null>(null);
  // ปุ่มบนหัวคอลัมน์แคปชั่นที่ "โชว์" (สูงสุด 3) — จำรายคนที่ user_ui_prefs
  const [pinnedTools, setPinnedTools] = useState<string[]>(["ai", "expand", "copy_prompt"]);
  useEffect(() => {
    apiFetch("/api/user-prefs?key=content_caption_toolbar").then((r) => r.json()).then((j) => {
      const v = (j?.value as { pinned?: unknown } | undefined)?.pinned;
      if (Array.isArray(v) && v.length) setPinnedTools(v.filter((x): x is string => typeof x === "string").slice(0, 3));
    }).catch(() => { /* ไม่ขึ้นก็ใช้ค่าเริ่มต้น */ });
  }, []);
  const savePinnedTools = (keys: string[]) => {
    setPinnedTools(keys);
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "content_caption_toolbar", value: { pinned: keys } }) }).catch(() => { /* ไม่เป็นไร */ });
  };   // ป๊อป AI (ทั้งหมด / ช่องเดียว)
  const [openPlats, setOpenPlats] = useState<Set<string>>(new Set());
  const [openInit, setOpenInit] = useState(false);
  useEffect(() => {
    if (openInit || caps.length === 0) return;
    const first = caps.find((c) => !["posted", "skip", "scheduled"].includes(postStatus[c.platform] ?? "todo")) ?? caps[0];
    setOpenPlats(new Set(first ? [first.platform] : []));
    setOpenInit(true);
  }, [caps, postStatus, openInit]);
  const togglePlat = (k: string) => setOpenPlats((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const [psOpen, setPsOpen] = useState(false);   // โมดอลตั้งค่าแพลตฟอร์ม
  const [capCfg, setCapCfg] = useState<CaptionConfig>({});   // พรอมต์ + แฮชแท็กเริ่มต้น
  const [cfgOpen, setCfgOpen] = useState(false);   // โมดอลตั้งค่าพรอมต์/แฮชแท็ก
  const [hashOpen, setHashOpen] = useState(false);   // โมดอลจัดการคลังแฮชแท็ก
  // แบรนด์ของคอนเทนต์ — ดึงจากสินค้าอัตโนมัติ (เมื่อยังว่าง) แต่แก้เองได้
  const [brandId, setBrandId] = useState<string | null>(null);
  const [brandTouched, setBrandTouched] = useState(false);   // ผู้ใช้เลือกแบรนด์เอง → ไม่ให้ auto-fill ทับ
  // สินค้า: SKU เดี่ยว + Parent SKU + สีที่มี
  const [sku, setSku] = useState<SkuPickerValue | null>(null);
  const [parent, setParent] = useState<ParentSkuPickerValue | null>(null);
  const [children, setChildren] = useState<ParentSkuChild[]>([]);   // ลูก SKU ของ Parent (สี 2 ภาษา + ราคา)
  const [skuIds, setSkuIds] = useState<string[]>([]);   // เลือกหลายสี (ว่าง = ทุกสี · sku เดี่ยว = สีเดียว) — เก็บที่ erp_creative_content_products.sku_ids ของตัวหลัก
  const [extras, setExtras] = useState<ExtraProduct[]>([]);   // สินค้าเพิ่มเติมในโพสต์ (นอกจากตัวหลัก sku/parent) — erp_creative_content_products
  const [colorSource, setColorSource] = useState<"th" | "en">("th");   // {color} ใช้ไทย/อังกฤษ (จำต่อคอนเทนต์)
  const [priceSkuId, setPriceSkuId] = useState<string>("");   // เลือกราคาจาก SKU ลูกตัวไหน (Parent)
  const [recTimes, setRecTimes] = useState<RecommendedTimes>({});   // เวลาแนะนำการโพสต์ต่อวัน (จันทร์-อาทิตย์)
  const [recOpen, setRecOpen] = useState(false);   // โมดอลตั้งเวลาแนะนำ
  const [pullBusy, setPullBusy] = useState(false);
  const [openParentId, setOpenParentId] = useState<string | null>(null);   // เปิด drawer Parent SKU
  // แนบงาน (รูป/วิดีโอ/ลิงก์) + ตั้งค่าแพลตฟอร์มกลาง
  const [attachments, setAttachments] = useState<ContentAttachment[]>([]);
  const [pset, setPset] = useState<PlatformSettings>({});
  // รูป/ลิงก์ที่ "ส่งมาแล้ว" จากงานย่อยที่อนุมัติแล้ว (ของงานที่ผูกไว้) — ไว้หยิบไปโพสต์
  const [taskMedia, setTaskMedia] = useState<{ images: { key: string; label: string | null; status: string }[]; links: { label: string | null; url: string | null }[] }>({ images: [], links: [] });
  const [tmLb, setTmLb] = useState(-1);   // ดูรูปเต็มจอ (คลังรูปรวม)
  const [prodEdit, setProdEdit] = useState(false);   // การ์ดสินค้า: โหมดแก้ (ปกติโชว์สรุปสั้น ๆ)
  const [mediaAdd, setMediaAdd] = useState(false);   // การ์ดรูป: กางตัวเพิ่ม/จัดการไฟล์
  // แบ่ง 2 ฝั่ง ปรับขนาดได้ (ลากเส้นกลาง) — จำสัดส่วนใน localStorage
  // ลากขอบซ้ายปรับความกว้าง drawer (ของกลาง · จำค่าต่อเครื่อง · ดับเบิลคลิกหูจับ = กลับค่าเริ่มต้น)
  const { width: drawerW, startResize, resetWidth } = useDrawerResize("contentDrawerWidth", 1180, 640);
  const wideScreen = useMediaQuery("(min-width: 1024px)");
  const isWide = wideScreen && drawerW >= 900;   // จอกว้าง + drawer กว้างพอ → 2 ฝั่ง · แคบ (มือถือ/ลากให้แคบ) → เรียงบน-ล่าง
  const { theme: dth, update: dthUpdate } = useDrawerTheme("content");   // ธีม drawer คอนเทนต์ (ต่อคน)
  // แบบ A (2026-10): ฝั่งซ้ายเหลือการ์ด 3 ใบ — สินค้า (รวมแบรนด์/สี/ราคา) · รูป/วิดีโอ (รวมรูปจากงาน+อัปเอง) · ลิงก์สินค้า
  const CONTENT_SECTIONS = [
    { key: "product", label: t("สินค้า", "Product") }, { key: "media", label: t("รูป / วิดีโอ", "Media") }, { key: "links", label: t("ลิงก์สินค้า", "Links") },
  ];
  const cSecOrder = orderedKeys(dth, CONTENT_SECTIONS.map((s) => s.key));
  const cOrderOf = (k: string) => cSecOrder.indexOf(k);   // ลำดับส่วน (CSS order) ตามที่ผู้ใช้จัด
  const cLabelOf = (k: string) => CONTENT_SECTIONS.find((s) => s.key === k)?.label ?? k;
  const coll = (k: string) => isCollapsed(dth, k);
  const toggleColl = (k: string) => dthUpdate({ collapsed: toggleCollapsedList(dth, k) });
  const tmBadge = (s: string) => ({ label: subStatusLabel(s), cls: subStatusDot(s) });   // ป้ายสถานะงานย่อยบนรูป — ของกลาง
  const bodyRef = useRef<HTMLDivElement>(null);
  const leftPctRef = useRef(38);
  const [leftPct, setLeftPctState] = useState(38);
  const setLeftPct = useCallback((v: number) => { leftPctRef.current = v; setLeftPctState(v); }, []);
  const draggingRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const detail = await getContent(contentId);
      setD(detail); setStatus(detail.status); setScheduledAt(detail.scheduled_at ? detail.scheduled_at.slice(0, 16) : ""); setPublishedUrl(detail.published_url ?? "");
      setPostStatus(detail.post_status ?? {}); setPostedLinks(detail.posted_links ?? {}); setPlatformImages(detail.platform_images ?? {}); setPlatformFormats(detail.platform_formats ?? {});
      setAssignees((detail.assignees && detail.assignees.length ? detail.assignees : (detail.assignee_id ? [{ id: detail.assignee_id, name: detail.assignee_label ?? "" }] : [])).map((a) => ({ id: a.id, name: a.name } as UserPickerValue)));
      // ลิงก์สินค้า: ของคอนเทนต์เอง · ยังไม่มี → เติมจากที่เก็บไว้ที่ Parent SKU (บันทึกครั้งหน้าจะเขียนกลับ Parent ด้วย)
      setLinks(Array.isArray(detail.product_links) && detail.product_links.length ? detail.product_links : (detail.parent_links ?? []));
      setDiscountValue(detail.discount_value != null ? String(detail.discount_value) : "");
      setDiscountPct(!!detail.discount_is_percent);
      setSku(detail.sku_id ? { id: detail.sku_id, code: detail.sku_code ?? "", name: detail.sku_name ?? detail.product_name ?? "", color: detail.sku_color, list_price: detail.sku_price, fake_price: detail.sku_fake_price ?? null } : null);
      setParent(detail.parent_sku_id ? { id: detail.parent_sku_id, code: detail.parent_sku_code ?? "", name: detail.parent_sku_name ?? "" } : null);
      setExtras(extrasFromDetail(detail.products));
      { const prim = (detail.products ?? []).find((p) => p.is_primary); setSkuIds(detail.sku_id ? [] : (prim?.sku_ids ?? [])); }
      setBrandId(detail.brand_id ?? null); setBrandTouched(false);
      setColorSource(detail.color_source === "en" ? "en" : "th");
      // เตรียม caption ให้ครบทุกแพลตฟอร์มของคอนเทนต์ — แพลตฟอร์มที่ยังไม่มีแคปชั่น เติมแฮชแท็กเริ่มต้นให้
      const cfg = await getCaptionConfig().catch(() => ({} as CaptionConfig));
      setCapCfg(cfg);
      setCaps(captionsForDetail(detail, cfg));
    } catch (e) { pushToast("error", (e as Error).message); }
  }, [contentId, pushToast]);
  useEffect(() => { load(); }, [load]);

  // โหลดไฟล์แนบ + ตั้งค่าแพลตฟอร์มกลาง
  const loadAttachments = useCallback(async () => { try { setAttachments(await listContentAttachments(contentId)); } catch { /* ว่าง */ } }, [contentId]);
  useEffect(() => { loadAttachments(); }, [loadAttachments]);
  const loadPset = useCallback(async () => { try { setPset(await getPlatformSettings()); } catch { /* ว่าง */ } }, []);
  useEffect(() => { loadPset(); }, [loadPset]);
  // เชื่อมต่อ Meta ของแบรนด์นี้ (รู้ว่าปุ่ม "โพสต์เลย" ยิง Facebook จริงได้ไหม)
  useEffect(() => { const b = brandId; if (!b) { setMetaStatus({}); return; } let live = true; getMetaStatus(b).then((s) => { if (live) setMetaStatus(s); }); return () => { live = false; }; }, [brandId]);

  // ดึงรูป/ลิงก์จากงานย่อยของงานที่ผูกไว้ — โชว์ทั้งที่ยังไม่อนุมัติ (มีป้ายสถานะกำกับ), ตัดซ้ำ
  const loadTaskMedia = useCallback(async () => {
    if (!d?.task_id) { setTaskMedia({ images: [], links: [] }); return; }
    try {
      const subs = await listSubtasks(d.task_id);
      const seen = new Set<string>();
      const images: { key: string; label: string | null; status: string }[] = [];
      const links: { label: string | null; url: string | null }[] = [];
      // เรียงให้ "อนุมัติแล้ว" ขึ้นก่อน แล้วค่อยที่เหลือ
      const ordered = [...subs].sort((a, b) => (a.status === "approved" ? 0 : 1) - (b.status === "approved" ? 0 : 1));
      for (const s of ordered) {
        for (const a of (s.attachments ?? [])) {
          if (a.kind === "image" && a.r2_key) { if (!seen.has(a.r2_key)) { seen.add(a.r2_key); images.push({ key: a.r2_key, label: s.title, status: s.status }); } }
          else if (a.kind !== "image" && a.url) {
            const lb = (a.label ?? "").trim();
            links.push({ label: lb && !["path", "video", "link"].includes(lb) && !isLocalPath(lb) ? `${s.title} · ${lb}` : lb === "video" ? `${s.title} · 🎬` : s.title, url: a.url });
          }
        }
        for (const arr of Object.values(s.image_sync_targets?.sku_images ?? {})) for (const k of (arr as string[])) { if (k && !seen.has(k)) { seen.add(k); images.push({ key: k, label: s.title, status: s.status }); } }
      }
      setTaskMedia({ images, links });
    } catch { /* ว่าง */ }
  }, [d?.task_id]);
  useEffect(() => { loadTaskMedia(); }, [loadTaskMedia]);

  // ก๊อปลิงก์รูป (URL เต็ม) ไปใช้ลงโพสต์
  const copyImageUrl = async (key: string) => {
    const rel = r2ImageUrl(key); if (!rel) return;
    const abs = typeof window !== "undefined" ? window.location.origin + rel : rel;
    try { await navigator.clipboard.writeText(abs); pushToast("success", t("ก๊อปลิงก์รูปแล้ว", "Image link copied")); }
    catch { pushToast("error", t("ก๊อปไม่สำเร็จ", "Copy failed")); }
  };

  // ปรับสัดส่วน 2 ฝั่งด้วยการลากเส้นแบ่ง
  useEffect(() => {
    try { const s = Number(localStorage.getItem("content_drawer_left_pct")); if (s >= 28 && s <= 60) setLeftPct(s); } catch { /* ไม่มีค่าเก็บไว้ */ }
    const move = (e: MouseEvent) => {
      if (!draggingRef.current || !bodyRef.current) return;
      const rect = bodyRef.current.getBoundingClientRect();
      const pct = Math.max(28, Math.min(60, ((e.clientX - rect.left) / rect.width) * 100));
      setLeftPct(pct);
    };
    const up = () => { if (!draggingRef.current) return; draggingRef.current = false; document.body.style.userSelect = ""; try { localStorage.setItem("content_drawer_left_pct", String(Math.round(leftPctRef.current))); } catch { /* noop */ } };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [setLeftPct]);
  const startDrag = (e: React.MouseEvent) => { draggingRef.current = true; document.body.style.userSelect = "none"; e.preventDefault(); };

  // โหลดแม่แบบ + ช่องทางร้านของแบรนด์คอนเทนต์
  const loadTemplates = useCallback(async () => {
    try { const r = await getCaptionTemplates(brandId); setTemplates(r.templates); setShopChannels(r.shop_channels); } catch { /* ใช้ค่าว่าง */ }
  }, [brandId]);
  useEffect(() => { if (d) loadTemplates(); }, [d, loadTemplates]);

  const setCap = (platform: string, patch: Partial<ContentCaption>) => setCaps((cs) => cs.map((c) => c.platform === platform ? { ...c, ...patch } : c));
  // สถานะโพสต์ต่อแพลตฟอร์ม — เปลี่ยนแล้วบันทึกทันที (partial PATCH ไม่แตะแคปชั่น/ฟิลด์อื่น)
  const setPlatStatus = (platform: string, s: string) => {
    const next = { ...postStatus }; if (s === "todo") delete next[platform]; else next[platform] = s;
    setPostStatus(next);
    void updateContent(contentId, { post_status: next }).catch((e) => pushToast("error", (e as Error).message));
  };
  const setPlatPostedUrl = (platform: string, url: string) =>
    setPostedLinks((prev) => { const n = { ...prev }; if (url.trim()) n[platform] = url; else delete n[platform]; return n; });
  const persistPostedLinks = () => void updateContent(contentId, { posted_links: postedLinks }).catch((e) => pushToast("error", (e as Error).message));
  // เลือก/ยกเลิกรูปต่อแพลตฟอร์ม — เปลี่ยนแล้วบันทึกทันที (ไม่แตะแคปชั่น) · รูปที่เลือกไปโชว์บนการ์ดย่อย + เป็น default ตอนโพสต์
  const togglePlatformImage = (platform: string, key: string) => {
    setPlatformImages((prev) => {
      const cur = prev[platform] ?? [];
      const arr = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      const next = { ...prev }; if (arr.length) next[platform] = arr; else delete next[platform];
      void updateContent(contentId, { platform_images: next }).catch((e) => pushToast("error", (e as Error).message));
      return next;
    });
  };
  // ตั้งรูปที่เลือกให้เป็น "รูปใหญ่" (ย้ายไปหน้าสุด · [0]=รูปใหญ่บนการ์ดย่อย) — บันทึกทันที
  const setPlatformMainImage = (platform: string, key: string) => {
    setPlatformImages((prev) => {
      const cur = prev[platform] ?? []; if (!cur.includes(key) || cur[0] === key) return prev;
      const next = { ...prev, [platform]: [key, ...cur.filter((k) => k !== key)] };
      void updateContent(contentId, { platform_images: next }).catch((e) => pushToast("error", (e as Error).message));
      return next;
    });
  };
  // media ที่เลือกลงโพสต์ได้ (รูป/วิดีโอแนบ + รูปจากงาน · ตัดซ้ำ) + ชนิดต่อ key
  const postImages: PostImage[] = (() => {
    const seen = new Set<string>(); const out: PostImage[] = [];
    for (const a of attachments) if ((a.kind === "image" || a.kind === "video") && a.r2_key && !seen.has(a.r2_key)) { seen.add(a.r2_key); out.push({ key: a.r2_key, label: a.label ?? a.file_name ?? null, type: a.kind === "video" ? "video" : "image" }); }
    // วิดีโอที่อยู่บน Google Drive (ไม่มีไฟล์ในระบบ) — คีย์เป็น drive:<fileId>
    for (const a of attachments) if (a.kind === "video" && !a.r2_key && (a.url ?? "").startsWith("drive:") && !seen.has(a.url as string)) { seen.add(a.url as string); out.push({ key: a.url as string, label: a.label ?? a.file_name ?? null, type: "video" }); }
    for (const im of taskMedia.images) if (im.key && !seen.has(im.key)) { seen.add(im.key); out.push({ key: im.key, label: im.label ?? null, type: "image" }); }
    return out;
  })();
  // ลำดับรูปในคลัง (ลากสลับ) — เก็บใน platform_images ภายใต้คีย์พิเศษ "_order" (ไม่ใช่รหัสแพลตฟอร์ม ตัวอ่านรายแพลตฟอร์มไม่เห็น) → ไม่ต้องเพิ่มคอลัมน์
  const mediaOrder = (platformImages._order as string[] | undefined) ?? [];
  if (mediaOrder.length) postImages.sort((a, b) => { const ia = mediaOrder.indexOf(a.key), ib = mediaOrder.indexOf(b.key); return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib); });
  const reorderMedia = (from: number, to: number) => {
    const keys = moveItem(postImages.map((m) => m.key), from, to);
    setPlatformImages((prev) => { const next = { ...prev, _order: keys }; void updateContent(contentId, { platform_images: next }).catch((e) => pushToast("error", (e as Error).message)); return next; });
  };
  const mediaDrag = useDragReorder(reorderMedia);
  const platformImageEntries = Object.entries(platformImages).filter(([k]) => k !== "_order");   // ใช้นับว่ารูปถูกเลือกกี่แพลตฟอร์ม
  const mediaTypeOf = (k: string): "image" | "video" => postImages.find((m) => m.key === k)?.type ?? "image";
  const contentImageKeys = attachments.filter((a) => a.kind === "image" && a.r2_key).map((a) => a.r2_key as string);

  // ยิงโพสต์จริง (Facebook/Instagram) จากป๊อปยืนยัน · รูป/วิดีโอ/อัลบั้ม + ตั้งเวลา(FB) · IG Reels = ตามเช็กสถานะ
  const runPublish = async (platform: string, captionText: string, selectedKeys: string[], scheduledUnix: number | null, fmtOverride?: string) => {
    const label = platform === "facebook" ? "Facebook" : "Instagram";
    // เลือกวิดีโอ → โพสต์เป็นวิดีโอ (ตัวแรก) · ไม่งั้น = รูปทั้งหมด
    const videoKey = selectedKeys.find((k) => mediaTypeOf(k) === "video");
    const media: PostMediaRef[] = videoKey ? [{ key: videoKey, type: "video" }] : selectedKeys.map((k) => ({ key: k, type: "image" as const }));
    setPosting(platform);
    try {
      const res = await publishToPlatform(contentId, platform, captionText, media, scheduledUnix ?? undefined, fmtOverride ?? platformFormats[platform]);
      setPostModal(null);
      if (res.processing && res.creationId) {
        // IG Reels: ตามเช็กสถานะจนพร้อม (สูงสุด ~2.5 นาที)
        const cid = res.creationId;
        pushToast("info", t("Instagram กำลังประมวลผลวิดีโอ… รอสักครู่", "Instagram is processing the video…"));
        let done = false;
        for (let i = 0; i < 30 && !done; i++) {
          await new Promise((r) => setTimeout(r, 5000));
          const f = await igFinalize(contentId, cid);
          if (f.url) { setPostStatus((p) => ({ ...p, [platform]: "posted" })); setPostedLinks((p) => ({ ...p, [platform]: f.url as string })); pushToast("success", t("โพสต์ Reels ขึ้น Instagram แล้ว 🎉", "Reel posted to Instagram 🎉")); done = true; }
        }
        if (!done) pushToast("info", t("วิดีโอยังประมวลผลอยู่ — IG จะโพสต์ให้เมื่อพร้อม (เช็กที่ IG ภายหลัง)", "Still processing — IG will post it once ready"));
      } else {
        setPostStatus((prev) => ({ ...prev, [platform]: res.scheduled ? "scheduled" : "posted" }));
        setPostedLinks((prev) => ({ ...prev, [platform]: res.url }));
        pushToast("success", res.scheduled ? t(`ตั้งเวลาโพสต์บน ${label} แล้ว ⏰`, `Scheduled on ${label} ⏰`) : t(`โพสต์ขึ้น ${label} แล้ว 🎉`, `Posted to ${label} 🎉`));
      }
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setPosting(null); }
  };
  // โหมดมือ (ยังไม่เชื่อม): คัดลอกแคปชั่น + เปิดหน้าโพสต์ให้
  // X (Twitter): ใช้ web intent เติมข้อความให้เลย (ฟรี ไม่ใช้ API) → พี่แค่แนบรูป+โพสต์
  const manualPost = (platform: string, captionText: string) => {
    navigator.clipboard.writeText(captionText).catch(() => {});
    if (platform === "x") {
      window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(captionText)}`, "_blank", "noopener,noreferrer");
      pushToast("success", t("เปิด X พร้อมเติมข้อความแล้ว — แนบรูปแล้วโพสต์ได้เลย", "Opened X with text prefilled — attach images & post"));
      setPostModal(null); return;
    }
    const u = (pset[platform]?.post_url ?? "").trim();
    if (u) { window.open(u, "_blank", "noopener,noreferrer"); pushToast("success", t("คัดลอกแคปชั่น + เปิดหน้าโพสต์แล้ว", "Caption copied + post page opened")); }
    else pushToast("info", t("คัดลอกแคปชั่นแล้ว · ยังไม่ได้ตั้งลิงก์หน้าโพสต์ (⚙️ ตั้งค่าแพลตฟอร์ม)", "Caption copied · no post link set (⚙️ Platform settings)"));
    setPostModal(null);
  };
  // "ใช้ทั้งหมด": เปิดป๊อปให้เลือกโหมด (ถ้าช่องต้นทางยังว่างก็ไม่ต้องเปิด)
  const openApplyAll = (fromPlatform: string) => {
    const src = caps.find((c) => c.platform === fromPlatform);
    if (!src || (!src.caption?.trim() && !src.hashtags?.trim())) { pushToast("info", t("ช่องนี้ยังว่าง — กรอกก่อนแล้วค่อยกด", "This field is empty — fill it first")); return; }
    setApplyFrom(fromPlatform);
  };
  // เอา caption/hashtags ของช่องต้นทางไปแพลตฟอร์มอื่นตามโหมด: empty=เฉพาะช่องว่าง · except_edited=ทุกอันยกเว้นที่แก้เอง · all=ทับหมด
  const applyCapToAll = (fromPlatform: string, mode: "empty" | "except_edited" | "all") => {
    const src = caps.find((c) => c.platform === fromPlatform);
    if (!src) return;
    setCaps((cs) => cs.map((c) => {
      if (c.platform === fromPlatform) return c;
      const next = { ...c };
      if (src.caption?.trim()) {
        const keep = mode === "empty" ? !!c.caption?.trim() : mode === "except_edited" ? touchedCaps.has(`${c.platform}|caption`) : false;
        if (!keep) next.caption = src.caption;
      }
      if (src.hashtags?.trim()) {
        const keep = mode === "empty" ? !!c.hashtags?.trim() : mode === "except_edited" ? touchedCaps.has(`${c.platform}|hashtags`) : false;
        if (!keep) next.hashtags = src.hashtags;
      }
      return next;
    }));
    pushToast("success", t("ใช้กับแพลตฟอร์มอื่นแล้ว", "Applied to other platforms"));
    setApplyFrom(null);
  };

  // ⇈ ดึงแคปชั่น/แฮชแท็กจากแพลตฟอร์มอื่นมาใส่ช่องนี้ (ทางกลับของ "ใช้แคปชั่นนี้กับแพลตฟอร์มอื่น") — เหมือนพิมพ์เอง: กดบันทึกตามปกติ
  const pullCaption = (toPlatform: string, fromPlatform: string, opts: { caption: boolean; hashtags: boolean }) => {
    const src = caps.find((c) => c.platform === fromPlatform); if (!src) return;
    const patch: Partial<ContentCaption> = {};
    if (opts.caption) patch.caption = src.caption ?? "";
    if (opts.hashtags) patch.hashtags = src.hashtags ?? "";
    setCap(toPlatform, patch);
    setTouchedCaps((st) => { const n = new Set(st); if (opts.caption) n.add(`${toPlatform}|caption`); if (opts.hashtags) n.add(`${toPlatform}|hashtags`); return n; });
    setOpenPlats((st) => new Set(st).add(toPlatform));   // กางแถวปลายทางให้เห็นผลทันที
    pushToast("success", t(`ดึงจาก ${platformLabel(fromPlatform)} มาใส่ ${platformLabel(toPlatform)} แล้ว — กดบันทึกเพื่อเก็บ`, `Pulled from ${platformLabel(fromPlatform)} into ${platformLabel(toPlatform)} — press Save to keep`));
    setPullTo(null);
  };

  // เลือก Parent SKU → ดึงสีของ SKU ลูกทั้งหมดมารวม
  useEffect(() => { if (!parent?.id) { setChildren([]); return; } let live = true; getParentSkuChildren(parent.id).then((cs) => { if (live) { setChildren(cs); setPriceSkuId((prev) => prev || cs[0]?.id || ""); } }).catch(() => {}); return () => { live = false; }; }, [parent?.id]);
  // รีเฟรชข้อมูลสินค้า (ราคา/สี/รูป) หลังแก้ใน drawer Parent/SKU — เจ้าของขอ: แก้ราคาหรือสีแล้ว หน้านี้ + ตัวอย่างแคปชั่นต้องเปลี่ยนตามทันที
  const reloadProduct = useCallback(async () => {
    try {
      if (parent?.id) {
        const cs = await getParentSkuChildren(parent.id);
        setChildren(cs);
        setSku((cur) => {
          if (!cur) return cur;
          const c = cs.find((x) => x.id === cur.id);
          return c ? { ...cur, code: c.code, name: c.name, color: c.color_th ?? c.color_en ?? cur.color, list_price: c.list_price, fake_price: c.fake_price, image_key: c.image_key ?? cur.image_key, image_url: c.image_key ? r2ImageUrl(c.image_key, 80) : cur.image_url } : cur;
        });
      } else if (sku?.id) {
        const j = await apiFetch(`/api/master-v2/skus-v2/${encodeURIComponent(sku.id)}`).then((r) => r.json());
        const row = (j?.data ?? null) as Record<string, unknown> | null;
        if (row) setSku((cur) => (cur ? { ...cur, list_price: row.list_price == null ? null : Number(row.list_price), fake_price: row.fake_price == null ? null : Number(row.fake_price), color: (row.color_th as string | null) ?? (row.color as string | null) ?? cur.color } : cur));
      }
    } catch { /* เงียบ — ข้อมูลเดิมยังอยู่ */ }
  }, [parent?.id, sku?.id]);

  // เลือกสินค้า → เดาแบรนด์ให้อัตโนมัติ (เฉพาะตอนยังไม่มีแบรนด์ + ผู้ใช้ยังไม่ได้เลือกเอง)
  useEffect(() => {
    if (brandTouched || brandId) return;
    const pid = parent?.id ?? null; const sid = sku?.id ?? null;
    if (!pid && !sid) return;
    let live = true;
    resolveBrandFromProduct({ parentSkuId: pid, skuId: sid }).then((bid) => { if (live && bid) setBrandId(bid); });
    return () => { live = false; };
  }, [parent?.id, sku?.id, brandTouched, brandId]);
  useEffect(() => { getRecommendedTimes().then(setRecTimes).catch(() => {}); }, []);

  // ดึงสินค้า (SKU/Parent) จากงานที่ผูกไว้
  const pullFromTask = async () => {
    if (!d?.task_id) return;
    setPullBusy(true);
    try {
      const task = await getTask(d.task_id);
      const s = task.skus?.[0]; const p = task.parent_skus?.[0];
      if (s) setSku({ id: s.id, code: s.code ?? "", name: s.name ?? "", color: s.color ?? null, list_price: s.price ?? null });
      if (p) setParent({ id: p.id, code: p.code ?? "", name: p.name ?? "" });
      pushToast(s || p ? "success" : "info", s || p ? t("ดึงสินค้าจากงานแล้ว", "Pulled product from task") : t("งานนี้ยังไม่ได้ผูกสินค้า", "This task has no linked product"));
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setPullBusy(false); }
  };

  // ไฟล์แนบ: รูป (ย่อก่อนอัป) / วิดีโอสั้น (อัปตรง) / ลิงก์ (พรีวิว OG)
  const onAttachImage = async (r: { r2_key: string; file_name: string; content_type: string; size_bytes: number }) => { await addContentAttachment(contentId, { kind: "image", r2_key: r.r2_key, file_name: r.file_name, content_type: r.content_type, size_bytes: r.size_bytes }); await loadAttachments(); };
  const onDelAttachment = async (id: string) => { await deleteContentAttachment(contentId, id); await loadAttachments(); };
  const onUploadVideo = async (file: File) => {
    const fd = new FormData(); fd.append("file", file); fd.append("folder", "creative-content");
    const res = await apiFetch("/api/admin/upload", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({ error: "อัปโหลดไม่สำเร็จ" }));
    if (j.error) { pushToast("error", j.error as string); return; }
    await addContentAttachment(contentId, { kind: "video", r2_key: j.r2_key as string, file_name: file.name, content_type: j.content_type as string, size_bytes: j.size as number });
    await loadAttachments();
  };
  const onAddLink = async (url: string) => {
    const pv = await getLinkPreview(url);
    await addContentAttachment(contentId, { kind: "link", url: pv.url, label: pv.title, file_name: pv.image });
    await loadAttachments();
  };
  // 🎬 วิดีโอที่อยู่บน Google Drive — เก็บแค่ลิงก์ ไม่ก็อปไฟล์ลง R2 (คลิปใหญ่อยู่ที่ Drive ที่เดียว)
  const onAddDriveVideo = async (link: string) => {
    try {
      const j = await apiFetch("/api/drive-video/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link }) }).then((r) => r.json());
      if (j.error) throw new Error(j.error);
      await addContentAttachment(contentId, { kind: "video", url: `drive:${j.file_id}`, label: j.name || "Google Drive", file_name: j.name ?? null, content_type: j.mime_type ?? null, size_bytes: j.size ?? null });
      await loadAttachments();
      pushToast("success", t("เพิ่มวิดีโอจาก Drive แล้ว (ไม่ได้ก็อปไฟล์ลงระบบ)", "Added Drive video (no copy stored)"));
    } catch (e) { pushToast("error", (e as Error).message); }
  };

  // 📂 path ของโพสต์นี้ (ที่อยู่โฟลเดอร์/ไฟล์ในเครื่อง เช่น Z:\Work In Process\…) — เก็บเป็นไฟล์แนบ kind "path" (ตารางเดิม ไม่ต้องแก้ DB)
  //    ไว้กด 📂 คัดลอกไปวางในช่องเลือกไฟล์ตอนอัปขึ้น Shopee/TikTok ฯลฯ — ใช้กับโพสต์ที่ไม่ได้ผูกงาน (งานที่ผูกส่ง path มาให้อยู่แล้ว)
  const onAddPath = async (path: string) => { await addContentAttachment(contentId, { kind: "path", url: path }); await loadAttachments(); };

  // โน้ตต่อแพลตฟอร์ม (แก้ในตัว) — บันทึกตอนเลิกโฟกัส
  const setPlatNote = (platform: string, note: string) => setPset((ps) => ({ ...ps, [platform]: { ...ps[platform], note } }));
  const persistPset = async () => { try { await savePlatformSettings(pset); } catch (e) { pushToast("error", (e as Error).message); } };

  // ราคาเต็ม = ราคา SKU ที่เลือก · ราคาขาย = ราคา − ส่วนลด · สี = SKU เดี่ยว หรือ รวมสีลูกของ Parent
  // สี: Parent → รวมสีลูก (เลือกภาษาไทย/อังกฤษได้) · SKU เดี่ยว → สีของตัวเอง (ตามภาษาที่มี)
  // ราคา/สี/ลิงก์ → ตัวแปรแม่แบบแคปชั่น — ของกลาง caption-assemble (การ์ดลอยในปฏิทินใช้ตัวเดียวกัน → คัดลอกที่ไหนก็ได้ข้อความเดียวกัน)
  // หลายสินค้าในโพสต์ → {product}/{color}/{price}/{link} แยกเป็นบรรทัดต่อสินค้า (สินค้าเดียว = ค่าเดิม)
  const { vars: sharedVars, usedChildren, colorText, realSelling, fakeVal } = useMemo(() => buildCaptionVars({
    sku, parent, productName: d?.product_name ?? null, skuColorTh: d?.sku_color_th ?? null, skuColorEn: d?.sku_color_en ?? null,
    children, skuIds, priceSkuId, colorSource, links, extras, shopChannels,
  }), [sku, parent, d?.product_name, d?.sku_color_th, d?.sku_color_en, children, skuIds, priceSkuId, colorSource, links, extras, shopChannels]);
  const discountAmt = (fakeVal != null && realSelling != null && fakeVal > realSelling) ? fakeVal - realSelling : null;  // ส่วนลด = ปลอม − จริง
  // เวลาแนะนำของวันที่เลือกโพสต์ (โชว์ปุ่มให้กดใช้ — มีได้หลายเวลา ตัดอันที่ตรงกับที่เลือกอยู่)
  const schedRec = useMemo(() => {
    const dpart = scheduledAt.slice(0, 10);
    if (dpart.length < 10) return null;
    const day = new Date(`${dpart}T00:00:00`).getDay();
    const cur = scheduledAt.slice(11, 16);
    const items = (recTimes[String(day)] ?? []).filter((it) => it.time && it.time !== cur);
    if (!items.length) return null;
    return { items, label: t(["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][day], ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day]) };
  }, [scheduledAt, recTimes, t]);
  const applyRecommendedTime = (tm: string) => setScheduledAt(`${scheduledAt.slice(0, 10)}T${tm}`);

  // คัดลอกพรอมต์ตั้งต้น (เติมตัวแปรสินค้าให้แล้ว) ไปวางใน AI เขียนแคปชั่นต่อ
  const copyPrompt = async () => {
    const raw = resolvePrompt(capCfg, brandId);
    if (!raw.trim()) { pushToast("info", t("ยังไม่ได้ตั้งพรอมต์ — กด ✍️ ตั้งค่า", "No prompt set — click ✍️ Config")); setCfgOpen(true); return; }
    const text = renderCaption(raw, { caption: "", hashtags: "", ...sharedVars });
    try { await navigator.clipboard.writeText(text); pushToast("success", t("คัดลอกพรอมต์แล้ว", "Prompt copied")); }
    catch { pushToast("error", t("คัดลอกไม่สำเร็จ", "Copy failed")); }
  };

  // ✨ ให้ AI เขียนแคปชั่นทุกแพลตฟอร์มรอบเดียว — ประหยัด token เพราะอ่านรูปครั้งเดียวต่อชุดรูป
  // (ฝั่ง server จับกลุ่มแพลตฟอร์มที่ใช้รูปชุดเดียวกัน แล้วยิง OpenAI ครั้งเดียวต่อกลุ่ม)
  const aiWriteAll = async (platforms: string[], extra: string, overwrite: boolean) => {
    if (!contentId) { pushToast("error", t("บันทึกคอนเทนต์ก่อน แล้วค่อยให้ AI เขียน", "Save the content first")); return; }
    if (platforms.length === 0) { pushToast("info", t("ไม่มีแพลตฟอร์มที่เปิดใช้แคปชั่น", "No platform has captions enabled")); return; }
    setAiAllBusy(true);
    try {
      const r = await apiFetch("/api/ai/caption-all", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content_id: contentId, platforms, overwrite, extra }) });
      const j = await r.json();
      if (j.error) throw new Error(j.error);
      const results = (j.results ?? []) as { platform: string; caption: string; hashtags: string[] }[];
      for (const res of results) {
        const cur = caps.find((c) => c.platform === res.platform);
        const old = (cur?.hashtags ?? "").trim();
        const have = new Set(old.split(/\s+/).filter(Boolean).map((x) => x.toLowerCase()));
        const add = (res.hashtags ?? []).filter((h) => !have.has(h.toLowerCase()));
        setCap(res.platform, { caption: res.caption, ...(add.length ? { hashtags: [old, ...add].filter(Boolean).join(" ") } : {}) });
        setTouchedCaps((s) => { const n = new Set(s); n.add(`${res.platform}|caption`); if (add.length) n.add(`${res.platform}|hashtags`); return n; });
      }
      const skip = ((j.skipped ?? []) as { platform: string; reason: string }[]).length;
      pushToast(results.length ? "success" : "info", t(
        `AI เขียนให้ ${results.length} แพลตฟอร์ม (ยิง AI ${j.calls} ครั้ง · อ่าน ${j.images_used ?? 0} รูป)${skip ? ` · ข้าม ${skip}` : ""} — กด “บันทึก” เพื่อเก็บ`,
        `AI wrote ${results.length} platform(s) in ${j.calls} call(s), ${j.images_used ?? 0} image(s)${skip ? `, skipped ${skip}` : ""} — press Save to keep`));
      if (j.warning) pushToast("error", String(j.warning));
      setAiModal(null);
    } catch (e) { pushToast("error", (e as Error).message); } finally { setAiAllBusy(false); }
  };

  // เปลี่ยนชุดแพลตฟอร์มของคอนเทนต์ (บันทึกทันที): เพิ่ม = สร้างช่องแคปชั่น+แฮชแท็กเริ่มต้น · เอาออก = ลบช่องแคปชั่น
  const applyPlatforms = async (next: string[]) => {
    if (!d) return;
    const cur = d.platforms ?? [];
    const added = next.filter((p) => !cur.includes(p)); const removed = cur.filter((p) => !next.includes(p));
    setPlatBusy(true);
    try {
      const nextCaps = next.map((p) => caps.find((c) => c.platform === p) ?? { platform: p, caption: "", hashtags: defaultHashtags(capCfg, brandId, p) });
      await updateContent(contentId, { platforms: next, captions: nextCaps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })) });
      setCaps(nextCaps); setD((x) => (x ? { ...x, platforms: next } : x));
      setOpenPlats((st) => { const n = new Set(st); for (const p of added) n.add(p); for (const p of removed) n.delete(p); return n; });
      if (added.length === 1 && removed.length === 0) pushToast("success", t(`เพิ่ม ${platformLabel(added[0])} แล้ว`, `Added ${platformLabel(added[0])}`));
      else if (removed.length === 1 && added.length === 0) pushToast("success", t(`เอา ${platformLabel(removed[0])} ออกแล้ว`, `Removed ${platformLabel(removed[0])}`));
      else pushToast("success", t(`อัปเดตแพลตฟอร์มแล้ว (${next.length})`, `Platforms updated (${next.length})`));
      onChanged();
    } catch (e) { pushToast("error", (e as Error).message); } finally { setPlatBusy(false); }
  };
  const togglePlatform = (p: string) => {
    if (platBusy || !d) return;
    const cur = d.platforms ?? [];
    if (!cur.includes(p)) { void applyPlatforms([...cur, p]); return; }
    const c = caps.find((x) => x.platform === p);
    if (c?.caption?.trim() || (postStatus[p] ?? "todo") !== "todo") { setPlatRemoveAsk(p); return; }   // มีแคปชั่น/มีสถานะแล้ว → ถามก่อน
    void applyPlatforms(cur.filter((x) => x !== p));
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateContent(contentId, {
        status, scheduled_at: scheduledAt || null, published_url: publishedUrl.trim() || null, assignee_ids: assignees.map((a) => a.id), color_source: colorSource,
        post_status: postStatus, posted_links: postedLinks, platform_images: platformImages, platform_formats: platformFormats,
        brand_id: brandId || null, sku_id: sku?.id ?? null, parent_sku_id: parent?.id ?? null, product_name: sku?.name ?? d?.product_name ?? null,
        // สินค้าทุกตัวในโพสต์ — ตัวหลักขึ้นก่อน (API ทับ sku_id/parent_sku_id จากแถวแรกให้ตรงกัน)
        products: [...((parent || sku) ? [{ parent_sku_id: parent?.id ?? sku?.parent_sku_id ?? null, sku_id: sku?.id ?? null, sku_ids: sku ? [] : skuIds }] : []), ...extras.map(extraToPayload)],
        discount_value: discountValue === "" ? null : Number(discountValue), discount_is_percent: discountPct,
        product_links: links.filter((l) => l.url.trim()), captions: caps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })),
      });
      pushToast("success", t("บันทึกแล้ว", "Saved")); await load(); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
    finally { setSaving(false); }
  };

  const saveAsTemplate = async () => {
    if (!d) return;
    try {
      await createContent({ is_template: true, title: `${d.title} (เทมเพลต)`, post_type: d.post_type, platforms: d.platforms ?? [], brand_id: brandId, captions: caps.map((c) => ({ platform: c.platform, caption: c.caption, hashtags: c.hashtags, caption_type: c.caption_type ?? "short" })) });
      pushToast("success", t("บันทึกเป็นเทมเพลตแล้ว ✓ (เลือกใช้ได้ตอนสร้างคอนเทนต์)", "Saved as template ✓ (available when creating content)")); onChanged();
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // ลบคอนเทนต์นี้ (มีปุ่มใน footer เมื่อไม่ได้ส่ง onDelete มาจากหน้า list) — ยืนยันก่อนลบเสมอ
  const [confirmDel, setConfirmDel] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const doDelete = async () => {
    setDeleting(true);
    try { await deleteContent(contentId); pushToast("success", t("ลบคอนเทนต์แล้ว", "Content deleted")); onDeleted?.(contentId); onChanged(); requestClose(); }
    catch (e) { pushToast("error", (e as Error).message); }
    finally { setDeleting(false); setConfirmDel(false); }
  };

  if (!d) return (<DrawerShell onClose={requestClose} width={drawerW} className="items-center justify-center text-slate-400">{t("กำลังโหลด...", "Loading...")}</DrawerShell>);

  const contentPlatforms = d.platforms ?? [];
  const brandLabel = brands.find((b) => b.id === brandId)?.name ?? null;   // ชื่อแบรนด์ที่เลือกสด ๆ (ให้โมดอลตั้งค่าแคปชั่น/แฮชแท็กตามแบรนด์นี้)
  // ความคืบหน้าการโพสต์ (หัว drawer): โพสต์แล้ว/ตั้งเวลาแล้ว ÷ แพลตฟอร์มที่ไม่ได้ข้าม
  const doneCount = caps.filter((c) => ["posted", "scheduled"].includes(postStatus[c.platform] ?? "todo")).length;
  const totalCount = caps.filter((c) => (postStatus[c.platform] ?? "todo") !== "skip").length;
  const schedLabel = scheduledAt ? `${new Date(scheduledAt).toLocaleDateString("th-TH", { day: "numeric", month: "short" })} · ${scheduledAt.slice(11, 16)}` : null;
  const hasProduct = !!(sku || parent);
  // ⭐ สลับสินค้าเพิ่มเติมขึ้นเป็นตัวหลัก: ตัวหลักเดิม (พร้อม SKU ลูก + ลิงก์ที่กรอกไว้) ถอยไปหัวรายการเพิ่มเติม · ลิงก์สินค้าเปลี่ยนเป็นของ Parent ใหม่
  const makePrimary = (i: number) => {
    const e = extras[i]; if (!e || (!e.parent && !e.sku)) return;
    const oldParent = parent ?? (sku?.parent_sku_id ? { id: sku.parent_sku_id, code: sku.parent_code ?? "", name: sku.parent_name ?? "" } : null);
    const old: ExtraProduct | null = hasProduct ? { key: `old-${Date.now()}`, parent: oldParent, sku: sku ? skuValueToChild(sku) : null, skuIds: sku ? [] : skuIds, children: parent ? children : [], childrenLoaded: !!parent, links: links.filter((l) => l.url.trim()) } : null;
    setParent(e.parent); setSku(e.sku ? childToSkuValue(e.sku, e.parent) : null); setSkuIds(e.sku ? [] : e.skuIds); setPriceSkuId("");
    setLinks(e.links.length ? e.links.map((l) => ({ ...l })) : []);
    setExtras((xs) => { const rest = xs.filter((_, j) => j !== i); return old ? [old, ...rest] : rest; });
  };
  const productCover = sku?.image_url ?? parent?.image_url ?? d.parent_sku_image_url ?? d.cover_image_url ?? null;
  const discountPctLabel = discountAmt != null && fakeVal ? Math.round((discountAmt / fakeVal) * 100) : null;
  const taskKeySet = new Set(taskMedia.images.map((im) => im.key));
  const lbImages = postImages.filter((m) => m.type === "image");   // รูปที่กดดูเต็มจอได้ (ไม่รวมวิดีโอ)
  const ownFiles = attachments.filter((a) => a.kind !== "link" && a.kind !== "path").length;
  // path ทั้งหมดที่คัดลอกได้: ที่ใส่ในโพสต์นี้เอง + ที่งานย่อยแนบมาตอนส่งงาน (ตัดซ้ำ)
  const pathItems: (PathItem & { attId?: string })[] = (() => {
    const seen = new Set<string>(); const out: (PathItem & { attId?: string })[] = [];
    for (const a of attachments) if (a.kind === "path" && a.url && !seen.has(a.url)) { seen.add(a.url); out.push({ path: a.url, label: a.label || t("ใส่ในโพสต์นี้", "Added on this post"), attId: a.id }); }
    for (const l of taskMedia.links) if (l.url && !seen.has(l.url)) { seen.add(l.url); out.push({ path: l.url, label: `${t("จากงาน", "From task")} · ${l.label ?? ""}` }); }
    return out;
  })();
  const linkFiles = attachments.filter((a) => a.kind === "link").length;

  return (
    <>
      {/* โครง drawer กลาง (พื้นหลัง/Esc ปิด/ขึ้นบนสุด) — ด่าน "ยังไม่บันทึก" อยู่ใน requestClose */}
      <DrawerShell onClose={requestClose} width={drawerW}>
        {/* หูจับขอบซ้าย — ลากปรับความกว้าง · ดับเบิลคลิก = กลับค่าเริ่มต้น */}
        {wideScreen && <div onMouseDown={startResize} onDoubleClick={resetWidth} title={t("ลากเพื่อปรับความกว้าง · ดับเบิลคลิก = ค่าเริ่มต้น", "Drag to resize · double-click to reset")}
          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize hover:bg-violet-400/40 active:bg-violet-400/60 z-[60]" />}
        <div className="h-1 shrink-0" style={{ background: accentCss(dth) }} />
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            {/* ดับเบิลคลิกชื่อ = แก้ชื่อได้ทันที (Enter/คลิกนอกช่อง = บันทึก · Esc = ยกเลิก) */}
            {titleEdit === null ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 onDoubleClick={() => setTitleEdit(d.title ?? "")} title={t("ดับเบิลคลิกเพื่อแก้ชื่อ", "Double-click to rename")}
                  className="text-base font-semibold text-slate-900 truncate cursor-text hover:bg-slate-50 rounded px-1 -mx-1">{d.title}</h3>
                <button type="button" onClick={() => setTitleEdit(d.title ?? "")} title={t("แก้ชื่อคอนเทนต์", "Rename")} className="shrink-0 h-6 w-6 rounded text-slate-400 hover:text-violet-700 hover:bg-violet-50 text-xs">✏️</button>
              </div>
            ) : (
              <input autoFocus value={titleEdit} onChange={(e) => setTitleEdit(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } if (e.key === "Escape") { e.preventDefault(); setTitleEdit(null); } }}
                onBlur={async () => {
                  const v = (titleEdit ?? "").trim();
                  setTitleEdit(null);
                  if (!v || v === d.title) return;
                  setD((x) => (x ? { ...x, title: v } : x));   // optimistic
                  try { await updateContent(contentId, { title: v }); pushToast("success", t("เปลี่ยนชื่อแล้ว", "Renamed")); onChanged?.(); }
                  catch (e) { pushToast("error", (e as Error).message); setD((x) => (x ? { ...x, title: d.title } : x)); }
                }}
                className="text-base font-semibold text-slate-900 border-b-2 border-violet-400 outline-none bg-transparent w-full px-1 -mx-1" />
            )}
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className="font-mono text-[11px] text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">{d.content_no}</span>
              <span className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${brandLabel ? "bg-violet-50 text-violet-800 border-violet-200" : "text-slate-400 border-slate-200"}`} title={t("แบรนด์ (แก้ที่การ์ดสินค้า)", "Brand (edit in product card)")}>
                <span className="h-2 w-2 rounded-full" style={{ background: (brands.find((b) => b.id === brandId)?.color) || "#cbd5e1" }} />{brandLabel ?? t("ยังไม่ระบุแบรนด์", "No brand")}
              </span>
              <span className={`inline-flex items-center gap-1 text-[11px] rounded-full px-2 py-0.5 border ${schedLabel ? "text-slate-600 border-slate-200" : "text-amber-700 bg-amber-50 border-amber-200"}`}>🗓 {schedLabel ?? t("ยังไม่ตั้งเวลา", "Not scheduled")}</span>
              {/* ผูกกับงานอยู่ → กดไปดูงานนั้นได้เลย (เปิดแท็บใหม่ ไม่หลุดจากคอนเทนต์ที่กำลังแก้) */}
              {d.task_id && (
                <a href={`/tasks?task=${d.task_id}`} target="_blank" rel="noreferrer" title={t("เปิดงานที่ผูกกับคอนเทนต์นี้ (แท็บใหม่)", "Open the linked task (new tab)")}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-violet-700 hover:underline whitespace-nowrap">👁 {t("ดูงาน", "View task")} ↗</a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {/* ความคืบหน้า: โพสต์ไปแล้วกี่แพลตฟอร์ม */}
            {caps.length > 0 && (
              <div className="hidden sm:block text-right" title={t("โพสต์แล้ว/ตั้งเวลาแล้ว ÷ แพลตฟอร์มที่ไม่ได้ข้าม", "Posted or scheduled ÷ platforms not skipped")}>
                <div className="text-[10px] text-slate-400">{t("ความคืบหน้า", "Progress")}</div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${totalCount ? Math.round((doneCount / totalCount) * 100) : 0}%` }} /></div>
                  <span className="text-xs font-semibold text-slate-700 tabular-nums">{t("โพสต์แล้ว", "Posted")} {doneCount}/{totalCount}</span>
                </div>
              </div>
            )}
            <div className="flex items-center gap-1">
              <DrawerThemeButton theme={dth} update={dthUpdate} sections={CONTENT_SECTIONS} />
              <button onClick={requestClose} className="h-8 w-8 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100">✕</button>
            </div>
          </div>
        </div>

        {/* ===== จอกว้าง: 3 คอลัมน์ (รูปจากงาน | ข้อมูล | แคปชั่น) ปรับขนาดได้ · มือถือ: เรียงบน-ล่าง ===== */}
        <div className={isWide ? "flex-1 flex min-h-0" : "flex-1 overflow-y-auto"} style={{ ...drawerBgStyle(dth), zoom: drawerZoom(dth.size) }}>
          {/* กลุ่ม ข้อมูล | เส้นแบ่ง | แคปชั่น — ตัวลากปรับขนาดทำงานในนี้ (รูปอยู่นอกกลุ่ม จะได้ลากแม่น) */}
          <div ref={bodyRef} className={isWide ? "flex-1 flex min-h-0 min-w-0" : "contents"} style={isWide && dth.swap ? { flexDirection: "row-reverse" } : undefined}>
          {/* ───── ฝั่งกลาง: ข้อมูล + แนบงาน ───── */}
          <div className={`flex flex-col ${densityPad(dth.density)} ${densityGap(dth.density)} ${isWide ? "overflow-y-auto min-w-0" : ""}`} style={isWide ? { flexBasis: `${leftPct}%`, flexGrow: 0, flexShrink: 0 } : undefined}>
            {/* status + schedule + assignee — ปักไว้บนสุดเสมอ */}
            {/* ตั้งเวลาโพสต์ — เด่น ปักบนสุด · (สถานะ/ผู้รับผิดชอบ ย้ายไปจัดการที่งานย่อยแทน) */}
            <div style={{ order: -1 }} className="bg-violet-50 border border-violet-200 rounded-xl p-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold text-violet-800 flex items-center gap-1.5">🗓 {t("ตั้งเวลาโพสต์", "Schedule Post")}</label>
                <button type="button" onClick={() => setRecOpen(true)} className="text-[11px] text-violet-700 hover:underline">⚙️ {t("เวลาแนะนำ", "Suggested times")}</button>
              </div>
              <div className="mt-1.5"><ERPDateTime24 value={scheduledAt} onChange={setScheduledAt} /></div>
              {schedRec && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-violet-400">💡 {t("เวลาแนะนำ", "Suggested")} ({schedRec.label}):</span>
                  {schedRec.items.map((it) => (
                    <button key={it.time} type="button" onClick={() => applyRecommendedTime(it.time)} title={it.note || t("เวลาแนะนำ", "Suggested time")} className="inline-flex items-center gap-0.5 text-[11px] text-violet-700 bg-white border border-violet-200 rounded-full px-2.5 py-1 hover:bg-violet-100">{it.time}{it.note ? <span className="text-violet-300">ⓘ</span> : null}</button>
                  ))}
                </div>
              )}
            </div>

            {/* ───── การ์ดสินค้า: สรุปสั้น (รูป + รหัส + ชื่อ + แบรนด์ + สี + ราคาบรรทัดเดียว) · กด ✏️ เพื่อแก้ ───── */}
            {!isHidden(dth, "product") && (
            <div style={{ order: cOrderOf("product") }} className="border border-slate-200 rounded-xl bg-white p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-sm font-semibold text-slate-700">🛍 {cLabelOf("product")}</span>
                <div className="flex items-center gap-3">
                  {d.task_id && <button onClick={pullFromTask} disabled={pullBusy} className="text-[11px] text-violet-700 hover:underline disabled:opacity-50">{pullBusy ? t("กำลังดึง…", "Pulling…") : t("⬇ ดึงจากงาน", "⬇ Pull from task")}</button>}
                  {hasProduct && <button onClick={() => setProdEdit((v) => !v)} className="text-xs font-medium text-violet-700 hover:underline">{prodEdit ? `✓ ${t("เสร็จ", "Done")}` : `✏️ ${t("แก้ไข", "Edit")}`}</button>}
                </div>
              </div>
              {/* โหมดดู */}
              {hasProduct && !prodEdit && (
                <div className="flex gap-3 items-start">
                  {productCover
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={productCover} alt="" className="h-14 w-14 rounded-lg object-cover border border-slate-200 shrink-0" />
                    : <div className="h-14 w-14 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-300 text-xl shrink-0">🛍</div>}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] text-slate-500 truncate">{sku?.code ?? parent?.code}{sku && parent ? <span className="text-slate-300"> · Parent {parent.code}</span> : null}</div>
                    <div className="text-sm text-slate-800 leading-snug line-clamp-2">{sku?.name ?? parent?.name}</div>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500 flex-wrap">
                      {sku ? <span>{t("SKU สีเดี่ยว", "Single SKU")}</span> : <span>{t("Parent SKU ทุกสี", "Parent (all colors)")}</span>}
                      {parent && <button onClick={() => setOpenParentId(parent.id)} className="text-violet-700 hover:underline">↗ {t("เปิดดูสินค้า", "Open product")}</button>}
                    </div>
                  </div>
                </div>
              )}
              {/* โหมดแก้ (หรือยังไม่เลือกสินค้า) */}
              {(prodEdit || !hasProduct) && (
                <div className="space-y-2">
                  {!hasProduct && <p className="text-[11px] text-slate-400">{t("เลือก SKU (สีเดียว) หรือ Parent SKU (รวมทุกสี) → ระบบเติมแบรนด์ สี และราคาให้", "Pick a SKU (single color) or Parent SKU (all colors) → brand, colors and price fill in")}</p>}
                  <div className="grid grid-cols-2 gap-2 items-start">
                    <div><label className="text-[11px] text-slate-400">SKU ({t("สีเดี่ยว", "single color")})</label>
                      <SkuPicker value={sku} onChange={(v) => { setSku(v); setSkuIds([]); if (v?.parent_sku_id && parent?.id !== v.parent_sku_id) setParent({ id: v.parent_sku_id, code: v.parent_code ?? "", name: v.parent_name ?? "" }); }} /></div>
                    <div>
                      <div className="flex items-center justify-between h-4">
                        <label className="text-[11px] text-slate-400">Parent SKU ({t("ทุกสี", "all colors")})</label>
                        {parent?.id && <button type="button" onClick={() => setOpenParentId(parent.id)} className="text-[11px] text-violet-700 hover:underline">↗ {t("เปิด drawer Parent", "Open Parent")}</button>}
                      </div>
                      <ParentSkuPicker value={parent} onChange={(v) => { setParent(v); setSkuIds([]); }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] text-slate-400">{t("แบรนด์", "Brand")}</label>
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full border border-slate-200 shrink-0" style={{ background: (brands.find((b) => b.id === brandId)?.color) || "#e2e8f0" }} />
                      <BrandSelect plain brands={brands} value={brandId} onChange={(v) => { setBrandTouched(true); setBrandId(v || null); }} emptyLabel={t("— เดาจากสินค้าอัตโนมัติ —", "— Auto from product —")} className="flex-1 h-8 border border-slate-200 rounded-lg px-2 text-xs bg-white" />
                    </div>
                  </div>
                </div>
              )}
              {/* เลือก Parent แล้ว → ชิป SKU ลูกให้กดเลือกสีเดียว (หรือ "ทุกสี" = ใช้ Parent ทั้งชุด) */}
              {parent && children.length > 0 && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                  <div className="text-[11px] text-slate-400 mb-1">{t("SKU ลูกของ", "Child SKUs of")} <span className="font-mono">{parent.code}</span> · {t("กดเลือกได้หลายสี · ไม่เลือก = ทุกสี", "tap to pick colors · none = all")}{!sku && skuIds.length > 0 && <span className="ml-1 text-violet-600 font-medium">{t(`เลือก ${skuIds.length} สี`, `${skuIds.length} selected`)}</span>}</div>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto pr-0.5">
                    <button type="button" onClick={() => { setSku(null); setSkuIds([]); }} className={`h-7 px-2.5 rounded-full border text-[11px] font-medium ${!sku && !skuIds.length ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>🎨 {t("ทุกสี", "All colors")} ({children.length})</button>
                    {children.map((c) => { const on = sku?.id === c.id || skuIds.includes(c.id); const col = (colorSource === "en" ? c.color_en : c.color_th) ?? c.color_th ?? c.color_en; return (
                      <button key={c.id} type="button" title={c.code}
                        onClick={() => { const cur = sku ? { sku: skuValueToChild(sku), skuIds: [] as string[] } : { sku: null, skuIds }; const nx = toggleChildSelection(cur, c, children); setSku(nx.sku ? childToSkuValue(nx.sku, parent) : null); setSkuIds(nx.skuIds); setPriceSkuId(""); }}
                        className={`h-7 px-2.5 rounded-full border text-[11px] ${on ? "bg-violet-600 text-white border-violet-600" : "bg-white text-slate-600 border-slate-200 hover:border-violet-300"}`}>
                        {col || c.code}{col && <span className={`ml-1 font-mono ${on ? "text-violet-200" : "text-slate-400"}`}>{c.code.replace(`${parent.code}-`, "")}</span>}
                      </button>
                    ); })}
                  </div>
                </div>
              )}
              {/* สินค้าเพิ่มเติมในโพสต์ — โปรโมทหลายตัว (⭐ สลับขึ้นเป็นตัวหลัก · ↗ เปิด Parent · ลากสลับลำดับ) */}
              {hasProduct && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100">
                  <ExtraProductsEditor items={extras} onChange={setExtras} colorSource={colorSource} onMakePrimary={makePrimary} onOpenParent={(id) => setOpenParentId(id)}
                    excludeParentIds={[parent?.id, sku?.parent_sku_id]} onDuplicate={() => pushToast("info", t("สินค้านี้อยู่ในโพสต์แล้ว", "Already in this post"))}
                    hint={extras.length > 0 ? t("แคปชั่น: {color} {price} {link} จะแยกเป็นบรรทัดต่อสินค้า · กดบันทึกเพื่อเก็บ", "Captions list colors/prices/links per product · Save to keep") : undefined} />
                </div>
              )}
              {/* สี + ราคา — บรรทัดละเรื่อง (เดิมเป็นกล่องใหญ่ 3 ใบ) */}
              {hasProduct && (
                <div className="mt-2.5 pt-2.5 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 shrink-0 w-10">{t("สี", "Color")}</span>
                    <span className="flex-1 min-w-0 truncate text-slate-700" title={colorText ?? ""}>{colorText || <span className="text-slate-300">—</span>}</span>
                    <div className="inline-flex rounded-md border border-slate-200 overflow-hidden text-[10px] shrink-0" title={t("ภาษาที่ใช้แสดงสีใน {color}", "Language for {color}")}>
                      <button type="button" onClick={() => setColorSource("th")} className={`px-1.5 h-5 ${colorSource === "th" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{t("ไทย", "TH")}</button>
                      <button type="button" onClick={() => setColorSource("en")} className={`px-1.5 h-5 border-l border-slate-200 ${colorSource === "en" ? "bg-violet-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Eng</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-400 shrink-0 w-10">{t("ราคา", "Price")}</span>
                    {!sku && usedChildren.length > 1 && (
                      <select value={priceSkuId} onChange={(e) => setPriceSkuId(e.target.value)} title={t("ราคาจาก SKU ลูกตัวไหน", "Price from which child SKU")} className="h-6 border border-slate-200 rounded-md px-1 text-[11px] bg-white max-w-[150px]">
                        {usedChildren.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                      </select>
                    )}
                    <span className="flex items-center gap-1.5">
                      {fakeVal != null && discountAmt != null && <s className="text-slate-400">฿{Number(fakeVal).toLocaleString("th-TH")}</s>}
                      <span className="text-sm font-semibold text-emerald-700">{realSelling != null ? `฿${Number(realSelling).toLocaleString("th-TH")}` : t("— ยังไม่มีราคา", "— no price")}</span>
                      {discountPctLabel != null && <span className="px-1.5 py-px rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px]">-{discountPctLabel}%</span>}
                    </span>
                  </div>
                </div>
              )}
            </div>)}

            {/* ───── การ์ดรูป/วิดีโอ: คลังเดียว (รูปจากงาน + อัปเอง + วิดีโอ) · กด ＋ เพื่อเพิ่ม/จัดการ ───── */}
            {!isHidden(dth, "media") && (
            <div style={{ order: cOrderOf("media") }} className="border border-slate-200 rounded-xl bg-white p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <button onClick={() => toggleColl("media")} className="text-sm font-semibold text-slate-700 flex items-center gap-1.5 min-w-0">
                  <span className="text-[10px] text-slate-300">{coll("media") ? "▸" : "▾"}</span>🖼 {cLabelOf("media")}
                  <span className="text-[11px] font-normal text-slate-400">{postImages.length} {t("ไฟล์", "files")}</span>
                </button>
                <button onClick={() => { setMediaAdd((v) => !v); if (coll("media")) toggleColl("media"); }} className="text-xs font-medium text-violet-700 hover:underline shrink-0">{mediaAdd ? `✓ ${t("เสร็จ", "Done")}` : `＋ ${t("เพิ่ม / จัดการ", "Add / manage")}`}</button>
              </div>
              {!coll("media") && (
                <>
                  {postImages.length === 0 && !mediaAdd ? (
                    Object.values(platformFormats).includes("story") && attachments.length === 0 ? (
                      // Story ที่ลงแผนไว้ก่อน (สร้างจากแถบ 📖 ในปฏิทินโดยยังไม่ใส่ไฟล์)
                      <button onClick={() => setMediaAdd(true)} className="w-full rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100">
                        📎 {t("Story นี้ยังไม่มีไฟล์ — กดที่นี่เพื่ออัปโหลดรูป/วิดีโอ หรือวางลิงก์ Google Drive", "This story has no file yet — click to upload an image/video or paste a Google Drive link")}
                      </button>
                    ) : (
                    <p className="text-xs text-slate-400 italic">{t("ยังไม่มีรูป — กด ＋ เพิ่ม หรือผูกงานที่มีรูปส่งมาแล้ว", "No media yet — click ＋ or link a task that has images")}</p>
                    )
                  ) : postImages.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {postImages.slice(0, mediaAdd ? postImages.length : 8).map((im) => {
                        const src = taskMedia.images.find((x) => x.key === im.key); const isTask = taskKeySet.has(im.key); const bd = src ? tmBadge(src.status) : null;
                        const usedBy = platformImageEntries.filter(([, arr]) => arr.includes(im.key)).length;
                        const lbIdx = lbImages.findIndex((x) => x.key === im.key);
                        const ownAtt = attachments.find((a) => a.r2_key === im.key || a.url === im.key);   // ไฟล์ที่อัปเอง = ลบได้
                        const gi = postImages.indexOf(im);
                        return (
                          <div key={im.key} {...mediaDrag.rowProps(gi)} {...mediaDrag.handleProps(gi)} title={t("ลากเพื่อสลับตำแหน่ง", "Drag to reorder")}
                            className={`relative group aspect-square cursor-grab active:cursor-grabbing ${mediaDrag.rowCls(gi)}`}>
                            {im.type === "video"
                              ? <div className="w-full h-full rounded-lg border border-slate-200 bg-slate-800 text-white flex items-center justify-center text-lg" title={im.label ?? ""}>🎬</div>
                              // eslint-disable-next-line @next/next/no-img-element
                              : <img src={r2ImageUrl(im.key, 240) ?? ""} alt={im.label ?? ""} onClick={() => setTmLb(lbIdx)} title={`${im.label ?? ""}${bd ? ` · ${bd.label}` : ""}`} className="w-full h-full object-cover rounded-lg border border-slate-200 cursor-zoom-in" />}
                            <span className={`absolute top-0.5 left-0.5 text-[8px] text-white px-1 py-px rounded ${isTask ? (bd?.cls ?? "bg-slate-400") : "bg-violet-500"}`}>{isTask ? t("งาน", "task") : t("อัปเอง", "own")}</span>
                            {usedBy > 0 && <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-emerald-600 text-white px-1 py-px rounded" title={t(`เลือกใช้ใน ${usedBy} แพลตฟอร์ม`, `Used by ${usedBy} platform(s)`)}>✓{usedBy}</span>}
                            <div className="absolute top-0.5 right-0.5 flex gap-0.5 opacity-0 group-hover:opacity-100">
                              {im.type !== "video" && <button onClick={() => copyImageUrl(im.key)} title={t("ก๊อปลิงก์รูป", "Copy image link")} className="h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-slate-600 text-[10px] shadow hover:text-violet-700">🔗</button>}
                              {im.type !== "video" && <a href={r2ImageUrl(im.key) ?? "#"} download target="_blank" rel="noreferrer" title={t("ดาวน์โหลด", "Download")} className="h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-slate-600 text-[10px] shadow hover:text-violet-700">⬇</a>}
                              {ownAtt && <button onClick={(e) => { e.stopPropagation(); setDelAtt({ id: ownAtt.id, label: ownAtt.file_name ?? ownAtt.label ?? im.key }); }} title={t("ลบไฟล์นี้ (เฉพาะที่อัปเอง)", "Delete this file (own uploads only)")} className="h-5 w-5 flex items-center justify-center bg-white/90 rounded-full text-rose-600 text-[10px] shadow hover:bg-rose-50">✕</button>}
                            </div>
                          </div>
                        ); })}
                      {!mediaAdd && postImages.length > 8 && (
                        <button onClick={() => setMediaAdd(true)} className="aspect-square rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 hover:border-violet-300 hover:text-violet-700">+{postImages.length - 8}</button>
                      )}
                    </div>
                  )}
                  {(pathItems.length > 0 || mediaAdd) && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] text-slate-400">📂 {t("Path ไฟล์ — คัดลอกไปวางในช่องเลือกไฟล์ตอนอัปขึ้นแพลตฟอร์ม", "File paths — copy & paste into the upload file picker")}</p>
                      {pathItems.map((p) => (
                        <div key={p.path} className="group/pt flex items-center gap-1.5 text-[11px]">
                          {/^https?:\/\//i.test(p.path)
                            ? <a href={p.path} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-violet-700 hover:underline" title={p.path}>🔗 {p.path}</a>
                            : <span className="min-w-0 flex-1 truncate font-mono text-slate-700" title={p.path}>📂 {p.path}</span>}
                          <span className="shrink-0 max-w-[40%] truncate text-[10px] text-slate-400" title={p.label ?? ""}>{p.label}</span>
                          <CopyButton value={p.path} title={t(`คัดลอก path: ${p.path}`, `Copy path: ${p.path}`)} className="!w-5 !h-5" />
                          {p.attId && <button onClick={() => setDelAtt({ id: p.attId as string, label: p.path })} title={t("เอา path นี้ออก", "Remove this path")} className="shrink-0 text-slate-300 hover:text-rose-600 opacity-0 group-hover/pt:opacity-100">✕</button>}
                        </div>
                      ))}
                      {mediaAdd && <AddPathForm onAdd={onAddPath} say={(type, m) => pushToast(type, m)} />}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500 flex-wrap">
                    <span className="bg-slate-100 rounded-full px-2 py-0.5">{t("จากงาน", "From task")} {taskMedia.images.length}</span>
                    <span className="bg-slate-100 rounded-full px-2 py-0.5">{t("อัปเอง", "Own")} {ownFiles}</span>
                    {linkFiles > 0 && <span className="bg-slate-100 rounded-full px-2 py-0.5">{t("ลิงก์", "Links")} {linkFiles}</span>}
                    {pathItems.length > 0 && <span className="bg-slate-100 rounded-full px-2 py-0.5">Path {pathItems.length}</span>}
                    <span className="ml-auto text-slate-300">{t("เลือกรูปที่จะลงแต่ละแพลตฟอร์มได้ที่การ์ดฝั่งขวา", "Pick images per platform on the right")}</span>
                  </div>
                  {mediaAdd && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <ContentAttachments attachments={attachments} hideImageList onAttachImage={onAttachImage} onUploadVideo={onUploadVideo} onAddLink={onAddLink} onAddDriveVideo={onAddDriveVideo} onDelete={onDelAttachment} pushToast={pushToast} />
                    </div>
                  )}
                </>
              )}
            </div>)}

            {/* ลิงก์สินค้า (ปลายทางขาย) */}
            {!isHidden(dth, "links") && (
            <CSection title={cLabelOf("links")} order={cOrderOf("links")} collapsed={coll("links")} onToggle={() => toggleColl("links")}
              right={links.length > 0 ? <span className="text-[11px] text-slate-400">{links.length}</span> : undefined}>
              <div className="space-y-2">
                {links.map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <select value={l.platform} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, platform: e.target.value } : x))} className="h-9 border border-slate-200 rounded-lg px-2 text-sm w-32">
                      {platforms.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                    <ERPInput value={l.url} onChange={(e) => setLinks((ls) => ls.map((x, j) => j === i ? { ...x, url: e.target.value } : x))} placeholder="https://..." />
                    <button onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))} className="h-9 px-2 text-slate-400 hover:text-red-500">✕</button>
                  </div>
                ))}
                <button onClick={() => setLinks((ls) => [...ls, { platform: "shopee", url: "" }])} className="text-sm text-violet-700 hover:underline">＋ {t("เพิ่มลิงก์", "Add Link")}</button>
                {parent && <p className="text-[11px] text-slate-400">🔗 {t(`ลิงก์ Shopee / Lazada / TikTok จะบันทึกกลับไปที่ Parent ${parent.code} ด้วย — คอนเทนต์ครั้งหน้าของสินค้านี้มีลิงก์ให้ทันที`, `Shopee / Lazada / TikTok links are saved back to Parent ${parent.code} — future content gets them automatically`)}</p>}
              </div>
            </CSection>)}

            {/* published url — ปักไว้ล่างสุดเสมอ */}
            {(status === "published") && <div style={{ order: 999 }}><label className="text-xs text-slate-400">{t("ลิงก์โพสต์ที่เผยแพร่", "Published Post URL")}</label><ERPInput value={publishedUrl} onChange={(e) => setPublishedUrl(e.target.value)} placeholder="https://..." /></div>}
          </div>

          {/* ───── เส้นแบ่งลากได้ (เฉพาะจอกว้าง) ───── */}
          {isWide && (
            <div onMouseDown={startDrag} title={t("ลากเพื่อปรับขนาด", "Drag to resize")} className="w-1.5 shrink-0 cursor-col-resize bg-slate-100 hover:bg-violet-300 active:bg-violet-400 transition-colors relative">
              <div className="absolute inset-y-0 -left-1.5 -right-1.5" />
            </div>
          )}

          {/* ───── ฝั่งขวา: แคปชั่นแยกแพลตฟอร์ม ───── */}
          <div className={isWide ? `flex-1 overflow-y-auto ${densityCls(dth.density)} min-w-0 bg-slate-50/40` : `${densityCls(dth.density)} bg-slate-50/40 border-t border-slate-200`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-semibold text-slate-700">{t("แพลตฟอร์ม", "Platforms")} <span className="text-[11px] font-normal text-slate-400">{caps.length} {t("ช่อง", "channels")} · {t("โพสต์แล้ว", "posted")} {doneCount}/{totalCount}</span></p>
              <CaptionToolbar pinned={pinnedTools} onSavePinned={savePinnedTools} actions={[
                ...(canAiCaption && caps.length > 0 ? [{
                  key: "ai", primary: true,
                  label: aiAllBusy ? t("✨ กำลังเขียน...", "✨ Writing...") : t("✨ AI เขียนทั้งหมด", "✨ AI write all"),
                  onClick: () => setAiModal({ platforms: caps.filter((c) => pset[c.platform]?.use_caption !== false && (postStatus[c.platform] ?? "todo") !== "skip").map((c) => c.platform) }),
                }] : []),
                ...(caps.length > 1 ? [{
                  key: "expand",
                  label: openPlats.size === caps.length ? t("⊟ พับทั้งหมด", "⊟ Collapse all") : t("⊞ กางทั้งหมด", "⊞ Expand all"),
                  onClick: () => setOpenPlats(openPlats.size === caps.length ? new Set() : new Set(caps.map((c) => c.platform))),
                }] : []),
                { key: "copy_prompt", label: `📋 ${t("คัดลอกพรอมต์", "Copy prompt")}`, onClick: copyPrompt },
                { key: "prompt_cfg", label: `✍️ ${t("พรอมต์/แฮชแท็ก", "Prompt/Hashtags")}`, onClick: () => setCfgOpen(true) },
                { key: "platform_cfg", label: `⚙️ ${t("ตั้งค่าแพลตฟอร์ม", "Platform settings")}`, onClick: () => setPsOpen(true) },
                { key: "templates", label: `📝 ${t("แม่แบบ", "Templates")}`, onClick: () => setTplSettingsOpen(true) },
                { key: "hashtags", label: `🏷 ${t("คลังแฮชแท็ก", "Hashtag library")}`, onClick: () => setHashOpen(true) },
              ]} />
            </div>
            {/* ติ๊กว่าจะลงที่ไหนบ้าง — โชว์ทุกแพลตฟอร์มในระบบ (ของแบรนด์นี้ขึ้นก่อน) · ม่วง = ลง (มีการ์ดด้านล่าง) · ขาว = ไม่ลง · บันทึกทันทีที่กด */}
            {(() => {
              const brandAllow = brandId ? bpMap[brandId] : undefined;
              // แพลตฟอร์มที่คอนเทนต์นี้ "ลงอยู่แล้ว" แต่ถูกปิดใช้ในตั้งค่า (เช่น Instagram/X/Pinterest) ต้องยังโผล่ในแถวนี้ ไม่งั้นมีการ์ดแต่กดเอาออกไม่ได้
              const inUseHidden = contentPlatforms.filter((v) => !platforms.some((p) => p.value === v)).map((v) => { const m = platformMeta(v); return { value: v, label: platformLabel(v), color: m?.color ?? null, icon: m?.icon ?? null, icon_key: m?.icon_key ?? null, inactive: true }; });
              const ordered = [...platforms.map((p) => ({ ...p, inactive: false })), ...inUseHidden].sort((a, b) => {
                const ra = contentPlatforms.includes(a.value) ? 0 : brandAllow?.includes(a.value) ? 1 : 2;
                const rb = contentPlatforms.includes(b.value) ? 0 : brandAllow?.includes(b.value) ? 1 : 2;
                return ra - rb;
              });
              return (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] text-slate-400 mr-0.5">{t("ลงที่:", "Post to:")}</span>
                  {ordered.map((p) => {
                    const on = contentPlatforms.includes(p.value); const st = postStatus[p.value] ?? "todo"; const isBrand = !!brandAllow?.includes(p.value);
                    return (
                      <button key={p.value} type="button" disabled={platBusy} onClick={() => togglePlatform(p.value)}
                        title={p.inactive ? t(`${p.label} ถูกปิดใช้ในตั้งค่าแพลตฟอร์ม — ยังเอาออกจากคอนเทนต์นี้ได้ · เปิดใช้ที่ ⚙️ ตั้งค่า → แพลตฟอร์ม`, `${p.label} is disabled in settings — you can still remove it here`) : on ? t("กดเพื่อเอาออก (ไม่ลงที่นี่)", "Click to remove") : t(`กดเพื่อลงที่ ${p.label}${isBrand ? " (แบรนด์นี้ลงประจำ)" : ""}`, `Click to add ${p.label}`)}
                        className={`h-8 pl-1.5 pr-2.5 rounded-full border inline-flex items-center gap-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${on ? "bg-violet-600 text-white border-violet-600 shadow-sm" : isBrand ? "bg-white text-slate-700 border-violet-200 hover:border-violet-400" : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"}`}>
                        {(p.icon_key || p.icon) && <PlatformChip code={p.value} iconOnly />}
                        {p.label}{p.inactive && <span className="text-[9px] opacity-70">({t("ปิดใช้", "off")})</span>}
                        {on
                          ? <span className={`h-2 w-2 rounded-full ${st === "posted" || st === "scheduled" ? "bg-emerald-400" : st === "skip" ? "bg-slate-300" : "bg-amber-300"}`} title={st === "posted" ? t("โพสต์แล้ว", "Posted") : st === "scheduled" ? t("ตั้งเวลาแล้ว", "Scheduled") : st === "skip" ? t("ข้าม", "Skipped") : t("ยังไม่โพสต์", "Not posted")} />
                          : <span className="text-[10px] text-slate-300">＋</span>}
                      </button>
                    );
                  })}
                  {brandAllow && brandAllow.length > 0 && (
                    <button type="button" disabled={platBusy} onClick={() => void applyPlatforms([...new Set([...brandAllow, ...contentPlatforms.filter((p) => caps.find((c) => c.platform === p)?.caption?.trim())])])}
                      title={t("ติ๊กแพลตฟอร์มประจำของแบรนด์นี้ (ตัวที่มีแคปชั่นแล้วคงไว้)", "Select this brand's default platforms (keeps ones with captions)")}
                      className="h-8 px-2.5 rounded-full text-[11px] text-violet-700 border border-dashed border-violet-300 hover:bg-violet-50 disabled:opacity-60">✨ {t("ติ๊กตามแบรนด์", "Brand defaults")}</button>
                  )}
                </div>
              );
            })()}
            {caps.length === 0 ? (
              <div className="text-sm text-slate-400 italic rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">☝️ {t("ยังไม่ได้เลือกว่าจะลงที่ไหน — กดปุ่มแพลตฟอร์มด้านบนเพื่อเพิ่มการ์ดแคปชั่น", "Nothing selected yet — click a platform above to add its caption card")}</div>
            ) : (
              <div className="space-y-1.5">
                {caps.map((c) => <CaptionCard key={c.platform} open={openPlats.has(c.platform)} onToggle={() => togglePlat(c.platform)} contentId={contentId} canAi={canAiCaption} aiBusy={aiAllBusy} onAiWrite={() => setAiModal({ platforms: [c.platform] })} format={platformFormats[c.platform]} onSetFormat={(v) => setPlatformFormats((m) => { const n = { ...m }; if (v) n[c.platform] = v; else delete n[c.platform]; return n; })} cap={c} templates={templates} sharedVars={sharedVars} brandId={brandId} setting={pset[c.platform]} onChange={(patch) => { setCap(c.platform, patch); setTouchedCaps((s) => { const n = new Set(s); if ("caption" in patch) n.add(`${c.platform}|caption`); if ("hashtags" in patch) n.add(`${c.platform}|hashtags`); return n; }); }} onOpenSettings={() => setPsOpen(true)} onApplyAll={caps.length > 1 ? openApplyAll : undefined} onPullFrom={caps.length > 1 ? () => setPullTo(c.platform) : undefined} paths={pathItems} onAddPath={onAddPath} fallbackImages={contentImageKeys} postStatus={postStatus[c.platform] ?? "todo"} postedUrl={postedLinks[c.platform] ?? ""} onSetStatus={(s) => setPlatStatus(c.platform, s)} onSetPostedUrl={(url) => setPlatPostedUrl(c.platform, url)} onCommitPostedUrl={persistPostedLinks} onRequestPost={(text) => setPostModal({ platform: c.platform, captionText: text })} canAuto={(c.platform === "facebook" && !!metaStatus.facebook?.connected) || (c.platform === "instagram" && !!metaStatus.instagram?.connected)} autoLabel={c.platform === "facebook" ? "Facebook" : c.platform === "instagram" ? "Instagram" : undefined}
                  connInfo={c.platform === "facebook"
                    ? (metaStatus.facebook?.connected
                      ? { connected: true, label: t(`เชื่อมเพจแล้ว: ${metaStatus.facebook.page_name ?? "-"} — กดโพสต์ขึ้นเพจนี้ได้เลย`, `Connected page: ${metaStatus.facebook.page_name ?? "-"}`), href: "/admin/platform-accounts" }
                      : { connected: false, label: brandId ? t("ยังไม่เชื่อมเพจ Facebook ของแบรนด์นี้ — ปุ่มโพสต์จะเป็นโหมดมือ (คัดลอก+เปิดหน้า)", "Facebook page not connected for this brand — manual mode") : t("เลือกแบรนด์ก่อน ระบบถึงจะรู้ว่าเชื่อมเพจไหน", "Pick a brand first"), href: "/admin/platform-accounts" })
                    : c.platform === "instagram"
                      ? (metaStatus.instagram?.connected
                        ? { connected: true, label: t(`เชื่อม Instagram แล้ว (ผ่านเพจ ${metaStatus.facebook?.page_name ?? "-"})`, `Instagram connected (via page ${metaStatus.facebook?.page_name ?? "-"})`), href: "/admin/platform-accounts" }
                        : { connected: false, label: t("ยังไม่เชื่อม Instagram — ต้องเชื่อมเพจ Facebook ที่ผูกบัญชี IG ธุรกิจ", "Instagram not connected — link an FB page with an IG business account"), href: "/admin/platform-accounts" })
                      : undefined}
                  postImages={postImages} selectedImages={platformImages[c.platform] ?? []} onToggleImage={(key) => togglePlatformImage(c.platform, key)} onSetMain={(key) => setPlatformMainImage(c.platform, key)} pushToast={pushToast}
                  pageName={(c.platform === "facebook" || c.platform === "instagram") ? (metaStatus.facebook?.page_name ?? brandLabel) : brandLabel} avatarUrl={brands.find((b) => b.id === brandId)?.logo_url ?? null} />)}
              </div>
            )}
          </div>
          </div>
        </div>

        <div className="border-t border-slate-200 px-6 py-4 shrink-0 flex items-center gap-2">
          <RowMenu up label={`⋯ ${t("เพิ่มเติม", "More")}`} items={[
            ...(!d.is_template ? [{ label: `💾 ${t("บันทึกเป็นเทมเพลต", "Save as template")}`, onClick: saveAsTemplate }] : []),
            { label: `🗑 ${t("ลบคอนเทนต์นี้", "Delete this content")}`, onClick: () => (onDelete ? onDelete(d) : setConfirmDel(true)) },
          ]} />
          <button onClick={requestClose} className="h-9 px-4 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 ml-auto">{t("ปิด", "Close")}</button>
          <button onClick={save} disabled={saving} style={{ background: btnBg(dth) }} className="h-9 px-5 text-sm font-medium text-white rounded-lg disabled:opacity-50">{saving ? t("กำลังบันทึก...", "Saving...") : t("บันทึก", "Save")}</button>
        </div>
      </DrawerShell>

      <ConfirmDialog open={!!platRemoveAsk} onClose={() => setPlatRemoveAsk(null)} variant="danger"
        onConfirm={() => { const p = platRemoveAsk; setPlatRemoveAsk(null); if (p && d) void applyPlatforms((d.platforms ?? []).filter((x) => x !== p)); }}
        title={t(`เอา ${platRemoveAsk ? platformLabel(platRemoveAsk) : ""} ออกจากคอนเทนต์นี้`, `Remove ${platRemoveAsk ? platformLabel(platRemoveAsk) : ""}`)}
        message={<span>{t("แพลตฟอร์มนี้มีแคปชั่น/สถานะโพสต์อยู่แล้ว — ถ้าเอาออก แคปชั่นที่เขียนไว้จะถูกลบด้วย (เพิ่มกลับได้ แต่ต้องเขียนใหม่)", "This platform already has a caption or post status — removing it deletes the caption (you can re-add, but will need to rewrite)")}</span>}
        confirmText={t("เอาออก", "Remove")} />
      <ConfirmDialog open={!!delAtt} onClose={() => setDelAtt(null)} onConfirm={async () => { if (!delAtt) return; const id = delAtt.id; setDelAtt(null); try { await onDelAttachment(id); pushToast("success", t("ลบไฟล์แล้ว", "File deleted")); } catch (e) { pushToast("error", (e as Error).message); } }}
        title={t("ลบไฟล์ออกจากคอนเทนต์", "Remove file")} message={<span>{t("ลบ", "Delete")} <span className="font-medium">{delAtt?.label}</span> {t("ออกจากคอนเทนต์นี้? (รูปจากงานไม่ได้รับผลกระทบ)", "from this content? (task images are unaffected)")}</span>} confirmText={t("ลบ", "Delete")} variant="danger" />
      {cfgOpen && <CaptionConfigModal cfg={capCfg} brandId={brandId} brandLabel={brandLabel} platforms={platforms} onClose={() => setCfgOpen(false)} onSaved={(v) => { setCapCfg(v); setCfgOpen(false); }} pushToast={pushToast} />}
      {tplSettingsOpen && <CaptionTemplateSettings brandId={brandId} brandLabel={brandLabel} onClose={() => setTplSettingsOpen(false)} onSaved={() => { setTplSettingsOpen(false); loadTemplates(); }} pushToast={pushToast} />}
      {psOpen && <PlatformSettingsModal platforms={platforms} templates={templates} settings={pset} onClose={() => setPsOpen(false)} onSaved={(v) => { setPset(v); mutateSWR(PLATFORM_SETTINGS_SWR_KEY, v); setPsOpen(false); }} pushToast={pushToast} />}
      {recOpen && <RecommendedTimesModal initial={recTimes} onClose={() => setRecOpen(false)} onSaved={(v) => { setRecTimes(v); setRecOpen(false); }} pushToast={pushToast} />}
      {hashOpen && <HashtagLibraryModal brandId={brandId} onClose={() => setHashOpen(false)} pushToast={pushToast} />}
      {/* ป๊อป AI เขียนแคปชั่น (ใส่คำสั่งเพิ่มได้) — เปิดจากปุ่มหัวคอลัมน์ หรือปุ่ม ✨ ของช่องใดช่องหนึ่ง */}
      {aiModal && (
        <AiCaptionModal
          platformLabels={aiModal.platforms.map((p) => platformLabel(p))}
          filledCount={aiModal.platforms.filter((p) => (caps.find((c) => c.platform === p)?.caption ?? "").trim()).length}
          busy={aiAllBusy}
          onClose={() => setAiModal(null)}
          onRun={(extra, overwrite) => aiWriteAll(aiModal.platforms, extra, overwrite)} />
      )}
      {postModal && (
        <PostConfirmModal
          platform={postModal.platform}
          connected={(postModal.platform === "facebook" && !!metaStatus.facebook?.connected) || (postModal.platform === "instagram" && !!metaStatus.instagram?.connected)}
          allowSchedule={postModal.platform === "facebook"}
          pageName={metaStatus.facebook?.page_name}
          captionText={postModal.captionText}
          images={postImages}
          defaultSelected={platformImages[postModal.platform]?.length ? platformImages[postModal.platform] : contentImageKeys}
          scheduledAtLocal={scheduledAt}
          format={platformFormats[postModal.platform]}
          busy={posting === postModal.platform}
          onClose={() => setPostModal(null)}
          onPublish={(keys, sched, fmt) => { setPlatformFormats((m) => { const n = { ...m }; if (fmt) n[postModal.platform] = fmt; else delete n[postModal.platform]; return n; }); runPublish(postModal.platform, postModal.captionText, keys, sched, fmt); }}
          onManual={() => manualPost(postModal.platform, postModal.captionText)}
        />
      )}
      {applyFrom && (
        <ERPModal open onClose={() => setApplyFrom(null)} size="sm" title={t("ใช้แคปชั่น/แฮชแท็กนี้กับแพลตฟอร์มอื่น", "Apply to other platforms")}>
          <div className="space-y-2">
            <p className="text-[11px] text-slate-400">{t("คัดลอกจาก", "Copy from")} <span className="font-medium text-slate-600">{platformLabel(applyFrom)}</span></p>
            <button onClick={() => applyCapToAll(applyFrom, "empty")} className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-sm">✅ {t("แทนแค่ช่องที่ยังว่าง", "Only empty fields")}<span className="block text-[11px] text-slate-400">{t("ปลอดภัยสุด — ไม่ทับที่มีข้อความแล้ว", "Safest — won't touch filled fields")}</span></button>
            <button onClick={() => applyCapToAll(applyFrom, "except_edited")} className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 hover:bg-violet-50 hover:border-violet-300 text-sm">✍️ {t("แทนทุกอัน ยกเว้นอันที่แก้เอง", "All except manually edited")}<span className="block text-[11px] text-slate-400">{t("ทับค่าจากแม่แบบ/อัตโนมัติ แต่เก็บที่พิมพ์เอง", "Overwrite auto/template values, keep your edits")}</span></button>
            <button onClick={() => applyCapToAll(applyFrom, "all")} className="w-full text-left px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-sm">⚠️ {t("แทนทุกอัน", "Replace all")}<span className="block text-[11px] text-red-400">{t("ทับทุกช่อง รวมที่กรอกไว้แล้ว", "Overwrites everything, including filled")}</span></button>
            <div className="flex justify-end pt-1"><button onClick={() => setApplyFrom(null)} className="h-9 px-4 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{t("ยกเลิก", "Cancel")}</button></div>
          </div>
        </ERPModal>
      )}
      {pullTo && <PullCaptionModal target={pullTo} caps={caps} settings={pset} onClose={() => setPullTo(null)} onApply={(from, opts) => pullCaption(pullTo, from, opts)} />}
      <ImageLightbox images={lbImages.map((im) => ({ url: r2ImageUrl(im.key, 1600) ?? "", label: im.label }))} index={tmLb} onClose={() => setTmLb(-1)} onIndex={setTmLb} />
      {/* แก้สินค้าใน drawer แล้ว → โหลดราคา/สี/รูปใหม่ทั้งตอนบันทึกและตอนปิด (เผื่อแก้ SKU ลูกใน drawer ซ้อน) */}
      {openParentId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={openParentId} onClose={() => { setOpenParentId(null); void reloadProduct(); }} onChanged={() => void reloadProduct()} />}
      <ConfirmDialog open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={doDelete}
        title={t("ลบคอนเทนต์", "Delete Content")} message={<span>{t("ต้องการลบ", "Delete")} <span className="font-semibold">{d.title}</span> {t("ใช่ไหม? (ลบแล้วกู้คืนไม่ได้)", "? (cannot be undone)")}</span>} confirmText={deleting ? "..." : t("ลบ", "Delete")} variant="danger" />
    </>
  );
}
