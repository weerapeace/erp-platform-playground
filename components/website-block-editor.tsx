"use client";

/**
 * ของกลาง — ตัวจัดบล็อกของหน้าเว็บ (ใช้ทั้งแท็บ "หน้าแรก" และ "หน้าเว็บ")
 * เพิ่ม/ลบ/ลากสลับลำดับ/เปิด-ปิด + ฟอร์มแก้ข้อความของแต่ละชนิดบล็อก
 */
import { Fragment, useMemo, useState } from "react";
import { ImageUploadField, keyUrl } from "@/components/website-theme-media";

export type BlockType =
  | "announcement"
  | "hero"
  | "two-tracks"
  | "categories"
  | "featured"
  | "faq"
  | "cta"
  | "rich-text"
  | "image"
  | "gallery";

export interface Visibility {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
}

export interface Block {
  id: string;
  type: BlockType;
  enabled: boolean;
  visibility?: Visibility;
  [k: string]: unknown;
}

const ALL_VISIBLE: Visibility = { desktop: true, tablet: true, mobile: true };

export type BlockTypeInfo = { type: BlockType; label: string; icon: string; hint: string; group?: string };

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
    case "image":
      return b.imageKey ? String(b.caption || b.alt || "รูปภาพ") : "ยังไม่ได้เลือกรูป";
    case "gallery":
      return `${((b.items as unknown[]) ?? []).length} รูป`;
    default:
      return String(b.title ?? "") || "—";
  }
}

/** สรุปว่าซ่อนบนอุปกรณ์ไหนบ้าง */
function visibilityLabel(v?: Visibility): string {
  const x = { ...ALL_VISIBLE, ...v };
  const hidden = [!x.desktop && "คอม", !x.tablet && "แท็บเล็ต", !x.mobile && "มือถือ"].filter(Boolean);
  return hidden.length ? `ซ่อนบน ${hidden.join("/")}` : "";
}

