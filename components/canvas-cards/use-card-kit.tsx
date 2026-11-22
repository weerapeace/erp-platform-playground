"use client";
/**
 * ชุดการ์ดบนกระดาน (ของกลาง) — "เพิ่มการ์ดจากระบบอื่น" + ป๊อปเลือก + ป๊อปเปิดดูเมื่อดับเบิลคลิก + ซิงค์การ์ดสด
 *   ย้ายมาจากกระดานแคมเปญ (app/tasks/campaigns/[id]/page.tsx) 2026-11-15 ให้กระดานแผนงานทีมใช้ชุดเดียวกัน
 *
 *   const kit = useCardKit({ sketchRef, campaign });
 *   <ToolMenu items={[kit.items.sku, kit.items.parent, ...]} />
 *   <CanvasSketch controlsRef={sketchRef} onCardOpen={kit.onCardOpen} onReady={kit.onBoardReady} ... />
 *   {kit.ui}   ← ป๊อปทั้งหมดของชุดการ์ด
 *
 * การ์ดที่มี: SKU · Parent SKU · SKU การตลาด · งาน (Task) · คอนเทนต์ · เทรนด์ · ใบงานออกแบบ · รูปจากคลัง · โฟลเดอร์ · ตารางคำนวณ · โซน (Section/กรอบ)
 *   - campaign = กระดานของแคมเปญ: งาน/คอนเทนต์ที่สร้างจากกระดานผูกแคมเปญนั้น · ใบงานใหม่ใช้แบรนด์แคมเปญตั้งต้น · ไม่ส่ง = ไม่ผูกแคมเปญ
 *   - onCardOpen คืน true เมื่อเป็นการ์ดของชุดนี้ (หน้าที่มีการ์ดชนิดของตัวเอง เช่น team_plan จัดการต่อเองเมื่อได้ false)
 * หน้าที่ใช้: กระดานแคมเปญ · กระดานแผนงานทีม (components/team-plan/board-view) · doc: docs/canvas-sketch.md
 */
import { isChecklistPartKind } from "./checklist-box";
import { emitTaskContentChanged } from "@/lib/task-content-events";
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { useT, useLang } from "@/components/i18n";
import { apiFetch } from "@/lib/api";
import { Icon } from "@/components/icon";
import { FolderCardModal, openCanvasFolder } from "@/components/canvas-sketch/folder-card";
import { ERPModal } from "@/components/modal";
import { ContentCreateModal, type ContentCreatePreset, type ContentCreatedResult } from "@/app/tasks/content/content-create-modal";
import { useContentRefs } from "./use-content-refs";
import { CardStyleModal, type SavedCardPreset } from "./card-style-modal";
import { CARD_STYLE_PREF, CARD_STYLE_PRESETS_PREF, cardStyleTeamKey, defaultCardStyle, normalizeCardStyleMap, styledTexts, type CardStyleMap, type CardValues, type StyledCardType, valuesFromSnapshot } from "./card-style";
import { briefLines } from "./skeletons";
import { usePermission } from "@/components/auth";
import type { DesignSheetListItem } from "@/app/api/design-sheets/route";
import { buildStatusMeta, type StatusMeta, type WfStatusRow } from "@/lib/design-sheets-meta";
import type { SkuPickerValue } from "@/components/pickers";
import type { CanvasSketchControls } from "@/components/canvas-sketch";
import type { CreatedTask } from "@/app/tasks/create-task-modal";
import { applyTaskTransition } from "@/app/tasks/task-actions";
import { deleteTask, addContentAttachment, getContent, listBrands, listSubtasks, type CreativeTask, type BrandOption } from "@/app/tasks/data";
import { AssetPicker } from "@/components/asset-picker";
import type { AssetRow } from "@/app/api/assets/shared";
import { withImageWidth, r2ImageUrl } from "@/lib/r2-image";
import { TableDrawer } from "@/app/tasks/table-drawer";
import { usePushToast, useToast } from "@/components/toast";
import { frameSectionKind, slotInFrame, templateFrames, templatesFor, type BoardKind, type BoardSectionConfig, type BoardSectionTemplate, type SectionKind } from "@/lib/board-section-templates";
import { loadSectionTemplates, saveSectionTemplates } from "./section-templates-cache";
import { BoardSectionTemplatesManager } from "@/app/tasks/board-section-templates-settings";
import { skuCardSkeleton, parentSkuCardSkeleton, marketingSkuCardSkeleton, designSheetCardSkeleton, trendCardSkeleton, assetCardSkeleton, contentCardSkeleton, perPlatformCardSkeleton, tableCardSkeleton, taskCardSkeleton, type ParentSkuVal, type MktSkuVal, type MktFieldKey, MKT_FIELDS_ALL, tt, type DsCardInfo, dsCardText, DS_CARD_STROKE, type TrendCardInfo, trendCardText, type AssetFieldKey, contentCardText, perPlatformCardText, MKT_FIELD_OPTS, postStatusStyle } from "./skeletons";
import { ParentSkuMultiPick, MarketingSkuMultiPick, SkuMultiPick, DesignSheetMultiPick, BigTagPick } from "./multi-picks";
import { AssetCardDrawer, SkuDrawer, CardsSummary, type ToolMenuItem } from "./drawers";

