export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  supplier: string;
  unit: string;
  cost_price: number;
  selling_price: number;
  stock_on_hand: number;
  min_stock: number;
  status: "active" | "inactive" | "low_stock";
  created_at: string;
};

export const MOCK_PRODUCTS: Product[] = [
  { id: "1",  sku: "SKU-001", name: "กระดาษ A4 80gsm (รีม)", category: "เครื่องเขียน", supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "รีม",  cost_price: 95,   selling_price: 120,  stock_on_hand: 240, min_stock: 50,  status: "active",    created_at: "2025-01-10" },
  { id: "2",  sku: "SKU-002", name: "ปากกาลูกลื่น สีน้ำเงิน (กล่อง 12 ด้าม)", category: "เครื่องเขียน", supplier: "ซัพพลาย พาร์ท จำกัด", unit: "กล่อง", cost_price: 42,   selling_price: 60,   stock_on_hand: 85,  min_stock: 20,  status: "active",    created_at: "2025-01-12" },
  { id: "3",  sku: "SKU-003", name: "แฟ้มเอกสาร A4 (แพ็ค 10 อัน)", category: "เครื่องเขียน", supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "แพ็ค", cost_price: 120,  selling_price: 160,  stock_on_hand: 12,  min_stock: 30,  status: "low_stock", created_at: "2025-01-15" },
  { id: "4",  sku: "SKU-004", name: "น้ำยาล้างจาน (1 ลิตร)", category: "สินค้าทำความสะอาด", supplier: "เคมีภัณฑ์ไทย จำกัด", unit: "ขวด", cost_price: 35,   selling_price: 50,   stock_on_hand: 60,  min_stock: 24,  status: "active",    created_at: "2025-01-18" },
  { id: "5",  sku: "SKU-005", name: "หมึกปริ้นเตอร์ HP 680 Black", category: "ไอที", supplier: "ไอทีซัพพลาย จำกัด", unit: "ชิ้น", cost_price: 250,  selling_price: 340,  stock_on_hand: 8,   min_stock: 10,  status: "low_stock", created_at: "2025-01-20" },
  { id: "6",  sku: "SKU-006", name: "ลวดเย็บกระดาษ No.10 (กล่อง 1000 ตัว)", category: "เครื่องเขียน", supplier: "ซัพพลาย พาร์ท จำกัด", unit: "กล่อง", cost_price: 18,   selling_price: 28,   stock_on_hand: 150, min_stock: 30,  status: "active",    created_at: "2025-01-22" },
  { id: "7",  sku: "SKU-007", name: "กาวแท่ง Pritt (แพ็ค 6 ก้าน)", category: "เครื่องเขียน", supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "แพ็ค", cost_price: 75,   selling_price: 98,   stock_on_hand: 45,  min_stock: 20,  status: "active",    created_at: "2025-01-25" },
  { id: "8",  sku: "SKU-008", name: "น้ำดื่ม 600ml (ลัง 12 ขวด)", category: "อาหารและเครื่องดื่ม", supplier: "เครื่องดื่มสดชื่น จำกัด", unit: "ลัง",  cost_price: 48,   selling_price: 72,   stock_on_hand: 30,  min_stock: 10,  status: "active",    created_at: "2025-02-01" },
  { id: "9",  sku: "SKU-009", name: "เมาส์ USB Optical (ชิ้น)", category: "ไอที", supplier: "ไอทีซัพพลาย จำกัด", unit: "ชิ้น", cost_price: 180,  selling_price: 250,  stock_on_hand: 22,  min_stock: 5,   status: "active",    created_at: "2025-02-03" },
  { id: "10", sku: "SKU-010", name: "กระดาษโน้ต Post-it 76x76mm", category: "เครื่องเขียน", supplier: "ซัพพลาย พาร์ท จำกัด", unit: "เล่ม", cost_price: 45,   selling_price: 65,   stock_on_hand: 95,  min_stock: 30,  status: "active",    created_at: "2025-02-05" },
  { id: "11", sku: "SKU-011", name: "น้ำยาถูพื้น Mister Muscle (1L)", category: "สินค้าทำความสะอาด", supplier: "เคมีภัณฑ์ไทย จำกัด", unit: "ขวด", cost_price: 68,   selling_price: 95,   stock_on_hand: 5,   min_stock: 12,  status: "low_stock", created_at: "2025-02-08" },
  { id: "12", sku: "SKU-012", name: "คีย์บอร์ด USB ไทย-อังกฤษ", category: "ไอที", supplier: "ไอทีซัพพลาย จำกัด", unit: "ชิ้น", cost_price: 350,  selling_price: 490,  stock_on_hand: 14,  min_stock: 5,   status: "active",    created_at: "2025-02-10" },
  { id: "13", sku: "SKU-013", name: "ซองจดหมาย C5 (แพ็ค 50 ซอง)", category: "เครื่องเขียน", supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "แพ็ค", cost_price: 38,   selling_price: 55,   stock_on_hand: 200, min_stock: 40,  status: "active",    created_at: "2025-02-12" },
  { id: "14", sku: "SKU-014", name: "แผ่นซีดี DVD-R 50 แผ่น/กล่อง", category: "ไอที", supplier: "ไอทีซัพพลาย จำกัด", unit: "กล่อง", cost_price: 120,  selling_price: 0,    stock_on_hand: 3,   min_stock: 5,   status: "inactive",  created_at: "2024-06-01" },
  { id: "15", sku: "SKU-015", name: "กาแฟสำเร็จรูป Nescafe 3in1 (กล่อง 27 ซอง)", category: "อาหารและเครื่องดื่ม", supplier: "เครื่องดื่มสดชื่น จำกัด", unit: "กล่อง", cost_price: 95,   selling_price: 135,  stock_on_hand: 18,  min_stock: 6,   status: "active",    created_at: "2025-02-15" },
  { id: "16", sku: "SKU-016", name: "เทปใส OPP 48mm x 100m", category: "เครื่องเขียน", supplier: "ซัพพลาย พาร์ท จำกัด", unit: "ม้วน", cost_price: 28,   selling_price: 40,   stock_on_hand: 80,  min_stock: 20,  status: "active",    created_at: "2025-02-18" },
  { id: "17", sku: "SKU-017", name: "ถุงขยะสีดำ 36x45 นิ้ว (แพ็ค 50 ถุง)", category: "สินค้าทำความสะอาด", supplier: "เคมีภัณฑ์ไทย จำกัด", unit: "แพ็ค", cost_price: 55,   selling_price: 80,   stock_on_hand: 40,  min_stock: 15,  status: "active",    created_at: "2025-02-20" },
  { id: "18", sku: "SKU-018", name: "ไส้ปากกา Pilot G2 สีน้ำเงิน (แพ็ค 3)", category: "เครื่องเขียน", supplier: "บริษัท ออฟฟิศซัพพลาย จำกัด", unit: "แพ็ค", cost_price: 65,   selling_price: 90,   stock_on_hand: 35,  min_stock: 15,  status: "active",    created_at: "2025-02-22" },
  { id: "19", sku: "SKU-019", name: "แฟลชไดร์ฟ 32GB USB 3.0", category: "ไอที", supplier: "ไอทีซัพพลาย จำกัด", unit: "ชิ้น", cost_price: 180,  selling_price: 0,    stock_on_hand: 0,   min_stock: 5,   status: "inactive",  created_at: "2024-08-15" },
  { id: "20", sku: "SKU-020", name: "กล่องเก็บเอกสาร A4 พลาสติก", category: "เครื่องเขียน", supplier: "ซัพพลาย พาร์ท จำกัด", unit: "ใบ",  cost_price: 85,   selling_price: 120,  stock_on_hand: 55,  min_stock: 10,  status: "active",    created_at: "2025-03-01" },
];
