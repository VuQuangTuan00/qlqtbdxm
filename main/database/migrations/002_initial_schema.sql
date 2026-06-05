-- ============================================================
-- Migration 002: Loại xe và quy trình bảo dưỡng riêng từng xe
-- ============================================================

-- --------------------------------
-- Loại xe (Vehicle Types)
-- --------------------------------
CREATE TABLE IF NOT EXISTS vehicle_types (
    id              SERIAL PRIMARY KEY,
    type_code       VARCHAR(50)  NOT NULL UNIQUE,
    type_name       VARCHAR(200) NOT NULL,
    description     TEXT,
    image_url       TEXT,            -- base64 hoặc đường dẫn nội bộ
    manufacturer    VARCHAR(100),
    origin_country  VARCHAR(100),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_by      INTEGER REFERENCES users(id),
    created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- --------------------------------
-- Bước quy trình bảo dưỡng theo từng loại xe + loại bảo dưỡng
-- --------------------------------
CREATE TABLE IF NOT EXISTS vehicle_maintenance_steps (
    id                      SERIAL PRIMARY KEY,
    vehicle_type_id         INTEGER NOT NULL REFERENCES vehicle_types(id) ON DELETE CASCADE,
    maintenance_type        VARCHAR(30) NOT NULL
                                CHECK(maintenance_type IN ('dinh_ky','dot_xuat','sua_chua','kiem_tra')),
    step_order              INTEGER NOT NULL,
    step_name               VARCHAR(200) NOT NULL,
    technical_requirement   TEXT,
    estimated_time          INTEGER,   -- phút
    tools_required          TEXT,      -- dụng cụ cần thiết
    safety_notes            TEXT,      -- lưu ý an toàn
    is_mandatory            BOOLEAN NOT NULL DEFAULT TRUE,
    created_by              INTEGER REFERENCES users(id),
    created_at              TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(vehicle_type_id, maintenance_type, step_order)
);

-- --------------------------------
-- Liên kết trang bị với loại xe
-- --------------------------------
ALTER TABLE equipments
    ADD COLUMN IF NOT EXISTS vehicle_type_id INTEGER REFERENCES vehicle_types(id) ON DELETE SET NULL;

-- --------------------------------
-- Indexes
-- --------------------------------
CREATE INDEX IF NOT EXISTS idx_vehicle_types_code         ON vehicle_types(type_code);
CREATE INDEX IF NOT EXISTS idx_vehicle_types_active       ON vehicle_types(is_active);
CREATE INDEX IF NOT EXISTS idx_vms_vehicle_type           ON vehicle_maintenance_steps(vehicle_type_id);
CREATE INDEX IF NOT EXISTS idx_vms_maint_type             ON vehicle_maintenance_steps(maintenance_type);
CREATE INDEX IF NOT EXISTS idx_equipments_vehicle_type    ON equipments(vehicle_type_id);

-- --------------------------------
-- Dữ liệu mẫu: Loại xe
-- --------------------------------
INSERT INTO vehicle_types (type_code, type_name, description, manufacturer, origin_country) VALUES
('ZIL-131',    'Xe ô tô vận tải ZIL-131',     'Xe tải quân sự 3 cầu chủ động, tải trọng 3.5 tấn',    'ZIL',   'Liên Xô'),
('BTR-80',     'Xe bọc thép chở quân BTR-80',  'Xe bọc thép bánh lốp 8x8, chở 7 lính chiến đấu',      'GAZ',   'Nga'),
('GAZ-66',     'Xe ô tô địa hình GAZ-66',      'Xe tải địa hình 2 cầu, tải trọng 2 tấn',               'GAZ',   'Liên Xô'),
('URAL-4320',  'Xe URAL-4320',                 'Xe tải quân sự 3 cầu, tải trọng 5 tấn',                'URAL',  'Nga'),
('K-700',      'Máy kéo bánh lốp K-700',       'Máy kéo nông nghiệp và công trình',                    'Kirov', 'Liên Xô')
ON CONFLICT (type_code) DO NOTHING;

-- --------------------------------
-- Dữ liệu mẫu: Quy trình bảo dưỡng ZIL-131 định kỳ
-- --------------------------------
DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM vehicle_types WHERE type_code = 'ZIL-131';
  IF v_id IS NOT NULL THEN
    INSERT INTO vehicle_maintenance_steps
      (vehicle_type_id, maintenance_type, step_order, step_name, technical_requirement, estimated_time, tools_required, safety_notes) VALUES
    (v_id,'dinh_ky',1,'Kiểm tra mức dầu động cơ','Mức dầu đạt vạch MAX trên que thăm, dầu không đen quá mức','15','Que thăm dầu, giẻ lau','Tắt máy, chờ nguội ít nhất 10 phút trước khi kiểm tra'),
    (v_id,'dinh_ky',2,'Thay dầu động cơ và lọc dầu','Dầu ZIL-130 15W40 hoặc tương đương, dung tích 9.5L','45','Cờ lê 27mm, khay hứng dầu, lọc dầu mới','Chú ý dầu nóng khi xả, dùng găng tay chịu nhiệt'),
    (v_id,'dinh_ky',3,'Kiểm tra và điều chỉnh khe hở xupap','Khe hở xupap hút 0.25mm, xả 0.30mm (động cơ nguội)','60','Thước lá, cờ lê điều chỉnh','Tháo nắp đầu xy-lanh đúng quy trình'),
    (v_id,'dinh_ky',4,'Kiểm tra hệ thống làm mát','Mức nước làm mát đầy, không rò rỉ, dây curoa bơm nước đúng độ căng','30','Tua vít, kìm, đèn pin','Không mở nắp két nước khi máy còn nóng'),
    (v_id,'dinh_ky',5,'Kiểm tra và điều chỉnh phanh','Hành trình tự do bàn đạp phanh 40-50mm, má phanh ≥ 3mm','45','Thước đo, cờ lê điều chỉnh','Kiểm tra trên mặt phẳng, kê chèn bánh xe'),
    (v_id,'dinh_ky',6,'Bơm mỡ các vú mỡ truyền động','Theo bảng bôi trơn ZIL-131, 16 vú mỡ','40','Súng bơm mỡ, mỡ LITOL-24','Sử dụng đúng loại mỡ quy định'),
    (v_id,'dinh_ky',7,'Kiểm tra áp suất lốp','Bánh trước 4.2 kg/cm², bánh sau 3.2 kg/cm², bánh dự phòng 4.5 kg/cm²','20','Đồng hồ đo áp suất lốp, bơm xe','Kiểm tra khi lốp nguội'),
    (v_id,'dinh_ky',8,'Kiểm tra hệ thống điện và acquy','Điện áp acquy 12V, tỷ trọng dung dịch 1.27-1.28','25','Đồng hồ vạn năng, tỷ trọng kế','Không để tia lửa gần acquy, tháo cực âm trước'),
    (v_id,'dinh_ky',9,'Kiểm tra hộp số và cầu chủ động','Mức dầu hộp số đúng, không rò rỉ, tiếng kêu bất thường','30','Cờ lê, que thăm dầu hộp số','Vận hành thử ở bãi bằng phẳng'),
    (v_id,'dinh_ky',10,'Vệ sinh toàn bộ xe và ghi sổ kỹ thuật','Xe sạch, khô, ghi đầy đủ hạng mục đã thực hiện','30','Nước, xà phòng, giẻ lau','Ghi chép trung thực, đầy đủ')
    ON CONFLICT (vehicle_type_id, maintenance_type, step_order) DO NOTHING;
  END IF;
END $$;

-- Quy trình đột xuất ZIL-131
DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM vehicle_types WHERE type_code = 'ZIL-131';
  IF v_id IS NOT NULL THEN
    INSERT INTO vehicle_maintenance_steps
      (vehicle_type_id, maintenance_type, step_order, step_name, technical_requirement, estimated_time, tools_required, safety_notes) VALUES
    (v_id,'dot_xuat',1,'Xác định và ghi nhận sự cố','Mô tả đầy đủ triệu chứng, hoàn cảnh xảy ra sự cố','20','Sổ ghi chép','Báo cáo ngay chỉ huy trực tiếp'),
    (v_id,'dot_xuat',2,'Kiểm tra an toàn trước khi sửa chữa','Xe đã tắt máy, hãm phanh tay, kê chèn bánh xe','15','Chèn bánh xe','Tuyệt đối không sửa khi xe đang chạy'),
    (v_id,'dot_xuat',3,'Tháo và kiểm tra chi tiết hư hỏng','Theo đúng quy trình tháo lắp trong tài liệu kỹ thuật ZIL-131','90','Bộ dụng cụ đa năng ZIL','Chú ý mô-men xoắn khi tháo bu-lông quan trọng'),
    (v_id,'dot_xuat',4,'Thay thế hoặc phục hồi chi tiết','Chi tiết thay thế đúng mã số, nguồn gốc rõ ràng','120','Tùy theo hạng mục','Không dùng chi tiết kém chất lượng, không rõ nguồn gốc'),
    (v_id,'dot_xuat',5,'Lắp ráp và kiểm tra','Lắp theo thứ tự ngược khi tháo, đủ moment xiết','60','Cờ lê lực','Kiểm tra lại tất cả bu-lông sau khi lắp'),
    (v_id,'dot_xuat',6,'Chạy thử và bàn giao','Xe hoạt động bình thường, sự cố đã được khắc phục','30','—','Chạy thử trong khuôn viên đơn vị')
    ON CONFLICT (vehicle_type_id, maintenance_type, step_order) DO NOTHING;
  END IF;
END $$;

-- Quy trình định kỳ BTR-80
DO $$
DECLARE v_id INTEGER;
BEGIN
  SELECT id INTO v_id FROM vehicle_types WHERE type_code = 'BTR-80';
  IF v_id IS NOT NULL THEN
    INSERT INTO vehicle_maintenance_steps
      (vehicle_type_id, maintenance_type, step_order, step_name, technical_requirement, estimated_time, tools_required, safety_notes) VALUES
    (v_id,'dinh_ky',1,'Kiểm tra vỏ thép và cửa nắp','Không nứt, biến dạng, gioăng kín cửa nước còn tốt','30','Đèn pin, búa kiểm tra','Kiểm tra kỹ các mối hàn vùng đáy xe'),
    (v_id,'dinh_ky',2,'Kiểm tra hệ thống động lực KAMAZ-7403','Dầu động cơ đúng mức, turbo không rò khí','45','Que thăm dầu, đèn soi','Chú ý nhiệt độ turbo sau khi vận hành'),
    (v_id,'dinh_ky',3,'Kiểm tra hệ thống truyền động 8x8','8 bánh đều có áp suất đúng, dầu cầu đúng mức','60','Đồng hồ áp suất, cờ lê','Kiểm tra từng bánh theo thứ tự'),
    (v_id,'dinh_ky',4,'Kiểm tra hệ thống vũ khí (nếu có)','Theo tài liệu kỹ thuật vũ khí kèm theo','90','Bộ dụng cụ chuyên dụng','Chỉ sỹ quan được phân công mới được thực hiện'),
    (v_id,'dinh_ky',5,'Kiểm tra hệ thống bơi','Van kín nước hoạt động, bơm nước dự phòng tốt','45','Cờ lê, đèn pin soi đáy','Thử nghiệm ở ao hồ nông trước khi ra sông'),
    (v_id,'dinh_ky',6,'Kiểm tra hệ thống NBC (phòng hóa)','Bộ lọc NBC còn trong hạn sử dụng, van kín hoạt động','30','Đồng hồ đo áp suất','Kiểm tra theo quy trình NBC'),
    (v_id,'dinh_ky',7,'Tra dầu mỡ và vệ sinh','Theo bảng bôi trơn BTR-80','60','Súng bơm mỡ, dầu LITOL','Ghi chép đầy đủ')
    ON CONFLICT (vehicle_type_id, maintenance_type, step_order) DO NOTHING;
  END IF;
END $$;