// drawer/ป๊อปที่มีตัวพิมพ์ข้อความ (rich text) — โหลดเมื่อเปิดใช้จริง ไม่ถ่วงการเปิดหน้า
const CreateTaskModal = dynamic(() => import("@/app/tasks/create-task-modal").then((m) => m.CreateTaskModal), { ssr: false });
const TaskDetailDrawer = dynamic(() => import("@/app/tasks/task-detail-drawer").then((m) => m.TaskDetailDrawer), { ssr: false });
const ContentDrawer = dynamic(() => import("@/app/tasks/content/content-drawer").then((m) => m.ContentDrawer), { ssr: false });
const MasterRecordDrawer = dynamic(() => import("@/components/master-crud").then((m) => m.MasterRecordDrawer), { ssr: false });
// ป๊อปอัปใบงานออกแบบ = ของกลางตัวเดียวกับที่ Design Dashboard ใช้ (ดู/แก้/เปลี่ยนสถานะ/สร้างใหม่) — โหลดเฉพาะตอนใช้
const DesignSheetDetail = dynamic(() => import("@/components/design-sheet-detail").then((m) => m.DesignSheetsDetail), { ssr: false });

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
export async function fetchDesignSheets(ids: string[]): Promise<Map<string, DesignSheetListItem>> {
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

/** ชนิดการ์ดที่ชุดนี้จัดการ (ดับเบิลคลิกแล้วเปิดป๊อปให้) */
export const CARD_KIT_KINDS = ["sku", "parent_sku", "marketing_sku", "task", "content", "trend", "design_sheet", "asset", "folder", "table"] as const;

export type CardKitItemKey = "sku" | "parent" | "marketing" | "task" | "content" | "trend" | "designSheet" | "section" | "table" | "folder" | "asset" | "cards" | "cardStyle";

export type CardKitOptions = {
  sketchRef: MutableRefObject<CanvasSketchControls | null>;
  /** กระดานของแคมเปญ: งาน/คอนเทนต์ที่สร้างจากกระดานผูกแคมเปญนี้ · ใบงานใหม่ใช้แบรนด์นี้ตั้งต้น · ไม่ส่ง = ไม่ผูก */
  campaign?: { id: string; name: string; brandId: string | null } | null;
  /** ชื่อโซน (Section) สำเร็จรูปในป๊อปเพิ่มโซน */
  sectionPresets?: string[];
  /** ป้ายบอกบริบทในป๊อปเลือกรูปจากคลัง (เช่น ชื่อแคมเปญ) */
  contextLabel?: string;
  /** กระดานของงาน (กระดานบรีฟ): คอนเทนต์ที่สร้างจากกระดานผูกงานนี้ + แบรนด์ของงาน */
  task?: { id: string; brandId: string | null } | null;
  /** ชนิดกระดาน — ใช้เลือกเทมเพลตโซน bento ที่ตั้งไว้ (/tasks/settings แท็บ เทมเพลตโซนกระดาน) · ไม่ส่ง = ไม่มีเทมเพลตโซน */
  board?: BoardKind;
};

export type CardKit = {
  /** ปุ่มในเมนู "เพิ่มการ์ด" / "เครื่องมือ" — หน้าเลือกเองว่าจะเรียงอันไหน */
  items: Record<CardKitItemKey, ToolMenuItem>;
  /** มีสิทธิ์ดูสินค้า (products.view) — ไม่มี = ซ่อนปุ่มใบงานออกแบบ */
  canDesign: boolean;
  /** ดับเบิลคลิกการ์ด → เปิดป๊อปตามชนิด · คืน false = ไม่ใช่การ์ดของชุดนี้ */
  onCardOpen: (data: Record<string, unknown>) => boolean;
  /** เรียกตอนกระดานพร้อม (ซิงค์การ์ดสด + วางการ์ดที่ส่งมาทาง URL) */
  onBoardReady: () => void;
  /** ซิงค์ข้อความ/รูปบนการ์ดทุกชนิดของชุดนี้ใหม่ (ปุ่ม "อัปเดตการ์ด") */
  syncAll: () => Promise<void>;
  /** เปิดป๊อปสร้างคอนเทนต์ พร้อมรูป/ข้อความจากของที่เลือกบนกระดาน */
  openContentFrom: (seed: ContentSeed) => void;
  /** ป๊อปทั้งหมดของชุดการ์ด — วางไว้ที่ไหนก็ได้ในหน้า */
  ui: ReactNode;
  /** ส่ง id ที่เลือกบนกระดานมา (onSelectionChange) — เลือกกรอบโซนงาน/คอนเทนต์ → โผล่ปุ่ม ＋ งาน / ＋ คอนเทนต์ */
  onSelection: (ids: string[]) => void;
  /** ส่งชิ้นงานที่เปลี่ยนมา (CanvasSketch onContentChange) — จับเส้นเชื่อม Ref / การลบ Ref บนกระดาน */
  onContentChange: (elements: Record<string, unknown>[]) => void;
};

/** ของที่เลือกบนกระดาน → ตั้งต้นคอนเทนต์ใหม่ · onCreated = แจ้งกลับเพื่อแปะป้ายบนของที่ใช้แล้ว */
export type ContentSeed = { title?: string; images: string[]; caption: string | null; sourceIds: string[]; onCreated?: (contentId: string) => void };

export function useCardKit({ sketchRef, campaign = null, sectionPresets: presetsIn = [], contextLabel, task = null, board }: CardKitOptions): CardKit {
  const t = useT();
  // ── เทมเพลตโซน bento (lib/board-section-templates) ──
  const [sectionCfg, setSectionCfg] = useState<BoardSectionConfig | null>(null);
  useEffect(() => { if (board) loadSectionTemplates().then(setSectionCfg).catch(() => {}); }, [board]);
  const sectionTpls: BoardSectionTemplate[] = board && sectionCfg ? templatesFor(sectionCfg, board) : [];
  // ชื่อโซนสำเร็จรูป: หน้าส่งมาเอง (แก้ไม่ได้) > รายการที่ตั้งไว้ของกระดานนี้ (เพิ่ม/แก้/ลบได้ในป๊อป)
  const presetsEditable = !presetsIn.length && !!board;
  const sectionPresets = presetsIn.length ? presetsIn : board && sectionCfg ? sectionCfg.presets[board] : [];
  const [secEdit, setSecEdit] = useState(false);              // โหมดจัดการในป๊อป Section
  const [tplEditor, setTplEditor] = useState<string | null>(null); // เปิดตัวแก้เทมเพลต bento (id หรือ "new")
  const [presetDraft, setPresetDraft] = useState<Record<number, string>>({});
  // กรอบโซนที่เลือกอยู่ (โซนงาน/คอนเทนต์) + กรอบเป้าหมายของการ์ดใบถัดไป
  const [zone, setZone] = useState<{ id: string; name: string; kind: Exclude<SectionKind, "none"> } | null>(null);
  const zoneTargetRef = useRef<string | null>(null);
  const undoToast = useToast();
  // บันทึกเทมเพลต/โซนสำเร็จรูป (ui_config ผ่าน API กลาง · ลงประวัติ) — undoPrev = ค่าก่อนแก้ ให้ปุ่มย้อนกลับในแจ้งผล
  const saveSectionCfg = async (next: BoardSectionConfig, msg: string, undoPrev?: BoardSectionConfig) => {
    try {
      await saveSectionTemplates(next); setSectionCfg(next);
      if (undoPrev) undoToast.undo(msg, async () => { try { await saveSectionTemplates(undoPrev); setSectionCfg(undoPrev); } catch (e) { pushToastRef.current?.("error", (e as Error).message); } });
      else pushToastRef.current?.("success", msg);
    } catch (e) { pushToastRef.current?.("error", (e as Error).message); }
  };
  const pushToastRef = useRef<((v: "success" | "error" | "info", m: string) => void) | null>(null);
  const setPresets = (list: string[], msg: string, undoable: boolean) => {
    if (!board || !sectionCfg) return;
    const next = { ...sectionCfg, presets: { ...sectionCfg.presets, [board]: [...new Set(list.map((s) => s.trim()).filter(Boolean))] } };
    void saveSectionCfg(next, msg, undoable ? sectionCfg : undefined);
  };
  const deleteSectionTemplate = (tpl: BoardSectionTemplate) => {
    if (!sectionCfg) return;
    void saveSectionCfg({ ...sectionCfg, templates: sectionCfg.templates.filter((x) => x.id !== tpl.id) }, t(`ลบเทมเพลต “${tpl.name}” แล้ว`, `Deleted template “${tpl.name}”`), sectionCfg);
  };
  const campaignId = campaign?.id ?? null;
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
  const [cSeed, setCSeed] = useState<ContentSeed | null>(null); // ของที่เลือกบนกระดาน (รูป/ข้อความ) สำหรับคอนเทนต์ใหม่
  const [contentView, setContentView] = useState<Record<string, unknown> | null>(null); // การ์ดคอนเทนต์ที่กดดู
  const [tableView, setTableView] = useState<Record<string, unknown> | null>(null); // การ์ดตารางที่กดดู (เปิดสเปรดชีต)
  const [folderOpen, setFolderOpen] = useState(false); // modal การ์ดโฟลเดอร์ (ของกลาง FolderCardModal)
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
  const saveMktFields = (v: MktFieldKey[]) => { void apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: "campaign_mkt_card_fields", value: v }) }).catch(() => {}); };
  const toggleMktField = (k: MktFieldKey) => setMktFields((f) => {
    const next = f.includes(k) ? f.filter((x) => x !== k) : [...f, k];
    saveMktFields(next);
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

  const [assetOpen, setAssetOpen] = useState(false);     // AssetPicker เลือกรูปจากคลังกลาง
  const [assetSel, setAssetSel] = useState<AssetRow[]>([]); // รูปที่เลือกไว้รอวาง
  const [assetFields, setAssetFields] = useState<AssetFieldKey[]>(["title"]); // ติ๊กว่าจะดึงข้อมูลอะไรมาด้วย
  const [assetOptOpen, setAssetOptOpen] = useState(false);  // กล่องเลือกข้อมูลที่จะดึง (หลังเลือกรูป)
  const [assetView, setAssetView] = useState<Record<string, unknown> | null>(null); // การ์ดรูปที่กดดู
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const pushToast = usePushToast();   // แจ้งเตือนผ่าน toast กลาง (components/toast)
  // 🔗 Ref ของคอนเทนต์ ↔ กระดาน (เชื่อม/ลากเส้น/วางจาก drawer/ถามตอนลบ) — ซิงก์การ์ดหลังเปลี่ยน (ref กันลำดับประกาศ)
  const syncContentRef = useRef<() => Promise<void>>(async () => {});
  // 🎨 ตั้งค่าการ์ด (ของฉัน + ค่าของกระดาน) — ./card-style · ป๊อป ./card-style-modal
  const boardKey = campaign ? `campaign:${campaign.id}` : task ? `task:${task.id}` : null;
  const [styleMine, setStyleMine] = useState<CardStyleMap>({});
  const [styleTeam, setStyleTeam] = useState<CardStyleMap>({});
  const [stylePresets, setStylePresets] = useState<SavedCardPreset[]>([]);
  const [styleOpen, setStyleOpen] = useState(false);
  const canTeamStyle = usePermission("products.edit") && !!boardKey;
  const styleRef = useRef<{ mine: CardStyleMap; team: CardStyleMap }>({ mine: {}, team: {} });
  styleRef.current = { mine: styleMine, team: styleTeam };
  const cardValuesRef = useRef<Map<string, CardValues>>(new Map());   // ค่าล่าสุดจากรอบซิงก์ (คอนเทนต์/งาน) — key = kind:id[:platform]
  useEffect(() => {
    apiFetch(`/api/user-prefs?key=${CARD_STYLE_PREF}`).then((r) => r.json()).then((j) => setStyleMine(normalizeCardStyleMap(j?.value))).catch(() => {});
    apiFetch(`/api/user-prefs?key=${CARD_STYLE_PRESETS_PREF}`).then((r) => r.json()).then((j) => { if (Array.isArray(j?.value)) setStylePresets(j.value as SavedCardPreset[]); }).catch(() => {});
    if (boardKey) apiFetch(`/api/ui-config?key=${encodeURIComponent(cardStyleTeamKey(boardKey))}`).then((r) => r.json()).then((j) => setStyleTeam(normalizeCardStyleMap(j?.value))).catch(() => {});
  }, [boardKey]);
  const { onSelection: refsOnSelection, placeMissing: refsPlaceMissing, onContentChange: refsOnContentChange, bar: refsBar } = useContentRefs(sketchRef, { pushToast, t, onChanged: () => { void syncContentRef.current(); } });
  pushToastRef.current = pushToast as (v: "success" | "error" | "info", m: string) => void;
  useEffect(() => { listBrands().then(setBrands).catch(() => {}); }, []);

  // Section = Frame ของ Excalidraw (อยู่ข้างหลัง, เปลี่ยนชื่อ/ย่อขยายที่ตัวมันเอง, ลากของเข้าไปแล้วเลื่อนตามกัน)
  const insertSection = (name: string) => {
    if (!sketchRef.current) { pushToast("info", t("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง", "Canvas not ready, please try again")); return; }
    void sketchRef.current.insert([{ type: "frame", children: [], name: name.trim() || t("โซนใหม่", "New section"), x: 0, y: 0, width: 560, height: 400 }]);
    setSectionOpen(false); setSectionName("");
  };
  // วางเทมเพลตโซนทั้งชุด (bento) — ย้อนกลับได้จากแจ้งผล (เอากรอบชุดนี้ออก) + Ctrl+Z บนกระดาน
  const insertSectionTemplate = (tpl: BoardSectionTemplate) => {
    if (!sketchRef.current) { pushToast("info", t("กระดานยังโหลดไม่เสร็จ ลองอีกครั้ง", "Canvas not ready, please try again")); return; }
    const batch = `sb${Date.now().toString(36)}`;
    const frames = templateFrames(tpl).map((f) => ({ ...f, customData: { ...(f.customData as Record<string, unknown>), sectionBatch: batch } }));
    void sketchRef.current.insert(frames);
    setSectionOpen(false);
    undoToast.undo(t(`วางเทมเพลตโซน “${tpl.name}” แล้ว (${frames.length} โซน)`, `Placed section template “${tpl.name}” (${frames.length} zones)`), () => {
      sketchRef.current?.patchElements((el) => ((el.customData as Record<string, unknown> | undefined)?.sectionBatch === batch ? { ...el, isDeleted: true } : null));
    });
  };
  // การ์ดใหม่ → วางในกรอบโซนเป้าหมาย (ถ้ามี) ต่อจากการ์ดเดิมในกรอบ แล้วผูกการ์ดเข้ากรอบ (ลากกรอบแล้วการ์ดตาม) · ไม่มีเป้าหมาย = กลางจอเหมือนเดิม
  const placeCard = async (skeletons: Record<string, unknown>[], cardId: string) => {
    const sk = sketchRef.current; if (!sk) return;
    const fid = zoneTargetRef.current; zoneTargetRef.current = null;
    const els = fid ? sk.getElements() : [];
    const frame = fid ? (els.find((e) => e.id === fid && !e.isDeleted) as { id: string; x: number; y: number; width: number } | undefined) : undefined;
    if (!frame) { await sk.insert(skeletons); return; }
    const inFrame = new Set(els.filter((e) => !e.isDeleted && e.frameId === frame.id && (e.customData as Record<string, unknown> | undefined)?.kind).map((e) => String((e.groupIds as string[] | undefined)?.[0] ?? e.id)));
    const slot = slotInFrame(frame, inFrame.size);
    await sk.insert(skeletons.map((s) => ({ ...s, x: (Number(s.x) || 0) + slot.x, y: (Number(s.y) || 0) + slot.y })), { scene: true });
    sk.patchElements((el) => ((el.customData as Record<string, unknown> | undefined)?.id === cardId && !el.frameId ? { ...el, frameId: frame.id } : null));
  };
  const onSelection = useCallback((ids: string[]) => {
    refsOnSelection(ids);
    if (ids.length !== 1 || !sketchRef.current) { setZone(null); return; }
    const el = sketchRef.current.getElements().find((e) => e.id === ids[0]);
    if (!el || el.type !== "frame") { setZone(null); return; }
    const kind = frameSectionKind(el, sectionCfg);
    setZone(kind === "none" ? null : { id: String(el.id), name: String(el.name ?? ""), kind });
  }, [sectionCfg, sketchRef, refsOnSelection]);
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
  }, [dsLabel, dsColor, sketchRef]);
  const confirmDesignSheets = () => {
    const n = placeDesignSheetCards(dsSel);
    setDsPickOpen(false); setDsSel([]);
    pushToast(n ? "success" : "info", n
      ? t(`วางการ์ดใบงาน ${n} ใบแล้ว`, `Placed ${n} design sheet card(s)`)
      : t("ใบงานที่เลือกอยู่บนกระดานแล้ว", "Selected sheets are already on the board"));
  };
  const onTaskCreated = (tk: CreatedTask) => { void placeCard(taskCardSkeleton(tk), tk.id); pushToast("success", t(`สร้างงาน ${tk.task_no} + วางการ์ดแล้ว`, `Created task ${tk.task_no} and placed card`)); };
  // ป๊อปสร้างคอนเทนต์กลาง: ค่าตั้งต้นจากกระดาน (ล็อกแคมเปญ · ผูกงาน · รูป/แคปชั่นที่เลือก · แบบการ์ด)
  const contentPreset = useMemo<ContentCreatePreset | null>(() => (contentOpen ? {
    ...(cForm.title ? { title: cForm.title } : {}), post_types: [cForm.post_type],
    board: { campaign: campaign ? { id: campaign.id, name: campaign.name } : null, task: task ? { id: task.id, brand_id: task.brandId } : null,
      images: cSeed?.images ?? [], caption: (cSeed?.caption ?? "").trim() || undefined, cardModes: true },
  } : null), [contentOpen, cForm.title, cForm.post_type, campaign, task, cSeed]);
  const onContentCreated = async (r: ContentCreatedResult) => {
    try {
      // รูปที่เลือกบนกระดาน → แนบด้วยไฟล์เดิมบน R2 (ไม่อัปซ้ำ · ไม่เปลือง R2)
      let failed = 0;
      for (const k of cSeed?.images ?? []) { try { await addContentAttachment(r.id, { kind: "image", r2_key: k, file_name: k.split("/").pop() ?? null }); } catch { failed++; } }
      if (failed) pushToast("error", t(`แนบรูปไม่สำเร็จ ${failed} รูป — แนบเพิ่มในคอนเทนต์ได้`, `${failed} image(s) failed to attach — add them in the content`));
      if (cSeed?.sourceIds.length) cSeed.onCreated?.(r.id);
      if (task) emitTaskContentChanged(task.id);
      setCSeed(null);
      const base = { id: r.id, content_no: r.content_no, title: r.title, status: "draft" };
      if (r.cardMode === "per_platform" && r.platforms.length) {
        // วาง 1 การ์ด/แพลตฟอร์ม (เรียงแนวนอน) — ผูก content เดียวกัน
        const all: Record<string, unknown>[] = [];
        r.platforms.forEach((p, i) => { const dx = i * 270; for (const el of perPlatformCardSkeleton(base, p)) all.push({ ...el, x: (Number(el.x) || 0) + dx }); });
        void placeCard(all, r.id);
      } else {
        void placeCard(contentCardSkeleton({ ...base, platforms: r.platforms, scheduled_at: r.scheduled_at }), r.id);
      }
      setContentOpen(false); setCForm({ title: "", post_type: "image", platforms: [], scheduled_at: "", cardMode: "combined" });
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // วางการ์ดโฟลเดอร์ (เก็บ path) บนกระดาน — ป๊อป + โครงการ์ด = ของกลาง components/canvas-sketch/folder-card
  const addFolderCard = (skeletons: Record<string, unknown>[]) => {
    void sketchRef.current?.insert(skeletons);
    setFolderOpen(false);
    pushToast("success", t("วางการ์ดโฟลเดอร์แล้ว", "Folder card placed"));
  };
  // เปิดโฟลเดอร์: ลองผ่าน custom protocol (ลง .reg แล้วเปิด File Explorer ทันที) + คัดลอก path เป็น fallback
  const openFolder = useCallback((path: string) => {
    if (!path) return;
    openCanvasFolder(path);
    pushToast("info", t("กำลังเปิดโฟลเดอร์... ถ้าไม่เปิด: ลง .reg แล้ว 'ปิด-เปิดเบราว์เซอร์ใหม่' 1 ครั้ง (ระหว่างนี้ path คัดลอกให้แล้ว วางใน File Explorer ได้)", "Opening folder... if nothing happens: install .reg then restart the browser once (path copied as fallback)"));
  }, [pushToast, t]);
  // ดับเบิลคลิกการ์ดบนกระดาน → เปิด drawer ตามชนิด · การ์ดโฟลเดอร์ = เปิดโฟลเดอร์ · ไม่ใช่การ์ดของชุดนี้ = false
  const onCardOpen = useCallback((data: Record<string, unknown>): boolean => {
    const kind = data.kind;
    if (kind === "sku") setSkuView(data);
    else if (kind === "task") setTaskView(data);
    else if (kind === "content") setContentView(data);
    else if (kind === "parent_sku" || kind === "marketing_sku") setParentRecId(String(data.id ?? ""));
    else if (kind === "folder") openFolder(String(data.path ?? ""));
    else if (kind === "asset") setAssetView(data);
    else if (kind === "table") setTableView(data);
    else if (kind === "design_sheet") setDsViewId(String(data.id ?? ""));
    else if (kind === "trend") window.open(`/tasks/trends/${encodeURIComponent(String(data.id ?? ""))}`, "_blank", "noopener");
    else return false;
    return true;
  }, [openFolder]);
  // สร้างตารางคำนวณใหม่ → วางการ์ดบนกระดาน
  const createTableCard = async () => {
    try {
      const j = await apiFetch("/api/canvas-tables", { method: "POST", body: JSON.stringify({}) }).then((r) => r.json());
      if (j.error) { pushToast("error", j.error); return; }
      void sketchRef.current?.insert(tableCardSkeleton({ id: j.id, title: j.title, data: j.data }));
      pushToast("success", t("วางตารางคำนวณแล้ว — ดับเบิลคลิกเพื่อกรอก/ใส่สูตร", "Table placed — double-click to edit / add formulas"));
    } catch (e) { pushToast("error", (e as Error).message); }
  };
  // workflow/ลบงาน สำหรับ TaskDetailDrawer เต็มบน canvas
  const moveTask = useCallback(async (task: CreativeTask, toKey: string) => { await applyTaskTransition(task, toKey, { pushToast }); }, [pushToast]);
  const removeTask = useCallback(async (tid: string) => { try { await deleteTask(tid); pushToast("info", t("ลบงานแล้ว", "Task deleted")); setTaskView(null); } catch (e) { pushToast("error", (e as Error).message); } }, [pushToast, t]);
  const openCards = () => { setCards((sketchRef.current?.listCards() ?? []).filter((c) => !isChecklistPartKind(c.kind))); setCardsOpen(true); };   // กล่องเช็กลิสต์ที่แตกออกมา ไม่ใช่การ์ด

  // ② ซิงค์งานย่อยสดบนการ์ดงานเมื่อเปิดกระดาน (การ์ดเก็บ snapshot -- อัปเดตให้ตรงปัจจุบัน)
  const syncTaskCards = useCallback(async () => {
    await sketchRef.current?.refreshCards(async ({ kind, id, data }) => {
      if (kind !== "task" || !id) return null;
      const subs = await listSubtasks(id);
      const shown = subs.slice(0, 6);
      const subLines = subs.length
        ? shown.map((s) => `${(s.status === "approved" || s.status === "posted" || s.status === "done") ? "☑" : "☐"} ${s.title}`).join("\n") + (subs.length > 6 ? `\n… ${tt("อีก", "+")} ${subs.length - 6}` : "")
        : `— ${tt("ยังไม่มีงานย่อย", "No subtasks yet")} —`;
      const text = `✅ ${data.title ?? ""}\n${data.task_no ?? ""}\n\n${tt("งานย่อย", "Subtasks")} (${subs.length})\n${subLines}`;
      cardValuesRef.current.set(`task:${id}`, { title: `✅ ${data.title ?? ""}`, no: String(data.task_no ?? ""), count: `${tt("งานย่อย", "Subtasks")} (${subs.length})`, subs: subs.length ? subs.map((s) => `${(s.status === "approved" || s.status === "posted" || s.status === "done") ? "☑" : "☐"} ${s.title}`).join("\n") : "" });
      return { ...(data.styled ? {} : { text }), data: { subtasks: subs.map((s) => ({ title: s.title })) } };
    });
  }, [sketchRef]);
  // ③ ซิงค์การ์ดคอนเทนต์ (ข้อความ: แคปชั่นย่อ/เวลาโพสต์/สถานะ) — สะท้อนการแก้ใน Drawer
  const syncContentCards = useCallback(async () => {
    const refsByCid = new Map<string, { links: { url: string; label?: string }[]; images: string[] }>();
    await sketchRef.current?.refreshCards(async ({ kind, id, data }) => {
      if (kind !== "content" || !id) return null;
      try {
        const c = await getContent(id);
        refsByCid.set(id, { links: c.ref_links ?? [], images: c.ref_image_keys ?? [] });
        const refN = (c.ref_links?.length ?? 0) + (c.ref_image_keys?.length ?? 0);
        const cv: CardValues = { title: `📱 ${c.title ?? ""}`, no: [c.content_no, c.status].filter(Boolean).join(" · "), sched: c.scheduled_at ? `🗓 ${String(c.scheduled_at).slice(0, 16).replace("T", " ")}` : "",
          plat: (c.platforms ?? []).join(" · "), brief: briefLines(c.brief, 20).join("\n"), ref: refN ? `🔗 Ref ${refN}` : "", cap: c.captions[0]?.caption ?? "" };
        cardValuesRef.current.set(`content:${id}`, cv);
        if (data.platform) cardValuesRef.current.set(`content:${id}:${data.platform}`, { ...cv, plat: String(data.platform), cap: c.captions.find((x) => x.platform === data.platform)?.caption ?? "" });
        const cover = c.cover_image_url ?? null;   // รูปหน้าปก (สื่อแนบ/SKU/งาน) — โผล่บนการ์ด + อัปเดตเมื่อแนบรูปทีหลัง
        const plat = data.platform as string | undefined;
        if (plat) {
          const cap = c.captions.find((x) => x.platform === plat)?.caption ?? null;
          // รูปที่เลือกของแพลตฟอร์มนี้ (เรียง: [0]=รูปใหญ่, ที่เหลือ=รูปเล็กแถวล่าง) · ไม่เลือก = [] → เอารูปออก
          const images = (c.platform_images?.[plat] ?? []).map((k) => r2ImageUrl(k, 480)).filter(Boolean) as string[];
          const ps = c.post_status?.[plat] ?? null;   // สถานะโพสต์ต่อแพลตฟอร์ม → โชว์เด่น + สีขอบ
          return { ...(data.styled ? {} : { text: perPlatformCardText({ content_no: c.content_no, title: c.title, status: c.status }, plat, cap, ps) }), data: { title: c.title, platform: plat }, images, stroke: postStatusStyle(ps).stroke };
        }
        return { ...(data.styled ? {} : { text: contentCardText({ content_no: c.content_no, title: c.title, platforms: c.platforms ?? [], status: c.status, scheduled_at: c.scheduled_at, caption: c.captions[0]?.caption ?? null, brief: c.brief ?? null, refCount: refN }) }), data: { title: c.title, platforms: c.platforms ?? [] }, imageUrl: cover };
      } catch { return null; }
    });
    // Ref ที่เพิ่มใน drawer แต่ยังไม่อยู่บนกระดาน → วางข้างการ์ด + เส้นเชื่อม
    if (refsByCid.size) await refsPlaceMissing(refsByCid);
  }, [sketchRef, refsPlaceMissing]);
  syncContentRef.current = syncContentCards;
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
        ...(sketchStyled(id) ? {} : { text: dsCardText(s, dsLabel(s.status)) }),
        data: { code: s.code, name: s.name, brand_name: s.brand_name, status: s.status },
        imageUrl: s.cover_url ? (withImageWidth(s.cover_url, 480) ?? s.cover_url) : null,
        stroke: dsColor(s.status),
      };
    });
  }, [dsLabel, dsColor, sketchRef]);

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
        ...(sketchStyled(tid) ? {} : { text: trendCardText(x) }),
        data: { title: x.title, heat: x.heat ?? null },
        imageUrl: x.cover_url ? (withImageWidth(x.cover_url, 560) ?? x.cover_url) : null,
      };
    });
  }, [sketchRef]);
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
  }, [sketchRef]);

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

  // 🎨 วาดข้อความการ์ดตามตั้งค่า (เฉพาะใบที่ค่าเปลี่ยน — เทียบ styleSig) · ไม่มีตั้งค่าแล้วแต่เคยตั้ง = กลับเป็นข้อความเดิมก้อนเดียว
  const restyleCards = useCallback(async () => {
    const sk = sketchRef.current; if (!sk) return;
    const { mine, team } = styleRef.current;
    await sk.setCardTexts(({ kind, id, data }) => {
      const type = kind as StyledCardType;
      if (!["content", "task", "sku", "parent_sku", "trend", "design_sheet"].includes(type)) return null;
      const style = mine[type] ?? team[type] ?? null;
      const v = cardValuesRef.current.get(`${kind}:${id}${data.platform ? `:${data.platform}` : ""}`) ?? valuesFromSnapshot(type, data);
      if (!style) {
        if (!data.styled) return null;
        const def = styledTexts(defaultCardStyle(type), v);
        return { texts: [{ text: def.map((x) => x.text).join("\n"), fontSize: 14, fontFamily: 5, strokeColor: String(def[0]?.strokeColor ?? "#1e293b"), role: "all" }], flag: { styled: false, styleSig: null } };
      }
      const sig = JSON.stringify([style, v]);
      if (data.styled && data.styleSig === sig) return null;
      const texts = styledTexts(style, v).map((x) => ({ ...x, role: x.key }));
      return { texts, align: style.align, gap: style.gap, width: style.width, ...(style.bg === "plain" ? { bg: "#ffffff", stroke: "#94a3b8" } : {}), flag: { styled: true, styleSig: sig } };
    });
  }, [sketchRef]);
  // การ์ดที่เพิ่งวาง/เปลี่ยน → ทำหน้าตาตามตั้งค่า (รอนิ่ง 0.8 วิ · เฉพาะเมื่อมีตั้งค่า · ใบที่เหมือนเดิมข้าม)
  const restyleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onKitContentChange = useCallback((els: Record<string, unknown>[]) => {
    refsOnContentChange(els);
    const { mine, team } = styleRef.current;
    if (!Object.keys(mine).length && !Object.keys(team).length) return;
    if (restyleTimer.current) clearTimeout(restyleTimer.current);
    restyleTimer.current = setTimeout(() => { void restyleCards(); }, 800);
  }, [refsOnContentChange, restyleCards]);
  const saveCardStyle = async (scope: "mine" | "team", map: CardStyleMap) => {
    const prev = scope === "mine" ? styleMine : styleTeam;
    const write = async (m: CardStyleMap) => {
      if (scope === "mine") { await apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: CARD_STYLE_PREF, value: m }) }); setStyleMine(m); styleRef.current = { ...styleRef.current, mine: m }; }
      else {
        const r = await apiFetch("/api/ui-config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: cardStyleTeamKey(boardKey!), value: m }) });
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || t("บันทึกค่าของกระดานไม่สำเร็จ", "Couldn't save the board setting"));
        setStyleTeam(m); styleRef.current = { ...styleRef.current, team: m };
      }
      await restyleCards();
    };
    try {
      await write(map);
      undoToast.undo(t("อัปเดตหน้าตาการ์ดแล้ว", "Card style updated"), async () => { try { await write(prev); } catch (e) { pushToast("error", (e as Error).message); } });
    } catch (e) { pushToast("error", (e as Error).message); throw e; }
  };
  const saveCardPresets = async (list: SavedCardPreset[]) => {
    setStylePresets(list);
    await apiFetch("/api/user-prefs", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: CARD_STYLE_PRESETS_PREF, value: list }) }).catch(() => {});
  };
  // การ์ดใบนี้ตั้งค่าหน้าตาไว้แล้ว (ซิงก์ไม่ต้องทับข้อความ)
  function sketchStyled(id: string | null | undefined): boolean {
    return !!id && (sketchRef.current?.listCards() ?? []).some((c) => String(c.data.id) === String(id) && !!c.data.styled);
  }
  const onBoardReady = useCallback(() => { boardReadyRef.current = true; void Promise.all([syncTaskCards(), syncContentCards(), syncDesignSheetCards(), syncTrendCards()]).then(() => restyleCards()); void placePendingDesignSheets(); void placePendingTrends(); }, [syncTaskCards, syncContentCards, syncDesignSheetCards, syncTrendCards, placePendingDesignSheets, placePendingTrends, restyleCards]);
  const syncAll = useCallback(async () => { await syncTaskCards(); await syncContentCards(); await syncDesignSheetCards(); await syncTrendCards(); await restyleCards(); }, [syncTaskCards, syncContentCards, syncDesignSheetCards, syncTrendCards, restyleCards]);
  // สลับภาษา → รีเฟรชข้อความบนการ์ด (การ์ดเป็น snapshot · ข้าม mount แรก ให้ onReady จัดการ)
  const { lang } = useLang();
  const langMountRef = useRef(false);
  useEffect(() => { if (!langMountRef.current) { langMountRef.current = true; return; } void syncTaskCards(); void syncContentCards(); void syncDesignSheetCards(); }, [lang, syncTaskCards, syncContentCards, syncDesignSheetCards]);

  const items: Record<CardKitItemKey, ToolMenuItem> = {
    sku: { icon: "📦", label: "SKU Card", hint: t("สินค้าราย SKU", "Product SKUs"), onClick: () => { setSkuSel([]); setSkuOpen(true); } },
    parent: { icon: "🧬", label: "Parent SKU", hint: t("สินค้าหลัก", "Parent products"), onClick: () => { setParentSel([]); setParentOpen(true); } },
    marketing: { icon: "🎯", label: t("SKU การตลาด", "Marketing SKU"), hint: t("รุ่น + ป้าย + สีที่เหลือ (จากหน้า SKU การตลาด)", "Model + labels + colors left"), onClick: () => { setMktSel([]); setMktOpen(true); } },
    task: { icon: "✅", label: "Task Card", hint: t("สร้างงานใหม่ + วางการ์ด", "New task + card"), onClick: () => { zoneTargetRef.current = null; setTaskOpen(true); } },
    content: { icon: "📱", label: "Content Card", hint: t("คอนเทนต์ที่จะโพสต์", "Content to post"), onClick: () => { zoneTargetRef.current = null; setCSeed(null); setContentOpen(true); } },
    trend: { icon: "🔥", label: t("เทรนด์", "Trend"), hint: t("บอร์ดเทรนด์ (โทนสี/ref/เลย์เอาต์)", "Trend boards"), onClick: () => setTrendOpen(true) },
    designSheet: { icon: "📐", label: t("ใบงานออกแบบ", "Design sheet"), hint: t("ดึงจาก Design Dashboard หรือสร้างใหม่", "From Design Dashboard, or create new"), onClick: () => { setDsSel([]); setDsPickOpen(true); } },
    section: { icon: "🗂", label: "Section", hint: t("กรอบแบ่งโซนบนกระดาน", "Frame to group the board"), onClick: () => setSectionOpen(true) },
    table: { icon: "▦", label: t("ตาราง", "Table"), hint: t("ตารางคำนวณบนกระดาน", "Spreadsheet card"), onClick: () => void createTableCard() },
    folder: { icon: "📁", label: t("โฟลเดอร์", "Folder"), hint: t("การ์ดลัดเปิดโฟลเดอร์ในเครื่อง", "Shortcut to a local folder"), onClick: () => setFolderOpen(true) },
    asset: { icon: "🖼️", label: t("รูปจากคลัง", "Library image"), hint: t("รูปจากคลังไฟล์กลาง", "From the asset library"), onClick: () => { setAssetSel([]); setAssetOpen(true); } },
    cards: { icon: "🗂️", label: t("การ์ดบนกระดาน", "Cards on board"), hint: t("รายการการ์ดทั้งหมด", "List every card"), onClick: openCards },
    cardStyle: { icon: <Icon value="i:palette" />, label: t("ตั้งค่าการ์ด", "Card settings"), hint: t("ฟอนต์ ขนาด สี บรรทัดที่โชว์ ต่อชนิดการ์ด", "Fonts, sizes, colors and lines per card type"), onClick: () => setStyleOpen(true) },
  };
  const ui = (
    <>
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
            <button type="button" onClick={() => { setMktFields(MKT_FIELDS_ALL); saveMktFields(MKT_FIELDS_ALL); }} className="h-8 flex-1 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">{t("โชว์ทั้งหมด", "Show all")}</button>
            <button type="button" onClick={() => { const v: MktFieldKey[] = ["image", "code", "name"]; setMktFields(v); saveMktFields(v); }} className="h-8 flex-1 rounded-md border border-slate-200 text-xs text-slate-600 hover:bg-slate-50">{t("แบบย่อ (รูป+รหัส+ชื่อ)", "Minimal")}</button>
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
        description={campaign
          ? t("เลือกเทรนด์ที่จะใช้กับแคมเปญนี้ — ดับเบิลคลิกการ์ดบนกระดานจะเปิดบอร์ดเทรนด์", "Pick trends for this campaign — double-click the card opens its trend board")
          : t("เลือกเทรนด์ที่จะวางบนกระดาน — ดับเบิลคลิกการ์ดจะเปิดบอร์ดเทรนด์", "Pick trends to place — double-click the card opens its trend board")}
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
      {dsCreate && <DesignSheetDetail detailOnly hideSendToBoard createMode defaultBrandId={campaign?.brandId ?? null}
        onCreated={(s) => { placeDesignSheetCards([{ id: s.id, code: s.code, name: t("ใบงานใหม่", "New design sheet"), status: null }]); pushToast("success", t(`สร้างใบงาน ${s.code} + วางการ์ดแล้ว`, `Created design sheet ${s.code} and placed card`)); }}
        onDetailClose={() => { setDsCreate(false); void syncDesignSheetCards(); }} />}

      {/* ดับเบิลคลิกการ์ด Parent SKU → ตัวแก้สินค้ากลาง */}
      {parentRecId && <MasterRecordDrawer moduleKey="parent-skus-v2" apiPath="parent-skus" recordId={parentRecId} onClose={() => setParentRecId(null)} onChanged={() => {}} />}

      {/* เลือกรูปจากคลังกลาง (ของกลาง AssetPicker) → กล่องเลือกข้อมูลที่จะดึง → วางการ์ด */}
      <AssetPicker open={assetOpen} onClose={() => setAssetOpen(false)} multiple typeFilter="image"
        title={t("เลือกรูปจากคลังกลาง", "Pick images from library")} contextLabel={contextLabel} onSelect={onAssetPicked} />

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

      {/* เลือกโซน (Section): เทมเพลต bento ทั้งชุด / โซนสำเร็จรูป / พิมพ์เอง · โหมด "จัดการ" = เพิ่ม แก้ ลบ (ย้อนกลับได้) — เจ้าของขอ 2026-11-22 */}
      <ERPModal open={sectionOpen} onClose={() => { setSectionOpen(false); setSecEdit(false); setPresetDraft({}); }} title={t("เพิ่มโซน (Section)", "Add Section")} size="sm"
        footer={<>
          {board && <button onClick={() => { setSecEdit((v) => !v); setPresetDraft({}); }} className={`mr-auto h-9 px-3 text-sm rounded-lg border ${secEdit ? "border-violet-500 bg-violet-600 text-white" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}>{secEdit ? t("✓ เสร็จ", "✓ Done") : t("✎ จัดการ", "✎ Manage")}</button>}
          <button onClick={() => { setSectionOpen(false); setSecEdit(false); }} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>
        </>}>
        <div className="space-y-3">
          {(sectionTpls.length > 0 || (secEdit && board)) && <div className="space-y-1.5">
            <p className="text-xs text-slate-400">{t("วางเทมเพลตโซนทั้งชุด (จัดแบบ bento)", "Place a whole section template (bento)")}</p>
            {sectionTpls.map((tp) => (
              <div key={tp.id} className="flex items-stretch gap-1.5">
                <button onClick={() => (secEdit ? setTplEditor(tp.id) : insertSectionTemplate(tp))} className="min-w-0 flex-1 rounded-lg border border-violet-200 bg-violet-50/40 p-2 text-left hover:border-violet-400">
                  <span className="text-sm font-medium text-violet-800">🧱 {tp.name}</span> <span className="text-xs text-slate-400">· {tp.blocks.length} {t("โซน", "zones")}{secEdit ? ` · ${t("กดเพื่อแก้", "click to edit")}` : ""}</span>
                  <span className="mt-1.5 grid gap-0.5" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gridAutoRows: "10px" }}>
                    {tp.blocks.map((b) => <span key={b.id} className={`rounded-sm ${b.kind === "task" ? "bg-sky-200" : b.kind === "content" ? "bg-emerald-200" : "bg-violet-200"}`} style={{ gridColumn: `${b.x + 1} / span ${b.w}`, gridRow: `${b.y + 1} / span ${b.h}` }} />)}
                  </span>
                </button>
                {secEdit && <div className="flex flex-col gap-1">
                  <button onClick={() => setTplEditor(tp.id)} title={t("แก้ชื่อ / ขนาด / ตำแหน่งโซน", "Edit name / size / position")} className="h-8 w-8 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50">✎</button>
                  <button onClick={() => deleteSectionTemplate(tp)} title={t("ลบเทมเพลต (ย้อนกลับได้)", "Delete template (undoable)")} className="h-8 w-8 rounded-lg border border-slate-200 text-sm text-rose-600 hover:bg-rose-50">✕</button>
                </div>}
              </div>
            ))}
            {secEdit && <button onClick={() => setTplEditor("new")} className="h-9 w-full rounded-lg border border-dashed border-violet-300 text-sm text-violet-700 hover:bg-violet-50">＋ {t("เทมเพลตใหม่", "New template")}</button>}
          </div>}
          {(sectionPresets.length > 0 || (secEdit && presetsEditable)) && <div className={sectionTpls.length > 0 || secEdit ? "border-t border-slate-100 pt-3" : ""}>
            <p className="text-xs text-slate-400 mb-1.5">{secEdit ? t("แก้ชื่อ / ลบโซนสำเร็จรูป (เพิ่มได้จากช่องพิมพ์ข้างล่าง)", "Rename / remove preset zones (add from the box below)") : t("เลือกโซนสำเร็จรูป (กดแล้ววางบนกระดานเลย)", "Choose a preset section (click to place it on the board)")}</p>
            <div className="grid grid-cols-1 gap-1.5">
              {sectionPresets.map((s, i) => secEdit && presetsEditable ? (
                <div key={`${i}-${s}`} className="flex gap-1.5">
                  <input value={presetDraft[i] ?? s} onChange={(e) => setPresetDraft((d) => ({ ...d, [i]: e.target.value }))}
                    onBlur={() => { const v = (presetDraft[i] ?? s).trim(); if (v && v !== s) setPresets(sectionPresets.map((x, j) => (j === i ? v : x)), t(`เปลี่ยนชื่อเป็น “${v}” แล้ว`, `Renamed to “${v}”`), true); setPresetDraft((d) => { const n = { ...d }; delete n[i]; return n; }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className="h-10 flex-1 rounded-lg border border-slate-200 px-3 text-sm" aria-label={t("ชื่อโซน", "Zone name")} />
                  <button onClick={() => setPresets(sectionPresets.filter((_, j) => j !== i), t(`ลบโซน “${s}” แล้ว`, `Removed zone “${s}”`), true)} title={t("ลบ (ย้อนกลับได้)", "Remove (undoable)")} className="h-10 w-10 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50">✕</button>
                </div>
              ) : (
                <button key={s} onClick={() => insertSection(s)} className="w-full text-left h-10 px-3 rounded-lg border border-slate-200 text-sm text-slate-700 hover:border-violet-300 hover:bg-violet-50/40">{s}</button>
              ))}
            </div>
          </div>}
          <div className={sectionPresets.length > 0 || sectionTpls.length > 0 ? "border-t border-slate-100 pt-3" : ""}>
            <p className="text-xs text-slate-400 mb-1.5">{t("หรือพิมพ์ชื่อเอง", "Or type a custom name")}</p>
            <div className="flex gap-2">
              <input value={sectionName} onChange={(e) => setSectionName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sectionName.trim() && insertSection(sectionName)} placeholder={t("ชื่อโซน...", "Section name...")} className="flex-1 min-w-0 h-9 border border-slate-200 rounded-lg px-2 text-sm" />
              <button onClick={() => sectionName.trim() && insertSection(sectionName)} disabled={!sectionName.trim()} className="h-9 px-4 text-sm text-white bg-violet-600 rounded-lg disabled:opacity-50">{t("เพิ่ม", "Add")}</button>
            </div>
            {presetsEditable && sectionName.trim() && !sectionPresets.includes(sectionName.trim()) && (
              <button onClick={() => { setPresets([...sectionPresets, sectionName.trim()], t(`เก็บ “${sectionName.trim()}” เป็นโซนสำเร็จรูปแล้ว`, `Saved “${sectionName.trim()}” as a preset`), true); setSectionName(""); }}
                className="mt-1.5 text-xs text-violet-700 hover:underline">＋ {t("เก็บชื่อนี้เป็นโซนสำเร็จรูป (ไม่วางลงกระดาน)", "Save this name as a preset zone (don't place)")}</button>
            )}
          </div>
        </div>
      </ERPModal>

      {/* ตัวแก้เทมเพลตโซน bento (ของกลางเดียวกับหน้าตั้งค่า) — ปิดแล้วโหลดเทมเพลตใหม่ */}
      <ERPModal open={!!tplEditor} onClose={() => { setTplEditor(null); loadSectionTemplates(true).then(setSectionCfg).catch(() => {}); }} title={t("แก้เทมเพลตโซน (bento)", "Edit section template (bento)")} size="xl"
        footer={<button onClick={() => { setTplEditor(null); loadSectionTemplates(true).then(setSectionCfg).catch(() => {}); }} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>}>
        {tplEditor && <BoardSectionTemplatesManager key={tplEditor} initialTplId={tplEditor} defaultBoard={board} showToast={(m) => pushToast("success", m)} />}
      </ERPModal>

      {/* ป๊อปอัปการ์ดโฟลเดอร์ (ของกลาง) — เก็บ path · ดับเบิลคลิกการ์ด = เปิดโฟลเดอร์ */}
      <FolderCardModal open={folderOpen} onClose={() => setFolderOpen(false)} onPlace={addFolderCard} />

      {/* ป๊อปอัปสรุปการ์ดบนกระดาน */}
      <ERPModal open={cardsOpen} onClose={() => setCardsOpen(false)} title={t("การ์ดบนกระดาน", "Cards on board")} size="md"
        footer={<button onClick={() => setCardsOpen(false)} className="h-9 px-4 text-sm text-slate-700 border border-slate-200 rounded-lg">{t("ปิด", "Close")}</button>}>
        <CardsSummary cards={cards} onOpen={(c) => { setCardsOpen(false); onCardOpen(c.data); }} />
      </ERPModal>

      {/* สร้างงานจริง (ฟอร์มเดียวกับหน้างาน) -- กระดานแคมเปญล็อกแคมเปญนั้น → วางการ์ดงานบนกระดาน */}
      <CreateTaskModal open={taskOpen} onClose={() => setTaskOpen(false)} pushToast={pushToast}
        lockedCampaignId={campaign?.id} lockedCampaignLabel={campaign?.name} onCreated={onTaskCreated} />

      {/* สร้างคอนเทนต์ → วางการ์ดคอนเทนต์ · ป๊อปสร้างคอนเทนต์กลางตัวเต็ม (แบรนด์ · SKU/Parent · เลือกวันจากปฏิทิน) + ส่วนของกระดาน (เจ้าของสั่ง 2026-11-22) */}
      <ContentCreateModal open={contentOpen} onClose={() => { setContentOpen(false); setCSeed(null); }} onCreated={onContentCreated}
        brands={brands} campaigns={campaign ? [{ id: campaign.id, name: campaign.name }] : []} defaultBrandId={task?.brandId ?? campaign?.brandId ?? null}
        preset={contentPreset} pushToast={pushToast} />

      {contentView && <ContentDrawer contentId={String(contentView.id ?? "")} brands={brands} onClose={() => { setContentView(null); void syncContentCards(); }} onChanged={() => void syncContentCards()} onDeleted={(cid) => { sketchRef.current?.removeCards((c) => c.kind === "content" && String(c.data.id ?? "") === cid); pushToast("info", t("เอาการ์ดคอนเทนต์ออกจากกระดานแล้ว", "Removed content card from board")); }} pushToast={pushToast} />}
      {tableView && <TableDrawer tableId={String(tableView.id ?? "")} onClose={() => setTableView(null)}
        onSaved={(tb) => { void sketchRef.current?.replaceCard((c) => c.kind === "table" && String(c.data.id ?? "") === tb.id, tableCardSkeleton(tb)); }}
        onDeleted={(tid) => { sketchRef.current?.removeCards((c) => c.kind === "table" && String(c.data.id ?? "") === tid); pushToast("info", t("เอาตารางออกจากกระดานแล้ว", "Removed table from board")); }}
        pushToast={pushToast} />}
    </>
  );

  // เปิดป๊อปสร้างคอนเทนต์พร้อมของที่เลือกบนกระดาน (รูป r2 key + ร่างแคปชัน) — ใช้ที่กระดานบรีฟของงาน
  const openContentFrom = useCallback((seed: ContentSeed) => {
    setCSeed({ ...seed, caption: seed.caption ?? "" });
    setCForm({ title: seed.title ?? "", post_type: seed.images.length > 1 ? "album" : "image", platforms: [], scheduled_at: "", cardMode: "combined" });
    setContentOpen(true);
  }, []);

  // แถบปุ่มของกรอบโซนที่เลือก (ลอยล่างกลางจอ) — ＋ งาน / ＋ คอนเทนต์ วางการ์ดในกรอบนั้น
  const zoneBar = zone ? (
    <div className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-lg">
      <span className="max-w-[40vw] truncate text-xs text-slate-500">🧱 {zone.name}</span>
      {zone.kind === "task"
        ? <button type="button" onClick={() => { zoneTargetRef.current = zone.id; setTaskOpen(true); }} className="h-8 rounded-full bg-sky-600 px-3 text-sm font-medium text-white hover:bg-sky-700">＋ {t("งาน", "Task")}</button>
        : <button type="button" onClick={() => { zoneTargetRef.current = zone.id; setCSeed(null); setContentOpen(true); }} className="h-8 rounded-full bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700">＋ {t("คอนเทนต์", "Content")}</button>}
    </div>
  ) : null;
  return { items, canDesign, onCardOpen, onBoardReady, syncAll, openContentFrom, ui: <>{ui}{zoneBar}{refsBar}<CardStyleModal open={styleOpen} onClose={() => setStyleOpen(false)} mine={styleMine} team={styleTeam} canTeam={canTeamStyle} presets={stylePresets} onSave={saveCardStyle} onSavePresets={saveCardPresets} /></>, onSelection, onContentChange: onKitContentChange };
}
