/**
 * =========================================================================================
 * IMPORT CÁC THƯ VIỆN VÀ COMPONENT CẦN THIẾT
 * =========================================================================================
 * 1. React & Hooks: Quản lý vòng đời và trạng thái nội bộ (useState, useEffect).
 * 2. Store & Fetching: 
 *    - useAuthStore: Lấy trạng thái ca làm việc từ hệ thống quản lý state toàn cục (Zustand).
 *    - useQuery: Thư viện React Query để gọi API và quản lý cache dữ liệu.
 * 3. UI Components (antd): Thư viện Ant Design để vẽ giao diện (Alert báo lỗi, Spin loading...).
 * 4. WebSocket: Hook tự tạo để kết nối realtime (nhận sự kiện quẹt thẻ, nhận diện biển số...).
 * 5. API Client: Cấu hình Axios để gọi các RESTful API của hệ thống.
 * 6. Child Components: Hai giao diện chuyên biệt cho Cổng Vào (GateIn) và Cổng Ra (GateOut).
 */
import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useQuery } from '@tanstack/react-query';
import { Typography, Row, Col, Alert, Spin, Modal } from 'antd';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import axiosClient from '../../core/api/axiosClient';
import { GateInConsoleScreen } from './GateInConsoleScreen';
import { GateOutConsoleScreen } from './GateOutConsoleScreen';

const { Title } = Typography;


/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC COMPONENT CỦA HỆ THỐNG (KÈM MINH CHỨNG CODE)
 * =========================================================================================
 * File này KHÔNG trực tiếp vẽ ra giao diện cổng (Camera, Biển số...), mà nó đóng vai trò 
 * như một "Cảnh sát giao thông" (Router/Wrapper) để kiểm tra giấy tờ và điều hướng.
 * 
 * BƯỚC 1: TRUY VẤN DỮ LIỆU CỐT LÕI (DATA FETCHING)
 * - Dòng 29: Gọi API lấy toàn bộ danh sách các Cổng (Gates) trong bãi xe.
 * - Dòng 45: Gọi API kiểm tra Phiên làm việc (Work Session) hiện tại của nhân viên.
 *   (Mục đích: Chống tình trạng nhân viên chưa bấm "Bắt đầu ca" mà đã đòi thao tác cổng).
 * 
 * BƯỚC 2: ĐỒNG BỘ TRẠNG THÁI CA LÀM VIỆC (SHIFT SYNCHRONIZATION)
 * - Dòng 57 (useEffect): Nếu nhân viên đã mở ca (có sessionData.hasActiveSession), 
 *   hệ thống tự động lưu ID của cổng mà nhân viên đó đang gác vào LocalStorage (sessionStorage).
 * 
 * BƯỚC 3: KIỂM DUYỆT BẢO MẬT (GUARD CLAUSE)
 * - Dòng 94: Nếu nhân viên chưa bắt đầu ca trực (!isShiftActive), hệ thống thẳng tay 
 *   chặn lại và hiển thị màn hình cảnh báo (Alert) màu vàng báo lỗi.
 * 
 * BƯỚC 4: ĐIỀU HƯỚNG GIAO DIỆN CHUYÊN BIỆT (DELEGATION)
 * - Dòng 118: Hệ thống kiểm tra xem cái cổng nhân viên đang đứng gác là Cổng Vào hay Cổng Ra.
 * - Dòng 127: Dựa trên loại cổng, nó gọi Component con tương ứng:
 *   + Cổng Vào: Rẽ nhánh gọi `<GateInConsoleScreen>` (Nơi xử lý AI dẫn đường).
 *   + Cổng Ra: Rẽ nhánh gọi `<GateOutConsoleScreen>` (Nơi xử lý hóa đơn, tính tiền).
 * =========================================================================================
 */
