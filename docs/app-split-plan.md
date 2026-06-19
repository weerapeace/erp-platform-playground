# แผนแบ่งกลุ่มแอป (App Split Blueprint)

> พิมพ์เขียวสำหรับแยก ERP ก้อนเดียว (worker 40MB, ~200 หน้า) ออกเป็นหลายแอปเล็ก
> เพื่อลด cold start และกันแอปนึงพังลามทั้งระบบ — **ยังไม่ต้องลงมือ เป็นแผนไว้ตัดสินใจ**

## หลักการ 3 ข้อ (สำคัญสุด)
1. **แยกแค่ "หน้าจอ" ไม่แยก "ข้อมูล"** — ทุกแอปต่อ Supabase ก้อนเดียวกัน → ดึงข้อมูลข้ามโมดูลได้หมด (BOM ดึง SKU/Parent SKU ได้แม้คนละแอป)
2. **ของกลางอยู่ที่เดียว** — DataTable/Form/Popup/Picker/auth ฯลฯ อยู่ใน `packages/` ทุกแอป import ตัวเดียวกัน (แก้ที่เดียว → re-deploy ทุกแอปผ่าน CI)
3. **จัดกลุ่มตาม "ความผูกพัน"** — โมดูลที่ใช้ข้อมูลด้วยกันบ่อย → อยู่แอปเดียวกัน (สลับหน้าลื่น) · โมดูลอิสระ → แยกออก

## โครงสร้างเป้าหมาย (monorepo)
```
erp/
  packages/            ← ของกลาง (แก้ที่เดียว)
    ui/    core/  data/  config/
  apps/                ← แต่ละแอป = worker เล็กของตัวเอง
    core/   purchasing/   sales/   payroll/   tasks/   china-pay/   admin/
  .github/workflows/   ← CI: แก้ packages/ → deploy ทุกแอปอัตโนมัติ
```

## การแบ่งกลุ่ม (โมดูล → แอป)

