"use client";

/**
 * ของกลาง — ตัวจัดบล็อกของหน้าเว็บ (ใช้ทั้งแท็บ "หน้าแรก" และ "หน้าเว็บ")
 * เพิ่ม/ลบ/ลากสลับลำดับ/เปิด-ปิด + ฟอร์มแก้ข้อความของแต่ละชนิดบล็อก
 */
import { useState } from "react";

export type BlockType =
  | "announcement"
  | "hero"
  | "two-tracks"
  | "categories"
  | "featured"
  | "faq"
  | "cta"
  | "rich-text";

export interface Block {
  id: string;
  type: BlockType;
  enabled: boolean;
  [k: string]: unknown;
}

export type BlockTypeInfo = { type: BlockType; label: string; icon: string; hint: string };

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

/** สรุปสั้น ๆ ของบล็อกไว้โชว์ในรายการ */
export function blockSummary(b: Block): string {
  switch (b.type) {
    case "announcement":
      return ((b.messages as string[]) ?? []).join(" · ").slice(0, 70) || "ยังไม่มีข้อความ";
    case "hero":
      return `${b.title ?? ""} ${b.titleAccent ?? ""}`.trim() || "ยังไม่ตั้งหัวเรื่อง";
    case "featured":
      return `${b.title ?? ""} · ${b.limit ?? 4} ชิ้น`;
    case "faq":
      return `${((b.items as unknown[]) ?? []).length} คำถาม`;
    case "two-tracks":
      return ((b.cards as { title?: string }[]) ?? []).map((c) => c.title).filter(Boolean).join(" / ") || "2 การ์ด";
    default:
      return String(b.title ?? "") || "—";
  }
}

/** สร้างบล็อกใหม่ (ค่าเริ่มต้นเดียวกับฝั่ง API) */
export function makeBlock(type: BlockType, seq: number): Block {
  const id = `${type}-${seq}-${Math.floor(Math.random() * 1000)}`;
  const base = { id, type, enabled: true };
  switch (type) {
    case "announcement":
      return { ...base, messages: ["ข้อความประกาศของร้าน"] };
    case "hero":
      return {
        ...base,
        eyebrow: "รับผลิตเครื่องหนัง & วัสดุงานหนัง",
        title: "งานหนังคุณภาพ",
        titleAccent: "ครบ จบ ที่เดียว",
        subtitle: "รับผลิตกระเป๋าและเข็มขัดหนังแท้ พร้อมจำหน่ายวัสดุงานหนังครบวงจร",
        primary: { text: "ขอใบเสนอราคา", href: "/quote" },
        secondary: { text: "เข้าร้านวัสดุ", href: "/shop" },
        features: [
          { title: "หนังแท้", desc: "คัดเกรดทุกผืน" },
          { title: "งานเย็บมือ", desc: "ประณีตทุกตะเข็บ" },
        ],
      };
    case "two-tracks":
      return {
        ...base,
        eyebrow: "บริการของเรา",
        title: "สองบริการหลัก",
        subtitle: "",
        cards: [
          { emoji: "🏭", title: "รับผลิต (OEM)", desc: "", bullets: [], primary: { text: "ขอใบเสนอราคา", href: "/quote" }, secondary: { text: "ดูผลงาน", href: "/gallery" }, dark: true },
          { emoji: "🛒", title: "ร้านวัสดุ", desc: "", bullets: [], primary: { text: "เข้าร้าน", href: "/shop" }, secondary: { text: "", href: "" }, dark: false },
        ],
      };
    case "categories":
      return { ...base, eyebrow: "ร้านวัสดุ", title: "เลือกซื้อตามหมวด" };
    case "featured":
      return { ...base, eyebrow: "ขายดี", title: "วัสดุแนะนำ", limit: 4 };
    case "faq":
      return { ...base, eyebrow: "คำถามที่พบบ่อย", title: "เรื่องที่ลูกค้าถามบ่อย", subtitle: "", items: [{ q: "คำถาม", a: "คำตอบ" }] };
    case "cta":
      return { ...base, title: "มีแบบในใจแล้ว?", subtitle: "", primary: { text: "ขอใบเสนอราคา", href: "/quote" }, secondary: { text: "ติดต่อเรา", href: "/contact" } };
    case "rich-text":
      return { ...base, eyebrow: "", title: "หัวข้อ", body: "เนื้อหา" };
  }
}

