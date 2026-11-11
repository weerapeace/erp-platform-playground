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
 *   จอกว้าง ≥ 1180px = กระดานซ้าย 3D ขวา · แคบกว่า = 3D อยู่ใต้กระดาน
 *   (ไม่ใช้ SplitPanes: ตัวนั้นขยายฝั่งที่ถูกคลิก — กระดานวาดต้องคลิกตลอด จะดันไปมาทุกครั้ง)
 *
 *   <PatternStudio initial={…} materials={…} onChange={applyBoard} readonly={!canEdit} … />
 *
 * ใบงานออกแบบ (ไม่ส่ง sew): ภาพ 3D = ชิ้นแบนอย่างเดียวเหมือนเดิม · เย็บทีละขั้น / จำลองวัสดุ = AssemblyView (แท็บ "ประกอบ 3D" ของแอปสตูดิโอแพทเทิร์น)
 * ใช้ที่: แท็บตีราคา (แบบวาด) ใบงานออกแบบ · คู่มือ: docs/pattern-studio.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SEAM_COLORS, ShapeEditor, type EditorPiece, type ResultPiece } from "@/components/pattern-sheet/shape-editor";
import type { Flat3DPiece, Flat3DThread, Pattern3DCut } from "@/components/pattern-3d";
import { sidePoints, type Seam } from "@/lib/pattern-seams";
import { buildSewn } from "@/lib/pattern-sewn";
import { assemble, type AsmPiece, type Attach } from "@/lib/pattern-assembly";
import { liningPlan, pocketPlan, type PocketOpts } from "@/lib/pattern-lining";
import { shapeBox } from "@/lib/pattern-shape";
import type { BagParams } from "@/lib/bag-templates";
import type { BagKit, BagStyle, KitAttach, KitSeam } from "@/lib/bag-kits";

const Pattern3D = dynamic(() => import("@/components/pattern-3d").then((m) => m.Pattern3D), { ssr: false });               // โหลดเมื่อเปิดดู 3D
const PhotoModal = dynamic(() => import("./photo-modal").then((m) => m.PhotoModal), { ssr: false });                        // โหลดเมื่อกดแกะจากรูป
const PocketModal = dynamic(() => import("./pocket-modal").then((m) => m.PocketModal), { ssr: false });                     // โหลดเมื่อกดเพิ่มช่อง
const DxfModal = dynamic(() => import("./dxf-modal").then((m) => m.DxfModal), { ssr: false });                              // โหลดเมื่อกดนำเข้า DXF
const BagTemplateWizard = dynamic(() => import("./template-wizard").then((m) => m.BagTemplateWizard), { ssr: false });      // โหลดเมื่อกดสร้างจากแม่แบบ

const AssemblyView = dynamic(() => import("./assembly-view").then((m) => m.AssemblyView), { ssr: false });                  // โหลดเมื่อเลือก แยกชิ้น / ทีละขั้น / ทิ้งตัว

const SHOW3D_KEY = "pattern-studio-3d";
const SHOW3D_SPLIT_KEY = "pattern-studio-3d-split";   // หน้าที่มีเครื่องมือเย็บ: ภาพ 3D คู่กับกระดาน เปิดเป็นค่าเริ่ม (กุญแจแยก — ค่าที่เคยปิดไว้ของปุ่มเดิมไม่ตามมา)
const SIDE3D_KEY = "pattern-studio-3d-side";
const PCT3D_KEY = "pattern-studio-3d-pct";
const PCT3D_DEFAULT = 38;
const clampPct = (v: number) => Math.max(22, Math.min(60, Math.round(v * 10) / 10));
const VIEW3D_KEY = "pattern-studio-3d-view";
/** แบบของภาพ 3D ในจอเดียว: เย็บติดแล้ว (ตามกระดานทันที) · แยกชิ้น / ทีละขั้น / ทิ้งตัว (ของแท็บ "ประกอบ 3D" เดิม = AssemblyView) · ชิ้นแบน */
type View3D = "sewn" | "explode" | "steps" | "sim" | "flat";
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
export type TemplateInsertInfo = { pidByKey: Record<string, string>; seams: KitSeam[]; attach: KitAttach[]; /** ค่าแม่แบบ Tote (ทรงอื่นไม่มี) */ params?: BagParams; style: BagStyle };

