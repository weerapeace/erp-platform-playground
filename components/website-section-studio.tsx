"use client";

/**
 * SectionStudio — 🗖 แก้ Section แบบ "หน้าใหญ่" (ของกลางของตัวจัดหน้า · เปิดจากปุ่ม ⤢ หัวแผงขวา)
 *
 *   ซ้าย = หมวด (ตาม field.group ของ schema + รูปลักษณ์ + ลูกเล่น + รายการย่อย) บอกจำนวนช่อง · จุดส้ม = หมวดที่แก้แล้ว
 *   กลาง = ฟอร์มกลาง SchemaForm เฉพาะหมวดที่เลือก (2 คอลัมน์) · ค้นหาช่องข้ามหมวด · จุดส้มรายช่อง · คืนค่าเริ่มต้นหมวดนี้
 *   ขวา = พรีวิวสดของหน้า (iframe ตัวที่ 2 เลื่อนไปที่ Section นี้ · คอม/มือถือ) — ส่งโครงหน้าแบบ storefront-blocks-live เหมือนพรีวิวหลัก
 *          ลากเส้นแบ่งปรับความกว้างพรีวิว (จำต่อคน lib/modal-layout-pref · ดับเบิลคลิก = ค่าเริ่ม) · ปุ่ม ⇔ กว้างสุด/คืนค่า
 *
 * ค่าเปลี่ยนสดเหมือนแผงขวา (onPatch ตัวเดียวกัน) · ไม่มีปุ่มบันทึกแยก — บันทึกร่าง/เผยแพร่ที่แถบบนของตัวจัดหน้าเหมือนเดิม
 * ไฟล์นี้ "ไม่รู้" ว่า Section มีช่องอะไร — อ่านจาก schema เหมือนแผงขวา · ของเฉพาะตัวจัดหน้า (รูปลักษณ์/ลูกเล่น/แถบแปล) ส่งมาเป็น ReactNode
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { ERPModal } from "@/components/modal";
import { askConfirm } from "@/components/modal/ask-dialog";
import { GROUP_ORDER, SchemaForm, type SchemaFormContext } from "@/components/website-schema-form";
import { FIELD_GROUP_LABEL, fieldChanged, matchShowIf, type FieldDef, type FieldGroup, type SectionSchema } from "@/lib/website-schema";
import { SplitHandle, useSplitWidth } from "@/components/split-handle";

type Nav = FieldGroup | "style" | "motion" | "items";
type StudioDevice = { k: string; w: number; h: number; icon: string; label: string };

/** Section ที่มีช่องเยอะ (ปุ่ม ⤢ เด่นขึ้น) */
export const STUDIO_SUGGEST_FIELDS = 15;
/** ความกว้างพรีวิวที่ลากไว้ (จำต่อคน ทุกเครื่อง) */
const PV_PREF = "website-studio-preview";
const PV_MIN = 280;
/** กว้างคอลัมน์หมวด + ช่องตั้งค่าขั้นต่ำ + เส้นแบ่ง (px) — พรีวิวกว้างได้สูงสุดเท่าที่เหลือ */
const NAV_W = 180;
const FIELDS_MIN = 320;
const SPLIT_W = 14;

const visibleFields = (fields: FieldDef[], value: Record<string, unknown>) => fields.filter((fd) => !fd.hidden && matchShowIf(fd, value));
const hay = (fd: FieldDef) => [fd.label, fd.hint ?? "", ...(fd.options ?? []).map((o) => o.l)].join(" ").toLowerCase();

