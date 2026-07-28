/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ CỦA IncidentDetailPanel.tsx (KÈM MINH CHỨNG CODE)
 * (Trình bày chi tiết luồng hoạt động ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT VÀ QUẢN LÝ TRẠNG THÁI KHỔNG LỒ (INITIALIZATION & STATE MANAGEMENT)
 * - Minh chứng 1: Khai báo `export const IncidentDetailPanel: React.FC<IncidentDetailPanelProps> = ({ ticket, userRole, ... })`. 
 *   Bằng chứng cho thấy đây là Component hiển thị chi tiết 1 sự cố. Nó không tự lấy dữ liệu 
 *   mà nhận object `ticket` (chứa toàn bộ thông tin) từ component cha truyền xuống.
 * - Minh chứng 2: Hàng loạt các dòng `useState` (ví dụ `cancelModalVisible`, `p1FineAmount`, `paymentUrl`).
 *   Sự tồn tại của lượng lớn State này chứng minh Component phải tự gánh vác vòng đời phức tạp 
 *   của nhiều quy trình: Từ nhân viên thẩm định (Phase 1), đưa ra giải pháp (Phase 2), 
 *   đến thanh toán online, hoặc hủy sự cố.
 * 
 * BƯỚC 2: TỰ ĐỘNG FETCH DỮ LIỆU NỀN TỐI ƯU HOÁ (BACKGROUND DATA FETCHING)
 * - Minh chứng 1: Khối lệnh `const { data: systemConfigs } = useQuery(...)`. 
 *   Bằng chứng Component tự động gọi API lấy cấu hình phí phạt (PENALTY_DAMAGED_CARD, PENALTY_LOST_CARD) 
 *   để tự động tính tiền phạt thay vì bắt nhân viên nhập tay.
 * - Minh chứng 2: Cờ `enabled: ['DAMAGED_CARD', 'LOST_CARD'].includes(ticket.type)`.
 *   Chỉ lấy cấu hình phí nếu sự cố thuộc nhóm Mất/Hỏng thẻ. Minh chứng rõ ràng cho kỹ thuật 
 *   tối ưu Network (không gọi API dư thừa).
 * 
 * BƯỚC 3: ĐỒNG BỘ DỮ LIỆU BÊN NGOÀI VÀO TRẠNG THÁI NỘI BỘ (EFFECT SYNCING)
 * - Minh chứng 1: Khối lệnh `useEffect(() => { ... }, [ticket, systemConfigs]);`.
 *   Đây là trái tim đồng bộ của Component. Bất cứ khi nào Props `ticket` thay đổi (chọn sự cố khác) 
 *   hoặc API `systemConfigs` trả về xong, React sẽ chạy lại khối này.
 * - Minh chứng 2: Bên trong useEffect có lệnh `setP1FineAmount(...)`. Tự động nạp mức phạt mặc định 
 *   (nếu là tạo mới) hoặc mức phạt cũ (nếu đang xem lại) vào State để render ra màn hình.
 * 
 * BƯỚC 4: ỦY QUYỀN GỌI API CHO TANSTACK QUERY (MUTATION DELEGATION)
 * - Xuyên suốt file sẽ chứa các `useMutation` (Xử lý Step 1, Step 2, Thanh toán số, Hủy vé).
 * - Minh chứng: Component không gọi thẳng Axios. Nó gói gọn logic gửi dữ liệu, gộp ảnh Base64 
 *   vào các hàm `mutateAsync`. Bằng chứng của việc tách biệt UI (Giao diện) và Logic gọi mạng, 
 *   tận dụng cờ `isPending` có sẵn để làm loading.
 * 
 * BƯỚC 5: XỬ LÝ KẾT QUẢ VÀ ĐỒNG BỘ GIAO DIỆN TOÀN CỤC (CACHE INVALIDATION & UI UPDATE)
 * - Minh chứng 1: Bên trong `onSuccess` của các Mutation đều gọi `queryClient.invalidateQueries({ queryKey: ['incidents'] });`.
 *   Bằng chứng của kỹ thuật "Tẩy não Cache". Đánh dấu danh sách sự cố ngoài kia là đồ cũ, 
 *   ép hệ thống tự động tải lại bảng dữ liệu mới nhất mà không cần tải lại trang.
 * - Minh chứng 2: Gọi `onActionComplete()` hoặc `onClose()` để đẩy quyền quyết định 
 *   đóng cửa sổ hiển thị về lại cho Component cha.
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN UI VÀ TIỆN ÍCH REACT
// =========================================================================
import React, { useState, useEffect } from 'react';
import { Card, Typography, Steps, Button, Tag, Input, Upload, message, InputNumber, Modal, Select, Divider, Form, Radio, Table, QRCode } from 'antd';
import { 
  CameraOutlined, CheckCircleOutlined, CloseCircleOutlined, UploadOutlined, LockOutlined, WarningOutlined, QrcodeOutlined
} from '@ant-design/icons';

// =========================================================================
// PHẦN 2: CÁC THƯ VIỆN KẾT NỐI API VÀ CÔNG CỤ XỬ LÝ LÕI
// =========================================================================
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import axiosClient from '../../../core/api/axiosClient';
import { getImageUrl } from '../../../core/utils/imageHelper';
import { FeeBreakdown } from '../../../components/FeeBreakdown';

// =========================================================================
// PHẦN 3: ĐỊNH NGHĨA COMPONENT VÀ CÁC THÀNH PHẦN PHỤ TRỢ
// =========================================================================

const { Title, Text } = Typography;
const { TextArea } = Input;

interface IncidentDetailPanelProps {
  ticket: any;
  userRole: 'CUSTOMER' | 'STAFF';
  isManager?: boolean;
  onClose: () => void;
  onActionComplete?: () => void;
}

export const IncidentDetailPanel: React.FC<IncidentDetailPanelProps> = ({ ticket, userRole, isManager, onClose, onActionComplete }) => {
  const queryClient = useQueryClient();

  // Common States
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelType, setCancelType] = useState('GUEST_FOUND_CARD');
  const [cancelFile, setCancelFile] = useState<any>(null);

  // Phase 1 Staff States
  const [p1Notes, setP1Notes] = useState('');
  const [p1File, setP1File] = useState<any>(null);
  const [p1FineAmount, setP1FineAmount] = useState<number | undefined>(ticket.fineAmount || 0);
  const [p1DiscountAmount, setP1DiscountAmount] = useState<number>(0);
  const [damageCausePhase1, setDamageCausePhase1] = useState<'USER' | 'NATURAL'>('NATURAL');

  // Phase 2 Staff States
  const [p2Notes, setP2Notes] = useState('');
  const [p2File, setP2File] = useState<any>(null);
  const [feeDiscount, setFeeDiscount] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'PAYPAL' | 'PAYOS'>('CASH');
  const [damageCausePhase2, setDamageCausePhase2] = useState<'NATURAL' | 'USER'>('NATURAL');
  const [isFeeVisible, setIsFeeVisible] = useState(false);

  // Digital Payment States
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentQrCode, setPaymentQrCode] = useState<string>('');
  const [paymentOrderId, setPaymentOrderId] = useState<string>('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [isLoadingPayment, setIsLoadingPayment] = useState(false);

  // Zone Violation Monthly Ticket Lookup States
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);
  const [selectedVType, setSelectedVType] = useState<number | null>(null);

  /**
   * =========================================================================
   * API: LẤY CẤU HÌNH BẢN ĐỒ (TẦNG, ZONE)
   * =========================================================================
   * MỤC ĐÍCH: Lấy danh sách tầng và khu vực (Zone) để hỗ trợ nhân viên đối chiếu 
   * và tìm xe đỗ sai vị trí. 
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Chỉ gọi API (enabled) khi sự cố là ZONE_VIOLATION và người dùng là STAFF.
   * 2. Gọi GET `/infrastructure/map/config`.
   * 3. Trả về dữ liệu bản đồ.
   */
  const { data: mapConfig } = useQuery({
    queryKey: ['mapConfig'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/map/config');
      return res.data?.data || {};
    },
    enabled: ticket?.type === 'ZONE_VIOLATION' && userRole === 'STAFF'
  });

  const floors = mapConfig?.floors || [];
  const zones = mapConfig?.zones || [];

  /**
   * =========================================================================
   * API: LẤY DANH SÁCH LOẠI XE
   * =========================================================================
   * MỤC ĐÍCH: Lấy danh sách phân loại phương tiện (Ô tô, Xe máy) để đối chiếu vé tháng.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Lọc điều kiện: STAFF đang xử lý lỗi ZONE_VIOLATION.
   * 2. Gọi GET `/operation/vehicle-types`.
   * 3. Trả về mảng vehicleTypes.
   */
  const { data: vehicleTypes = [] } = useQuery({
    queryKey: ['vehicle_types'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types');
      return res.data?.data || [];
    },
    enabled: ticket?.type === 'ZONE_VIOLATION' && userRole === 'STAFF'
  });

  /**
   * =========================================================================
   * API: LẤY DANH SÁCH VÉ THÁNG (TRA CỨU NHANH)
   * =========================================================================
   * MỤC ĐÍCH: Cho phép nhân viên lọc danh sách vé tháng để biết được xe nào 
   * được phép đậu ở Tầng nào, từ đó phát hiện nhanh xe đỗ sai Zone.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Lọc điều kiện: STAFF và ZONE_VIOLATION.
   * 2. Gọi GET `/operation/monthly-tickets`.
   * 3. Trả về mảng monthlyTickets.
   */
  const { data: monthlyTickets = [] } = useQuery({
    queryKey: ['monthly_tickets'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/monthly-tickets');
      return res.data?.data || [];
    },
    enabled: ticket?.type === 'ZONE_VIOLATION' && userRole === 'STAFF'
  });

  /**
   * =========================================================================
   * HÀM XỬ LÝ: LỌC DANH SÁCH VÉ THÁNG DƯỚI FRONTEND
   * =========================================================================
   * MỤC ĐÍCH: Dựa vào Tầng và Loại xe mà nhân viên chọn ở dropdown, lọc ra 
   * danh sách vé tháng hợp lệ tương ứng với khu vực đó.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Loại các vé không ACTIVE.
   * 2. Loại các vé sai Loại xe (Vehicle Type).
   * 3. Tìm các Zone thuộc Tầng đang chọn, loại các vé không được phép đậu ở các Zone đó.
   * 4. Trả về danh sách đã lọc.
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
    { title: 'Biển số', dataIndex: 'plate', key: 'plate', render: (t: string) => <Text strong>{t}</Text> },
    { title: 'Loại xe', dataIndex: 'type', key: 'type' },
    { title: 'Khách hàng', dataIndex: 'user', key: 'user' },
    { title: 'SĐT', dataIndex: 'phone', key: 'phone' },
  ];

  /**
   * =========================================================================
   * API: LẤY CẤU HÌNH HỆ THỐNG (TÍNH PHẠT)
   * =========================================================================
   * MỤC ĐÍCH: Tự động tải biểu phí phạt (mất thẻ, hỏng thẻ) từ hệ thống.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Chỉ gọi khi mã lỗi thuộc nhóm DAMAGED_CARD hoặc LOST_CARD để tiết kiệm API.
   * 2. Gọi GET `/system/configs`.
   * 3. Trả về danh sách tham số cấu hình.
   */
  const { data: systemConfigs } = useQuery({
    queryKey: ['systemConfigs'],
    queryFn: async () => {
      const res = await axiosClient.get('/system/configs');
      return res.data.data;
    },
    enabled: ['DAMAGED_CARD', 'LOST_CARD'].includes(ticket.type)
  });

  /**
   * =========================================================================
   * HÀM TÍNH TOÁN: LẤY MỨC PHẠT HỎNG/MẤT THẺ
   * =========================================================================
   * MỤC ĐÍCH: Trích xuất chính xác số tiền phạt từ list systemConfigs.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Tìm object có key 'PENALTY_DAMAGED_CARD' hoặc 'PENALTY_LOST_CARD'.
   * 2. Nếu có, ép kiểu về dạng Số (Number).
   * 3. Nếu không tìm thấy, trả về giá trị cứng (50k hoặc 200k).
   */
  const getDamagedCardPenalty = () => {
    if (!systemConfigs) return 50000;
    const cfg = systemConfigs.find((c: any) => c.configKey === 'PENALTY_DAMAGED_CARD');
    return cfg ? Number(cfg.configValue) : 50000;
  };

  const getLostCardPenalty = () => {
    if (!systemConfigs) return 200000;
    const cfg = systemConfigs.find((c: any) => c.configKey === 'PENALTY_LOST_CARD');
    return cfg ? Number(cfg.configValue) : 200000;
  };

  useEffect(() => {
    if (ticket && ticket.type === 'DAMAGED_CARD') {
      if (ticket.phase === 2 && ticket.fineAmount > 0) {
        setDamageCausePhase2('USER');
      }
      if (ticket.phase === 1) {
        setDamageCausePhase1(ticket.fineAmount > 0 ? 'USER' : 'NATURAL');
      }
    }
    
    if (ticket && ticket.phase === 1) {
      if (ticket.type === 'LOST_CARD') {
        setP1FineAmount(ticket.fineAmount > 0 ? ticket.fineAmount : getLostCardPenalty());
      } else if (ticket.type === 'DAMAGED_CARD') {
        setP1FineAmount(ticket.fineAmount || 0);
      } else {
        setP1FineAmount(ticket.fineAmount || 0);
      }
    } else {
      setP1FineAmount(ticket.fineAmount || 0);
    }
  }, [ticket, systemConfigs]);

  const isAutoCheckoutType = ['ZONE_VIOLATION', 'OVERSTAY', 'LPR_MISMATCH', 'SLOT_OCCUPIED', 'FIND_CAR', 'FEE_DISPUTE', 'BLACKLIST_VIOLATION', 'OTHER', 'LOST_CARD', 'DAMAGED_CARD'].includes(ticket.type);

  const effectivePenaltyFee = (ticket.type === 'DAMAGED_CARD') 
    ? (damageCausePhase2 === 'USER' ? getDamagedCardPenalty() : 0)
    : (ticket.fineAmount || 0);

  const baseSessionPenalty = (ticket.sessionPenaltyFee || 0) - (ticket.fineAmount || 0);
  const totalPenalty = (baseSessionPenalty > 0 ? baseSessionPenalty : 0) + effectivePenaltyFee;

  const calculatedParkingFee = ticket.expectedFee !== undefined
    ? ((ticket.expectedFee || 0) + (ticket.overtimeFee || 0))
    : (ticket.sessionParkingFee || 0);

  useEffect(() => {
    // Reset states when ticket changes
    setP1Notes('');
    setP1File(null);
    setP1FineAmount(ticket.type === 'LOST_CARD' ? getLostCardPenalty() : (ticket.fineAmount || 0));
    setDamageCausePhase1('NATURAL');
    setP2Notes('');
    setP2File(null);
    setFeeDiscount(0);
    setPaymentMethod('CASH');
    setIsFeeVisible(false);
    setPaymentUrl(null);
    setPaymentQrCode('');
    setPaymentOrderId('');
    setPaymentConfirmed(false);
  }, [ticket.id]);

  /**
   * =========================================================================
   * HÀM TIỆN ÍCH: CHUYỂN ĐỔI ẢNH SANG CHUỖI BASE64
   * =========================================================================
   * MỤC ĐÍCH: Đọc file ảnh vật lý và nén thành chuỗi văn bản để gửi qua JSON.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Khởi tạo FileReader của trình duyệt.
   * 2. Đọc file dưới dạng Data URL.
   * 3. Trả về chuỗi kết quả (Resolve Promise) để nhét vào Payload.
   */
  const getBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });

  // Mutations
  /**
   * =========================================================================
   * API MUTATION: XÁC NHẬN SỰ CỐ GIAI ĐOẠN 1 (PHASE 1)
   * =========================================================================
   * MỤC ĐÍCH: Lưu lại đánh giá ban đầu của nhân viên (Ghi chú, ảnh chụp, 
   * và đặc biệt là chốt mức Tiền phạt).
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Chuyển ảnh minh chứng sang Base64 (nếu có).
   * 2. Gói dữ liệu: resolutionNotes, ảnh, tiền phạt (fineAmount), giảm giá.
   * 3. Gọi PUT `/incident/incidents/{id}/process-phase1`.
   * 4. Thành công: Invalidate cache 'incidents' để ép load lại bảng, hiện message báo thành công.
   */
  const processPhase1Mutation = useMutation({
    mutationFn: async () => {
      const docUrl = p1File ? await getBase64(p1File) : '';
      const payload: any = {
        resolutionNotes: p1Notes,
        resolutionImageUrl: docUrl,
      };
      if (isAutoCheckoutType && p1FineAmount !== undefined) {
        payload.fineAmount = p1FineAmount;
      }
      if (ticket.type === 'FEE_DISPUTE' && p1DiscountAmount > 0) {
        payload.discountAmount = p1DiscountAmount;
      }
      await axiosClient.put(`/incident/incidents/${ticket.id}/process-phase1`, payload);
    },
    onSuccess: () => {
      message.success('Đã xác nhận Giai đoạn 1');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (onActionComplete) onActionComplete(); else onClose();
    }
  });

  /**
   * =========================================================================
   * API MUTATION: HOÀN TẤT XỬ LÝ SỰ CỐ (PHASE 2) VÀ THU TIỀN
   * =========================================================================
   * MỤC ĐÍCH: Đóng sự cố và kết toán toàn bộ chi phí (Tiền gửi xe + Tiền phạt - Giảm giá). 
   * Thường dùng khi khách chọn trả Tiền mặt (CASH).
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Chuyển ảnh biên bản sang Base64 (nếu có).
   * 2. Gói dữ liệu bao gồm: Ghi chú, tổng tiền phạt, tổng phí gửi xe, phương thức thanh toán.
   * 3. Gọi PUT `/incident/incidents/{id}/resolve`.
   * 4. Thành công: Tẩy não Cache 'incidents' và đóng cửa sổ popup sự cố.
   * 5. Thất bại: Hiển thị lỗi từ Backend thông báo cho nhân viên.
   */
  const resolvePhase2Mutation = useMutation({
    mutationFn: async () => {
      const docUrl = p2File ? await getBase64(p2File) : '';
      const payload: any = {
        resolutionNotes: p2Notes,
        resolutionImageUrl: docUrl,
        parkingFee: calculatedParkingFee,
        penaltyFee: totalPenalty,
        paymentMethod: paymentMethod,
        checkoutToken: ticket.checkoutToken
      };
      
      if (ticket.type === 'FEE_DISPUTE' && feeDiscount > 0) {
        payload.discountAmount = feeDiscount;
      }
      
      await axiosClient.put(`/incident/incidents/${ticket.id}/resolve`, payload);
    },
    onSuccess: () => {
      message.success('Đã hoàn tất xử lý sự cố');
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (onActionComplete) onActionComplete(); else onClose();
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Có lỗi xảy ra khi xác nhận thu tiền mặt. Vui lòng tải lại trang.');
    }
  });

  /**
   * =========================================================================
   * HÀM TIỆN ÍCH: TRÍCH XUẤT ẢNH AN TOÀN TRƯỚC KHI GỌI API
   * =========================================================================
   * MỤC ĐÍCH: Tránh lỗi văng ứng dụng khi cố gọi getBase64 trên một biến rỗng (null).
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Kiểm tra xem người dùng có tải ảnh p2File lên không.
   * 2. Nếu có, băm nó ra Base64. Nếu không, trả về chuỗi rỗng an toàn.
   */
  const getDocUrlSafe = async () => {
      if (p2File) return await getBase64(p2File);
      return '';
  };

  // Generate Payment URL when switching to digital method
  /**
   * =========================================================================
   * HÀM ĐỒNG BỘ: TỰ ĐỘNG TẠO MÃ QR THANH TOÁN (PAYMENT LINK)
   * =========================================================================
   * MỤC ĐÍCH: Sinh ra mã QR Code để khách hàng quét trả tiền phạt online (PayOS/PayPal).
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Lắng nghe thay đổi của phương thức thanh toán hoặc số tiền.
   * 2. Nếu chọn PAYPAL hoặc PAYOS và tổng tiền > 0, bật cờ Loading.
   * 3. Chuẩn bị gói dữ liệu Payload (Để Backend gài vào link thanh toán, lúc khách trả 
   *    xong Backend sẽ tự lôi Payload này ra để đóng sự cố ngầm).
   * 4. Gọi POST `/finance/payments/initialize`.
   * 5. Lấy URL và QR Code từ Backend gắn vào State để render ra màn hình.
   */
  useEffect(() => {
    if ((paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') && ticket) {
      const amount = calculatedParkingFee + totalPenalty - (feeDiscount || ticket.discountFee || 0);
      if (amount > 0) {
        setIsLoadingPayment(true);
        getDocUrlSafe().then(docUrl => {
            const payload = {
                incidentId: ticket.id,
                resolutionNotes: p2Notes,
                resolutionImageUrl: docUrl,
                parkingFee: calculatedParkingFee,
                penaltyFee: totalPenalty,
                discountAmount: (feeDiscount || ticket.discountFee || 0),
                checkoutToken: ticket.checkoutToken
            };
            axiosClient.post('/finance/payments/initialize', { 
                actionType: 'RESOLVE_INCIDENT',
                gateway: paymentMethod, 
                amount: amount,
                payload: payload
            })
              .then(res => {
                setPaymentUrl(res.data.data.paymentUrl);
                setPaymentQrCode(res.data.data.qrCode || res.data.data.paymentUrl || '');
                if (paymentMethod === 'PAYPAL') {
                  const urlObj = new URL(res.data.data.paymentUrl);
                  setPaymentOrderId(urlObj.searchParams.get('token') || '');
                } else {
                  setPaymentOrderId(res.data.data.orderId || '');
                }
              })
              .catch((err) => {
                const errMsg = err.response?.data?.message || err.message || `Unable to generate ${paymentMethod} QR code`;
                message.error(errMsg);
                setPaymentMethod('CASH');
              })
              .finally(() => setIsLoadingPayment(false));
        });
      } else {
        setPaymentConfirmed(true);
      }
    } else {
      setPaymentUrl(null);
      setPaymentQrCode('');
      setPaymentOrderId('');
      setPaymentConfirmed(false);
    }
  }, [paymentMethod, ticket, calculatedParkingFee, totalPenalty, feeDiscount]);

  // Listen for webhook payment confirmation
  /**
   * =========================================================================
   * HÀM ĐỒNG BỘ: LẮNG NGHE WEBHOOK THANH TOÁN THÀNH CÔNG
   * =========================================================================
   * MỤC ĐÍCH: Tự động đóng cửa sổ hiển thị khi Backend nhận được tiền từ Ngân hàng.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Lắng nghe trạng thái ticket gửi từ cha (có thể do socket đẩy về).
   * 2. Nếu trạng thái biến thành RESOLVED và phương thức đang chọn là PAYPAL/PAYOS.
   * 3. Nổi bong bóng thông báo thành công và gọi hàm onClose() thu dọn chiến trường.
   */
  useEffect(() => {
    if (ticket && ticket.status === 'RESOLVED' && !paymentConfirmed && (paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS')) {
      message.success(`Thanh toán ${paymentMethod} thành công! Hệ thống đã tự động xử lý sự cố.`);
      setPaymentConfirmed(true);
      if (onActionComplete) onActionComplete(); else onClose();
    }
  }, [ticket, paymentConfirmed, paymentMethod, onClose, onActionComplete]);

  // Polling for cooldown
  /**
   * =========================================================================
   * HÀM ĐỒNG BỘ: BỘ ĐẾM NGƯỢC CHỐNG SPAM (COOLDOWN)
   * =========================================================================
   * MỤC ĐÍCH: Tránh việc người dùng cáu gắt bấm nút "Kiểm tra thanh toán" 
   * liên tục 100 lần gây sập hoặc kẹt hệ thống gọi qua Ngân hàng.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Nếu biến verifyCooldown > 0, set một cái đồng hồ (setTimeout).
   * 2. Cứ mỗi 1 giây giảm biến đếm đi 1 đơn vị.
   * 3. Hết giờ (về 0) thì mở khóa nút bấm.
   */
  useEffect(() => {
    let timer: any;
    if (verifyCooldown > 0) {
      timer = setTimeout(() => setVerifyCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [verifyCooldown]);

  /**
   * =========================================================================
   * HÀM XỬ LÝ: KIỂM TRA TRẠNG THÁI THANH TOÁN THỦ CÔNG
   * =========================================================================
   * MỤC ĐÍCH: Cho phép nhân viên chủ động chọc sang Backend hỏi xem "Ngân hàng 
   * báo khách chuyển khoản thành công chưa?".
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Gọi POST `/finance/payments/{payos/paypal}/capture` với mã giao dịch.
   * 2. Nếu Backend báo COMPLETED (Có tiền rồi), gọi tiếp `/execute-action` để ép Backend đóng sự cố.
   * 3. Báo thông báo tương ứng ra màn hình (Thành công / Khách chưa chuyển / Lỗi).
   * 4. Cuối cùng, dù lỗi hay không, cũng khởi động bộ đếm ngược 10 giây (Cooldown) để chặn spam.
   */
  const handleManualVerify = () => {
    if (!paymentOrderId || verifyCooldown > 0) return;
    setIsVerifying(true);
    const captureUrl = paymentMethod === 'PAYOS' ? '/finance/payments/payos/capture' : '/finance/payments/paypal/capture';
    
    axiosClient.post(captureUrl, { token: paymentOrderId })
      .then(res => {
        if (res.data?.data?.status === 'COMPLETED') {
          axiosClient.post('/finance/payments/execute-action', { token: paymentOrderId })
            .then(execRes => {
                message.success(`Xác nhận thanh toán ${paymentMethod} thành công!`);
                queryClient.invalidateQueries({ queryKey: ['incidents'] });
                if (onActionComplete) onActionComplete(); else onClose();
            })
            .catch(execErr => {
                message.error(execErr.response?.data?.message || 'Lỗi khi ghi nhận xử lý sự cố. Đã chuyển sang hoàn tiền.');
                setPaymentConfirmed(true);
            });
        } else {
           message.warning('Chưa ghi nhận thanh toán hoàn tất từ cổng.');
        }
      })
      .catch(err => {
         if (err.response?.status === 400) {
           message.warning('Chưa ghi nhận thanh toán hoàn tất. Thử lại sau ít phút.');
         } else {
           message.error('Hệ thống đang bận.');
         }
      })
      .finally(() => {
         setIsVerifying(false);
         setVerifyCooldown(10);
      });
  };



  /**
   * =========================================================================
   * API MUTATION: HỦY BỎ SỰ CỐ (QUAY XE)
   * =========================================================================
   * MỤC ĐÍCH: Đóng sự cố nhưng không phạt tiền hay lưu lỗi. Ví dụ: Khách báo mất 
   * thẻ nhưng tự nhiên lục túi quần lại thấy thẻ.
   * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
   * 1. Lấy ảnh minh chứng hủy (nếu có).
   * 2. Gói lý do hủy, loại hủy và ảnh vào Payload.
   * 3. Gọi PUT `/incident/incidents/{id}/cancel`.
   * 4. Thành công: Đóng Modal hủy, tải lại danh sách sự cố và đóng cửa sổ chi tiết.
   */
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const docUrl = cancelFile ? await getBase64(cancelFile) : '';
      await axiosClient.put(`/incident/incidents/${ticket.id}/cancel`, {
        reason: cancelReason,
        cancelType: cancelType,
        cancelImageUrl: docUrl
      });
    },
    onSuccess: () => {
      message.success('Đã hủy sự cố thành công');
      setCancelModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      if (onActionComplete) onActionComplete(); else onClose();
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Có lỗi xảy ra khi hủy sự cố');
    }
  });

  // Render Helpers
  const renderImages = (urlsStr: string, phases: string[] = []) => {
    if (!urlsStr) return null;
    let urls = urlsStr.split('|').filter(u => u);

    if (phases.length > 0) {
      const hasAnyPrefix = urls.some(u => /^\[(P1|P2|CX)\]/.test(u));
      if (hasAnyPrefix) {
        urls = urls.filter(u => {
          if (/^\[(P1|P2|CX)\]/.test(u)) {
            return phases.some(p => u.startsWith(`[${p}]`));
          }
          // Legacy backward compatibility: If it has no prefix, assume it's P1
          return phases.includes('P1');
        });
      } else {
        // If there are no prefixes at all, assume all images belong to P1
        if (!phases.includes('P1')) {
          urls = [];
        }
      }
    }

    urls = urls.map(u => u.replace(/^\[(P1|P2|CX)\]/, ''));
    if (urls.length === 0) return null;

    return (
      <div className="flex gap-2 mt-2 overflow-x-auto">
        {urls.map((url, idx) => (
          <img key={idx} src={getImageUrl(url)} alt="proof" className="h-20 w-auto rounded border object-cover" />
        ))}
      </div>
    );
  };

  const currentStep = ticket.status === 'CANCELLED' || ticket.status === 'REJECTED' 
    ? 2 
    : (ticket.phase === 1 ? 0 : ticket.phase === 2 ? 1 : 2);

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-slate-200">
      {/* Header */}
      <div className="p-4 border-b bg-slate-50 flex justify-between items-center rounded-t-xl shrink-0">
        <div>
          <Title level={4} className="m-0 text-slate-800 flex items-center gap-2">
            Chi tiết Sự cố #{ticket.id}
            <Tag color={ticket.status === 'CANCELLED' ? 'default' : ticket.status === 'RESOLVED' ? 'success' : 'processing'}>
              {ticket.status}
            </Tag>
          </Title>
          <Text type="secondary">
            Loại: <Tag color="blue">{ticket.type}</Tag>
            {ticket.priority === 'HIGH' && <Tag color="red" className="font-semibold">Cấp bách</Tag>}
            {ticket.priority === 'MEDIUM' && <Tag color="orange" className="font-semibold">Trung bình</Tag>}
            {ticket.priority === 'LOW' && <Tag color="green" className="font-semibold">Thấp</Tag>}
            | BKS: <Text strong>{ticket.plate}</Text>
          </Text>
        </div>
        <Button onClick={onClose} type="text">Đóng</Button>
      </div>

      {/* Body - Timeline */}
      <div className="flex-1 p-6 overflow-y-auto">
        <Steps
          direction="vertical"
          current={currentStep}
          status={ticket.status === 'CANCELLED' || ticket.status === 'REJECTED' ? 'error' : 'process'}
          items={[
            // BƯỚC 1: TẠO SỰ CỐ
            {
              title: <span className="font-bold text-lg">Giai đoạn 1: Tiếp nhận báo cáo</span>,
              description: (
                <Card size="small" className="mt-2 bg-slate-50 border-slate-200 shadow-sm">
                  <div className="mb-2">
                    <Text type="secondary">Người tạo sự cố:</Text>
                    <div className="font-medium text-slate-700">{ticket.creatorEmail || 'Hệ thống / Vô danh'}</div>
                  </div>
                  <div className="mb-2">
                    <Text type="secondary">Thời gian tạo:</Text>
                    <div className="font-medium text-slate-700">{ticket.time ? new Date(ticket.time).toLocaleString('vi-VN') : 'Không có'}</div>
                  </div>
                  <div className="mb-2">
                    <Text type="secondary">Nội dung báo cáo:</Text>
                    <div className="font-medium break-all whitespace-pre-wrap">{ticket.description}</div>
                  </div>
                  {ticket.type === 'SLOT_OCCUPIED' && (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="font-bold text-blue-700 mb-1">Ghi nhận sự cố thành công</div>
                      <div className="text-blue-800 text-sm leading-relaxed">
                        Hệ thống đã ghi nhận sự cố của quý khách. Để không làm lỡ thời gian, quý khách có thể chủ động đỗ tại bất kỳ ô trống nào gần nhất, hoặc liên hệ nhân viên bảo vệ để được hỗ trợ đưa xe vào vị trí dự phòng. Chi tiết tiến độ xử lý đã được cập nhật trong mục Quản lý sự cố. Rất mong quý khách thông cảm cho trải nghiệm chưa trọn vẹn này!
                      </div>
                    </div>
                  )}
                  {ticket.fineAmount !== undefined && ticket.fineAmount !== null && ticket.fineAmount > 0 && !(ticket.phase >= 2 && ticket.discountFee && ticket.discountFee > 0) && (
                    <div className="mb-2">
                      <Text type="secondary">Phí phạt dự kiến:</Text>
                      <div className="font-medium text-red-600 text-lg">{ticket.fineAmount.toLocaleString('vi-VN')} đ</div>
                    </div>
                  )}
                  {ticket.phase >= 2 && ticket.type === 'FEE_DISPUTE' && ticket.discountFee !== undefined && ticket.discountFee !== null && ticket.discountFee > 0 && (
                    <div className="mb-2">
                      <Text type="secondary">Số tiền được giảm:</Text>
                      <div className="font-medium text-green-600 text-lg">- {ticket.discountFee.toLocaleString('vi-VN')} đ</div>
                    </div>
                  )}
                  {ticket.uploadedDocUrl && (
                    <div className="mb-2">
                      <Text type="secondary">Ảnh minh chứng từ khách:</Text>
                      {renderImages(ticket.uploadedDocUrl)}
                    </div>
                  )}
                  {ticket.sessionId && (
                    <div className="mb-2 p-3 bg-white border border-slate-200 rounded-lg">
                      <Text type="secondary" className="font-semibold block mb-2 text-slate-800">Thông tin xe vào bãi:</Text>
                      <div className="grid grid-cols-2 gap-2 mb-2 text-sm">
                        <div>
                          <Text type="secondary">Giờ vào:</Text>
                          <div className="font-medium">{ticket.sessionTimeIn ? new Date(ticket.sessionTimeIn).toLocaleString('vi-VN') : 'N/A'}</div>
                        </div>
                        <div>
                          <Text type="secondary">Zone gợi ý:</Text>
                          <div className="font-medium text-blue-600">{ticket.sessionSuggestedZone || 'N/A'}</div>
                        </div>
                      </div>
                      {(ticket.sessionPicInPanorama || ticket.sessionPicInPlate) && (
                        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                          {ticket.sessionPicInPanorama && renderImages(ticket.sessionPicInPanorama)}
                          {ticket.sessionPicInPlate && renderImages(ticket.sessionPicInPlate)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* STAFF/MANAGER ACTION: Duyệt GĐ1 */}
                  {userRole === 'STAFF' && ticket.phase === 1 && ticket.status === 'PENDING' && (
                    <div className="mt-4 pt-4 border-t border-slate-200 bg-white p-4 rounded-lg border">
                      <Title level={5} className="text-blue-700">Thao tác của Nhân viên</Title>
                      {ticket.type === 'OTHER' && !isManager ? (
                        <div className="text-center p-3 bg-red-50 text-red-600 rounded font-medium">
                          Chỉ Quản lý (Manager) mới có quyền duyệt và định giá mức phạt cho sự cố này. Nếu báo cáo sai, bạn có thể Hủy (Cancel).
                        </div>
                      ) : ticket.type === 'FEE_DISPUTE' && !isManager ? (
                        <div className="text-center p-3 bg-red-50 text-red-600 rounded font-medium">
                          Chỉ Quản lý (Manager) mới có quyền giải quyết giảm phí ở bước này. Nếu báo cáo sai, bạn có thể Hủy (Cancel).
                        </div>
                      ) : (
                        <Form layout="vertical">
                          {ticket.type === 'FEE_DISPUTE' && isManager && (
                            <>
                              {!isFeeVisible ? (
                                <div className="bg-slate-50 p-6 rounded-lg mb-4 border border-slate-200 text-center">
                                  <Button size="large" type="primary" onClick={() => setIsFeeVisible(true)}>
                                    Tính phí đỗ xe hiện tại
                                  </Button>
                                  <div className="text-xs text-amber-600 italic mt-3">
                                    Ấn để tra cứu mức phí (đây là phí tính tại thời điểm này và có thể thay đổi khi ra bãi).
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-slate-50 p-4 rounded-lg mb-4 border border-slate-200">
                                  <FeeBreakdown 
                                    durationMinutes={ticket.durationMinutes || 0}
                                    customerType={ticket.customerType || 'GUEST'}
                                    expectedFee={ticket.expectedFee || ticket.sessionParkingFee || 0}
                                    overtimeMinutes={ticket.overtimeMinutes || 0}
                                    overtimeFee={ticket.overtimeFee || 0}
                                    penaltyFee={totalPenalty}
                                    discountFee={p1DiscountAmount || ticket.discountFee || 0}
                                    totalFee={calculatedParkingFee + totalPenalty - (p1DiscountAmount || 0)}
                                    isLightMode={true}
                                  />
                                  <Form.Item label="Số tiền giảm (VND) - Sẽ trừ vào Tổng phí đỗ xe" className="mt-4 mb-0 font-medium">
                                    <InputNumber 
                                      className="w-full" 
                                      size="large" 
                                      min={0}
                                      max={calculatedParkingFee}
                                      value={p1DiscountAmount} 
                                      onChange={v => setP1DiscountAmount(v || 0)} 
                                    />
                                    {p1DiscountAmount > calculatedParkingFee && (
                                      <div className="text-red-500 text-sm mt-1">Số tiền giảm không được lớn hơn tổng phí hiện tại.</div>
                                    )}
                                  </Form.Item>
                                </div>
                              )}
                            </>
                          )}
                          {ticket.type === 'OTHER' && (
                            <Form.Item label="Số tiền phạt (VND) - Bắt buộc nhập" required className="mt-4 font-medium">
                              <InputNumber 
                                className="w-full" 
                                size="large" 
                                min={0}
                                value={p1FineAmount} 
                                onChange={v => setP1FineAmount(v || 0)} 
                                placeholder="Nhập số tiền phạt (VND)"
                              />
                            </Form.Item>
                          )}
                          
                          {ticket.type === 'LOST_CARD' && (
                            <Form.Item label="Số tiền phạt (VND)" className="mt-4 font-medium">
                              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center">
                                <span className="text-red-600 font-bold text-lg">{getLostCardPenalty().toLocaleString()} đ</span>
                                <span className="text-gray-500 text-sm ml-2">(Mức phạt cố định theo hệ thống)</span>
                              </div>
                            </Form.Item>
                          )}

                          {ticket.type === 'DAMAGED_CARD' && (
                            <Form.Item label="Xác nhận nguyên nhân hỏng thẻ (Cập nhật phí phạt)" className="mt-4 font-medium">
                              <Radio.Group 
                                value={damageCausePhase1} 
                                onChange={(e) => {
                                  setDamageCausePhase1(e.target.value);
                                  setP1FineAmount(e.target.value === 'USER' ? getDamagedCardPenalty() : 0);
                                }}
                                className="flex flex-col gap-3"
                              >
                                <Radio value="NATURAL"><span className="text-base text-green-600 font-medium">Hao mòn tự nhiên (0 đ)</span></Radio>
                                <Radio value="USER"><span className="text-base text-red-600 font-medium">Do khách hàng (Thu phí: {getDamagedCardPenalty().toLocaleString()} đ)</span></Radio>
                              </Radio.Group>
                            </Form.Item>
                          )}
                          <Form.Item label="Ghi chú (gửi cho khách)" className="mt-4">
                            <TextArea rows={2} style={{ wordBreak: 'break-all' }} value={p1Notes} onChange={e => setP1Notes(e.target.value)} placeholder="Nhập ghi chú hoặc hướng dẫn cho khách hàng" />
                          </Form.Item>
                          <Form.Item label="Tải ảnh lên (Tùy chọn)">
                            <Upload beforeUpload={f => { setP1File(f); return false; }} maxCount={1} listType="picture" accept="image/*" capture="environment">
                              <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
                            </Upload>
                          </Form.Item>
                          <Button 
                            type="primary" 
                            onClick={() => processPhase1Mutation.mutate()} 
                            loading={processPhase1Mutation.isPending} 
                            disabled={ticket.type === 'FEE_DISPUTE' && p1DiscountAmount > calculatedParkingFee}
                            className="w-full"
                          >
                            Xác nhận thông tin & Xử lý (Phase 1)
                          </Button>
                        </Form>
                      )}
                    </div>
                  )}
                </Card>
              )
            },
            
            // BƯỚC 2: XỬ LÝ & THU TIỀN
            {
              title: <span className="font-bold text-lg">Giai đoạn 2: Xử lý và Chờ ra bãi</span>,
              description: ticket.phase >= 2 || ticket.status === 'RESOLVED' ? (
                <Card size="small" className="mt-2 bg-blue-50 border-blue-100 shadow-sm">
                  {(() => {
                    const notes = ticket.resolutionNotes || '';
                    const p1Match = notes.match(/\[Phase 1\]([\s\S]*?)(?=\[Phase 2\]|\[CANCELLED\]|$)/);
                    const p2Match = notes.match(/\[Phase 2\]([\s\S]*?)(?=\[CANCELLED\]|$)/);
                    
                    const p1Note = p1Match ? p1Match[1].trim() : '';
                    const p2Note = p2Match ? p2Match[1].trim() : '';
                    
                    if (p1Note || p2Note) {
                      return (
                        <>
                          {p1Note && (
                            <div className="mb-3 p-3 bg-white rounded border border-blue-200">
                              <Text type="secondary" className="block mb-1 font-semibold text-blue-700">Thông tin xử lý Giai đoạn 1:</Text>
                              <div className="font-medium text-slate-700 break-all whitespace-pre-wrap">{p1Note}</div>
                              {renderImages(ticket.resolutionImageUrl, ['P1'])}
                            </div>
                          )}
                          {p2Note && (
                            <div className="mb-3 p-3 bg-white rounded border border-green-200">
                              <Text type="secondary" className="block mb-1 font-semibold text-green-700">Thông tin xử lý Giai đoạn 2 (Hoàn tất):</Text>
                              <div className="font-medium text-slate-700 break-all whitespace-pre-wrap">{p2Note}</div>
                              {renderImages(ticket.resolutionImageUrl, ['P2'])}
                              {ticket.status === 'RESOLVED' && (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                  <FeeBreakdown 
                                    durationMinutes={ticket.durationMinutes || 0}
                                    customerType={ticket.customerType || 'GUEST'}
                                    expectedFee={ticket.expectedFee || ticket.sessionParkingFee || 0}
                                    overtimeMinutes={ticket.overtimeMinutes || 0}
                                    overtimeFee={ticket.overtimeFee || 0}
                                    penaltyFee={totalPenalty}
                                    discountFee={(ticket.discountFee || 0) + (ticket.feeDiscount || 0)}
                                    totalFee={calculatedParkingFee + totalPenalty - (ticket.feeDiscount || 0)}
                                    isLightMode={true}
                                  />
                                </div>
                              )}
                            </div>
                          )}
                        </>
                      );
                    }
                    
                    // Fallback for older data format
                    return (
                      <>
                        <div className="mb-2 whitespace-pre-wrap">
                          <Text type="secondary">Quá trình xử lý (Notes):</Text>
                          <div className="font-medium text-blue-800 break-all">
                            {(ticket.resolutionNotes || 'Chưa có ghi chú')
                              .replace(/\[CANCELLED\][\s\S]*$/, '')
                              .trim() || 'Chưa có ghi chú'
                            }
                          </div>
                        </div>
                        {ticket.resolutionImageUrl && (
                          <div className="mb-2">
                            <Text type="secondary">Ảnh xử lý từ nhân viên:</Text>
                            {renderImages(ticket.resolutionImageUrl, ['P1', 'P2'])}
                          </div>
                        )}
                        {ticket.status === 'RESOLVED' && (
                          <div className="mt-3 pt-3 border-t border-slate-200">
                            <FeeBreakdown 
                                    durationMinutes={ticket.durationMinutes || 0}
                                    customerType={ticket.customerType || 'GUEST'}
                                    expectedFee={ticket.expectedFee || ticket.sessionParkingFee || 0}
                                    overtimeMinutes={ticket.overtimeMinutes || 0}
                                    overtimeFee={ticket.overtimeFee || 0}
                                    penaltyFee={totalPenalty}
                                    discountFee={ticket.discountFee || 0}
                                    totalFee={(ticket.sessionParkingFee || 0) + totalPenalty - (ticket.discountFee || 0)}
                                    isLightMode={true}
                                  />
                          </div>
                        )}
                      </>
                    );
                  })()}
                  {userRole === 'STAFF' && ticket.type === 'ZONE_VIOLATION' && (
                    <div className="mt-4 pt-4 border-t border-slate-200">
                      <Title level={5} className="text-slate-700">Tra cứu danh sách vé tháng</Title>
                      <Text type="secondary" className="block mb-2 text-sm">Tra cứu danh sách vé tháng để dễ dàng liên hệ với chủ xe đỗ sai vị trí.</Text>
                      <div className="flex gap-4 mb-4">
                        <Select 
                          placeholder="Chọn tầng" 
                          className="w-48"
                          value={selectedFloor}
                          onChange={setSelectedFloor}
                          options={floors.map((f: any) => ({ label: f.name, value: f.id }))}
                          allowClear
                        />
                        <Select 
                          placeholder="Chọn loại xe" 
                          className="w-48"
                          value={selectedVType}
                          onChange={setSelectedVType}
                          options={vehicleTypes.map((v: any) => ({ label: v.typeName, value: v.id }))}
                          allowClear
                        />
                      </div>
                      <Table 
                        dataSource={filteredMonthlyTickets} 
                        columns={monthlyTicketColumns} 
                        rowKey="id" 
                        size="small"
                        pagination={{ pageSize: 5 }}
                        bordered
                      />
                    </div>
                  )}
                  {/* Giao diện Thanh toán & Hoàn tất GĐ2 */}
                  {userRole === 'STAFF' && ticket.phase === 2 && ticket.status === 'WAITING_CHECKOUT' && (
                    <div className="mt-4 pt-4 border-t border-blue-200 bg-white p-4 rounded-lg border border-blue-100">
                      {isAutoCheckoutType ? (
                        <div className="text-center p-4 bg-blue-50 text-blue-800 rounded font-medium border border-blue-200">
                          <Title level={5} className="text-blue-700 m-0 mb-2">Chờ xe ra bãi</Title>
                          Hệ thống sẽ không tính phí và cho xe ra tại bước này. Vui lòng chờ xe ra bãi, sự cố sẽ tự động hoàn thành và chuyển sang Giai đoạn 3 cùng với phần phí phạt đã xác nhận.
                          <div className="text-sm mt-2 text-slate-500 italic">Bạn chỉ có thể hủy sự cố (nút bên dưới) nếu có sai sót.</div>
                        </div>
                      ) : ticket.type === 'FEE_DISPUTE' && !isManager ? (
                        <div className="text-center p-3 bg-red-50 text-red-600 rounded font-medium">
                          Chỉ Quản lý (Manager) mới có quyền giảm phí và hoàn tất sự cố này.
                        </div>
                      ) : (
                        <>
                          <Title level={5} className="text-green-700">Chi tiết Phí ra bãi</Title>
                          {!isFeeVisible ? (
                            <div className="bg-slate-50 p-6 rounded-lg mb-4 border border-slate-200 text-center">
                              <Button size="large" type="primary" onClick={() => setIsFeeVisible(true)}>
                                Tính phí đỗ xe hiện tại
                              </Button>
                              <div className="text-xs text-amber-600 italic mt-3">
                                Ấn để tra cứu mức phí. Phí đỗ xe vẫn tiếp tục tính bình thường.
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="bg-slate-50 p-4 rounded-lg mb-4 border border-slate-200">
                                  <FeeBreakdown 
                                    durationMinutes={ticket.durationMinutes || 0}
                                    customerType={ticket.customerType || 'GUEST'}
                                    expectedFee={ticket.expectedFee || ticket.sessionParkingFee || 0}
                                    overtimeMinutes={ticket.overtimeMinutes || 0}
                                    overtimeFee={ticket.overtimeFee || 0}
                                    penaltyFee={totalPenalty}
                                    discountFee={feeDiscount || ticket.discountFee || 0}
                                    totalFee={calculatedParkingFee + totalPenalty - (feeDiscount || ticket.discountFee || 0)}
                                    isLightMode={true}
                                  />

                              </div>

                              <Form layout="vertical">
                                {ticket.type === 'DAMAGED_CARD' && (
                                  <Form.Item label="Xác nhận nguyên nhân hỏng thẻ (Cập nhật phí phạt)">
                                    <Radio.Group 
                                      value={damageCausePhase2} 
                                      onChange={(e) => setDamageCausePhase2(e.target.value)}
                                      className="flex flex-col gap-2"
                                    >
                                      <Radio value="NATURAL"><span className="text-base text-green-600 font-medium">Hao mòn tự nhiên (Miễn phí)</span></Radio>
                                      <Radio value="USER"><span className="text-base text-red-600 font-medium">Do khách hàng (Thu phí đền thẻ: {getDamagedCardPenalty().toLocaleString()}đ)</span></Radio>
                                    </Radio.Group>
                                  </Form.Item>
                                )}
                                {ticket.type === 'FEE_DISPUTE' && (
                                  <Form.Item label="Số tiền giảm (VND) - Trừ thẳng vào Tổng thanh toán">
                                    <InputNumber 
                                      className="w-full" 
                                      size="large" 
                                      min={0} 
                                      value={feeDiscount} 
                                      onChange={v => setFeeDiscount(v || 0)} 
                                    />
                                  </Form.Item>
                                )}
                                <Form.Item label="Ghi chú hoàn tất">
                                  <TextArea rows={2} style={{ wordBreak: 'break-all' }} value={p2Notes} onChange={e => setP2Notes(e.target.value)} placeholder="Ghi chú lại quá trình thu tiền & cho xe ra bãi" />
                                </Form.Item>
                                <Form.Item label="Tải ảnh bằng chứng (Biên lai thu tiền, CCCD,...)">
                                  <Upload beforeUpload={f => { setP2File(f); return false; }} maxCount={1} listType="picture" accept="image/*" capture="environment">
                                    <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
                                  </Upload>
                                </Form.Item>
                                
                                <div className="mt-4 mb-4">
                                  <Radio.Group 
                                    value={paymentMethod} 
                                    onChange={(e) => setPaymentMethod(e.target.value)}
                                    buttonStyle="solid"
                                    className="flex w-full bg-slate-100 rounded-lg p-1 border border-slate-200"
                                  >
                                    <Radio.Button value="CASH" className="flex-1 text-center font-bold">Tiền mặt</Radio.Button>
                                    <Radio.Button value="PAYPAL" className="flex-1 text-center font-bold">PayPal</Radio.Button>
                                    <Radio.Button value="PAYOS" className="flex-1 text-center font-bold">PayOS QR</Radio.Button>
                                  </Radio.Group>
                                </div>
                                
                                {(paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') && (
                                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded border-2 border-dashed border-blue-400 mb-4">
                                    {!paymentConfirmed ? (
                                      <>
                                        {paymentUrl ? (
                                          <div className="flex flex-col items-center">
                                            {paymentMethod === 'PAYOS' ? (
                                                (paymentQrCode && (paymentQrCode.startsWith('data:image') || paymentQrCode.startsWith('http'))) ? (
                                                    <img src={paymentQrCode} alt="PayOS QR" className="w-40 h-40 object-contain" />
                                                ) : (
                                                    <QRCode value={paymentQrCode || paymentUrl} size={160} />
                                                )
                                            ) : (
                                                <QRCode value={paymentUrl} size={160} />
                                            )}
                                            <div className="mt-2 text-center text-sm font-semibold text-slate-600">
                                              Yêu cầu khách quét QR để thanh toán. Cửa sổ sẽ tự đóng khi thanh toán thành công.
                                            </div>
                                            {paymentUrl && (
                                              <Button 
                                                type="primary" 
                                                className="mt-2 bg-blue-600 hover:bg-blue-500 text-white font-bold w-full max-w-[200px]" 
                                                onClick={() => window.open(paymentUrl, '_blank')}
                                              >
                                                Mở Link Thanh Toán
                                              </Button>
                                            )}
                                            <Button type="link" onClick={handleManualVerify} loading={isVerifying} disabled={verifyCooldown > 0} className={`mt-2 ${verifyCooldown > 0 ? 'text-slate-400' : 'text-orange-600'}`}>
                                              {verifyCooldown > 0 ? `Chờ ${verifyCooldown}s để kiểm tra lại` : 'Kiểm tra trạng thái thanh toán'}
                                            </Button>
                                          </div>
                                        ) : (
                                          <div className="flex flex-col items-center py-4 text-slate-500">
                                            <QrcodeOutlined className="text-4xl animate-pulse mb-2" />
                                            Đang tạo mã QR thanh toán...
                                          </div>
                                        )}
                                      </>
                                    ) : (
                                      <div className="text-green-600 font-bold flex items-center justify-center">
                                        <CheckCircleOutlined className="mr-2 text-xl" /> Đã xác nhận thanh toán!
                                      </div>
                                    )}
                                  </div>
                                )}

                                <Button 
                                  type="primary" 
                                  className="bg-green-600" 
                                  onClick={() => resolvePhase2Mutation.mutate()} 
                                  loading={resolvePhase2Mutation.isPending || isLoadingPayment} 
                                  disabled={(paymentMethod !== 'CASH' && !paymentConfirmed) || (calculatedParkingFee + totalPenalty - (feeDiscount || ticket.discountFee || 0)) <= 0}
                                  block
                                >
                                  {paymentMethod === 'CASH' || (calculatedParkingFee + totalPenalty - (feeDiscount || ticket.discountFee || 0)) <= 0 ? 'Xác nhận đã thu đủ tiền & Cho xe ra bãi' : 'Đợi khách thanh toán QR...'}
                                </Button>
                              </Form>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </Card>
              ) : ticket.status === 'CANCELLED' || ticket.status === 'REJECTED' ? (
                <div className="text-slate-400 italic mt-1">Sự cố bị hủy trước khi đến giai đoạn này</div>
              ) : <div className="text-slate-400 italic mt-1">Đang chờ xử lý xong Giai đoạn 1</div>
            },

            // BƯỚC 3: LƯU LỊCH SỬ / KẾT THÚC
            {
              title: <span className="font-bold text-lg">Giai đoạn 3: Kết thúc</span>,
              description: ticket.status === 'RESOLVED' ? (
                <Card size="small" className="mt-2 bg-green-50 border-green-200 shadow-sm">
                  <Tag color="success" className="text-base py-1 px-3 mb-2">Đã hoàn tất toàn bộ quy trình</Tag>
                  <div className="mb-2">
                    <Text type="secondary">Người giải quyết:</Text>
                    <div className="font-medium text-green-800">{ticket.staffEmail || 'Hệ thống'}</div>
                  </div>
                  <div className="mb-2">
                    <Text type="secondary">Thời gian giải quyết:</Text>
                    <div className="font-medium text-green-800">{ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString('vi-VN') : 'Không có'}</div>
                  </div>
                </Card>
              ) : ticket.status === 'CANCELLED' || ticket.status === 'REJECTED' ? (
                <Card size="small" className="mt-2 bg-gray-50 border-gray-200 shadow-sm">
                  <Tag color="default" className="text-base py-1 px-3 mb-2">Sự cố đã bị hủy / Từ chối</Tag>
                  <div className="mb-2">
                    <Text type="secondary">Người hủy / giải quyết:</Text>
                    <div className="font-medium text-gray-700">{ticket.staffEmail || 'Hệ thống'}</div>
                  </div>
                  <div className="mb-2">
                    <Text type="secondary">Thời gian hủy / giải quyết:</Text>
                    <div className="font-medium text-gray-700">{ticket.resolvedAt ? new Date(ticket.resolvedAt).toLocaleString('vi-VN') : 'Không có'}</div>
                  </div>
                  {ticket.cancelType && (
                    <div className="mb-2">
                      <Text type="secondary">Phân loại hủy:</Text>
                      <div className="font-medium text-gray-700">{ticket.cancelType}</div>
                    </div>
                  )}
                  <div className="mb-2 whitespace-pre-wrap">
                    <Text type="secondary">Ghi chú hủy / xử lý:</Text>
                    <div className="font-medium text-red-700 break-all">{
                      ticket.resolutionNotes?.includes('[CANCELLED]') 
                        ? ticket.resolutionNotes.substring(ticket.resolutionNotes.indexOf('[CANCELLED]')) 
                        : (ticket.resolutionNotes || 'Không có ghi chú thêm')
                    }</div>
                  </div>
                  {ticket.resolutionImageUrl && (
                    <div className="mb-2">
                      <Text type="secondary">Ảnh đính kèm (Bao gồm ảnh Hủy nếu có):</Text>
                      {renderImages(ticket.resolutionImageUrl, ['CX'])}
                    </div>
                  )}
                </Card>
              ) : (
                <div className="text-slate-400 italic mt-1">Chờ xe ra bãi và thu phí xong</div>
              )
            }
          ]}
        />
      </div>

      {/* Footer - Hủy */}
      {(() => {
        const isMismatch = ['LPR_MISMATCH', 'TYPE_MISMATCH', 'MULTIPLE_MISMATCH'].includes(ticket.type);
        const isCardIncident = ['LOST_CARD', 'DAMAGED_CARD'].includes(ticket.type);
        const isActive = ticket.status === 'PENDING' || ticket.status === 'WAITING_CHECKOUT';
        const canCancel = !isMismatch && isActive && (isCardIncident || ticket.status === 'PENDING' || isManager);
        if (!canCancel) return null;
        return (
          <div className="p-4 border-t bg-slate-50 rounded-b-xl flex justify-end">
            {userRole === 'STAFF' ? (
              <Button danger icon={<CloseCircleOutlined />} onClick={() => setCancelModalVisible(true)}>
                Hủy báo cáo sự cố (Cancel)
              </Button>
            ) : (
              <Button danger onClick={() => setCancelModalVisible(true)}>Hủy yêu cầu</Button>
            )}
          </div>
        );
      })()}
      <Modal
        title="Hủy / Từ chối sự cố"
        open={cancelModalVisible}
        onCancel={() => setCancelModalVisible(false)}
        onOk={() => cancelMutation.mutate()}
        confirmLoading={cancelMutation.isPending}
        okText="Xác nhận Hủy"
        okButtonProps={{ danger: true }}
      >
        <Form layout="vertical">
          <Form.Item label="Lý do hủy" required>
            <Select value={cancelType} onChange={setCancelType}>
              <Select.Option value="GUEST_FOUND_CARD">Khách yêu cầu hủy</Select.Option>
              <Select.Option value="INFO_INCORRECT">Thông tin cung cấp sai</Select.Option>
              <Select.Option value="OTHER">Lý do khác</Select.Option>
            </Select>
          </Form.Item>
            <Form.Item label="Lý do chi tiết" required>
              <TextArea rows={3} style={{ wordBreak: 'break-all' }} value={cancelReason} onChange={e => setCancelReason(e.target.value)} placeholder="Mô tả rõ tại sao lại hủy/từ chối" />
            </Form.Item>
          {userRole === 'STAFF' && (
            <Form.Item label="Ảnh minh chứng (nếu có)">
              <Upload beforeUpload={f => { setCancelFile(f); return false; }} maxCount={1} listType="picture" accept="image/*" capture="environment">
                <Button icon={<UploadOutlined />}>Chọn ảnh</Button>
              </Upload>
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};
