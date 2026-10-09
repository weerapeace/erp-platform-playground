"use client";

/**
 * ป้ายเสริม (badge) ของรุ่น — ติดได้หลายป้าย โชว์เป็นชิปเล็ก ๆ (บนรูปในการ์ด / ใต้ชื่อในตาราง)
 *   กดชิป (หรือ "＋ ป้ายเสริม") → ป๊อป: ติ๊กเลือกป้ายที่มี · พิมพ์คำใหม่แล้ว Enter = สร้างป้ายใหม่ + ติดให้ทันที
 *   บันทึกทุกครั้งที่ติ๊ก (ไม่ต้องกดบันทึก) · แก้ชื่อ/สี/ลบป้าย = "🏷️ ตั้งค่าป้าย" แท็บป้ายเสริม
 */
import { useMemo, useState } from "react";
import { Popover } from "@/components/popover";
import { useToast } from "@/components/toast";
import { apiFetch } from "@/lib/api";
import type { MarketingSkuLabel } from "@/lib/marketing/sku-list";

export function BadgeChip({ badge, size = "sm" }: { badge: Pick<MarketingSkuLabel, "name" | "icon" | "color">; size?: "xs" | "sm" }) {
  return (
    <span className={`inline-flex max-w-full items-center gap-0.5 truncate rounded-full font-semibold text-white shadow-sm ${size === "xs" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px]"}`}
      style={{ background: badge.color }} title={badge.name}>
      {badge.icon && <span>{badge.icon}</span>}<span className="truncate">{badge.name}</span>
    </span>
  );
}

export function BadgeEditor({ parentId, value, badges, canManage, onSaved, onCreated, variant = "inline" }: {
  parentId: string;
  value: string[];
  badges: MarketingSkuLabel[];
  canManage: boolean;
  /** บันทึกแล้ว → ป้ายเสริมล่าสุดของรุ่นนี้ */
  onSaved: (parentId: string, badgeIds: string[]) => void;
  /** สร้างป้ายใหม่แล้ว → ให้หน้ารายการเพิ่มเข้า list ป้าย */
  onCreated: (badge: MarketingSkuLabel) => void;
  /** overlay = วางทับรูป (ชิปใหญ่ขึ้นนิด มีเงา) · inline = ในตาราง */
  variant?: "overlay" | "inline";
}) {
  const badgeMap = useMemo(() => new Map(badges.map((b) => [b.id, b])), [badges]);
  const chips = value.map((id) => badgeMap.get(id)).filter((b): b is MarketingSkuLabel => !!b);

  if (!canManage) {
    return chips.length ? (
      <div className="flex flex-wrap gap-1">{chips.map((b) => <BadgeChip key={b.id} badge={b} size={variant === "overlay" ? "sm" : "xs"} />)}</div>
    ) : null;
  }

  return (
    <Popover align="left" panelClassName="w-64 overflow-auto rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
      trigger={(toggle, open) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); toggle(); }} aria-expanded={open} title="กดเพื่อติด/เอาออก ป้ายเสริม"
          className="flex max-w-full flex-wrap items-center gap-1 text-left">
          {chips.map((b) => <BadgeChip key={b.id} badge={b} size={variant === "overlay" ? "sm" : "xs"} />)}
          {chips.length === 0 && (
            <span className={`rounded-full border border-dashed px-1.5 py-px text-[10px] ${variant === "overlay" ? "border-slate-300 bg-white/90 text-slate-500 sm:opacity-0 sm:group-hover:opacity-100" : "border-slate-300 text-slate-400 hover:text-slate-600"}`}>
              ＋ ป้ายเสริม
            </span>
          )}
        </button>
      )}>
      {() => <BadgePanel parentId={parentId} value={value} badges={badges} onSaved={onSaved} onCreated={onCreated} />}
    </Popover>
  );
}

function BadgePanel({ parentId, value, badges, onSaved, onCreated }: {
  parentId: string; value: string[]; badges: MarketingSkuLabel[];
  onSaved: (parentId: string, badgeIds: string[]) => void; onCreated: (badge: MarketingSkuLabel) => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const active = badges.filter((b) => b.is_active);
  const term = q.trim();
  const shown = term ? active.filter((b) => b.name.toLowerCase().includes(term.toLowerCase())) : active;
  const exact = active.some((b) => b.name.toLowerCase() === term.toLowerCase());

  const save = async (next: string[]) => {
    setBusy(true);
    try {
      const r = await apiFetch("/api/marketing/skus/badges", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parent_sku_ids: [parentId], badge_ids: next, mode: "set" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "บันทึกไม่สำเร็จ");
      onSaved(parentId, (j.data?.badges_by_parent?.[parentId] as string[]) ?? next);
    } catch (e) { toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"); }
    finally { setBusy(false); }
  };

  const toggle = (id: string) => void save(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  const create = async () => {
    if (!term || exact || busy) return;
    setBusy(true);
    try {
      const r = await apiFetch("/api/marketing/sku-labels", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "badge", name: term, color: "#0ea5e9" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || "สร้างป้ายไม่สำเร็จ");
      const badge = j.data as MarketingSkuLabel;
      onCreated(badge);
      setQ("");
      setBusy(false);
      await save([...value, badge.id]);
      toast.success(`เพิ่มป้ายเสริม "${badge.name}" แล้ว`);
    } catch (e) { toast.error(e instanceof Error ? e.message : "สร้างป้ายไม่สำเร็จ"); setBusy(false); }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <div className="px-1 pb-1.5 text-xs font-semibold text-slate-700">ป้ายเสริม <span className="font-normal text-slate-400">(ติดได้หลายป้าย)</span></div>
      <input value={q} onChange={(e) => setQ(e.target.value)} autoFocus maxLength={60} disabled={busy}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void create(); } }}
        placeholder="ค้นหา หรือพิมพ์คำใหม่แล้วกด Enter"
        className="mb-1.5 h-8 w-full rounded-lg border border-slate-200 px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <div className="max-h-60 space-y-0.5 overflow-auto">
        {shown.map((b) => {
          const on = value.includes(b.id);
          return (
            <label key={b.id} className={`flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 hover:bg-slate-50 ${busy ? "pointer-events-none opacity-60" : ""}`}>
              <input type="checkbox" checked={on} onChange={() => toggle(b.id)} className="h-4 w-4 rounded border-slate-300" />
              <BadgeChip badge={b} size="xs" />
            </label>
          );
        })}
        {shown.length === 0 && !term && <div className="px-1 py-2 text-center text-xs text-slate-400">ยังไม่มีป้ายเสริม พิมพ์คำแล้วกด Enter เพื่อสร้าง</div>}
      </div>
      {term && !exact && (
        <button type="button" onClick={() => void create()} disabled={busy}
          className="mt-1 w-full rounded-lg border border-dashed border-blue-300 bg-blue-50 px-2 py-1.5 text-left text-xs text-blue-700 hover:bg-blue-100 disabled:opacity-50">
          ＋ สร้างป้ายเสริม &quot;{term}&quot; แล้วติดให้รุ่นนี้
        </button>
      )}
    </div>
  );
}
