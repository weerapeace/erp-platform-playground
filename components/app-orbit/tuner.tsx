"use client";

/**
 * ◎ แผงปรับวงแอป (ของกลาง) — แผงลอย (FloatingPanel) ไม่บังหน้า → ปรับแล้วเห็นวงเปลี่ยนสด ๆ ข้างหลัง
 *
 *   ของฉัน        = ปรับแล้วเห็นเฉพาะตัวเอง (บันทึกอัตโนมัติ) · ปุ่ม "ใช้ค่ากลางของทีม" ล้างของตัวเอง
 *   ค่ากลางทั้งทีม = แอดมินเท่านั้น (admin.users) · ร่างก่อน กด 💾 ถึงมีผลกับทุกคนที่ยังไม่ได้ปรับเอง
 * ค่า/ช่วงค่า/ชุดสำเร็จรูปมาจาก lib/app-orbit-style · ใช้ที่: /apps
 */
import type { ReactNode } from "react";
import { FloatingPanel } from "@/components/floating-panel";
import { RangeInput } from "@/components/range-input";
import { ORBIT_PRESETS, ORBIT_RANGES, matchOrbitPreset, type OrbitStyle } from "@/lib/app-orbit-style";

export type OrbitTunerScope = "mine" | "team";

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} aria-pressed={value === v}
          className={`h-7 px-2.5 rounded-full border text-xs ${value === v ? "bg-slate-900 border-slate-900 text-white" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{label}</button>
      ))}
    </div>
  );
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4 accent-blue-600" />
      {label}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5">
      <h3 className="text-xs font-semibold text-slate-500">{title}</h3>
      {children}
    </section>
  );
}

export function AppOrbitTuner({ open, onClose, value, onPatch, onPreset, onReplay, scope, onScope, canTeam, mineCount, onResetMine, teamDirty, savingTeam, onSaveTeam, onCancelTeam }: {
  open: boolean;
  onClose: () => void;
  /** ค่าที่กำลังแก้ (ของฉันรวมกับทีม / ร่างค่ากลาง) */
  value: OrbitStyle;
  onPatch: (patch: Partial<OrbitStyle>) => void;
  onPreset: (style: OrbitStyle) => void;
  onReplay: () => void;
  scope: OrbitTunerScope;
  onScope: (s: OrbitTunerScope) => void;
  /** แอดมิน (admin.users) — แก้ค่ากลางทั้งทีมได้ */
  canTeam: boolean;
  /** จำนวนช่องที่ "ของฉัน" ต่างจากค่าทีม */
  mineCount: number;
  onResetMine: () => void;
  teamDirty: boolean;
  savingTeam: boolean;
  onSaveTeam: () => void;
  onCancelTeam: () => void;
}) {
  const v = value;
  const range = (k: keyof typeof ORBIT_RANGES, label: string) => {
    const r = ORBIT_RANGES[k];
    return <RangeInput label={label} value={v[k]} min={r.min} max={r.max} step={r.step} unit={r.unit || undefined} onChange={(x) => onPatch({ [k]: x } as Partial<OrbitStyle>)} />;
  };
  const preset = matchOrbitPreset(v);
  const footer = scope === "team" ? (
    <div className="flex items-center justify-end gap-2">
      {teamDirty && <span className="mr-auto text-xs text-amber-600">ยังไม่ได้บันทึก</span>}
      <button type="button" onClick={onCancelTeam} disabled={savingTeam} className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ยกเลิก</button>
      <button type="button" onClick={onSaveTeam} disabled={savingTeam || !teamDirty}
        className="h-9 px-4 text-sm rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50">{savingTeam ? "กำลังบันทึก…" : "💾 บันทึกค่ากลาง"}</button>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <span className="mr-auto text-xs text-slate-500">{mineCount ? `ปรับเอง ${mineCount} อย่าง · ที่เหลือตามค่าทีม` : "ใช้ค่ากลางของทีมอยู่"}</span>
      {mineCount > 0 && <button type="button" onClick={onResetMine} className="h-9 px-3 text-sm rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">ใช้ค่ากลางของทีม</button>}
    </div>
  );

  return (
    <FloatingPanel open={open} onClose={onClose} title="ปรับวงแอป" icon="◎" width={380} storageKey="launcher-orbit-tuner" footer={footer}>
      <div className="space-y-3 p-3 bg-slate-50 min-h-full">
        {canTeam && (
          <div className="space-y-1.5">
            <Seg<OrbitTunerScope> value={scope} onChange={onScope} options={[["mine", "ของฉัน"], ["team", "ค่ากลางทั้งทีม"]]} />
            <p className="text-[11px] text-slate-500">
              {scope === "mine" ? "ปรับแล้วเห็นเฉพาะคุณ บันทึกให้อัตโนมัติ" : "ทุกคนที่ยังไม่ได้ปรับเองจะเห็นแบบนี้ — กดบันทึกถึงจะมีผล"}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {ORBIT_PRESETS.map((p) => (
            <button key={p.key} type="button" onClick={() => onPreset(p.style)}
              className={`h-7 px-2.5 rounded-full border text-xs ${preset === p.key ? "bg-blue-50 border-blue-300 text-blue-700 font-medium" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{p.label}</button>
          ))}
          <button type="button" onClick={onReplay} className="h-7 px-2.5 rounded-full border border-slate-200 bg-white text-xs text-slate-600 hover:bg-slate-50">▶ เล่นตอนเปิดหน้า</button>
        </div>

        <Group title="รูปแบบวง">
          <Seg value={v.mode} onChange={(mode) => onPatch({ mode })}
            options={[["ellipse", "วงรี"], ["circle", "วงกลม"], ["ring", "วงแหวน 3 มิติ"], ["row", "แถวเอียง"], ["gallery", "แกลเลอรี"]]} />
          {range("radius", "ระยะห่างจากกลาง")}
          {(v.mode === "ring" || v.mode === "row") && range("tilt", "ความเอียง 3 มิติ")}
          {v.mode === "ring" && range("depth", "ใกล้ใหญ่ไกลเล็ก")}
          {(v.mode === "ellipse" || v.mode === "circle") && v.radius < 85 && <p className="text-[11px] text-slate-400">ระยะต่ำกว่า 85% แผงเมนูจะย้ายไปอยู่ใต้วง</p>}
        </Group>

        <Group title="การเคลื่อนไหว">
          <Toggle checked={v.spin} label={v.mode === "gallery" ? "เลื่อนเองจนกว่าจะมีคนกด" : "หมุนเองช้า ๆ"} onChange={(spin) => onPatch({ spin })} />
          {v.spin && range("speed", "ความเร็ว")}
          {v.spin && v.mode !== "gallery" && <Seg<1 | -1> value={v.dir} onChange={(dir) => onPatch({ dir })} options={[[1, "ตามเข็ม"], [-1, "ทวนเข็ม"]]} />}
          {v.spin && <Toggle checked={v.pause} label="หยุดเมื่อเอาเมาส์ชี้" onChange={(pause) => onPatch({ pause })} />}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">ตอนเปิดหน้า</p>
            <Seg value={v.intro} onChange={(intro) => onPatch({ intro })} options={[["spin", "หมุนเข้า"], ["burst", "กระจายจากกลาง"], ["drop", "ลอยขึ้น"], ["none", "ไม่มี"]]} />
          </div>
        </Group>

        <Group title="เอฟเฟกต์เมาส์ (จอคอม)">
          <Toggle checked={v.push} label="การ์ดหลบเมาส์" onChange={(push) => onPatch({ push })} />
          {v.push && range("pushStr", "แรงหลบ")}
          {v.push && range("pushR", "ระยะหลบ")}
          {range("zoom", "ขยายเมื่อชี้")}
          <Toggle checked={v.parallax} label="ทั้งวงเอียงตามเมาส์" onChange={(parallax) => onPatch({ parallax })} />
        </Group>

        <Group title="การ์ด">
          {range("size", "ขนาด")}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">ทรง</p>
            <Seg value={v.shape} onChange={(shape) => onPatch({ shape })} options={[["round", "มน"], ["circle", "วงกลม"], ["portrait", "แนวตั้ง"]]} />
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">สี (ตั้งสีแอปได้ที่ จัดการเมนู → ตั้งค่าแอป)</p>
            <Seg value={v.color} onChange={(color) => onPatch({ color })} options={[["tint", "อ่อนตามแอป"], ["solid", "เข้ม"], ["white", "ขาวล้วน"]]} />
          </div>
          <Toggle checked={v.labels} label="โชว์ชื่อใต้การ์ด" onChange={(labels) => onPatch({ labels })} />
        </Group>
        <p className="text-[11px] text-slate-400 px-1">เครื่องที่ตั้ง &ldquo;ลดภาพเคลื่อนไหว&rdquo; จะไม่หมุน/ไม่หลบเมาส์ให้อัตโนมัติ · มือถือใช้แบบแกลเลอรีเสมอ</p>
      </div>
    </FloatingPanel>
  );
}
