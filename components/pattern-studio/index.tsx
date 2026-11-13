"use client";
/**
 * 👜 PatternStudio — สตูดิโอแพทเทิร์น: กระดานวาดชิ้นวัสดุ (ShapeEditor เดิม) + ภาพ 3D + ตัวสร้างจากแม่แบบทรงกระเป๋า
 *   เจ้าของขอ 2026-11-10 "โปรแกรมทำ Pattern กระเป๋าคล้าย CLO3D เวลาทำแบบมี Model 3D ให้ดู" — รอบ 1 จากแผน 6 รอบ
 *
 *   เป็นกรอบครอบ ShapeEditor: รับ prop ชุดเดียวกับ ShapeEditor แบบฝัง แล้วส่งต่อทั้งหมด → ข้อมูลไหลทางเดิม (onChange) ไม่มีที่เก็บใหม่
 *   เพิ่ม 3 อย่าง:
 *     1) ปุ่ม "สร้างจากแม่แบบทรง" → BagTemplateWizard → ชิ้นลงกระดานเป็นชิ้นจริง (แก้ต่อ/ย้อนกลับได้)
 *     2) ปุ่ม "ดู 3D" (จำในเครื่อง · ปิดไว้เป็นค่าเริ่ม = หน้าเดิมเหมือนเดิม) → ชิ้นบนกระดานขึ้นเป็นแผ่น 3D วางบนโต๊ะ ขยับตามทันที
 *     3) เลือกชิ้นฝั่งไหน อีกฝั่งสว่างตาม (กระดาน ↔ 3D)
 *     5) หน้าที่มีเครื่องมือเย็บ: งานข้างในกระเป๋า (2026-11-11) — ปุ่ม "สร้างซับใน" (คัดลอกตัวกระเป๋าเป็นชั้นซับใน) · "เพิ่มช่อง" (ช่องใส่ของ / ช่องซิป → PocketModal)
 *        · สลับดูชั้น ทั้งหมด / ชั้นนอก / ซับใน บนกระดาน · ภาพ 3D ผ่าดูข้างใน (ผ่าหน้า / ผ่าหลัง) · เครื่องมือเส้นในชิ้น (L) ในกระดาน
 *     4) หน้าที่มีเครื่องมือเย็บ (ส่ง sew): ภาพ 3D สลับได้ 2 แบบ — "เย็บติดแล้ว" (lib/pattern-sewn · ค่าเริ่ม) / "ชิ้นแบน" · ลากตะเข็บบนกระดาน ภาพเปลี่ยนตามทันที
 *     6) Bag CAD รอบ A+B (2026-11-12 · หน้าที่ส่ง sew): หน่วยแสดง มม./ซม./นิ้ว (จำในเครื่อง) · รายการชิ้น ล็อก/ซ่อน/แยกดู ตามกลุ่มชั้น
 *        · แผง "ตรวจแบบ" (lib/pattern-check — กดแถวไปที่ชิ้น/ขอบ · ตั้งขอบเปิดตั้งใจได้จากแผง) · ป้ายระดับภาพ 3D (ดูชิ้น / ประกอบตามกติกา / ฟิสิกส์ทดลอง)
 *     7) Bag CAD รอบ C (2026-11-12): เรียนไปทำไป — ปุ่ม "เรียน" (สารบัญ LessonCatalog) + การ์ดบทเรียนลอย LearnCard (learn-panel) · ตัวตรวจ lib/pattern-lessons อ่านชิ้นสด
 *        · พาไปที่เครื่องมือ = ไฮไลต์ปุ่ม/ส่วนของแผงจริง (data-tool / data-guide) · ทำให้ดู = inject (add / patch / seams) ย้อนได้ · เหตุการณ์ที่ผู้ใช้ทำ (เลือกชิ้น / คลิก 3D / เปิดเครื่องมือ / เปิดแผง) นับในหน่วยความจำ
 *     8) Bag CAD รอบ D (2026-11-12): โหมด เริ่มต้น / มาตรฐาน / ขั้นสูง (จำต่อคน useUserPref "pattern_studio_level" · ShapeEditor level) · ช่องค้นหาเครื่องมือ (Ctrl+K หรือ /)
 *        ค้นไทย/อังกฤษ/คำใกล้เคียงจากทะเบียน lib/pattern-tools · กดผล = ถือเครื่องมือ / ไฮไลต์ / เปิดแผง · เครื่องมือโหมดสูงกว่า = สลับโหมดให้แล้วบอก · ดูตัวอย่าง = ToolDemo
 *   จอกว้าง ≥ 1180px = กระดานซ้าย 3D ขวา · แคบกว่า = 3D อยู่ใต้กระดาน
 *   (ไม่ใช้ SplitPanes: ตัวนั้นขยายฝั่งที่ถูกคลิก — กระดานวาดต้องคลิกตลอด จะดันไปมาทุกครั้ง)
 *
 *   <PatternStudio initial={…} materials={…} onChange={applyBoard} readonly={!canEdit} … />
 *
 * ใบงานออกแบบ (ไม่ส่ง sew): ภาพ 3D = ชิ้นแบนอย่างเดียวเหมือนเดิม · เย็บทีละขั้น / จำลองวัสดุ = AssemblyView (แท็บ "ประกอบ 3D" ของแอปสตูดิโอแพทเทิร์น)
 * ใช้ที่: แท็บตีราคา (แบบวาด) ใบงานออกแบบ · คู่มือ: docs/pattern-studio.md
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SEAM_COLORS, ShapeEditor, type EditorPiece, type ResultPiece } from "@/components/pattern-sheet/shape-editor";
import type { Flat3DPiece, Flat3DThread, Pattern3DCut } from "@/components/pattern-3d";
import { pieceEdges, sidePoints, type Seam } from "@/lib/pattern-seams";
import { buildSewn } from "@/lib/pattern-sewn";
import { assemble, bagVolumeLiters, type AsmPiece, type Attach } from "@/lib/pattern-assembly";
import { liningPlan, pocketPlan, type PocketOpts } from "@/lib/pattern-lining";
import { shapeBox } from "@/lib/pattern-shape";
import type { BagParams } from "@/lib/bag-templates";
import type { BagKit, BagStyle, KitAttach, KitOpts, KitParams, KitPiece, KitSeam } from "@/lib/bag-kits";
import type { TplUpdate } from "./template-wizard";
import type { BagPartsResult } from "./bag-parts-modal";
import type { PlanPiece } from "@/lib/pattern-bagparts";
import type { Colorway, ProjectPiece } from "@/lib/pattern-project";
import { ColorwayBar } from "./colorway-bar";
import { ComparePanel, type CompareRef } from "./compare-panel";
import { GradingPanel, type GradeGhost } from "./grading-panel";
import type { GradeSpec } from "@/lib/pattern-grading";
import { LENGTH_UNITS, formatLength, isLengthUnit, type LengthUnit } from "@/lib/length-units";
import { DEFAULT_SEAM_TOL, SEAM_TOL_CHOICES, checkPattern, describeIssue, summarize, type CheckIssue } from "@/lib/pattern-check";
import { PIECE_ROLES, type PieceRole } from "@/lib/pattern-project";
import type { Guide, LessonCtx, LessonDemo } from "@/lib/pattern-lessons";
import type { CopySource, LessonRef } from "./learn-panel";
import { LEVEL_NUM, PATTERN_TOOLS, STUDIO_LEVELS, TOOL_GROUPS, isStudioLevel, searchTools, visibleAt, type StudioLevel, type ToolDef } from "@/lib/pattern-tools";
import { useUserPref } from "@/lib/use-user-pref";

const Pattern3D = dynamic(() => import("@/components/pattern-3d").then((m) => m.Pattern3D), { ssr: false });               // โหลดเมื่อเปิดดู 3D
const PhotoModal = dynamic(() => import("./photo-modal").then((m) => m.PhotoModal), { ssr: false });                        // โหลดเมื่อกดแกะจากรูป
const PocketModal = dynamic(() => import("./pocket-modal").then((m) => m.PocketModal), { ssr: false });                     // โหลดเมื่อกดเพิ่มช่อง
const DxfModal = dynamic(() => import("./dxf-modal").then((m) => m.DxfModal), { ssr: false });                              // โหลดเมื่อกดนำเข้า DXF
const BagTemplateWizard = dynamic(() => import("./template-wizard").then((m) => m.BagTemplateWizard), { ssr: false });      // โหลดเมื่อกดสร้างจากแม่แบบ
const BagPartsModal = dynamic(() => import("./bag-parts-modal").then((m) => m.BagPartsModal), { ssr: false });             // โหลดเมื่อกดชิ้นกระเป๋า (รอบ F2)

const AssemblyView = dynamic(() => import("./assembly-view").then((m) => m.AssemblyView), { ssr: false });
const LearnCard = dynamic(() => import("./learn-panel").then((m) => m.LearnCard), { ssr: false });            // โหลดเมื่อมีบทเรียน
const LessonCatalog = dynamic(() => import("./learn-panel").then((m) => m.LessonCatalog), { ssr: false });    // โหลดเมื่อกด เรียน
const ToolDemo = dynamic(() => import("./tool-demo").then((m) => m.ToolDemo), { ssr: false });                // โหลดเมื่อกด ดูตัวอย่าง                  // โหลดเมื่อเลือก แยกชิ้น / ทีละขั้น / ทิ้งตัว

const SHOW3D_KEY = "pattern-studio-3d";
const SHOW3D_SPLIT_KEY = "pattern-studio-3d-split";   // หน้าที่มีเครื่องมือเย็บ: ภาพ 3D คู่กับกระดาน เปิดเป็นค่าเริ่ม (กุญแจแยก — ค่าที่เคยปิดไว้ของปุ่มเดิมไม่ตามมา)
const SIDE3D_KEY = "pattern-studio-3d-side";
const PCT3D_KEY = "pattern-studio-3d-pct";
const PCT3D_DEFAULT = 38;
const clampPct = (v: number) => Math.max(22, Math.min(60, Math.round(v * 10) / 10));
const VIEW3D_KEY = "pattern-studio-3d-view";
/** แบบของภาพ 3D ในจอเดียว: เย็บติดแล้ว (ตามกระดานทันที) · แยกชิ้น / ทีละขั้น / ทิ้งตัว (ของแท็บ "ประกอบ 3D" เดิม = AssemblyView) · ชิ้นแบน */
type View3D = "sewn" | "explode" | "steps" | "sim" | "flat";
/** ระดับความสามารถของภาพ 3D (สเปก Bag CAD §7.2) — บอกผู้ใช้ว่าภาพนี้ยืนยันอะไรได้ และอะไรยังสรุปไม่ได้ */
const LEVEL_3D: Record<View3D, { th: string; en: string; okTh: string; okEn: string; noTh: string; noEn: string; tone: string }> = {
  flat: { th: "ดูชิ้น (Preview)", en: "Preview", okTh: "รูปชิ้นจากแพทเทิร์นจริง", okEn: "piece shapes from the pattern", noTh: "ยังไม่ยืนยันว่าเย็บประกอบได้", noEn: "not yet proof that it assembles", tone: "bg-slate-100 text-slate-700" },
  sewn: { th: "ประกอบตามกติกา (Assembly)", en: "Assembly", okTh: "ทรงจากตะเข็บจริง", okEn: "the shape from the real seams", noTh: "การย้วย/ยับตามวัสดุจริง", noEn: "real sag or wrinkles of the material", tone: "bg-blue-50 text-blue-800" },
  explode: { th: "ประกอบตามกติกา (Assembly)", en: "Assembly", okTh: "ทรงจากตะเข็บจริง", okEn: "the shape from the real seams", noTh: "การย้วย/ยับตามวัสดุจริง", noEn: "real sag or wrinkles of the material", tone: "bg-blue-50 text-blue-800" },
  steps: { th: "ประกอบตามกติกา (Assembly)", en: "Assembly", okTh: "ลำดับเย็บตามตะเข็บจริง", okEn: "the order of the real seams", noTh: "ขั้นตอนโรงงานจริงทั้งหมด", noEn: "the full factory process", tone: "bg-blue-50 text-blue-800" },
  sim: { th: "ฟิสิกส์ (ทดลอง)", en: "Physics (experimental)", okTh: "แนวโน้มแข็ง/นิ่มต่างกัน", okEn: "the trend of stiff vs soft", noTh: "ตรงตัวอย่างจริง — ค่าวัสดุยังเป็นค่าประมาณ ไม่ได้สอบเทียบ", noEn: "a match to the real sample — material values are estimates, not calibrated", tone: "bg-amber-50 text-amber-800" },
};
const UNIT_KEY = "pattern-studio-unit";
const VIEWS_3D: { key: View3D; th: string; en: string; hintTh: string; hintEn: string }[] = [
  { key: "sewn", th: "เย็บติดแล้ว", en: "Sewn", hintTh: "ภาพตอนเย็บติดแล้ว เปลี่ยนตามกระดานทันที", hintEn: "The sewn result, following the board live" },
  { key: "explode", th: "แยกชิ้น", en: "Pull apart", hintTh: "กระเป๋าที่ประกอบแล้ว ดึงชิ้นแยกออกดู · ติดหู / ปิดหลังช่อง", hintEn: "The assembled bag with pieces pulled apart · attach handles" },
  { key: "steps", th: "ทีละขั้น", en: "Step by step", hintTh: "ลำดับการเย็บทีละขั้น", hintEn: "The sewing order, one step at a time" },
  { key: "sim", th: "ทิ้งตัว", en: "Drape", hintTh: "จำลองวัสดุทิ้งตัว (ทดลอง)", hintEn: "Material drape simulation (experimental)" },
  { key: "flat", th: "ชิ้นแบน", en: "Flat", hintTh: "ชิ้นแบนวางบนโต๊ะ ยังไม่ประกอบ", hintEn: "Flat pieces on the table, not assembled" },
];
const WIDE_PX = 1180;
const SPLIT_PX = 860;   // หน้าที่มีเครื่องมือเย็บ: กว้างเท่านี้ก็วางภาพ 3D คู่กับกระดานซ้าย-ขวาได้ (เดิม 1180 → โน้ตบุ๊กทั่วไปกลายเป็นบน-ล่าง ต้องเลื่อนหา)
type EditorProps = ComponentProps<typeof ShapeEditor>;

