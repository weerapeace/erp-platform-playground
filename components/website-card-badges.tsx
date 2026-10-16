"use client";
/**
 * 🏷 ป้ายบนการ์ดสินค้า — ของกลาง 2 ชิ้น
 *   CardBadgeSelect   ช่องเลือกป้ายจากรายการของร้าน (+ พิมพ์เอง · ⚙ จัดการป้าย) — ใช้ในหน้าต่างสินค้าบนเว็บ + แก้หลายรายการ
 *   CardBadgesManager ป๊อปจัดการรายการป้ายของร้าน (ชื่อ + สี · ลากเรียง · ลบ) — เปลี่ยนชื่อแล้วสินค้าที่ใช้อยู่เปลี่ยนตาม
 * ข้อมูล: /api/website/card-badges · กฎ: lib/website-card-badges
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useToast } from "@/components/toast";
import { ERPModal } from "@/components/modal";
import { ColorInput } from "@/components/color-picker";
import { useDragReorder, DragHandle, moveItem } from "@/components/sortable-list";
import type { CardBadge } from "@/lib/website-card-badges";

// แคชต่อร้าน (หน้าต่างเดียวมีหลายช่อง/หลายร้าน — โหลดครั้งเดียว) · บันทึกแล้วล้าง
const cache = new Map<string, Promise<CardBadge[]>>();
const listeners = new Set<(shopId: string, list: CardBadge[]) => void>();
function loadBadges(shopId: string): Promise<CardBadge[]> {
  if (!cache.has(shopId)) {
    cache.set(
      shopId,
      apiFetch(`/api/website/card-badges?shopId=${encodeURIComponent(shopId)}`)
        .then((r) => r.json())
        .then((j) => (Array.isArray(j.badges) ? (j.badges as CardBadge[]) : []))
        .catch(() => {
          cache.delete(shopId);
          return [];
        })
    );
  }
  return cache.get(shopId)!;
}
function publish(shopId: string, list: CardBadge[]) {
  cache.set(shopId, Promise.resolve(list));
  for (const fn of listeners) fn(shopId, list);
}

/** รายการป้ายของร้าน (อัปเดตเองเมื่อมีคนบันทึกจากป๊อปจัดการ) */
export function useCardBadges(shopId: string | null | undefined): CardBadge[] {
  const [list, setList] = useState<CardBadge[]>([]);
  useEffect(() => {
    if (!shopId) return;
    let alive = true;
    void loadBadges(shopId).then((l) => alive && setList(l));
    const fn = (id: string, l: CardBadge[]) => id === shopId && setList(l);
    listeners.add(fn);
    return () => {
      alive = false;
      listeners.delete(fn);
    };
  }, [shopId]);
  return list;
}

export function BadgePill({ name, color }: { name: string; color?: string | null }) {
  return (
    <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: color || "#64748B" }}>
      {name}
    </span>
  );
}

const CUSTOM = "__custom";
const MANAGE = "__manage";

export function CardBadgeSelect({ shopId, value, onChange, className = "" }: { shopId: string; value: string; onChange: (v: string) => void; className?: string }) {
  const badges = useCardBadges(shopId);
  const [typing, setTyping] = useState(false);
  const [mgr, setMgr] = useState(false);
  const inList = !value || badges.some((b) => b.name === value);
  const color = badges.find((b) => b.name === value)?.color ?? null;
  const cls = `w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-orange-400 bg-white ${className}`;
  return (
    <div className="space-y-1">
      {typing ? (
        <div className="flex gap-1.5">
          <input autoFocus value={value} maxLength={40} onChange={(e) => onChange(e.target.value)} placeholder="พิมพ์ป้าย" className={cls} />
          <button type="button" onClick={() => setTyping(false)} className="shrink-0 rounded-lg border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">
            เลือกจากรายการ
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (v === CUSTOM) setTyping(true);
            else if (v === MANAGE) setMgr(true);
            else onChange(v);
          }}
          className={cls}
        >
          <option value="">— ไม่มีป้าย —</option>
          {badges.map((b) => (
            <option key={b.id} value={b.name}>
              {b.name}
            </option>
          ))}
          {!inList && <option value={value}>{value} (พิมพ์เอง)</option>}
          <option value={CUSTOM}>✏️ พิมพ์เอง…</option>
          <option value={MANAGE}>⚙ จัดการป้ายของร้าน…</option>
        </select>
      )}
      {value.trim() && (
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <BadgePill name={value} color={color} /> {inList ? "ตัวอย่างบนการ์ด" : "ป้ายนอกรายการ — ใช้สีป้ายปกติของธีม"}
        </div>
      )}
      <CardBadgesManager open={mgr} onClose={() => setMgr(false)} shopId={shopId} />
    </div>
  );
}

