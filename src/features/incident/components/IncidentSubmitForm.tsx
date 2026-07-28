/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ CỦA COMPONENT (KÈM MINH CHỨNG CODE)
 * (Trình bày chi tiết luồng hoạt động ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT VÀ NHẬN PROPS (COMPONENT INITIALIZATION & PROPS)
 * - Minh chứng 1: Khai báo `export const IncidentSubmitForm: React.FC<IncidentSubmitFormProps> = ({ onSuccess, userRole, isManager })`. 
 *   Đây là bằng chứng khai báo một Functional Component của React. Nó nhận vào 3 tham số (Props) 
 *   từ component cha (như thẻ nhân viên, cờ quản lý, và hàm callback khi thành công).
 * - Minh chứng 2: Dòng `const [form] = Form.useForm();` và `const queryClient = useQueryClient();`.
 *   Việc gọi các Hook này ở tầng trên cùng (top-level) giúp Component có công cụ để móc nối 
 *   tới trạng thái form của Ant Design và bộ quản lý Cache của TanStack Query ngay khi vừa render.
 * 
 * BƯỚC 2: TỰ ĐỘNG FETCH DỮ LIỆU NỀN TỪ BACKEND (BACKGROUND DATA FETCHING)
 * - Minh chứng 1: Khối lệnh `const { data: mapConfig } = useQuery(...)`. 
 *   Đây là bằng chứng cho việc Component tự động gửi HTTP GET Request thông qua Axios ngay khi 
 *   vừa render xong (hoặc khi các biến State phụ thuộc bị thay đổi).
 * - Minh chứng 2: Điều kiện `enabled: selectedCategory === 'ZONE_VIOLATION' && userRole === 'STAFF'`.
 *   Chỉ kích hoạt lấy sơ đồ bãi xe và vé tháng khi nhân viên chọn đúng loại sự cố Đỗ sai Zone. 
 *   Điều này chứng minh tính tối ưu hiệu năng mạng (Network Optimization), không gọi API thừa thãi.
 * 
 * BƯỚC 3: TIẾP NHẬN TƯƠNG TÁC TỪ NGƯỜI DÙNG VÀ XÁC THỰC LỚP TRUNG GIAN (USER VALIDATION)
 * - Minh chứng 1: Nút "Kiểm tra" ở giao diện liên kết với hàm `handleCheckPlate`.
 * - Minh chứng 2: Lệnh `res = await axiosClient.get('/incident/incidents/check-plate-rfid', ...)`.
 *   Hành động gọi API này chứng minh hệ thống không mù quáng cho phép báo cáo. Nó phải gọi Backend 
 *   để hỏi xem "Biển số và Thẻ từ này có khớp nhau, có đang trong bãi không?" trước khi mở khóa nút Submit.
 * 
 * BƯỚC 4: RÀNG BUỘC VÀ CHUYỂN ĐỔI DỮ LIỆU TRƯỚC KHI GỬI (DATA TRANSFORMATION & MUTATION)
 * - Nút "GỬI YÊU CẦU XỬ LÝ" kích hoạt hàm `handleIncidentSubmit(values: any)` thông qua sự kiện `onFinish` của thẻ Form.
 * - Minh chứng 1: Lệnh `mockUrl = await getBase64(uploadedFile)`.
 *   Thay vì gửi file vật lý qua chuẩn Multipart/Form-data (rườm rà cho Backend parse), Frontend 
 *   sẽ tự biến đổi tấm ảnh thành chuỗi văn bản thuần (Base64) để nhét chung vào 1 gói JSON duy nhất.
 * - Minh chứng 2: Lệnh `await createIncidentMutation.mutateAsync(...)`.
 *   Component không tự mình gọi Axios.POST. Nó đẩy gói dữ liệu Payload vào `mutateAsync`. Điều này 
 *   chứng minh việc ủy quyền (Delegation) hoàn toàn cho TanStack Query quản lý trạng thái đang tải (Loading) và lỗi.
 * 
 * BƯỚC 5: XỬ LÝ KẾT QUẢ VÀ ĐỒNG BỘ GIAO DIỆN (CACHE INVALIDATION & UI UPDATE)
 * - Khi Backend trả về mã HTTP 200 OK, block `onSuccess` bên trong `useMutation` sẽ được kích hoạt.
 * - Minh chứng 1: Lệnh `queryClient.invalidateQueries({ queryKey: ['incidents'] });`.
 *   Hành động này đánh dấu (mark stale) dữ liệu sự cố hiện tại trên toàn bộ trang web là đồ cũ. 
 *   Ép hệ thống ngầm gọi lại API lấy danh sách mới nhất để bảng sự cố bên ngoài tự động nhảy thêm 1 dòng.
 * - Minh chứng 2: Lệnh `form.resetFields()` và `onSuccess(...)`.
 *   Xóa sạch form và báo về Component cha đóng Popup lại, kết thúc vòng đời của quy trình gửi sự cố.
 * =========================================================================================
 */
// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN UI (GIAO DIỆN) VÀ TIỆN ÍCH
// Công dụng: Cung cấp các thành phần giao diện sẵn có (Button, Form, Select...) và các icon.
// =========================================================================
import React, { useState } from 'react';
import { Form, Select, Input, Button, message, Upload, Radio, Table, Typography } from 'antd';
import {
  CameraOutlined, CarOutlined, QrcodeOutlined,
  LockOutlined, WarningOutlined, SearchOutlined,
  ClockCircleOutlined, MessageOutlined, SafetyCertificateOutlined
} from '@ant-design/icons';
// =========================================================================
// PHẦN 2: CÁC THƯ VIỆN KẾT NỐI API VÀ CÔNG CỤ XỬ LÝ LÕI
// Công dụng: Xử lý gọi API mượt mà (React Query) và thao tác với Axios.
// =========================================================================
// =========================================================================
// KIẾN THỨC CỐT LÕI: TANSTACK QUERY (REACT QUERY)
// Công dụng: Thay thế useEffect/useState thủ công để gọi API mượt mà và nhàn hơn.
// 1. useQuery: Dùng để gọi API (GET). Tự động lo vụ "Loading" và tự lưu Cache (chống gọi trùng lặp).
// 2. useMutation: Dùng để gửi dữ liệu đi (POST/PUT). Tự động sinh ra cờ "isPending" để vô hiệu hóa nút bấm và làm hiệu ứng xoay tròn.
// 3. useQueryClient: Quản gia bộ nhớ. Dùng chiêu invalidateQueries() để tẩy não data cũ, ép màn hình ngầm tự load lại danh sách mới (VD: thêm sự cố xong thì bảng tự cập nhật) mà không cần F5.
// =========================================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../../core/api/axiosClient';
import { normalizePlateNumber } from '../../../core/utils/licensePlateUtils';
// =========================================================================
// PHẦN 3: ĐỊNH NGHĨA COMPONENT VÀ CÁC THÀNH PHẦN PHỤ TRỢ
// =========================================================================
const { TextArea } = Input;
const { Text } = Typography;
interface IncidentSubmitFormProps {
  onSuccess: (category?: string, plate?: string, newTicket?: any) => void;
  userRole: 'CUSTOMER' | 'STAFF';
  isManager?: boolean;
}
export const IncidentSubmitForm: React.FC<IncidentSubmitFormProps> = ({ onSuccess, userRole, isManager }) => {
  const [form] = Form.useForm();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [isPlateVerified, setIsPlateVerified] = useState<boolean>(false);
  const [isCheckingPlate, setIsCheckingPlate] = useState<boolean>(false);
  const [uploadedFile, setUploadedFile] = useState<any>(null);
  const [uploadedFile2, setUploadedFile2] = useState<any>(null);
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedVType, setSelectedVType] = useState<number | null>(null);
  /**
   * =========================================================================
   * API: LẤY CẤU HÌNH BẢN ĐỒ (TẦNG, ZONE)
   * =========================================================================
   * MỤC ĐÍCH: 
   * Dùng để hỗ trợ nhân viên bãi xe tra cứu vị trí xe đỗ sai khu vực. 
   * Chỉ gọi API khi user là STAFF và đang xử lý lỗi ZONE_VIOLATION.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Kiểm tra điều kiện (enabled): Lọc nếu (userRole == 'STAFF' VA selectedCategory == 'ZONE_VIOLATION').
   * 2. Gọi GET `/infrastructure/map/config` lấy danh sách Tầng và Zone.
   * 3. Trả về object mapConfig chứa cấu hình.
   */
  const { data: mapConfig } = useQuery({
    queryKey: ['mapConfig'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/map/config');
      return res.data?.data || {};
    },
    enabled: selectedCategory === 'ZONE_VIOLATION' && userRole === 'STAFF'
  });
  const floors = mapConfig?.floors || [];
  const zones = mapConfig?.zones || [];
  /** 
   * =========================================================================
   * API: LẤY DANH SÁCH VÉ THÁNG (TRA CỨU GỢI Ý TÌM XE)
   * =========================================================================
   * MỤC ĐÍCH: 
   * Cung cấp dữ liệu để nhân viên đối chiếu, tìm nhanh xe đỗ sai vị trí. 
   * Giống như mapConfig, dữ liệu này chỉ lấy về khi bật cho STAFF và sự kiện ZONE_VIOLATION.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Kiểm tra điều kiện (enabled): Lọc nếu (userRole == 'STAFF' VA selectedCategory == 'ZONE_VIOLATION').
   * 2. Gọi GET `/operation/monthly-tickets` lấy danh sách vé tháng toàn hệ thống.
   * 3. Trả về mảng monthlyTickets chứa các vé.
   */
  const { data: monthlyTickets = [] } = useQuery({
    queryKey: ['monthly_tickets'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/monthly-tickets');
      return res.data?.data || [];
    },
    enabled: selectedCategory === 'ZONE_VIOLATION' && userRole === 'STAFF'
  });
  /**
   * Chức năng: Lọc danh sách vé tháng đang hiển thị.
   * Nghiệp vụ: Nhân viên chọn 'Tầng' và 'Loại xe', hàm này sẽ lọc ra các vé tháng tương ứng (chỉ lấy vé Active, đúng loại xe, và được phép đỗ ở tầng đó) để click chọn nhanh.
   * Pseudo code:
   * Duyet qua tung Ve_Thang:
   *    Neu Ve_Thang khong hoat dong -> Loai
   *    Neu Loại xe khong khop voi lua chon tren form -> Loai
   *    Neu Tang duoc chon nhung Ve_Thang khong thuoc Zone cua Tang nay -> Loai
   *    Giu lai Ve_Thang hop le
   * =========================================================================
   * HÀM XỬ LÝ: LỌC DANH SÁCH VÉ THÁNG DƯỚI FRONTEND
   * =========================================================================
   * MỤC ĐÍCH: 
   * Nhân viên chọn 'Tầng' và 'Loại xe' trên giao diện, hàm này sẽ lọc ra các vé tháng tương ứng 
   * (chỉ lấy vé Active, đúng loại xe, và được phép đỗ ở tầng đó) để click chọn nhanh.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Duyệt qua từng bản ghi Ve_Thang (mt) trong mảng monthlyTickets.
   * 2. Nếu Ve_Thang không hoạt động (khác ACTIVE và EXPIRING_SOON) -> Loại bỏ (return false).
   * 3. Nếu Loại xe không khớp với lựa chọn trên form -> Loại bỏ.
   * 4. Nếu Tầng được chọn: 
   *    -> Tìm các Zone thuộc tầng đó (bằng mapConfig lấy ở trên).
   *    -> Nếu Ve_Thang không thuộc loại xe được phép đỗ của các Zone này -> Loại bỏ.
   * 5. Giữ lại Ve_Thang hợp lệ (return true).
   */
  const filteredMonthlyTickets = monthlyTickets.filter((mt: any) => {
    if (mt.status !== 'ACTIVE' && mt.status !== 'EXPIRING_SOON') return false;
    if (selectedVType && mt.vehicleTypeId !== selectedVType) return false;
    if (selectedFloor) {
      const monthlyZonesOnFloor = zones.filter((z: any) => z.floorId === selectedFloor && z.functionType === 'MONTHLY');
      const allowedVTypes = monthlyZonesOnFloor.map((z: any) => z.vehicleTypeId);
      if (!allowedVTypes.includes(mt.vehicleTypeId)) return false;
    }
    return true;
  });
  const monthlyTicketColumns = [
    { title: 'Plate', dataIndex: 'plate', key: 'plate', render: (t: string) => <Text strong>{t}</Text> },
    { title: 'Vehicle Type', dataIndex: 'type', key: 'type' },
    { title: 'Customer', dataIndex: 'user', key: 'user' },
    { title: 'Phone', dataIndex: 'phone', key: 'phone' },
  ];
  /**
   * Chức năng: Lấy danh sách loại xe (Ô tô, Xe máy...).
   * Nghiệp vụ: Lấy đúng endpoint phân quyền (STAFF gọi nội bộ, CUSTOMER gọi public) để hiển thị dropdown loại xe.
   * Pseudo code:
   * Neu (userRole == 'STAFF') thi goi API /operation/vehicle-types
   * Nguoc lai goi API /public/vehicle-types
   * =========================================================================
   * API: LẤY DANH SÁCH LOẠI XE CHO DROPDOWN
   * =========================================================================
   * MỤC ĐÍCH: 
   * Lấy danh sách loại xe (Ô tô, Xe máy...) để người dùng chọn. 
   * Tự động điều hướng đến đúng endpoint phân quyền (STAFF gọi nội bộ, CUSTOMER gọi public).
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Kiểm tra (userRole == 'STAFF').
   * 2. Nếu đúng -> Gọi API `/operation/vehicle-types`.
   * 3. Nếu sai -> Gọi API `/public/vehicle-types`.
   * 4. Trả về mảng vehicleTypes để đổ vào ô Select.
   */
  const { data: vehicleTypes = [] } = useQuery({
    queryKey: ['vehicleTypes'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get(userRole === 'STAFF' ? '/operation/vehicle-types' : '/public/vehicle-types');
        return res.data.data || [];
      } catch (err) {
        return [];
      }
    }
  });
  const { data: systemConfigs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: async () => {
      const res = await axiosClient.get('/system/configs');
      return res.data.data;
    }
  });
  /**
   * Chức năng: Tính toán mức phí phạt khi mất/hỏng thẻ.
   * Nghiệp vụ: Đọc từ cấu hình hệ thống xem phí phạt thẻ hỏng là bao nhiêu, nếu không có cấu hình thì mặc định 50.000 VNĐ.
   * Pseudo code:
   * Tim cau hinh co key 'PENALTY_DAMAGED_CARD'
   * Neu tim thay -> Tra ve gia tri do
   * Neu khong -> Tra ve 50000
   * =========================================================================
   * HÀM TÍNH TOÁN: LẤY PHÍ PHẠT LỖI HỎNG THẺ
   * =========================================================================
   * MỤC ĐÍCH: 
   * Đọc từ danh sách cấu hình hệ thống (systemConfigs) xem phí phạt thẻ hỏng là bao nhiêu. 
   * Nếu chưa load xong hoặc không có cấu hình thì lấy giá trị mặc định là 50.000 VNĐ.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Tìm cấu hình có key 'PENALTY_DAMAGED_CARD' trong mảng systemConfigs.
   * 2. Nếu tìm thấy -> Ép kiểu về số và Trả về giá trị đó.
   * 3. Nếu không tìm thấy hoặc mảng rỗng -> Trả về mặc định 50000.
   */
  const getDamagedCardPenalty = () => {
    if (!systemConfigs) return 50000;
    const cfg = systemConfigs.find((c: any) => c.configKey === 'PENALTY_DAMAGED_CARD');
    return cfg ? Number(cfg.configValue) : 50000;
  };
  /**
   * Chức năng: Chuyển đổi File ảnh sang chuỗi Base64.
   * Nghiệp vụ: Dùng để upload ảnh minh chứng đính kèm dưới dạng text JSON (chuỗi Base64) lên server thay vì gửi file vật lý qua form data.
   * Pseudo code:
   * Khoi tao FileReader -> Doc file dau vao -> Tra ve chuoi Base64 thong qua Promise
   * =========================================================================
   * HÀM TIỆN ÍCH: CHUYỂN FILE ẢNH SANG CHUỖI BASE64
   * =========================================================================
   * MỤC ĐÍCH: 
   * Dùng để convert ảnh minh chứng đính kèm thành dạng chuỗi text (Base64). 
   * Cách này cho phép gửi ảnh chung luôn với chuỗi JSON lên Server thay vì phải gửi riêng dạng FormData.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Khởi tạo đối tượng FileReader.
   * 2. Đọc file đầu vào.
   * 3. Khi đọc xong (onload), gọi resolve() trả về chuỗi kết quả Base64 qua Promise.
   * 4. Nếu có lỗi (onerror), gọi reject() kết thúc Promise.
   */
  const getBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  /**
   * Chức năng: Mutation gửi dữ liệu sự cố lên server.
   * Nghiệp vụ: Chia luồng lưu trữ. Nếu là sự cố "LOST_CARD" (cần ghi nhận phạt) thì dùng API riêng. Các sự cố khác dùng API chung. Khi thành công, reset form và báo lại component cha.
   * Pseudo code:
   * Neu payload.issueType == 'LOST_CARD' thi 
   *    Goi POST /incident/incidents/lost-card
   * Nguoc lai 
   *    Goi POST /incident/incidents
   * Neu thanh cong -> Xoa form, reset state, bao onSuccess
   * Neu that bai -> Hien thi loi
   * =========================================================================
   * API MUTATION: GỬI DỮ LIỆU SỰ CỐ (SUBMIT FORM)
   * =========================================================================
   * MỤC ĐÍCH: 
   * Gọi API lưu sự cố mới. Sẽ chia làm 2 luồng: 1 luồng riêng cho báo Mất thẻ (Vì liên quan xử phạt tức thời)
   * và 1 luồng chung cho các sự cố còn lại. Khi gửi thành công, reset lại form sạch sẽ.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Nếu payload.issueType == 'LOST_CARD': 
   *    -> Gọi POST `/incident/incidents/lost-card` truyền lên biển số, mô tả, ảnh tải lên, loại xe, mức phí phạt.
   * 2. Ngược lại: 
   *    -> Gọi POST `/incident/incidents` với toàn bộ payload.
   * 3. Nếu thành công (onSuccess):
   *    -> Xóa dữ liệu form (resetFields), xóa state chứa file upload, ẩn trạng thái đã xác thực biển số.
   *    -> Báo cho hệ thống refresh danh sách sự cố (invalidateQueries).
   *    -> Gọi hàm `onSuccess()` truyền qua Props để đóng Popup bên màn hình cha.
   * 4. Nếu thất bại (onError): Hiển thị cảnh báo lỗi (message.error).
   */
  const createIncidentMutation = useMutation({
    mutationFn: async (payload: any) => {
      let res;
      if (payload.issueType === 'LOST_CARD') {
        res = await axiosClient.post('/incident/incidents/lost-card', {
          plate: payload.plate,
          description: payload.description,
          uploadedDocUrl: payload.uploadedDocUrl,
          vehicleTypeId: payload.vehicleTypeId,
          fee: payload.fee
        });
      } else {
        res = await axiosClient.post('/incident/incidents', payload);
      }
      return res.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      form.resetFields();
      setUploadedFile(null);
      setUploadedFile2(null);
      setIsPlateVerified(false);
      setSelectedCategory('');
      onSuccess(variables.issueType, variables.plate, data?.data);
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Error submitting support request');
    }
  });

  const handleCheckPlate = async () => {
    const plate = form.getFieldValue('plate');
    if (!plate) {
      message.warning('Please enter license plate to verify');
      return;
    }
    const vehicleTypeId = form.getFieldValue('vehicleTypeId');
    if (!vehicleTypeId) {
      message.warning('Please select vehicle type to verify');
      return;
    }
    const isLostOrDamaged = selectedCategory === 'LOST_CARD' || selectedCategory === 'DAMAGED_CARD' || selectedCategory === 'ZONE_VIOLATION' || selectedCategory === 'BLACKLIST_VIOLATION';
    let rfid = '';
    if (!isLostOrDamaged) {
      rfid = form.getFieldValue('code');
      if (!rfid) {
        message.warning('Please enter card code to verify');
        return;
      }
    }
    setIsCheckingPlate(true);
    try {
      let res;
      if (isLostOrDamaged) {
        res = await axiosClient.get(`/incident/incidents/check-plate`, { params: { plate: plate.toUpperCase(), vehicleTypeId } });
      } else {
        res = await axiosClient.get(`/incident/incidents/check-plate-rfid`, { params: { plate: plate.toUpperCase(), rfid, vehicleTypeId } });
      }
      if (res.data?.data?.isActive) {
        setIsPlateVerified(true);
        message.success('Verification successful! Please provide incident details below.');
      } else {
        setIsPlateVerified(false);
        message.error(isLostOrDamaged ? 'No vehicle found with this plate in parking!' : 'Plate and Card Code do not match or not found in parking!');
      }
    } catch (err) {
      setIsPlateVerified(false);
      message.error('Error verifying vehicle info!');
    } finally {
      setIsCheckingPlate(false);
    }
  };
  /**
   * Chức năng: Xử lý submit toàn bộ form sự cố.
   * Nghiệp vụ: Chặn thiếu ảnh đối với các lỗi bắt buộc. Nếu là 'DAMAGED_CARD' (2 ảnh), gộp chuỗi Base64 bằng dấu '|'. Đặt độ ưu tiên HIGH cho lỗi bảo mật và gọi Mutation.
   * Pseudo code:
   * Neu (Loi bat buoc up anh VA Khong co anh) -> Bao loi & Stop
   * Neu (Loi DAMAGED_CARD) -> Chuyen Anh1 va Anh2 qua Base64 roi noi bang "|" 
   * Nguoc lai -> Chuyen Anh qua Base64
   * Tao Payload voi Priority = HIGH (neu mat the, blacklist) hoac MEDIUM (cac loi con lai)
   * Goi createIncidentMutation(Payload)
   * =========================================================================
   * HÀM XỬ LÝ SỰ KIỆN: GOM DỮ LIỆU VÀ KÍCH HOẠT SUBMIT
   * =========================================================================
   * MỤC ĐÍCH: 
   * Nút bấm "Gửi yêu cầu xử lý" dưới cùng của form sẽ trỏ vào hàm này. 
   * Chức năng chính là chặn nộp đơn nếu thiếu ảnh, convert ảnh thành chuỗi Base64, và đóng gói dữ liệu đẩy vào Mutation.
   * 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Xác định lỗi bắt buộc up ảnh (LOST_CARD, DAMAGED_CARD, SLOT_OCCUPIED, BLACKLIST_VIOLATION).
   * 2. Nếu thiếu ảnh -> Báo lỗi & Ngừng xử lý (return).
   * 3. Chuẩn bị ảnh Base64 (mockUrl):
   *    -> Nếu lỗi DAMAGED_CARD (Cần 2 ảnh): Chuyển cả 2 ảnh qua Base64 rồi nối bằng ký tự "|".
   *    -> Ngược lại: Chỉ chuyển 1 ảnh qua Base64.
   * 4. Tạo Payload dữ liệu:
   *    -> Chuyển biển số về In Hoa.
   *    -> Thiết lập độ ưu tiên (Priority): Đặt HIGH (Khẩn cấp) cho Mất thẻ, Blacklist. Đặt MEDIUM cho các lỗi còn lại.
   *    -> Nạp chuỗi Base64 của ảnh vào `uploadedDocUrl`.
   * 5. Gọi `createIncidentMutation.mutateAsync(Payload)` để tiến hành đẩy lên Backend.
   */
  const handleIncidentSubmit = async (values: any) => {
    let mockUrl = '';
    if (['LOST_CARD', 'DAMAGED_CARD', 'SLOT_OCCUPIED', 'BLACKLIST_VIOLATION'].includes(values.category) && !uploadedFile) {
      message.error('Please upload required proof image');
      return;
    }
    try {
      if (values.category === 'DAMAGED_CARD') {
        const urls = [];
        if (uploadedFile) urls.push(await getBase64(uploadedFile));
        if (uploadedFile2) urls.push(await getBase64(uploadedFile2));
        mockUrl = urls.join('|');
      } else {
        if (uploadedFile) {
          mockUrl = await getBase64(uploadedFile);
        }
      }
      await createIncidentMutation.mutateAsync({
        issueType: values.category,
        plate: values.plate?.toUpperCase() || '',
        vehicleTypeId: values.vehicleTypeId,
        description: `BKS: ${values.plate || 'N/A'} - ${values.description || ''}`,
        priority: values.category === 'LOST_CARD' || values.category === 'BLACKLIST_VIOLATION' ? 'HIGH' : 'MEDIUM',
        uploadedDocUrl: mockUrl,
      });
    } catch (error) {
      // Handled in mutation onError
    }
  };
  let options = [
    { value: 'LOST_CARD', label: 'Lost Card (Penalty Recorded)', icon: <LockOutlined className="text-red-500" /> },
    { value: 'DAMAGED_CARD', label: 'Damaged/Unreadable Card', icon: <WarningOutlined className="text-orange-500" /> },
    { value: 'SLOT_OCCUPIED', label: 'Pre-booked Slot Occupied', icon: <CarOutlined className="text-blue-500" /> },
    { value: 'FIND_CAR', label: 'Cannot Find Car', icon: <SearchOutlined className="text-green-500" /> },
    { value: 'FEE_DISPUTE', label: 'Fee Dispute', icon: <ClockCircleOutlined className="text-purple-500" /> },
    { value: 'OTHER_FEEDBACK', label: 'Service Feedback', icon: <MessageOutlined className="text-gray-500" /> },
  ];
  if (userRole === 'STAFF') {
    options = [
      ...options,
      { value: 'ZONE_VIOLATION', label: 'Report Wrong Zone (Internal)', icon: <WarningOutlined className="text-red-600" /> },
      { value: 'BLACKLIST_VIOLATION', label: 'Add to Blacklist (Internal)', icon: <WarningOutlined className="text-gray-800" /> },
      { value: 'OTHER', label: 'Custom Penalty (Other)', icon: <WarningOutlined className="text-orange-600" /> }
    ];
  }
  return (
    <Form form={form} layout="vertical" onFinish={handleIncidentSubmit} className="animate-fade-in relative pb-20 md:pb-0">
      <Form.Item
        name="category"
        label={<span className="font-medium text-gray-700 text-base">What issue are you facing?</span>}
        rules={[{ required: true, message: 'Please select issue type' }]}
        className="md:px-0 px-4 pt-4 md:pt-0"
      >
        <Select
          size="large"
          placeholder="-- Select issue type --"
          onChange={(val) => {
            setSelectedCategory(val);
            setIsPlateVerified(false);
          }}
          className="h-14 font-medium"
          options={options}
          optionRender={(option) => (
            <div className="flex items-center gap-3 text-base">
              {option.data.icon} {option.data.label}
            </div>
          )}
        />
      </Form.Item>
      <div className="transition-all duration-300 md:px-0 px-4">
        {selectedCategory && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 bg-slate-50 md:p-6 p-4 rounded-xl border border-slate-200 mb-6 animate-fade-in-up">
            {selectedCategory !== 'OTHER_FEEDBACK' && (
              <Form.Item
                name="vehicleTypeId"
                label="Vehicle Type"
                rules={[{ required: true, message: 'Please select vehicle type' }]}
                className="mb-0 col-span-1 md:col-span-2"
              >
                <Select
                  size="large"
                  placeholder="Select vehicle type"
                  className="h-12"
                  options={vehicleTypes.map((vt: any) => ({ value: vt.id, label: vt.typeName }))}
                  disabled={isCheckingPlate}
                  onChange={(val) => { setIsPlateVerified(false); setSelectedVType(val); }}
                />
              </Form.Item>
            )}
            {selectedCategory !== 'OTHER_FEEDBACK' && (
              <Form.Item
                label="Actual License Plate"
                required
                className={`mb-0 col-span-1 ${selectedCategory === 'LOST_CARD' || selectedCategory === 'DAMAGED_CARD' || selectedCategory === 'ZONE_VIOLATION' || selectedCategory === 'BLACKLIST_VIOLATION' ? 'md:col-span-2' : ''}`}
              >
                <div className="flex gap-2">
                  <Form.Item name="plate" rules={[{ required: true, message: 'Please enter license plate' }]} noStyle>
                    <Input size="large" prefix={<CarOutlined className="text-gray-400 mr-2" />} placeholder="Ex: 51G-123.45" className="h-12 font-mono uppercase" disabled={isCheckingPlate} onChange={(e) => { setIsPlateVerified(false); form.setFieldsValue({ plate: normalizePlateNumber(e.target.value) }); }} />
                  </Form.Item>
                  {(selectedCategory === 'LOST_CARD' || selectedCategory === 'DAMAGED_CARD' || selectedCategory === 'ZONE_VIOLATION' || selectedCategory === 'BLACKLIST_VIOLATION') && (
                    <Button type="primary" size="large" className="h-12" loading={isCheckingPlate} onClick={handleCheckPlate}>
                      Verify
                    </Button>
                  )}
                </div>
              </Form.Item>
            )}
            {userRole !== 'STAFF' && (selectedCategory !== 'LOST_CARD' && selectedCategory !== 'DAMAGED_CARD' && selectedCategory !== 'OTHER_FEEDBACK' && selectedCategory !== 'ZONE_VIOLATION' && selectedCategory !== 'BLACKLIST_VIOLATION') && (
              <Form.Item
                label="Card Code / Booking Code"
                required
                className="mb-0 col-span-1"
              >
                <div className="flex gap-2">
                  <Form.Item name="code" rules={[{ required: true, message: 'Please enter card code to verify' }]} noStyle>
                    <Input size="large" prefix={<QrcodeOutlined className="text-gray-400 mr-2" />} placeholder="Enter code printed on card..." className="h-12" disabled={isCheckingPlate} onChange={() => setIsPlateVerified(false)} />
                  </Form.Item>
                  <Button type="primary" size="large" className="h-12" loading={isCheckingPlate} onClick={handleCheckPlate}>
                    Verify
                  </Button>
                </div>
              </Form.Item>
            )}
            {(isPlateVerified || userRole === 'STAFF' || selectedCategory === 'OTHER_FEEDBACK') && (
              <>
                {selectedCategory === 'DAMAGED_CARD' ? (
                  <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Form.Item label="Upload photo of damaged card" className="mb-0">
                      <Upload maxCount={1} beforeUpload={(file) => { setUploadedFile(file); return false; }} onRemove={() => setUploadedFile(null)} className="w-full block" listType="picture" capture="environment" accept="image/*">
                        <div className="w-full h-32 border-2 border-dashed border-orange-300 rounded-lg flex flex-col items-center justify-center bg-white text-orange-500 hover:bg-orange-50 hover:border-orange-500 cursor-pointer transition-colors group">
                          <CameraOutlined className="text-3xl mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium">Click to open Camera / Upload card photo</span>
                        </div>
                      </Upload>
                    </Form.Item>
                    <Form.Item label="Upload photo of ID/Vehicle Registration" className="mb-0">
                      <Upload maxCount={1} beforeUpload={(file) => { setUploadedFile2(file); return false; }} onRemove={() => setUploadedFile2(null)} className="w-full block" listType="picture" capture="environment" accept="image/*">
                        <div className="w-full h-32 border-2 border-dashed border-orange-300 rounded-lg flex flex-col items-center justify-center bg-white text-orange-500 hover:bg-orange-50 hover:border-orange-500 cursor-pointer transition-colors group">
                          <CameraOutlined className="text-3xl mb-2 group-hover:scale-110 transition-transform" />
                          <span className="text-sm font-medium">Click to open Camera / Upload ID photo</span>
                        </div>
                      </Upload>
                    </Form.Item>
                  </div>
                ) : (
                  <Form.Item label={`Upload proof attachment (${selectedCategory === 'SLOT_OCCUPIED' ? 'Violating vehicle' :
                      selectedCategory === 'FEE_DISPUTE' ? 'Fee dispute proof' :
                        selectedCategory === 'FIND_CAR' ? 'Photo of current Zone' :
                          selectedCategory === 'OTHER_FEEDBACK' ? 'Feedback photo if any' :
                            'Registration / Damaged card / Proof'
                    })`} className="mb-0 col-span-1 md:col-span-2">
                    <Upload
                      maxCount={1}
                      beforeUpload={(file) => {
                        setUploadedFile(file);
                        return false;
                      }}
                      onRemove={() => setUploadedFile(null)}
                      className="w-full block"
                      listType="picture"
                      capture="environment"
                      accept="image/*"
                    >
                      <div className="w-full h-32 border-2 border-dashed border-blue-300 rounded-lg flex flex-col items-center justify-center bg-white text-blue-500 hover:bg-blue-50 hover:border-blue-500 cursor-pointer transition-colors group">
                        <CameraOutlined className="text-3xl mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-sm font-medium">Click to open Camera / Upload photo</span>
                      </div>
                    </Upload>
                  </Form.Item>
                )}


                <Form.Item
                  name="description"
                  label={selectedCategory === 'FIND_CAR' ? "Location clue (Floor, Near which column...)" : "Detailed incident description"}
                  rules={[{ required: true, message: 'Please enter description' }]}
                  className="mb-0 col-span-1 md:col-span-2 mt-2"
                >
                  <TextArea rows={3} style={{ wordBreak: 'break-all' }} placeholder={selectedCategory === 'FIND_CAR' ? "Ex: I'm standing near elevator zone C..." : "Clearly state the issue so staff can assist you as quickly as possible"} className="rounded-lg text-base p-3" />
                </Form.Item>
              </>
            )}
          </div>
        )}
      </div>
      <div className="fixed md:static bottom-0 left-0 right-0 p-4 md:p-0 bg-white md:bg-transparent border-t md:border-0 border-gray-200 z-50">
        <Button
          type="primary"
          htmlType="submit"
          loading={createIncidentMutation.isPending}
          disabled={!selectedCategory || (!isPlateVerified && selectedCategory !== 'OTHER_FEEDBACK')}
          className={`w-full h-14 rounded-xl font-bold text-lg shadow-lg md:shadow-md transition-all duration-300 flex items-center justify-center ${selectedCategory === 'LOST_CARD' ? 'bg-red-600 hover:bg-red-700' :
            selectedCategory === 'SLOT_OCCUPIED' ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 border-0' :
              'bg-blue-600 hover:bg-blue-700'
            }`}
          icon={selectedCategory === 'LOST_CARD' ? <SafetyCertificateOutlined /> : undefined}
        >
          {selectedCategory === 'LOST_CARD' ? 'SUBMIT REQUEST & RECORD PENALTY' :
            selectedCategory === 'SLOT_OCCUPIED' ? 'REPORT & CHANGE SLOT' :
              'SUBMIT SUPPORT REQUEST'}
        </Button>
      </div>
      {selectedCategory === 'ZONE_VIOLATION' && userRole === 'STAFF' && (
        <div className="mt-6 bg-white p-4 rounded-lg border border-blue-100 shadow-sm md:static relative z-40 mb-20 md:mb-0">
          <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-3 gap-2">
            <Text strong className="text-blue-700">Lookup Monthly Pass (Find Car Hint)</Text>
            <Select
              placeholder="Filter by Floor (Optional)"
              className="w-full sm:w-48"
              value={selectedFloor}
              onChange={setSelectedFloor}
              options={floors.map((f: any) => ({ label: f.name, value: f.id }))}
              allowClear
            />
          </div>
          <Table
            dataSource={filteredMonthlyTickets}
            columns={monthlyTicketColumns}
            rowKey="id"
            size="small"
            pagination={{ pageSize: 4 }}
            bordered
            rowClassName="cursor-pointer hover:bg-blue-50 transition-colors"
            onRow={(record: any) => ({
              onClick: () => {
                form.setFieldsValue({ plate: record.plate });
                setIsPlateVerified(false);
                message.success(`Filled license plate ${record.plate}`);
              }
            })}
          />
          <Text type="secondary" className="text-xs mt-2 block">
            Tip: Select "Vehicle Type" above to filter this table. Click a row to auto-fill the License Plate in the form.
          </Text>
        </div>
      )}
    </Form>
  );
};