/** ตะเข็บของแพทเทิร์น (แอปสตูดิโอแพทเทิร์น) — ส่ง = กระดานมีเครื่องมือเย็บ/แก้ตะเข็บในตัว (แบบ CLO: เย็บบนกระดานเดิม ไม่เปลี่ยนหน้า) · start = เปิดกระดานมาถือเครื่องมือเย็บเลย */
export type StudioSew = { seams: Seam[]; onChange: (next: Seam[]) => void; start?: boolean;
  /** แก้จุดติด (ติดหู / ปิดหลังช่อง) จากภาพ 3D แบบ แยกชิ้น — ไม่ส่ง = ดูอย่างเดียว */ onAttachesChange?: (next: Attach[]) => void;
  /** ความอยู่ทรงของชิ้น (ภาพ ทิ้งตัว) */ pieceStiff?: (pid: string, fallback: number) => { s: number; why: string } | null; /** จุดติดหู/แผ่นหลังช่องจากแม่แบบ — ให้ภาพเย็บติดมีหูของแม่แบบด้วย */ attaches?: Attach[] };

export function PatternStudio({ onTemplateInsert, sew, imageName, ...props }: Omit<EditorProps, "open" | "embedded" | "inject" | "onSelChange" | "selectPid" | "onLive" | "hidePids" | "innerLines" | "pieceLinks"> & {
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
  const [layer, setLayer] = useState<"all" | "outer" | "lining">("all");   // ชั้นที่ดูบนกระดาน (ชิ้นของชั้นอื่นจางและกดไม่ได้)
  const [cut, setCut] = useState<Pattern3DCut>("none");                     // ผ่าดูข้างในของภาพ 3D
  const [pocket, setPocket] = useState(false);
  const [dxf, setDxf] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [live, setLive] = useState<ResultPiece[]>([]);
  const [selPid, setSelPid] = useState<string | null>(null);
  const [selectReq, setSelectReq] = useState<{ nonce: number; pid: string | null } | null>(null);

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
  const hidePids = useMemo(() => (layer === "all" ? null : new Set(live.filter((p) => liningPids.has(p.pid) !== (layer === "lining")).map((p) => p.pid))), [layer, live, liningPids]);
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
  const pieceColors = useMemo(() => { const out: Record<string, string> = {}; for (const p of live) { const c = p.mats.map((m) => props.matProps?.[m.id]?.color).find(Boolean); if (c) out[p.pid] = c; } return out; }, [live, props.matProps]);
  const sewnOn = !!sewnScene && sewnScene.joined > 0;
  const onLive = useCallback((pieces: ResultPiece[]) => setLive(pieces), []);
  const onSel = useCallback((pid: string | null) => setSelPid(pid), []);
  const pick3d = useCallback((pid: string | null) => setSelectReq({ nonce: Date.now(), pid }), []);
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
    onTemplateInsert?.({ pidByKey, seams: kit.seams.filter((x) => pidByKey[x.a.piece] && pidByKey[x.b.piece]), attach: kit.attach, params: kit.params, style: kit.style });
    const nl = list.filter((q) => q.lining).length, had = (sew?.seams.length ?? 0) > 0;
    if (nl && sew) setLayer("outer");   // ชิ้นเยอะ: เริ่มที่ชั้นนอกก่อน (ซับในจางไว้) — สลับดูได้ที่ปุ่ม ทุกชั้น / ชั้นนอก / ซับใน
    if (had) setNotice(t(`วางแล้ว ${list.length} แบบ — แพทเทิร์นนี้มีกระเป๋าที่เย็บไว้อยู่แล้ว ภาพ 3 มิติประกอบได้ทีละ 1 ใบ (อีกใบจะขึ้นว่ายังประกอบไม่ได้) · แนะนำให้สร้างแพทเทิร์นใหม่สำหรับทรงใหม่`, `Placed ${list.length} patterns — this pattern already has a sewn bag and the 3D view assembles one bag at a time (the other shows as not assembled) · create a new pattern for a new style`));
    else if (nl) setNotice(t(`วางแล้ว ${list.length} แบบ รวมซับใน ${nl} แบบ (วางไว้ใต้ชุดตัวนอก${sew ? " ผูกรูปกับตัวนอก: แก้ตัวนอกแล้วซับในเปลี่ยนตาม · ตอนนี้กระดานโชว์ชั้นนอก สลับดูซับในได้ที่ปุ่ม ทุกชั้น / ชั้นนอก / ซับใน" : ""}) — เลือกวัสดุซับในให้ชิ้นเหล่านั้นด้วย`, `Placed ${list.length} patterns including ${nl} lining patterns (below the outer set) — pick a lining material for them`));
  };

  const btn = "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs";
  return (
    <div ref={boxRef} className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700"><Icon value="i:shopping-bag" className="text-sm" />{t("สตูดิโอแพทเทิร์น", "Pattern studio")}</span>
        {!readonly && (
          <button type="button" onClick={() => { setDraft(null); setWizard(true); }} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:wand" className="text-sm" />{t("สร้างจากแม่แบบทรง", "Create from a bag template")}
          </button>
        )}
        {!readonly && (
          <button type="button" onClick={() => setPhoto(true)} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:photo" className="text-sm" />{t("แกะจากรูป", "Start from a photo")}
          </button>
        )}
        {!readonly && (
          <button type="button" onClick={() => setDxf(true)} title={t("นำเข้าแพทเทิร์นจากไฟล์ DXF เช่น ที่ส่งออกจาก CLO3D", "Import a pattern from a DXF file, e.g. exported from CLO3D")} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:file-import" className="text-sm" />{t("นำเข้า DXF", "Import DXF")}
          </button>
        )}
        {!readonly && sew && <>
          <button type="button" onClick={makeLining} title={t("คัดลอกชิ้นตัวกระเป๋าเป็นชั้นซับใน พร้อมตะเข็บ", "Copy the body pieces into a lining layer, with their seams")} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50`}>
            <Icon value="i:layers-subtract" className="text-sm" />{t("สร้างซับใน", "Create lining")}
          </button>
          <button type="button" onClick={() => setPocket(true)} disabled={!live.length} title={t("ช่องใส่ของ หรือ ช่องซิป บนชิ้นที่เลือก", "A patch pocket or a zip pocket on a piece")} className={`${btn} border-blue-200 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-40`}>
            <Icon value="i:square-plus" className="text-sm" />{t("เพิ่มช่อง", "Add pocket")}
          </button>
        </>}
        {sew && liningPids.size > 0 && (
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ชั้นที่ดูบนกระดาน", "Layer shown on the board")}>
            {(["all", "outer", "lining"] as const).map((k) => <button key={k} type="button" onClick={() => setLayer(k)} aria-pressed={layer === k} className={`h-7 rounded-md px-2.5 text-xs ${layer === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{k === "all" ? t("ทุกชั้น", "All layers") : k === "outer" ? t("ชั้นนอก", "Outer") : t("ซับใน", "Lining")}</button>)}
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

      {(() => {
        const boardEl = (
          <ShapeEditor {...props} open embedded inject={inject} onSelChange={onSel} selectPid={selectReq} onLive={onLive}
          seams={sew?.seams} onSeamsChange={sew && !readonly ? sew.onChange : undefined} initialTool={sew?.start ? "sew" : undefined} innerLines={!!sew} pieceLinks={!!sew} hidePids={hidePids} />
        );
        const h3 = wide ? 520 : 340;
        const viewEl = (<>
            {sewnOn && sewnScene
              ? <Pattern3D saveName={imageName} mode="sewn" sewn={sewnScene} cut={cut} pieceColors={pieceColors} seamColors={SEAM_COLORS} selected={selPid} onSelect={pick3d} height={sew ? h3 : wide ? 520 : 380} />
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
                {VIEWS_3D.map((v) => <button key={v.key} type="button" data-view3d={v.key} onClick={() => setView3d(v.key)} aria-pressed={view3d === v.key} title={t(v.hintTh, v.hintEn)} className={seg3(view3d === v.key)}>{t(v.th, v.en)}</button>)}
              </div>
              <span className="ml-auto inline-flex gap-1">
                {wide && <button type="button" data-swap-3d onClick={() => setSide3d(side3d === "left" ? "right" : "left")} title={t("สลับฝั่ง: ภาพ 3D ซ้าย / ขวา", "Swap sides: 3D left / right")} aria-label={t("สลับฝั่งภาพ 3D", "Swap the 3D side")} className={ib3}><Icon value="i:arrows-exchange" className="text-sm" /></button>}
                <button type="button" data-hide-3d onClick={() => setShow3d(false)} title={t("ซ่อนภาพ 3D (กระดานเต็มจอ)", "Hide 3D (full-width board)")} aria-label={t("ซ่อนภาพ 3D", "Hide 3D")} className={ib3}><Icon value="i:eye-off" className="text-sm" /></button>
              </span>
            </div>
            {!asmMode && sewnOn && sewnScene && (sewnScene.asm || sewnScene.lining) && (
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="group" aria-label={t("ผ่าดูข้างใน", "Cut-away view")}>
              {(["none", "front", "back"] as const).map((k) => <button key={k} type="button" onClick={() => setCut(k)} aria-pressed={cut === k} className={`h-7 rounded-md px-2.5 text-xs ${cut === k ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{k === "none" ? t("ดูข้างนอก", "Outside") : k === "front" ? t("ผ่าด้านหน้า", "Cut front") : t("ผ่าด้านหลัง", "Cut back")}</button>)}
              </div>
            )}
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

      {wizard && <BagTemplateWizard key={draft ? "draft" : "plain"} open onClose={() => { setWizard(false); setDraft(null); }} onInsert={insert} initial={draft?.params} notice={draft?.notice} pocket={!!sew} />}
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