export const GateConsoleScreen = () => {
  // =========================================================================================
  // 1. LẤY DANH SÁCH CỔNG (DATA FETCHING - GATES)
  // =========================================================================================
  // Gọi API để lấy danh sách toàn bộ các cổng trong hệ thống (cổng vào, cổng ra...).
  // Dữ liệu này cần thiết để đối chiếu id cổng hiện tại với thông tin chi tiết của cổng.
  const { data: gatesData, isLoading } = useQuery({
    queryKey: ['gates'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/gates');
      return res.data.data;
    }
  });

  // =========================================================================================
  // 2. QUẢN LÝ TRẠNG THÁI CỤC BỘ VÀ TOÀN CỤC (STATE MANAGEMENT)
  // =========================================================================================
  // isShiftActive: Biến cờ xác định nhân viên đã bắt đầu ca làm việc chưa.
  const [isShiftActive, setIsShiftActive] = useState(false);
  // activeGate: Lưu trữ thông tin chi tiết của cổng mà nhân viên đang trực.
  const [activeGate, setActiveGate] = useState<any>(null);

  // Khởi tạo kết nối WebSocket (có thể dùng cho các component con hoặc nhận sự kiện realtime).
  const { connected, stompClient } = useWebSocket();
  // shiftStatus: Trạng thái ca làm việc từ store toàn cục Zustand.
  const shiftStatus = useAuthStore((state) => state.shiftStatus);
  // setAuthShiftStatus: Hàm cập nhật trạng thái ca làm việc vào store.
  const setAuthShiftStatus = useAuthStore((state) => state.setShiftStatus);


  // =========================================================================================
  // 3. KIỂM TRA CA LÀM VIỆC TỪ SERVER (SESSION VALIDATION)
  // =========================================================================================
  // Gọi API để kiểm tra xem nhân viên hiện tại có đang trong một phiên làm việc (work session) hợp lệ không.
  // Nếu server trả về null hoặc lỗi, nghĩa là nhân viên chưa bắt đầu ca.
  const { data: sessionData, isLoading: isLoadingSession } = useQuery({
    queryKey: ['current-work-session'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/identity/work-sessions/current');
        return res.data?.data;
      } catch (e) {
        return null;
      }
    }
  });

  // =========================================================================================
  // 4. ĐỒNG BỘ HÓA TRẠNG THÁI (EFFECT SYNCHRONIZATION)
  // =========================================================================================
  /**
   * Effect này chạy mỗi khi trạng thái ca (shiftStatus), danh sách cổng (gatesData),
   * hoặc dữ liệu phiên làm việc từ server (sessionData) thay đổi.
   * 
   * Luồng xử lý chính:
   * - Bước 1: Lấy ID cổng lưu trong sessionStorage hoặc lấy từ dữ liệu phiên làm việc (sessionData).
   * - Bước 2: Nếu server xác nhận đang có ca làm việc, lưu/đè các thông tin cổng vào sessionStorage để duy trì.
   * - Bước 3: Nếu server báo ca đang mở nhưng store cục bộ chưa mở, tự động đồng bộ thành 'OPEN'.
   * - Bước 4: Kiểm tra điều kiện đủ (Ca đang mở + Đã có ID cổng + Đã tải xong danh sách cổng):
   *   + Nếu tìm thấy cổng tương ứng: Cập nhật state `activeGate` và cho phép mở giao diện (isShiftActive = true).
   *   + Nếu thiếu điều kiện hoặc sai cổng: Chặn/Khóa giao diện Console (isShiftActive = false).
   */
  useEffect(() => {
    let activeGateIdStr = sessionStorage.getItem('activeGateId');

    if (sessionData?.hasActiveSession && sessionData?.gateId) {
      activeGateIdStr = String(sessionData.gateId);
      sessionStorage.setItem('activeGateId', activeGateIdStr);
      sessionStorage.setItem('activeGateName', sessionData.gateName || '');
      sessionStorage.setItem('activeGateType', sessionData.gateType || '');

      if (shiftStatus !== 'OPEN') {
        setAuthShiftStatus('OPEN');
      }
    }

    if ((shiftStatus === 'OPEN' || sessionData?.hasActiveSession) && activeGateIdStr && gatesData) {
      const gate = gatesData.find((g: any) => String(g.id) === activeGateIdStr);
      if (gate) {
        setActiveGate(gate);
        setIsShiftActive(true);
      } else {
        setIsShiftActive(false);
      }
    } else {
      setIsShiftActive(false);
    }
  }, [shiftStatus, gatesData, sessionData, setAuthShiftStatus]);

  // =========================================================================================
  // 4.5. XỬ LÝ TRẠNG THÁI CHỜ (LOADING STATE)
  // =========================================================================================
  // Hiển thị vòng xoay chờ (Spin) trong lúc hệ thống đang tải dữ liệu từ API.
  if (isLoading || isLoadingSession) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-80px)] bg-slate-100">
        <Spin size="large" tip="Loading gate data..." />
      </div>
    );
  }



  // =========================================================================================
  // 5. KIỂM DUYỆT BẢO MẬT & CHẶN GIAO DIỆN (GUARD CLAUSE)
  // =========================================================================================
  // Tránh việc nhân viên chưa bắt đầu ca làm việc (hoặc chưa chọn cổng) nhưng lại cố tình truy cập vào Console.
  // Nếu chưa hợp lệ: Trả về một màn hình cảnh báo (Alert) màu vàng thay vì giao diện Camera.
  // Phần thẻ <div> "Debug Info" bên dưới dùng để in ra các biến trạng thái, giúp lập trình viên bắt lỗi dễ hơn.
  if (!isShiftActive || !activeGate) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-80px)] bg-slate-100 p-4">
        <Alert
          message="Shift not started or gate not selected!"
          description="Please click 'Start Shift' and select a gate to control the Console."
          type="warning"
          showIcon
          className="shadow-md"
        />
        <div className="mt-4 p-4 bg-white shadow rounded text-sm text-gray-500 w-full max-w-2xl text-left overflow-auto">
          <p><strong>Debug Info:</strong></p>
          <p>shiftStatus: {shiftStatus}</p>
          <p>hasSessionData: {sessionData ? 'Yes' : 'No'}</p>
          <p>session.hasActiveSession: {sessionData?.hasActiveSession ? 'Yes' : 'No'}</p>
          <p>session.gateId: {sessionData?.gateId}</p>
          <p>activeGateIdStr (sessionStorage): {sessionStorage.getItem('activeGateId')}</p>
          <p>gatesData loaded: {gatesData ? 'Yes (' + gatesData.length + ' gates)' : 'No'}</p>
          <p>gate IDs in gatesData: {gatesData?.map((g: any) => g.id).join(', ')}</p>
        </div>
      </div>
    );
  }

  // =========================================================================================
  // 6. XÁC ĐỊNH LOẠI CỔNG ĐỂ ĐIỀU HƯỚNG GIAO DIỆN (GATE TYPE RESOLUTION)
  // =========================================================================================
  /**
   * Lấy loại cổng từ sessionStorage để quyết định sẽ render màn hình Cổng Vào hay Cổng Ra.
   * 
   * Phân tích logic: 
   * - Nhóm 'ENTRY' hoặc 'IN': Xác định là Cổng Vào -> isEntryMode = true.
   * - Nhóm 'EXIT' hoặc 'OUT': Xác định là Cổng Ra -> isEntryMode = false.
   * - Dự phòng (Fallback): Nếu sessionStorage bị lỗi không lưu type, 
   *   kiểm tra trực tiếp từ object activeGate lấy từ API (activeGate.type === 'IN').
   */
  const selectedGateType = sessionStorage.getItem('activeGateType');
  const isEntryMode = ['ENTRY', 'IN'].includes(selectedGateType || '')
    ? true
    : ['EXIT', 'OUT'].includes(selectedGateType || '')
      ? false
      : activeGate.type === 'IN';

  return (
    <InlineErrorBoundary>
      {isEntryMode ? (
        <GateInConsoleScreen activeGate={activeGate} />
      ) : (
        <GateOutConsoleScreen activeGate={activeGate} />
      )}
    </InlineErrorBoundary>
  );
};

