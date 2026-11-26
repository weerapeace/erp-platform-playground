"use client";
/**
 * 🧵 ไฟล์ปัก — แผงตั้งค่าชิ้นที่เลือก (รอบ 4 ข้อ 6-8 · แบบแถบขวาของโปรแกรม Tajima)
 *   ชนิดฝี · มุมแถว (อัตโนมัติ/ตั้งเอง) · ความแน่น · ฝีรองพื้น (ตามงาน/เปิด/ปิด) · เส้นทิศฝีเข็ม (ลาก/ล้าง) · แก้จุดรูปทรง
 *   ทุกค่าเก็บใน settings.piece_opts / piece_types (ย้อนกลับได้ด้วยปุ่มย้อนกลับ/Ctrl+Z ของหน้าทำงาน)
 */
import { Icon } from "@/components/icon";
import { STITCH_TYPES, type PieceInfo, type PieceOpt, type StitchType } from "@/lib/embroidery";
import { fmtNum } from "./shared";

export type EditTool = "select" | "dir" | "node";

export function PiecePanel({ info, opt, typeSet, canEdit, tool, setTool, onType, onOpt, onReset, onClose }: {
  info: PieceInfo; opt: PieceOpt; typeSet: StitchType | undefined; canEdit: boolean;
  tool: EditTool; setTool: (t: EditTool) => void;
  onType: (t: StitchType | null) => void; onOpt: (patch: Partial<Record<keyof PieceOpt, PieceOpt[keyof PieceOpt] | null>>) => void; onReset: () => void; onClose: () => void;
}) {
  const chip = (on: boolean) => `rounded-lg border px-2.5 py-1 text-xs ${on ? "border-indigo-400 bg-white font-medium text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`;
  const fill = info.type === "fill";
  const lines = opt.lines?.length ?? 0;
  const custom = typeSet || Object.keys(opt).length > 0;
  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="h-4 w-4 rounded border border-black/10" style={{ background: info.color }} />
        <b className="font-medium text-slate-800">{info.name}</b>
        <span className="text-xs text-slate-500">กว้างเฉลี่ย {info.width.toFixed(1)} มม. · {fmtNum(info.stitches)} ฝี</span>
        <button type="button" onClick={onClose} className="ml-auto text-xs text-slate-500 hover:text-slate-800">ปิด ×</button>
      </div>
      {info.warn && <div className={`mt-1 ${info.level === "danger" ? "text-red-700" : "text-amber-800"}`}>{info.warn}</div>}

      <div className="mt-2 font-medium text-slate-600">ชนิดฝี</div>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {STITCH_TYPES.filter((t) => t.key !== "auto").map((t) => (
          <button key={t.key} type="button" disabled={!canEdit} title={t.hint} onClick={() => onType(t.key)} className={chip(typeSet === t.key)}>{t.th}</button>
        ))}
        <button type="button" disabled={!canEdit} onClick={() => onType(null)} className={chip(!typeSet)}>ตามสี{!typeSet ? ` (${STITCH_TYPES.find((t) => t.key === info.type)?.th})` : ""}</button>
      </div>

      {info.type !== "skip" && info.type !== "run" && (
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <label className="space-y-0.5">
            <span className="block text-slate-600">{fill ? "มุมแถวถม" : "มุมฝี (ซิกแซกทิศเดียว)"}</span>
            <span className="flex items-center gap-1">
              <input type="number" min={0} max={179} disabled={!canEdit} placeholder="อัตโนมัติ" value={opt.angle ?? ""}
                onChange={(e) => onOpt({ angle: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-full rounded border border-slate-200 bg-white px-1.5" />°
            </span>
          </label>
          <label className="space-y-0.5">
            <span className="block text-slate-600">ความแน่น (มม.)</span>
            <input type="number" min={0.2} max={2} step={0.05} disabled={!canEdit} placeholder="ตามงาน" value={opt.spacing ?? ""}
              onChange={(e) => onOpt({ spacing: e.target.value === "" ? null : Number(e.target.value) })} className="h-8 w-full rounded border border-slate-200 bg-white px-1.5" />
          </label>
          <label className="space-y-0.5">
            <span className="block text-slate-600">ฝีรองพื้น</span>
            <select disabled={!canEdit} value={opt.underlay == null ? "" : opt.underlay ? "on" : "off"} onChange={(e) => onOpt({ underlay: e.target.value === "" ? null : e.target.value === "on" })}
              className="h-8 w-full rounded border border-slate-200 bg-white px-1">
              <option value="">ตามงาน</option><option value="on">ใส่</option><option value="off">ไม่ใส่</option>
            </select>
          </label>
        </div>
      )}

      {canEdit && info.type !== "skip" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {info.type !== "run" && (
            <button type="button" onClick={() => setTool(tool === "dir" ? "select" : "dir")} className={chip(tool === "dir")}>
              <Icon name="edit" /> {tool === "dir" ? "กำลังลากทิศฝี (กดอีกครั้ง = เสร็จ)" : "ลากเส้นทิศฝีเข็ม"}
            </button>
          )}
          {lines > 0 && <button type="button" onClick={() => onOpt({ lines: null })} className={chip(false)}>ล้างเส้นทิศ ({lines})</button>}
          <button type="button" onClick={() => setTool(tool === "node" ? "select" : "node")} className={chip(tool === "node")}>
            <Icon name="design" /> {tool === "node" ? "กำลังแก้จุด (กดอีกครั้ง = เสร็จ)" : "แก้จุดรูปทรง"}
          </button>
          {custom && <button type="button" onClick={onReset} className="ml-auto text-slate-500 underline">ล้างค่าชิ้นนี้</button>}
        </div>
      )}
      {tool === "dir" && <p className="mt-1.5 text-[11px] text-indigo-700">ลากเส้นบนชิ้นนี้ตามทิศที่อยากให้ฝีเข็มวาง · ลากหลายเส้นได้ ฝีจะค่อย ๆ หมุนตามเส้นที่ใกล้ที่สุด</p>}
      {tool === "node" && <p className="mt-1.5 text-[11px] text-indigo-700">ลากจุดสีขาวที่ขอบชิ้นเพื่อแก้รูปทรง (เช่น ทำเส้นให้หนาขึ้น) · ปล่อยเมาส์แล้วระบบคำนวณฝีใหม่</p>}
    </div>
  );
}
