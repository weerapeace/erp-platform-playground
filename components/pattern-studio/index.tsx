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
 *   จอกว้าง ≥ 1180px = กระดานซ้าย 3D ขวา · แคบกว่า = 3D อยู่ใต้กระดาน
 *   (ไม่ใช้ SplitPanes: ตัวนั้นขยายฝั่งที่ถูกคลิก — กระดานวาดต้องคลิกตลอด จะดันไปมาทุกครั้ง)
 *
 *   <PatternStudio initial={…} materials={…} onChange={applyBoard} readonly={!canEdit} … />
 *
 * ภาพ 3D ของกระดานในกรอบนี้ = ชิ้นแบน · การประกอบเป็นกระเป๋าจากตะเข็บ = AssemblyView (แท็บ "ประกอบ 3D" ของแอปสตูดิโอแพทเทิร์น)
 * ใช้ที่: แท็บตีราคา (แบบวาด) ใบงานออกแบบ · คู่มือ: docs/pattern-studio.md
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import dynamic from "next/dynamic";
import { Icon } from "@/components/icon";
import { useT } from "@/components/i18n";
import { SEAM_COLORS, ShapeEditor, type EditorPiece, type ResultPiece } from "@/components/pattern-sheet/shape-editor";
import type { Flat3DPiece, Flat3DThread } from "@/components/pattern-3d";
import { sidePoints, type Seam } from "@/lib/pattern-seams";
import { bagAttachRefs, bagSeamRefs, type BagAttachRef, type BagGeometry, type BagParams, type BagPiece, type BagPieceKey, type BagSeamRef } from "@/lib/bag-templates";

const Pattern3D = dynamic(() => import("@/components/pattern-3d").then((m) => m.Pattern3D), { ssr: false });               // โหลดเมื่อเปิดดู 3D
const PhotoModal = dynamic(() => import("./photo-modal").then((m) => m.PhotoModal), { ssr: false });                        // โหลดเมื่อกดแกะจากรูป
const BagTemplateWizard = dynamic(() => import("./template-wizard").then((m) => m.BagTemplateWizard), { ssr: false });      // โหลดเมื่อกดสร้างจากแม่แบบ

const SHOW3D_KEY = "pattern-studio-3d";
const WIDE_PX = 1180;
type EditorProps = ComponentProps<typeof ShapeEditor>;

/** ชิ้นจากแม่แบบถูกวางลงกระดานแล้ว: รหัสชิ้น (pid) ของแต่ละชนิดชิ้น + คู่ขอบที่ต้องเย็บติดกัน + จุดติดหู/แผ่นหลังช่อง + ค่าแม่แบบที่ใช้ */
export type TemplateInsertInfo = { pidByKey: Partial<Record<BagPieceKey, string>>; seams: BagSeamRef[]; attach: BagAttachRef[]; params: BagParams };

/** ตะเข็บของแพทเทิร์น (แอปสตูดิโอแพทเทิร์น) — ส่ง = กระดานมีเครื่องมือเย็บ/แก้ตะเข็บในตัว (แบบ CLO: เย็บบนกระดานเดิม ไม่เปลี่ยนหน้า) · start = เปิดกระดานมาถือเครื่องมือเย็บเลย */
export type StudioSew = { seams: Seam[]; onChange: (next: Seam[]) => void; start?: boolean };