/** ชิ้นจากแม่แบบถูกวางลงกระดานแล้ว: รหัสชิ้น (pid) ของแต่ละชนิดชิ้น + คู่ขอบที่ต้องเย็บติดกัน + จุดติดหู/แผ่นหลังช่อง + ค่าแม่แบบที่ใช้ */
export type TemplateInsertInfo = { pidByKey: Record<string, string>; seams: KitSeam[]; attach: KitAttach[]; /** ค่าแม่แบบ Tote (ทรงอื่นไม่มี) */ params?: BagParams; style: BagStyle; /** ค่าทรงอื่น + ตัวเลือกซับใน/ช่อง (รอบ F2) */ kparams?: KitParams; opts?: KitOpts };
/** ชุดแม่แบบล่าสุดที่วางในแพทเทิร์น (เก็บใน template) — ใช้ "อัปเดตชุดเดิม" โดยเก็บงานแก้มือ (รอบ F2) */
export type StudioTpl = { style: BagStyle; params?: BagParams; kparams?: KitParams; opts?: KitOpts; keys?: Record<string, string> };

/** ตะเข็บของแพทเทิร์น (แอปสตูดิโอแพทเทิร์น) — ส่ง = กระดานมีเครื่องมือเย็บ/แก้ตะเข็บในตัว (แบบ CLO: เย็บบนกระดานเดิม ไม่เปลี่ยนหน้า) · start = เปิดกระดานมาถือเครื่องมือเย็บเลย */
export type StudioSew = { seams: Seam[]; onChange: (next: Seam[]) => void; start?: boolean;
  /** แก้จุดติด (ติดหู / ปิดหลังช่อง) จากภาพ 3D แบบ แยกชิ้น — ไม่ส่ง = ดูอย่างเดียว */ onAttachesChange?: (next: Attach[]) => void;
  /** ความอยู่ทรงของชิ้น (ภาพ ทิ้งตัว) */ pieceStiff?: (pid: string, fallback: number) => { s: number; why: string } | null; /** จุดติดหู/แผ่นหลังช่องจากแม่แบบ — ให้ภาพเย็บติดมีหูของแม่แบบด้วย */ attaches?: Attach[];
  /** ค่าคลาดตะเข็บ (ซม.) ของแพทเทิร์นนี้ + เปลี่ยนค่า (ไม่ส่ง onTolChange = ดูอย่างเดียว) */ tol?: number; onTolChange?: (v: number) => void;
  /** ชิ้นที่ล็อก/ซ่อน (เก็บกับแพทเทิร์น) + เปลี่ยน */ view?: PieceView; onViewChange?: (next: PieceView) => void;
  /** บทเรียนของแพทเทิร์นนี้ (template.lesson) + ชื่อแบบฝึก/สำเนา */ lesson?: LessonRef | null; lessonName?: string;
  /** เริ่มบทใหม่ = คืนชิ้นตั้งต้นของบท (เฉพาะแบบฝึก) */ onLessonReset?: () => void;
  /** งานที่เปิดอยู่ (ให้สารบัญสร้าง "สำเนาเพื่อเรียน") */ copySource?: () => CopySource | null;
  /** สร้างแบบฝึก/สำเนาได้ (สิทธิ์แก้) */ canLearn?: boolean;
  /** ชุดแม่แบบล่าสุด + เปลี่ยน (อัปเดตชุดเดิม · รอบ F2) */ tpl?: StudioTpl | null; onTplUpdate?: (next: StudioTpl) => void;
  /** ชุดสี + ชุดที่เลือก (รอบ G2) */ colorways?: Colorway[]; colorway?: string | null; onColorways?: (list: Colorway[], active: string | null) => void;
  /** รุ่นเทียบที่ตั้งไว้ (template.compareRef · รอบ H) + ตั้ง/ล้าง */ compareRef?: CompareRef | null; onSaveCompare?: () => string | null; onClearCompare?: () => void;
  /** ขยายไซซ์ (template.grading · รอบ I2) + เปลี่ยน (คืนข้อความเมื่อเก็บไม่ได้) */ grading?: GradeSpec | null; onGrading?: (g: GradeSpec | null) => string | null; fileBase?: string };
/** ชิ้นที่ล็อก (แก้/ลากไม่ได้) และซ่อน (จาง กดไม่ได้ แต่ยังถูกตรวจ) */
export type PieceView = { lock: string[]; hide: string[] };