export function CardBadgesManager({ open, onClose, shopId }: { open: boolean; onClose: () => void; shopId: string }) {
  const toast = useToast();
  const [list, setList] = useState<CardBadge[]>([]);
  const [saved, setSaved] = useState("");
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const l = await loadBadges(shopId);
    setList(l.map((b) => ({ ...b })));
    setSaved(JSON.stringify(l));
  }, [shopId]);
  useEffect(() => {
    if (open) void load();
  }, [open, load]);
  const drag = useDragReorder((a, b) => setList((l) => moveItem(l, a, b)));
  const dirty = JSON.stringify(list) !== saved;
  const set = (i: number, p: Partial<CardBadge>) => setList((l) => l.map((b, k) => (k === i ? { ...b, ...p } : b)));
  const dup = (i: number) => list.some((b, k) => k !== i && b.name.trim().toLowerCase() === list[i].name.trim().toLowerCase());

  const save = async () => {
    if (list.some((b, i) => !b.name.trim() || dup(i))) return toast.error("ชื่อป้ายต้องไม่ว่างและไม่ซ้ำกัน");
    setSaving(true);
    try {
      const j = await (await apiFetch("/api/website/card-badges", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shopId, badges: list }) })).json();
      if (!j.ok) return toast.error(j.error ?? "บันทึกไม่สำเร็จ");
      publish(shopId, j.badges as CardBadge[]);
      setList(j.badges);
      setSaved(JSON.stringify(j.badges));
      toast.success(`บันทึกรายการป้ายแล้ว${j.renamed ? ` · เปลี่ยนชื่อป้ายในสินค้า ${j.renamed} รุ่นตาม` : ""}`);
    } catch {
      toast.error("บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ERPModal
      open={open}
      onClose={onClose}
      title="🏷 ป้ายบนการ์ดของร้าน"
      description="ตั้งชื่อ + สีที่เดียว แล้วเลือกใช้ในสินค้าแต่ละรุ่น / แก้หลายรายการ · เปลี่ยนชื่อป้าย = สินค้าที่ใช้ป้ายนั้นเปลี่ยนตาม"
      size="md"
      hasUnsavedChanges={dirty}
      footer={
        <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-40">
          {saving ? "กำลังบันทึก…" : "💾 บันทึก"}
        </button>
      }
    >
      <ul className="space-y-1.5">
        {list.map((b, i) => (
          <li key={b.id} {...drag.rowProps(i)} className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 ${drag.rowCls(i)}`}>
            <DragHandle {...drag.handleProps(i)} />
            <input value={b.name} maxLength={40} onChange={(e) => set(i, { name: e.target.value })} className={`flex-1 min-w-0 rounded-lg border px-2.5 py-1.5 text-sm outline-none ${dup(i) || !b.name.trim() ? "border-rose-400" : "border-slate-200 focus:border-blue-400"}`} />
            <div className="w-32 shrink-0">
              <ColorInput value={b.color} onChange={(v) => set(i, { color: v })} allowText={false} />
            </div>
            <BadgePill name={b.name || "ป้าย"} color={b.color} />
            <button type="button" onClick={() => setList((l) => l.filter((_, k) => k !== i))} className="text-xs text-rose-500 px-1" title="ลบป้ายนี้ (สินค้าที่ใช้อยู่ยังโชว์ป้ายเดิม แต่ใช้สีปกติ)">
              🗑
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => setList((l) => [...l, { id: `b${Date.now().toString(36).slice(-5)}`, name: "", color: "#64748B" }])}
        disabled={list.length >= 30}
        className="mt-2 text-sm text-blue-600 hover:underline disabled:opacity-40"
      >
        + เพิ่มป้าย
      </button>
    </ERPModal>
  );
}