/** สร้างบล็อกใหม่ (ค่าเริ่มต้นเดียวกับฝั่ง API) */
export function makeBlock(type: BlockType, seq: number): Block {
  const id = `${type}-${seq}-${Math.floor(Math.random() * 1000)}`;
  const base = { id, type, enabled: true, visibility: { ...ALL_VISIBLE } };
  switch (type) {
    case "announcement":
      return { ...base, messages: ["ข้อความประกาศของร้าน"] };
    case "image":
      return { ...base, imageKey: null, alt: "", caption: "", width: "wide", href: "" };
    case "gallery":
      return { ...base, eyebrow: "", title: "แกลเลอรี", columns: 3, items: [] };
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
        imageKey: null,
        imageAlt: "",
        overlay: 45,
        height: "auto",
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

    case "image":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <ImageUploadField
              label="รูปภาพ"
              hint="แนะนำกว้าง 1200px+"
              value={(block.imageKey as string | null) ?? null}
              onChange={(k) => onChange({ imageKey: k })}
              height={80}
            />
          </div>
          <Field label="คำบรรยายรูป (Alt) — มีผลกับ SEO">
            <input className={inputCls} value={s("alt")} onChange={(e) => onChange({ alt: e.target.value })} placeholder="อธิบายว่าในรูปคืออะไร" />
          </Field>
          <Field label="ข้อความใต้รูป (ถ้ามี)">
            <input className={inputCls} value={s("caption")} onChange={(e) => onChange({ caption: e.target.value })} />
          </Field>
          <Field label="ความกว้าง">
            <select className={inputCls} value={s("width") || "wide"} onChange={(e) => onChange({ width: e.target.value })}>
              <option value="narrow">แคบ (อ่านง่าย)</option>
              <option value="wide">กว้าง (แนะนำ)</option>
              <option value="full">เต็มจอ</option>
            </select>
          </Field>
          <Field label="ลิงก์เมื่อคลิกรูป (ไม่ใส่ = คลิกไม่ได้)">
            <input className={inputCls} value={s("href")} onChange={(e) => onChange({ href: e.target.value })} placeholder="/shop" />
          </Field>
        </div>
      );

    case "gallery": {
      const items = ((block.items as { imageKey: string | null; alt: string; caption: string }[]) ?? []);
      const setItem = (i: number, p: Partial<{ imageKey: string | null; alt: string; caption: string }>) =>
        onChange({ items: items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="ข้อความเล็ก"><input className={inputCls} value={s("eyebrow")} onChange={(e) => onChange({ eyebrow: e.target.value })} /></Field>
            <Field label="หัวข้อ"><input className={inputCls} value={s("title")} onChange={(e) => onChange({ title: e.target.value })} /></Field>
            <Field label="จำนวนคอลัมน์">
              <select className={inputCls} value={(block.columns as number) ?? 3} onChange={(e) => onChange({ columns: Number(e.target.value) })}>
                {[2, 3, 4].map((n) => <option key={n} value={n}>{n} คอลัมน์</option>)}
              </select>
            </Field>
          </div>

          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="rounded-lg border border-slate-200 bg-white p-2.5">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-16 h-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden">
                    {it.imageKey ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={keyUrl(it.imageKey, 160)!} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-400">ไม่มีรูป</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <ImageUploadField label={`รูปที่ ${i + 1}`} value={it.imageKey} onChange={(k) => setItem(i, { imageKey: k })} height={40} />
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      <input className={inputCls} placeholder="คำบรรยาย (Alt)" value={it.alt} onChange={(e) => setItem(i, { alt: e.target.value })} />
                      <input className={inputCls} placeholder="ข้อความใต้รูป" value={it.caption} onChange={(e) => setItem(i, { caption: e.target.value })} />
                    </div>
                  </div>
                  <button onClick={() => onChange({ items: items.filter((_, j) => j !== i) })} className="shrink-0 w-8 h-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500">×</button>
                </div>
              </div>
            ))}
            <button
              onClick={() => onChange({ items: [...items, { imageKey: null, alt: "", caption: "" }] })}
              className="text-xs text-blue-600 hover:underline"
            >
              + เพิ่มรูป
            </button>
          </div>
        </div>
      );
    }

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

          {/* รูปพื้นหลัง */}
          <div className="sm:col-span-2 pt-3 border-t border-slate-200 grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <ImageUploadField
                label="รูปพื้นหลัง (ไม่ใส่ = ใช้พื้นหลังไล่สีเดิม)"
                hint="แนะนำกว้าง 2000px"
                value={(block.imageKey as string | null) ?? null}
                onChange={(k) => onChange({ imageKey: k })}
                previewBg="#18191B"
                height={72}
              />
            </div>
            <Field label="คำบรรยายรูป (Alt)">
              <input className={inputCls} value={s("imageAlt")} onChange={(e) => onChange({ imageAlt: e.target.value })} placeholder="เช่น โรงงานผลิตเครื่องหนัง" />
            </Field>
            <Field label={`ความมืดทับรูป · ${(block.overlay as number) ?? 45}%`}>
              <input
                type="range"
                min={0}
                max={90}
                value={(block.overlay as number) ?? 45}
                onChange={(e) => onChange({ overlay: Number(e.target.value) })}
                className="w-full accent-blue-600"
              />
            </Field>
            <Field label="ความสูงแบนเนอร์">
              <select className={inputCls} value={s("height") || "auto"} onChange={(e) => onChange({ height: e.target.value })}>
                <option value="auto">อัตโนมัติ (ตามเนื้อหา)</option>
                <option value="tall">สูง (70% ของจอ)</option>
                <option value="full">เต็มจอ</option>
              </select>
            </Field>
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
  selectedId,
  onSelect,
}: {
  blocks: Block[];
  types: BlockTypeInfo[];
  onChange: (next: Block[]) => void;
  /** บล็อกที่ถูกเลือก (เช่น คลิกมาจากพรีวิว) */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const [openIdLocal, setOpenIdLocal] = useState<string | null>(null);
  const openId = selectedId !== undefined ? selectedId : openIdLocal;
  const setOpenId = (id: string | null) => {
    setOpenIdLocal(id);
    onSelect?.(id);
  };

  const [showAdd, setShowAdd] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  /** กำลังลากอะไรอยู่ — บล็อกเดิมในหน้า (move) หรือ widget ใหม่จากคลัง (new) */
  const [drag, setDrag] = useState<{ kind: "move"; id: string } | { kind: "new"; type: BlockType } | null>(null);
  /** ตำแหน่งที่จะวาง (0 = บนสุด, blocks.length = ล่างสุด) — ใช้วาดเส้นบอกตำแหน่ง */
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const patch = (id: string, p: Record<string, unknown>) => onChange(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const duplicate = (id: string) => {
    const i = blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    const src = blocks[i];
    const copy: Block = {
      ...JSON.parse(JSON.stringify(src)),
      id: `${src.type}-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`,
    };
    const next = [...blocks];
    next.splice(i + 1, 0, copy);
    onChange(next);
    setMenuId(null);
    setOpenId(copy.id);
  };

  const setVis = (id: string, key: keyof Visibility, value: boolean) => {
    const b = blocks.find((x) => x.id === id);
    if (!b) return;
    patch(id, { visibility: { ...ALL_VISIBLE, ...b.visibility, [key]: value } });
  };

  // กลุ่มบล็อกในไลบรารี + ค้นหา
  const grouped = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const hit = types.filter(
      (t) => !q || t.label.toLowerCase().includes(q) || t.hint.toLowerCase().includes(q) || t.type.includes(q)
    );
    const map = new Map<string, BlockTypeInfo[]>();
    for (const t of hit) {
      const g = t.group ?? "อื่น ๆ";
      map.set(g, [...(map.get(g) ?? []), t]);
    }
    return [...map.entries()];
  }, [types, addQuery]);

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
    // คลังค้างไว้ให้เลือกตัวถัดไปได้เลย (ปิดเองด้วยปุ่ม "ปิด")
  };

  const endDrag = () => {
    setDrag(null);
    setOverIdx(null);
  };

  /** วางของที่ลางอยู่ลงที่ตำแหน่ง idx (0 = บนสุด, blocks.length = ล่างสุด) */
  const dropAt = (idx: number) => {
    if (!drag) return;
    if (drag.kind === "new") {
      const fresh = makeBlock(drag.type, blocks.length + 1);
      const next = [...blocks];
      next.splice(idx, 0, fresh);
      onChange(next);
      setOpenId(fresh.id);
    } else {
      const from = blocks.findIndex((b) => b.id === drag.id);
      if (from >= 0) {
        const next = [...blocks];
        const [moved] = next.splice(from, 1);
        // ถอดตัวเองออกแล้ว ตำแหน่งหลังจุดที่ถอดจะเลื่อนขึ้น 1
        next.splice(idx > from ? idx - 1 : idx, 0, moved);
        onChange(next);
      }
    }
    endDrag();
  };

  /** ลากผ่านบล็อก → เส้นจะไปอยู่เหนือหรือใต้ ตามว่าเมาส์อยู่ครึ่งบนหรือครึ่งล่าง */
  const overBlock = (e: React.DragEvent, i: number) => {
    if (!drag) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setOverIdx(e.clientY < r.top + r.height / 2 ? i : i + 1);
  };

  /**
   * เส้นบอกตำแหน่งวาง — คั่นระหว่างบล็อก (โผล่เฉพาะตอนลาก)
   * เขียนเป็นฟังก์ชันคืน JSX ไม่ใช่ component ย่อย — ถ้าเป็น component React จะสร้าง DOM ใหม่ทุกครั้งที่ขยับเมาส์
   * แล้วเบราว์เซอร์จะยิง dragleave ใส่ของที่เพิ่งถูกแทน → เส้นกะพริบและวางไม่ติด
   */
  const dropLine = (idx: number) => {
    const active = overIdx === idx;
    if (!drag) return null;
    return (
      <li
        onDragOver={(e) => {
          e.preventDefault();
          setOverIdx(idx);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dropAt(idx);
        }}
        className={`rounded-lg transition-all ${
          active
            ? "h-10 border-2 border-dashed border-blue-500 bg-blue-50 flex items-center justify-center"
            : "h-3 border-2 border-dashed border-transparent"
        }`}
      >
        {active && <span className="text-[11px] font-medium text-blue-600">วางตรงนี้</span>}
      </li>
    );
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {drag ? "ปล่อยตรงเส้นน้ำเงินเพื่อวาง" : "ลากจากคลังมาวางตรงไหนก็ได้ · ลากบล็อกเพื่อสลับลำดับ · กดชื่อเพื่อแก้"}
        </p>
        <button onClick={() => setShowAdd((v) => !v)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
          {showAdd ? "ปิดคลัง" : "+ เพิ่มบล็อก"}
        </button>
      </div>

      {showAdd && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 space-y-3">
          <input
            className={inputCls}
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            placeholder="ค้นหาบล็อก เช่น รูป, สินค้า, คำถาม"
            autoFocus
          />
          {grouped.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">ไม่พบบล็อกที่ค้นหา</p>
          ) : (
            grouped.map(([group, list]) => (
              <div key={group}>
                <p className="text-[11px] font-medium text-slate-500 mb-1.5">{group}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((t) => (
                    <button
                      key={t.type}
                      draggable
                      onDragStart={() => setDrag({ kind: "new", type: t.type })}
                      onDragEnd={endDrag}
                      onClick={() => {
                        add(t.type);
                        setAddQuery("");
                      }}
                      title={`${t.label} — ลากไปวางในหน้า หรือกดเพื่อเพิ่มต่อท้าย`}
                      className={`flex items-start gap-2 bg-white rounded-lg border px-3 py-2 text-left cursor-grab active:cursor-grabbing hover:border-blue-400 ${
                        drag?.kind === "new" && drag.type === t.type ? "border-blue-500 opacity-50" : "border-slate-200"
                      }`}
                    >
                      <span className="text-slate-300 select-none leading-none pt-0.5">⠿</span>
                      <span className="text-lg leading-none">{t.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-800">{t.label}</span>
                        <span className="block text-[11px] text-slate-400 truncate">{t.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <ul className={drag ? "space-y-0" : "space-y-2"}>
        {blocks.map((b, i) => {
          const info = types.find((t) => t.type === b.type);
          const isOpen = openId === b.id;
          return (
            <Fragment key={b.id}>
              {dropLine(i)}
              <li
                id={`blk-${b.id}`}
                draggable
                onDragStart={() => setDrag({ kind: "move", id: b.id })}
                onDragEnd={endDrag}
                onDragOver={(e) => overBlock(e, i)}
                onDrop={(e) => {
                  e.preventDefault();
                  dropAt(overIdx ?? i);
                }}
                className={`rounded-xl border bg-white overflow-hidden transition ${
                  drag?.kind === "move" && drag.id === b.id
                    ? "border-blue-400 opacity-50"
                    : isOpen
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200"
                }`}
              >
              <div className="flex items-center gap-2 px-3 py-2.5">
                <span className="cursor-grab text-slate-300 select-none" title="ลากเพื่อย้าย">⠿</span>
                <span className="text-lg">{info?.icon ?? "🧩"}</span>

                <button onClick={() => setOpenId(isOpen ? null : b.id)} className="flex-1 min-w-0 text-left">
                  <span className={`block text-sm font-medium truncate ${b.enabled ? "text-slate-800" : "text-slate-400 line-through"}`}>
                    {info?.label ?? b.type}
                    {visibilityLabel(b.visibility) && (
                      <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                        {visibilityLabel(b.visibility)}
                      </span>
                    )}
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

                {/* เมนูเพิ่มเติม */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setMenuId(menuId === b.id ? null : b.id)}
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:border-slate-400"
                    title="เพิ่มเติม"
                  >
                    ⋯
                  </button>
                  {menuId === b.id && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMenuId(null)} />
                      <div className="absolute right-0 top-8 z-20 w-52 rounded-xl border border-slate-200 bg-white shadow-lg py-1.5">
                        <button onClick={() => duplicate(b.id)} className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          📑 ทำสำเนา
                        </button>
                        <div className="border-t border-slate-100 my-1" />
                        <p className="px-3 py-1 text-[11px] text-slate-400">แสดงบนอุปกรณ์</p>
                        {([
                          { k: "desktop" as const, l: "🖥️ คอมพิวเตอร์" },
                          { k: "tablet" as const, l: "📱 แท็บเล็ต" },
                          { k: "mobile" as const, l: "📲 มือถือ" },
                        ]).map((d) => {
                          const on = { ...ALL_VISIBLE, ...b.visibility }[d.k];
                          return (
                            <label key={d.k} className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer">
                              <input type="checkbox" className="w-4 h-4 accent-blue-600" checked={on} onChange={(e) => setVis(b.id, d.k, e.target.checked)} />
                              {d.l}
                            </label>
                          );
                        })}
                        <div className="border-t border-slate-100 my-1" />
                        <button onClick={() => { remove(b.id); setMenuId(null); }} className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                          🗑️ ลบบล็อกนี้
                        </button>
                      </div>
                    </>
                  )}
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
            </Fragment>
          );
        })}
        {dropLine(blocks.length)}
      </ul>

      {!blocks.length && (
        <div
          onDragOver={(e) => {
            if (drag) {
              e.preventDefault();
              setOverIdx(0);
            }
          }}
          onDrop={(e) => {
            e.preventDefault();
            dropAt(0);
          }}
          className={`rounded-xl border-2 border-dashed py-12 text-center text-sm transition ${
            drag ? "border-blue-500 bg-blue-50 text-blue-600" : "border-slate-300 text-slate-400"
          }`}
        >
          {drag ? "วางตรงนี้เพื่อเริ่มจัดหน้า" : 'ยังไม่มีบล็อก — ลาก widget จากคลังมาวาง หรือกด "+ เพิ่มบล็อก"'}
        </div>
      )}
    </div>
  );
}