export function PatternStudio({ onTemplateInsert, sew, ...props }: Omit<EditorProps, "open" | "embedded" | "inject" | "onSelChange" | "selectPid" | "onLive"> & {
  /** แจ้งเมื่อวางชิ้นจากแม่แบบ (ไว้สร้างตะเข็บตั้งต้น) — ไม่ส่ง = ไม่ทำอะไรเพิ่ม */
  onTemplateInsert?: (info: TemplateInsertInfo) => void;
  /** ส่ง = มีเครื่องมือเย็บ (N) + แก้ตะเข็บ (B) ในแถบเครื่องมือซ้ายของกระดาน และเห็นด้ายเย็บในภาพ 3D (ใบงานออกแบบไม่ส่ง = ไม่มี) */
  sew?: StudioSew;
}) {
  const t = useT();
  const { readonly = false } = props;
  const [show3d, setShow3dState] = useState(false);
  useEffect(() => { try { setShow3dState(localStorage.getItem(SHOW3D_KEY) === "1"); } catch { /* อ่านไม่ได้ = ปิดไว้ */ } }, []);
  const setShow3d = (v: boolean) => { setShow3dState(v); try { localStorage.setItem(SHOW3D_KEY, v ? "1" : "0"); } catch { /* เก็บไม่ได้ก็ไม่เป็นไร */ } };
  const [wizard, setWizard] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [draft, setDraft] = useState<{ params: BagParams; notice: string } | null>(null);   // ค่าแม่แบบที่ AI ร่างจากรูปกระเป๋า (เปิดตัวสร้างจากแม่แบบด้วยค่านี้)
  const [inject, setInject] = useState<{ nonce: number; pieces: EditorPiece[] } | null>(null);
  const [live, setLive] = useState<ResultPiece[]>([]);
  const [selPid, setSelPid] = useState<string | null>(null);
  const [selectReq, setSelectReq] = useState<{ nonce: number; pid: string | null } | null>(null);

  // กว้างพอ = ซ้ายขวา · แคบ = บนล่าง (วัดกล่องแม่ ไม่ใช่จอ)
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const el = boxRef.current; if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= WIDE_PX));
    ro.observe(el); setWide(el.clientWidth >= WIDE_PX);
    return () => ro.disconnect();
  }, []);

  const flat: Flat3DPiece[] = useMemo(() => live.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, cut: p.geo.cut, sew: p.geo.sew, holes: p.geo.holesCut })), [live]);
  // ด้ายเย็บในภาพ 3D: ขอบทั้งสองด้านของตะเข็บ (พิกัดกระดาน) สีเดียวกับบนกระดาน
  const threads: Flat3DThread[] = useMemo(() => {
    if (!sew?.seams.length) return [];
    const shapes = new Map(live.map((p) => [p.pid, p.shape]));
    return sew.seams.flatMap((x, i) => {
      const A = shapes.get(x.a.pid), B = shapes.get(x.b.pid), a = A ? sidePoints(A, x.a) : null, b = B ? sidePoints(B, x.b) : null;
      return a && b ? [{ a, b, color: SEAM_COLORS[i % SEAM_COLORS.length] }] : [];
    });
  }, [live, sew?.seams]);
  const onLive = useCallback((pieces: ResultPiece[]) => setLive(pieces), []);
  const onSel = useCallback((pid: string | null) => setSelPid(pid), []);
  const pick3d = useCallback((pid: string | null) => setSelectReq({ nonce: Date.now(), pid }), []);
  const insert = (pieces: BagPiece[], G: BagGeometry) => {
    setWizard(false); setDraft(null);
    const stamp = Date.now().toString(36), pidByKey: Partial<Record<BagPieceKey, string>> = {};
    pieces.forEach((q, i) => { pidByKey[q.key] = `pc${stamp}t${i}`; });   // รหัสชิ้นกำหนดที่นี่ → ตะเข็บตั้งต้นอ้างถึงได้
    setInject({ nonce: Date.now(), pieces: pieces.map((q) => ({ pid: pidByKey[q.key], shape: q.shape, holes: q.holes, count: q.count, allow: q.allow, allowEdges: q.allowEdges, foldEdges: q.foldEdges, name: q.name, at: q.at, grain: q.grain, notches: q.notches })) });
    setShow3d(true);
    onTemplateInsert?.({ pidByKey, seams: bagSeamRefs(G), attach: bagAttachRefs(G), params: G.p });
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
        <button type="button" onClick={() => setShow3d(!show3d)} aria-pressed={show3d} className={`${btn} ${show3d ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`}>
          <Icon value={show3d ? "i:eye-off" : "i:box"} className="text-sm" />{show3d ? t("ซ่อนภาพ 3D", "Hide 3D") : t("ดูภาพ 3D", "Show 3D")}
        </button>
        {show3d && <span className="text-[11px] text-slate-500">{t("ชิ้นบนโต๊ะคือชิ้นเดียวกับบนกระดาน เลือกฝั่งไหนอีกฝั่งสว่างตาม · ภาพนี้คือชิ้นแบน การประกอบเป็นกระเป๋าอยู่ในแอปสตูดิโอแพทเทิร์น แท็บ ประกอบ 3D", "The pieces on the table are the ones on the board. Select on either side and the other lights up · this view shows flat pieces; assembling into a bag is in the Pattern studio app, Assemble 3D tab")}</span>}
      </div>

      <div className={show3d && wide ? "grid grid-cols-[minmax(0,1fr)_minmax(340px,36%)] items-start gap-3" : "space-y-3"}>
        <div className="min-w-0">
          <ShapeEditor {...props} open embedded inject={inject} onSelChange={onSel} selectPid={selectReq} onLive={onLive}
            seams={sew?.seams} onSeamsChange={sew && !readonly ? sew.onChange : undefined} initialTool={sew?.start ? "sew" : undefined} />
        </div>
        {show3d && (
          <div className={`min-w-0 space-y-1.5 ${wide ? "sticky top-2" : ""}`}>
            <Pattern3D mode="flat" pieces={flat} threads={threads} selected={selPid} onSelect={pick3d} height={wide ? 520 : 380} />
            <p className="text-[11px] text-slate-400">{flat.length
              ? t(`${flat.length} ชิ้นบนโต๊ะ · ความหนาในภาพเป็นค่าสมมติ · เส้นประ = เส้นเย็บ`, `${flat.length} pieces on the table · thickness is illustrative · dashed = sew line`)
              : t("ยังไม่มีชิ้นบนกระดาน — วาดชิ้น หรือกด สร้างจากแม่แบบทรง", "No pieces yet — draw one, or use Create from a bag template")}</p>
          </div>
        )}
      </div>

      {wizard && <BagTemplateWizard key={draft ? "draft" : "plain"} open onClose={() => { setWizard(false); setDraft(null); }} onInsert={insert} initial={draft?.params} notice={draft?.notice} />}
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
