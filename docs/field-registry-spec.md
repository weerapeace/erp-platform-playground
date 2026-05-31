# Field Registry — Full Spec (Sprint 1 → 14)

> สเปกสมบูรณ์ของ Field Registry — ใช้เป็น reference เมื่อสร้าง module ใหม่ / แก้ไข MasterCRUDPage / เขียน documentation อื่น

---

## หลักการ

Field Registry คือ **ทะเบียนกลาง** ที่บอกว่า field แต่ละตัวใน Supabase แสดง/ค้นหา/filter/sort/แก้/บังคับ ในแต่ละ module อย่างไร — แทนการ hardcode column config ใน TS

**Source of truth: 2 ตาราง**
- `erp_modules` — ทะเบียน module (key, label, target_table)
- `erp_module_fields` — ทะเบียน field ของ module (มี column นี้คุณสมบัติยังไง)

หน้า admin: `/admin/schema-sync`  
API: `/api/admin/schema-sync`, `/api/admin/field-registry-v2/*`

---

## schema `erp_module_fields`

| Column | Type | Purpose | Sprint |
|--------|------|---------|--------|
| `id`, `module_id`, `field_key`, `column_name` | identity | identify | S1 |
| `field_label`, `data_type`, `ui_field_type`, `source` | basic | display | S1 |
| `group_key`, `display_order`, `width`, `min_width` | layout | table layout | S1 |
| `is_visible`, `is_required`, `is_editable` | flags | basic flags | S1 |
| `is_filterable`, `is_sortable`, `is_pinned`, `is_searchable` | flags | DataTable behavior | S1, S11 |
| `options`, `validation_rules`, `relation_config` | jsonb | structured config | S1, S5, S9 |
| `is_sensitive`, `sensitive_permission` | flags | hide if no permission | **S8** |
| `show_in_form`, `form_column_span`, `placeholder`, `help_text` | form | form UX | **S3, S9** |
| `default_value` (text), `default_expression` (text) | form | prefill on Create | **S12** |
| `is_inline_editable` (boolean) | table | dbl-click cell แก้ใน list | **S12** |
| `condition_rules` (jsonb) | form | conditional show/hide | **S13** |
| `is_active`, `created_at`, `updated_at` | meta | soft-delete + audit | S1 |

audit table: `erp_field_registry_audit` — บันทึก before/after เมื่อ admin แก้ field config (S10)

---

## Sprint Map

| Sprint | สิ่งที่เพิ่ม | DB | API | UI |
|--------|------------|-----|-----|-----|
| **S1** | Schema Sync infra | `erp_module_fields`, `schema_sync_columns()`, `schema_sync_module()` | `/api/admin/schema-sync` | `/admin/schema-sync` v1 |
| **S2** | MasterCRUDPage → registry | — | `/api/admin/field-registry-v2` | MasterCRUDPage รับ `moduleKey` |
| **S3** | Form builder | `show_in_form`, `form_column_span`, `placeholder`, `help_text` | — | drawer แสดง form ตาม registry |
| **S4** | Apply ทุก module | seed `parent-skus-v2`, `skus-v2`, `partners-v2`, `brands`, `collections` | `/api/master-v2/*` | 5 pages ใช้ MasterCRUDPage |
| **S5** | Relation picker | `relation_config` jsonb | `/api/admin/picker` | RelationPicker (FK search + create) |
| **S6** | Image manager | (ใช้ ui_field_type='image') | `/api/admin/upload` (R2) | ImageInput + ImageCell |
| **S7** | Form sections | (ใช้ group_key) | — | FormSections (collapsible) |
| **S8** | Sensitive fields | `is_sensitive`, `sensitive_permission` | filter ใน registry | column 🔒 ใน admin + filter ใน MasterCRUDPage |
| **S9** | Validation + form UX | (ใช้ validation_rules) | — | required *, readonly disabled, error icons |
| **S10** | Audit registry | `erp_field_registry_audit` | PATCH logs changes | — |
| **S11** | Drag-drop + bulk update + saved views | extend `erp_saved_views` (system/team/my scope) | `/api/admin/field-registry-v2/bulk`, `/api/saved-views-v2` | dnd-kit + bulk bar |
| **S12** | Inline edit + defaults | `default_value`, `default_expression`, `is_inline_editable` | bulk allows | column ✎ + Default cell + bulk btn |
| **S13** | Conditional fields | `condition_rules` jsonb | — | column 🎯 + ConditionEditorModal + collapsible groups |
| **S14** | Final polish | — | — | tests + docs + cleanup |