export function PatternStudio({ onTemplateInsert, sew, imageName, ...props }: Omit<EditorProps, "open" | "embedded" | "inject" | "onSelChange" | "selectPid" | "onLive" | "hidePids" | "innerLines" | "pieceLinks" | "unit" | "seamTol" | "lockPids" | "flagged" | "focusEdge"> & {
  /** ชื่อไฟล์ของปุ่ม "บันทึกรูป" บนภาพ 3 มิติ (เช่น เลขที่ + ชื่อแพทเทิร์น) */
  imageName?: string;
  /** แจ้งเมื่อวางชิ้นจากแม่แบบ (ไว้สร้างตะเข็บตั้งต้น) — ไม่ส่ง = ไม่ทำอะไรเพิ่ม */
  onTemplateInsert?: (info: TemplateInsertInfo) => void;
  /** ส่ง = มีเครื่องมือเย็บ (N) + แก้ตะเข็บ (B) ในแถบเครื่องมือซ้ายของกระดาน และเห็นด้ายเย็บในภาพ 3D (ใบงานออกแบบไม่ส่ง = ไม่มี) */
  sew?: StudioSew;
}) {
  const t = useT();
  const { readonly = false } = props;
  const [show3d, setShow3dState] = useState(false);
  const show3dKey = sew ? SHOW3D_SPLIT_KEY : SHOW3D_KEY;   // หน้าที่มีเครื่องมือเย็บ = เปิดคู่กับกระดานเป็นค่าเริ่ม · ใบงานออกแบบ = ปิดไว้จนกดปุ่ม (เหมือนเดิม)
  useEffect(() => { try { const v = localStorage.getItem(show3dKey); setShow3dState(v == null ? !!sew : v === "1"); } catch { setShow3dState(!!sew); } }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  const setShow3d = (v: boolean) => { setShow3dState(v); try { localStorage.setItem(show3dKey, v ? "1" : "0"); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const [view3d, setView3dState] = useState<View3D>("sewn");   // แบบของภาพ 3D (จำในเครื่องเฉพาะ เย็บติดแล้ว / ชิ้นแบน — แบบอื่นเป็นการดูชั่วคราว)
  useEffect(() => { try { if (localStorage.getItem(VIEW3D_KEY) === "flat") setView3dState("flat"); } catch { /* อ่านไม่ได้ = เย็บติดแล้ว */ } }, []);
  const setView3d = (v: View3D) => { setView3dState(v); if (v === "sewn" || v === "flat") try { localStorage.setItem(VIEW3D_KEY, v); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  // ฝั่งของภาพ 3D (ซ้ายแบบ CLO เป็นค่าเริ่ม) + ความกว้างเป็น % ของจอ (ลากเส้นแบ่ง · ดับเบิลคลิก = ค่าเริ่ม) — จำในเครื่อง
  const [side3d, setSide3dState] = useState<"left" | "right">("left");
  const [pct3d, setPct3dState] = useState(PCT3D_DEFAULT);
  useEffect(() => { try { if (localStorage.getItem(SIDE3D_KEY) === "right") setSide3dState("right"); const p = Number(localStorage.getItem(PCT3D_KEY)); if (p > 0) setPct3dState(clampPct(p)); } catch { /* อ่านไม่ได้ = ค่าเริ่ม */ } }, []);
  const setSide3d = (v: "left" | "right") => { setSide3dState(v); try { localStorage.setItem(SIDE3D_KEY, v); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const setPct3d = (v: number) => { const c = clampPct(v); setPct3dState(c); try { localStorage.setItem(PCT3D_KEY, String(c)); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const splitRef = useRef<HTMLDivElement | null>(null), splitDrag = useRef(false);
  const [wizard, setWizard] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [draft, setDraft] = useState<{ params: BagParams; notice: string } | null>(null);   // ค่าแม่แบบที่ AI ร่างจากรูปกระเป๋า (เปิดตัวสร้างจากแม่แบบด้วยค่านี้)
  const [inject, setInject] = useState<EditorProps["inject"]>(null);
  const [layer, setLayer] = useState<"all" | "outer" | "lining" | "inner">("all");   // inner = โฟม / ตัวเสริม (รอบ G2)   // ชั้นที่ดูบนกระดาน (ชิ้นของชั้นอื่นจางและกดไม่ได้)
  const [cut, setCut] = useState<Pattern3DCut>("none");                     // ผ่าดูข้างในของภาพ 3D
  const [pocket, setPocket] = useState(false);
  const [bagParts, setBagParts] = useState(false);
  const [cmpOpen, setCmpOpen] = useState(false);                     // เทียบรุ่น (รอบ H)
  const [gradeOpen, setGradeOpen] = useState(false);                 // ขยายไซซ์ (รอบ I2)
  const [gradeGhosts, setGradeGhosts] = useState<GradeGhost[] | null>(null);
  const [overlay, setOverlay] = useState<CompareRef | null>(null);   // ชิ้นกระเป๋า: สาย/หู · กุ๊น · ช่องโชว์ (รอบ F2)
  const [dxf, setDxf] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState<ResultPiece[]>([]);
  const [selPid, setSelPid] = useState<string | null>(null);
  const [selectReq, setSelectReq] = useState<{ nonce: number; pid: string | null } | null>(null);
  // ── Bag CAD รอบ A+B (เฉพาะหน้าที่ส่ง sew) ──
  const [unit, setUnitState] = useState<LengthUnit>("mm");
  useEffect(() => { try { const v = localStorage.getItem(UNIT_KEY); if (isLengthUnit(v)) setUnitState(v); } catch { /* อ่านไม่ได้ = มม. */ } }, []);
  const setUnit = (u: LengthUnit) => { setUnitState(u); try { localStorage.setItem(UNIT_KEY, u); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const [pv, setPv] = useState<PieceView>(() => ({ lock: sew?.view?.lock ?? [], hide: sew?.view?.hide ?? [] }));
  const changeView = (next: PieceView) => { setPv(next); sew?.onViewChange?.(next); };
  const [iso, setIso] = useState<string | null>(null);   // แยกดูชิ้นเดียว (ชั่วคราว ไม่บันทึก)
  const [panel, setPanel] = useState<null | "pieces" | "check">(null);
  const [flagId, setFlagId] = useState<string | null>(null);
  const [focusReq, setFocusReq] = useState<{ nonce: number; pid: string; edge?: number; seam?: string } | null>(null);
  const tol = sew?.tol ?? DEFAULT_SEAM_TOL;
  const L = useCallback((cm: number) => formatLength(cm, unit, { label: t("th", "en") as "th" | "en" }), [unit, t]);
  // ── เรียนไปทำไป (รอบ C) ──
  const [learnOpen, setLearnOpen] = useState(!!sew?.lesson);
  const [catalog, setCatalog] = useState(false);
  const [events, setEvents] = useState<Set<string>>(() => new Set());   // สิ่งที่ผู้ใช้ทำแล้ว (บทเรียนบท 1 นับจากตรงนี้)
  const addEvent = useCallback((k: string) => setEvents((x) => (x.has(k) ? x : new Set(x).add(k))), []);
  const openPanel = (p: null | "pieces" | "check") => { setPanel(p); if (p) addEvent(`panel:${p}`); };
  // ── โหมด + ค้นหาเครื่องมือ (รอบ D) ──
  const [levelKey, setLevelKey] = useUserPref<StudioLevel>("pattern_studio_level", "std", (v) => (isStudioLevel(v) ? v : null));
  const lvNum = sew ? LEVEL_NUM[levelKey] : 3;
  const [toolReq, setToolReq] = useState<{ nonce: number; tool: EditorProps["initialTool"] & string } | null>(null);
  const [tq, setTq] = useState("");
  const [tOpen, setTOpen] = useState(false);
  const [tSel, setTSel] = useState(0);
  const [tMore, setTMore] = useState<string | null>(null);   // ผลที่กางดูรายละเอียด / ตัวอย่าง
  const searchRef = useRef<HTMLInputElement | null>(null);

  // กว้างพอ = ซ้ายขวา · แคบ = บนล่าง (วัดกล่องแม่ ไม่ใช่จอ)
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  const [roomy, setRoomy] = useState(true);   // กว้างพอให้ภาพ 3D กินที่ตามที่ตั้งไว้ — จอแคบ (860–1180) จำกัดภาพ 3D ไม่เกิน 33% ให้กระดานมีที่พอ
  useEffect(() => {
    const el = boxRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const lim = sew ? SPLIT_PX : WIDE_PX;
    const measure = () => { setWide(el.clientWidth >= lim); setRoomy(el.clientWidth >= WIDE_PX); };
    const ro = new ResizeObserver(measure);
    ro.observe(el); measure();
    return () => ro.disconnect();
  }, []);

  const flat: Flat3DPiece[] = useMemo(() => live.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, cut: p.geo.cut, sew: p.geo.sew, holes: p.geo.holesCut, color: p.mats.map((m) => props.matProps?.[m.id]?.color).find(Boolean) })), [live, props.matProps]);
  // ด้ายเย็บในภาพ 3D: ขอบทั้งสองด้านของตะเข็บ (พิกัดกระดาน) สีเดียวกับบนกระดาน
  const threads: Flat3DThread[] = useMemo(() => {
    if (!sew?.seams.length) return [];
    const shapes = new Map(live.map((p) => [p.pid, { shape: p.shape, inner: p.inner }]));
    return sew.seams.flatMap((x, i) => {
      const A = shapes.get(x.a.pid), B = shapes.get(x.b.pid), a = A ? sidePoints(A, x.a) : null, b = B ? sidePoints(B, x.b) : null;   // ด้านบนเส้นในชิ้นหาเส้นเจอ เพราะส่งเส้นในไปด้วย
      return a && b ? [{ a, b, color: SEAM_COLORS[i % SEAM_COLORS.length] }] : [];
    });
  }, [live, sew?.seams]);
  // ภาพเย็บติด: คิดใหม่ทุกครั้งที่ชิ้นหรือตะเข็บเปลี่ยน (ระหว่างลากตะเข็บด้วย) — เฉพาะตอนเปิดดูภาพ 3D แบบเย็บติด
  const wantSewn = !!sew && show3d && view3d === "sewn";
  const asmLive: AsmPiece[] = useMemo(() => live.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, count: p.count, shape: p.shape, holes: p.holes, ...(p.info?.role === "lining" ? { layer: "lining" as const } : {}), ...(p.inner.length ? { inner: p.inner } : {}), ...(p.edgeMeta ? { edgeMeta: p.edgeMeta } : {}) })), [live]);
  const sewnScene = useMemo(() => (wantSewn && sew ? buildSewn(asmLive, sew.seams, sew.attaches ?? []) : null), [wantSewn, asmLive, sew?.seams, sew?.attaches]);   // eslint-disable-line react-hooks/exhaustive-deps
  const liningPids = useMemo(() => new Set(live.filter((p) => p.info?.role === "lining").map((p) => p.pid)), [live]);
  const innerPids = useMemo(() => new Set(live.filter((p) => p.info?.role === "foam" || p.info?.role === "reinforce").map((p) => p.pid)), [live]);   // ชั้นโฟม / ตัวเสริม
  const layerOf = (pid: string) => (liningPids.has(pid) ? "lining" : innerPids.has(pid) ? "inner" : "outer");
  const hidePids = useMemo(() => {
    const out = new Set<string>();
    if (layer !== "all") for (const p of live) if (layerOf(p.pid) !== layer) out.add(p.pid);
    if (sew) { for (const id of pv.hide) out.add(id); if (iso) for (const p of live) if (p.pid !== iso) out.add(p.pid); }
    return out.size ? out : null;
  }, [layer, live, liningPids, innerPids, sew, pv.hide, iso]);   // eslint-disable-line react-hooks/exhaustive-deps
  const lockPids = useMemo(() => (sew && pv.lock.length ? new Set(pv.lock) : null), [sew, pv.lock]);   // eslint-disable-line react-hooks/exhaustive-deps
  // ตรวจแบบ (คิดจากชิ้นสด แต่หน่วงตามหลังการลาก ไม่ให้กระดานกระตุก)
  const liveLazy = useDeferredValue(live);
  const issues: CheckIssue[] = useMemo(() => (sew ? checkPattern(liveLazy.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, count: p.count, shape: p.shape, holes: p.holes, inner: p.inner, allow: p.allow, allowEdges: p.allowEdges, foldEdges: p.foldEdges, edgeMeta: p.edgeMeta, mats: p.mats, notches: p.notches })), sew.seams, { tol }) : []), [liveLazy, sew?.seams, tol]);   // eslint-disable-line react-hooks/exhaustive-deps
  const sum = summarize(issues);
  const flagged = useMemo(() => { const x = issues.find((i) => i.id === flagId); return x ? [{ pid: x.pids[0], edges: x.edges }] : null; }, [issues, flagId]);
  const goIssue = (x: CheckIssue) => { setFlagId(x.id); setFocusReq({ nonce: Date.now(), pid: x.pids[0], ...(x.edges?.length && (x.code === "edge-open" || x.code.startsWith("seam")) ? { edge: x.edges[0] } : {}) }); };
  const openEdges = (x: CheckIssue) => { if (!x.edges?.length) return; setInject({ nonce: Date.now(), pieces: [], edgeOpen: [{ pid: x.pids[0], edges: x.edges }] }); setFlagId(null); };
  const roleOf = (p: ResultPiece): PieceRole => (p.info?.role ?? "body");
  const toggleIn = (list: string[], ids: string[], on: boolean) => (on ? [...new Set([...list, ...ids])] : list.filter((x) => !ids.includes(x)));
  /** สร้างซับใน: คัดลอกชิ้นตัวกระเป๋า (แผ่นหน้า/หลัง + ชิ้นคั่นกลาง ที่ระบบประกอบได้) เป็นชิ้นชั้นซับใน วางใต้ชิ้นทั้งหมด พร้อมตะเข็บชุดเดียวกัน */
  const makeLining = () => {
    if (!sew) return;
    if (liningPids.size) { setNotice(t(`มีชิ้นซับในอยู่แล้ว ${liningPids.size} ชิ้น — ถ้าจะสร้างใหม่ ให้ลบชุดเดิมก่อน`, `There are already ${liningPids.size} lining pieces — delete them first to create a new set`)); return; }
    const A = assemble(asmLive, sew.seams, sew.attaches ?? []);
    if (!A.ok) { setNotice(t("ยังสร้างซับในให้ไม่ได้ เพราะระบบยังไม่เห็นตัวกระเป๋า (ตัวหน้า + ตัวหลัง + ชิ้นคั่นกลาง หรือซองแบน) — เย็บตัวกระเป๋าให้ครบก่อน หรือวาดชิ้นซับในเองแล้วตั้ง ชนิดชิ้น = ซับใน", "Cannot create a lining yet — no bag body (front + back + gusset, or a flat pouch) was found. Finish sewing the body first, or draw the lining pieces yourself and set their type to Lining")); return; }
    const stamp = Date.now().toString(36), body = [...new Set([A.front, A.back, ...A.bridges])];
    const plan = liningPlan(live, sew.seams, body, stamp);
    const pieces: EditorPiece[] = body.flatMap((pid) => {
      const p = live.find((x) => x.pid === pid); if (!p) return [];
      const b = shapeBox(p.shape), no = live.indexOf(p) + 1;
      return [{ pid: plan.map[pid], shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, allowEdges: p.allowEdges, foldEdges: p.foldEdges, name: `${t("ซับใน", "Lining")} ${p.name || `P${no}`}`, info: { role: "lining" as const }, link: { to: pid }, mats: [], at: [b.x, b.y + plan.dy] as [number, number], grain: p.grain, notches: p.notches }];   // ผูกรูปกับตัวนอก: แก้ตัวนอกแล้วซับในตาม
    });
    setInject({ nonce: Date.now(), abs: true, pieces });
    if (plan.seams.length) sew.onChange([...sew.seams, ...plan.seams]);
    setNotice(t(`สร้างซับใน ${pieces.length} ชิ้นแล้ว (วางไว้ใต้ชิ้นเดิม ขนาดเท่าตัวนอก และผูกรูปกับตัวนอก: แก้ตัวนอกแล้วซับในเปลี่ยนตาม) — เลือกวัสดุซับในให้ชิ้นเหล่านี้ และกด เพิ่มช่อง เพื่อใส่ช่องใส่ของ/ช่องซิป`, `Created ${pieces.length} lining pieces (below the originals, same size as the outer) — pick a lining material for them, then use Add pocket`));
  };
  /** ชิ้นตั้งต้นของตัวช่วยเพิ่มช่อง: ชิ้นที่เลือกอยู่ถ้าเป็นแผ่นหน้า/หลังของซับใน · ไม่งั้น = แผ่นหลังของซับใน (ถ้าประกอบได้) · ไม่มีซับใน = ชิ้นที่เลือก */
  const pocketHost = (): string | null => {
    const L = sew ? assemble(asmLive, sew.seams, [], "lining") : null;
    if (L?.ok) return selPid && (selPid === L.front || selPid === L.back) ? selPid : L.back;
    return selPid;
  };
  /** เพิ่มช่องใส่ของ / ช่องซิป: เส้นในบนชิ้นที่ติด + ชิ้นใหม่ + ตะเข็บ (lib/pattern-lining) */
  const addPocket = (hostPid: string, opts: PocketOpts) => {
    setPocket(false);
    const host = live.find((p) => p.pid === hostPid);
    if (!host || !sew) return;
    const stamp = Date.now().toString(36), plan = pocketPlan(shapeBox(host.shape), opts, stamp), newPid = `pk${stamp}`;
    const role = opts.kind === "zip" || host.info?.role === "lining" ? "lining" as const : host.info?.role;
    setInject({ nonce: Date.now(), inner: [{ pid: hostPid, lines: [plan.line] }], pieces: [{ pid: newPid, shape: plan.piece.shape, count: 1, allow: 0, allowEdges: plan.piece.allowEdges, foldEdges: plan.piece.foldEdges, inner: plan.piece.inner, name: t(plan.piece.name, opts.kind === "patch" ? "Pocket" : "Zip pocket bag"), info: role ? { role } : null, mats: [] }] });
    sew.onChange([...sew.seams, { id: `s${stamp}k`, a: { pid: hostPid, from: 0, count: 1, n: 1, inner: plan.line.id }, b: { pid: newPid, ...plan.side }, kind: "lapped" }]);
    setNotice(opts.kind === "zip"
      ? t(`เพิ่มช่องซิปแล้ว: ซิปยาว ${opts.w} ซม. 1 เส้น (เลือกซิปของช่องนี้ได้ที่ปุ่ม ซิป / อะไหล่ แล้วไปตีราคาพร้อมชิ้น)`, `Zip pocket added: one ${opts.w} cm zip (choose its zip under Zips / hardware — it goes to costing with the pieces)`)
      : t("เพิ่มช่องใส่ของแล้ว", "Pocket added"));
  };
  /** ชิ้นจากตัวสร้าง → ชิ้นบนกระดาน */
  const planToEditor = (pc: PlanPiece, pid: string, stamp: string, extra: Partial<EditorPiece> = {}): EditorPiece => ({
    pid, shape: pc.shape, holes: pc.holes ?? [], count: pc.count, allow: pc.allow, foldEdges: pc.foldEdges ?? null, grain: pc.grain ?? null, notches: pc.notches ?? [], name: t(pc.name, pc.nameEn),
    ...(sew && pc.inner?.length ? { inner: pc.inner.map((l) => ({ ...l, id: `${l.id}${stamp}` })) } : {}), ...(pc.edgeMeta ? { edgeMeta: pc.edgeMeta } : {}), ...extra,
  });
  /** ชิ้นกระเป๋า (รอบ F2): สาย/หู · แถบกุ๊น = ชิ้นใหม่ · ช่องโชว์ = เจาะรูชิ้นเดิม + PVC + กรอบ + แผ่นกั้น (+ ตะเข็บแผ่นกั้น) */
  const addBagPart = (r: BagPartsResult) => {
    setBagParts(false);
    const stamp = Date.now().toString(36);
    if (r.kind !== "window") {
      const pid = `bp${stamp}`;
      setInject({ nonce: Date.now(), pieces: [planToEditor(r.piece, pid, stamp)] });
      if (sew && r.piece.selfSeams?.length) { const n = pieceEdges(r.piece.shape).length; sew.onChange([...sew.seams, ...r.piece.selfSeams.map((x, i): Seam => ({ id: `s${stamp}b${i}`, a: { pid, from: x.a, count: 1, n }, b: { pid, from: x.b, count: 1, n }, ...(x.rev ? { rev: true } : {}), self: true, name: t("เย็บสาย", "Strap seam") }))]); }
      setNotice(r.kind === "strap" ? t(`เพิ่มสาย/หูแล้ว: ${r.piece.name} · ตัด ${r.piece.count} ชิ้น`, `Strap added: ${r.piece.nameEn} · cut ${r.piece.count}`) : t(`เพิ่มแถบกุ๊นแล้ว: ตัด ${r.piece.count} เส้น`, `Binding added: cut ${r.piece.count} strip(s)`));
      return;
    }
    const host = live.find((p) => p.pid === r.hostPid);
    if (!host) return;
    const plan = r.plan, divPid = `dv${stamp}`, pieces: EditorPiece[] = [planToEditor(plan.pvc, `pv${stamp}`, stamp)];
    if (plan.frame) pieces.push(planToEditor(plan.frame, `fr${stamp}`, stamp));
    if (plan.divider) pieces.push(planToEditor(plan.divider, divPid, stamp, { ...(sew ? { link: { to: host.pid } } : {}), ...(host.info?.role ? { info: { role: host.info.role } } : {}), mats: host.mats }));
    setInject({ nonce: Date.now(), pieces, patch: [{ pid: host.pid, holes: [...host.holes, plan.hole] }] });
    if (sew && plan.divider && plan.dividerSide) sew.onChange([...sew.seams, { id: `s${stamp}w`, a: { pid: host.pid, ...plan.dividerSide }, b: { pid: divPid, ...plan.dividerSide }, kind: "lapped", name: t("แผ่นกั้นช่องโชว์", "Window divider") }]);
    setShow3d(true);
    setNotice(plan.divider ? t(`เจาะช่องโชว์บน ${host.name || "ชิ้น"} แล้ว + แผ่น PVC${plan.frame ? " + กรอบ" : ""} + ${plan.divider.name} (เย็บประกบตัวนี้ ได้ช่องโชว์ 1 ช่อง)`, `Window cut in ${host.name || "the piece"} + PVC${plan.frame ? " + frame" : ""} + ${plan.divider.nameEn} (sewn to it: 1 display compartment)`)
      : t(`เจาะช่องโชว์บน ${host.name || "ชิ้น"} แล้ว + แผ่น PVC${plan.frame ? " + กรอบ" : ""}`, `Window cut in ${host.name || "the piece"} + PVC${plan.frame ? " + frame" : ""}`));
  };
  /** ชิ้นแม่แบบ → ชิ้นบนกระดาน (เหมือนตอนวาง) */
  const kitToEditor = (q: KitPiece, pid: string, keys: Record<string, string>): EditorPiece => ({
    pid, shape: q.shape, holes: q.holes, count: q.count, allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges, name: q.name, grain: q.grain, notches: q.notches,
    ...(q.edgeMeta ? { edgeMeta: q.edgeMeta } : {}), ...(q.lining ? { mats: [] } : {}),
    ...(sew && q.inner ? { inner: q.inner } : {}), ...(sew && q.lining ? { info: { role: "lining" as const } } : {}), ...(sew && q.linkTo && keys[q.linkTo] ? { link: { to: keys[q.linkTo] } } : {}),
  });
  const tpl = sew?.tpl ?? null;
  // รุ่นเทียบซ้อนบนกระดาน: ชิ้นที่ยังมีอยู่ วางรูปรุ่นเก่าตรงมุมซ้ายบนของชิ้นปัจจุบัน (เห็นขนาดที่ต่าง) · ชิ้นที่หายไปอยู่ที่เดิม
  const cmpGhosts = useMemo(() => {
    if (!overlay) return null;
    return overlay.pieces.map((o) => {
      const cur = live.find((p) => p.pid === o.pid);
      if (!cur) return { shape: o.shape, holes: o.holes };
      const a = shapeBox(o.shape), b = shapeBox(cur.shape), dx = b.x - a.x, dy = b.y - a.y;
      const mv = (s: typeof o.shape) => (s.k === "path" ? { ...s, nodes: s.nodes.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy })) } : { ...s, x: s.x + dx, y: s.y + dy });
      return { shape: mv(o.shape), holes: (o.holes ?? []).map(mv) };
    });
  }, [overlay, live]);
  const ghosts = useMemo(() => (cmpGhosts || gradeGhosts ? [...(cmpGhosts ?? []), ...(gradeGhosts ?? [])] : null), [cmpGhosts, gradeGhosts]);
  const tplNow = useMemo(() => (tpl?.keys ? Object.entries(tpl.keys).flatMap(([key, pid]) => { const p = live.find((x) => x.pid === pid); return p ? [{ key, pid, shape: p.shape, holes: p.holes, allow: p.allow, allowEdges: p.allowEdges, foldEdges: p.foldEdges, notches: p.notches ?? [] }] : []; }) : []), [tpl, live]);
  /** อัปเดตชุดแม่แบบเดิม (รอบ F2): แก้ชิ้นที่ไม่ได้แก้มือ · เพิ่มชิ้นใหม่ · ตะเข็บระหว่างชิ้นที่ตรงแม่แบบสร้างใหม่ · ตะเข็บอื่นคงไว้ */
  const applyTplUpdate = (u: TplUpdate) => {
    setWizard(false); setDraft(null);
    if (!sew || !tpl?.keys) return;
    const stamp = Date.now().toString(36), keys = { ...tpl.keys };
    const add = u.add.filter((q) => sew || q.key !== "lpocket");
    add.forEach((q, i) => { keys[q.key] = `pc${stamp}u${i}`; });
    const fresh = new Set([...u.plan.update, ...(u.overwrite ? u.plan.edited : []), ...u.plan.same].map((x) => x.pid).concat(add.map((q) => keys[q.key])));
    const side = (pid: string, x: KitSeam["a"]) => ({ pid, from: x.from, count: x.count, n: x.n, ...(x.t0 != null && x.t1 != null ? { t0: x.t0, t1: x.t1 } : {}), ...(x.inner ? { inner: x.inner } : {}) });
    const keep = sew.seams.filter((x) => !(fresh.has(x.a.pid) && fresh.has(x.b.pid)));
    const made: Seam[] = u.kit.seams.flatMap((r, i) => { const a = keys[r.a.piece], b = keys[r.b.piece]; return a && b && fresh.has(a) && fresh.has(b) ? [{ id: `s${stamp}u${i}`, a: side(a, r.a), b: side(b, r.b), ...(r.kind ? { kind: r.kind } : {}) }] : []; });
    setInject({ nonce: Date.now(), pieces: add.map((q) => kitToEditor(q, keys[q.key], keys)), patch: u.patch.map((x) => ({ pid: x.pid, shape: x.shape, holes: x.holes, notches: x.notches, grain: x.grain, allow: x.allow, allowEdges: x.allowEdges, foldEdges: x.foldEdges })), seams: [...keep, ...made] });
    sew.onTplUpdate?.({ style: u.kit.style, ...(u.kit.params ? { params: u.kit.params } : {}), ...(u.kit.kparams ? { kparams: u.kit.kparams } : {}), ...(u.kit.opts ? { opts: u.kit.opts } : {}), keys });
    setShow3d(true);
    const kept = u.overwrite ? 0 : u.plan.edited.length;
    setNotice(t(`อัปเดตชุดเดิมแล้ว: เปลี่ยน ${u.patch.length} ชิ้น · เพิ่ม ${add.length}${kept ? ` · เก็บชิ้นที่แก้มือไว้ ${kept} ชิ้น (${u.plan.edited.map((x) => x.piece.name).join(", ")})` : ""}${u.plan.gone.length ? ` · ชิ้นที่ไม่มีในค่าใหม่ ${u.plan.gone.length} ชิ้นยังอยู่ (ลบเองถ้าไม่ใช้)` : ""}`,
      `Set updated: ${u.patch.length} changed · ${add.length} added${kept ? ` · ${kept} hand-edited kept` : ""}${u.plan.gone.length ? ` · ${u.plan.gone.length} unused piece(s) left in place` : ""}`));
  };
  // สีของชิ้นในภาพ 3D: ชุดสีที่เลือก (รอบ G2) → สีของวัสดุ · ลายผ้าขนาดจริงจากค่าของวัสดุ
  const colorway = sew?.colorways?.find((c) => c.id === sew?.colorway) ?? null;
  const pieceColors = useMemo(() => { const out: Record<string, string> = {}; for (const p of live) { const c = p.mats.map((m) => colorway?.colors[m.id] ?? props.matProps?.[m.id]?.color).find(Boolean); if (c) out[p.pid] = c; } return out; }, [live, props.matProps, colorway]);
  const pieceTex = useMemo(() => { const out: Record<string, { kind: string; size: number; color2?: string }> = {}; for (const p of live) { const x = p.mats.map((m) => props.matProps?.[m.id]?.tex).find(Boolean); if (x) out[p.pid] = x; } return out; }, [live, props.matProps]);
  const cwMats = useMemo(() => { const seen = new Map<string, { id: string; name: string; color: string }>(); for (const p of live) for (const m of p.mats) if (!seen.has(m.id)) seen.set(m.id, { id: m.id, name: m.name, color: props.matProps?.[m.id]?.color ?? "#d8c08c" }); return [...seen.values()]; }, [live, props.matProps]);
  const sewnOn = !!sewnScene && sewnScene.joined > 0;
  const onLive = useCallback((pieces: ResultPiece[]) => setLive(pieces), []);
  const onSel = useCallback((pid: string | null) => setSelPid(pid), []);
  const pick3d = useCallback((pid: string | null) => { setSelectReq({ nonce: Date.now(), pid }); if (pid) addEvent("pick-3d"); }, [addEvent]);
  useEffect(() => { if (selPid) addEvent("sel"); }, [selPid, addEvent]);
  useEffect(() => { addEvent(`unit:${unit}`); }, [unit, addEvent]);
  /** วางชุดแม่แบบ (lib/bag-kits) ลงกระดาน: ชิ้นตัวนอก + ซับใน + ช่องใส่ของ — รหัสชิ้นกำหนดที่นี่ → ตะเข็บตั้งต้น/การผูกรูปอ้างถึงได้ */
  const insert = (kit: BagKit) => {
    setWizard(false); setDraft(null);
    const stamp = Date.now().toString(36), pidByKey: Record<string, string> = {};
    // หน้าที่ไม่มีเครื่องมือเย็บ (ใบงานออกแบบ): ไม่มีเส้นใน/ชั้นซับใน/ผูกรูป → ชิ้นซับในเป็นชิ้นธรรมดา และไม่วางช่องใส่ของ (ต้องเย็บกับเส้นใน)
    const list = sew ? kit.pieces : kit.pieces.filter((q) => q.key !== "lpocket");
    list.forEach((q, i) => { pidByKey[q.key] = `pc${stamp}t${i}`; });
    setInject({ nonce: Date.now(), pieces: list.map((q) => ({
      pid: pidByKey[q.key], shape: q.shape, holes: q.holes, count: q.count, allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges, name: q.name, at: q.at, grain: q.grain, notches: q.notches,
      ...(q.edgeMeta ? { edgeMeta: q.edgeMeta } : {}), ...(q.lining ? { mats: [] } : {}),
      ...(sew && q.inner ? { inner: q.inner } : {}), ...(sew && q.lining ? { info: { role: "lining" as const } } : {}), ...(sew && q.linkTo && pidByKey[q.linkTo] ? { link: { to: pidByKey[q.linkTo] } } : {}),
    })) });
    setShow3d(true);
    onTemplateInsert?.({ pidByKey, seams: kit.seams.filter((x) => pidByKey[x.a.piece] && pidByKey[x.b.piece]), attach: kit.attach, params: kit.params, style: kit.style, kparams: kit.kparams, opts: kit.opts });
    const nl = list.filter((q) => q.lining).length, had = (sew?.seams.length ?? 0) > 0;
    if (nl && sew) setLayer("outer");   // ชิ้นเยอะ: เริ่มที่ชั้นนอกก่อน (ซับในจางไว้) — สลับดูได้ที่ปุ่ม ทุกชั้น / ชั้นนอก / ซับใน
    if (had) setNotice(t(`วางแล้ว ${list.length} แบบ — แพทเทิร์นนี้มีกระเป๋าที่เย็บไว้อยู่แล้ว ภาพ 3 มิติประกอบได้ทีละ 1 ใบ (อีกใบจะขึ้นว่ายังประกอบไม่ได้) · แนะนำให้สร้างแพทเทิร์นใหม่สำหรับทรงใหม่`, `Placed ${list.length} patterns — this pattern already has a sewn bag and the 3D view assembles one bag at a time (the other shows as not assembled) · create a new pattern for a new style`));
    else if (nl) setNotice(t(`วางแล้ว ${list.length} แบบ รวมซับใน ${nl} แบบ (วางไว้ใต้ชุดตัวนอก${sew ? " ผูกรูปกับตัวนอก: แก้ตัวนอกแล้วซับในเปลี่ยนตาม · ตอนนี้กระดานโชว์ชั้นนอก สลับดูซับในได้ที่ปุ่ม ทุกชั้น / ชั้นนอก / ซับใน" : ""}) — เลือกวัสดุซับในให้ชิ้นเหล่านั้นด้วย`, `Placed ${list.length} patterns including ${nl} lining patterns (below the outer set) — pick a lining material for them`));
  };

  const lessonCtx: LessonCtx = useMemo(() => ({ pieces: liveLazy.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, shape: p.shape, holes: p.holes, allow: p.allow, allowEdges: p.allowEdges })), seams: sew?.seams ?? [], selPid, events, tol }), [liveLazy, sew?.seams, selPid, events, tol]);   // eslint-disable-line react-hooks/exhaustive-deps
  /** ไฮไลต์ของจริงบนจอ (ปุ่มเครื่องมือ / ส่วนของแผง) — ตั้งค่าไม่ให้ขยับ = ขอบน้ำเงินค้าง 2.5 วิ แทนการกะพริบ */
  const flash = (el: Element | null) => {
    if (!el) { setNotice(t("ไม่เจอส่วนนี้บนจอ — เลือกชิ้นก่อน หรือกางแผงขวาของกระดาน แล้วลองอีกครั้ง", "Couldn't find that on screen — select a piece or open the board's right panel, then try again")); return; }
    const h = el as HTMLElement, still = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    h.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    if (still || !h.animate) { const o = h.style.outline; h.style.outline = "3px solid #2563eb"; setTimeout(() => { h.style.outline = o; }, 2500); }
    else h.animate([{ boxShadow: "0 0 0 0 rgba(37,99,235,0)" }, { boxShadow: "0 0 0 5px rgba(37,99,235,.6)" }, { boxShadow: "0 0 0 0 rgba(37,99,235,0)" }], { duration: 900, iterations: 3 });
  };
  const guide = (g: Guide, pid: string | null) => {
    if (g.view3d && !show3d) setShow3d(true);
    if (g.select && pid && !lockPids?.has(pid)) setSelectReq({ nonce: Date.now(), pid });
    if (g.seam && sew) { const sm = [...sew.seams].reverse().find((x) => x.a.pid !== x.b.pid && !x.a.inner && !x.b.inner); if (sm) setFocusReq({ nonce: Date.now(), pid: sm.a.pid, seam: sm.id }); }
    const sel = g.el ? `[data-guide="${g.el}"]` : g.tool ? `[data-tool="${g.tool}"]` : g.panel === "check" ? "[data-studio-check]" : g.panel === "pieces" ? "[data-studio-pieces]" : g.view3d ? "[data-pane-3d]" : null;
    if (sel) setTimeout(() => flash(boxRef.current?.querySelector(sel) ?? document.querySelector(sel)), 350);
  };
  /** ทำให้ดู: ส่งเข้ากระดานด้วยคำสั่งเดียวกับงานปกติ (ย้อนกลับได้ด้วย Ctrl+Z) */
  const demo = (d: LessonDemo) => {
    setInject({ nonce: Date.now(), pieces: (d.add ?? []).map((a) => ({ shape: a.shape, count: 1, allow: a.allow ?? 0, name: a.name, mats: [] })), ...(d.patch?.length ? { patch: d.patch } : {}), ...(d.seams ? { seams: d.seams } : {}) });
  };
  /** เปลี่ยนโหมด = เปลี่ยนแค่สิ่งที่โชว์ (ข้อมูล/ชิ้นที่เลือกอยู่ครบ) */
  const setLevel = (k: StudioLevel) => { setLevelKey(k); if (LEVEL_NUM[k] < 3 && view3d === "sim") setView3d("sewn"); };
  useEffect(() => { if (lvNum < 3 && view3d === "sim") setView3d("sewn"); }, [lvNum]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Ctrl+K หรือ / (นอกช่องพิมพ์) = ไปที่ช่องค้นหาเครื่องมือ
  useEffect(() => {
    if (!sew) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null, inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") || (e.key === "/" && !inField && !e.ctrlKey && !e.metaKey)) { e.preventDefault(); searchRef.current?.focus(); setTOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sew]);
  const tResults: ToolDef[] = useMemo(() => (tq.trim() ? searchTools(tq) : PATTERN_TOOLS.filter((d) => visibleAt(d, lvNum))).slice(0, tq.trim() ? 12 : 60), [tq, lvNum]);
  /** ใช้เครื่องมือจากผลค้นหา: ถือเครื่องมือ / ไฮไลต์ส่วนของแผง / เปิดแผง — อยู่โหมดสูงกว่า = สลับโหมดให้แล้วบอก */
  const runTool = (d: ToolDef) => {
    setTOpen(false); setTq(""); setTMore(null); searchRef.current?.blur();
    if (d.level > lvNum) { const k = d.level === 3 ? "adv" : "std"; setLevel(k); setNotice(t(`"${d.th}" อยู่ในโหมด${d.level === 3 ? "ขั้นสูง" : "มาตรฐาน"} — สลับโหมดให้แล้ว (ข้อมูลไม่เปลี่ยน · กลับได้ที่ปุ่มโหมด)`, `"${d.en}" is in ${d.level === 3 ? "Advanced" : "Standard"} mode — switched for you (your data is unchanged · switch back with the mode buttons)`)); }
    const tg = d.target, later = (sel: string) => setTimeout(() => flash(boxRef.current?.querySelector(sel) ?? document.querySelector(sel)), 380);
    if (tg.kind === "tool") { setToolReq({ nonce: Date.now(), tool: tg.tool as EditorProps["initialTool"] & string }); later(`[data-tool="${tg.tool}"]`); }
    else if (tg.kind === "guide") guide({ el: tg.el, select: tg.select }, selPid ?? live[0]?.pid ?? null);
    else if (tg.kind === "view3d") { setShow3d(true); setView3d(tg.view); later(`[data-view3d="${tg.view}"]`); }
    else {
      const id = tg.id;
      if (id === "check" || id === "pieces") { openPanel(id); later(`[data-studio-${id}]`); }
      else if (id === "learn") { if (sew?.lesson) setLearnOpen(true); else setCatalog(true); }
      else if (id === "template" && !readonly) { setDraft(null); setWizard(true); }
      else if (id === "photo" && !readonly) setPhoto(true);
      else if (id === "dxf" && !readonly) setDxf(true);
      else if (id === "bagparts" && !readonly) setBagParts(true);
      else if (id === "compare") { setCmpOpen(true); later("[data-studio-compare]"); }
      else if (id === "grading") { setGradeOpen(true); later("[data-studio-grading]"); }
      else later(id === "print" ? "[data-open-preflight]" : id === "export" ? "[data-export-project]" : id === "trims" ? "[data-trims-open]" : id === "unit" ? "[data-unit]" : `[data-studio-${id}]`);
    }
  };
  const toolSearch = sew ? (
    <div className="relative" data-tool-search>
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"><Icon value="i:search" className="text-sm" /></span>
      <input ref={searchRef} value={tq} onChange={(e) => { setTq(e.target.value); setTSel(0); setTOpen(true); setTMore(null); }} onFocus={() => setTOpen(true)}
        onBlur={(e) => { const next = e.relatedTarget as HTMLElement | null; if (!next || !next.closest("[data-tool-search]")) setTimeout(() => setTOpen(false), 120); }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setTSel((i) => Math.min(tResults.length - 1, i + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setTSel((i) => Math.max(0, i - 1)); }
          else if (e.key === "Enter") { e.preventDefault(); const d = tResults[tSel]; if (d) runTool(d); }
          else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setTOpen(false); setTq(""); (e.currentTarget as HTMLInputElement).blur(); }
        }}
        placeholder={t("ค้นหาเครื่องมือ เช่น เผื่อเย็บ  (Ctrl+K)", "Find a tool, e.g. allowance  (Ctrl+K)")} aria-label={t("ค้นหาเครื่องมือ", "Find a tool")} role="combobox" aria-expanded={tOpen} aria-controls="pattern-tool-results"
        className="h-8 w-60 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-xs focus:border-blue-400 focus:outline-none" />
      {tOpen && (
        <div id="pattern-tool-results" role="listbox" className="absolute right-0 top-9 z-40 max-h-[70vh] w-[min(440px,90vw)] overflow-auto rounded-xl border border-slate-200 bg-white p-1.5 text-xs shadow-xl">
          {!tq.trim() && <p className="px-2 py-1 text-[11px] text-slate-500">{t(`คู่มือเครื่องมือ · โหมด${STUDIO_LEVELS.find((m) => m.key === levelKey)?.th} · พิมพ์ไทยหรืออังกฤษก็ได้ เช่น ตะเข็บ, offset, มุมมน`, `Tool guide · ${STUDIO_LEVELS.find((m) => m.key === levelKey)?.en} mode · type Thai or English, e.g. seam, offset, round`)}</p>}
          {tq.trim() && !tResults.length && <p className="px-2 py-2 text-slate-500">{t("ไม่พบ — ลองคำอื่น เช่น เย็บ, วัด, ซิป, dxf", "Nothing found — try another word, e.g. sew, measure, zip, dxf")}</p>}
          {tResults.map((d, i) => {
            const prev = tResults[i - 1], head = !tq.trim() && (!prev || prev.group !== d.group), more = tMore === d.id;
            return (
              <div key={d.id}>
                {head && <div className="mt-1 px-2 pb-0.5 pt-1 text-[11px] font-medium text-slate-400">{t(TOOL_GROUPS[d.group].th, TOOL_GROUPS[d.group].en)}</div>}
                <div role="option" aria-selected={i === tSel} data-tool-result={d.id} className={`rounded-lg ${i === tSel ? "bg-blue-50" : "hover:bg-slate-50"}`} onMouseEnter={() => setTSel(i)}>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Icon value={`i:${d.icon}`} className="shrink-0 text-sm text-slate-500" />
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runTool(d)} className="min-w-0 flex-1 text-left">
                      <span className="font-medium text-slate-800">{d.th}</span><span className="text-slate-400"> · {d.en}</span>
                      {d.level > lvNum && <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-800">{d.level === 3 ? t("ขั้นสูง", "Advanced") : t("มาตรฐาน", "Standard")}</span>}
                    </button>
                    {d.key && <kbd className="rounded border border-slate-200 bg-slate-50 px-1 text-[10px] text-slate-500">{d.key}</kbd>}
                    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setTMore(more ? null : d.id)} aria-expanded={more} aria-label={t(`วิธีใช้ ${d.th}`, `How to use ${d.en}`)} title={t("วิธีใช้ / ดูตัวอย่าง", "How to / see an example")} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"><Icon value={more ? "i:chevron-up" : "i:chevron-down"} /></button>
                  </div>
                  {more && (
                    <div className="space-y-1.5 border-t border-slate-100 px-3 pb-2 pt-1.5" data-tool-more>
                      <p className="text-slate-600">{t(d.desc.th, d.desc.en)}</p>
                      <ol className="list-decimal space-y-0.5 pl-4 text-slate-600">{d.steps.map((x, k) => <li key={k}>{t(x.th, x.en)}</li>)}</ol>
                      {d.demo && <ToolDemo id={d.demo} label={t(`ตัวอย่าง: ${d.th}`, `Example: ${d.en}`)} />}
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => runTool(d)} className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-white hover:bg-blue-700"><Icon value="i:pointer" />{t("ใช้เครื่องมือนี้", "Use this tool")}</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  ) : null;
  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs";
  return (
    <div ref={boxRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700"><Icon value="i:shopping-bag" className="text-sm" />{t("สตูดิโอแพทเทิร์น", "Pattern studio")}</span>
        {!readonly && (
          <button type="button" data-studio-template onClick={() => { setDraft(null); setWizard(true); }} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:wand" className="text-sm" />{t("สร้างจากแม่แบบทรง", "Create from a bag template")}
          </button>
        )}
        {!readonly && lvNum >= 2 && (
          <button type="button" data-studio-photo onClick={() => setPhoto(true)} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:photo" className="text-sm" />{t("แกะจากรูป", "Start from a photo")}
          </button>
        )}
        {!readonly && lvNum >= 2 && (
          <button type="button" data-studio-dxf onClick={() => setDxf(true)} title={t("นำเข้าแพทเทิร์นจากไฟล์ DXF เช่น ที่ส่งออกจาก CLO3D", "Import a pattern from a DXF file, e.g. exported from CLO3D")} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:file-import" className="text-sm" />{t("นำเข้า DXF", "Import DXF")}
          </button>
        )}
        {!readonly && sew && lvNum >= 2 && <>
          <button type="button" data-studio-lining onClick={makeLining} title={t("คัดลอกชิ้นตัวกระเป๋าเป็นชั้นซับใน พร้อมตะเข็บ", "Copy the body pieces into a lining layer, with their seams")} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:layers-subtract" className="text-sm" />{t("สร้างซับใน", "Create lining")}
          </button>
          <button type="button" data-studio-pocket onClick={() => setPocket(true)} disabled={!live.length} title={t("ช่องใส่ของ หรือ ช่องซิป บนชิ้นที่เลือก", "A patch pocket or a zip pocket on a piece")} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-40`}>
            <Icon value="i:square-plus" className="text-sm" />{t("เพิ่มช่อง", "Add pocket")}
          </button>
          <button type="button" data-studio-compare onClick={() => setCmpOpen(!cmpOpen)} aria-pressed={cmpOpen} title={t("เทียบกับรุ่นที่ตั้งไว้ หรือไฟล์โปรเจกต์รุ่นเก่า — ชิ้นไหนเปลี่ยน + ซ้อนบนกระดาน", "Compare with a saved reference or an older project file — what changed + overlay on the board")} className={`${btn} ${cmpOpen ? "border-pink-300 bg-pink-50 text-pink-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <Icon value="i:layers-subtract" className="text-sm" />{t("เทียบรุ่น", "Compare")}{overlay ? " ●" : ""}
          </button>
          {(lvNum >= 3 || gradeOpen || !!sew?.grading) && <button type="button" data-studio-grading onClick={() => setGradeOpen(!gradeOpen)} aria-pressed={gradeOpen} title={t("ขยายไซซ์: ตั้งกฎ แล้วดูทุกไซซ์ซ้อนกัน + ตรวจตะเข็บทุกไซซ์ + ไฟล์ทุกไซซ์", "Size grading: set rules, overlay every size, check seams in every size, all-sizes file")} className={`${btn} ${gradeOpen ? "border-sky-300 bg-sky-50 text-sky-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}>
            <Icon value="i:ruler-measure" className="text-sm" />{t("ขยายไซซ์", "Grading")}{sew?.grading ? ` (${sew.grading.sizes.length})` : ""}
          </button>}
          <button type="button" data-studio-bagparts onClick={() => setBagParts(true)} title={t("สาย/หู · แถบกุ๊นที่ต้องตัด · ช่องโชว์ (หัวใจ เมฆ แมว หมี SVG) บนชิ้น", "Straps · binding strips · display windows (heart, cloud, cat, bear, SVG) on a piece")} className={`${btn} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}>
            <Icon value="i:shopping-bag" className="text-sm" />{t("ชิ้นกระเป๋า", "Bag parts")}
          </button>
        </>}
        {sew && <>
          <button type="button" data-studio-learn onClick={() => { if (sew.lesson && !learnOpen) setLearnOpen(true); else setCatalog(true); }} aria-pressed={!!sew.lesson && learnOpen}
            title={t("เรียนไปทำไป: บทเรียนทำแพทเทิร์นที่ตรวจจากงานจริง", "Learn by doing: pattern lessons checked from your real work")}
            className={`${btn} ${sew.lesson ? "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
            <Icon value="i:book" className="text-sm" />{sew.lesson ? t(`บทเรียน ${sew.lesson.id}`, `Lesson ${sew.lesson.id}`) : t("เรียน", "Learn")}
          </button>
          <button type="button" data-studio-pieces onClick={() => openPanel(panel === "pieces" ? null : "pieces")} aria-pressed={panel === "pieces"} title={t("รายการชิ้น: ล็อก / ซ่อน / แยกดู ตามกลุ่ม", "Piece list: lock / hide / isolate by group")}
            className={`${btn} ${panel === "pieces" ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
            <Icon value="i:list" className="text-sm" />{t("รายการชิ้น", "Pieces")}
            {(pv.lock.length > 0 || pv.hide.length > 0 || iso) && <span className={`rounded-full px-1.5 text-[11px] ${panel === "pieces" ? "bg-white/20" : "bg-slate-100 text-slate-600"}`}>{t(`ล็อก ${pv.lock.length} · ซ่อน ${pv.hide.length}${iso ? " · แยกดู" : ""}`, `${pv.lock.length} locked · ${pv.hide.length} hidden${iso ? " · isolated" : ""}`)}</span>}
          </button>
          <button type="button" data-studio-check onClick={() => openPanel(panel === "check" ? null : "check")} aria-pressed={panel === "check"} title={t("ตรวจแบบก่อนผลิต: ตะเข็บ ขอบที่ยังไม่ได้เย็บ รูปชิ้น วัสดุ", "Check before production: seams, unsewn edges, piece shapes, materials")}
            className={`${btn} ${panel === "check" ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
            <Icon value="i:list-check" className="text-sm" />{t("ตรวจแบบ", "Check")}
            {sum.errors > 0 && <span className="rounded-full bg-red-600 px-1.5 text-[11px] text-white" title={t("ต้องแก้", "Must fix")}>{sum.errors}</span>}
            {sum.warns > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-[11px] text-amber-950" title={t("ควรดู", "Worth a look")}>{sum.warns}</span>}
            {!sum.errors && !sum.warns && live.length > 0 && <Icon value="i:circle-check" className="text-sm text-emerald-500" />}
          </button>
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("หน่วยที่แสดง", "Display unit")} title={t("หน่วยที่แสดง — เปลี่ยนแล้วขนาดจริงไม่เปลี่ยน", "Display unit — switching doesn't change real sizes")}>
            {LENGTH_UNITS.map((u) => <button key={u.key} type="button" data-unit={u.key} onClick={() => setUnit(u.key)} aria-pressed={unit === u.key} className={`h-7 rounded-md px-2 text-xs ${unit === u.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{t(u.th, u.en)}</button>)}
          </div>
          <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("โหมด", "Mode")}>
            {STUDIO_LEVELS.map((m) => <button key={m.key} type="button" data-level={m.key} onClick={() => setLevel(m.key)} aria-pressed={levelKey === m.key} title={t(m.descTh, m.descEn)} className={`h-7 rounded-md px-2 text-xs ${levelKey === m.key ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{t(m.th, m.en)}</button>)}
          </div>
          {toolSearch}
        </>}
        {sew && (liningPids.size > 0 || innerPids.size > 0) && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ชั้นที่ดูบนกระดาน", "Layer shown on the board")} data-layer-filter>
            {(["all", "outer", ...(liningPids.size ? ["lining"] as const : []), ...(innerPids.size ? ["inner"] as const : [])] as ("all" | "outer" | "lining" | "inner")[]).map((k) => k === "inner" ? <button key={k} type="button" onClick={() => setLayer(k)} aria-pressed={layer === k} className={`h-7 rounded-md px-2.5 text-xs ${layer === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{t("โฟม / เสริม", "Foam / reinforcement")}</button> : <button key={k} type="button" onClick={() => setLayer(k)} aria-pressed={layer === k} className={`h-7 rounded-md px-2.5 text-xs ${layer === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{k === "all" ? t("ทุกชั้น", "All layers") : k === "outer" ? t("ชั้นนอก", "Outer") : t("ซับใน", "Lining")}</button>)}
          </div>
        )}
        {!sew && <>
        <button type="button" onClick={() => setShow3d(!show3d)} aria-pressed={show3d} className={`${btn} ${show3d ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
          <Icon value={show3d ? "i:eye-off" : "i:box"} className="text-sm" />{show3d ? t("ซ่อนภาพ 3D", "Hide 3D") : t("ดูภาพ 3D", "Show 3D")}
        </button>
        {show3d && !sew && <span className="text-[11px] text-slate-500">{t("ชิ้นบนโต๊ะคือชิ้นเดียวกับบนกระดาน เลือกฝั่งไหนอีกฝั่งสว่างตาม · ภาพนี้คือชิ้นแบน การประกอบเป็นกระเป๋าอยู่ในแอปสตูดิโอแพทเทิร์น (ภาพ 3D ข้างกระดาน)", "The pieces on the table are the ones on the board. Select on either side and the other lights up · this view shows flat pieces; assembling into a bag is in the Pattern studio app, Assemble 3D tab")}</span>}
        </>}
        {sew && !show3d && (
          <button type="button" onClick={() => setShow3d(true)} data-open-3d className={`${btn} border-slate-800 bg-slate-800 text-white hover:bg-slate-900`}>
            <Icon value="i:box" className="text-sm" />{t("เปิดภาพ 3D", "Show 3D")}
          </button>
        )}
      </div>

      {notice && <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"><span className="min-w-0 flex-1">{notice}</span><button type="button" onClick={() => setNotice(null)} aria-label={t("ปิดข้อความ", "Dismiss")} className="shrink-0 text-amber-700 hover:text-amber-900"><Icon value="i:x" /></button></p>}

      {sew && panel === "pieces" && (
        <section data-pieces-panel className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs" aria-label={t("รายการชิ้น", "Piece list")}>
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">{t("รายการชิ้น", "Pieces")} · {live.length}</span>
            <span className="text-[11px] text-slate-500">{t("ล็อก = เห็นปกติแต่แก้/ลากไม่ได้ · ซ่อน = จางและกดไม่ได้ (ยังถูกตรวจ) · แยกดู = ดูชิ้นเดียว · ไม่เปลี่ยนรูปชิ้น", "Lock = visible but can't be edited · Hide = faded, still checked · Isolate = view one piece · shapes never change")}</span>
            {iso && <button type="button" onClick={() => setIso(null)} className="ml-auto h-7 rounded-md border border-blue-200 bg-blue-50 px-2 text-blue-700 hover:bg-blue-100">{t("เลิกแยกดู", "Stop isolating")}</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {PIECE_ROLES.map((r) => {
              const list = live.filter((p) => roleOf(p) === r.key);
              if (!list.length) return null;
              const ids = list.map((p) => p.pid), allLock = ids.every((id) => pv.lock.includes(id)), allHide = ids.every((id) => pv.hide.includes(id));
              return (
                <div key={r.key} className="rounded-md border border-slate-200" data-piece-group={r.key}>
                  <div className="flex items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{t(r.th, r.en)} · {list.length}</span>
                    <button type="button" onClick={() => changeView({ ...pv, lock: toggleIn(pv.lock, ids, !allLock) })} aria-pressed={allLock} title={allLock ? t("ปลดล็อกทั้งกลุ่ม", "Unlock the group") : t("ล็อกทั้งกลุ่ม", "Lock the group")} aria-label={t("ล็อกทั้งกลุ่ม", "Lock the group")} className={`inline-flex h-6 w-6 items-center justify-center rounded ${allLock ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`}><Icon value={allLock ? "i:lock" : "i:lock-open"} /></button>
                    <button type="button" onClick={() => changeView({ ...pv, hide: toggleIn(pv.hide, ids, !allHide) })} aria-pressed={allHide} title={allHide ? t("แสดงทั้งกลุ่ม", "Show the group") : t("ซ่อนทั้งกลุ่ม", "Hide the group")} aria-label={t("ซ่อนทั้งกลุ่ม", "Hide the group")} className={`inline-flex h-6 w-6 items-center justify-center rounded ${allHide ? "text-blue-700" : "text-slate-400 hover:text-slate-700"}`}><Icon value={allHide ? "i:eye-off" : "i:eye"} /></button>
                  </div>
                  <ul className="divide-y divide-slate-50">
                    {list.map((p) => {
                      const lk = pv.lock.includes(p.pid), hd = pv.hide.includes(p.pid), no = live.indexOf(p) + 1;
                      return (
                        <li key={p.pid} className={`flex items-center gap-1 px-2 py-0.5 ${selPid === p.pid ? "bg-blue-50" : ""}`} data-piece-row={p.pid}>
                          <button type="button" onClick={() => { if (!lk) setSelectReq({ nonce: Date.now(), pid: p.pid }); }} title={lk ? t("ชิ้นนี้ล็อกอยู่", "This piece is locked") : t("เลือกชิ้นนี้บนกระดาน", "Select on the board")} className={`min-w-0 flex-1 truncate text-left ${hd ? "text-slate-400" : "text-slate-700 hover:text-blue-700"}`}>{p.name || `P${no}`}</button>
                          <button type="button" onClick={() => changeView({ ...pv, lock: toggleIn(pv.lock, [p.pid], !lk) })} aria-pressed={lk} aria-label={t(`ล็อก ${p.name || `P${no}`}`, `Lock ${p.name || `P${no}`}`)} title={lk ? t("ปลดล็อก", "Unlock") : t("ล็อก (แก้/ลากไม่ได้)", "Lock (no editing)")} className={`inline-flex h-6 w-6 items-center justify-center rounded ${lk ? "text-blue-700" : "text-slate-300 hover:text-slate-600"}`}><Icon value={lk ? "i:lock" : "i:lock-open"} /></button>
                          <button type="button" onClick={() => changeView({ ...pv, hide: toggleIn(pv.hide, [p.pid], !hd) })} aria-pressed={hd} aria-label={t(`ซ่อน ${p.name || `P${no}`}`, `Hide ${p.name || `P${no}`}`)} title={hd ? t("แสดง", "Show") : t("ซ่อน (จาง กดไม่ได้)", "Hide (faded)")} className={`inline-flex h-6 w-6 items-center justify-center rounded ${hd ? "text-blue-700" : "text-slate-300 hover:text-slate-600"}`}><Icon value={hd ? "i:eye-off" : "i:eye"} /></button>
                          <button type="button" onClick={() => setIso(iso === p.pid ? null : p.pid)} aria-pressed={iso === p.pid} aria-label={t(`แยกดู ${p.name || `P${no}`}`, `Isolate ${p.name || `P${no}`}`)} title={t("แยกดูชิ้นเดียว", "View only this piece")} className={`inline-flex h-6 w-6 items-center justify-center rounded ${iso === p.pid ? "text-blue-700" : "text-slate-300 hover:text-slate-600"}`}><Icon value="i:target" /></button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
          {!live.length && <p className="text-slate-400">{t("ยังไม่มีชิ้น", "No pieces yet")}</p>}
        </section>
      )}

      {sew && panel === "check" && (
        <section data-check-panel className="rounded-lg border border-slate-200 bg-white p-2.5 text-xs" aria-label={t("ตรวจแบบ", "Pattern check")}>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">{t("ตรวจแบบ", "Pattern check")}</span>
            {issues.length ? <>
              <span className="text-red-700">{t(`${sum.errors} ต้องแก้`, `${sum.errors} must fix`)}</span>
              <span className="text-amber-700">{t(`${sum.warns} ควรดู`, `${sum.warns} worth a look`)}</span>
              {sum.infos > 0 && <span className="text-slate-500">{t(`${sum.infos} รับทราบ`, `${sum.infos} for info`)}</span>}
            </> : <span className="text-emerald-700"><Icon value="i:circle-check" className="mr-0.5 inline" />{t("ผ่านทุกข้อ", "All clear")}</span>}
            <label className="ml-auto inline-flex items-center gap-1 text-slate-500">{t("ค่าคลาดตะเข็บ", "Seam tolerance")}
              <select value={String(tol)} disabled={!sew.onTolChange} onChange={(e) => sew.onTolChange?.(Number(e.target.value))} className="h-7 rounded-md border border-slate-200 bg-white px-1 text-xs disabled:bg-slate-50" data-check-tol>
                {[...new Set([...SEAM_TOL_CHOICES, tol])].sort((a, b) => a - b).map((v) => <option key={v} value={String(v)}>{L(v)}{v === DEFAULT_SEAM_TOL ? t(" (เริ่มต้น)", " (default)") : ""}</option>)}
              </select>
            </label>
          </div>
          <p className="mb-1 text-[11px] text-slate-400">{t("ตรวจจากรูปชิ้นและตะเข็บจริง · กดแถวเพื่อไปที่ชิ้น/ขอบ · ชิ้นที่ซ่อนก็ยังถูกตรวจ · ค่าคลาดเป็นค่าทดลอง ไม่ใช่มาตรฐานโรงงาน", "Checked from the real pieces and seams · click a row to go there · hidden pieces are still checked · the tolerance is a starting value, not a factory standard")}</p>
          <ul className="max-h-64 space-y-0.5 overflow-auto">
            {issues.map((x) => {
              const d = describeIssue(x, L), on = flagId === x.id;
              const ic = x.level === "error" ? { v: "i:circle-x", c: "text-red-600", w: t("ต้องแก้", "Must fix") } : x.level === "warn" ? { v: "i:alert-triangle", c: "text-amber-600", w: t("ควรดู", "Worth a look") } : { v: "i:info-circle", c: "text-blue-600", w: t("รับทราบ", "For info") };
              return (
                <li key={x.id} data-issue={x.code} className={`flex items-start gap-2 rounded-md px-1.5 py-1 ${on ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                  <span className={`mt-0.5 shrink-0 ${ic.c}`} title={ic.w}><Icon value={ic.v} /><span className="sr-only">{ic.w}</span></span>
                  <button type="button" onClick={() => (on ? setFlagId(null) : goIssue(x))} className="min-w-0 flex-1 text-left text-slate-700">{t(d.th, d.en)}</button>
                  {x.code === "edge-open" && !props.readonly && <button type="button" onClick={() => openEdges(x)} className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-50" title={t("ตั้งขอบเหล่านี้เป็นขอบเปิดตั้งใจ (ย้อนกลับได้ด้วย Ctrl+Z)", "Mark these edges as intended openings (Ctrl+Z to undo)")}>{t("ตั้งเป็นขอบเปิด", "Mark as opening")}</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {(() => {
        const boardEl = (<>
          {gradeOpen && sew && <GradingPanel live={live} seams={sew.seams} spec={sew.grading ?? null} onSpec={readonly || !sew.onGrading ? undefined : (g) => { const err = sew.onGrading?.(g); if (err) setNotice(err); }} onGhosts={setGradeGhosts} readonly={readonly} fileBase={sew.fileBase} tol={tol} />}
          {cmpOpen && sew && <ComparePanel live={live as unknown as ProjectPiece[]} saved={sew.compareRef ?? null} onSaveRef={readonly ? undefined : sew.onSaveCompare} onClearRef={readonly ? undefined : () => { sew.onClearCompare?.(); setOverlay(null); }} overlay={overlay} onOverlay={setOverlay} readonly={readonly} />}
          <ShapeEditor {...props} ghosts={ghosts} open embedded inject={inject} onSelChange={onSel} selectPid={selectReq} onLive={onLive}
          seams={sew?.seams} onSeamsChange={sew && !readonly ? sew.onChange : undefined} initialTool={sew?.start ? "sew" : undefined} innerLines={!!sew} pieceLinks={!!sew} hidePids={hidePids}
          {...(sew ? { unit, seamTol: tol, lockPids, flagged, focusEdge: focusReq, onToolChange: (tl: string) => addEvent(`tool:${tl}`), level: lvNum as 1 | 2 | 3, toolReq, onMatPropsChange: lvNum >= 3 ? props.onMatPropsChange : undefined } : {})} />
        </>);
        const h3 = wide ? 520 : 340;
        const viewEl = (<>
            {sewnOn && sewnScene
              ? <Pattern3D saveName={imageName} mode="sewn" sewn={sewnScene} cut={cut} pieceColors={pieceColors} pieceTex={pieceTex} seamColors={SEAM_COLORS} selected={selPid} onSelect={pick3d} height={sew ? h3 : wide ? 520 : 380} volume={sewnScene?.asm ? bagVolumeLiters(sewnScene.asm) : null} />
              : <Pattern3D saveName={imageName} mode="flat" pieces={flat} threads={threads} selected={selPid} onSelect={pick3d} height={sew ? h3 : wide ? 520 : 380} />}
            {sewnOn && sewnScene ? (
              <div className="space-y-1 text-[11px] text-slate-500">
                <p>{t(`เย็บติดแล้ว ${sewnScene.joined} จาก ${flat.length} ชิ้น · ลากเส้นตะเข็บบนกระดาน ภาพนี้ขยับตาม · เป็นการวางตามสูตร ไม่ใช่การจำลองผ้า (ตำแหน่งถูก การทิ้งตัวเป็นค่าประมาณ)`, `${sewnScene.joined} of ${flat.length} pieces sewn · drag a seam on the board and this view follows · placed by rules, not a cloth simulation (positions are right, drape is approximate)`)}</p>
                {sewnScene.notes.filter((n) => n.why === "short").map((n) => <p key={`s${n.pid}`} className="text-red-600">{t(`${n.name}: สั้นกว่าระยะระหว่างสองจุดที่เย็บ ยาวไม่ถึง — ขยับตะเข็บเข้ามาใกล้กัน หรือทำชิ้นให้ยาวขึ้น`, `${n.name}: shorter than the distance between its two seams — move the seams closer or lengthen the piece`)}</p>)}
                {sewnScene.notes.some((n) => n.why === "unsupported") && <p className="text-amber-700">{t(`ยังประกอบชิ้นนี้ในภาพไม่ได้ (วางไว้ข้างหน้า): ${sewnScene.notes.filter((n) => n.why === "unsupported").map((n) => n.name).join(", ")} — ตอนนี้ภาพรองรับชิ้นที่เย็บ 1 ตะเข็บ (เกาะที่ตะเข็บ) หรือ 2 ตะเข็บ (โค้งเป็นห่วง เช่น สายหู) กับแผ่นที่ตั้งอยู่แล้ว`, `Cannot place these in the view yet (laid in front): ${sewnScene.notes.filter((n) => n.why === "unsupported").map((n) => n.name).join(", ")} — the view handles pieces joined by 1 seam (hinged at the seam) or 2 seams (looped, like a handle) to a piece that is already standing`)}</p>}
                {sewnScene.notes.some((n) => n.why === "unsewn") && <p>{t(`ยังไม่ได้เย็บ (วางไว้ข้างหน้า): ${sewnScene.notes.filter((n) => n.why === "unsewn").map((n) => n.name).join(", ")}`, `Not sewn yet (laid in front): ${sewnScene.notes.filter((n) => n.why === "unsewn").map((n) => n.name).join(", ")}`)}</p>}
              </div>
            ) : (
              <p className="text-[11px] text-slate-400">{flat.length
                ? (wantSewn ? t("ยังไม่มีชิ้นที่เย็บติดกัน ภาพนี้จึงเป็นชิ้นแบน — ใช้เครื่องมือเย็บ (N) หรือเย็บบางช่วง (J) แล้วภาพจะเปลี่ยนเป็นตอนเย็บติดแล้ว", "Nothing is sewn together yet, so this shows flat pieces — use Sew (N) or Sew part (J) and the view switches to the sewn result") : t(`${flat.length} ชิ้นบนโต๊ะ · ความหนาในภาพเป็นค่าสมมติ · เส้นประ = เส้นเย็บ`, `${flat.length} pieces on the table · thickness is illustrative · dashed = sew line`))
                : t("ยังไม่มีชิ้นบนกระดาน — วาดชิ้น หรือกด สร้างจากแม่แบบทรง", "No pieces yet — draw one, or use Create from a bag template")}</p>
            )}
        </>);
        // ใบงานออกแบบ (ไม่มีเครื่องมือเย็บ): หน้าตาเดิม — กระดานซ้าย ภาพ 3D ขวา เปิดเมื่อกดปุ่ม
        if (!sew) return (
          <div className={show3d && wide ? "grid grid-cols-[minmax(0,1fr)_minmax(340px,36%)] items-start gap-3" : "space-y-3"}>
            <div className="min-w-0">{boardEl}</div>
            {show3d && <div className={`min-w-0 space-y-1.5 ${wide ? "sticky top-2" : ""}`}>{viewEl}</div>}
          </div>
        );
        // แอปสตูดิโอแพทเทิร์น (เจ้าของสั่ง 2026-11-11 "3D กับวาดเย็บชิ้นต้องเปิดคู่กัน"): จอเดียว ภาพ 3D คู่กับกระดาน — ลากเส้นแบ่งปรับความกว้าง · สลับฝั่ง · ซ่อนได้
        const seg3 = (on: boolean) => `h-7 rounded-md px-2.5 text-xs ${on ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`;
        const ib3 = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100";
        const asmMode = view3d === "explode" || view3d === "steps" || view3d === "sim";
        const pane = show3d ? (
          <div data-pane-3d className={`min-w-0 space-y-1.5 ${wide ? "sticky top-2 shrink-0" : ""}`} style={wide ? { width: `${roomy ? pct3d : Math.min(pct3d, 33)}%` } : undefined}>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5">
              <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("แบบของภาพ 3D", "3D view type")}>
                {VIEWS_3D.filter((v) => v.key !== "sim" || lvNum >= 3).map((v) => <button key={v.key} type="button" data-view3d={v.key} onClick={() => setView3d(v.key)} aria-pressed={view3d === v.key} title={t(v.hintTh, v.hintEn)} className={seg3(view3d === v.key)}>{t(v.th, v.en)}</button>)}
              </div>
              <span className="ml-auto inline-flex gap-1">
                {wide && <button type="button" data-swap-3d onClick={() => setSide3d(side3d === "left" ? "right" : "left")} title={t("สลับฝั่ง: ภาพ 3D ซ้าย / ขวา", "Swap sides: 3D left / right")} aria-label={t("สลับฝั่งภาพ 3D", "Swap the 3D side")} className={ib3}><Icon value="i:arrows-exchange" className="text-sm" /></button>}
                <button type="button" data-hide-3d onClick={() => setShow3d(false)} title={t("ซ่อนภาพ 3D (กระดานเต็มจอ)", "Hide 3D (full-width board)")} aria-label={t("ซ่อนภาพ 3D", "Hide 3D")} className={ib3}><Icon value="i:eye-off" className="text-sm" /></button>
              </span>
            </div>
            {(() => { const lv = LEVEL_3D[view3d === "sewn" && !sewnOn ? "flat" : view3d]; return (
              <p data-level-3d className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                <span className={`rounded px-1.5 py-0.5 font-medium ${lv.tone}`}>{t(lv.th, lv.en)}</span>
                <span>{t(`ยืนยันได้: ${lv.okTh} · ยังสรุปไม่ได้: ${lv.noTh}`, `Shows: ${lv.okEn} · Can't tell yet: ${lv.noEn}`)}</span>
              </p>
            ); })()}
            {!asmMode && sewnOn && sewnScene && (sewnScene.asm || sewnScene.lining) && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ผ่าดูข้างใน", "Cut-away view")}>
              {(["none", "front", "back"] as const).map((k) => <button key={k} type="button" onClick={() => setCut(k)} aria-pressed={cut === k} className={`h-7 rounded-md px-2.5 text-xs ${cut === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{k === "none" ? t("ดูข้างนอก", "Outside") : k === "front" ? t("ผ่าด้านหน้า", "Cut front") : t("ผ่าด้านหลัง", "Cut back")}</button>)}
              </div>
            )}
            {!asmMode && sewnOn && sew && cwMats.length > 0 && <ColorwayBar mats={cwMats} list={sew.colorways ?? []} active={sew.colorway ?? null} onChange={readonly ? undefined : sew.onColorways} readonly={readonly} />}
            {asmMode
              ? <AssemblyView saveName={imageName} compact height={Math.max(300, h3 - 60)} view={view3d === "explode" ? "whole" : view3d} pieces={asmLive} seams={sew.seams} attaches={sew.attaches ?? []} onAttachesChange={readonly ? undefined : sew.onAttachesChange} pieceStiff={sew.pieceStiff} />
              : viewEl}
          </div>
        ) : null;
        if (!pane) return <div className="min-w-0">{boardEl}</div>;
        if (!wide) return <div className="space-y-3">{pane}<div className="min-w-0">{boardEl}</div></div>;
        const divider = (
          <div role="separator" aria-orientation="vertical" data-split-3d title={t("ลากเพื่อปรับความกว้างของภาพ 3D", "Drag to resize the 3D view")}
            onPointerDown={(e) => { e.preventDefault(); splitDrag.current = true; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* บางเบราว์เซอร์จับเมาส์ไม่ได้ — ยังลากได้ขณะเมาส์อยู่บนเส้นแบ่ง */ } }}
            onPointerMove={(e) => { const box = splitRef.current?.getBoundingClientRect(); if (!splitDrag.current || !box || !box.width) return; const x = side3d === "left" ? e.clientX - box.left : box.right - e.clientX; setPct3dState(clampPct((x / box.width) * 100)); }}
            onPointerUp={() => { if (splitDrag.current) { splitDrag.current = false; setPct3d(pct3d); } }} onPointerCancel={() => { splitDrag.current = false; }}
            onDoubleClick={() => setPct3d(PCT3D_DEFAULT)}
            className="group mx-1 flex w-2.5 shrink-0 cursor-col-resize touch-none items-center justify-center self-stretch rounded-full hover:bg-blue-100" style={{ minHeight: 240 }}>
            <span className="h-12 w-1 rounded-full bg-slate-300 group-hover:bg-blue-500" />
          </div>
        );
        return (
          <div ref={splitRef} className="flex items-start">
            {side3d === "left" && <>{pane}{divider}</>}
            <div className="min-w-0 flex-1">{boardEl}</div>
            {side3d === "right" && <>{divider}{pane}</>}
          </div>
        );
      })()}

      {sew?.lesson && learnOpen && (
        <LearnCard lesson={sew.lesson} projectName={sew.lessonName ?? ""} ctx={lessonCtx} L={L} readonly={readonly}
          onGuide={guide} onDemo={demo} onReset={sew.lesson.mode === "practice" && !readonly ? sew.onLessonReset : undefined}
          onCatalog={() => setCatalog(true)} onClose={() => setLearnOpen(false)} />
      )}
      {sew && catalog && <LessonCatalog open onClose={() => setCatalog(false)} canStart={!!sew.canLearn} copySource={sew.copySource} currentId={sew.lesson?.id ?? null} />}
      {wizard && <BagTemplateWizard key={draft ? "draft" : "plain"} open onClose={() => { setWizard(false); setDraft(null); }} onInsert={insert} initial={draft?.params} notice={draft?.notice} pocket={!!sew}
        current={!draft && tpl && tplNow.length ? tpl : null} now={tplNow} onUpdate={sew && !readonly ? applyTplUpdate : undefined} />}
      {bagParts && <BagPartsModal open onClose={() => setBagParts(false)} onInsert={addBagPart} defaultPid={selPid}
        hosts={live.filter((p) => p.info?.role !== "lining").map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, shape: p.shape, holes: p.holes, allow: p.allow, foldEdges: p.foldEdges }))}
        bindPieces={live as unknown as ProjectPiece[]} bindSeams={sew?.seams ?? []} />}
      {pocket && <PocketModal open onClose={() => setPocket(false)} defaultPid={pocketHost()} onInsert={addPocket}
        hosts={live.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, box: shapeBox(p.shape), lining: liningPids.has(p.pid) }))} />}
      {dxf && <DxfModal open onClose={() => setDxf(false)} onInsert={(list) => {
        setDxf(false);
        // ชิ้นจากไฟล์วางต่อจากขวาสุดของชิ้นเดิม เรียงตามตำแหน่งในไฟล์ · เส้นในเก็บเฉพาะหน้าที่มีงานเส้นใน (แอปสตูดิโอแพทเทิร์น)
        setInject({ nonce: Date.now(), pieces: list.map((p) => ({ shape: p.shape, holes: p.holes, count: p.count, allow: p.allow, name: p.name, at: p.at, grain: p.grain, notches: p.notches, ...(sew && p.inner.length ? { inner: p.inner } : {}) })) });
        setNotice(t(`นำเข้าแล้ว ${list.length} ชิ้น — ไฟล์ DXF ไม่มีตะเข็บและวัสดุ ต้องเย็บขอบและเลือกวัสดุเอง · ตรวจขนาดเทียบกับของจริงอย่างน้อย 1 ชิ้น`, `Imported ${list.length} pieces — DXF has no seams or materials, so sew the edges and pick materials yourself · check at least one size against the original`));
      }} />}
      {photo && <PhotoModal open onClose={() => setPhoto(false)}
        materials={props.materials}
        onPieces={(pieces, aiSeams) => {
          setPhoto(false);
          const stamp = Date.now().toString(36), pids = pieces.map((_, i) => `pc${stamp}p${i}`);
          setInject({ nonce: Date.now(), pieces: pieces.map((q, i) => ({ ...q, pid: pids[i] })) });
          // ตะเข็บที่ AI บอกมา (ทางคัดลอกคำสั่ง) → ตะเข็บตั้งต้นของเครื่องมือเย็บ (เฉพาะหน้าที่มีเครื่องมือเย็บ)
          if (sew && aiSeams?.length) sew.onChange([...sew.seams, ...aiSeams.map((x, i) => ({ id: `s${stamp}a${i}`, a: { pid: pids[x.a.piece], from: x.a.from, count: x.a.count, n: x.a.n }, b: { pid: pids[x.b.piece], from: x.b.from, count: x.b.count, n: x.b.n } }))]);
        }}
        onDraft={(params, info) => {
          setPhoto(false);
          setDraft({ params, notice: [
            t(`ค่าด้านล่างเป็นค่าที่ AI ประมาณจากรูป${info.style ? ` (${info.style})` : ""} · ความมั่นใจ ${Math.round(info.confidence * 100)}% — ตรวจและแก้ให้ตรงของจริงก่อนวาง`, `The values below were estimated by AI from the photo${info.style ? ` (${info.style})` : ""} · confidence ${Math.round(info.confidence * 100)}% — check and adjust before placing`),
            info.fits ? "" : t("AI บอกว่ากระเป๋าในรูปไม่ตรงกับแม่แบบ Tote นัก ค่านี้เป็นทรงที่ใกล้ที่สุดเท่านั้น", "The AI says this bag does not match the tote template well; this is only the nearest shape"),
            info.notes,
          ].filter(Boolean).join(" · ") });
          setWizard(true);
        }} />}
    </div>
  );
}
