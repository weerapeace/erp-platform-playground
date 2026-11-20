/**
 * 🏷️ ลากแท็กทับแท็ก = สร้างกลุ่มย่อย (เจ้าของสั่ง 2026-11-20) — ตัวช่วยกลางฝั่งหน้าจอ
 *
 * เช่น ลาก "ผ้าแคนวาส" ไปวางบน "ผ้า" → ถามชื่อกลุ่ม (ค่าเริ่ม "ผ้า") → สร้างหมวดย่อย "↳ ผ้า" ใต้กลุ่มที่ "ผ้า" อยู่
 * แล้วย้าย "ผ้าแคนวาส" เข้าไป · ชื่อหมวดย่อย = ชื่อแท็กแม่ → ผูกเป็นแท็กแม่-ลูกตามกฎ lib/tag-hierarchy
 * (สินค้าที่ติดแท็กลูก ได้แท็กแม่ให้เองผ่าน trigger roll-up เดิม)
 *
 * ใช้ที่: คลังแท็ก (/master/tags-manager) · ป๊อปเลือกแท็กในฟอร์มสินค้า (components/relation-multi)
 * ป๊อปจัดการแท็ก (components/tag-organizer) มีโค้ดวางทับกลางของตัวเองอยู่แล้ว (กฎเดียวกัน)
 * ย้อนกลับได้: ปุ่ม "ย้อนกลับ" ในแจ้งผลมุมจอ → ย้ายแท็กกลับที่เดิม + ลบหมวดย่อยที่เพิ่งสร้าง (ถ้ายังว่าง)
 * บันทึกผ่าน /api/master-v2 (มี audit log อยู่แล้ว)
 */
import { apiFetch } from "@/lib/api";
import { askText } from "@/components/modal/ask-dialog";
import { sameTagName, subGroupOfTag } from "@/lib/tag-hierarchy";
import type { ToastApi } from "@/components/toast";

export type NestTag = { id: string; label: string; group_id: string | null; sort_order?: number | null; en?: string | null };
export type NestGroup = { id: string; name: string; parent_group_id: string | null; sort_order?: number | null };

const TAG_MODULE = "product_families";
const GROUP_MODULE = "product_family_groups";
const JSON_HEADERS = { "Content-Type": "application/json" };

async function must(p: Promise<Response>): Promise<Record<string, unknown>> {
  const res = await p;
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || j.error) throw new Error(String(j.error ?? `HTTP ${res.status}`));
  return j;
}

/** ทำไมวางทับไม่ได้ (null = ได้) — รองรับ 2 ชั้น: กลุ่ม → หมวดย่อย */
export function nestBlockReason(moving: NestTag, parent: NestTag, tags: NestTag[], groups: NestGroup[]): string | null {
  if (moving.id === parent.id) return "วางทับตัวเองไม่ได้";
  const pg = groups.find((g) => g.id === parent.group_id);
  if (!pg) return `ย้าย “${parent.label}” เข้ากลุ่มก่อน แล้วค่อยลากแท็กมาวางทับ`;
  if (pg.parent_group_id) return `“${parent.label}” เป็นแท็กย่อยอยู่แล้ว ซ้อนอีกชั้นไม่ได้`;
  const ownSub = subGroupOfTag(moving.label, moving.group_id, groups);
  if (ownSub && tags.some((t) => t.group_id === ownSub.id)) return `“${moving.label}” มีแท็กย่อยของตัวเองอยู่ ย้ายไปเป็นแท็กย่อยไม่ได้`;
  return null;
}

export type NestResult = { tagId: string; tagLabel: string; prevGroupId: string | null; prevSort: number | null; subId: string; subName: string; createdGroupId: string | null };

