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
import { projectPatternLines, type PatternProject } from "@/lib/pattern-project";

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
  const code = project?.pattern_no ?? "";
  usePrintLog("pattern_project", id && project ? [{ doc_id: String(id), doc_no: code || null }] : []);

  if (loading) return <div className="p-10 text-center text-sm text-slate-400">กำลังโหลด…</div>;
  if (err) return <div className="p-10 text-center text-sm text-rose-600">{err}</div>;

  return (
    <PatternPrintView lines={lines} fileName={docFileName("แพทเทิร์น", code || String(id))}
      eyebrow={`สตูดิโอแพทเทิร์น${project?.sku_code ? ` · ${project.sku_code}` : ""}`} title={`${code} ${project?.name ?? ""}`} footCode={code || (project?.name ?? "")}
      emptyText="แพทเทิร์นนี้ยังไม่มีชิ้น — วาดชิ้นหรือสร้างจากแม่แบบทรงในสตูดิโอ กดบันทึก แล้วเปิดหน้านี้ใหม่" />
  );
}