/* ── ตัวช่วยฟอร์ม ── */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function LinkPair({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { text?: string; href?: string } | undefined;
  onChange: (v: { text: string; href: string }) => void;
}) {
  const v = value ?? { text: "", href: "" };
  return (
    <Field label={label}>
      <div className="flex gap-2">
        <input className={inputCls} placeholder="ข้อความปุ่ม" value={v.text ?? ""} onChange={(e) => onChange({ text: e.target.value, href: v.href ?? "" })} />
        <input className={inputCls} placeholder="/quote" value={v.href ?? ""} onChange={(e) => onChange({ text: v.text ?? "", href: e.target.value })} />
      </div>
    </Field>
  );
}

function ListEditor({
  label,
  items,
  placeholder,
  onChange,
}: {
  label: string;
  items: string[];
  placeholder?: string;
  onChange: (v: string[]) => void;
}) {
  return (
    <Field label={label}>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5">
            <input className={inputCls} value={it} placeholder={placeholder} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="shrink-0 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 text-sm">×</button>
          </div>
        ))}
        <button onClick={() => onChange([...items, ""])} className="text-xs text-blue-600 hover:underline">+ เพิ่มรายการ</button>
      </div>
    </Field>
  );
}

/** ฟอร์มแก้บล็อกทีละชนิด */
export function BlockEditor({ block, onChange }: { block: Block; onChange: (p: Record<string, unknown>) => void }) {
  const s = (k: string) => (block[k] as string) ?? "";

  switch (block.type) {
    case "announcement":
      return (
        <ListEditor
          label="ข้อความประกาศ (สลับวนทีละข้อความ)"
          items={(block.messages as string[]) ?? []}
          placeholder="เช่น ส่งฟรีเมื่อสั่งครบ ฿1,500"
          onChange={(v) => onChange({ messages: v })}
        />
      );

    case "hero": {
      const features = ((block.features as { title: string; desc: string }[]) ?? []);
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ข้อความเล็กด้านบน"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
          <Field label="หัวเรื่องบรรทัดแรก"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          <Field label="หัวเรื่องบรรทัดสอง (สีแบรนด์)"><input className={inputCls} value={s("titleAccent")} onChange={(e) => onChange({ titleAccent: e.target.value })} /></Field>
          <div className="sm:col-span-2">
            <Field label="คำโปรย"><textarea rows={2} className={inputCls} value={s("subtitle")} onChange={(e) => onChange({ subtitle: e.target.value })} /></Field>
          </div>
          <LinkPair label="ปุ่มหลัก" value={block.primary as { text: string; href: string }} onChange={(v) => onChange({ primary: v })} />
          <LinkPair label="ปุ่มรอง" value={block.secondary as { text: string; href: string }} onChange={(v) => onChange({ secondary: v })} />
          <div className="sm:col-span-2">
            <label className={labelCls}>แถวจุดเด่นด้านล่าง</label>
            <div className="space-y-1.5">
              {features.map((f, i) => (
                <div key={i} className="flex gap-1.5">
                  <input className={inputCls} placeholder="หัวข้อ" value={f.title} onChange={(e) => onChange({ features: features.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                  <input className={inputCls} placeholder="คำอธิบาย" value={f.desc} onChange={(e) => onChange({ features: features.map((x, j) => (j === i ? { ...x, desc: e.target.value } : x)) })} />
                  <button onClick={() => onChange({ features: features.filter((_, j) => j !== i) })} className="shrink-0 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500">×</button>
                </div>
              ))}
              <button onClick={() => onChange({ features: [...features, { title: "", desc: "" }] })} className="text-xs text-blue-600 hover:underline">+ เพิ่มจุดเด่น</button>
            </div>
          </div>
        </div>
      );
    }

    case "two-tracks": {
      const cards = ((block.cards as Record<string, unknown>[]) ?? []);
      const setCard = (i: number, p: Record<string, unknown>) => onChange({ cards: cards.map((c, j) => (j === i ? { ...c, ...p } : c)) });
      return (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ข้อความเล็ก"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
            <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
            <Field label="คำโปรย"><input className={inputCls} value={s("subtitle")} onChange={(e) => onChange({ subtitle: e.target.value })} /></Field>
          </div>
          {cards.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
              <p className="text-xs font-medium text-slate-600">การ์ดที่ {i + 1}</p>
              <div className="grid gap-2.5 sm:grid-cols-3">
                <Field label="ไอคอน"><input className={inputCls} maxLength={4} value={(c.emoji as string) ?? ""} onChange={(e) => setCard(i, { emoji: e.target.value })} /></Field>
                <div className="sm:col-span-2">
                  <Field label="หัวข้อ"><input className={inputCls} value={(c.title as string) ?? ""} onChange={(e) => setCard(i, { title: e.target.value })} /></Field>
                </div>
              </div>
              <Field label="คำอธิบาย"><textarea rows={2} className={inputCls} value={(c.desc as string) ?? ""} onChange={(e) => setCard(i, { desc: e.target.value })} /></Field>
              <ListEditor label="รายการย่อย" items={(c.bullets as string[]) ?? []} onChange={(v) => setCard(i, { bullets: v })} />
              <div className="grid gap-2.5 sm:grid-cols-2">
                <LinkPair label="ปุ่มหลัก" value={c.primary as { text: string; href: string }} onChange={(v) => setCard(i, { primary: v })} />
                <LinkPair label="ปุ่มรอง" value={c.secondary as { text: string; href: string }} onChange={(v) => setCard(i, { secondary: v })} />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={Boolean(c.dark)} onChange={(e) => setCard(i, { dark: e.target.checked })} />
                พื้นหลังสีเข้ม
              </label>
            </div>
          ))}
        </div>
      );
    }

    case "categories":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ข้อความเล็ก"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
          <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          <p className="sm:col-span-2 text-[11px] text-slate-400">* หมวดที่แสดงมาจากหมวดวัสดุของเว็บ (หนัง/ผ้า/อะไหล่/สีทาขอบ)</p>
        </div>
      );

    case "featured":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="ข้อความเล็ก"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
          <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          <Field label="จำนวนที่แสดง">
            <input type="number" min={2} max={12} className={inputCls} value={(block.limit as number) ?? 4} onChange={(e) => onChange({ limit: Number(e.target.value) })} />
          </Field>
          <p className="sm:col-span-3 text-[11px] text-slate-400">* ดึงจากสินค้าที่ติ๊ก &quot;⭐ แนะนำ&quot; ในแท็บสินค้าบนเว็บ</p>
        </div>
      );

    case "faq": {
      const items = ((block.items as { q: string; a: string }[]) ?? []);
      const setItem = (i: number, p: Partial<{ q: string; a: string }>) => onChange({ items: items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ข้อความเล็ก"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
            <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
            <Field label="คำโปรย"><input className={inputCls} value={s("subtitle")} onChange={(e) => onChange({ subtitle: e.target.value })} /></Field>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5 space-y-1.5">
                <div className="flex gap-1.5">
                  <input className={inputCls} placeholder="คำถาม" value={it.q} onChange={(e) => setItem(i, { q: e.target.value })} />
                  <button onClick={() => onChange({ items: items.filter((_, j) => j !== i) })} className="shrink-0 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500">×</button>
                </div>
                <textarea rows={2} className={inputCls} placeholder="คำตอบ" value={it.a} onChange={(e) => setItem(i, { a: e.target.value })} />
              </div>
            ))}
            <button onClick={() => onChange({ items: [...items, { q: "", a: "" }] })} className="text-xs text-blue-600 hover:underline">+ เพิ่มคำถาม</button>
          </div>
        </div>
      );
    }

    case "cta":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="คำโปรย"><input className={inputCls} value={s("subtitle")} onChange={(e) => onChange({ subtitle: e.target.value })} /></Field>
          </div>
          <LinkPair label="ปุ่มหลัก" value={block.primary as { text: string; href: string }} onChange={(v) => onChange({ primary: v })} />
          <LinkPair label="ปุ่มรอง" value={block.secondary as { text: string; href: string }} onChange={(v) => onChange({ secondary: v })} />
        </div>
      );

    case "rich-text":
      return (
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ข้อความเล็ก"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
            <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
          </div>
          <Field label="เนื้อหา"><textarea rows={5} className={inputCls} value={s("body")} onChange={(e) => onChange({ body: e.target.value })} /></Field>
        </div>
      );

    default:
      return <p className="text-xs text-slate-400">บล็อกนี้ยังไม่มีตัวแก้ไข</p>;
  }
}