/**
 * =========================================================================================
 * ERROR BOUNDARY (CƠ CHẾ BẢO VỆ GIAO DIỆN CHỐNG CRASH)
 * =========================================================================================
 * Bắt tất cả các lỗi logic xảy ra trong các Component con (như GateIn, GateOut).
 * Nếu có lỗi, thay vì sập toàn bộ web thành màn hình trắng, nó sẽ hiển thị màn hình
 * cảnh báo màu đỏ (CRASH REPORT) chứa thông tin lỗi để dễ dàng gỡ lỗi (Debug).
 */
class InlineErrorBoundary extends React.Component<{ children: any }, { hasError: boolean, error: any, info: any }> {
  state: { hasError: boolean, error: any, info: any } = { hasError: false, error: null, info: null };
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) { this.setState({ error, info: errorInfo }); console.error("GateConsoleScreen Error:", String(error), (errorInfo as any).componentStack); }
  render() {
    if (this.state.hasError) return (
      <div style={{ padding: 50, background: 'red', color: 'white', minHeight: '100vh', width: '100vw', zIndex: 9999, position: 'fixed', top: 0, left: 0 }}>
        <h1>CRASH REPORT</h1>
        <h2>{this.state.error?.toString()}</h2>
        <pre style={{ background: 'black', padding: 20 }}>{this.state.info?.componentStack}</pre>
      </div>
    );
    return this.props.children;
  }
}
