"use client";

/**
 * อัปโหลดรูปชั้นทีละหลายไฟล์ — จับคู่จากชื่อไฟล์ (ทรง_มุม_ชั้น_ตัวเลือก.png) ให้เอง
 * ตรวจก่อนส่ง: ชื่อไฟล์ตรงชั้น/ตัวเลือก · PNG จริง · กว้าง×สูงเท่าผืนผ้าใบ (ไม่เท่า = ไม่อัป เพราะจะซ้อนเพี้ยน) · เตือนถ้าไม่มีพื้นใส
 * ไฟล์ที่มีรูปอยู่แล้ว = แทนที่รูปเดิม (บอกก่อนกด)
 */
import { useState } from "react";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { FileDropHint, useFileDrop } from "@/components/file-drop";
import { matchImageFile, VIEW_LABEL, type ConfigData } from "@/lib/product-configurator";
import { createRow, inspectPng, patchRow, uploadPng } from "./data";

type Row = {
  file: File; status: "ready" | "skip" | "done" | "error" | "uploading";
  layerId?: string; comboKey?: string; target?: string; replaces?: string; note: string; warnings: string[]; width?: number | null; height?: number | null;
};

export function BulkUploadModal({ data, open, onClose, onDone }: { data: ConfigData; open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>([]);
  const [running, setRunning] = useState(false);
  const W = data.model.canvas.w, H = data.model.canvas.h;

  const add = async (files: File[]) => {
    const next: Row[] = [];
    for (const file of files) {
      const m = matchImageFile(data, file.name);
      if (!m.ok) { next.push({ file, status: "skip", note: m.reason, warnings: [] }); continue; }
      const png = await inspectPng(file);
      if (!png.ok) { next.push({ file, status: "skip", note: png.error ?? "ไฟล์ไม่ถูกต้อง", warnings: [] }); continue; }
      if (png.width !== W || png.height !== H) { next.push({ file, status: "skip", note: `ขนาด ${png.width}×${png.height} px ไม่เท่าผืนผ้าใบ ${W}×${H} — ส่งออกจากแม่แบบใหม่`, warnings: [] }); continue; }
      const existing = data.images.find((im) => im.layer_id === m.layer.id && im.combo_key === m.comboKey);
      next.push({
        file, status: "ready", layerId: m.layer.id, comboKey: m.comboKey, replaces: existing?.id, width: png.width, height: png.height,
        target: `${VIEW_LABEL[m.layer.view].th} · ${m.layer.name_th}${m.comboKey ? ` · ${m.comboKey.replace(/_/g, " + ")}` : ""}`,
        note: existing ? "แทนรูปเดิม" : "รูปใหม่", warnings: png.warnings,
      });
    }
    // ไฟล์ซ้ำเป้าหมายเดียวกันในชุดเดียว → ใช้ไฟล์หลังสุด
    const seen = new Set<string>();
    for (let i = next.length - 1; i >= 0; i--) {
      const r = next[i];
      if (r.status !== "ready") continue;
      const k = `${r.layerId}|${r.comboKey}`;
      if (seen.has(k)) { next[i] = { ...r, status: "skip", note: "ซ้ำกับไฟล์อื่นในชุดนี้ (ใช้ไฟล์หลังสุด)" }; }
      seen.add(k);
    }
    setRows((cur) => [...cur, ...next]);
  };
  const { over, zone } = useFileDrop((files) => void add(files), { accept: "image/png", folders: true, disabled: running });

  const start = async () => {
    setRunning(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.status !== "ready") continue;
      setRows((cur) => cur.map((x, j) => (j === i ? { ...x, status: "uploading" } : x)));
      try {
        const key = await uploadPng(r.file);
        const body = { image_key: key, width: r.width, height: r.height, file_name: r.file.name };
        if (r.replaces) await patchRow("images", r.replaces, body);
        else await createRow("images", { ...body, layer_id: r.layerId, combo_key: r.comboKey ?? "" });
        ok++;
        setRows((cur) => cur.map((x, j) => (j === i ? { ...x, status: "done", note: "อัปโหลดแล้ว" } : x)));
      } catch (e) {
        fail++;
        setRows((cur) => cur.map((x, j) => (j === i ? { ...x, status: "error", note: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" } : x)));
      }
    }
    setRunning(false);
    if (ok) { toast.success(`อัปโหลดรูปแล้ว ${ok} ไฟล์${fail ? ` · พลาด ${fail}` : ""}`); onDone(); }
    else if (fail) toast.error("ไม่มีรูปไหนอัปโหลดสำเร็จ");
  };

  const ready = rows.filter((r) => r.status === "ready").length;
  const finished = rows.length > 0 && rows.every((r) => r.status !== "ready" && r.status !== "uploading");
  const close = () => { if (!running) { setRows([]); onClose(); } };

  return (
    <ERPModal open={open} onClose={close} title="อัปโหลดรูปหลายไฟล์" size="xl" closeOnBackdrop={!running} hasUnsavedChanges={ready > 0 && !running}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-slate-500">{rows.length ? `พร้อมอัป ${ready} · ข้าม ${rows.filter((r) => r.status === "skip").length}` : "ลากไฟล์หรือทั้งโฟลเดอร์มาวางได้"}</span>
          <div className="flex gap-2">
            <button type="button" onClick={close} disabled={running} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">{finished ? "ปิด" : "ยกเลิก"}</button>
            <button type="button" onClick={() => void start()} disabled={running || ready === 0} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">{running ? "กำลังอัปโหลด…" : `อัปโหลด ${ready} ไฟล์`}</button>
          </div>
        </div>
      }>
      <div className="space-y-3">
        <label {...zone("bulk")} className="relative flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600 hover:bg-slate-100">
          <FileDropHint show={over === "bulk"} label="วางรูปที่นี่" />
          <span className="font-medium">เลือกไฟล์ PNG หรือลากมาวาง (ทั้งโฟลเดอร์ก็ได้)</span>
          <span className="text-xs text-slate-500">ชื่อไฟล์ต้องเป็น {data.model.code}_มุม_ชั้น_ตัวเลือก.png เช่น {data.model.code}_FRONT_BODY_….png · ขนาด {W}×{H} px พื้นใส</span>
          <input type="file" accept="image/png" multiple className="hidden" disabled={running} onChange={(e) => { void add(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        </label>
        {rows.length > 0 && (
          <div className="max-h-[50vh] overflow-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5">ไฟล์</th><th className="px-2 py-1.5">ไปที่</th><th className="px-2 py-1.5">สถานะ</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={`${r.file.name}-${i}`} className={r.status === "skip" || r.status === "error" ? "bg-amber-50/60" : ""}>
                    <td className="px-2 py-1.5 font-mono text-[11px]">{r.file.name}</td>
                    <td className="px-2 py-1.5">{r.target ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <span className={r.status === "done" ? "text-emerald-700" : r.status === "skip" || r.status === "error" ? "text-amber-800" : "text-slate-600"}>{r.status === "uploading" ? "กำลังอัป…" : r.note}</span>
                      {r.warnings.map((w) => <div key={w} className="text-amber-700">{w}</div>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </ERPModal>
  );
}
