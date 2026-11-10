"use client";

/**
 * ✂ หน้าพิมพ์ / ไฟล์เครื่องตัด ของแพทเทิร์นในแอปสตูดิโอแพทเทิร์น — เปิดจากปุ่ม "พิมพ์ / ไฟล์ตัด" ในสตูดิโอ
 *   ภาพรวม + วางบนผ้า · พิมพ์ขนาดจริง A4 1:1 · ดาวน์โหลด DXF / SVG — ตัวหน้าพิมพ์ = ของกลาง PatternPrintView (ตัวเดียวกับใบงานออกแบบ)
 *   อ่านแพทเทิร์นที่ "บันทึกแล้ว" จาก /api/pattern-projects/<id> (ต้องมีสิทธิ์ pattern_studio.view)
 */
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { usePrintLog } from "@/components/report/use-print-log";
import { apiFetch } from "@/lib/api";
import { docFileName } from "@/lib/print-filename";
import { PatternPrintView } from "@/components/pattern-sheet/print-view";
import { projectEdgeRows, projectPatternLines, projectPieceRows, projectSeamRows, type PatternProject } from "@/lib/pattern-project";

export default function PrintPatternProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<PatternProject | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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
  const f1 = (v: number | null) => (v == null ? "—" : v.toFixed(1));
  const th = "py-1 pr-2", tables = seamRows.length || edgeRows.length || pieceRows.length ? (
    <div className="space-y-3">
      {pieceRows.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">รายละเอียดชิ้น</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ชิ้น</th><th className={th}>รหัส</th><th className={th}>ชนิด</th><th className={th}>แผ่นเสริม</th><th className={th}>ปาดขอบ</th><th className="py-1">อยู่ทรง</th>
            </tr></thead>
            <tbody>
              {pieceRows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className={th}>{r.piece}</td><td className={th}>{r.code || "—"}</td><td className={th}>{r.role || "—"}</td><td className={th}>{r.bond || "—"}</td>
                  <td className={th}>{r.skive != null ? `${r.skive} มม.` : "—"}</td><td className="py-1">{r.solid ? "แข็งอยู่ทรง" : "—"}</td>
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
                  <td className={`${th} text-right tabular-nums`}>{f1(r.la)} / {f1(r.lb)}{r.status === "mismatch" ? <span className="ml-1 font-semibold text-red-600">ต่าง {r.diff.toFixed(1)}</span> : r.status === "broken" ? <span className="ml-1 text-amber-700">ต้องเย็บใหม่</span> : null}</td>
                  <td className={th}>{r.kind || <span className="text-slate-400">—</span>}</td><td className="py-1">{r.top || <span className="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {edgeRows.length > 0 && (
        <div className="break-inside-avoid">
          <div className="mb-1 text-[11px] font-medium text-slate-600">งานขอบ (ขอบที่พับ กุ้น หรือเดินด้ายทับ)</div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="border-b border-slate-300 text-left text-[11px] text-slate-500">
              <th className={th}>ชิ้น</th><th className={th}>ขอบ</th><th className={`${th} text-right`}>ยาว (ซม.)</th><th className={`${th} text-right`}>เผื่อ (ซม.)</th><th className="py-1">งาน</th>
            </tr></thead>
            <tbody>
              {edgeRows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className={th}>{r.piece}</td><td className={th}>ขอบ {r.edge}</td><td className={`${th} text-right tabular-nums`}>{r.len.toFixed(1)}</td><td className={`${th} text-right tabular-nums`}>{r.allow}</td>
                  <td className="py-1">{[r.fold ? "พับเข้าใน" : "", r.bind ? "กุ้นขอบ" : "", r.top != null ? `เดินด้ายทับห่างขอบ ${r.top} มม.` : ""].filter(Boolean).join(" · ")}</td>
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
    <PatternPrintView lines={lines} afterTable={tables} fileName={docFileName("แพทเทิร์น", code || String(id))}
      eyebrow={`สตูดิโอแพทเทิร์น${project?.sku_code ? ` · ${project.sku_code}` : ""}`} title={`${code} ${project?.name ?? ""}`} footCode={code || (project?.name ?? "")}
      emptyText="แพทเทิร์นนี้ยังไม่มีชิ้น — วาดชิ้นหรือสร้างจากแม่แบบทรงในสตูดิโอ กดบันทึก แล้วเปิดหน้านี้ใหม่" />
  );
}
