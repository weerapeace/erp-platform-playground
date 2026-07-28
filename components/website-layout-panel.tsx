"use client";

/**
 * WebsiteLayoutPanel — แท็บ "🧱 หน้าแรก" ในหน้า /website/<slug>
 * จัดโครงหน้าแรกของเว็บร้าน: เพิ่ม/ลบ/ลากเรียง/เปิด-ปิด บล็อก + แก้ข้อความทุกช่อง
 * ร่าง/เผยแพร่ + พรีวิวเว็บจริงใน iframe (เหมือนแท็บดีไซน์)
 * ข้อมูล: /api/website/layout
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";

type BlockType =
  | "announcement"
  | "hero"
  | "two-tracks"
  | "categories"
  | "featured"
  | "faq"
  | "cta"
  | "rich-text";

interface Block {
  id: string;
  type: BlockType;
  enabled: boolean;
  [k: string]: unknown;
}

type BlockTypeInfo = { type: BlockType; label: string; icon: string; hint: string };
type Device = "desktop" | "tablet" | "mobile";

const DEVICES: { k: Device; w: number; icon: string }[] = [
  { k: "desktop", w: 1440, icon: "🖥️" },
  { k: "tablet", w: 768, icon: "📱" },
  { k: "mobile", w: 390, icon: "📲" },
];

const inputCls =
  "w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400";
const labelCls = "block text-[11px] font-medium text-slate-500 mb-1";

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function WebsiteLayoutPanel({ shopSlug, shopId }: { shopSlug: string; shopId: string }) {
  const toast = useToast();

  const [blocks, setBlocks] = useState<Block[]>([]);
  const [published, setPublished] = useState<Block[]>([]);
  const [types, setTypes] = useState<BlockTypeInfo[]>([]);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);
  const [neverSet, setNeverSet] = useState(false);
  const [hadDraft, setHadDraft] = useState(false);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"draft" | "publish" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [showAdd, setShowAdd] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const undoStack = useRef<Block[][]>([]);
  const redoStack = useRef<Block[][]>([]);
  const [, tick] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch(`/api/website/layout?shop=${encodeURIComponent(shopSlug)}`);
      const j = await r.json();
      if (j.error) {
        toast.error(j.error);
        return;
      }
      setBlocks(j.draft ?? j.published ?? []);
      setPublished(j.published ?? []);
      setTypes(j.blockTypes ?? []);
      setSiteUrl(j.shop?.siteUrl ?? null);
      setNeverSet(Boolean(j.neverSet));
      setHadDraft(Boolean(j.hasDraft));
      undoStack.current = [];
      redoStack.current = [];
    } catch {
      toast.error("โหลดโครงหน้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [shopSlug, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = useCallback((next: Block[]) => {
    setBlocks((prev) => {
      undoStack.current = [...undoStack.current.slice(-49), prev];
      redoStack.current = [];
      return next;
    });
    tick((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    setBlocks((cur) => {
      redoStack.current = [...redoStack.current, cur];
      return prev;
    });
    tick((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = redoStack.current.pop();
    if (!next) return;
    setBlocks((cur) => {
      undoStack.current = [...undoStack.current, cur];
      return next;
    });
    tick((n) => n + 1);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "z") return;
      const el = e.target as HTMLElement;
      if (el?.tagName === "INPUT" || el?.tagName === "TEXTAREA") return; // ให้ช่องกรอก undo เองได้
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ส่งโครงเข้า iframe แบบสด
  useEffect(() => {
    const t = setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage({ type: "storefront-layout-preview", layout: blocks }, "*");
    }, 200);
    return () => clearTimeout(t);
  }, [blocks]);

  const isDirty = !eq(blocks, published) || hadDraft;

  useEffect(() => {
    if (!isDirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  const patch = (id: string, p: Record<string, unknown>) =>
    apply(blocks.map((b) => (b.id === id ? { ...b, ...p } : b)));

  const move = (id: string, dir: -1 | 1) => {
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    apply(next);
  };

  const remove = (id: string) => {
    const b = blocks.find((x) => x.id === id);
    const label = types.find((t) => t.type === b?.type)?.label ?? "บล็อก";
    if (!confirm(`ลบบล็อก "${label}" ออกจากหน้า?`)) return;
    apply(blocks.filter((x) => x.id !== id));
  };

  const addBlock = (type: BlockType) => {
    const seq = blocks.length + 1;
    const fresh = makeBlock(type, seq);
    apply([...blocks, fresh]);
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
    apply(next);
    setDragId(null);
  };

  const save = async (mode: "draft" | "publish") => {
    if (mode === "publish" && !confirm("ยืนยันเผยแพร่โครงหน้าแรกนี้ไปยังเว็บไซต์จริง?")) return;
    setBusy(mode);
    try {
      const r = await apiFetch("/api/website/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, blocks, mode }),
      });
      const j = await r.json();
      if (!j.ok) {
        toast.error(j.error ?? "บันทึกไม่สำเร็จ");
        return;
      }
      if (mode === "publish") {
        setPublished(j.blocks);
        setNeverSet(false);
        setHadDraft(false);
        toast.success("เผยแพร่หน้าแรกแล้ว — เว็บจะอัปเดตภายใน ~1 นาที");
      } else {
        setHadDraft(true);
        toast.success("บันทึกร่างแล้ว — เว็บไซต์จริงยังไม่เปลี่ยน");
      }
    } catch {
      toast.error("เชื่อมต่อไม่ได้");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    if (!confirm("ละทิ้งการเปลี่ยนแปลงทั้งหมด?")) return;
    try {
      await apiFetch(`/api/website/layout?shopId=${encodeURIComponent(shopId)}`, { method: "DELETE" });
    } catch {
      /* ignore */
    }
    await load();
    toast.info("ละทิ้งการเปลี่ยนแปลงแล้ว");
  };

  const dev = DEVICES.find((d) => d.k === device)!;
  const previewSrc = siteUrl ? `${siteUrl}/?preview=1` : null;
  const scale = useMemo(() => Math.min(1, 400 / dev.w), [dev.w]);

  if (loading) return <div className="py-16 text-center text-sm text-slate-400">กำลังโหลด…</div>;

  return (
    <div className="space-y-3">
      {/* สถานะ */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5">
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${
            isDirty ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
          }`}
        >
          {isDirty ? "● ยังไม่เผยแพร่" : "✓ เผยแพร่แล้ว"}
        </span>
        <span className="text-[11px] text-slate-400">
          {blocks.length} บล็อก · เปิดใช้ {blocks.filter((b) => b.enabled).length}
          {neverSet && " · ยังไม่เคยจัดหน้า (นี่คือโครงเริ่มต้น)"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={undo} disabled={!undoStack.current.length} title="ย้อนกลับ (Ctrl+Z)" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↶</button>
          <button onClick={redo} disabled={!redoStack.current.length} title="ทำซ้ำ" className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 disabled:opacity-40 hover:border-slate-400">↷</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(340px,38%)] items-start">
        {/* ══ ซ้าย: รายการบล็อก ══ */}
        <div className="min-w-0 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-slate-500">ลากเพื่อสลับลำดับ · กดชื่อเพื่อแก้ข้อความ</p>
            <button onClick={() => setShowAdd((v) => !v)} className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700">
              {showAdd ? "ปิด" : "+ เพิ่มบล็อก"}
            </button>
          </div>

          {showAdd && (
            <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 grid gap-2 sm:grid-cols-2">
              {types.map((t) => (
                <button
                  key={t.type}
                  onClick={() => addBlock(t.type)}
                  className="flex items-start gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 text-left hover:border-blue-400"
                >
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
                      <span className="block text-[11px] text-slate-400 truncate">{summary(b)}</span>
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

        {/* ══ ขวา: พรีวิว ══ */}
        <div className="lg:sticky lg:top-4 min-w-0">
          <div className="flex items-center gap-1.5 mb-2">
            {DEVICES.map((d) => (
              <button
                key={d.k}
                onClick={() => setDevice(d.k)}
                className={`px-2.5 py-1 rounded-lg border text-xs ${device === d.k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                {d.icon}
              </button>
            ))}
            {previewSrc && (
              <a href={previewSrc} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400">↗</a>
            )}
            <button
              onClick={() => iframeRef.current?.contentWindow?.location.reload()}
              className="px-2.5 py-1 rounded-lg border border-slate-200 text-xs text-slate-600 hover:border-slate-400"
              title="โหลดพรีวิวใหม่"
            >
              ↻
            </button>
            <span className="text-[10px] text-slate-400 ml-auto">{dev.w}px</span>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-100 overflow-hidden" style={{ height: "72vh", minHeight: 420 }}>
            {previewSrc ? (
              <div className="w-full h-full overflow-auto flex justify-center">
                <iframe
                  ref={iframeRef}
                  src={previewSrc}
                  title="พรีวิวหน้าแรก"
                  className="bg-white border-0"
                  style={{ width: dev.w, height: `${72 / scale}vh`, transform: `scale(${scale})`, transformOrigin: "top center", minHeight: 600 }}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 px-6 text-center">
                ยังไม่ได้ผูกโดเมนเว็บกับร้านนี้
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 mt-1.5 text-center">
            พรีวิวใช้ร่างล่าสุดที่บันทึก — กด ↻ หลังบันทึกร่างเพื่อดูผลเต็ม
          </p>
        </div>
      </div>

      {/* แถบปุ่ม */}
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-white/95 backdrop-blur border border-slate-200 rounded-xl px-4 py-3 shadow-sm">
        <span className="text-xs text-slate-500">
          {isDirty ? "มีการเปลี่ยนแปลงที่ยังไม่เผยแพร่" : "ไม่มีการเปลี่ยนแปลง"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => void discard()} disabled={!isDirty} className="px-3.5 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 disabled:opacity-40">
            ละทิ้งการเปลี่ยนแปลง
          </button>
          <button onClick={() => void save("draft")} disabled={busy !== null} className="px-4 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:border-slate-500 disabled:opacity-50">
            {busy === "draft" ? "กำลังบันทึก…" : "บันทึกร่าง"}
          </button>
          <button onClick={() => void save("publish")} disabled={busy !== null} className="px-6 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
            {busy === "publish" ? "กำลังเผยแพร่…" : "เผยแพร่"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────── ตัวช่วย ─────────── */

function summary(b: Block): string {
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

/** สร้างบล็อกใหม่ฝั่ง UI (ค่าเริ่มต้นเดียวกับฝั่ง API) */
function makeBlock(type: BlockType, seq: number): Block {
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

/* ─────────── ฟอร์มแก้แต่ละบล็อก ─────────── */

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
            <input
              className={inputCls}
              value={it}
              placeholder={placeholder}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="shrink-0 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 text-sm">×</button>
          </div>
        ))}
        <button onClick={() => onChange([...items, ""])} className="text-xs text-blue-600 hover:underline">+ เพิ่มรายการ</button>
      </div>
    </Field>
  );
}

