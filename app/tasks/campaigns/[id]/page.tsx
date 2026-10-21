"use client";

// ============================================================
// Campaign Canvas -- กระดาน Excalidraw ของแคมเปญ (ของกลาง CanvasSketch)
// กดการ์ดแคมเปญ → เข้าหน้านี้ · ปุ่ม "รายละเอียด" เปิด CampaignDrawer · ปุ่ม Section = Frame
// เฟส 1: โครงหลัก (วาด + Section) -- SKU Card / Task Card มาเฟสถัดไป
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useT, useLang } from "@/components/i18n";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { StandaloneShell } from "@/components/standalone-shell";
import { apiFetch } from "@/lib/api";
import { suppressUnload } from "@/lib/canvas-unload-guard";
import { ERPModal } from "@/components/modal";
import { ERPInput, ERPDateTime24 } from "@/components/form";
import { useAuth, usePermission } from "@/components/auth";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { buildStatusMeta, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import { GifPokeLayer } from "../../gif-poke-layer";
import type { SkuPickerValue } from "@/components/pickers";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import { CAMPAIGN_STATUS } from "../campaign-status";
import type { CreatedTask } from "../../create-task-modal";
import { applyTaskTransition } from "../../task-actions";
import { TASKS_SETTINGS_PERM } from "@/lib/creative-perms";
import { useCreativeOptions } from "../../use-options";
import { getCampaign, updateCampaign, deleteTask, createContent, getContent, listBrands, listSubtasks, POST_TYPES, type CampaignDetail, type CreativeTask, type BrandOption } from "../../data";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow } from "@/app/api/assets/shared";
import { withImageWidth, r2ImageUrl } from "@/lib/r2-image";
import { TableDrawer } from "../../table-drawer";
import { usePushToast } from "@/components/toast";
import { skuCardSkeleton, parentSkuCardSkeleton, marketingSkuCardSkeleton, designSheetCardSkeleton, trendCardSkeleton, assetCardSkeleton, contentCardSkeleton, perPlatformCardSkeleton, folderCardSkeleton, tableCardSkeleton, taskCardSkeleton, type ParentSkuVal, type MktSkuVal, type MktFieldKey, MKT_FIELDS_ALL, tt, type DsCardInfo, dsCardText, DS_CARD_STROKE, type TrendCardInfo, trendCardText, type AssetFieldKey, contentCardText, perPlatformCardText, MKT_FIELD_OPTS, postStatusStyle } from "./card-skeletons";
import { ParentSkuMultiPick, MarketingSkuMultiPick, SkuMultiPick, DesignSheetMultiPick, BigTagPick } from "./multi-picks";
import { AssetCardDrawer, SkuDrawer, CardsSummary, ToolMenu } from "./card-drawers";

// โหลดของกลาง Excalidraw แบบ dynamic -- ไม่ดึงเข้า server bundle (กัน Worker เกินขนาด)
const CanvasSketch = dynamic(() => import("@/components/canvas-sketch").then((m) => m.CanvasSketch), {
  ssr: false,
  loading: () => <div className="h-[70vh] flex items-center justify-center text-slate-400 text-sm border border-slate-200 rounded-xl">Loading canvas...</div>,
});
const KnowledgeDrawer = dynamic(() => import("../../knowledge-drawer").then((m) => m.KnowledgeDrawer), { ssr: false });
// drawer/ป๊อปที่มีตัวพิมพ์ข้อความ (rich text) — โหลดเมื่อเปิดใช้จริง ไม่ถ่วงการเปิดหน้า
const CampaignDrawer = dynamic(() => import("../campaign-drawer").then((m) => m.CampaignDrawer), { ssr: false });
const CreateTaskModal = dynamic(() => import("../../create-task-modal").then((m) => m.CreateTaskModal), { ssr: false });
const TaskDetailDrawer = dynamic(() => import("../../task-detail-drawer").then((m) => m.TaskDetailDrawer), { ssr: false });
const ContentDrawer = dynamic(() => import("../../content/content-drawer").then((m) => m.ContentDrawer), { ssr: false });
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
// ป๊อปอัปใบงานออกแบบ = ของกลางตัวเดียวกับที่ Design Dashboard ใช้ (ดู/แก้/เปลี่ยนสถานะ/สร้างใหม่) — โหลดเฉพาะตอนใช้
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });

// โซนสำเร็จรูปสำหรับกระดานแคมเปญ
const sectionPresets = (): string[] => [tt("ไอเดีย (Brainstorming)", "Brainstorming"), "Reference", tt("ข้อมูล (Information)", "Information"), tt("สินค้าใน Campaign", "Products in Campaign"), tt("งาน (Tasks)", "Tasks")];
async function fetchTrends(ids: string[]): Promise<Map<string, TrendCardInfo>> {
  const map = new Map<string, TrendCardInfo>();
  if (!ids.length) return map;
  try {
    const r = await apiFetch(`/api/creative-trends?ids=${encodeURIComponent(ids.join(","))}`);
    const j = await r.json();
    for (const row of ((j.data ?? []) as TrendCardInfo[])) map.set(row.id, row);
  } catch { /* โหลดไม่ได้ = ปล่อยการ์ดเดิมไว้ */ }
  return map;
}

// ดึงใบงานตาม id ทีเดียว (ใช้ทั้งตอนซิงค์การ์ด และตอนรับ ?add_design_sheets= จาก Design Dashboard)
async function fetchDesignSheets(ids: string[]): Promise<Map<string, DesignSheetListItem>> {
  const map = new Map<string, DesignSheetListItem>();
  if (!ids.length) return map;
  try {
    const r = await apiFetch(`/api/design-sheets?ids=${encodeURIComponent(ids.join(","))}&limit=200`);
    const j = await r.json();
    for (const row of ((j.data ?? []) as DesignSheetListItem[])) map.set(row.id, row);
  } catch { /* โหลดไม่ได้ = ปล่อยการ์ดเดิมไว้ */ }
  return map;
}
const ASSET_FIELD_OPTS: { key: AssetFieldKey; labelTh: string; labelEn: string }[] = [
  { key: "title", labelTh: "ชื่อไฟล์", labelEn: "Name" },
  { key: "location", labelTh: "ที่เก็บต้นฉบับ (location)", labelEn: "Source location" },
  { key: "link", labelTh: "ลิงก์เปิดไฟล์", labelEn: "File link" },
  { key: "tags", labelTh: "แท็ก", labelEn: "Tags" },
  { key: "size", labelTh: "ขนาดรูป", labelEn: "Dimensions" },
  { key: "description", labelTh: "คำอธิบาย", labelEn: "Description" },
];

