"use client";

// ตัวอย่างของกลาง SplitPanes (กล่องแบ่งซ้าย-ขวา ดันกันได้) — components/split-panes · คู่มือ docs/split-panes.md
import { PlaygroundShell } from "@/components/playground-shell";
import { SplitPanes } from "@/components/split-panes";

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <span className="text-[11px] text-slate-500">{label}</span>
    <div className="h-8 mt-0.5 px-2 flex items-center text-sm border border-slate-200 rounded-lg text-slate-700 truncate">{value}</div>
  </div>
);

export default function SplitPanesPreviewPage() {
  return (
    <PlaygroundShell>
      <div className="px-8 py-6 space-y-4 max-w-6xl">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">กล่องแบ่งซ้าย-ขวา ดันกันได้ (SplitPanes)</h1>
          <p className="text-sm text-slate-500 mt-1">กดกล่องไหน กล่องนั้นขยาย · มุมขวาบนสลับ &quot;ดัน / พับ&quot; · กดเส้นกลางกลับครึ่ง-ครึ่ง · ย่อหน้าต่างให้แคบ = เรียงบน-ล่าง</p>
        </div>
        <SplitPanes prefKey="demo_split_panes"
          left={{ title: "ข้อมูลงาน", icon: "document", content: (size) => {
            const cols = size === "narrow" ? 1 : size === "half" ? 2 : 3;
            return (
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                <Field label="เลขที่" value="DS-2026-0064" /><Field label="สถานะ" value="ตั้ง SKU แล้ว" /><Field label="แบรนด์" value="Good Goods" />
                <Field label="วันที่สั่ง" value="21/07/2026" /><Field label="Deadline" value="—" /><Field label="วันนัด" value="—" />
                <p className="text-[11px] text-slate-400" style={{ gridColumn: "1 / -1" }}>ขนาดตอนนี้: {size} → {cols} คอลัมน์</p>
              </div>
            );
          } }}
          right={{ title: "รายละเอียดงาน", icon: "note", content: (
            <textarea rows={8} defaultValue={"Tote 3 ไซส์ (XS / S / M)\nผ้าตัวกระเป๋า: ผ้าขาวม้านาหมื่นศรี\nซับใน: ผ้าซับในสีครีม"} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
          ) }} />
      </div>
    </PlaygroundShell>
  );
}
