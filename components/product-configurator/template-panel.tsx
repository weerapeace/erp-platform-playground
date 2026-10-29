"use client";

/**
 * แท็บ "แม่แบบ & รูปที่ต้องถ่าย"
 *   - แม่แบบต่อมุม (SVG สร้างจากค่าของทรง): ขอบปลอดภัย · เส้นกลาง · เส้นพื้น · จุดวางชิ้นส่วน · ไม้บรรทัด 10 ซม. · รูปผีจาง ๆ (ถ้ามีรูปตัวสินค้าแล้ว)
 *   - โหลดเป็น PNG พื้นใส (วางทับจอกล้อง) / SVG (เปิดใน Photoshop · Illustrator)
 *   - ตั้งเส้นพื้น ไม้บรรทัด และคลิกบนแม่แบบเพื่อวางจุดชิ้นส่วน
 *   - รายการรูปที่ต้องถ่ายทุกไฟล์ + สถานะ มี/ยังไม่มี → โหลดเป็น CSV
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/toast";
import { ERPFormField, ERPInput } from "@/components/form";
import { Icon } from "@/components/icon";
import { r2ImageUrl } from "@/lib/r2-image";
import { expectedImages, shotListCsv, templateSvg, VIEW_LABEL, type ConfigData, type ConfigView, type ViewConfig } from "@/lib/product-configurator";
import { downloadBlob, downloadText, patchRow, svgToPng, toDataUrl } from "./data";

const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50";

export function TemplatePanel({ data, canEdit, view, onView, onChanged }: { data: ConfigData; canEdit: boolean; view: ConfigView; onView: (v: ConfigView) => void; onChanged: () => void }) {
  const toast = useToast();
  const m = data.model;
  const W = m.canvas.w, H = m.canvas.h;
  const [vc, setVc] = useState<ViewConfig>(m.view_config?.[view] ?? {});
  const [ghost, setGhost] = useState(true);
  const [placing, setPlacing] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "missing">("missing");
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setVc(m.view_config?.[view] ?? {}); }, [m.view_config, view]);
  const dirty = JSON.stringify(vc) !== JSON.stringify(m.view_config?.[view] ?? {});

  // รูปผี = รูปชั้นที่ใหญ่ที่สุดที่มีแล้ว (มักเป็นตัวสินค้า) ของมุมนี้
  const ghostKey = useMemo(() => {
    const ls = data.layers.filter((l) => l.view === view && !l.text_slot).sort((a, b) => b.depends_on.length - a.depends_on.length);
    for (const l of ls) { const im = data.images.find((x) => x.layer_id === l.id); if (im) return im.image_key; }
    return null;
  }, [data, view]);
  const model = { ...m, view_config: { ...m.view_config, [view]: vc } };
  const preview = templateSvg(model, view, { ghostUrl: ghost && ghostKey ? r2ImageUrl(ghostKey, 1200) : null, withSize: false });

  const list = useMemo(() => expectedImages(data), [data]);
  const shown = list.filter((e) => (filter === "missing" ? !e.image : true));
  const byView = (v: ConfigView) => { const l = list.filter((e) => e.view === v); return { need: l.length, have: l.filter((e) => e.image).length }; };

  const saveVc = async () => {
    setBusy(true);
    try { await patchRow("models", m.id, { view_config: { ...m.view_config, [view]: vc } }); toast.success("บันทึกค่าแม่แบบแล้ว"); onChanged(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const fileBase = `${m.code}_${VIEW_LABEL[view].code}_template`;
  const downloadSvg = () => downloadText(`${fileBase}.svg`, templateSvg(model, view), "image/svg+xml");
  const downloadPng = async () => {
    setBusy(true);
    try {
      const ghostData = ghost && ghostKey ? await toDataUrl(r2ImageUrl(ghostKey)!) : null;
      downloadBlob(`${fileBase}.png`, await svgToPng(templateSvg(model, view, { ghostUrl: ghostData }), W, H));
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้าง PNG ไม่สำเร็จ"); }
    finally { setBusy(false); }
  };
  const place = (e: React.MouseEvent) => {
    if (!placing.trim() || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - r.left) / r.width) * 1000) / 1000, y = Math.round(((e.clientY - r.top) / r.height) * 1000) / 1000;
    setVc((cur) => ({ ...cur, markers: [...(cur.markers ?? []), { label: placing.trim(), x, y }] }));
    setPlacing("");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {m.views.map((v) => { const c = byView(v); return <button key={v} type="button" onClick={() => onView(v)} className={`rounded-full px-3 py-1 text-sm ${view === v ? "bg-slate-800 text-white" : "border border-slate-200 text-slate-600"}`}>{VIEW_LABEL[v].th} · รูป {c.have}/{c.need}</button>; })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,300px)]">
        <div className="space-y-2">
          <div ref={boxRef} onClick={place} className={`relative w-full overflow-hidden rounded-xl border border-slate-200 bg-[conic-gradient(#e2e8f0_25%,#f8fafc_0_50%,#e2e8f0_0_75%,#f8fafc_0)] bg-[length:20px_20px] ${placing.trim() ? "cursor-crosshair ring-2 ring-pink-400" : ""}`} style={{ aspectRatio: `${W} / ${H}` }}>
            <div className="absolute inset-0 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: preview }} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={busy} onClick={() => void downloadPng()}><Icon name="download" /> โหลด PNG (วางทับจอกล้อง)</button>
            <button type="button" className={btn} onClick={downloadSvg}><Icon name="download" /> โหลด SVG (Photoshop / Illustrator)</button>
            <label className="inline-flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={ghost} disabled={!ghostKey} onChange={(e) => setGhost(e.target.checked)} /> ใส่รูปผีจาง ๆ{!ghostKey ? " (ยังไม่มีรูป)" : ""}</label>
          </div>
        </div>

        <div className="space-y-3">
          <ERPFormField label="เส้นพื้น (% จากบน)" hint="ก้นสินค้าแตะเส้นนี้ทุกรูป"><ERPInput type="number" step="0.5" disabled={!canEdit} value={Math.round((vc.ground_y ?? 0.9) * 1000) / 10} onChange={(e) => setVc({ ...vc, ground_y: Number(e.target.value) / 100 })} /></ERPFormField>
          <ERPFormField label="ไม้บรรทัด: กี่ px ต่อ 1 ซม." hint="วัดจากรูปต้นแบบ: ความกว้างสินค้า (px) ÷ ความกว้างจริง (ซม.) · 0 = ไม่วาด"><ERPInput type="number" step="0.1" disabled={!canEdit} value={vc.cm_px ?? 0} onChange={(e) => setVc({ ...vc, cm_px: Number(e.target.value) || undefined })} /></ERPFormField>
          <ERPFormField label="คำแนะนำการถ่ายของมุมนี้"><ERPInput disabled={!canEdit} value={vc.camera_note ?? ""} onChange={(e) => setVc({ ...vc, camera_note: e.target.value || undefined })} placeholder="ปล่อยว่าง = ใช้คำแนะนำมาตรฐานของมุม" /></ERPFormField>
          <div className="rounded-lg border border-slate-200 p-2">
            <div className="text-xs font-medium text-slate-700">จุดวางชิ้นส่วน</div>
            {canEdit && (
              <div className="mt-1 flex gap-1">
                <input className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 px-2 text-sm" value={placing} onChange={(e) => setPlacing(e.target.value)} placeholder="พิมพ์ชื่อจุด แล้วคลิกบนแม่แบบ" />
              </div>
            )}
            <ul className="mt-1 space-y-0.5 text-xs">
              {(vc.markers ?? []).map((p, i) => (
                <li key={i} className="flex items-center gap-1"><span className="text-pink-600">✛</span><span className="flex-1">{p.label}</span><span className="tabular-nums text-slate-400">{Math.round(p.x * 100)}%, {Math.round(p.y * 100)}%</span>
                  {canEdit && <button type="button" className="text-slate-300 hover:text-red-600" onClick={() => setVc({ ...vc, markers: (vc.markers ?? []).filter((_, j) => j !== i) })} aria-label={`ลบจุด ${p.label}`}><Icon name="delete" /></button>}
                </li>
              ))}
              {(vc.markers ?? []).length === 0 && <li className="text-slate-400">ยังไม่มีจุด เช่น ห่วงสาย · แนวซิป · ป้ายโลโก้</li>}
            </ul>
          </div>
          {canEdit && <button type="button" disabled={!dirty || busy} onClick={() => void saveVc()} className="w-full rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white disabled:opacity-40">บันทึกค่าแม่แบบ{VIEW_LABEL[view].th}</button>}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-800">รายการรูปที่ต้องถ่าย</h3>
          <span className="text-xs text-slate-500">มีแล้ว {list.filter((e) => e.image).length} / {list.length} ไฟล์ (ทุกมุม)</span>
          <div className="ml-auto flex gap-2">
            <select className="h-8 rounded-lg border border-slate-200 px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value as "all" | "missing")}>
              <option value="missing">เฉพาะที่ยังไม่มี</option><option value="all">ทั้งหมด</option>
            </select>
            <button type="button" className={btn} onClick={() => downloadText(`${m.code}_shot-list.csv`, shotListCsv(data), "text/csv;charset=utf-8")}><Icon name="download" /> โหลด CSV</button>
          </div>
        </div>
        <div className="max-h-96 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-2 py-1.5">มุม</th><th className="px-2 py-1.5">ชั้น</th><th className="px-2 py-1.5">ตัวเลือก</th><th className="px-2 py-1.5">ชื่อไฟล์</th><th className="px-2 py-1.5">สถานะ</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {shown.slice(0, 1000).map((e) => (
                <tr key={`${e.view}-${e.layer.id}-${e.comboKey}`}>
                  <td className="px-2 py-1">{VIEW_LABEL[e.view].th}</td><td className="px-2 py-1">{e.layer.name_th}</td><td className="px-2 py-1">{e.label}</td>
                  <td className="px-2 py-1 font-mono text-[11px]">{e.fileName}</td>
                  <td className="px-2 py-1">{e.image ? <span className="text-emerald-700">มีแล้ว</span> : <span className="text-amber-700">ยังไม่มี</span>}</td>
                </tr>
              ))}
              {shown.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">{filter === "missing" ? "ครบแล้ว ไม่มีรูปที่ขาด" : "ยังไม่มีชั้นรูป"}</td></tr>}
            </tbody>
          </table>
          {shown.length > 1000 && <p className="p-2 text-center text-xs text-slate-500">แสดง 1,000 แถวแรก — โหลด CSV เพื่อดูครบ {shown.length.toLocaleString("th-TH")} แถว</p>}
        </div>
      </div>
    </div>
  );
}