export default function CampaignCanvasPage() {
  const t = useT();
  const id = String(useParams().id);
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // ฝังอยู่ใน iframe ของแอปเดี่ยว (/app/tasks) จะ "ไม่มีหัวบาร์ 56px" → ต้องลดระยะ sticky ของแถบบน
  // ไม่งั้น sticky ที่ตั้ง top เผื่อหัวบาร์ไว้จะถูกดันลงมาทับแถบเครื่องมือกระดาน (toolbox "จม")
  const [embed, setEmbed] = useState(false);
  useEffect(() => {
    try {
      const inFrame = window.self !== window.top;
      const urlEmbed = new URLSearchParams(window.location.search).get("embed") === "1";
      setEmbed(urlEmbed || (inFrame && sessionStorage.getItem("erp_shell_embed") === "1"));
    } catch { /* ignore */ }
  }, []);
  const [boardKey, setBoardKey] = useState(0); // เปลี่ยนเพื่อรีโหลดกระดานล่าสุด (แทน F5 ที่เด้งหน้าแรก)
  // หมายเหตุ: ความสูงกระดานจัดการโดย CanvasSketch เอง (autoH — วัดพื้นที่ที่เหลือให้พอดีจอ)
  // ค่า height ที่ส่งไปเป็นแค่ค่าตั้งต้นก่อน autoH วัดเสร็จ · อย่าวัดซ้ำที่หน้านี้ (จะตีกัน)
  const [refreshing, setRefreshing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [skuOpen, setSkuOpen] = useState(false);
  const [skuSel, setSkuSel] = useState<SkuPickerValue[]>([]); // SKU ที่เลือก (หลายอัน)
  const [skuView, setSkuView] = useState<Record<string, unknown> | null>(null); // การ์ด SKU ที่กดดู
  const [taskOpen, setTaskOpen] = useState(false);   // modal สร้างงาน
  const [taskView, setTaskView] = useState<Record<string, unknown> | null>(null); // การ์ดงานที่กดดู
  const [cardsOpen, setCardsOpen] = useState(false); // ป๊อปอัปสรุปการ์ด
  const [cards, setCards] = useState<{ kind: string; data: Record<string, unknown> }[]>([]);
  const [sectionOpen, setSectionOpen] = useState(false); // ป๊อปอัปเลือก Section
  const [sectionName, setSectionName] = useState("");
  const [contentOpen, setContentOpen] = useState(false); // modal สร้างคอนเทนต์
  const [cForm, setCForm] = useState({ title: "", post_type: "image", platforms: [] as string[], scheduled_at: "", cardMode: "combined" as "combined" | "per_platform" });
  const [contentView, setContentView] = useState<Record<string, unknown> | null>(null); // การ์ดคอนเทนต์ที่กดดู
  const [tableView, setTableView] = useState<Record<string, unknown> | null>(null); // การ์ดตารางที่กดดู (เปิดสเปรดชีต)
  const [folderOpen, setFolderOpen] = useState(false); // modal การ์ดโฟลเดอร์
  const [fForm, setFForm] = useState({ label: "", path: "" });
  const [parentOpen, setParentOpen] = useState(false);  // modal การ์ด Parent SKU
  const [parentSel, setParentSel] = useState<ParentSkuVal[]>([]);
  const [mktOpen, setMktOpen] = useState(false);        // modal การ์ด SKU การตลาด
  const [mktSel, setMktSel] = useState<MktSkuVal[]>([]);
  const [mktOptOpen, setMktOptOpen] = useState(false);  // กล่องเลือกรายละเอียดที่จะโชว์บนการ์ด (หลังเลือกรุ่น)
  const [mktFields, setMktFields] = useState<MktFieldKey[]>(MKT_FIELDS_ALL);
  useEffect(() => {   // จำค่าที่เคยติ๊กไว้ (รายคน)
    apiFetch("/api/user-prefs?key=campaign_mkt_card_fields").then((r) => r.json())
      .then((j) => { const v = j?.value; if (Array.isArray(v) && v.length) setMktFields(v.filter((k: unknown): k is MktFieldKey => MKT_FIELDS_ALL.includes(k as MktFieldKey))); })
      .catch(() => {});
  }, []);
  const toggleMktField = (k: MktFieldKey) => setMktFields((f) => {
    const next = f.includes(k) ? f.filter((x) => x !== k) : [...f, k];
    void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "campaign_mkt_card_fields", value: next }) }).catch(() => {});
    return next;
  });
  // โหมดเลือกแบบ "การ์ดใหญ่ ตามแท็ก" (ของกลาง SkuTagBrowser) — จำค่าไว้ต่อคน
  const [bigPick, setBigPick] = useState(false);
  useEffect(() => { try { setBigPick(localStorage.getItem("campaign-bigpick") === "1"); } catch { /* ignore */ } }, []);
  const toggleBigPick = () => setBigPick((v) => { const n = !v; try { localStorage.setItem("campaign-bigpick", n ? "1" : "0"); } catch { /* ignore */ } return n; });
  // กดการ์ดในโหมดการ์ดใหญ่ → สลับเลือก/เอาออก (สะสมไว้ แล้วกด "เพิ่มการ์ด" ทีเดียว)
  const toggleParentPick = (r: { id: string; code?: string; name?: string; image?: string | null }) =>
    setParentSel((prev) => prev.some((x) => x.id === r.id) ? prev.filter((x) => x.id !== r.id)
      : [...prev, { id: r.id, code: r.code ?? "", name: r.name ?? "", image_url: r.image ?? null }]);
  const toggleSkuPick = (r: { id: string; code?: string; name?: string; image?: string | null }) =>
    setSkuSel((prev) => prev.some((x) => x.id === r.id) ? prev.filter((x) => x.id !== r.id)
      : [...prev, { id: r.id, code: r.code ?? "", name: r.name ?? "", image_url: r.image ?? null } as SkuPickerValue]);
  const [parentRecId, setParentRecId] = useState<string | null>(null); // ดับเบิลคลิกการ์ด Parent SKU → ตัวแก้สินค้ากลาง
  // ── การ์ดใบงานออกแบบ (เชื่อมกับ Design Dashboard) ──
  const canDesign = usePermission("products.view");
  const [dsPickOpen, setDsPickOpen] = useState(false);        // ป๊อปอัปเลือกใบงาน
  const [trendOpen, setTrendOpen] = useState(false);          // ป๊อปอัปเลือกเทรนด์ (บอร์ดเทรนด์ → การ์ดบนกระดาน)
  const [trendList, setTrendList] = useState<TrendCardInfo[] | null>(null);
  const [trendSel, setTrendSel] = useState<string[]>([]);
  const [trendQ, setTrendQ] = useState("");
  const [dsSel, setDsSel] = useState<DesignSheetListItem[]>([]);
  const [dsViewId, setDsViewId] = useState<string | null>(null);   // ดับเบิลคลิกการ์ด → เปิดป๊อปอัปใบงาน
  const [dsCreate, setDsCreate] = useState(false);                 // สร้างใบงานใหม่จากบนกระดาน
  const [dsMeta, setDsMeta] = useState<StatusMeta>(() => buildStatusMeta(null));
  const dsMetaRef = useRef<StatusMeta>(dsMeta);
  useEffect(() => { dsMetaRef.current = dsMeta; }, [dsMeta]);
  useEffect(() => {
    if (!canDesign) return;
    apiFetch("/api/design-sheets/statuses").then((r) => r.json())
      .then((j) => { if (Array.isArray(j?.data)) setDsMeta(buildStatusMeta(j.data as WfStatusRow[])); }).catch(() => {});
  }, [canDesign]);
  const dsLabel = useCallback((status?: string | null) => (status ? (dsMetaRef.current.map[status]?.label ?? status) : null), []);
  const dsColor = useCallback((status?: string | null) => (status ? (dsMetaRef.current.colorHex[status] ?? DS_CARD_STROKE) : DS_CARD_STROKE), []);

  const [knowledgeOpen, setKnowledgeOpen] = useState(false); // คลังความรู้
  const [assetOpen, setAssetOpen] = useState(false);     // AssetPicker เลือกรูปจากคลังกลาง
  const [assetSel, setAssetSel] = useState<AssetRow[]>([]); // รูปที่เลือกไว้รอวาง
  const [assetFields, setAssetFields] = useState<AssetFieldKey[]>(["title"]); // ติ๊กว่าจะดึงข้อมูลอะไรมาด้วย
  const [assetOptOpen, setAssetOptOpen] = useState(false);  // กล่องเลือกข้อมูลที่จะดึง (หลังเลือกรูป)
  const [assetView, setAssetView] = useState<Record<string, unknown> | null>(null); // การ์ดรูปที่กดดู
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const { platforms: platformOpts } = useCreativeOptions();
  const { user, can } = useAuth();
  const [fs, setFs] = useState(false); // เต็มจอ
  const sketchRef = useRef<CanvasSketchControls | null>(null);
  const pushToast = usePushToast();   // แจ้งเตือนผ่าน toast กลาง (components/toast)

  const load = useCallback(async () => { try { setDetail(await getCampaign(id)); } catch (e) { setErr((e as Error).message); } }, [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { listBrands().then(setBrands).catch(() => {}); }, []);
  useEffect(() => { const h = () => setFs(!!document.fullscreenElement); document.addEventListener("fullscreenchange", h); return () => document.removeEventListener("fullscreenchange", h); }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); };
  // รีโหลดกระดานล่าสุด (เซฟของเราก่อน → remount กระดาน → ดึง scene ใหม่) โดยไม่ต้อง F5 ที่เด้งหน้าแรก
  const refreshBoard = useCallback(async () => {
    setRefreshing(true);
    try { await sketchRef.current?.save?.(); } catch { /* เซฟ best-effort */ }
    await load();
    setBoardKey((k) => k + 1);
    setTimeout(() => setRefreshing(false), 400);
  }, [load]);

  const setStatus = async (status: string) => { try { await updateCampaign(id, { status }); await load(); } catch (e) { pushToast("error", (e as Error).message); } };

  // Section = Frame ของ Excalidraw (อยู่ข้างหลัง, เปลี่ยนชื่อ/ย่อขยายที่ตัวมันเอง, ลากของเข้าไปแล้วเลื่อนตามกัน)
  const insertSection = (name: string) => {
    if (!sketchRef.current) { pushToast("info", t("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง", "Canvas not ready, please try again")); return; }
    void sketchRef.current.insert([{ type: "frame", children: [], name: name.trim() || t("โซนใหม่", "New section"), x: 0, y: 0, width: 560, height: 400 }]);
    setSectionOpen(false); setSectionName("");
  };
  const confirmSku = () => {
    if (!skuSel.length || !sketchRef.current) return;
    // วางหลายใบเรียงข้างกันในครั้งเดียว (เลื่อน x ต่อใบ)
    const all: Record<string, unknown>[] = [];
    skuSel.forEach((s, i) => { const dx = i * 270; for (const el of skuCardSkeleton(s)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    setSkuOpen(false); setSkuSel([]);
  };
  const confirmParent = () => {
    if (!parentSel.length || !sketchRef.current) return;
    const all: Record<string, unknown>[] = [];
    parentSel.forEach((s, i) => { const dx = i * 270; for (const el of parentSkuCardSkeleton(s)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    setParentOpen(false); setParentSel([]);
  };
  // เลือกรุ่นเสร็จ → ถามว่าจะโชว์รายละเอียดอะไรบนการ์ด (จำค่าไว้ ครั้งหน้ากดวางได้เลย)
  const confirmMkt = () => { if (!mktSel.length) return; setMktOpen(false); setMktOptOpen(true); };
  const placeMktCards = () => {
    if (!mktSel.length || !sketchRef.current) return;
    const all: Record<string, unknown>[] = [];
    mktSel.forEach((s, i) => { const dx = i * 270; for (const el of marketingSkuCardSkeleton(s, mktFields)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    const n = mktSel.length;
    setMktOptOpen(false); setMktSel([]);
    pushToast("success", t(`วางการ์ด SKU การตลาด ${n} ใบแล้ว`, `Placed ${n} marketing SKU card(s)`));
  };
  // เลือกรูปจากคลังเสร็จ → เด้งกล่องถามว่าจะดึงข้อมูลอะไรมาด้วย
  const onAssetPicked = (assets: AssetRow[]) => { setAssetSel(assets); setAssetOpen(false); setAssetOptOpen(true); };
  const toggleAssetField = (k: AssetFieldKey) => setAssetFields((f) => f.includes(k) ? f.filter((x) => x !== k) : [...f, k]);
  const confirmAssets = () => {
    if (!assetSel.length || !sketchRef.current) return;
    const all: Record<string, unknown>[] = [];
    assetSel.forEach((a, i) => { const dx = i * 250; for (const el of assetCardSkeleton(a, assetFields)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    const n = assetSel.length;
    setAssetOptOpen(false); setAssetSel([]);
    pushToast("success", t(`วางการ์ดรูป ${n} รูปแล้ว`, `Placed ${n} image card(s)`));
  };
  // วางการ์ดใบงานออกแบบ (ข้ามใบที่มีการ์ดอยู่แล้ว กันซ้ำ) — ใช้ทั้งจากป๊อปอัปเลือก และจาก Design Dashboard
  const placeDesignSheetCards = useCallback((sheets: DsCardInfo[]) => {
    if (!sketchRef.current || !sheets.length) return 0;
    const onBoard = new Set((sketchRef.current.listCards() ?? []).filter((c) => c.kind === "design_sheet").map((c) => String(c.data.id)));
    const fresh = sheets.filter((s) => !onBoard.has(s.id));
    if (!fresh.length) return 0;
    const all: Record<string, unknown>[] = [];
    fresh.forEach((s, i) => { const dx = i * 280; for (const el of designSheetCardSkeleton(s, dsLabel(s.status), dsColor(s.status))) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    return fresh.length;
  }, [dsLabel, dsColor]);
  const confirmDesignSheets = () => {
    const n = placeDesignSheetCards(dsSel);
    setDsPickOpen(false); setDsSel([]);
    pushToast(n ? "success" : "info", n
      ? t(`วางการ์ดใบงาน ${n} ใบแล้ว`, `Placed ${n} design sheet card(s)`)
      : t("ใบงานที่เลือกอยู่บนกระดานแล้ว", "Selected sheets are already on the board"));
  };
  const onTaskCreated = (tk: CreatedTask) => { sketchRef.current?.insert(taskCardSkeleton(tk)); pushToast("success", t(`สร้างงาน ${tk.task_no} + วางการ์ดแล้ว`, `Created task ${tk.task_no} and placed card`)); };
  const createContentCard = async () => {
    if (!cForm.title.trim()) { pushToast("error", t("กรุณาใส่ชื่อคอนเทนต์", "Please enter a content title")); return; }
    try {
      const { id: cid, content_no } = await createContent({ title: cForm.title.trim(), campaign_id: id, post_type: cForm.post_type, platforms: cForm.platforms, scheduled_at: cForm.scheduled_at || null, status: "draft" });
      const base = { id: cid, content_no, title: cForm.title.trim(), status: "draft" };
      if (cForm.cardMode === "per_platform" && cForm.platforms.length) {
        // วาง 1 การ์ด/แพลตฟอร์ม (เรียงแนวนอน) — ผูก content เดียวกัน
        const all: Record<string, unknown>[] = [];
        cForm.platforms.forEach((p, i) => { const dx = i * 270; for (const el of perPlatformCardSkeleton(base, p)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
        sketchRef.current?.insert(all);
      } else {
        sketchRef.current?.insert(contentCardSkeleton({ ...base, platforms: cForm.platforms, scheduled_at: cForm.scheduled_at || null }));
      }
      setContentOpen(false); setCForm({ title: "", post_type: "image", platforms: [], scheduled_at: "", cardMode: "combined" });
      pushToast("success", t(`สร้างคอนเทนต์ ${content_no} + วางการ์ดแล้ว`, `Created content ${content_no} and placed card`));
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // วางการ์ดโฟลเดอร์ (เก็บ path) บนกระดาน
  const addFolderCard = () => {
    const path = fForm.path.trim();
    if (!path) { pushToast("error", t("กรุณาใส่ path โฟลเดอร์", "Please enter a folder path")); return; }
    const label = fForm.label.trim() || path.split(/[\\/]/).filter(Boolean).pop() || "โฟลเดอร์";
    sketchRef.current?.insert(folderCardSkeleton({ path, label }));
    setFolderOpen(false); setFForm({ label: "", path: "" });
    pushToast("success", t("วางการ์ดโฟลเดอร์แล้ว", "Folder card placed"));
  };
  // เปิดโฟลเดอร์: ลองผ่าน custom protocol (ลง .reg แล้วเปิด File Explorer ทันที) + คัดลอก path เป็น fallback
  const openFolder = useCallback((path: string) => {
    if (!path) return;
    navigator.clipboard?.writeText(path).catch(() => {});
    // กันกระดานเด้ง "Leave site?" (beforeunload) ชั่วคราว — การยิง protocol ทำให้ Chrome เรียก
    // beforeunload ทั้งที่หน้าไม่ได้ออกจริง · ใช้ erpfolder: (ไม่มี //) แบบ mailto: กัน host เพี้ยน
    suppressUnload();
    try { window.location.href = "erpfolder:" + encodeURIComponent(path); } catch { /* ไม่มี handler ก็ข้าม */ }
    pushToast("info", t("กำลังเปิดโฟลเดอร์... ถ้าไม่เปิด: ลง .reg แล้ว 'ปิด-เปิดเบราว์เซอร์ใหม่' 1 ครั้ง (ระหว่างนี้ path คัดลอกให้แล้ว วางใน File Explorer ได้)", "Opening folder... if nothing happens: install .reg then restart the browser once (path copied as fallback)"));
  }, [pushToast, t]);
  // คลิกการ์ดบนกระดาน → เปิด drawer ตามชนิด · การ์ดโฟลเดอร์ = เปิดโฟลเดอร์
  const onCardOpen = useCallback((data: Record<string, unknown>) => { if (data.kind === "sku") setSkuView(data); else if (data.kind === "task") setTaskView(data); else if (data.kind === "content") setContentView(data); else if (data.kind === "parent_sku" || data.kind === "marketing_sku") setParentRecId(String(data.id ?? "")); else if (data.kind === "folder") openFolder(String(data.path ?? "")); else if (data.kind === "asset") setAssetView(data); else if (data.kind === "table") setTableView(data); else if (data.kind === "design_sheet") setDsViewId(String(data.id ?? "")); else if (data.kind === "trend") window.open(`/tasks/trends/${encodeURIComponent(String(data.id ?? ""))}`, "_blank", "noopener"); }, [openFolder]);
  // สร้างตารางคำนวณใหม่ → วางการ์ดบนกระดาน
  const createTableCard = async () => {
    try {
      const j = await apiFetch("/api/canvas-tables", { method: "POST", body: JSON.stringify({}) }).then((r) => r.json());
      if (j.error) { pushToast("error", j.error); return; }
      sketchRef.current?.insert(tableCardSkeleton({ id: j.id, title: j.title, data: j.data }));
      pushToast("success", t("วางตารางคำนวณแล้ว — ดับเบิลคลิกเพื่อกรอก/ใส่สูตร", "Table placed — double-click to edit / add formulas"));
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // workflow/ลบงาน สำหรับ TaskDetailDrawer เต็มบน canvas
  const moveTask = useCallback(async (task: CreativeTask, toKey: string) => { await applyTaskTransition(task, toKey, { pushToast }); }, [pushToast]);
  const removeTask = useCallback(async (tid: string) => { try { await deleteTask(tid); pushToast("info", t("ลบงานแล้ว", "Task deleted")); setTaskView(null); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast, t]);
  const openCards = () => { setCards(sketchRef.current?.listCards() ?? []); setCardsOpen(true); };

  // ⑦ ลากงานที่มีอยู่แล้วในแคมเปญ → วางบนกระดาน (เป็นการ์ดงาน)
  const [dragPanelOpen, setDragPanelOpen] = useState(false);
  const [boardTaskIds, setBoardTaskIds] = useState<Set<string>>(new Set());
  const refreshBoardIds = useCallback(() => {
    const ids = (sketchRef.current?.listCards() ?? []).filter((c) => c.kind === "task").map((c) => String(c.data.id));
    setBoardTaskIds(new Set(ids));
  }, []);
  const openDragPanel = () => { refreshBoardIds(); setDragPanelOpen(true); };
  const placeTaskCard = useCallback(async (task: CreativeTask) => {
    if (!sketchRef.current) { pushToast("info", t("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง", "Canvas not ready, please try again")); return; }
    const subs = await listSubtasks(task.id).catch(() => []);
    sketchRef.current.insert(taskCardSkeleton({ id: task.id, task_no: task.task_no ?? "", title: task.title, subtasks: subs.map((s) => ({ title: s.title })) }));
    setBoardTaskIds((prev) => new Set(prev).add(task.id));
    pushToast("success", t(`วางการ์ดงาน ${task.task_no} แล้ว`, `Task card ${task.task_no} placed`));
  }, [pushToast, t]);
  const onCanvasDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const tid = e.dataTransfer.getData("text/task-id"); if (!tid) return;
    const found = detail?.tasks.find((x) => x.id === tid); if (found) placeTaskCard(found);
  }, [detail, placeTaskCard]);

  // ② ซิงค์งานย่อยสดบนการ์ดงานเมื่อเปิดกระดาน (การ์ดเก็บ snapshot -- อัปเดตให้ตรงปัจจุบัน)
  const syncTaskCards = useCallback(() => {
    sketchRef.current?.refreshCards(async ({ kind, id, data }) => {
      if (kind !== "task" || !id) return null;
      const subs = await listSubtasks(id);
      const shown = subs.slice(0, 6);
      const subLines = subs.length
        ? shown.map((s) => `${(s.status === "approved" || s.status === "posted" || s.status === "done") ? "☑" : "☐"} ${s.title}`).join("\n") + (subs.length > 6 ? `\n… ${tt("อีก", "+")} ${subs.length - 6}` : "")
        : `— ${tt("ยังไม่มีงานย่อย", "No subtasks yet")} —`;
      const text = `✅ ${data.title ?? ""}\n${data.task_no ?? ""}\n\n${tt("งานย่อย", "Subtasks")} (${subs.length})\n${subLines}`;
      return { text, data: { subtasks: subs.map((s) => ({ title: s.title })) } };
    });
  }, []);
  // ③ ซิงค์การ์ดคอนเทนต์ (ข้อความ: แคปชั่นย่อ/เวลาโพสต์/สถานะ) — สะท้อนการแก้ใน Drawer
  const syncContentCards = useCallback(() => {
    sketchRef.current?.refreshCards(async ({ kind, id, data }) => {
      if (kind !== "content" || !id) return null;
      try {
        const c = await getContent(id);
        const cover = c.cover_image_url ?? null;   // รูปหน้าปก (สื่อแนบ/SKU/งาน) — โผล่บนการ์ด + อัปเดตเมื่อแนบรูปทีหลัง
        const plat = data.platform as string | undefined;
        if (plat) {
          const cap = c.captions.find((x) => x.platform === plat)?.caption ?? null;
          // รูปที่เลือกของแพลตฟอร์มนี้ (เรียง: [0]=รูปใหญ่, ที่เหลือ=รูปเล็กแถวล่าง) · ไม่เลือก = [] → เอารูปออก
          const images = (c.platform_images?.[plat] ?? []).map((k) => r2ImageUrl(k, 480)).filter(Boolean) as string[];
          const ps = c.post_status?.[plat] ?? null;   // สถานะโพสต์ต่อแพลตฟอร์ม → โชว์เด่น + สีขอบ
          return { text: perPlatformCardText({ content_no: c.content_no, title: c.title, status: c.status }, plat, cap, ps), data: { title: c.title, platform: plat }, images, stroke: postStatusStyle(ps).stroke };
        }
        return { text: contentCardText({ content_no: c.content_no, title: c.title, platforms: c.platforms ?? [], status: c.status, scheduled_at: c.scheduled_at, caption: c.captions[0]?.caption ?? null }), data: { title: c.title, platforms: c.platforms ?? [] }, imageUrl: cover };
      } catch { return null; }
    });
  }, []);
  // ④ ซิงค์การ์ดใบงานออกแบบ (ชื่อ/สถานะ/กำหนดส่ง/รูปหน้าปก + สีขอบตามสถานะ) — ยิงครั้งเดียวด้วย ?ids=
  const syncDesignSheetCards = useCallback(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const ids = (ctrl.listCards() ?? []).filter((c) => c.kind === "design_sheet").map((c) => String(c.data.id)).filter(Boolean);
    if (!ids.length) return;
    const map = await fetchDesignSheets(ids);
    if (!map.size) return;
    await ctrl.refreshCards(async ({ kind, id }) => {
      if (kind !== "design_sheet" || !id) return null;
      const s = map.get(id); if (!s) return null;
      return {
        text: dsCardText(s, dsLabel(s.status)),
        data: { code: s.code, name: s.name, brand_name: s.brand_name, status: s.status },
        imageUrl: s.cover_url ? (withImageWidth(s.cover_url, 480) ?? s.cover_url) : null,
        stroke: dsColor(s.status),
      };
    });
  }, [dsLabel, dsColor]);

  // ⑤ ซิงค์การ์ดเทรนด์ (รูปหน้าเทรนด์ + % ความครบของเช็คลิสต์)
  const syncTrendCards = useCallback(async () => {
    const ctrl = sketchRef.current; if (!ctrl) return;
    const ids = (ctrl.listCards() ?? []).filter((c) => c.kind === "trend").map((c) => String(c.data.id)).filter(Boolean);
    if (!ids.length) return;
    const map = await fetchTrends(ids);
    if (!map.size) return;
    await ctrl.refreshCards(async ({ kind, id: tid }) => {
      if (kind !== "trend" || !tid) return null;
      const x = map.get(tid); if (!x) return null;
      return {
        text: trendCardText(x),
        data: { title: x.title, heat: x.heat ?? null },
        imageUrl: x.cover_url ? (withImageWidth(x.cover_url, 560) ?? x.cover_url) : null,
      };
    });
  }, []);
  // วางการ์ดเทรนด์ (ข้ามตัวที่มีอยู่แล้ว กันซ้ำ)
  const placeTrendCards = useCallback((trends: TrendCardInfo[]) => {
    if (!sketchRef.current || !trends.length) return 0;
    const onBoard = new Set((sketchRef.current.listCards() ?? []).filter((c) => c.kind === "trend").map((c) => String(c.data.id)));
    const fresh = trends.filter((x) => !onBoard.has(x.id));
    if (!fresh.length) return 0;
    const all: Record<string, unknown>[] = [];
    fresh.forEach((x, i) => { const dx = i * 300; for (const el of trendCardSkeleton(x)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
    void sketchRef.current.insert(all);
    return fresh.length;
  }, []);

  // เปิดป๊อปเทรนด์ → โหลดรายการทั้งหมด (ครั้งแรกครั้งเดียว)
  useEffect(() => {
    if (!trendOpen || trendList !== null) return;
    let alive = true;
    apiFetch("/api/creative-trends").then((r) => r.json())
      .then((j) => { if (alive) setTrendList((j.data ?? []) as TrendCardInfo[]); })
      .catch(() => { if (alive) setTrendList([]); });
    return () => { alive = false; };
  }, [trendOpen, trendList]);

  const confirmTrends = () => {
    const rows = (trendList ?? []).filter((x) => trendSel.includes(x.id));
    const n = placeTrendCards(rows);
    setTrendOpen(false); setTrendSel([]);
    pushToast(n ? "success" : "info", n
      ? t(`วางการ์ดเทรนด์ ${n} ใบแล้ว`, `Placed ${n} trend card(s)`)
      : t("เทรนด์ที่เลือกอยู่บนกระดานแล้ว", "Selected trends are already on the board"));
  };

  // รับใบงาน/เทรนด์ที่ส่งมา (?add_design_sheets=id,id · ?add_trends=id,id) → วางการ์ดตอนกระดานพร้อม แล้วล้าง param ออกจาก URL
  const pendingDsRef = useRef<string[]>([]);
  const pendingTrendRef = useRef<string[]>([]);
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const raw = sp.get("add_design_sheets");
      const rawT = sp.get("add_trends");
      if (!raw && !rawT) return;
      if (raw) { pendingDsRef.current = raw.split(",").map((s) => s.trim()).filter(Boolean); sp.delete("add_design_sheets"); }
      if (rawT) { pendingTrendRef.current = rawT.split(",").map((s) => s.trim()).filter(Boolean); sp.delete("add_trends"); }
      window.history.replaceState(null, "", window.location.pathname + (sp.toString() ? `?${sp.toString()}` : ""));
    } catch { /* ignore */ }
  }, []);
  const placePendingTrends = useCallback(async () => {
    const ids = pendingTrendRef.current; if (!ids.length) return;
    pendingTrendRef.current = [];
    const map = await fetchTrends(ids);
    const rows = ids.map((i) => map.get(i)).filter(Boolean) as TrendCardInfo[];
    const n = placeTrendCards(rows);
    if (n) pushToast("success", t(`วางการ์ดเทรนด์ ${n} ใบแล้ว`, `Placed ${n} trend card(s)`));
    else if (rows.length) pushToast("info", t("เทรนด์ที่ส่งมาอยู่บนกระดานแล้ว", "Those trends are already on the board"));
  }, [placeTrendCards, pushToast, t]);
  const placePendingDesignSheets = useCallback(async () => {
    const ids = pendingDsRef.current; if (!ids.length) return;
    pendingDsRef.current = [];
    const map = await fetchDesignSheets(ids);
    const sheets = ids.map((i) => map.get(i)).filter(Boolean) as DesignSheetListItem[];
    const n = placeDesignSheetCards(sheets);
    if (n) pushToast("success", t(`วางการ์ดใบงานจาก Design Dashboard ${n} ใบแล้ว`, `Placed ${n} design sheet card(s) from Design Dashboard`));
    else if (sheets.length) pushToast("info", t("ใบงานที่ส่งมาอยู่บนกระดานแล้ว", "Those sheets are already on the board"));
  }, [placeDesignSheetCards, pushToast, t]);

  // ⚠️ ชื่อสถานะใบงานมาจาก Workflow กลาง (แก้ได้ที่ /admin/workflows) — ชุดสำรองในโค้ดไม่มีสถานะที่เพิ่มทีหลัง
  // ถ้ากระดานพร้อมก่อนสถานะโหลดเสร็จ การ์ดจะโชว์ key ดิบ (เช่น state_8) → พอสถานะมาถึงให้ซิงค์ซ้ำ 1 รอบ
  const boardReadyRef = useRef(false);
  useEffect(() => { if (boardReadyRef.current) void syncDesignSheetCards(); }, [dsMeta, syncDesignSheetCards]);

  const onBoardReady = useCallback(() => { boardReadyRef.current = true; syncTaskCards(); syncContentCards(); void syncDesignSheetCards(); void syncTrendCards(); void placePendingDesignSheets(); void placePendingTrends(); }, [syncTaskCards, syncContentCards, syncDesignSheetCards, syncTrendCards, placePendingDesignSheets, placePendingTrends]);
  // สลับภาษา → รีเฟรชข้อความบนการ์ด (การ์ดเป็น snapshot · ข้าม mount แรก ให้ onReady จัดการ)
  const { lang } = useLang();
  const langMountRef = useRef(false);
  useEffect(() => { if (!langMountRef.current) { langMountRef.current = true; return; } syncTaskCards(); syncContentCards(); void syncDesignSheetCards(); }, [lang, syncTaskCards, syncContentCards, syncDesignSheetCards]);

  if (err) return <StandaloneShell title={t("แคมเปญ", "Campaign")} icon="📣" accent="violet"><div className="p-8 text-red-600">{err}</div></StandaloneShell>;

  const name = detail?.campaign.name ?? t("แคมเปญ", "Campaign");

  return (
    <StandaloneShell title={name} icon="📣" accent="violet">
      {/* GIF จิ้มเพื่อน — โผล่วิ่งบนหน้านี้ด้วย (ดูข้อความ/กดปิด · ตอบกลับทำที่หน้าแรก) */}
      <GifPokeLayer userId={user?.id ?? null} />
      {/* Top bar (sticky) -- อยู่ใต้หัวบาร์หลัก (top-14) */}
      <div className={`bg-white border-b border-slate-200 px-8 py-4 sticky z-20 ${embed ? "top-0" : "top-14"}`}>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <a href="/tasks" title={t("กลับหน้าแรก (คลิกกลาง = เปิดแท็บใหม่)", "Home (middle-click = new tab)")} className="h-8 px-2.5 inline-flex items-center gap-1 text-sm font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 shrink-0">🏠 <span className="hidden sm:inline">{t("หน้าแรก", "Home")}</span></a>
            <Link href="/tasks/campaigns" className="text-sm text-slate-500 hover:text-slate-800">{t("แคมเปญ", "Campaigns")}</Link>
            <span className="text-slate-300">›</span>
            <span className="font-semibold text-slate-900 truncate">{name}</span>
            {detail && (
              <select value={detail.campaign.status} onChange={(e) => setStatus(e.target.value)} className="h-8 border border-slate-200 rounded-md px-2 text-sm">
                {CAMPAIGN_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label()}</option>)}
              </select>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* จัดปุ่มเป็นกลุ่มตามประเภท — เดิมเรียงยาว 14 ปุ่มจนแถบรก */}
            <ToolMenu label={t("เพิ่มการ์ด", "Add card")} icon="＋" tone="violet" items={[
              { icon: "📦", label: "SKU Card", hint: t("สินค้าราย SKU", "Product SKUs"), onClick: () => { setSkuSel([]); setSkuOpen(true); } },
              { icon: "🧬", label: "Parent SKU", hint: t("สินค้าหลัก", "Parent products"), onClick: () => { setParentSel([]); setParentOpen(true); } },
              { icon: "🎯", label: t("SKU การตลาด", "Marketing SKU"), hint: t("รุ่น + ป้าย + สีที่เหลือ (จากหน้า SKU การตลาด)", "Model + labels + colors left"), onClick: () => { setMktSel([]); setMktOpen(true); } },
              { icon: "✅", label: "Task Card", hint: t("สร้างงานใหม่ + วางการ์ด", "New task + card"), onClick: () => setTaskOpen(true) },
              { icon: "🧲", label: t("ลากงานเข้า", "Drag tasks in"), hint: t("งานในแคมเปญที่ยังไม่อยู่บนกระดาน", "Campaign tasks not on the board yet"), onClick: openDragPanel },
              { icon: "📱", label: "Content Card", hint: t("คอนเทนต์ที่จะโพสต์", "Content to post"), onClick: () => setContentOpen(true) },
              { icon: "🔥", label: t("เทรนด์", "Trend"), hint: t("บอร์ดเทรนด์ (โทนสี/ref/เลย์เอาต์)", "Trend boards"), onClick: () => setTrendOpen(true) },
              ...(canDesign ? [{ icon: "📐", label: t("ใบงานออกแบบ", "Design sheet"), hint: t("ดึงจาก Design Dashboard หรือสร้างใหม่", "From Design Dashboard, or create new"), onClick: () => { setDsSel([]); setDsPickOpen(true); } }] : []),
            ]} />
            <ToolMenu label={t("เครื่องมือ", "Tools")} icon="🧰" tone="teal" items={[
              { icon: "🗂", label: "Section", hint: t("กรอบแบ่งโซนบนกระดาน", "Frame to group the board"), onClick: () => setSectionOpen(true) },
              { icon: "▦", label: t("ตาราง", "Table"), hint: t("ตารางคำนวณบนกระดาน", "Spreadsheet card"), onClick: createTableCard },
              { icon: "📁", label: t("โฟลเดอร์", "Folder"), hint: t("การ์ดลัดเปิดโฟลเดอร์ในเครื่อง", "Shortcut to a local folder"), onClick: () => setFolderOpen(true) },
              { icon: "🖼️", label: t("รูปจากคลัง", "Library image"), hint: t("รูปจากคลังไฟล์กลาง", "From the asset library"), onClick: () => { setAssetSel([]); setAssetOpen(true); } },
            ]} />
            <ToolMenu label={t("ข้อมูล", "Info")} icon="📋" tone="slate" items={[
              { icon: "🗂️", label: t("การ์ดบนกระดาน", "Cards on board"), hint: t("รายการการ์ดทั้งหมด", "List every card"), onClick: openCards },
              { icon: "📚", label: t("ความรู้", "Knowledge"), hint: t("คลังความรู้ของทีม", "Team knowledge base"), onClick: () => setKnowledgeOpen(true) },
              { icon: "📋", label: t("รายละเอียดแคมเปญ", "Campaign details"), hint: t("แก้ข้อมูล/งานในแคมเปญ", "Edit campaign info"), onClick: () => setDrawerOpen(true) },
            ]} />
            <button onClick={refreshBoard} disabled={refreshing} title={t("โหลดกระดานล่าสุด (ดึงงานคนอื่นมาด้วย)", "Reload latest board")} className="h-9 w-9 inline-flex items-center justify-center text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50">{refreshing ? "⏳" : "🔄"}</button>
            <button onClick={toggleFs} title={fs ? t("ออกเต็มจอ", "Exit fullscreen") : t("เต็มจอ", "Fullscreen")} className="h-9 w-9 inline-flex items-center justify-center text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">⛶</button>
          </div>
        </div>
      </div>

      <div className="px-4 py-3">
        <div className="relative" onDragOver={(e) => { if (dragPanelOpen) e.preventDefault(); }} onDrop={onCanvasDrop}>
          {/* realtime ผ่าน Supabase Broadcast (ไม่กิน Cloudflare CPU) + เซฟกันทับด้วย version-guard */}
          {/* ความสูงวัดจากพื้นที่ที่เหลือจริง → กระดานเต็มถึงแถบล่างพอดี หน้าไม่เลื่อน toolbox ไม่จม */}
          <CanvasSketch key={boardKey} entityType="creative_campaign" entityId={id} height="calc(100vh - 205px)" controlsRef={sketchRef} onCardOpen={onCardOpen} onReady={onBoardReady} collab stickyTop={embed ? 72 : 128} />

          {/* ⑦ แผงลากงานเข้ากระดาน (งานในแคมเปญที่ยังไม่อยู่บนกระดาน) */}
          {dragPanelOpen && (
            <div className="absolute top-3 left-3 z-10 w-72 max-h-[70%] bg-white rounded-xl border border-slate-200 shadow-xl flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-700">🧲 {t("ลากงานเข้ากระดาน", "Drag task to board")}</span>
                <button onClick={() => setDragPanelOpen(false)} className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:bg-slate-100">✕</button>
              </div>
              <p className="px-3 pt-2 text-[11px] text-slate-400">{t("ลากการ์ดไปวางบนกระดาน หรือกดเพื่อวางตรงกลาง", "Drag a card onto the board, or click to place it in the center")}</p>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {(detail?.tasks ?? []).filter((t) => !boardTaskIds.has(t.id)).length === 0 ? (
                  <p className="text-sm text-slate-400 italic p-2">{t("ทุกงานอยู่บนกระดานแล้ว 🎉", "All tasks are already on the board 🎉")}</p>
                ) : (detail?.tasks ?? []).filter((t) => !boardTaskIds.has(t.id)).map((t) => (
                  <div key={t.id} draggable
                    onDragStart={(e) => { e.dataTransfer.setData("text/task-id", t.id); e.dataTransfer.effectAllowed = "copy"; }}
                    onClick={() => placeTaskCard(t)}
                    className="cursor-grab active:cursor-grabbing border border-slate-200 rounded-lg px-2.5 py-1.5 hover:border-violet-300 hover:bg-violet-50/40">
                    <p className="text-sm text-slate-700 line-clamp-1">✅ {t.title}</p>
                    <p className="text-[11px] text-slate-400">{t.task_no} · {t.assignee_label || "—"}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">🗂 Section · 📦 SKU · ✅ Task · 📱 Content · 📐 {t("ใบงานออกแบบ", "Design sheet")} → <b>{t("ดับเบิลคลิกการ์ด", "Double-click a card")}</b>{t("เพื่อดู/จัดการ · ล้อเมาส์ = ซูม (shift+ล้อ = เลื่อน) · บันทึกอัตโนมัติ", " to view/manage · Scroll = zoom (shift+scroll = pan) · Auto-saved")}</p>
      </div>

      {/* เลือก SKU หลายอัน (checkbox) → วางการ์ดทีเดียว */}
      <ERPModal open={skuOpen} onClose={() => setSkuOpen(false)} title={t("เพิ่มการ์ดสินค้า (SKU) ลงกระดาน", "Add SKU Card to board")} size={bigPick ? "xl" : "md"}
        footer={<>
          <button onClick={toggleBigPick} className="mr-auto h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{bigPick ? `☰ ${t("แบบรายการ", "List view")}` : `🖼️ ${t("การ์ดใหญ่ (ตามแท็ก)", "Big cards (by tag)")}`}</button>
          <button onClick={() => setSkuOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={confirmSku} disabled={!skuSel.length} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{t("เพิ่มการ์ด", "Add card")}{skuSel.length ? ` (${skuSel.length})` : ""}</button>
        </>}>
        {bigPick
          ? <BigTagPick entity="skus" picked={skuSel.map((x) => x.id)} onPick={toggleSkuPick} t={t} />
          : <SkuMultiPick selected={skuSel} onChange={setSkuSel} />}
      </ERPModal>

      <ERPModal open={parentOpen} onClose={() => setParentOpen(false)} title={t("เพิ่มการ์ด Parent SKU ลงกระดาน", "Add Parent SKU Card to board")} size={bigPick ? "xl" : "md"}
        footer={<>
          <button onClick={toggleBigPick} className="mr-auto h-9 px-3 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50">{bigPick ? `☰ ${t("แบบรายการ", "List view")}` : `🖼️ ${t("การ์ดใหญ่ (ตามแท็ก)", "Big cards (by tag)")}`}</button>
          <button onClick={() => setParentOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={confirmParent} disabled={!parentSel.length} className="h-9 px-4 text-sm text-white bg-teal-600 rounded-lg disabled:opacity-50">{t("เพิ่มการ์ด", "Add card")}{parentSel.length ? ` (${parentSel.length})` : ""}</button>
        </>}>
        {bigPick
          ? <BigTagPick entity="parent-skus" picked={parentSel.map((x) => x.id)} onPick={toggleParentPick} t={t} />
          : <ParentSkuMultiPick selected={parentSel} onChange={setParentSel} />}
      </ERPModal>

      <ERPModal open={mktOpen} onClose={() => setMktOpen(false)} title={t("เพิ่มการ์ด SKU การตลาด ลงกระดาน", "Add Marketing SKU card to board")} size="xl"
        footer={<>
          <a href="/marketing/skus" target="_blank" rel="noreferrer" className="mr-auto h-9 px-3 inline-flex items-center text-sm text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-50">🎯 {t("เปิดหน้า SKU การตลาด", "Open Marketing SKUs")}</a>
          <button onClick={() => setMktOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={confirmMkt} disabled={!mktSel.length} className="h-9 px-4 text-sm text-white bg-orange-600 rounded-lg disabled:opacity-50">{t("เพิ่มการ์ด", "Add card")}{mktSel.length ? ` (${mktSel.length})` : ""}</button>
        </>}>
        <MarketingSkuMultiPick selected={mktSel} onChange={setMktSel} />
      </ERPModal>

      {/* รายละเอียดที่จะโชว์บนการ์ด SKU การตลาด — ติ๊กเลือก (จำรายคน) */}
      <ERPModal open={mktOptOpen} onClose={() => setMktOptOpen(false)} title={t("จะโชว์รายละเอียดอะไรบนการ์ด", "What details to show on the card")} size="sm"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => { setMktOptOpen(false); setMktOpen(true); }} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("← เลือกรุ่นใหม่", "← Re-pick")}</button>
          <button onClick={placeMktCards} disabled={!mktSel.length} className="h-9 px-4 text-sm text-white bg-orange-600 rounded-lg disabled:opacity-50">🎯 {t("วางการ์ด", "Place cards")}{mktSel.length ? ` (${mktSel.length})` : ""}</button>
        </div>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">{t("เลือกแล้ว", "Selected")} {mktSel.length} {t("รุ่น — ติ๊กรายละเอียดที่จะโชว์บนการ์ด (ระบบจำค่านี้ให้ครั้งหน้า)", "model(s) — tick what to show on each card (remembered for next time)")}</p>
          <div className="flex flex-wrap gap-1.5">
            {mktSel.slice(0, 8).map((m) => m.image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img key={m.id} src={`${m.image_url}&w=80`} alt="" className="h-12 w-12 rounded object-cover border border-slate-200" />
              : <span key={m.id} className="h-12 w-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-[10px] font-mono text-slate-500">{m.code}</span>)}
            {mktSel.length > 8 && <span className="h-12 px-2 flex items-center text-xs text-slate-400">+{mktSel.length - 8}</span>}
          </div>
          <div className="grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-3">
            {MKT_FIELD_OPTS.map((o) => { const on = mktFields.includes(o.key); return (
              <label key={o.key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer ${on ? "border-orange-300 bg-orange-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="checkbox" checked={on} onChange={() => toggleMktField(o.key)} className="h-4 w-4 accent-orange-600" />
                <span className="text-slate-700">{t(o.labelTh, o.labelEn)}</span>
              </label>
            ); })}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setMktFields(MKT_FIELDS_ALL); void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "campaign_mkt_card_fields", value: MKT_FIELDS_ALL }) }).catch(() => {}); }} className="h-8 flex-1 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">{t("โชว์ทั้งหมด", "Show all")}</button>
            <button type="button" onClick={() => { const v: MktFieldKey[] = ["image", "code", "name"]; setMktFields(v); void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "campaign_mkt_card_fields", value: v }) }).catch(() => {}); }} className="h-8 flex-1 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">{t("แบบย่อ (รูป+รหัส+ชื่อ)", "Minimal")}</button>
          </div>
        </div>
      </ERPModal>

      {/* เลือกใบงานออกแบบ (จาก Design Dashboard) หลายใบ → วางการ์ด · หรือกดสร้างใบงานใหม่จากบนกระดาน */}
      <ERPModal open={dsPickOpen} onClose={() => setDsPickOpen(false)} title={t("เพิ่มการ์ดใบงานออกแบบลงกระดาน", "Add Design Sheet card to board")} size="md"
        footer={<>
          <button onClick={() => { setDsPickOpen(false); setDsCreate(true); }} className="mr-auto h-9 px-3 text-sm text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-50">＋ {t("สร้างใบงานใหม่", "New design sheet")}</button>
          <button onClick={() => setDsPickOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={confirmDesignSheets} disabled={!dsSel.length} className="h-9 px-4 text-sm text-white bg-indigo-600 rounded-lg disabled:opacity-50">{t("เพิ่มการ์ด", "Add card")}{dsSel.length ? ` (${dsSel.length})` : ""}</button>
        </>}>
        <DesignSheetMultiPick selected={dsSel} onChange={setDsSel} statusLabel={dsLabel} />
      </ERPModal>

      {/* เลือกเทรนด์จากบอร์ดเทรนด์ → วางเป็นการ์ดบนกระดาน (รูปหน้าเทรนด์ + ความแรง + % ความครบ) */}
      <ERPModal open={trendOpen} onClose={() => setTrendOpen(false)} size="md"
        title={`🔥 ${t("เพิ่มการ์ดเทรนด์ลงกระดาน", "Add trend card to board")}`}
        description={t("เลือกเทรนด์ที่จะใช้กับแคมเปญนี้ — ดับเบิลคลิกการ์ดบนกระดานจะเปิดบอร์ดเทรนด์", "Pick trends for this campaign — double-click the card opens its trend board")}
        footer={<>
          <a href="/tasks/trends" target="_blank" rel="noreferrer" className="mr-auto h-9 px-3 inline-flex items-center text-sm text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-50">↗ {t("ไปหน้าเทรนด์", "Open Trends")}</a>
          <button onClick={() => setTrendOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={confirmTrends} disabled={!trendSel.length} className="h-9 px-4 text-sm text-white bg-rose-600 rounded-lg disabled:opacity-50">{t("เพิ่มการ์ด", "Add card")}{trendSel.length ? ` (${trendSel.length})` : ""}</button>
        </>}>
        <div className="space-y-2">
          <input value={trendQ} onChange={(e) => setTrendQ(e.target.value)} placeholder={`🔍 ${t("ค้นหาเทรนด์...", "Search trends...")}`}
            className="h-9 w-full rounded-lg border border-slate-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200" />
          {trendList === null ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("กำลังโหลด...", "Loading...")}</p>
          ) : trendList.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">{t("ยังไม่มีเทรนด์ — สร้างได้ที่หน้า 🔥 เทรนด์", "No trends yet — create one on the Trends page")}</p>
          ) : (
            <div className="grid max-h-[46vh] grid-cols-2 gap-2 overflow-auto sm:grid-cols-3">
              {trendList
                .filter((x) => !trendQ.trim() || `${x.title} ${x.brand_name ?? ""}`.toLowerCase().includes(trendQ.trim().toLowerCase()))
                .map((x) => {
                  const on = trendSel.includes(x.id);
                  return (
                    <button key={x.id} type="button"
                      onClick={() => setTrendSel((p) => (p.includes(x.id) ? p.filter((k) => k !== x.id) : [...p, x.id]))}
                      className={`overflow-hidden rounded-lg border text-left ${on ? "border-rose-500 ring-2 ring-rose-200" : "border-slate-200 hover:border-rose-300"}`}>
                      <div className="flex h-20 items-center justify-center border-b border-slate-100 bg-slate-50">
                        {x.cover_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={withImageWidth(x.cover_url, 240) ?? x.cover_url} alt="" className="h-full w-full object-contain" />
                          : <span className="text-[11px] text-slate-300">{t("ยังไม่มีรูปบนบอร์ด", "Board is empty")}</span>}
                      </div>
                      <div className="p-1.5">
                        <p className="line-clamp-2 text-[12px] font-medium leading-tight text-slate-800">{x.heat === "hot" ? "🔥" : x.heat === "cooling" ? "❄️" : "🌱"} {x.title}</p>
                        {x.total ? <p className="text-[10px] text-slate-400">✅ {x.done ?? 0}/{x.total} ({x.percent ?? 0}%)</p> : null}
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      </ERPModal>

      {/* ดับเบิลคลิกการ์ดใบงาน → ป๊อปอัปใบงานของกลาง (ดู/แก้/เปลี่ยนสถานะ) · ปิดแล้วซิงค์การ์ด */}
      {dsViewId && <DesignSheetDetail detailOnly hideSendToBoard openId={dsViewId} onDetailClose={() => { setDsViewId(null); void syncDesignSheetCards(); }} />}
      {/* สร้างใบงานใหม่จากบนกระดาน → ได้ใบงานจริง (โผล่ใน Design Dashboard) + วางการ์ดให้ทันที */}
      {dsCreate && <DesignSheetDetail detailOnly hideSendToBoard createMode defaultBrandId={detail?.campaign.brand_id ?? null}
        onCreated={(s) => { placeDesignSheetCards([{ id: s.id, code: s.code, name: t("ใบงานใหม่", "New design sheet"), status: null }]); pushToast("success", t(`สร้างใบงาน ${s.code} + วางการ์ดแล้ว`, `Created design sheet ${s.code} and placed card`)); }}
        onDetailClose={() => { setDsCreate(false); void syncDesignSheetCards(); }} />}

      {/* ดับเบิลคลิกการ์ด Parent SKU → ตัวแก้สินค้ากลาง */}
      {parentRecId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={parentRecId} onClose={() => setParentRecId(null)} onChanged={() => {}} />}
      {knowledgeOpen && <KnowledgeDrawer onClose={() => setKnowledgeOpen(false)} canEdit={can(TASKS_SETTINGS_PERM as Parameters<typeof can>[0])} pushToast={pushToast} />}

      {/* เลือกรูปจากคลังกลาง (ของกลาง AssetPicker) → กล่องเลือกข้อมูลที่จะดึง → วางการ์ด */}
      <AssetPicker open={assetOpen} onClose={() => setAssetOpen(false)} multiple typeFilter="image"
        title={t("เลือกรูปจากคลังกลาง", "Pick images from library")} contextLabel={name} onSelect={onAssetPicked} />

      <ERPModal open={assetOptOpen} onClose={() => setAssetOptOpen(false)} title={t("จะดึงข้อมูลอะไรมาด้วย", "What info to include")} size="sm"
        footer={<div className="flex justify-end gap-2">
          <button onClick={() => { setAssetOptOpen(false); setAssetOpen(true); }} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("← เลือกรูปใหม่", "← Re-pick")}</button>
          <button onClick={confirmAssets} disabled={!assetSel.length} className="h-9 px-4 text-sm text-white bg-pink-600 rounded-lg disabled:opacity-50">🖼️ {t("วางการ์ด", "Place cards")}{assetSel.length ? ` (${assetSel.length})` : ""}</button>
        </div>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">{t("เลือกแล้ว", "Selected")} {assetSel.length} {t("รูป — ติ๊กว่าจะให้โชว์ข้อมูลอะไรใต้รูปบนการ์ด", "image(s) — tick which info to show under each card")}</p>
          <div className="flex flex-wrap gap-1.5">
            {assetSel.slice(0, 8).map((a) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={a.id} src={withImageWidth(a.url, 80) ?? a.url} alt="" className="h-12 w-12 rounded object-cover border border-slate-200" />
            ))}
            {assetSel.length > 8 && <span className="h-12 px-2 flex items-center text-xs text-slate-400">+{assetSel.length - 8}</span>}
          </div>
          <div className="grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-3">
            {ASSET_FIELD_OPTS.map((o) => { const on = assetFields.includes(o.key); return (
              <button key={o.key} onClick={() => toggleAssetField(o.key)} className={`w-full flex items-center gap-2 h-9 px-3 rounded-lg border text-left text-sm ${on ? "bg-pink-50 border-pink-300 text-pink-800" : "border-slate-200 text-slate-600"}`}>
                <input type="checkbox" readOnly checked={on} className="h-4 w-4 rounded border-slate-300 text-pink-600 pointer-events-none" />
                {t(o.labelTh, o.labelEn)}
              </button>
            ); })}
          </div>
          <p className="text-[11px] text-slate-400">{t("location / ลิงก์ / คำอธิบาย จะโชว์เฉพาะรูปที่มีข้อมูลนั้น", "location / link / description show only for images that have them")}</p>
        </div>
      </ERPModal>

      {assetView && <AssetCardDrawer data={assetView} onClose={() => setAssetView(null)} pushToast={pushToast} />}

      {skuView && <SkuDrawer data={skuView} onClose={() => setSkuView(null)} />}
      {taskView && <TaskDetailDrawer taskId={String(taskView.id ?? "")} onClose={() => setTaskView(null)} onChanged={() => {}} onMove={moveTask} onDelete={removeTask} pushToast={pushToast} />}

      {/* เลือกโซน (Section) จากชุดสำเร็จ หรือพิมพ์เอง */}
      <ERPModal open={sectionOpen} onClose={() => setSectionOpen(false)} title={t("เพิ่มโซน (Section)", "Add Section")} size="sm"
        footer={<button onClick={() => setSectionOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>}>
        <div className="space-y-3">
          <p className="text-xs text-slate-400">{t("เลือกโซนสำเร็จรูป (กดแล้ววางบนกระดานเลย)", "Choose a preset section (click to place it on the board)")}</p>
          <div className="grid grid-cols-1 gap-1.5">
            {sectionPresets().map((s) => (
              <button key={s} onClick={() => insertSection(s)} className="w-full text-left h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-violet-300 hover:bg-violet-50/40">{s}</button>
            ))}
          </div>
          <div className="border-t border-slate-100 pt-3">
            <p className="text-xs text-slate-400 mb-1.5">{t("หรือพิมพ์ชื่อเอง", "Or type a custom name")}</p>
            <div className="flex gap-2">
              <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sectionName.trim() && insertSection(sectionName)} placeholder={t("ชื่อโซน...", "Section name...")} className="flex-1 h-9 border border-slate-200 rounded-lg px-2 text-sm" />
              <button onClick={() => sectionName.trim() && insertSection(sectionName)} disabled={!sectionName.trim()} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            </div>
          </div>
        </div>
      </ERPModal>

      {/* ป๊อปอัปการ์ดโฟลเดอร์ — เก็บ path · ดับเบิลคลิกการ์ด = คัดลอก path */}
      <ERPModal open={folderOpen} onClose={() => setFolderOpen(false)} title={t("เพิ่มการ์ดโฟลเดอร์", "Add Folder card")} size="md"
        footer={<div className="flex justify-end gap-2"><button onClick={() => setFolderOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button><button onClick={addFolderCard} disabled={!fForm.path.trim()} className="h-9 px-4 text-sm text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 disabled:opacity-50">📁 {t("วางการ์ด", "Place card")}</button></div>}>
        <div className="space-y-3">
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ชื่อ (ไม่ใส่ = ใช้ชื่อโฟลเดอร์สุดท้าย)", "Label (empty = last folder name)")}</p>
            <ERPInput value={fForm.label} onChange={(e) => setFForm((f) => ({ ...f, label: e.target.value }))} placeholder={t("เช่น วิดีโอ Pasio", "e.g. Pasio videos")} />
          </div>
          <div>
            <p className="text-[11px] text-slate-400 mb-1">{t("ที่อยู่โฟลเดอร์ (path)", "Folder path")}</p>
            <ERPInput value={fForm.path} onChange={(e) => setFForm((f) => ({ ...f, path: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && fForm.path.trim()) addFolderCard(); }} placeholder="Z:\Work In Process\[02]\Video\Pasio" />
          </div>
          <div className="text-[11px] text-cyan-800 bg-cyan-50 border border-cyan-100 rounded-lg px-3 py-2 space-y-1">
            <p className="font-medium">📌 {t("ดับเบิลคลิกการ์ด = เปิดโฟลเดอร์ใน File Explorer ทันที", "Double-click card = open folder in File Explorer instantly")}</p>
            <p className="text-cyan-700">{t("ลงครั้งเดียวต่อเครื่อง (Windows):", "Install once per PC (Windows):")}</p>
            <p>{t("1) ดาวน์โหลดไฟล์ตั้งค่า  2) ดับเบิลคลิก → กด Yes  3) ", "1) Download  2) double-click → Yes  3) ")}<b>{t("ปิด-เปิดเบราว์เซอร์ใหม่ 1 ครั้ง", "restart the browser once")}</b></p>
            <p>{t("ครั้งแรกที่กดการ์ด Chrome จะถาม → กด ", "First click, Chrome asks → click ")}<b>Open</b>{t(" (ติ๊ก Always allow)", " (tick Always allow)")}</p>
            <a href="/erp-open-folder.reg" download className="inline-flex items-center gap-1 font-medium underline text-cyan-700 hover:text-cyan-900">⬇️ {t("ดาวน์โหลดไฟล์ตั้งค่า (.reg)", "Download setup file (.reg)")}</a>
            <p className="text-cyan-600">{t("ยังไม่ลง/ยังไม่ restart = กดแล้วจะคัดลอก path ให้วางเองใน File Explorer (Ctrl+V → Enter)", "Not installed/not restarted = clicking copies the path to paste manually (Ctrl+V → Enter)")}</p>
          </div>
        </div>
      </ERPModal>

      {/* ป๊อปอัปสรุปการ์ดบนกระดาน */}
      <ERPModal open={cardsOpen} onClose={() => setCardsOpen(false)} title={t("การ์ดบนกระดาน", "Cards on board")} size="md"
        footer={<button onClick={() => setCardsOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>}>
        <CardsSummary cards={cards} onOpen={(c) => { setCardsOpen(false); if (c.kind === "task") setTaskView(c.data); else if (c.kind === "sku") setSkuView(c.data); else if (c.kind === "content") setContentView(c.data); else if (c.kind === "parent_sku" || c.kind === "marketing_sku") setParentRecId(String(c.data.id ?? "")); else if (c.kind === "folder") openFolder(String(c.data.path ?? "")); else if (c.kind === "asset") setAssetView(c.data); else if (c.kind === "design_sheet") setDsViewId(String(c.data.id ?? "")); }} />
      </ERPModal>

      {/* สร้างงานจริง (ฟอร์มเดียวกับหน้างาน) -- ล็อกแคมเปญนี้ → วางการ์ดงานบนกระดาน */}
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} pushToast={pushToast} lockedCampaignId={id} lockedCampaignLabel={name} onCreated={onTaskCreated} />

      {/* สร้างคอนเทนต์ (ย่อ) → วางการ์ดคอนเทนต์ */}
      <ERPModal open={contentOpen} onClose={() => setContentOpen(false)} title={t("สร้างคอนเทนต์ลงกระดาน", "Add Content card to board")} size="md"
        footer={<>
          <button onClick={() => setContentOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ยกเลิก", "Cancel")}</button>
          <button onClick={createContentCard} disabled={!cForm.title.trim()} className="h-9 px-4 text-sm text-white bg-amber-600 rounded-lg disabled:opacity-50">{t("สร้าง + วางการ์ด", "Create + place card")}</button>
        </>}>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-400">{t("ชื่อคอนเทนต์", "Content title")}</label><input value={cForm.title} onChange={(e) => setCForm((f) => ({ ...f, title: e.target.value }))} placeholder={t("เช่น โพสต์เปิดตัวสินค้าใหม่", "e.g. New product launch post")} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-slate-400">{t("ประเภทโพสต์", "Post type")}</label><select value={cForm.post_type} onChange={(e) => setCForm((f) => ({ ...f, post_type: e.target.value }))} className="w-full h-9 border border-slate-200 rounded-lg px-2 text-sm">{POST_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></div>
            <div><label className="text-xs text-slate-400">{t("ตั้งเวลาโพสต์", "Scheduled time")}</label><ERPDateTime24 value={cForm.scheduled_at} onChange={(v) => setCForm((f) => ({ ...f, scheduled_at: v }))} /></div>
          </div>
          <div><label className="text-xs text-slate-400">{t("แพลตฟอร์ม", "Platforms")}</label>
            <div className="flex flex-wrap gap-1.5 mt-1">{platformOpts.map((p) => { const on = cForm.platforms.includes(p.value); return <button key={p.value} type="button" onClick={() => setCForm((f) => ({ ...f, platforms: on ? f.platforms.filter((x) => x !== p.value) : [...f.platforms, p.value] }))} className={`px-2.5 py-1 rounded-full text-xs border ${on ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200"}`}>{p.label}</button>; })}</div>
          </div>
          <div><label className="text-xs text-slate-400">{t("แบบการ์ด", "Card style")}</label>
            <div className="flex gap-1.5 mt-1">
              {([["combined", `📱 ${t("การ์ดรวม", "Combined")}`], ["per_platform", `🔀 ${t("แยกรายแพลตฟอร์ม", "Per platform")}`]] as const).map(([v, lbl]) => (
                <button key={v} type="button" onClick={() => setCForm((f) => ({ ...f, cardMode: v }))} className={`px-2.5 py-1 rounded-full text-xs border ${cForm.cardMode === v ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200"}`}>{lbl}</button>
              ))}
            </div>
            {cForm.cardMode === "per_platform" && <p className="text-[11px] text-slate-400 mt-1">{t("วาง 1 การ์ด/แพลตฟอร์ม · ทุกใบผูก content เดียวกัน (แก้ที่ Drawer)", "One card per platform · all linked to the same content (edit in Drawer)")}</p>}
          </div>
          <p className="text-xs text-slate-400">{t(`สร้างแบบย่อ — รายละเอียด/caption แก้ต่อได้ที่ "เปิดเต็ม" ในการ์ด`, `Quick create — edit details/caption later via "Open full" on the card`)}</p>
        </div>
      </ERPModal>

      {contentView && <ContentDrawer contentId={String(contentView.id ?? "")} brands={brands} onClose={() => { setContentView(null); syncContentCards(); }} onChanged={() => syncContentCards()} onDeleted={(cid) => { sketchRef.current?.removeCards((c) => c.kind === "content" && String(c.data.id ?? "") === cid); pushToast("info", t("เอาการ์ดคอนเทนต์ออกจากกระดานแล้ว", "Removed content card from board")); }} pushToast={pushToast} />}
      {tableView && <TableDrawer tableId={String(tableView.id ?? "")} onClose={() => setTableView(null)}
        onSaved={(tb) => { void sketchRef.current?.replaceCard((c) => c.kind === "table" && String(c.data.id ?? "") === tb.id, tableCardSkeleton(tb)); }}
        onDeleted={(tid) => { sketchRef.current?.removeCards((c) => c.kind === "table" && String(c.data.id ?? "") === tid); pushToast("info", t("เอาตารางออกจากกระดานแล้ว", "Removed table from board")); }}
        pushToast={pushToast} />}

      {drawerOpen && <CampaignDrawer campaignId={id} onClose={() => setDrawerOpen(false)} onChanged={load} pushToast={pushToast} />}

    </StandaloneShell>
  );
}