export function SectionStudio({
  open,
  onClose,
  schema,
  block,
  blocks,
  onPatch,
  ctx,
  previewSrc,
  frameRef,
  devices,
  contentTop,
  contentBottom,
  styleBody,
  motionBody,
  styleChanged,
  motionChanged,
  items,
  onPickItem,
  reloadKey = 0,
}: {
  open: boolean;
  onClose: () => void;
  schema: SectionSchema;
  block: Record<string, unknown> & { id: string };
  /** โครงหน้าทั้งหน้า (ส่งเข้าพรีวิวสด) */
  blocks: unknown[];
  onPatch: (p: Record<string, unknown>) => void;
  ctx: SchemaFormContext;
  /** URL พรีวิว (ตัวเดียวกับพรีวิวหลัก) — null = ไม่มีพรีวิว */
  previewSrc: string | null;
  /** iframe ของหน้าใหญ่ — ตัวจัดหน้าใช้แยกข้อความจากพรีวิวหลัก */
  frameRef: RefObject<HTMLIFrameElement | null>;
  devices: StudioDevice[];
  /** บนสุดของช่องตั้งค่า (เช่น แถบแปล 2 ภาษา) */
  contentTop?: ReactNode;
  /** ใต้ช่องของหมวดแรก (เช่น ลิงก์ไปหน้าจัดการข้อมูล) */
  contentBottom?: ReactNode;
  styleBody: ReactNode;
  motionBody: ReactNode;
  styleChanged: boolean;
  motionChanged: boolean;
  /** รายการย่อยของ Section (ถ้ามี) — กดแล้วไปแก้ชิ้นนั้นในแผงขวา */
  items?: { label: string; icon: string; list: { id: string; label: string }[] };
  onPickItem?: (id: string) => void;
  /** เลขโหลดพรีวิวหลักใหม่ — เปลี่ยน = พรีวิวหน้าใหญ่โหลดใหม่ตาม (Section ที่เซิร์ฟเวอร์ต้องดึงข้อมูลใหม่หลังบันทึกร่าง) */
  reloadKey?: number;
}) {
  const value = block as Record<string, unknown>;
  const visible = useMemo(() => visibleFields(schema.fields, value), [schema.fields, value]);
  const groups = useMemo(() => GROUP_ORDER.filter((g) => visible.some((fd) => (fd.group ?? "content") === g)), [visible]);
  const changedKeys = useMemo(() => new Set(visible.filter((fd) => fieldChanged(fd, value)).map((fd) => fd.key)), [visible, value]);
  const [nav, setNav] = useState<Nav>(groups[0] ?? "style");
  const [q, setQ] = useState("");
  const [dev, setDev] = useState(devices[0]?.k ?? "desktop");
  const [nonce, setNonce] = useState(0);
  // พรีวิวหลักโหลดใหม่ (บันทึกร่างแล้วมี Section ที่ต้องดึงข้อมูลใหม่ / กด ↻) → หน้าใหญ่โหลดตาม
  const firstReload = useRef(reloadKey);
  useEffect(() => {
    if (reloadKey !== firstReload.current) setNonce((n) => n + 1);
  }, [reloadKey]);

  // หมวดที่เลือกหายไป (ช่องถูกซ่อนตามค่า) → กลับหมวดแรก
  useEffect(() => {
    if (nav !== "style" && nav !== "motion" && nav !== "items" && !groups.includes(nav)) setNav(groups[0] ?? "style");
  }, [groups, nav]);

  const query = q.trim().toLowerCase();
  const shownFields = query ? visible.filter((fd) => hay(fd).includes(query)) : visible.filter((fd) => (fd.group ?? "content") === nav);
  const groupChanged = (g: FieldGroup) => visible.filter((fd) => (fd.group ?? "content") === g && changedKeys.has(fd.key)).length;

  const resetGroup = async (g: FieldGroup) => {
    const list = visible.filter((fd) => (fd.group ?? "content") === g && changedKeys.has(fd.key) && fd.default !== undefined);
    if (!list.length) return;
    const ok = await askConfirm({ title: `คืนค่าเริ่มต้นหมวด "${FIELD_GROUP_LABEL[g]}"?`, message: `${list.length} ช่องจะกลับเป็นค่าเริ่มต้น (ยังไม่ขึ้นเว็บจนกว่าจะบันทึกร่าง/เผยแพร่)`, confirmText: "คืนค่าเริ่มต้น" });
    if (ok) onPatch(Object.fromEntries(list.map((fd) => [fd.key, fd.default])));
  };

  /* ── พรีวิวสด (iframe ตัวที่ 2) ── */
  // วัดกรอบพรีวิวตอนกรอบโผล่จริง (ERPModal วาดเนื้อหลัง mount — effect ธรรมดาเจอกรอบว่าง แล้วพรีวิวค้างย่อ 27%)
  const [box, setBox] = useState({ w: 400, h: 600 });
  const roRef = useRef<ResizeObserver | null>(null);
  const boxRef = useCallback((el: HTMLDivElement | null) => {
    roRef.current?.disconnect();
    roRef.current = null;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    roRef.current = ro;
    measure();
  }, []);
  const device = devices.find((d) => d.k === dev) ?? devices[0];
  const scale = device ? Math.min(1, (box.w - 16) / device.w) : 1;
  const liveRef = useRef(false);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;
  const blockId = block.id;
  useEffect(() => {
    if (!open) return;
    liveRef.current = false;
    const post = (msg: Record<string, unknown>) => frameRef.current?.contentWindow?.postMessage(msg, "*");
    const select = () => post({ type: "storefront-select-block", blockId, childId: null });
    const onMsg = (e: MessageEvent) => {
      const win = frameRef.current?.contentWindow;
      if (!win || e.source !== win) return;
      const d = e.data as { type?: string } | null;
      if (d?.type === "storefront-preview-loaded") {
        // โหมดจัดหน้า = คลิกในพรีวิวไม่พาไปหน้าอื่น · เลื่อนไปที่ Section นี้ · ถามว่ารับค่าสดได้ไหม
        post({ type: "storefront-edit-mode", on: true });
        post({ type: "storefront-ui-scale", scale });
        select();
        post({ type: "storefront-live-hello" });
      } else if (d?.type === "storefront-live-ready") {
        liveRef.current = true;
        post({ type: "storefront-blocks-live", blocks: blocksRef.current });
        window.setTimeout(select, 60);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
    // scale ส่งครั้งแรกตอนโหลด · เปลี่ยนจอ = ส่งใน effect ด้านล่าง
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, blockId, frameRef, nonce]);
  const liveFrame = useRef(0);
  useEffect(() => {
    if (!open || !liveRef.current) return;
    cancelAnimationFrame(liveFrame.current);
    liveFrame.current = requestAnimationFrame(() => frameRef.current?.contentWindow?.postMessage({ type: "storefront-blocks-live", blocks: blocksRef.current }, "*"));
  }, [blocks, open, frameRef]);
  // เปลี่ยนจอ → บอกขนาดย่อ + เลื่อนกลับไปที่ Section นี้ (หน้าจัดวางใหม่ ตำแหน่งเลื่อนเปลี่ยน)
  useEffect(() => {
    if (!open) return;
    const win = frameRef.current?.contentWindow;
    win?.postMessage({ type: "storefront-ui-scale", scale }, "*");
    const t = window.setTimeout(() => win?.postMessage({ type: "storefront-select-block", blockId, childId: null }, "*"), 120);
    return () => window.clearTimeout(t);
  }, [dev, scale, open, blockId, frameRef]);

  /* ── ความกว้างพรีวิว (ลากเส้นแบ่ง) ── */
  // ↔ ของกลาง components/split-handle (ลาก = สด · ปล่อย = จำต่อคน · ดับเบิลคลิก = ค่าเริ่ม 38%)
  const split = useSplitWidth(PV_PREF, { min: PV_MIN, reserve: NAV_W + FIELDS_MIN + SPLIT_W });

  const navBtn = (k: Nav, label: string, count: number | null, changed: number | boolean) => (
    <button
      key={k}
      type="button"
      onClick={() => {
        setNav(k);
        setQ("");
      }}
      className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs ${nav === k && !query ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-600 hover:bg-slate-50"}`}
    >
      <span className="min-w-0 truncate">
        {label}
        {changed ? <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-orange-500 align-middle" title="แก้แล้ว" /> : null}
      </span>
      {count != null && <span className="shrink-0 text-[11px] text-slate-400">{count}</span>}
    </button>
  );

  const isFieldNav = !query && nav !== "style" && nav !== "motion" && nav !== "items";
  const firstGroup = groups[0];

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title={`${schema.meta.icon} ${schema.meta.label} · แก้แบบหน้าใหญ่`}
      description="ค่าเปลี่ยนสดเหมือนแผงขวา — บันทึกร่าง/เผยแพร่ที่แถบบนของตัวจัดหน้าเหมือนเดิม · Esc ปิด"
      size="xl"
      defaultExpanded
      storageKey="website-section-studio"
    >
      <div
        ref={split.containerRef}
        className="grid h-full min-h-[480px] gap-3 lg:gap-x-0 grid-cols-1 lg:grid-cols-[180px_minmax(320px,1fr)_14px_var(--pv-w)]"
        style={split.style("minmax(320px,38%)")}
      >
        {/* ซ้าย: หมวด */}
        <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-y-auto lg:border-r lg:border-slate-200 lg:pr-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="🔍 ค้นหาช่อง… เช่น ซูม"
            className="mb-1 h-8 w-full min-w-[140px] rounded-lg border border-slate-300 px-2.5 text-xs focus:border-blue-500 focus:outline-none"
          />
          {groups.map((g) => navBtn(g, FIELD_GROUP_LABEL[g], visible.filter((fd) => (fd.group ?? "content") === g).length, groupChanged(g)))}
          {navBtn("style", "รูปลักษณ์", null, styleChanged)}
          {navBtn("motion", "ลูกเล่น", null, motionChanged)}
          {items && navBtn("items", `${items.icon} ${items.label}`, items.list.length, false)}
          <p className="hidden lg:block mt-auto pt-3 text-[11px] leading-relaxed text-slate-400">จุดส้ม = แก้จากค่าเริ่มแล้ว · ค้นหาได้เฉพาะช่องของ Section (ไม่รวมรูปลักษณ์/ลูกเล่น)</p>
        </nav>

        {/* กลาง: ช่องตั้งค่า */}
        <div className="min-w-0 overflow-y-auto pr-1 lg:pl-3">
          <div className="space-y-4">
            {contentTop}
            {query ? (
              shownFields.length ? (
                <SchemaForm fields={shownFields} value={value} onChange={onPatch} ctx={ctx} marks={changedKeys} />
              ) : (
                <p className="text-sm text-slate-400 py-6 text-center">ไม่เจอช่องที่มีคำว่า &quot;{q.trim()}&quot;</p>
              )
            ) : nav === "style" ? (
              styleBody
            ) : nav === "motion" ? (
              motionBody
            ) : nav === "items" && items ? (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500">กดรายการที่จะแก้ → ปิดหน้าใหญ่แล้วเปิดชิ้นนั้นในแผงขวา</p>
                {items.list.map((it, i) => (
                  <button key={it.id} type="button" onClick={() => onPickItem?.(it.id)} className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50/40">
                    <span className="text-[11px] text-slate-400 w-5">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">{it.label || "—"}</span>
                    <span className="text-[11px] text-blue-600">แก้ →</span>
                  </button>
                ))}
                {!items.list.length && <p className="text-sm text-slate-400">ยังไม่มีรายการ — เพิ่มได้จากแผงขวา</p>}
              </div>
            ) : (
              <>
                <SchemaForm fields={shownFields} value={value} onChange={onPatch} ctx={ctx} marks={changedKeys} />
                {nav === firstGroup && contentBottom}
              </>
            )}
            {isFieldNav && groupChanged(nav as FieldGroup) > 0 && (
              <button type="button" onClick={() => resetGroup(nav as FieldGroup)} className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 hover:border-slate-400">
                ↺ คืนค่าเริ่มต้นหมวดนี้ ({groupChanged(nav as FieldGroup)})
              </button>
            )}
          </div>
        </div>

        {/* เส้นแบ่ง: ลากปรับความกว้างพรีวิว · ดับเบิลคลิก = ค่าเริ่ม */}
        <SplitHandle split={split} />

        {/* ขวา: พรีวิวสด */}
        <div className="flex min-h-[360px] min-w-0 flex-col">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">
              พรีวิวสด <span className="text-slate-400">· {Math.round(scale * 100)}%</span>
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={split.toggleMax}
                title={split.isMax ? "คืนความกว้างพรีวิวเริ่มต้น" : "พรีวิวกว้างสุด (ช่องตั้งค่าแคบลง) — หรือลากเส้นแบ่งเอง"}
                className={`hidden lg:inline-flex h-7 items-center rounded-md px-2 text-xs ${split.isMax ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:border-slate-400"}`}
              >
                ⇔
              </button>
              {devices.map((d) => (
                <button key={d.k} type="button" onClick={() => setDev(d.k)} title={d.label} className={`h-7 rounded-md px-2 text-xs ${dev === d.k ? "bg-slate-900 text-white" : "border border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  {d.icon}
                </button>
              ))}
              <button type="button" onClick={() => setNonce((n) => n + 1)} title="โหลดพรีวิวใหม่" className="h-7 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:border-slate-400">
                ↻
              </button>
            </div>
          </div>
          <div ref={boxRef} className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
            {previewSrc && device ? (
              <div style={{ width: device.w * scale, height: box.h, margin: "0 auto", overflow: "hidden" }}>
                <iframe
                  ref={frameRef}
                  src={`${previewSrc}&_r=studio${nonce}`}
                  title="พรีวิว Section"
                  className="block border-0 bg-white"
                  style={{ width: device.w, height: box.h / scale, transform: `scale(${scale})`, transformOrigin: "top left", pointerEvents: split.dragging ? "none" : undefined }}
                />
              </div>
            ) : (
              <p className="p-6 text-center text-sm text-slate-400">ยังไม่มีพรีวิว (ร้านนี้ยังไม่ได้ผูกโดเมนเว็บ)</p>
            )}
          </div>
        </div>
      </div>
    </ERPModal>
  );
}
