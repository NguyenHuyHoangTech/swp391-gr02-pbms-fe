/**
 * ============================================================================
 * [IMPORT LIBRARIES & UTILITIES] - Các thư viện và công cụ tiện ích
 * ============================================================================
 * 1. React & Hooks: useState, useEffect, useRef... để quản lý trạng thái và vòng đời Component.
 * 2. React Query: Dùng để gọi API một cách tối ưu, tự động cache dữ liệu (useQuery, useQueryClient).
 * 3. Ant Design (antd): Thư viện UI Kit cung cấp các component giao diện (Card, Button, Modal...).
 * 4. WebSocket: Hook tự tạo (useWebSocket) để kết nối và nhận tín hiệu thời gian thực từ phần cứng.
 * 5. Các tiện ích khác: dayjs (Xử lý thời gian), axiosClient (Gửi HTTP Request), Konva (Vẽ bản đồ).
 * ============================================================================
 */
import { simulatedDayjs } from '../../core/utils/timeProvider';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, message, Tag, Typography, Modal, Row, Col, Radio, Input, Divider, Select, InputNumber, QRCode } from 'antd';
import { CarOutlined, LockOutlined, UnlockOutlined, CheckCircleOutlined, DollarOutlined, AimOutlined, WarningOutlined, CloseCircleOutlined, QrcodeOutlined, StopOutlined, CameraOutlined, ExceptionOutlined, IdcardOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { FeeBreakdown } from '../../components/FeeBreakdown';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';
import { normalizePlateNumber } from '../../core/utils/licensePlateUtils';
import Konva from 'konva';
/**
 * ============================================================================
 * MÔ TẢ TỔNG QUAN VỀ LUỒNG DỮ LIỆU & TƯƠNG TÁC CỦA GATE OUT CONSOLE SCREEN
 * ============================================================================
 * 
 * [PHẦN 1] MỤC ĐÍCH & VAI TRÒ CỦA COMPONENT:
 *    - Giao diện trực tại cổng dành riêng cho CỔNG RA (Exit Gate). Nơi giao cắt giữa Vận hành và Tài chính.
 *    - Chịu trách nhiệm: Hứng tín hiệu xe ra, hiển thị bảng kê chi phí (Fee Breakdown), 
 *      chờ khách hàng thanh toán (Tiền mặt hoặc Quét QR MoMo) và ra lệnh mở Barie.
 * 
 * [PHẦN 2] GIẢI PHẪU VÒNG ĐỜI DỮ LIỆU (DATA FLOW LIFECYCLE) KÈM MINH CHỨNG:
 * 
 * BƯỚC 1: BÀN GIAO CA TRỰC (KHỞI TẠO DỮ LIỆU NỀN)
 * - Minh chứng (Gọi API tĩnh): Dòng 27 và 35, dùng `useQuery` để kéo về sơ đồ bãi đỗ 
 *   (mapData) và loại xe (vehicleTypes) để hiển thị lịch sử đỗ xe.
 * 
 * BƯỚC 2: XE RA ĐẾN CỔNG (HỨNG TÍN HIỆU IOT & TÍNH TIỀN)
 * - Minh chứng 1 (Ăng-ten IoT): Dòng 127 `stompClient.subscribe`. Component vểnh tai nghe tần số 
 *   `/topic/gates/{gateId}/scans`. Khi có xe ra quẹt thẻ, WebSocket nổ dữ liệu.
 * - Minh chứng 2 (Gửi yêu cầu tính tiền): Khác với Cổng Vào, ngay khi nhận được tín hiệu IoT, 
 *   Component TỰ ĐỘNG gọi API `axiosClient.get('/.../checkout-session-info')` ở dòng 147. 
 *   Mục đích: Báo cho Backend chạy máy tính tiền (PricingCalculator) và trả về Hóa đơn chi tiết.
 * - Minh chứng 3 (Render Hóa đơn): Hàm `setScanData` ở dòng 151 đẩy hóa đơn vào State, làm giao diện 
 *   Component con `<FeeBreakdown>` bung ra ngay giữa màn hình.
 * 
 * BƯỚC 3A: LUỒNG THANH TOÁN KHÔNG TIỀN MẶT (QR MOMO / VNPAY)
 * - Minh chứng 1 (Ăng-ten Webhook): Dòng 101, Component cắm thêm 1 ống nghe `/topic/payments/...`. 
 *   Nếu khách hàng quẹt MoMo trên điện thoại, máy chủ MoMo bắn Webhook về Backend, Backend bắn 
 *   tiếp chữ "SUCCESS" lên ống nghe này. Màn hình Frontend lập tức chớp xanh!
 * - Minh chứng 2 (Auto-Open): Dòng 112, nghe tiếp tần số `/topic/gates/{gateId}/out`. Nếu báo 
 *   `Checkout thành công`, Barie sẽ tự động mở mà nhân viên KHÔNG CẦN CHẠM TAY VÀO CHUỘT!
 * 
 * BƯỚC 3B: LUỒNG THANH TOÁN TIỀN MẶT (CASH)
 * - Minh chứng 1 (Nút Xác nhận): Khách đưa tiền mặt, nhân viên đếm tiền và bấm nút [Hoàn tất thanh toán].
 * - Minh chứng 2 (Chốt hạ): Hàm `handleCompletePaymentAndOpen()` ở dòng 274 kích hoạt. 
 *   Nó gói ghém `checkoutToken` (dòng 286) gửi POST Request ép Backend đóng phiên đỗ xe, 
 *   trừ đi số xe trong Zone và mở cổng.
 * ============================================================================
 */
const { Title, Text } = Typography;

const GRID_SIZE = 50;



export const GateOutConsoleScreen = ({ activeGate }: { activeGate: any }) => {
  const { connected, stompClient } = useWebSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /**
   * ============================================================================
   * [API 1] LẤY SƠ ĐỒ BÃI ĐỖ XE (ZONES MAP)
   * ============================================================================
   * MỤC ĐÍCH: Kéo dữ liệu tọa độ và tình trạng của các khu vực đỗ xe (Zones) từ Backend.
   * 
   * CƠ CHẾ KIẾN TRÚC: Ở đây không dùng `fetch()` hay `axios` thông thường, mà bọc nó 
   * trong siêu thư viện `useQuery` (React Query). 
   * -> Lợi ích: React Query tự động lưu đệm (Cache) dữ liệu vào RAM với định danh là `['zonesMap']`. 
   * Nếu nhân viên bấm sang trang khác rồi quay lại, nó lấy từ RAM ra xài ngay lập tức, không thèm 
   * gọi lại Server, giúp giảm tải Backend cực tốt!
   * 
   * ỨNG DỤNG: Biến `mapData` sẽ chứa mảng các Zone để ném vào thư viện Konva vẽ bản đồ 2D.
   * ============================================================================
   */
  const { data: mapData } = useQuery({
    queryKey: ['zonesMap'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/zones/map');
      return res.data.data;
    }
  });

  /**
   * ============================================================================
   * [API 2] LẤY DANH SÁCH LOẠI XE (VEHICLE TYPES)
   * ============================================================================
   * MỤC ĐÍCH: Lấy danh sách các loại xe bãi đang hỗ trợ (Ví dụ: Xe đạp, Xe máy, Ô tô 4 chỗ...).
   * 
   * ỨNG DỤNG THỰC TẾ: Dùng để ánh xạ (Mapping) chữ hiển thị trên màn hình. 
   * Ví dụ: Camera AI nhận diện ra loại xe có ID là `CAR`. Hệ thống sẽ dùng biến `vehicleTypes` 
   * này để dò tìm và dịch ID `CAR` thành chữ "Ô tô 4-7 chỗ" cho nhân viên thu ngân dễ đọc 
   * trên Bảng Hóa đơn Tính Tiền.
   * ============================================================================
   */
  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicleTypes'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types?activeOnly=true');
      return res.data?.data || [];
    }
  });

  /**
   * ============================================================================
   * [QUẢN LÝ TRẠNG THÁI] - CÁC STATE NÒNG CỐT CỦA MÀN HÌNH
   * ============================================================================
   * Nhóm 1: Trạng thái hiển thị (Debug, Loading, Khóa cửa sổ)
   */
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [lastRawPayload, setLastRawPayload] = useState<any>(null);
  const [debugMinimized, setDebugMinimized] = useState(false);

  const addLog = (msg: string) => {
    setDebugLogs(prev => {
      const newLogs = [...prev, `[${simulatedDayjs().format('HH:mm:ss')}] ${msg}`];
      return newLogs.slice(-20); // keep last 20 logs
    });
  };

  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef<boolean>(false); // Cờ chặn (Khóa vòi nước): Không nhận xe mới khi đang tính tiền xe cũ

  /**
   * Nhóm 2: Trạng thái Phiên giao dịch (Hóa đơn, Biển số)
   */
  const [scanData, setScanData] = useState<any>(null); // Chứa toàn bộ dữ liệu Hóa đơn (Fee, Plate, Hình ảnh) từ Backend trả về
  const [editablePlate, setEditablePlate] = useState<string>(''); // Biển số xe có thể sửa bằng tay nếu AI đọc sai

  /**
   * Nhóm 3: Trạng thái Thanh toán (Payment Gateway)
   */
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'PAYPAL' | 'PAYOS'>('CASH'); // Phương thức thanh toán đang chọn
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null); // Link nhảy sang cổng thanh toán (Nếu dùng ĐT)
  const [paymentQrCode, setPaymentQrCode] = useState<string>(''); // Chuỗi ký tự để vẽ mã QR lên màn hình máy tính
  const [paymentOrderId, setPaymentOrderId] = useState<string>(''); // Mã đơn hàng để đối soát với Backend
  const [paymentConfirmed, setPaymentConfirmed] = useState(false); // Cờ báo hiệu đã nhận tiền thành công
  const [isVerifying, setIsVerifying] = useState(false); // Trạng thái Đang ép kiểm tra giao dịch (Loading)
  const [verifyCooldown, setVerifyCooldown] = useState(0); // Đếm ngược thời gian chống spam nút Check Transaction

  /**
   * Nhóm 4: Trạng thái Hết hạn Hóa đơn (Pricing Expiry)
   */
  const [expiresAt, setExpiresAt] = useState<number | null>(null); // Mốc thời gian tuyệt đối (Epoch) mà hóa đơn sẽ hết hạn
  const [countdown, setCountdown] = useState<number>(0); // Số giây đếm ngược hiển thị trên màn hình
  const [isExpired, setIsExpired] = useState<boolean>(false); // Cờ báo Hóa đơn đã hết hạn, cần làm mới (Refresh Price)

  const handleRefreshPriceRef = useRef<(() => Promise<void>) | null>(null);

  /**
   * ============================================================================
   * [BỘ ĐẾM NGƯỢC THỜI GIAN] - COUNTDOWN TIMER
   * ============================================================================
   * Mỗi khi có một Hóa đơn được tạo (biến expiresAt có giá trị), bộ đếm này sẽ chạy.
   * Cứ mỗi 1 giây (1000ms), nó trừ lùi thời gian còn lại.
   * Nếu thời gian về 0, nó báo cờ `isExpired` và tự động gọi hàm Refresh Hóa Đơn mới.
   */
  useEffect(() => {
    if (!expiresAt) {
      setCountdown(0);
      setIsExpired(false);
      return;
    }
    const timer = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setCountdown(remaining);
      setIsExpired(remaining <= 0);
      if (remaining <= 0 && handleRefreshPriceRef.current) {
        clearInterval(timer);
        handleRefreshPriceRef.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const shiftStatus = useAuthStore((state) => state.shiftStatus);

  /**
   * ============================================================================
   * [TRẠM THU SÓNG WEBSOCKET] - Lắng nghe các biến động từ IoT và Thanh toán
   * ============================================================================
   * MỤC ĐÍCH: Hứng dữ liệu tức thời mà không cần reload trang.
   * 
   * MÃ GIẢ (PSEUDO-CODE LÕI):
   * B1: Đăng ký 3 kênh vệ tinh:
   *     - Kênh 1 (`notifDest`): Nghe báo động có khách đặt chỗ sắp ra.
   *     - Kênh 2 (`outDest`): Hứng tín hiệu "Đã thanh toán MoMo thành công" từ Backend -> Auto Mở Cổng.
   *     - Kênh 3 (`destination`): Nghe tín hiệu Camera IoT báo có xe vừa quẹt thẻ ra.
   * 
   * B2: Khi Camera IoT báo có xe (Kênh 3 nổ):
   *     - Chặn cửa: Nếu đang xử lý dở xe trước (`isProcessingRef`), thì bỏ qua tin nhắn mới.
   *     - Gọi Thu Ngân: Bắn API GET `/operation/gates/checkout-session-info` về Backend.
   *     - Hiển thị: Lấy Bảng giá (Hóa đơn) Backend trả về, nhồi vào state `scanData` để bung lên màn hình.
   * ============================================================================
   */
  useEffect(() => {
    if (activeGate && stompClient && connected) {
      // Kênh 1: Hứng tín hiệu xe lướt qua Camera / Quẹt thẻ RFID tại cổng này
      const destination = `/topic/gates/${activeGate.id}/scans`;

      // Kênh 2: Hứng tín hiệu cổng tự mở (Ví dụ: Thanh toán MoMo thành công, Server tự ra lệnh mở Barie)
      const outDest = `/topic/gates/${activeGate.id}/out`;

      // Kênh 3: Hứng tín hiệu cảnh báo (Ví dụ: Có xe đặt trước chuẩn bị tới tầng này)
      const notifDest = `/topic/floors/${activeGate.floorId}/notifications`;

      addLog(`Subscribed to ${destination}, ${outDest} and ${notifDest}`);

      /**
       * [NOTIF SUB]: Lắng nghe cảnh báo
       * Nếu có xe VIP đặt trước (Pre-booked) sắp rẽ vào hầm, hệ thống sẽ 
       * thả một thông báo nổi (Antd Notification) ở góc phải màn hình 
       * trong 10 giây để nhân viên chú ý đón khách.
       */
      const notifSub = stompClient.subscribe(notifDest, (msg) => {
        const payload = JSON.parse(msg.body);
        import('antd').then(({ notification }) => {
          notification.info({
            message: 'Upcoming Reservation',
            description: payload.message,
            duration: 10,
          });
        });
      });

      /**
       * [OUT SUB]: Tự động mở Barie khi thanh toán số hoàn tất
       * Webhook MoMo trả về Backend -> Backend xác nhận tiền đã vào tài khoản 
       * -> Backend bắn chữ "SUCCESS" lên kênh `outDest`.
       * 
       * Ngay khi nhận chữ SUCCESS, nếu màn hình đang hiển thị hóa đơn (`isProcessingRef.current === true`),
       * Frontend tự động đập vỡ hóa đơn, dọn dẹp biến, báo Barie mở và trả màn hình về trạng thái chờ xe mới.
       */
      const outSub = stompClient.subscribe(outDest, (msg) => {
        const payload = JSON.parse(msg.body);
        if (payload.status === 'SUCCESS' && isProcessingRef.current) {
          message.success(`Checkout successful! Barrier opened!`);

          // Dọn dẹp phiên giao dịch
          setScanData(null);
          setEditablePlate('');
          setPaymentMethod('CASH');
          setPaymentConfirmed(false);
          setPaymentUrl(null);
          setPaymentQrCode('');
          setPaymentOrderId('');
          setTimeout(() => {
            isProcessingRef.current = false;
          }, 5000);
        }
      });

      /**
       * [SCAN SUB]: Tim mạch của Trạm Thu Phí
       * Hứng payload từ Camera IoT (bao gồm: Biển số, Hình ẢNH, Thẻ từ).
       * Ngay khi nhận được, lập tức gửi lệnh triệu hồi API `checkout-session-info` 
       * để Backend in Hóa đơn mang lên hiển thị cho khách xem.
       */
      const subscription = stompClient.subscribe(destination, (msg) => {
        if (isProcessingRef.current) {
          addLog("Close stream band: Ignore new signal due to pending processing of current vehicle");
          return;
        }
        isProcessingRef.current = true;

        addLog(`Received message. Length: ${msg.body.length} bytes`);

        const payload = JSON.parse(msg.body);
        if (payload.actionType === 'IN') {
          isProcessingRef.current = false;
          return;
        }
        setLastRawPayload(payload);

        // IOT payload contains plateNumber, imageBase64, confidence
        // For UI purposes, we'll map it to our UI state shape
        setEditablePlate(payload.plateNumber || 'UNKNOWN');

        /**
         * [TRIỆU HỒI HÓA ĐƠN TỪ BACKEND]
         * Khi nhận được tín hiệu xe ra, Frontend phải hỏi Backend xem:
         * "Chiếc xe này hồi đó vào bằng cổng nào, lúc mấy giờ, gửi loại xe gì, tổng tiền là bao nhiêu?".
         * API `/operation/gates/checkout-session-info` sẽ đóng vai trò như một cỗ máy tính tiền,
         * gom tất cả thông tin lại và trả về 1 Hóa Đơn (session-info) chi tiết nhất.
         */
        axiosClient.get('/operation/gates/checkout-session-info', {
          params: { rfid: payload.rfid, plate: payload.plateNumber }
        }).then(res => {
          const info = res.data.data;
          setScanData({
            plateNumber: payload.plateNumber,
            imageBase64: payload.imageBase64 || '',
            lprImageBase64: payload.lprImageBase64 || '',
            imageInBase64: info.picInPanorama || '/placeholder_in_cam.png',
            imageOutBase64: payload.imageBase64 || '/placeholder_out_cam.png',
            lprImageInBase64: info.picInFace || '/placeholder_in_lpr.png',
            lprImageOutBase64: payload.lprImageBase64 || '/placeholder_out_lpr.png',
            plateNumberIn: info.plateNumberIn || payload.plateNumber || 'UNKNOWN',
            timeIn: info.timeIn ? simulatedDayjs(info.timeIn).format('DD/MM/YYYY HH:mm:ss') : '--:--',
            timeOut: info.timeOut ? simulatedDayjs(info.timeOut).format('DD/MM/YYYY HH:mm:ss') : simulatedDayjs().format('DD/MM/YYYY HH:mm:ss'),
            duration: info.durationMinutes ? `${info.durationMinutes} minutes` : '--',
            feeBase: info.expectedFee || 0,
            feePenalty: info.feePenalty || 0,
            discount: info.discountFee || 0,
            overtimeFee: info.overtimeFee || 0,
            expectedFee: info.expectedFee || 0,
            parkingFee: (info.expectedFee || 0) + (info.overtimeFee || 0),
            durationMinutes: info.durationMinutes || 0,
            isBlacklisted: false,
            warnings: info.warnings || [],
            rfid: payload.rfid || 'N/A',
            cardId: payload.cardId || payload.rfid || 'N/A',
            customerType: info.customerType || 'Haunt',
            vehicleType: info.vehicleType || 'UNKNOWN',
            routing: info.suggestedZoneName || '',
            bookedTimeIn: info.bookedTimeIn ? simulatedDayjs(info.bookedTimeIn).format('DD/MM/YYYY HH:mm:ss') : null,
            bookedTimeOut: info.bookedTimeOut ? simulatedDayjs(info.bookedTimeOut).format('DD/MM/YYYY HH:mm:ss') : null,
            overtimeMinutes: info.overtimeMinutes || 0,
            status: info.status || 'ACTIVE',
            checkoutToken: info.checkoutToken || null,
            expiresInSeconds: info.expiresInSeconds || 0
          });
          if (info.expiresInSeconds && info.checkoutToken) {
            setExpiresAt(Date.now() + info.expiresInSeconds * 1000);
          } else {
            setExpiresAt(null);
          }
        }).catch(err => {
          message.warning(err.response?.data?.message || 'No corresponding input vehicle data found!');
          setScanData({
            plateNumber: payload.plateNumber,
            imageBase64: payload.imageBase64 || '',
            lprImageBase64: payload.lprImageBase64 || '',
            imageInBase64: '/placeholder_in_cam.png',
            imageOutBase64: payload.imageBase64 || '/placeholder_out_cam.png',
            lprImageInBase64: '/placeholder_in_lpr.png',
            lprImageOutBase64: payload.lprImageBase64 || '/placeholder_out_lpr.png',
            plateNumberIn: 'UNKNOWN',
            timeIn: '--:--',
            timeOut: simulatedDayjs().format('DD/MM/YYYY HH:mm:ss'),
            duration: '--',
            feeBase: 0,
            feePenalty: 0,
            discount: 0,
            overtimeFee: 0,
            expectedFee: 0,
            parkingFee: 0,
            durationMinutes: 0,
            isBlacklisted: false,
            warnings: ['No vehicle information found'],
            rfid: payload.rfid || '---',
            cardId: payload.cardId || payload.rfid || '---',
            customerType: payload.customerType === 'PREBOOKED' ? 'BOOK' : (payload.customerType === 'MONTHLY' ? 'Monthly Pass' : (payload.customerType || 'Haunt')),
            vehicleType: payload.vehicleType || 'CAR',
            routing: '',
            status: 'UNKNOWN'
          });
        });
      });

      return () => {
        notifSub.unsubscribe();
        outSub.unsubscribe();
        subscription.unsubscribe();
        addLog(`Unsubscribed from ${destination}, ${outDest} and ${notifDest}`);
      };
    }
  }, [activeGate, stompClient, connected]);

  /**
   * ============================================================================
   * [HỦY BỎ GIAO DỊCH] - NÚT CANCEL
   * ============================================================================
   * MỤC ĐÍCH: Hủy bỏ tiến trình thanh toán hiện tại, xóa toàn bộ màn hình để đón xe tiếp theo.
   * 
   * THỰC THI:
   * 1. Nhả cờ `isProcessingRef.current = false` để mở lại "vòi nước", cho phép đón tín hiệu IoT mới.
   * 2. Xóa trắng dữ liệu Hóa đơn (`setScanData(null)`).
   * 3. Xóa trắng các dữ liệu thanh toán số đang gen dở (QR Code, URL...).
   * ============================================================================
   */
  const handleCancel = () => {
    isProcessingRef.current = false;
    setScanData(null);
    setEditablePlate('');
    setPaymentMethod('CASH');
    setPaymentConfirmed(false);
    setPaymentUrl(null);
    setPaymentQrCode('');
    setPaymentOrderId('');
    message.warning('The current scanning session has been canceled. System is ready.');
  };

  /**
   * ============================================================================
   * [XỬ LÝ NGOẠI LỆ] - CHO PHÉP CHECK-IN TẠI CỔNG RA (IN_OUT GATE)
   * ============================================================================
   * MỤC ĐÍCH: Nếu loại cổng là `IN_OUT` (Cổng 2 chiều), hệ thống có thể tái sử dụng 
   * giao diện này để ép check-in thủ công nếu hệ thống không bắt được xe lúc vào.
   * Đây là một tính năng Fallback an toàn dành cho cổng đa năng.
   * ============================================================================
   */
  const handleCheckIn = async () => {
    if (!scanData || !activeGate) return;
    setIsLoading(true);
    try {
      const payload = {
        gateId: activeGate.id,
        plateNumber: editablePlate,
        vehicleType: scanData.vehicleType || 'CAR',
        rfid: scanData.rfid,
        imageBase64: scanData.imageBase64,
        lprImageBase64: scanData.lprImageBase64
      };
      const response = await axiosClient.post('/operation/gates/check-in', payload);

      const suggestedZone = response.data.data.suggestedZoneName || 'Free';
      message.success(`Vehicle entry confirmed! Suggested zone: ${suggestedZone}`);
      setScanData(null);
      setEditablePlate('');
      isProcessingRef.current = false;
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Error checking in vehicle.');
      isProcessingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };


  /**
   * ============================================================================
   * [XÁC NHẬN TIỀN MẶT THỦ CÔNG]
   * ============================================================================
   * Bật cờ `paymentConfirmed`. Sẽ kích hoạt useEffect bên dưới tự động chạy `handleCompletePaymentAndOpen`
   * nếu phương thức đang chọn là CASH.
   * ============================================================================
   */
  const handleManualPaymentConfirm = () => {
    setPaymentConfirmed(true);
    message.success('Payment recorded successfully!');
  };

  /**
   * ============================================================================
   * [CỖ MÁY CHỐT HẠ TIỀN MẶT] - Gửi lệnh trừ tiền và mở Barie
   * ============================================================================
   * MỤC ĐÍCH: Xử lý quy trình thanh toán thủ công (CASH) và giải phóng chỗ đỗ.
   * 
   * MÃ GIẢ (PSEUDO-CODE LÕI):
   * B1: Gói ghém dữ liệu: Lấy `checkoutToken` (Thẻ bài hóa đơn) đang hiện trên màn hình 
   *     cùng với thông tin thanh toán (Tiền mặt).
   * B2: Bắn API POST: Gửi cục dữ liệu về Backend `/operation/gates/checkout` (Tới GateConsoleController).
   * B3: Nhận gật đầu (Success 200): Xóa trắng màn hình, reset State, sẵn sàng đón xe tiếp theo.
   * B4: Nhận báo lỗi (Fail 400): Đập Alert báo lỗi (Ví dụ: Thanh toán thiếu tiền, hoặc AI đọc sai biển số).
   * ============================================================================
   */
  const handleCompletePaymentAndOpen = async () => {
    if (!scanData || !activeGate) return;
    setIsLoading(true);
    try {
      const payload = {
        gateId: activeGate.id,
        plateNumber: editablePlate,
        rfid: scanData.rfid,
        imageBase64: scanData.imageOutBase64,
        lprImageBase64: scanData.lprImageOutBase64,
        paymentMethod: paymentMethod,
        parkingFee: scanData.parkingFee || 0,
        checkoutToken: scanData.checkoutToken
      };
      const response = await axiosClient.post('/operation/gates/check-out', payload);

      message.success(`Barrier opened for exit! Payment fee: ${(response.data.data.checkoutFee || 0).toLocaleString()} ₫`);

      // Auto-log LPR_MISMATCH if the staff edited the plate
      if (scanData.plateNumber && editablePlate && scanData.plateNumber.toUpperCase() !== editablePlate.toUpperCase()) {
        try {
          await axiosClient.post('/incident/incidents', {
            issueType: 'LPR_MISMATCH',
            sessionId: scanData.sessionId || response.data.data.sessionId,
            description: `[AUTO] License plate mismatch on EXIT. AI recognized: ${scanData.plateNumber}. Staff edited to: ${editablePlate}.`,
            correctPlateNumber: editablePlate,
            priority: 'LOW'
          });
        } catch (e) {
          console.error("Error automatically creating LPR_MISMATCH incident:", e);
        }
      }

      setScanData(null);
      setEditablePlate('');
      setPaymentMethod('CASH');
      setPaymentConfirmed(false);
      setPaymentUrl(null);
      setPaymentQrCode('');
      setPaymentOrderId('');
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 5000);
    } catch (error: any) {
      const errMsg = error.response?.data?.message || 'Error checking out vehicle.';
      if (errMsg.includes('Quote has expired') || errMsg.includes('refresh the page')) {
        message.warning({
          content: 'The price has been refreshed. Please review and confirm the accurate collection amount.',
          duration: 8 // Show for 8 seconds
        });
        if (handleRefreshPriceRef.current) {
          await handleRefreshPriceRef.current();
        }
      } else {
        message.error(errMsg);
      }
      isProcessingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };



  /**
   * ============================================================================
   * [AUTO-GENERATE QR] - KHỞI TẠO THANH TOÁN SỐ (PAYOS / PAYPAL)
   * ============================================================================
   * MỤC ĐÍCH: Tự động xin mã QR thanh toán ngay khi nhân viên chuyển Tab từ Tiền mặt sang QR.
   * 
   * CƠ CHẾ HOẠT ĐỘNG:
   * B1: Lắng nghe sự thay đổi của biến `paymentMethod`. Nếu nhân viên click chọn 'PAYOS' hoặc 'PAYPAL'.
   * B2: Tự động cộng dồn tất cả các loại phí (FeeBase + Overtime + Penalty - Discount) thành `calculatedTotalFee`.
   * B3: Bắn API POST `/finance/payments/initialize` gọi dịch vụ tạo QR (VietQR qua PayOS hoặc PayPal Link).
   * B4: Lấy Link QR trả về và cắm thẳng vào thẻ `<QRCode>` để hiện hình ảnh mã vạch lên màn hình cho khách quét.
   * ============================================================================
   */
  useEffect(() => {
    if ((paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') && scanData) {
      const calculatedTotalFee = Math.max(0,
        (scanData.expectedFee || scanData.feeBase || 0) +
        (scanData.overtimeFee || 0) +
        (scanData.feePenalty || 0) -
        (scanData.discount || scanData.discountFee || 0)
      );
      const amount = calculatedTotalFee;
      if (amount > 0) {
        setIsLoading(true);
        const payload = {
          gateId: activeGate?.id,
          plateNumber: editablePlate,
          rfid: scanData.rfid,
          imageBase64: scanData.imageOutBase64,
          lprImageBase64: scanData.lprImageOutBase64,
          paymentMethod: paymentMethod,
          parkingFee: amount,
          sessionId: scanData.sessionId,
          checkoutToken: scanData.checkoutToken
        };
        axiosClient.post('/finance/payments/initialize', {
          actionType: 'CHECKOUT',
          gateway: paymentMethod,
          amount: amount,
          checkoutToken: scanData.checkoutToken,
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
            console.error("Payment initialization error:", err);
            const errMsg = err.response?.data?.message || err.message || `Unable to generate ${paymentMethod} QR code`;
            message.error(errMsg);
            setPaymentMethod('CASH');
          })
          .finally(() => setIsLoading(false));
      } else {
        setPaymentConfirmed(true);
      }
    } else {
      setPaymentUrl(null);
      setPaymentQrCode('');
      setPaymentOrderId('');
    }
  }, [paymentMethod, scanData]);

  /**
   * ============================================================================
   * [NÚT LÀM MỚI BÁO GIÁ] - Chống gian lận thời gian đỗ xe
   * ============================================================================
   * MỤC ĐÍCH: Dành cho trường hợp khách chần chừ cãi nhau ở cổng quá lâu, 
   * khiến Hóa đơn cũ bị hết hạn (Ví dụ: Đỗ lố sang block giờ tiếp theo, phí từ 10.000đ nhảy lên 20.000đ).
   * 
   * MÃ GIẢ (PSEUDO-CODE LÕI):
   * B1: Bắn lại API `/operation/gates/checkout-session-info` y hệt như lúc xe mới ra.
   * B2: Lấy Bảng giá mới cập nhật đè lên Hóa đơn cũ (`setScanData`).
   * B3: Reset lại đồng hồ đếm ngược (Ví dụ: Cho khách thêm 5 phút nữa để quét mã MoMo).
   * ============================================================================
   */
  const handleRefreshPrice = useCallback(async () => {
    if (!scanData?.rfid && !scanData?.plateNumber) return;
    setIsLoading(true);
    try {
      const res = await axiosClient.get('/operation/gates/checkout-session-info', {
        params: { rfid: scanData?.rfid, plate: scanData?.plateNumber }
      });
      const info = res.data.data;
      setScanData((prev: any) => ({
        ...prev,
        feeBase: info.expectedFee || 0,
        feePenalty: info.feePenalty || 0,
        discount: info.discountFee || 0,
        overtimeFee: info.overtimeFee || 0,
        expectedFee: info.expectedFee || 0,
        parkingFee: (info.expectedFee || 0) + (info.overtimeFee || 0),
        checkoutToken: info.checkoutToken || null,
        expiresInSeconds: info.expiresInSeconds || 0,
        overtimeMinutes: info.overtimeMinutes || 0,
        durationMinutes: info.durationMinutes || 0,
        duration: info.durationMinutes ? `${info.durationMinutes} minutes` : '--',
        warnings: info.warnings || prev.warnings || []
      }));
      if (info.expiresInSeconds && info.checkoutToken) {
        setExpiresAt(Date.now() + info.expiresInSeconds * 1000);
      } else {
        setExpiresAt(null);
      }
      message.success("Price has been refreshed!");
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Failed to refresh price');
    } finally {
      setIsLoading(false);
    }
  }, [scanData?.rfid, scanData?.plateNumber]);

  useEffect(() => {
    handleRefreshPriceRef.current = handleRefreshPrice;
  }, [handleRefreshPrice]);

  // Poll for payment status
  // Polling has been removed in favor of WebSocket listener (outDest) above.

  // Polling for cooldown
  useEffect(() => {
    let timer: any;
    if (verifyCooldown > 0) {
      timer = setTimeout(() => setVerifyCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [verifyCooldown]);

  /**
   * ============================================================================
   * [TỰ KIỂM TRA GIAO DỊCH] - MANUAL VERIFY CỨNG TỪ BÊN THỨ 3
   * ============================================================================
   * MỤC ĐÍCH: Giải cứu trong trường hợp "Khách đã trừ tiền, tài khoản báo trừ, 
   * nhưng Cổng không chịu mở" (Do rớt mạng, mất webhook, nghẽn cổng thanh toán...).
   * 
   * CƠ CHẾ HOẠT ĐỘNG (Nút Check Transaction):
   * B1: Nắm đầu mã đơn hàng (`paymentOrderId`) gửi thẳng sang PayOS/PayPal bằng API `.../capture` để hỏi: "Đơn này nó thanh toán thật chưa?".
   * B2: Nếu PayOS xác nhận "COMPLETED" (Đã trả tiền), gọi tiếp API `/finance/payments/execute-action`.
   * B3: Backend sẽ ghi nhận Giao dịch thành công, lưu DB và tự tay mở Barie y như lúc Webhook báo về.
   * ============================================================================
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
              message.success(`Payment via ${paymentMethod} verified and successful!`);
              setScanData(null);
              setEditablePlate('');
              setPaymentMethod('CASH');
              setPaymentConfirmed(false);
              setPaymentUrl(null);
              setPaymentQrCode('');
              setPaymentOrderId('');
              isProcessingRef.current = false;
            })
            .catch(execErr => {
              message.error(execErr.response?.data?.message || 'System failed to checkout. Refund queued.');
              setPaymentConfirmed(true);
            });
        } else {
          message.warning('Payment not yet completed on the gateway.');
        }
      })
      .catch(err => {
        if (err.response?.status === 400) {
          message.warning('Payment not yet received. Please try again later.');
        } else {
          message.error('System is busy or unable to verify.');
        }
      })
      .finally(() => {
        setIsVerifying(false);
        setVerifyCooldown(10);
      });
  };

  /**
   * ============================================================================
   * [AUTO TÍNH TIỀN MẶT]
   * ============================================================================
   * Khi nhân viên bấm nút Xác nhận Đã Thu Tiền (paymentConfirmed = true) và phương thức là Tiền Mặt (CASH),
   * đoạn mã này sẽ tự động gọi hàm `handleCompletePaymentAndOpen` để báo Backend chốt hóa đơn.
   * ============================================================================
   */
  useEffect(() => {
    if (paymentConfirmed && paymentMethod === 'CASH' && scanData && activeGate) {
      handleCompletePaymentAndOpen();
    }
  }, [paymentConfirmed]);

  /**
   * ============================================================================
   * [GIAO DIỆN CHÍNH CỦA CỔNG RA - RENDER OUT GATE PANEL]
   * ============================================================================
   * Bao gồm 3 phần chính (layout 3 cột / 2 cột):
   * 1. LEFT SIDE (Camera 4 chiều): Hiển thị ảnh chụp lúc xe VÀO (trái) và lúc xe RA (phải) để nhân viên đối chiếu.
   * 2. RIGHT SIDE (Hóa đơn - Fee Breakdown): Tờ hóa đơn chi tiết tính toán từng đồng (Cơ bản + Phạt - Khuyến mãi = Tổng).
   * 3. RIGHT SIDE (Thanh toán - Payment Gate): Chỗ quét QR, nút chốt tiền mặt.
   * ============================================================================
   */
  const renderOutGatePanel = () => {
    const totalFee = Math.max(0,
      (scanData?.expectedFee || scanData?.feeBase || 0) +
      (scanData?.overtimeFee || 0) +
      (scanData?.feePenalty || 0) -
      (scanData?.discount || scanData?.discountFee || 0)
    );
    const duration = scanData?.durationMinutes || 0;
    const isInvalidEntry = scanData?.plateNumberIn === 'UNKNOWN' || scanData?.timeIn === '--:--';
    const isPlateMismatch = !isInvalidEntry && !!scanData?.plateNumberIn && (editablePlate.trim().toUpperCase() !== scanData.plateNumberIn.trim().toUpperCase());












    // 
    return (
      <div className="flex h-full overflow-hidden w-full bg-slate-100 rounded-xl shadow-inner gap-4">
        {/* 
         * ============================================================================
         * [CỘT TRÁI - 45%] KHU VỰC CAMERA ĐỐI CHIẾU
         * Hiển thị ảnh chụp từ Camera IoT. Chia làm 2 cột nhỏ:
         * - Cột 1: Ảnh chụp lúc xe VÀO (Ảnh toàn cảnh + Ảnh cắt góc biển số).
         * - Cột 2: Ảnh chụp lúc xe RA (Ảnh toàn cảnh + Ảnh cắt góc biển số).
         * Mục đích: Giúp nhân viên thu ngân đối chiếu bằng mắt xem 2 xe có phải là một không.
         * ============================================================================
         */}
        <div className="w-[45%] flex-none p-2 flex gap-2 bg-slate-900 border-4 border-slate-800 rounded-xl overflow-hidden shadow-lg">
          {!scanData ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900">
              <AimOutlined className="text-6xl mb-4 opacity-30 animate-spin" style={{ animationDuration: '3s' }} />
              <Text className="text-slate-400 font-bold tracking-widest text-lg">WAITING FOR THE CAR SIGNAL OUT...</Text>
            </div>
          ) : (
            <>
              {/* IN Column */}
              <div className="flex-1 flex flex-col gap-2 border-r-2 border-slate-700 pr-2">
                <div className="text-xs font-bold text-green-400 text-center uppercase tracking-widest bg-slate-800 py-1 rounded">Photo of Vehicle Entering</div>
                <div className="flex-1 relative bg-black rounded overflow-hidden border border-slate-700"><img src={getImageUrl(scanData.imageInBase64)} alt="IN Pan" className="w-full h-full object-contain absolute" /></div>
                <div className="h-[25%] relative bg-white rounded flex items-center justify-center border border-slate-700"><img src={getImageUrl(scanData.lprImageInBase64)} alt="IN LPR" className="max-w-full max-h-full object-contain" /></div>
              </div>
              {/* OUT Column */}
              <div className="flex-1 flex flex-col gap-2 pl-2">
                <div className="text-xs font-bold text-blue-400 text-center uppercase tracking-widest bg-slate-800 py-1 rounded">OUT Vehicle Photo</div>
                <div className="flex-1 relative bg-black rounded overflow-hidden border border-slate-700"><img src={getImageUrl(scanData.imageOutBase64)} alt="OUT Pan" className="w-full h-full object-contain absolute" /></div>
                <div className="h-[25%] relative bg-white rounded flex items-center justify-center border border-slate-700"><img src={getImageUrl(scanData.lprImageOutBase64)} alt="OUT LPR" className="max-w-full max-h-full object-contain" /></div>
              </div>
            </>
          )}
        </div>

        {/* 
         * ============================================================================
         * [CỘT PHẢI - 55%] KHU VỰC NGHIỆP VỤ (THÔNG TIN - HÓA ĐƠN - THANH TOÁN)
         * Nơi hiển thị tất cả các con số, lịch sử, bảng tính tiền và cụm nút tương tác mở cổng.
         * ============================================================================
         */}
        <div className="w-[55%] flex flex-col h-full bg-slate-50 border border-slate-300 rounded-xl overflow-hidden shadow-sm relative">

          {/* 
           * --- PHẦN KHUNG CUỘN ĐƯỢC (SCROLLABLE BỘ THÔNG TIN BÊN TRONG) --- 
           * Chia làm 2 nửa trái phải để tối ưu diện tích hiển thị.
           */}
          <div className="flex-1 p-2 flex flex-col xl:flex-row gap-4 overflow-y-auto custom-scrollbar">
            {scanData ? (
              <>
                {/* NỬA TRÁI CỦA CỘT PHẢI: Chứa Thông tin Thẻ (RFID), Loại Xe, Lịch sử vào/ra, Cảnh báo và Sửa biển số */}
                <div className="w-full xl:w-1/2 flex flex-col gap-2">

                  {/* Identity & Slot */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-between items-center flex-none">
                    <div className="flex items-center space-x-2">
                      <IdcardOutlined className="text-2xl text-blue-600" />
                      <Text className="text-xl font-bold text-slate-700 font-mono tracking-wider">{scanData.cardId || scanData.rfid}</Text>
                    </div>
                    <div className="flex items-center space-x-2">
                      {scanData.routing && <Tag color="purple" className="m-0 font-bold px-3 py-1 text-sm rounded">{scanData.routing}</Tag>}
                      <Tag color="cyan" className="m-0 font-bold px-3 py-1 text-sm rounded shadow-sm border border-transparent flex items-center">
                        {(() => {
                          const vt = vehicleTypes?.find((v: any) => v.typeName === scanData.vehicleType);
                          if (vt && vt.iconUrl) {
                            return <img src={getImageUrl(vt.iconUrl)} style={{ width: 16, height: 16, marginRight: 6, objectFit: 'contain' }} />;
                          }
                          return null;
                        })()}
                        {scanData.vehicleType}
                      </Tag>
                      <Tag color={scanData.customerType === 'Haunt' ? 'blue' : (scanData.customerType === 'BOOK' ? 'gold' : 'green')} className="m-0 font-bold px-3 py-1 text-sm rounded shadow-sm border border-transparent">
                        {scanData.customerType}
                      </Tag>
                    </div>
                  </div>

                  {/* Warnings Section */}
                  <div className={`p-2 rounded-lg shadow-sm flex-none flex flex-col gap-1 border overflow-hidden ${scanData.warnings?.length > 0 || scanData.customerType === 'BOOK' || scanData.customerType === 'PREBOOKED' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-green-50 border-green-300 text-green-700'}`}>
                    <div className="font-bold flex items-center justify-between text-xs">
                      <div className="flex items-center">
                        {scanData.warnings?.length > 0 || scanData.customerType === 'BOOK' || scanData.customerType === 'PREBOOKED' ? <WarningOutlined className="mr-1 text-sm" /> : <CheckCircleOutlined className="mr-1 text-sm" />}

                        WARNING / NOTE:
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto max-h-[80px] min-h-[30px] text-xs custom-scrollbar">
                      {(scanData.customerType === 'BOOK' || scanData.customerType === 'PREBOOKED') && (
                        <div className="mb-1 font-medium">
                          <strong>Guests who book in advance:</strong><br />

                          • Estimated arrival time: {scanData.bookedTimeIn}<br />

                          • Estimated departure time: {scanData.bookedTimeOut}
                        </div>
                      )}
                      {scanData.warnings?.length > 0 ? (
                        <ul className="list-disc pl-6 m-0">
                          {(scanData.warnings || []).map((w: string, idx: number) => <li key={idx} className="font-medium" title={w}>{w}</li>)}
                        </ul>
                      ) : (
                        scanData.customerType !== 'BOOK' && scanData.customerType !== 'PREBOOKED' && <span className="text-green-600 font-medium">The car does not have any fines or warnings</span>
                      )}
                    </div>
                  </div>

                  {/* Time Tracker */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-between items-center flex-none mt-2">
                    <div className="text-center"><Text type="secondary" className="block text-xs uppercase font-bold tracking-widest">Time to Enter</Text><Text strong className="text-base">{scanData.timeIn}</Text></div>
                    <div className="text-center text-blue-600"><ClockCircleOutlined className="text-2xl" /><Text strong className="block text-xs uppercase mt-1">{scanData.duration}</Text></div>
                    <div className="text-center"><Text type="secondary" className="block text-xs uppercase font-bold tracking-widest">Out time</Text><Text strong className="text-base">{scanData.timeOut}</Text></div>
                  </div>

                  {/* Plate Comparison */}
                  <div className="flex flex-col gap-2 flex-1 min-h-0 mt-2">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex flex-col items-center justify-center flex-1">
                      <Text className="text-green-700 font-bold mb-1 uppercase tracking-widest text-[10px]">License Plate IN</Text>
                      <Input
                        value={scanData.plateNumberIn}
                        disabled
                        className="w-full text-2xl h-10 font-mono text-center font-bold uppercase rounded border-green-300 bg-green-100 text-green-800"
                      />
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex flex-col items-center justify-center shadow-inner flex-1">
                      <Text className="text-blue-700 font-bold mb-1 uppercase tracking-widest text-[10px]">License Plate OUT (Edit if wrong)</Text>
                      <Input
                        value={editablePlate}
                        onChange={(e) => setEditablePlate(normalizePlateNumber(e.target.value))}
                        className="w-full text-2xl h-10 font-mono text-center font-bold uppercase rounded border-2 border-blue-400 focus:border-blue-600 bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Plate Mismatch Warning */}
                  {scanData.plateNumberIn && scanData.plateNumberIn !== 'UNKNOWN' && editablePlate && scanData.plateNumberIn.toUpperCase() !== editablePlate.toUpperCase() && (
                    <div className="mt-2 bg-red-100 border-2 border-red-500 text-red-700 px-3 py-2 rounded-lg flex items-center justify-center font-bold text-sm animate-pulse shadow-sm">
                      <WarningOutlined className="mr-2 text-lg" />

                      WARNING: The Outgoing License Plate DOES NOT MATCH THE IN!
                    </div>
                  )}
                </div>

                {/* NỬA PHẢI CỦA CỘT PHẢI: Bảng Kê Chi Phí (Fee Breakdown) và Giao Diện Chọn Cổng Thanh Toán (Radio / QR) */}
                <div className="w-full xl:w-1/2 flex flex-col bg-slate-800 border border-slate-700 rounded-xl shadow-lg text-white p-4 relative overflow-hidden">

                  {/* EXPIRATION OVERLAY */}
                  {isExpired && scanData && (
                    <div className="absolute inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
                      <ClockCircleOutlined className="text-5xl text-red-500 mb-4 animate-pulse" />
                      <Title level={3} className="!text-red-400 !m-0">Price Quote Expired</Title>
                      <Text className="text-slate-300 mt-2 mb-6 block">The 5-minute price hold has ended. Please refresh to update to the latest price.</Text>
                      <Button type="primary" size="large" danger className="w-full max-w-xs font-bold uppercase tracking-widest h-12" onClick={handleRefreshPrice} loading={isLoading}>
                        Refresh Price
                      </Button>
                    </div>
                  )}



                  {/* LOCKED SESSION BANNER */}
                  {scanData?.status === 'LOCKED' && (
                    <div className="mb-3 bg-red-600/20 border-2 border-red-500 rounded-xl p-3 flex items-center gap-3 animate-pulse">
                      <span className="text-2xl">🔒</span>
                      <div>
                        <div className="text-red-400 font-bold text-sm uppercase tracking-widest">VEHICLE IS LOCKED DUE TO Incident</div>
                        <div className="text-red-300 text-xs mt-0.5">Staff need to resolve the ticket at the Resolve Incident screen (Phase 2) before opening the gate!</div>
                      </div>
                    </div>
                  )}
                  <div className="mb-4">
                    <FeeBreakdown
                      durationMinutes={duration}
                      customerType={scanData.customerType}
                      expectedFee={scanData.expectedFee || scanData.feeBase || 0}
                      overtimeMinutes={scanData.overtimeMinutes}
                      overtimeFee={scanData.overtimeFee || 0}
                      penaltyFee={scanData.feePenalty || 0}
                      discountFee={scanData.discount || scanData.discountFee || 0}
                      totalFee={totalFee}
                      isPaid={scanData.customerType === 'BOOK' && totalFee === 0}
                      isLightMode={false}
                    />
                    {expiresAt && !isExpired && (
                      <div className="mt-1.5 flex justify-end items-center gap-1.5">
                        <ClockCircleOutlined className={`text-[11px] ${countdown < 60 ? 'text-red-400 animate-pulse' : 'text-slate-400'}`} />
                        <span className={`font-mono text-[11px] font-bold ${countdown < 60 ? 'text-red-400 animate-pulse' : 'text-slate-300'}`}>
                          {Math.floor(countdown / 60).toString().padStart(2, '0')}:{(countdown % 60).toString().padStart(2, '0')}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Payment Radio */}
                  <div className="mt-6">
                    <Radio.Group
                      value={paymentMethod}
                      onChange={(e) => {
                        setPaymentMethod(e.target.value);
                        // Tự động làm mới giá (nếu có thay đổi về phí) khi người dùng đổi hình thức thanh toán
                        if (handleRefreshPriceRef.current) {
                          handleRefreshPriceRef.current();
                        }
                      }}
                      buttonStyle="solid"
                      className="flex w-full bg-slate-700 rounded-lg p-1 border border-slate-600 shadow-inner"
                    >
                      <Radio.Button value="CASH" className={`flex-1 text-center font-bold text-base h-12 leading-[40px] border-0 rounded-l-md ${paymentMethod === 'CASH' ? '!text-slate-800 bg-white shadow-sm' : '!text-slate-300 bg-transparent'}`}>Cash</Radio.Button>
                      <Radio.Button value="PAYPAL" className={`flex-1 text-center font-bold text-base h-12 leading-[40px] border-0 border-l border-slate-600 ${paymentMethod === 'PAYPAL' ? '!text-slate-800 bg-white shadow-sm' : '!text-slate-300 bg-transparent'}`}>PayPal</Radio.Button>
                      <Radio.Button value="PAYOS" className={`flex-1 text-center font-bold text-base h-12 leading-[40px] border-0 border-l border-slate-600 rounded-r-md ${paymentMethod === 'PAYOS' ? '!text-slate-800 bg-white shadow-sm' : '!text-slate-300 bg-transparent'}`}>PayOS QR</Radio.Button>
                    </Radio.Group>
                  </div>

                  {/* QR Code conditionally rendered */}
                  <div className="flex-1 mt-3 relative min-h-[200px]">
                    {(paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-white rounded border border-dashed border-blue-400">
                        {!paymentConfirmed ? (
                          <>
                            {paymentUrl ? (
                              <QRCode value={paymentMethod === 'PAYOS' && paymentQrCode ? paymentQrCode : paymentUrl} size={130} />
                            ) : (
                              <QrcodeOutlined className="text-5xl text-slate-800 mb-1 animate-pulse" />
                            )}
                            <Text type="secondary" className="font-bold text-[9px] uppercase mt-2 text-center">Customer scans {paymentMethod} code</Text>
                            {paymentUrl && paymentMethod !== 'PAYOS' && (
                              <Button
                                type="primary"
                                size="small"
                                className="mt-2 bg-blue-600 w-full font-bold text-xs"
                                onClick={() => window.open(paymentUrl, '_blank')}
                              >
                                Open Payment Link
                              </Button>
                            )}
                            {paymentUrl && (
                              <Button
                                type="link"
                                size="small"
                                onClick={handleManualVerify}
                                loading={isVerifying}
                                disabled={verifyCooldown > 0}
                                className={`mt-1 w-full font-bold text-[10px] ${verifyCooldown > 0 ? 'text-slate-400' : 'text-orange-600'}`}
                              >
                                {verifyCooldown > 0 ? `Please wait ${verifyCooldown}s to verify again` : 'Verify Status'}
                              </Button>
                            )}
                          </>
                        ) : (
                          <div className="bg-green-100 text-green-800 p-2 rounded w-full h-full text-center font-bold flex flex-col items-center justify-center text-xs shadow-inner">
                            <CheckCircleOutlined className="text-2xl mb-1 text-green-600" /> Money collected successfully!
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-700 rounded border border-slate-600 text-slate-400 text-xs font-bold text-center p-4">
                        <DollarOutlined className="text-4xl mb-2 opacity-50" />
                        CASH COLLECTION DIRECTLY
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Text className="font-bold tracking-widest text-lg uppercase text-slate-300">Waiting for data...</Text>
              </div>
            )}
          </div>

          {/* 
           * ============================================================================
           * [THANH CÔNG CỤ CỐ ĐỊNH - 88px] NÚT CHỐT HẠ GIAO DỊCH
           * - Nút Cancel: Hủy bỏ, dọn màn hình.
           * - Nút Action chính: Tự động đổi text & đổi màu dựa vào logic:
           *   + Màu Đỏ (LOCKED): Xe đang dính lỗi, nhân viên phải đi giải quyết vé phạt mới được mở.
           *   + Màu Xám (DISABLED): Chưa thanh toán / Khác biển số.
           *   + Màu Xanh (READY): Đã nhận tiền, chớp chớp giục nhân viên bấm mở.
           * ============================================================================
           */}
          <div className="flex-none h-[88px] px-3 pt-2 pb-3 border-t border-slate-200 bg-white flex gap-3 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] relative z-10">
            <Button
              size="large"
              danger
              icon={<CloseCircleOutlined />}
              className="h-full flex-1 text-lg font-bold rounded-lg border-2 border-red-500 text-red-600 hover:bg-red-50 transition-colors"
              disabled={!scanData}
              onClick={handleCancel}
            >

              Cancel
            </Button>
            <Button
              type="primary"
              size="large"
              className={`h-full flex-[2] text-xl font-bold rounded-lg shadow-lg border-b-4 active:border-b-0 active:translate-y-1 transition-all ${(scanData?.status === 'LOCKED')
                ? 'bg-red-800 border-red-900 cursor-not-allowed opacity-80'
                : isInvalidEntry || isPlateMismatch
                  ? 'bg-slate-600 border-slate-700 cursor-not-allowed opacity-80'
                  : (paymentMethod !== 'CASH' && !paymentConfirmed)
                    ? 'bg-slate-400 border-slate-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-500 border-green-800 animate-pulse'
                }`}
              disabled={(!scanData) || isInvalidEntry || isPlateMismatch || (paymentMethod !== 'CASH' && !paymentConfirmed) || (scanData?.status === 'LOCKED')}
              loading={isLoading}
              onClick={handleCompletePaymentAndOpen}
            >
              {scanData?.status === 'LOCKED' ? '🔒 LOCKED - Resolve Incident first' :
                (isInvalidEntry ? '❌ NO ENTRY RECORD - Use Exception Desk' :
                  (isPlateMismatch ? '❌ PLATE MISMATCH - Use Exception Desk' :
                    (paymentMethod === 'CASH' ? 'Collect money & Open the gate' : 'Confirm & Open the gate')
                  )
                )
              }
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100 relative">
      <Row className="h-full w-full m-0">
        <Col span={24} className="h-full p-4 flex flex-col bg-slate-50">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <Title level={4} className="m-0 text-slate-800">
              {activeGate?.name} <span className="text-xs ml-2 bg-blue-600 text-white px-2 py-1 rounded">OUT GATE LIVE</span>
            </Title>
          </div>
          {renderOutGatePanel()}
        </Col>
      </Row>
    </div>
  );
};
