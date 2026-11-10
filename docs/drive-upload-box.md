# DriveUploadBox — กล่องอัปไฟล์ขึ้น Google Drive (กลาง)

> ลากวาง / กดแนบไฟล์งานขึ้นโฟลเดอร์ Drive ของรายการ + โชว์ไฟล์ในโฟลเดอร์ · โค้ด: `components/drive-upload-box/index.tsx`
> ใช้ครั้งแรก: ใบงานออกแบบ แท็บ "ข้อมูลงาน" (2026-11-10)

## ใช้ทำอะไร

- กล่องเส้นประ "แนบไฟล์ / ลากมาวาง" — ได้ทีละหลายไฟล์ (ส่งทีละไฟล์ตามลำดับ)
- ไฟล์ใหญ่ได้ถึง **5GB** (AI · PSD · PDF · ZIP ฯลฯ) — เบราว์เซอร์ส่งตรงเข้า Google ไม่ได้ (CORS) จึงส่งทีละชิ้นผ่าน `/api/drive/upload-chunk` (`lib/drive-chunk-upload`)
- ระหว่างส่ง = แถบ % + "ไฟล์ที่ n/ทั้งหมด" (`UploadProgress`) · เสร็จ = toast + รายการไฟล์โหลดใหม่
- ข้างบน = ไฟล์ในโฟลเดอร์ (`DriveFolderFiles`) · ยังไม่มีโฟลเดอร์ = ข้อความ "แนบไฟล์แรกแล้วระบบสร้างโฟลเดอร์ให้"

ประกอบจากของกลาง: `useFileDrop` + `FileDropHint` · `UploadProgress` · `DriveFolderFiles` · `Icon` · `useToast`

## ใช้เมื่อไหร่ / ห้ามใช้เมื่อไหร่

- ✅ รายการที่มีโฟลเดอร์ Drive ของตัวเอง เก็บไฟล์งานต้นฉบับ/ไฟล์ใหญ่ (ใบงานออกแบบ · ต่อไปใบสั่งแพทเทิร์น · งาน Creative)
- ❌ รูปที่ต้องโชว์ในระบบ (รูปสินค้า/รูปประกอบ) → `ImageManager` / ไฟล์แนบ R2
- ❌ ไฟล์แนบเล็ก 1-2 ไฟล์ที่ไม่ต้องอยู่ใน Drive → `FileInput` / `FileMultiInput`
- ❌ ไฟล์ปริ้น → Drive ตามกฎที่เก็บไฟล์ (`print-files-drive-only.md`)

## ใช้ยังไง

กล่องไม่รู้ว่าโฟลเดอร์อยู่ไหน — **API ของโมดูลเป็นคนตัดสิน** (ที่วางโฟลเดอร์ · สิทธิ์ · ลงประวัติ):

```tsx
<DriveUploadBox
  folderUrl={folderUrl}              // รู้แล้วส่งมา (โชว์รายการไฟล์) · null = ยังไม่มี
  canUpload={canEdit}                // false = ดูรายการอย่างเดียว
  hint="หรือลากมาวาง · AI PSD PDF ฯลฯ ได้ถึง 5GB"
  startUpload={async (file) => {     // ต่อ 1 ไฟล์: ให้ API หา/สร้างโฟลเดอร์ + เปิด resumable session
    const j = await apiFetch(`/api/<module>/${id}/drive`, { method: "POST", body: JSON.stringify({ name: file.name, mime: file.type, size: file.size }) }).then((r) => r.json());
    if (j.error) throw new Error(j.error);   // โยน Error = กล่องแจ้ง "อัป <ไฟล์> ไม่สำเร็จ: …"
    return { upload_url: j.data.upload_url, folder_url: j.data.folder_url };
  }}
  onUploaded={({ folderUrl, count }) => { /* เช่น เติมลิงก์โฟลเดอร์ลงฟอร์ม */ }}
/>
```

ฝั่ง API (ดูตัวอย่าง `app/api/design-sheets/[id]/drive/route.ts`):
1. `guardApi(request, "<สิทธิ์แก้>")` · เช็กขนาด ≤ 5GB
2. หา/สร้างโฟลเดอร์ (`driveEnsureFolder`) → `driveCreateResumableSession(name, mime, folderId)`
3. `writeAudit` ทุกไฟล์ (action `<module>.drive_upload` · เก็บชื่อไฟล์ ขนาด ลิงก์โฟลเดอร์)
4. คืน `{ data: { upload_url, folder_url } }`

## ใบงานออกแบบ (ตัวแรกที่ใช้)

- โฟลเดอร์ = ช่อง "ลิงก์ไฟล์งาน" เป็นโฟลเดอร์ Drive อยู่แล้ว → ใช้อันนั้น · ไม่งั้น `<โฟลเดอร์แบรนด์>/ใบงานออกแบบ/<DS-xxxx ชื่องาน>`
  - โฟลเดอร์แบรนด์ = ตั้งค่าแอปจัดการงาน "โฟลเดอร์ต่อแบรนด์" → ไม่มีใช้ของคลัง Artwork (`erp_brand_drive_folders`) → ไม่มีเลย = "งาน ERP"
- สร้างโฟลเดอร์ตอนอัปไฟล์แรก แล้ว **เติมลิงก์ลงช่อง "ลิงก์ไฟล์งาน" ให้เองเฉพาะตอนช่องยังว่าง** (ไม่ทับลิงก์ที่คนใส่ไว้) — ฟอร์มอัปเดตตามด้วย กันกด "บันทึก" ทีหลังแล้วลิงก์หาย
- ใบที่ยังไม่บันทึก = ยังไม่มีกล่อง (ขึ้นข้อความ "บันทึกใบงานก่อน…")
- สิทธิ์: ดูรายการ = `products.view` · อัป = `products.edit` · ประวัติ `design_sheet.drive_upload`
- โค้ด: `lib/design-sheet-drive-server.ts` (`findDesignSheetFolder` ดูอย่างเดียว · `ensureDesignSheetFolder` สร้าง+เติมลิงก์)

## ข้อจำกัด

- ยังไม่มีปุ่มยกเลิกกลางทาง / ส่งต่อจากที่ค้าง (เน็ตหลุด = อัปไฟล์นั้นใหม่)
- ลบ/เปลี่ยนชื่อไฟล์ทำใน Google Drive (กล่องโชว์ + เปิดไฟล์ได้อย่างเดียว)
- จอมือถือของใบงานออกแบบยังไม่มีกล่องนี้ (เปิดลิงก์ Drive ได้)
- ใบสั่งแพทเทิร์น / คลัง Contents ยังใช้ปุ่มอัป Drive ของตัวเอง — ย้ายมาใช้ตัวนี้ได้
