# ของกลางฝั่งเซิร์ฟเวอร์ของเว็บไซต์ (หาร้าน · CORS)

## หาร้านจาก slug — `lib/website-shop.ts`
เดิมทุก route เขียน `sb.from("shops").select(...).eq("slug", ...)` เอง

```ts
const shop = await shopBySlug<{ id: string; name: string }>(sb, p.get("shop"), "id, name");
if (!shop) return NextResponse.json({ error: "ไม่พบร้าน" }, { status: 404 });

// API สาธารณะของเว็บร้าน: ร้านที่ปิด (status ≠ active) ถือว่าไม่พบ
const shop = await activeShopBySlug(sb, body.shop);
```

- ตัดช่องว่างให้ · slug ว่าง/ไม่ใช่ข้อความ = `null` (ไม่ยิง query)
- ข้อความ "ไม่พบร้าน" ให้ route ตอบเอง (แต่ละที่ใช้ภาษา/รูปแบบต่างกัน)
- ใช้แล้ว: API สาธารณะ 14 route + หลังบ้านเว็บ 24 route
- ยังไม่ย้าย: route ที่ค้นได้ทั้ง id หรือ slug (card-badges · size-guides · tag-categories · new-drops/restock `shopIdOf`) · ชุดรูป (เซสชันอื่นกำลังแก้) · products/site/listings/theme/layout/field-map/translations (query หลายบรรทัดพร้อมคอลัมน์เยอะ)

## หัว CORS ของ API เว็บร้าน — `lib/storefront-cors.ts`
เว็บร้านอยู่คนละโดเมนกับ ERP ทุก route ใน `/api/public/storefront/*` จึงต้องตอบ preflight และแนบหัว CORS เดียวกัน

```ts
const CORS = storefrontCors("GET, POST");
export async function OPTIONS(): Promise<NextResponse> {
  return corsPreflight(CORS);
}
const json = corsJson(CORS); // json(body, status?, cacheControl = "no-store")
```

- route.ts export ได้แค่ handler จึงให้แต่ละ route ประกาศ `OPTIONS` เอง
- ใช้แล้ว 19 route · `schema` (แคช public) และ `/api/public/address/search` ใช้หัวของตัวเอง

ทดสอบ: `lib/__tests__/website-shop.test.ts`
