"use client";
/**
 * หน้าจัดการแบรนด์ (ส่วนแสดงผล) — ตัวเลขหลัก · ร้าน/ช่องทาง · งานที่ต้องทำ · หมวดเครื่องมือ (ลาก/ซ่อน/เต็ม-ครึ่ง ได้)
 * ข้อมูล: HubDetail (lib/brand-hub) จาก /api/brand-hub?brand_id= · ลิงก์/หมวด: ./sections
 * ของกลาง: useBlockLayout/BlockLayoutRows/BlockLayoutEditor (จัดกล่อง ทีม+ของฉัน) · ERPModal · BrandAvatar · BrandSelect · PlatformIcon · Icon
 * ไม่มีสิทธิ์หน้าไหน = ไม่เห็นลิงก์/การ์ดของหน้านั้น (รอสิทธิ์โหลดก่อนค่อยกรอง)
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth, type Permission } from "@/components/auth";
import { Icon } from "@/components/icon";
import { ERPModal } from "@/components/modal";
import { BrandSelect, type BrandSelectOption } from "@/components/brand-select";
import { BrandAvatar } from "@/components/platform-catalog/brand-gate";
import { PlatformIcon } from "@/components/platform-icon";
import { useBlockLayout, BlockLayoutRows, BlockLayoutEditor, type BlockDef } from "@/components/block-layout";
import { HUB_CONN_LABEL, type HubDetail, type HubTodo } from "@/lib/brand-hub";
import { HUB_TOOL_GROUPS, channelHref } from "./sections";

const TODO_CLS: Record<HubTodo["tone"], string> = {
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function BrandHubView({ data, brands, onSwitch }: { data: HubDetail; brands: BrandSelectOption[]; onSwitch: (id: string) => void }) {
  const { can, permsReady } = useAuth();
  const allowed = (perm: string | null) => !perm || !permsReady || can(perm as Permission);
  const accent = data.color || "#7c3aed";

  const todos = data.todos.filter((t) => allowed(t.perm));
  const todoTotal = todos.reduce((s, t) => s + t.count, 0);
  const connectedN = data.channels.filter((c) => c.state === "connected").length;

  const defs = useMemo<BlockDef[]>(() => [
    { key: "todos", label: "งานที่ต้องทำ", icon: "flag" },
    { key: "channels", label: "ร้าน / ช่องทาง", icon: "link" },
    ...HUB_TOOL_GROUPS.map((g) => ({ key: `tools:${g.key}`, label: g.label, icon: g.icon, sizes: ["half", "full"] as ("half" | "full")[], size: "half" as const })),
  ], []);
  const layout = useBlockLayout("brand_hub", defs);
  const [arranging, setArranging] = useState(false);

  const render = (key: string) => {
    if (key === "todos") {
      return (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-600">งานที่ต้องทำ</h2>
          {todos.length === 0
            ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><Icon name="done" className="mr-1.5" />ไม่มีงานค้างของแบรนด์นี้</div>
            : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {todos.map((t) => (
                  <Link key={t.key} href={t.href} className={`rounded-xl border px-3 py-2.5 hover:brightness-95 ${TODO_CLS[t.tone]}`}>
                    <div className="text-xl font-semibold tabular-nums">{t.count.toLocaleString()}</div>
                    <div className="text-sm font-medium">{t.label}</div>
                    <div className="text-[11px] opacity-80">{t.hint}</div>
                  </Link>
                ))}
              </div>
            )}
        </section>
      );
    }
    if (key === "channels") {
      return (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-600">ร้าน / ช่องทาง</h2>
          <div className="flex flex-wrap gap-2">
            {data.channels.map((c) => {
              const ok = c.state === "connected" || c.state === "file";
              return (
                <Link key={c.code} href={channelHref(data.id, c.code, ok, c.selling)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50 ${ok ? "border-slate-200 bg-white text-slate-800" : "border-dashed border-slate-300 bg-white text-slate-500"}`}>
                  <PlatformIcon code={c.code} size={18} />
                  <span>{c.label}</span>
                  {ok && c.listings > 0 && <span className="tabular-nums text-xs text-slate-500">{c.listings.toLocaleString()}</span>}
                  <span className={`text-xs ${c.state === "connected" ? "text-emerald-700" : c.state === "expired" ? "text-rose-600" : c.state === "file" ? "text-sky-700" : "text-violet-700"}`}>
                    {c.state === "none" ? "เชื่อมต่อ" : HUB_CONN_LABEL[c.state]}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      );
    }
    const g = HUB_TOOL_GROUPS.find((x) => `tools:${x.key}` === key);
    if (!g) return null;
    const links = g.links.filter((l) => allowed(l.perm));
    if (links.length === 0) return null;
    return (
      <section className="h-full rounded-xl border border-slate-200 bg-white p-4" style={{ borderTop: `3px solid ${accent}` }}>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800"><Icon name={g.icon} />{g.label}</h2>
        <ul className="space-y-0.5">
          {links.map((l) => (
            <li key={l.label}>
              <Link href={l.href(data.id)} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900">
                <span className="truncate">{l.label}</span>
                {l.brandAware && <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] text-slate-500" title="เปิดแล้วกรองแบรนด์นี้ให้เลย">เฉพาะแบรนด์นี้</span>}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <BrandAvatar name={data.name} logoKey={data.logo_key} color={data.color} size={52} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold text-slate-900">{data.name}</h1>
          <p className="text-sm text-slate-500">ทุกอย่างของแบรนด์นี้อยู่ที่เดียว</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BrandSelect brands={brands} value={data.id} onChange={(id) => id && id !== data.id && onSwitch(id)} className="h-9 min-w-[10rem]" title="สลับแบรนด์" />
          <Link href="/brand-hub?pick=1" className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"><Icon name="grid-view" />ทุกแบรนด์</Link>
          <button type="button" onClick={() => setArranging(true)} className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 text-sm text-slate-600 hover:bg-slate-50"><Icon name="sliders" />จัดหน้า</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["สินค้าในระบบ", data.parents.toLocaleString(), "รุ่น (Parent SKU)"],
          ["รายการบนร้าน", data.listings.toLocaleString(), "ทุกช่องทางรวมกัน"],
          ["ช่องทางที่เชื่อม", `${connectedN} / ${data.channels.length}`, "กดชิปด้านล่างเพื่อเชื่อม"],
          ["งานที่ต้องทำ", todoTotal.toLocaleString(), "รวมทุกการ์ดงาน"],
        ].map(([label, value, hint]) => (
          <div key={label} className="rounded-xl bg-slate-50 px-3 py-2.5">
            <div className="text-xs text-slate-500">{label}</div>
            <div className="text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
            <div className="text-[11px] text-slate-400">{hint}</div>
          </div>
        ))}
      </div>

      <BlockLayoutRows blocks={layout.blocks} render={(key) => render(key)} className="space-y-4" pairClassName="grid grid-cols-1 gap-3 md:grid-cols-2" />

      <ERPModal open={arranging} onClose={() => setArranging(false)} title="จัดหน้าแบรนด์" description="ลากสลับลำดับ เปิด/ปิดกล่อง หรือให้กล่องเต็มแถว — ตั้งเป็นแบบของฉัน หรือแบบทั้งทีม (แอดมิน)" size="sm">
        <BlockLayoutEditor layout={layout} />
      </ERPModal>
    </div>
  );
}