---

## Default Values (S12)

มี 2 ระบบ:

### Static — `default_value` (text)
ค่าตายตัว เก็บเป็น string แล้ว coerce ตาม `ui_field_type`:
- `text/textarea/select` → ใช้ตรง
- `number` → `Number(v)` (NaN → `''`)
- `boolean` → `v === 'true' || v === '1'`

### Dynamic — `default_expression` (text)
- `now()` → `new Date().toISOString()` (RFC 3339 timestamp)
- `today()` → `YYYY-MM-DD`
- `current_user()` → email ของ user ตอนเปิด form
- `uuid()` → `crypto.randomUUID()` (UUID v4)

**Priority:** expression ชนะ static

**Helper:** `lib/field-helpers.ts → resolveDefault()`

---

## Conditional Fields (S13)

`condition_rules` jsonb:
```json
{
  "show_if": {
    "field":    "type",
    "operator": "=",
    "value":    "product"
  }
}
```

**Operators:**
| op | ความหมาย |
|----|---------|
| `=` / `!=` | เท่ากับ / ไม่เท่ากับ (default = `=`) |
| `in` / `not_in` | value ต้องเป็น array (`["a","b"]`) |
| `is_set` | `!= null && != '' && !== false` |
| `is_empty` | กลับด้าน is_set |

**Behavior:**
- ถ้าไม่มี rule → แสดงเสมอ
- ถ้า rule ผ่าน → แสดง
- ถ้า rule ไม่ผ่าน → ซ่อน + **skip validation รวม `required`** (จะไม่ block save)
- ค่าใน form **เก็บไว้** ตอน field หาย — ถ้าเงื่อนไขกลับมาผ่าน user เห็นค่าเก่า

**Helper:** `lib/field-helpers.ts → evaluateCondition()`

**Admin UI:** คลิก 🎯 column → ConditionEditorModal (structured form)

---

## Inline Editing (S12)

เมื่อ `is_inline_editable = true` ที่ field ในตาราง user สามารถ:
1. **ดับเบิ้ลคลิก cell** → input โผล่
2. **พิมพ์** → enter หรือ blur
3. **PATCH** ผ่าน `/api/master-v2/[entity]/[id]` + optimistic update

**ข้อกำหนด:**
- เปิดเฉพาะ type: `text` / `number` / `boolean` / `select`
- ❌ image / relation / textarea (ไม่เหมาะ inline)
- เคารพ `is_editable` (readonly → ไม่ติด inline)
- เคารพ `is_sensitive` + permission

---

## Sensitive Fields (S8)

field ที่ `is_sensitive = true` + มี `sensitive_permission` (เช่น `'products.cost.view'`) จะ:
- **ซ่อนทั้ง column** จาก DataTable ถ้า user ไม่มี permission
- **ซ่อนทั้ง field** จาก form drawer
- ❌ ไม่ใช่แค่ซ่อนค่า — ซ่อน column เลย (ไม่ leak via export/inline-edit)

Backfill ตอน S8: 44 fields (price/cost/credit_limit/salary) → permission `products.cost.view`

---

## Saved Views v2 (S11) — มี API พร้อม แต่ยังไม่ wire เข้า DataTable

API: `/api/saved-views-v2`
- GET `?module=<key>` → list (system → team → my)
- POST → create (scope=team|my; system อนุญาตเฉพาะ service-role)
- PATCH `/[id]`, DELETE `/[id]` (soft = `is_active=false`)