/** รายการบล็อก + เพิ่ม/ลบ/ลาก/เปิด-ปิด */
export function BlockListEditor({
  blocks,
  types,
  onChange,
}: {
  blocks: Block[];
  types: BlockTypeInfo[];
  onChange: (next: Block[]) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const patch = (id: string, p: Record<string, unknown>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const move = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const remove = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    const label = types.find((t) => t.type === b?.type)?.label ?? "บล็อก";
    if (!confirm(`ลบบล็อก "${label}" ออกจากหน้า?`)) return;
    onChange(blocks.filter((x) => x.id !== id));
  };

  const add = (type: BlockType) => {
    const fresh = makeBlock(type, blocks.length + 1);
    onChange([...blocks, fresh]);
    setOpenId(fresh.id);
    setShowAdd(false);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const from = blocks.findIndex((b) => b.id === dragId);
    const to = blocks.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
    setDragId(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">ลากเพื่อสลับลำดับ · กดชื่อเพื่อแก้ข้อความ</p>
        <button onClick={() => setShowAdd((v) => !v)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          {showAdd ? "ปิด" : "+ เพิ่มบล็อก"}
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 grid gap-2 sm:grid-cols-2">
          {types.map((t) => (
            <button key={t.type} onClick={() => add(t.type)} className="flex items-start gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-400">
              <span className="text-lg leading-none">{t.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm text-slate-800">{t.label}</span>
                <span className="block text-[11px] text-slate-400 truncate">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {blocks.map((b, i) => {
          const info = types.find((t) => t.type === b.type);
          const isOpen = openId === b.id;
          return (
            <li
              key={b.id}
              draggable
              onDragStart={() => setDragId(b.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(b.id)}
              className={`rounded-xl border bg-white overflow-hidden ${dragId === b.id ? "border-blue-400 opacity-60" : "border-slate-200"}`}
            >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="cursor-grab text-slate-300 select-none" title="ลากเพื่อย้าย">⠿</span>
                <span className="text-lg">{info?.icon ?? "🧩"}</span>

                <button onClick={() => setOpenId(isOpen ? null : b.id)} className="flex-1 min-w-0 text-left">
                  <span className={`block text-sm font-medium truncate ${b.enabled ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {info?.label ?? b.type}
                  </span>
                  <span className="block text-[11px] text-slate-400 truncate">{blockSummary(b)}</span>
                </button>

                <button
                  onClick={() => patch(b.id, { enabled: !b.enabled })}
                  title={b.enabled ? "ซ่อนบล็อกนี้" : "แสดงบล็อกนี้"}
                  className={`shrink-0 w-10 h-5 rounded-full transition relative ${b.enabled ? "bg-emerald-500" : "bg-slate-300"}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${b.enabled ? "left-[22px]" : "left-0.5"}`} />
                </button>

                <div className="flex flex-col shrink-0">
                  <button onClick={() => move(b.id, -1)} disabled={i === 0} className="text-[10px] px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30">▲</button>
                  <button onClick={() => move(b.id, 1)} disabled={i === blocks.length - 1} className="text-[10px] px-1 text-slate-400 hover:text-slate-800 disabled:opacity-30">▼</button>
                </div>
              </div>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4">
                  <BlockEditor block={b} onChange={(p) => patch(b.id, p)} />
                  <div className="flex justify-end mt-3 pt-3 border-t border-slate-200">
                    <button onClick={() => remove(b.id)} className="text-xs text-red-500 hover:underline">ลบบล็อกนี้</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {!blocks.length && (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">
          ยังไม่มีบล็อก — กด &quot;+ เพิ่มบล็อก&quot; เพื่อเริ่มจัดหน้า
        </div>
      )}
    </div>
  );
}