function BlockEditor({ block, onChange }: { block: Block; onChange: (p: Record<string, unknown>) => void }) {
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

    case "hero":
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
              {(((block.features as { title: string; desc: string }[]) ?? [])).map((f, i) => (
                <div key={i} className="flex gap-1.5">
                  <input className={inputCls} placeholder="หัวข้อ" value={f.title} onChange={(e) => {
                    const list = [...((block.features as { title: string; desc: string }[]) ?? [])];
                    list[i] = { ...list[i], title: e.target.value };
                    onChange({ features: list });
                  }} />
                  <input className={inputCls} placeholder="คำอธิบาย" value={f.desc} onChange={(e) => {
                    const list = [...((block.features as { title: string; desc: string }[]) ?? [])];
                    list[i] = { ...list[i], desc: e.target.value };
                    onChange({ features: list });
                  }} />
                  <button onClick={() => onChange({ features: ((block.features as unknown[]) ?? []).filter((_, j) => j !== i) })} className="shrink-0 w-8 rounded-lg border border-slate-200 text-slate-400 hover:text-red-500">×</button>
                </div>
              ))}
              <button onClick={() => onChange({ features: [...(((block.features as unknown[]) ?? [])), { title: "", desc: "" }] })} className="text-xs text-blue-600 hover:underline">+ เพิ่มจุดเด่น</button>
            </div>
          </div>
        </div>
      );

    case "two-tracks": {
      const cards = ((block.cards as Record<string, unknown>[]) ?? []);
      const setCard = (i: number, p: Record<string, unknown>) =>
        onChange({ cards: cards.map((c, j) => (j === i ? { ...c, ...p } : c)) });
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
      const setItem = (i: number, p: Partial<{ q: string; a: string }>) =>
        onChange({ items: items.map((x, j) => (j === i ? { ...x, ...p } : x)) });
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
          <Field label="เนื้อหา"><textarea rows={4} className={inputCls} value={s("body")} onChange={(e) => onChange({ body: e.target.value })} /></Field>
        </div>
      );

    default:
      return <p className="text-xs text-slate-400">บล็อกนี้ยังไม่มีตัวแก้ไข</p>;
  }
}