/** ย้ายแท็กเข้าหมวดย่อยชื่อ groupName ใต้กลุ่มของแท็กแม่ (ไม่มีก็สร้าง) */
export async function nestTagUnder(moving: NestTag, parent: NestTag, groupName: string, tags: NestTag[], groups: NestGroup[]): Promise<NestResult> {
  const topId = parent.group_id!;
  const name = groupName.trim() || parent.label;
  let sub = groups.find((g) => g.parent_group_id === topId && sameTagName(g.name, name)) ?? null;
  let createdGroupId: string | null = null;
  if (!sub) {
    const sibs = groups.filter((g) => g.parent_group_id === topId);
    const order = (sibs.length ? Math.max(...sibs.map((s) => s.sort_order ?? 0)) : 0) + 10;
    const linked = sameTagName(name, parent.label);
    const j = await must(apiFetch(`/api/master-v2/${GROUP_MODULE}`, {
      method: "POST", headers: JSON_HEADERS,
      body: JSON.stringify({ name, name_en: linked ? parent.en || null : null, parent_group_id: topId, single_select: false, sort_order: order }),
    }));
    const id = (j.data as { id?: unknown } | undefined)?.id;
    if (!id) throw new Error("ไม่ได้รหัสกลุ่มย่อยกลับมา");
    createdGroupId = String(id);
    sub = { id: createdGroupId, name, parent_group_id: topId, sort_order: order };
  }
  const inSub = tags.filter((t) => t.group_id === sub!.id && t.id !== moving.id);
  const order = (inSub.length ? Math.max(...inSub.map((t) => t.sort_order ?? 0)) : 0) + 10;
  await must(apiFetch(`/api/master-v2/${TAG_MODULE}/${moving.id}`, {
    method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ group_id: sub.id, sort_order: order }),
  }));
  return { tagId: moving.id, tagLabel: moving.label, prevGroupId: moving.group_id, prevSort: moving.sort_order ?? null, subId: sub.id, subName: sub.name, createdGroupId };
}

/** ย้อนกลับ: ย้ายแท็กกลับกลุ่มเดิม + ลบหมวดย่อยที่เพิ่งสร้าง ถ้าไม่มีแท็กอื่นเข้าไปแล้ว */
export async function undoNestTag(r: NestResult): Promise<void> {
  const body: Record<string, unknown> = { group_id: r.prevGroupId };
  if (r.prevSort != null) body.sort_order = r.prevSort;
  await must(apiFetch(`/api/master-v2/${TAG_MODULE}/${r.tagId}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify(body) }));
  if (!r.createdGroupId) return;
  const res = await apiFetch(`/api/master-v2/${TAG_MODULE}?limit=1&filters=${encodeURIComponent(JSON.stringify({ group_id: { type: "select", selected: [r.createdGroupId] } }))}`);
  const j = (await res.json().catch(() => ({}))) as { data?: unknown[] };
  if (res.ok && Array.isArray(j.data) && j.data.length === 0) {
    await must(apiFetch(`/api/master-v2/${GROUP_MODULE}/${r.createdGroupId}?hard=1`, { method: "DELETE" }));
  }
}

/**
 * ครบวงจร: เช็กว่าวางได้ → ถามชื่อกลุ่ม (ถ้าต้องสร้างใหม่) → ย้าย → แจ้งผลพร้อมปุ่มย้อนกลับ
 * คืน true เมื่อมีการเปลี่ยน (หน้าควรโหลดแท็ก/กลุ่มใหม่) · onChanged ถูกเรียกอีกครั้งหลังย้อนกลับ
 */
export async function askAndNestTag(opts: {
  moving: NestTag; parent: NestTag; tags: NestTag[]; groups: NestGroup[];
  toast: Pick<ToastApi, "warning" | "error" | "undo" | "success">;
  onChanged: () => void;
}): Promise<boolean> {
  const { moving, parent, tags, groups, toast, onChanged } = opts;
  const why = nestBlockReason(moving, parent, tags, groups);
  if (why) { toast.warning(why); return false; }
  const existing = subGroupOfTag(parent.label, parent.group_id, groups);
  if (existing && moving.group_id === existing.id) { toast.warning(`“${moving.label}” อยู่ใต้ “${parent.label}” อยู่แล้ว`); return false; }
  let name = parent.label;
  if (!existing) {
    const answer = await askText({
      title: "สร้างกลุ่มย่อยใหม่",
      message: `ย้าย “${moving.label}” ไปอยู่ใต้ “${parent.label}” · ถ้าชื่อกลุ่มตรงกับ “${parent.label}” สินค้าที่ติด “${moving.label}” จะได้แท็ก “${parent.label}” ให้อัตโนมัติ`,
      initial: parent.label, required: true, confirmText: "สร้างกลุ่ม",
    });
    if (answer === null) return false;
    name = answer;
  }
  try {
    const r = await nestTagUnder(moving, parent, name, tags, groups);
    onChanged();
    toast.undo(r.createdGroupId ? `สร้างกลุ่ม “${r.subName}” แล้ว · ย้าย “${r.tagLabel}” เข้าไป` : `ย้าย “${r.tagLabel}” เข้ากลุ่ม “${r.subName}” แล้ว`, async () => {
      try { await undoNestTag(r); onChanged(); toast.success("ย้อนกลับแล้ว"); }
      catch (e) { toast.error("ย้อนกลับไม่สำเร็จ", { details: e }); }
    }, { ms: 8000 });
    return true;
  } catch (e) {
    toast.error("สร้างกลุ่มไม่สำเร็จ: " + (e instanceof Error ? e.message : "network"), { details: e });
    onChanged();
    return false;
  }
}
