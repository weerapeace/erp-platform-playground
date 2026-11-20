"use client";
/**
 * 🧠 ความจำ AI (ของกลาง) — แผง "ชอบ / ไม่ชอบ / กฎ" ของ AI ที่เขียนเนื้อหา + ตัวโหลด/บันทึก
 *   ใช้ที่: AI จุดเด่นสินค้า (components/detail-insert-ai · kind "desc") · ป๊อป AI เขียนแคปชั่น (app/tasks/content/ai-caption-studio · kind "caption")
 *   API = /api/ai/desc-memory (?kind=) · ที่เก็บ/กติกา = lib/desc-ai-memory (แบรนด์นี้ + ทุกแบรนด์)
 *   ทุกคนกดชอบ/ไม่ชอบ/เพิ่มกฎได้ · ลบของคนอื่น = ผู้ดูแล · ทุกการแก้ลงประวัติ (audit)
 *
 *   const memory = useAiMemory("caption", brandId);
 *   <AiMemoryPanel mem={memory.mem} canManage={memory.canManage} userId={user?.id} onCall={memory.call} />
 */
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useT } from "@/components/i18n";
import { useToast } from "@/components/toast";
import { Icon } from "@/components/icon";

export type AiMemEntry = { text: string; scope: string; by?: string | null };
export type AiMem = { liked: AiMemEntry[]; disliked: AiMemEntry[]; rules: AiMemEntry[] };
export type AiMemList = keyof AiMem;
export type AiMemCall = (action: "add" | "remove", list: AiMemList, text: string, scope?: "brand" | "all") => Promise<boolean>;
export const EMPTY_AI_MEM: AiMem = { liked: [], disliked: [], rules: [] };

/** โหลด + บันทึกความจำ AI ของฟีเจอร์ (kind) สำหรับแบรนด์นี้ */
export function useAiMemory(kind: "desc" | "caption", brandId: string | null | undefined) {
  const t = useT();
  const toast = useToast();
  const [mem, setMem] = useState<AiMem>(EMPTY_AI_MEM);
  const [canManage, setCanManage] = useState(false);
  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ kind, ...(brandId ? { brand_id: brandId } : {}) });
    apiFetch(`/api/ai/desc-memory?${q}`).then((r) => r.json())
      .then((j) => { if (alive && j.data) { setMem(j.data as AiMem); setCanManage(!!j.can_manage); } })
      .catch(() => { /* ไม่มีความจำ = ใช้ได้ปกติ */ });
    return () => { alive = false; };
  }, [kind, brandId]);
  const call: AiMemCall = useCallback(async (action, list, text, scope = "brand") => {
    try {
      const r = await apiFetch("/api/ai/desc-memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, action, list, text, scope, brand_id: brandId ?? null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j.error || t("บันทึกความจำไม่สำเร็จ", "Couldn't save memory"));
      setMem(j.data as AiMem);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("บันทึกความจำไม่สำเร็จ", "Couldn't save memory"));
      return false;
    }
  }, [kind, brandId, t, toast]);
  return { mem, canManage, call };
}

/** แผงความจำ (พับได้) — ชอบ / ไม่ชอบ / กฎ + เพิ่มกฎ */
export function AiMemoryPanel({ mem, canManage, userId, onCall, likedHint, ruleHint, defaultOpen = false }: {
  mem: AiMem; canManage: boolean; userId?: string | null; onCall: AiMemCall;
  likedHint?: string; ruleHint?: string; defaultOpen?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(defaultOpen);
  const [rule, setRule] = useState("");
  const [ruleAll, setRuleAll] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200" data-ai-memory>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] text-slate-600 hover:bg-slate-50">
        <Icon name="library" /> {t("ความจำ AI", "AI memory")}
        <span className="text-slate-400">{t(`ชอบ ${mem.liked.length} · ไม่ชอบ ${mem.disliked.length} · กฎ ${mem.rules.length}`, `liked ${mem.liked.length} · disliked ${mem.disliked.length} · rules ${mem.rules.length}`)}</span>
        <span className="ml-auto text-slate-400">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-2.5 py-2">
          {(["liked", "disliked", "rules"] as const).map((l) => (
            <div key={l}>
              <div className="mb-1 text-[11px] font-medium text-slate-500">
                {l === "liked" ? likedHint ?? t("ชอบ — ใส่เมื่อเหมาะกับสินค้า", "Liked — used when it fits") : l === "disliked" ? t("ไม่ชอบ — AI จะไม่เขียนแบบนี้อีก", "Disliked — never written again") : t("กฎที่พิมพ์เอง", "Your rules")}
              </div>
              <div className="flex flex-wrap gap-1">
                {mem[l].length ? mem[l].map((m) => (
                  <span key={`${m.scope}:${m.text}`} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] ${l === "liked" ? "bg-amber-50 text-amber-800" : l === "disliked" ? "bg-rose-50 text-rose-700" : "bg-sky-50 text-sky-800"}`}>
                    <span className="truncate">{m.text}</span>
                    <span className="shrink-0 text-[10px] opacity-60">{m.scope === "*" ? t("ทุกแบรนด์", "all brands") : t("แบรนด์นี้", "this brand")}</span>
                    {(canManage || !m.by || m.by === userId) && (
                      <button type="button" onClick={() => void onCall("remove", l, m.text, m.scope === "*" ? "all" : "brand")} aria-label={t("เอาออก", "Remove")} className="shrink-0 opacity-60 hover:opacity-100"><Icon name="cancel" /></button>
                    )}
                  </span>
                )) : <span className="text-[11px] text-slate-400">{t("ยังไม่มี", "None yet")}</span>}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5">
            <input value={rule} onChange={(e) => setRule(e.target.value)} placeholder={ruleHint ?? t("กฎใหม่ เช่น ห้ามเขียนว่ากันน้ำ ถ้าไม่ได้ระบุวัสดุกันน้ำ", "New rule, e.g. never say waterproof unless stated")} aria-label={t("กฎใหม่", "New rule")}
              className="h-8 min-w-[12rem] flex-1 rounded-md border border-slate-200 px-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-orange-400" />
            <label className="flex items-center gap-1 text-[11.5px] text-slate-600"><input type="checkbox" checked={ruleAll} onChange={(e) => setRuleAll(e.target.checked)} className="h-3.5 w-3.5 accent-orange-500" />{t("ทุกแบรนด์", "All brands")}</label>
            <button type="button" onClick={() => { const v = rule.trim(); if (!v) return; void onCall("add", "rules", v, ruleAll ? "all" : "brand").then((ok) => { if (ok) setRule(""); }); }}
              className="h-8 rounded-md border border-slate-200 px-2.5 text-[12px] text-slate-700 hover:bg-slate-50">{t("เพิ่มกฎ", "Add rule")}</button>
          </div>
          <p className="text-[10.5px] text-slate-400">{t("ทุกคนกดชอบ/ไม่ชอบได้ · ลบของคนอื่นได้เฉพาะผู้ดูแล · ทุกการแก้บันทึกประวัติ", "Anyone can like/dislike · only admins remove others' entries · every change is logged")}</p>
        </div>
      )}
    </div>
  );
}
