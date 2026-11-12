"use client";

/**
 * ✂ หน้าพิมพ์ / ไฟล์เครื่องตัด ของแพทเทิร์นในแอปสตูดิโอแพทเทิร์น — เปิดจากปุ่ม "พิมพ์ / ไฟล์ตัด" ในสตูดิโอ
 *   ใบสเปก (2026-11-11): ภาพ 3 มิติ 2 มุม (ถ่ายจากฉากเย็บติดของแพทเทิร์นที่บันทึกแล้ว) + ขนาดตัวกระเป๋า + รายการชิ้น/วัสดุ + ซิป/อะไหล่ + ตะเข็บ + งานขอบ ในเอกสารเดียว
 *   ภาพรวม + วางบนผ้า · พิมพ์ขนาดจริง A4 1:1 · ดาวน์โหลด DXF / SVG — ตัวหน้าพิมพ์ = ของกลาง PatternPrintView (ตัวเดียวกับใบงานออกแบบ)
 *   อ่านแพทเทิร์นที่ "บันทึกแล้ว" จาก /api/pattern-projects/<id> (ต้องมีสิทธิ์ pattern_studio.view)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { usePrintLog } from "@/components/report/use-print-log";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { PatternPrintView } from "@/components/pattern-sheet/print-view";
import { projectEdgeRows, projectPatternLines, projectPieceRows, projectSeamRows, type PatternProject } from "@/lib/pattern-project";
import { cleanTrims, trimRows } from "@/lib/pattern-trims";
import { buildSewn } from "@/lib/pattern-sewn";
import { cleanAttaches, type AsmPiece } from "@/lib/pattern-assembly";
import type { Pattern3DApi } from "@/components/pattern-3d";

const Pattern3D = dynamic(() => import("@/components/pattern-3d").then((m) => m.Pattern3D), { ssr: false });
import { HW_KINDS, hwKind, hwSpot, shapeBox } from "@/lib/pattern-shape";

export default function PrintPatternProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<PatternProject | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(false);   // ?draft=1 = พิมพ์แบบร่างจากด่านตรวจ (ยังมีข้อต้องแก้) → ลายน้ำทุกหน้า
  useEffect(() => { try { setDraft(new URLSearchParams(window.location.search).get("draft") === "1"); } catch { /* อ่านไม่ได้ = ปกติ */ } }, []);

  useEffect(() => {
    let alive = true;
    apiFetch(`/api/pattern-projects/${id}`).then((r) => r.json()).then((j) => {
      if (!alive) return;
      if (j?.error) throw new Error(j.error);
      setProject((j?.data ?? null) as PatternProject | null);
    }).catch((e) => { if (alive) setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const lines = useMemo(() => (project ? projectPatternLines(project.pieces ?? [], project.basis === "area" ? "area" : "box") : []), [project]);
  const seamRows = useMemo(() => (project ? projectSeamRows(project.pieces ?? [], project.seams ?? []) : []), [project]);
  const edgeRows = useMemo(() => (project ? projectEdgeRows(project.pieces ?? []) : []), [project]);
  const pieceRows = useMemo(() => (project ? projectPieceRows(project.pieces ?? []) : []), [project]);
  const trims = useMemo(() => (project ? trimRows(cleanTrims((project.template as { trims?: unknown } | null)?.trims), project.pieces ?? [], project.seams ?? []).filter((r) => !r.gone) : []), [project]);
  // อะไหล่ที่วางบนชิ้น: ชิ้นไหน ชนิดอะไร ขนาด และระยะจากขอบบน/ซ้ายของชิ้น (ไม่ขึ้นกับว่าเลือกวัสดุตีราคาแล้วหรือยัง)
  const hwRows = useMemo(() => (project?.pieces ?? []).flatMap((p, i) => (p.inner ?? []).filter((l) => l.kind === "hw").map((l) => {
    const s = hwSpot(l), b = shapeBox(p.shape), k = HW_KINDS.find((x) => x.key === hwKind(l.hw));
    return { key: `${p.pid}:${l.id}`, piece: p.name || `ชิ้น ${i + 1}`, kind: k?.th ?? "อะไหล่", size: s.size, top: s.c[1] - b.y, left: s.c[0] - b.x, count: Math.max(1, p.count || 1) };
  })), [project]);
  // ภาพ 3 มิติของใบสเปก: ประกอบฉากเย็บติดจากข้อมูลที่บันทึกแล้ว → วาดนอกจอ → ถ่าย 2 มุม (เฉียงหน้า / เฉียงหลัง) เป็นรูป ใส่ในเอกสาร (พิมพ์ได้แน่นอน)
  const scene = useMemo(() => {
    if (!project?.pieces?.length) return null;
    const asm: AsmPiece[] = project.pieces.map((p, i) => ({ pid: p.pid, name: p.name || `P${i + 1}`, count: p.count, shape: p.shape, holes: p.holes, ...(p.info?.role === "lining" ? { layer: "lining" as const } : {}), ...(p.inner?.length ? { inner: p.inner } : {}), ...(p.edgeMeta ? { edgeMeta: p.edgeMeta } : {}) }));
    const sc = buildSewn(asm, project.seams ?? [], cleanAttaches((project.template as { attach?: unknown } | null)?.attach, new Set(asm.map((p) => p.pid))));
    return sc.joined > 0 ? sc : null;
  }, [project]);
  const [shots, setShots] = useState<{ url: string; label: string }[] | null>(null);
  const shotFor = useRef<unknown>(null);
  const onReady3d = (api: Pattern3DApi) => {
    if (!scene || shotFor.current === scene) return;
    shotFor.current = scene;
    window.setTimeout(() => {   // รอ 1 จังหวะให้ขนาดผืนวาดนิ่ง แล้วถ่าย
      const a = api.snapshot("iso"), b = api.snapshot("back");
      setShots([...(a ? [{ url: a, label: "มุมเฉียงด้านหน้า" }] : []), ...(b ? [{ url: b, label: "มุมเฉียงด้านหลัง" }] : [])]);
    }, 350);
  };
  const body = scene?.asm ?? null;
  const spec = scene ? (
    <div className="break-inside-avoid" data-spec-3d>
      <div className="mb-1 text-[11px] font-medium text-slate-600">ภาพ 3 มิติ (ประกอบจากชิ้นและตะเข็บของแพทเทิร์นตามกติกา ไม่ใช่การจำลองผ้า)</div>
      {shots ? (shots.length ? (
        <div className="grid grid-cols-2 gap-2">
          {shots.map((s) => (
            <figure key={s.label} className="overflow-hidden rounded-lg border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt={s.label} className="block w-full" />
              <figcaption className="border-t border-slate-100 px-2 py-1 text-center text-[11px] text-slate-500">{s.label}</figcaption>
            </figure>
          ))}
        </div>
      ) : <p className="text-[12px] text-slate-500">เครื่องนี้สร้างภาพ 3 มิติไม่ได้ ส่วนอื่นของใบสเปกยังครบ</p>) : <p className="text-[12px] text-slate-400">กำลังสร้างภาพ 3 มิติ…</p>}
      <div className="mt-1.5 text-[12px] text-slate-700">
        {body ? <>ขนาดตัวกระเป๋าตอนเย็บแล้ว (จากเส้นเย็บ): <b className="tabular-nums">กว้าง {body.width.toFixed(1)} × สูง {body.height.toFixed(1)} × ลึก {body.depth.toFixed(1)} ซม.</b> · </> : null}
        เย็บติดแล้ว {scene.joined} ชิ้น · ตะเข็บ {(project?.seams ?? []).length} แนว
        {scene.notes.length > 0 && <span className="text-amber-700"> · ยังไม่อยู่ในภาพ: {scene.notes.map((n) => n.name).join(", ")}</span>}
      </div>
      {!shots && (
        <div aria-hidden className="no-print pointer-events-none fixed" style={{ left: -4000, top: 0, width: 720, height: 540 }}>
          <Pattern3D mode="sewn" sewn={scene} height={540} onReady={onReady3d} />
        </div>
      )}
    </div>
  ) : null;
  const f1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  const th = "py-1 pr-2", tables = seamRows.length || edgeRows.length || pieceRows.length || trims.length || hwRows.length ? (
    <div className="space-y-3">
      {hwRows.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">อะไหล่ที่วางบนชิ้น ({hwRows.length} จุด) — วงกลมมีกากบาทบนรูปชิ้น</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ชิ้น</th><th className={th}>อะไหล่</th><th className={`${th} text-right`}>ขนาด</th><th className={`${th} text-right`}>ห่างขอบบน</th><th className={`${th} text-right`}>ห่างขอบซ้าย</th><th className="py-1 text-right">ต่อชิ้นที่ตัด</th>
            </tr></thead>
            <tbody>
              {hwRows.map((r) => (
                <tr key={r.key} className="border-b border-slate-100">
                  <td className={th}>{r.piece}</td><td className={th}>{r.kind}</td>
                  <td className={`${th} text-right tabular-nums`}>{f1(r.size)} ซม.</td><td className={`${th} text-right tabular-nums`}>{f1(r.top)} ซม.</td><td className={`${th} text-right tabular-nums`}>{f1(r.left)} ซม.</td>
                  <td className="py-1 text-right tabular-nums">{r.count > 1 ? `ตัด ${r.count} ชิ้น ติดทุกชิ้น` : "1 ตัว"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {trims.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">ซิปและอะไหล่ (ต่อกระเป๋า 1 ใบ)</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ใช้ตรงไหน</th><th className={th}>วัสดุ</th><th className={`${th} text-right`}>ยาวต่อเส้น</th><th className={`${th} text-right`}>จำนวน</th><th className="py-1 text-right">รวม</th>
            </tr></thead>
            <tbody>
              {trims.map((r) => (
                <tr key={r.trim.id} className="border-b border-slate-100">
                  <td className={th}>{r.label}</td><td className={th}>{r.trim.mat.name}</td>
                  <td className={`${th} text-right tabular-nums`}>{r.mode === "length" && r.each != null ? `${f1(r.each)} ซม.` : "—"}</td>
                  <td className={`${th} text-right tabular-nums`}>{r.qty} {r.trim.bind ? "ช่วง" : r.mode === "length" ? "เส้น" : "ตัว"}</td>
                  <td className="py-1 text-right tabular-nums">{r.mode === "length" ? `${f1(r.total)} ซม.` : `${r.total} ตัว`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pieceRows.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">รายละเอียดชิ้น</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ชิ้น</th><th className={th}>รหัส</th><th className={th}>ชนิด</th><th className={th}>แผ่นเสริม</th><th className={th}>ปาดขอบ</th><th className={th}>วิธีวางตัด</th><th className="py-1">อยู่ทรง</th>
            </tr></thead>
            <tbody>
              {pieceRows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className={th}>{r.piece}</td><td className={th}>{r.code || "—"}</td><td className={th}>{r.role || "—"}</td><td className={th}>{r.bond || "—"}</td>
                  <td className={th}>{r.skive != null ? `${r.skive} มม.` : "—"}</td><td className={th}>{r.cut || "—"}</td><td className="py-1">{r.solid ? "แข็งอยู่ทรง" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {seamRows.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">ตารางตะเข็บ ({seamRows.length} แนว)</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ตะเข็บ</th><th className={th}>เย็บ</th><th className={th}>กับ</th><th className={`${th} text-right`}>ยาว (ซม.)</th><th className={th}>วิธีเย็บ</th><th className="py-1">เดินด้ายทับ</th>
            </tr></thead>
            <tbody>
              {seamRows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 align-top">
                  <td className={`${th} font-semibold`}>{r.label}{r.name ? <span className="ml-1 font-normal text-slate-600">{r.name}</span> : null}</td>
                  <td className={th}>{r.a}</td><td className={th}>{r.b}{r.rev ? <span className="text-slate-500"> (กลับทิศ)</span> : null}</td>
                  <td className={`${th} text-right tabular-nums`}>{f1(r.la)} / {f1(r.lb)}{r.status === "mismatch" ? (r.ease ? <span className="ml-1 text-amber-700">ตั้งใจให้ย่น {r.diff.toFixed(1)}</span> : <span className="ml-1 font-semibold text-red-600">ต่าง {r.diff.toFixed(1)}</span>) : r.status === "broken" ? <span className="ml-1 text-amber-700">ต้องเย็บใหม่</span> : null}</td>
                  <td className={th}>{r.kind || <span className="text-slate-400">—</span>}</td><td className="py-1">{r.top || <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edgeRows.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">งานขอบ (ขอบที่พับ กุ้น ติดซิป หรือเดินด้ายทับ)</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ชิ้น</th><th className={th}>ขอบ</th><th className={`${th} text-right`}>ยาว (ซม.)</th><th className={`${th} text-right`}>เผื่อ (ซม.)</th><th className="py-1">งาน</th>
            </tr></thead>
            <tbody>
              {edgeRows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className={th}>{r.piece}</td><td className={th}>ขอบ {r.edge}</td><td className={`${th} text-right tabular-nums`}>{r.len.toFixed(1)}</td><td className={`${th} text-right tabular-nums`}>{r.allow}</td>
                  <td className="py-1">{[r.fold ? "พับเข้าใน" : "", r.bind ? (r.bindLen != null ? `กุ้นขอบ ${r.bindLen} ซม.` : "กุ้นขอบ") : "", r.zip ? (r.zipLen != null ? `ติดซิป ${r.zipLen} ซม.` : "ติดซิป") : "", r.top != null ? `เดินด้ายทับห่างขอบ ${r.top} มม.` : ""].filter(Boolean).join(" · ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  ) : undefined;
  const code = project?.pattern_no ?? "";
  usePrintLog("pattern_project", id && project ? [{ doc_id: String(id), doc_no: code || null }] : []);

  if (loading) return <div className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (err) return <div className="p-10 text-center text-sm text-rose-600">{err}</div>;

  return (
    <PatternPrintView lines={lines} afterTable={tables} beforeTable={spec} overviewLabel="ใบสเปก + วางบนผ้า" fileName={docFileName("แพทเทิร์น", code || String(id))}
      eyebrow={`สตูดิโอแพทเทิร์น${project?.sku_code ? ` · ${project.sku_code}` : ""}`} title={`${code} ${project?.name ?? ""}`} footCode={`${code || (project?.name ?? "")}${(project?.template as { rev?: number } | null)?.rev ? ` · rev ${(project?.template as { rev?: number }).rev}` : ""}${draft ? " · แบบร่าง" : ""}`} draft={draft}
      emptyText="แพทเทิร์นนี้ยังไม่มีชิ้น — วาดชิ้นหรือสร้างจากแม่แบบทรงในสตูดิโอ กดบันทึก แล้วเปิดหน้านี้ใหม่" />
  );
}