| แอป | โมดูล | เหตุผลที่อยู่ด้วยกัน | ความผูกพันกับแอปอื่น |
|---|---|---|---|
| **core** (สินค้า+ผลิต+คลัง+ออกแบบ) | parent-skus, skus, brands, suppliers, partners, uoms, material-*, tags, lookups · bom, manufacturing-orders, work-board, work-submissions, routings, work-centers, cutting/production/rework-jobs, qc-* · goods-receipts, stock-*, deliveries, qc-warehouse · design-sheets, carton-labels, pattern-versions | **ผูกกันแน่นมาก** — BOM↔SKU↔MO↔stock↔design ใช้ข้อมูลกันตลอด → ต้องอยู่ด้วยกัน (ตรงกับที่ถาม) | เป็นแกนกลาง อ่านโดยแอปอื่น |
| **purchasing** (จัดซื้อ) | purchasing, purchase-orders, purchase-requests, supplier-items, material-requirements | workflow จัดซื้อเป็นชุดเดียว | อ่าน SKU/supplier (DB กลาง) |
| **sales** (ขาย) | sales-orders, quotations, billing-notes, customer-products, marketplace-skus | workflow ขายเป็นชุดเดียว | อ่าน SKU/customer (DB กลาง) |
| **payroll** (HR) | payroll/* ทั้ง 27 หน้า | ตาราง+logic ของตัวเอง (employees, payroll_*) | **อิสระสูงสุด** แทบไม่เกี่ยวใคร |
| **tasks** (จัดการงาน) | tasks (campaigns, content, creative) | งานครีเอทีฟ/แคมเปญ | อ่าน SKU แบบหลวม ๆ |
| **china-pay** (โอนเงินจีน) | china-pay, ctm-* | ตาราง+flow ของตัวเอง | อิสระ |
| **misc** (งานอื่นๆ) | offer-sheets ฯลฯ | กล่องรวมงานเบ็ดเตล็ด | เล็ก — รวมกับ sales ก็ได้ |
| **admin** (ตั้งค่า) | admin/* (schema-sync, modules, permissions, report-templates...) | เครื่องมือตั้งค่า ใช้นาน ๆ ครั้ง | แยกออกเพื่อให้แอปหลักเบา |

> **จุดที่ถาม (BOM ต้องใช้ SKU/Parent SKU):** ทั้งคู่อยู่ใน **แอป core เดียวกัน** → สลับหน้า/ดึงข้อมูลลื่นสนิท ✅

## ลำดับการแยก (ทำทีละขั้น — เริ่มจากตัวอิสระสุด เสี่ยงน้อยสุด)
1. **เฟส 0 — ตั้งโครง `packages/`** ย้ายของกลางหลัก (DataTable, master-crud, auth, supabase, swr) เข้าไป โดย**ยังเป็นแอปเดียว** → ทดสอบว่าไม่พัง (ไม่มีผลผู้ใช้)
2. **เฟส 1 — แยก Payroll ออกก่อน** (อิสระสุด, 27 หน้า) → วัดว่า worker หลักเล็กลง/เร็วขึ้นจริงไหม + ตั้ง CI deploy 2 แอป
3. **เฟส 2 — แยก china-pay + tasks** (อิสระ)
4. **เฟส 3 — แยก sales + purchasing**
5. **เฟส 4 — เหลือ core (สินค้า/ผลิต/คลัง/ออกแบบ) เป็นแอปหลัก** + admin แยก (ถ้าต้องการ)

## ของกลางที่ต้องย้ายเข้า `packages/` (ใช้ทุกแอป)
- `ui/`: DataTable, ERPModal, Form, Picker ทุกตัว, MiniTable, toast, nav, brand, i18n
- `core/`: auth, สิทธิ์ (permissions), audit, swr-lite, api-auth (guardApi)
- `data/`: supabase client, field-registry, saved-views, relation, master-crud (ตัวใหญ่สุด)
- `config/`: theme/tokens

## ความเสี่ยง / ข้อควรระวัง
- **แก้ของกลาง → ต้อง re-deploy ทุกแอป** (ตั้ง CI ให้ push ทีเดียว build ทุกแอป — แต่ build นานขึ้น)
- **สลับข้ามแอป = โหลดเต็มหน้า** (ในแอปเดียวยังลื่น) → จัดกลุ่มให้สิ่งที่ใช้คู่กันอยู่แอปเดียว
- **ตอนย้ายของกลาง** ต้องระวัง import path เปลี่ยน (ทำทีละชุด + typecheck ทุกขั้น)
- **ยังมี cold start อยู่บ้าง** แค่สั้นลง (worker เล็กลง แต่ยังมีฐาน Next.js ~5-10MB ต่อแอป)

## เมื่อไหร่ควรทำ
- ✅ ทำเมื่อ: ระบบโตจน cold start น่ารำคาญมาก / ทีมใหญ่ขึ้น / อยากขยายยาว ๆ
- ⏸️ ยังไม่ต้องทำถ้า: ทีมเล็ก + warmer (cron-job.org) ช่วยให้ทนได้

## วิธีย้าย / เพิ่มโมดูลภายหลัง (ยืดหยุ่นสูง)

**กุญแจ:** โมดูลในระบบนี้เป็น **config + ของกลาง MasterCRUDPage** ไม่ใช่โค้ดตายตัว
ตัวอย่างจริง (`app/master/parent-skus/page.tsx`):
```
const CONFIG = { apiPath: "parent-skus", title: "Parent SKUs", ... }
export default () => <MasterCRUDPage config={CONFIG} />
```
→ ย้าย/ก๊อป/แชร์โมดูลได้ง่าย เพราะ **config + component + ข้อมูล แชร์กันหมด · DB ก้อนเดียว**

| อยากทำ | วิธี | ความยาก |
|---|---|---|
| **เพิ่มโมดูลใหม่** ในแอปไหนก็ได้ | สร้างหน้า + เขียน config + ลงทะเบียน `erp_modules` (เหมือนทุกวันนี้) | ง่าย |
| **โชว์โมดูลเดิมในหลายแอป** (เช่นสินค้าใน purchasing) | สร้างหน้าในแอปนั้น render config ตัวเดิม (import จาก packages) — ไม่ก๊อปข้อมูล/logic | ง่าย |
| **ย้ายโมดูลข้ามแอป** | ย้ายโฟลเดอร์หน้า (page.tsx+config) → อัปเดตเมนูให้ชี้แอปใหม่ → deploy 2 แอป · **ข้อมูลไม่ย้าย** (DB เดิม) · URL เปลี่ยน (ใส่ redirect ได้ถ้าห่วงลิงก์เก่า) | ปานกลาง (ย้ายไฟล์+แก้เมนู ไม่เขียนใหม่) |
| **เลือกข้อมูลข้ามโมดูล** (BOM→SKU) | ใช้ Picker กลาง (ProductPicker/SkuPicker) ดึงจาก DB เดียวกัน | ง่ายมาก |

**ใจความ:** การแยกแอปแค่กำหนด "config นั้น deploy รวมอยู่ก้อนไหน" — ไม่ได้ล็อกว่าโมดูลต้องอยู่แอปไหนถาวร · ย้าย/เพิ่ม/แชร์ทีหลังได้ตลอด

---
*สร้าง 2026-06-19 — เป็นพิมพ์เขียว ยังไม่ลงมือ*