DB: extend `erp_saved_views`:
- เพิ่ม `display_order`, `is_locked`, `columns_config` jsonb, `owner_email`, `created_by_email`, ...
- CHECK constraint: `scope IN ('system','team','my')`
- RLS: SELECT system+team ทุกคน, my เฉพาะ owner; INSERT block system; UPDATE/DELETE เคารพ owner

**ยังไม่ wire:** MasterCRUDPage ยังใช้ `tableId` (เก่า) + `/api/saved-views` (เก่า) — wire เต็มใน Sprint 15+

---

## ตาราง audit log

`erp_field_registry_audit` (S10):
```sql
id uuid PK,
module_field_id uuid FK,
actor_email text,
action text,         -- 'update' / 'bulk_update' / 'reorder'
changes jsonb,       -- { key: { from, to } }  หรือ  { reorder_count, ids }
created_at timestamptz
```

ทุก PATCH ที่ `/api/admin/field-registry-v2/[id]` → บันทึก diff อัตโนมัติ (fire-and-forget)

---

## Helpers (lib/field-helpers.ts)

```ts
export function resolveDefault(
  fieldType: FieldType,
  staticVal: string | null | undefined,
  expr: string | null | undefined,
  userEmail: string | null | undefined,
): unknown
```

```ts
export function evaluateCondition(
  rules: ConditionRules | null | undefined,
  form: Record<string, unknown>,
): boolean
```

**Tests:** `lib/__tests__/field-helpers.test.ts` — coverage ครบ 6 operators + 4 expressions + static coercion

---

## File Map

```txt
apps/playground/
  app/
    admin/schema-sync/page.tsx                 ⭐ admin UI ครบ — DnD + bulk + collapse + condition modal
    api/admin/
      schema-sync/route.ts                     GET status + POST sync
      field-registry-v2/
        route.ts                               GET list fields
        [id]/route.ts                          PATCH + audit
        bulk/route.ts                          POST bulk update + PATCH reorder
    api/saved-views-v2/
      route.ts                                 GET list + POST create
      [id]/route.ts                            PATCH + DELETE (soft)
  components/
    master-crud/index.tsx                      ⭐ MasterCRUDPage — config-driven page
    relation-picker/index.tsx                  FK picker + inline create
    image-input/index.tsx                      R2 upload + signed URL preview
    data-table/index.tsx                       ⭐ Universal DataTable
  lib/
    field-helpers.ts                           resolveDefault + evaluateCondition
    __tests__/field-helpers.test.ts            unit tests
docs/
  field-registry-spec.md                       ← this file
  field-registry.md                            (legacy short note)
```

---

## How to add a new module (สั้น ๆ)

1. **สร้าง table** ใน Supabase พร้อม RLS policies
2. **Insert row** ใน `erp_modules` (`module_key`, `table_name`, `label`)
3. ไปที่ `/admin/schema-sync` → เลือก module → **กด "🔄 Sync from Supabase"** → registry ถูก seed อัตโนมัติจาก information_schema
4. tick `is_visible`, `is_filterable`, `is_searchable`, ตั้ง `group_key` ตามต้องการ
5. ตั้ง `default_value` / `default_expression` ถ้าจำเป็น
6. ตั้ง `condition_rules` ถ้ามี conditional field
7. สร้าง page `app/master/<entity>/page.tsx`:
   ```tsx
   import { MasterCRUDPage } from "@/components/master-crud";
   export default () => <MasterCRUDPage config={{
     apiPath:    "<entity>",
     apiBase:    "/api/master-v2/",
     tableId:    "<entity>",
     moduleKey:  "<module-key>",    // ← ดึง fields จาก registry
     title:      "...",
     permissions: { view, create, edit },
     activeField: "is_active",
   }} />
   ```
8. (ถ้า entity ยังไม่อยู่ใน `/api/master-v2/[entity]`) — เพิ่ม config ใน `route.ts` ENTITIES
