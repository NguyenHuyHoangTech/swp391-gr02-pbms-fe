/**
 * ============================================================================
 * IMPORT CÁC THƯ VIỆN & TÀI NGUYÊN (DEPENDENCIES)
 * ============================================================================
 * 1. React & Hooks: Quản lý vòng đời, trạng thái (useState, useEffect) và tham chiếu (useRef).
 * 2. Store & Fetching:
 *    - useAuthStore: Trạng thái ca làm việc (Zustand).
 *    - useQuery, useQueryClient: Lấy và quản lý cache dữ liệu (React Query).
 * 3. Thư viện UI (Ant Design): Vẽ giao diện như Card, Button, Modal, Input... và các Icon.
 * 4. WebSocket (useWebSocket): Hook để kết nối, nhận tín hiệu IoT thời gian thực.
 * 5. Tiện ích (Utils): 
 *    - simulatedDayjs, dayjs: Xử lý thời gian thực hoặc giả lập.
 *    - axiosClient: Thư viện gọi HTTP API (Backend).
 *    - getImageUrl, normalizePlateNumber: Xử lý hiển thị ảnh gốc và chuẩn hóa biển số.
 * 6. React-Konva: Engine vẽ đồ họa 2D (Stage, Layer, Rect, Line, Image...) để mô phỏng bãi đỗ xe.
 */
import { simulatedDayjs } from '../../core/utils/timeProvider';
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, message, Tag, Typography, Modal, Row, Col, Radio, Input, Divider, Select, InputNumber, QRCode } from 'antd';
import { CarOutlined, LockOutlined, UnlockOutlined, CheckCircleOutlined, DollarOutlined, AimOutlined, WarningOutlined, CloseCircleOutlined, QrcodeOutlined, IdcardOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';
import { normalizePlateNumber } from '../../core/utils/licensePlateUtils';
import { Stage, Layer, Rect, Group, Text as KonvaText, Line, Label, Tag as KonvaTag, Image as KonvaImage } from 'react-konva';
import Konva from 'konva';

/**
 * ============================================================================
 * MÔ TẢ TỔNG QUAN VỀ LUỒNG DỮ LIỆU & TƯƠNG TÁC CỦA GATE IN CONSOLE SCREEN
 * ============================================================================
 * 
 * [PHẦN 1] MỤC ĐÍCH & VAI TRÒ CỦA COMPONENT:
 *    - Giao diện trực tại cổng dành riêng cho CỔNG VÀO (Entry Gate).
 *    - Component này bị gọi (được render) từ `GateConsoleScreen.tsx` sau khi cảnh sát 
 *      giao thông ở đó xác nhận nhân viên đã mở ca và đang gác đúng cổng vào.
 * 
 * [PHẦN 2] GIẢI PHẪU VÒNG ĐỜI DỮ LIỆU (DATA FLOW LIFECYCLE) KÈM MINH CHỨNG:
 * 
 * BƯỚC 1: BÀN GIAO CA TRỰC (KHỞI TẠO DỮ LIỆU NỀN)
 * - Minh chứng 1 (Gọi API tĩnh): Từ dòng 80 đến 100, hệ thống dùng `useQuery` để bí mật 
 *   kéo về toàn bộ Bản đồ bãi xe (mapData) và Cấu hình bãi đỗ (mapConfigData).
 * - Minh chứng 2 (Vẽ bản đồ ảo): Dữ liệu này được nhồi vào thư viện React-Konva (từ dòng 770) 
 *   để vẽ ra sơ đồ bãi đỗ 2D bên góc phải màn hình.
 * - Minh chứng 3 (Cắm Ăng-ten): Ở dòng 259 `stompClient.subscribe(destination, ...)` 
 *   Component chính thức đăng ký tần số `/topic/gates/{gateId}/scans` và ngồi im chờ đợi.
 * 
 * BƯỚC 2: XE TỚI CỔNG (HỨNG DỮ LIỆU THỜI GIAN THỰC)
 * - Minh chứng 1 (Nhận sóng IoT): Khi có xe tới quét Camera, Backend bắn gói tin JSON qua WebSocket. 
 *   Dây Ăng-ten ở dòng 259 hứng được và lập tức gọi `setScanData(payload)` ở dòng 297.
 * - Minh chứng 2 (Giao diện lột xác): Vì State `scanData` thay đổi, React tự động Re-render. 
 *   Khung bên trái lập tức hiện Ảnh xe và Biển số tự điền.
 * - Minh chứng 3 (Cameraman tự động): Nếu AI xúi đỗ ở Zone A, hàm `handleAutoZoom(zone)` 
 *   ở dòng 443 sẽ âm thầm tính toán tọa độ X,Y và Scale để phóng to bản đồ đúng vào Zone đó.
 * 
 * BƯỚC 3: NHÂN VIÊN RA QUYẾT ĐỊNH (PHẢN HỒI & CHỐT HẠ)
 * - Minh chứng 1 (Kẻ gác cổng): Khi nhân viên bấm nút [Cho xe vào] (dòng 716), hàm `handleCheckIn()` 
 *   ở dòng 400 được kích hoạt. Nó soi xem biển số nhân viên gõ tay có khác biển số AI đọc không. 
 *   Nếu khác, nó dựng Popup màu đỏ bắt xác nhận lại.
 * - Minh chứng 2 (Cỗ máy chốt hạ): Nếu nhân viên bấm "Bỏ qua & Cho vào", hàm `executeCheckIn()` 
 *   ở dòng 341 chạy. Nó gọi API `axiosClient.post('/operation/gates/check-in')` bắn vèo dữ liệu về Backend.
 * - Minh chứng 3 (Dọn dẹp): Cuối cùng, hàm `setScanData(null)` (dòng 389) chạy để xóa sạch màn hình, 
 *   đưa hệ thống quay lại Bước 1 đón xe tiếp theo!
 * ============================================================================
 */

const { Title, Text } = Typography;

const URLImage = ({ src, x, y, width, height }: { src: string, x: number, y: number, width: number, height: number }) => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const img = new window.Image();
    img.src = src;
    img.onload = () => setImage(img);
  }, [src]);
  if (!image) return null;
  return <KonvaImage image={image} x={x} y={y} width={width} height={height} listening={false} />;
};

const GRID_SIZE = 50;



export const GateInConsoleScreen = ({ activeGate }: { activeGate: any }) => {
  const { connected, stompClient } = useWebSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  /**
   * ============================================================================
   * 1. TRUY VẤN DỮ LIỆU BẢN ĐỒ VÀ PHƯƠNG TIỆN (STATIC DATA FETCHING)
   * ============================================================================
   * Sử dụng React Query để kéo các dữ liệu tĩnh từ server về cache.
   * - mapData: Chứa danh sách các khu vực (Zone) hiện tại trong bãi xe.
   * - mapConfigData: Cấu hình kích thước bãi xe (số hàng, số cột) để vẽ Konva.
   * - vehicleTypes: Danh sách các loại xe được phép ra vào hệ thống.
   */
  const { data: mapData } = useQuery({
    queryKey: ['zonesMap'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/zones/map');
      return res.data.data;
    }
  });

  const { data: mapConfigData } = useQuery({
    queryKey: ['mapConfig'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/map/config');
      return res.data?.data || null;
    }
  });

  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicleTypes'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types?activeOnly=true');
      return res.data?.data || [];
    }
  });



  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [lastRawPayload, setLastRawPayload] = useState<any>(null);
  const [debugMinimized, setDebugMinimized] = useState(false);

  const addLog = (msg: string) => {
    setDebugLogs(prev => {
      const newLogs = [...prev, `[${simulatedDayjs().format('HH:mm:ss')}] ${msg}`];
      return newLogs.slice(-20); // keep last 20 logs
    });
  };

  const [scanData, setScanData] = useState<any>(null);
  const [editablePlate, setEditablePlate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef<boolean>(false);

  const shiftStatus = useAuthStore((state) => state.shiftStatus);

  /**
   * ============================================================================
   * 2. TRUY VẤN ĐỘNG THEO TỪNG XE (DYNAMIC DATA FETCHING)
   * ============================================================================
   * - overstayCount: API định kỳ (10 giây/lần) đếm số lượng xe ở quá giờ để thông báo.
   */
  const { data: overstayCount = 0 } = useQuery({
    queryKey: ['overstay-count'],
    queryFn: async () => {
      const res = await axiosClient.get('/incident/incidents');
      const incidents = res.data?.data || [];
      return incidents.filter((t: any) => t.type === 'OVERSTAY').length;
    },
    refetchInterval: 10000
  });
  /**
   * MỤC ĐÍCH: 
   * Quản lý kết nối WebSocket để cập nhật Real-time (thời gian thực) cho Sơ đồ bãi xe (Map) 
   * và thông báo của nhân viên.
   * 
   * MÃ GIẢ CHI TIẾT:
   * Chạy một lần khi component mount hoặc khi trạng thái WebSocket (stompClient) thay đổi:
   *   1. Đăng ký kênh '/topic/map-updates' (nhận tín hiệu từ cảm biến bãi đỗ):
   *      - Khi có xe đậu vào/ra khỏi 1 ô, update trạng thái ô đó (OCCUPIED/AVAILABLE) ngay trên RAM bằng queryClient.setQueryData (không cần gọi lại API).
   *   2. Đăng ký kênh '/topic/staff/notifications' (nhận thông báo hệ thống):
   *      - Nếu thông báo là 'RESERVATION_ARRIVED' (xe đặt trước đã đến), gọi lại API sơ đồ để trừ đi số lượng xe đặt trước chờ đợi.
   * Kết thúc hàm
   */
  useEffect(() => {
    if (stompClient && connected) {
      const sub = stompClient.subscribe('/topic/map-updates', (message) => {
        const payload = JSON.parse(message.body);
        queryClient.setQueryData(['zonesMap'], (oldData: any) => {
          if (!oldData) return oldData;
          return oldData.map((z: any) => ({
            ...z,
            slots: (z.slots || []).map((s: any) => s.id === payload.id ? { ...s, status: payload.status } : s)
          }));
        });
      });

      const subStaff = stompClient.subscribe('/topic/staff/notifications', (message) => {
        try {
          const data = JSON.parse(message.body);
          if (data.type === 'RESERVATION_ARRIVED' || data.type === 'RESERVATION_CREATED' || data.type === 'RESERVATION_CANCELLED' || data.type === 'ZONE_RESERVED') {
            // Re-fetch zonesMap so that pendingReservations count updates
            queryClient.invalidateQueries({ queryKey: ['zonesMap'] });
          }
        } catch (e) { }
      });

      return () => {
        sub.unsubscribe();
        subStaff.unsubscribe();
      };
    }
  }, [stompClient, connected, queryClient]);

  // Konva State
  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const activeFloor = mapConfigData?.floors?.find((f: any) => f.id === activeGate?.floorId);
  const mapCols = activeFloor?.mapCols || 60;
  const mapRows = activeFloor?.mapRows || 40;

  const activeSlotRef = useRef<Konva.Rect | null>(null);
  const tweenRef = useRef<Konva.Tween | null>(null);

  useEffect(() => {
    if (containerRef.current && activeGate) {
      const containerW = (containerRef.current?.clientWidth || 0);
      const containerH = (containerRef.current?.clientHeight || 0);
      const mapW = mapCols * GRID_SIZE;
      const mapH = mapRows * GRID_SIZE;

      const scale = Math.min(containerW / mapW, containerH / mapH) * 0.95;
      const minScaleLocked = Math.min(scale, 1);

      setStageScale(minScaleLocked);
      setStagePos({
        x: (containerW - mapW * minScaleLocked) / 2,
        y: (containerH - mapH * minScaleLocked) / 2
      });
    }
  }, [activeGate, mapCols, mapRows]);

  useEffect(() => {
    // Only cleanup active slot logic if any
    return () => {
      if (tweenRef.current) clearInterval(tweenRef.current as any);
    }
  }, []);

  /**
   * MỤC ĐÍCH: 
   * Lắng nghe tín hiệu WebSocket quét thẻ & chụp ảnh AI từ đúng cổng IN (activeGate) mà nhân viên đang trực.
   * 
   * MÃ GIẢ CHI TIẾT:
   *   Đăng ký kênh `/topic/gates/{activeGate.id}/scans`
   *   Khi có tin nhắn tới:
   *      - Kiểm tra biến `isProcessingRef` để chặn tín hiệu rác (nếu đang xử lý 1 xe chưa xong, bỏ qua xe mới).
   *      - Nếu hành động là 'OUT' (có thể thiết bị nhầm lẫn), bỏ qua.
   *      - Nhận diện biển số (AI) từ payload và gán vào state `editablePlate` cho nhân viên sửa nếu sai.
   *      - Phân tích và sinh ra các thông báo cảnh báo (derivedWarnings): Sai tầng, đặt trước quá sớm, biển số bị cấm (blacklist)...
   *      - Cập nhật toàn bộ thông tin quét được (hình ảnh, rfid, loại xe, tuyến đường đề xuất) vào state `scanData` để render lên UI cột trái.
   * Kết thúc hàm
   */
  useEffect(() => {
    if (activeGate && stompClient && connected) {
      const destination = `/topic/gates/${activeGate.id}/scans`;
      const notifDest = `/topic/floors/${activeGate.floorId}/notifications`;
      addLog(`Subscribed to ${destination} and ${notifDest}`);

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

      const subscription = stompClient.subscribe(destination, (msg) => {
        if (isProcessingRef.current) {
          addLog("Close stream band: Ignore new signal due to pending processing of current vehicle");
          return;
        }
        isProcessingRef.current = true;

        addLog(`Received message. Length: ${msg.body.length} bytes`);

        const payload = JSON.parse(msg.body);
        if (payload.actionType === 'OUT') {
          isProcessingRef.current = false;
          return;
        }
        setLastRawPayload(payload);

        // IOT payload contains plateNumber, imageBase64, confidence
        // For UI purposes, we'll map it to our UI state shape
        setEditablePlate(payload.plateNumber || 'UNKNOWN');

        // Check if pre-booked vehicle is on the wrong floor
        const derivedWarnings: string[] = [];
        if (payload.customerType === 'PREBOOKED' && payload.suggestedZoneId) {
          const zones = queryClient.getQueryData<any[]>(['zonesMap']) || [];
          const reservedZone = zones.find(z => z.id === payload.suggestedZoneId);
          if (reservedZone && reservedZone.floorId !== activeGate.floorId) {
            derivedWarnings.push(`WRONG FLOOR: The vehicle reserved a spot on ${reservedZone.floorName}, but is entering via a Floor ${activeGate.floorId} gate!`);
          }
        }

        if (payload.earlyBookingNotice) {
          derivedWarnings.push(payload.earlyBookingNotice);
          import('antd').then(({ Modal }) => {
            Modal.warning({
              title: 'Early Booking Arrival',
              content: (
                <div>
                  <p className="text-red-600 font-bold mb-2">{payload.earlyBookingNotice}</p>
                  <p>Please instruct the user to <b>cancel their booking</b> on their app if they wish to enter now as a walk-in, or ask them to wait until the booking time.</p>
                  <p className="mt-2 text-slate-500 italic">The system will not allow entry until the booking is cancelled or the time arrives.</p>
                </div>
              ),
              okText: 'Close',
            });
          });
        }

        if (payload.isBlacklisted) {
          derivedWarnings.push(`⚠️ Blacklisted vehicle detected!`);
        }

        setScanData({
          plateNumber: payload.plateNumber,
          imageBase64: payload.imageBase64 || '',
          lprImageBase64: payload.lprImageBase64 || '',
          imageInBase64: payload.picInPanorama || '',
          imageOutBase64: payload.imageBase64 || '',
          lprImageInBase64: payload.picInFace || '',
          lprImageOutBase64: payload.lprImageBase64 || '',
          plateNumberIn: payload.plateNumberIn || payload.plateNumber || 'UNKNOWN',
          timeIn: payload.timeIn ? simulatedDayjs(payload.timeIn).format('DD/MM/YYYY HH:mm:ss') : '--:--',
          timeOut: simulatedDayjs().format('DD/MM/YYYY HH:mm:ss'),
          duration: payload.durationMinutes ? `${payload.durationMinutes} minutes` : '--',
          feeBase: 0,
          feePenalty: 0,
          discount: 0,
          expectedFee: payload.expectedFee || 0,
          durationMinutes: payload.durationMinutes || 0,
          isBlacklisted: payload.isBlacklisted || false,
          warnings: derivedWarnings,
          rfid: payload.rfid || '---',
          cardId: payload.cardId || payload.rfid || '---',
          customerType: payload.customerType === 'PREBOOKED' ? 'BOOK' : (payload.customerType === 'MONTHLY' ? 'Monthly Pass' : (payload.customerType || 'Haunt')),
          vehicleType: payload.vehicleType || 'CAR',
          aiVehicleType: payload.vehicleType || 'CAR',
          routing: payload.suggestedZoneName || '',
          suggestedZoneId: payload.suggestedZoneId || null
        });
      });

      return () => {
        subscription.unsubscribe();
        notifSub.unsubscribe();
        addLog(`Unsubscribed from ${destination} and ${notifDest}`);
      };
    }
  }, [activeGate, stompClient, connected]);

  /**
   * ============================================================================
   * 3. LOGIC HÀNH ĐỘNG CỦA NHÂN VIÊN GÁC CỔNG (STAFF ACTIONS)
   * ============================================================================
   */

  /**
   * Xử lý Hủy bỏ (Cancel):
   * Nhân viên từ chối cho xe vào (hoặc thiết bị nhận diện nhầm).
   * Sẽ xóa sạch dữ liệu quét hiện tại trên màn hình và giải phóng biến khóa (isProcessing).
   */
  const handleCancel = () => {
    isProcessingRef.current = false;
    setScanData(null);
    setEditablePlate('');
    message.warning('The current scanning session has been canceled. System is ready.');
  };

  /**
   * Xử lý thực thi Check-in (Execute Check-In):
   * Bắn API về Backend để chính thức ghi nhận xe vào bãi.
   * Đồng thời tự động sinh cảnh báo (Incident) nếu nhân viên đã sửa biển số hoặc loại xe (AI đọc sai).
   */
  const executeCheckIn = async () => {
    setIsLoading(true);
    try {
      const payload = {
        gateId: activeGate.id,
        plateNumber: editablePlate,
        vehicleType: scanData.vehicleType || 'CAR',
        rfid: scanData.rfid,
        imageBase64: scanData.imageBase64,
        lprImageBase64: scanData.lprImageBase64,
        suggestedZoneName: scanData.routing,
        suggestedZoneId: scanData.suggestedZoneId
      };
      const response = await axiosClient.post('/operation/gates/check-in', payload);

      const suggestedZone = response.data.data.suggestedZoneName || 'Free';
      message.success(`Vehicle entry confirmed! Suggested zone: ${suggestedZone}`);

      const isPlateChanged = scanData.plateNumber && editablePlate && scanData.plateNumber.toUpperCase() !== editablePlate.toUpperCase();
      const isTypeChanged = scanData.aiVehicleType && scanData.vehicleType && scanData.aiVehicleType !== scanData.vehicleType;

      if (isPlateChanged || isTypeChanged) {
        try {
          let issueType = 'DATA_MISMATCH';
          let description = '[AUTO] ';
          if (isPlateChanged && isTypeChanged) {
            issueType = 'MULTIPLE_MISMATCH';
            description += `License plate and vehicle type mismatch on ENTRY. AI recognized: ${scanData.plateNumber} (${scanData.aiVehicleType}). Staff edited to: ${editablePlate} (${scanData.vehicleType}).`;
          } else if (isPlateChanged) {
            issueType = 'LPR_MISMATCH';
            description += `License plate mismatch on ENTRY. AI recognized: ${scanData.plateNumber}. Staff edited to: ${editablePlate}.`;
          } else if (isTypeChanged) {
            issueType = 'TYPE_MISMATCH';
            description += `Vehicle type mismatch on ENTRY. AI recognized: ${scanData.aiVehicleType}. Staff edited to: ${scanData.vehicleType}.`;
          }

          await axiosClient.post('/incident/incidents', {
            issueType,
            sessionId: response.data.data.sessionId,
            description,
            correctPlateNumber: isPlateChanged ? editablePlate : undefined,
            priority: 'LOW'
          });
        } catch (e) {
          console.error("Error automatically creating mismatch incident:", e);
        }
      }

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
   * Xử lý Xác nhận Check-in (Confirm Check-In):
   * Đây là luồng bọc bên ngoài `executeCheckIn()`. 
   * Nó đóng vai trò "kiểm tra lại lần cuối" (Double Check).
   * Nếu có bất kỳ cảnh báo nguy hiểm nào (sai biển, sai loại xe, blacklist, overbook...),
   * nó sẽ hiện 1 popup (Modal) đỏ chót để ép nhân viên phải xác nhận thủ công trước khi đi tiếp.
   */
  const handleCheckIn = async () => {
    if (!scanData || !activeGate) return;

    const isPlateChanged = scanData.plateNumber && editablePlate && scanData.plateNumber.toUpperCase() !== editablePlate.toUpperCase();
    const isTypeChanged = scanData.aiVehicleType && scanData.vehicleType && scanData.aiVehicleType !== scanData.vehicleType;

    const dynamicWarnings = [...(scanData.warnings || [])];

    if (isPlateChanged) {
      dynamicWarnings.push(`License plate modified by staff from ${scanData.plateNumber} to ${editablePlate}`);
    }
    if (isTypeChanged) {
      dynamicWarnings.push(`Vehicle type modified by staff from ${scanData.aiVehicleType} to ${scanData.vehicleType}`);
    }
    
    if (dynamicWarnings.length > 0) {
      Modal.confirm({
        title: <span className="text-red-600 font-bold"><WarningOutlined className="mr-2" />System Warning Detected!</span>,
        content: (
          <div className="mt-4">
            <p className="font-medium text-slate-700 mb-2">This vehicle has {dynamicWarnings.length} warnings:</p>
            <ul className="list-disc pl-5 mb-4 space-y-1">
              {dynamicWarnings.map((w: string, idx: number) => (
                <li key={idx} className="text-red-600">{w}</li>
              ))}
            </ul>
            <p className="font-bold text-slate-800">Are you sure you want to ignore the warnings and LET THE VEHICLE IN?</p>
          </div>
        ),
        okText: 'Ignore warnings & Let in',
        okType: 'danger',
        cancelText: 'Cancel',
        width: 500,
        onOk: () => {
          executeCheckIn();
        }
      });
      return;
    }

    executeCheckIn();
  };

  /**
   * Zoom tự động vào khu vực (Auto Zoom):
   * Khi nhân viên hoặc AI chọn 1 khu (Zone), hàm này dùng thư viện Konva.Tween
   * để tạo hiệu ứng mượt mà (animation) di chuyển bản đồ đến đúng tọa độ của khu vực đó.
   */
  const handleAutoZoom = (zone: any) => {
    if (!stageRef.current || !containerRef.current) return;

    const slotW = ((mapConfigData?.vehicleTypes?.find((v: any) => v.id === zone.vehicleTypeId))?.matrixWidth || 3) * GRID_SIZE;
    const slotH = ((mapConfigData?.vehicleTypes?.find((v: any) => v.id === zone.vehicleTypeId))?.matrixHeight || 6) * GRID_SIZE;
    let zoneW = zone.capacity * slotW;
    let zoneH = slotH;

    if (zone.rotation === 90 || zone.rotation === 270) {
      zoneW = slotH;
      zoneH = zone.capacity * slotW;
    }

    const containerW = (containerRef.current?.clientWidth || 0);
    const containerH = (containerRef.current?.clientHeight || 0);

    const padding = 100;
    const scaleX = (containerW - padding) / zoneW;
    const scaleY = (containerH - padding) / zoneH;
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.min(newScale, 3);

    let centerX = zone.layoutX ?? 0;
    let centerY = zone.layoutY ?? 0;

    if (zone.rotation === 0) {
      centerX += zoneW / 2;
      centerY += zoneH / 2;
    } else if (zone.rotation === 90) {
      centerX -= zoneW / 2;
      centerY += zoneH / 2;
    }

    const newX = containerW / 2 - centerX * newScale;
    const newY = containerH / 2 - centerY * newScale;

    const tween = new Konva.Tween({
      node: stageRef.current,
      duration: 0.5,
      easing: Konva.Easings.EaseInOut,
      x: newX,
      y: newY,
      scaleX: newScale,
      scaleY: newScale,
      onFinish: () => {
        setStagePos({ x: newX, y: newY });
        setStageScale(newScale);
      }
    });
    tween.play();
  };

  /**
   * MỤC ĐÍCH:
   * Hàm chuyên vẽ lưới nền (Grid Lines) cho bản đồ Konva 
   * để giao diện trông giống bản thiết kế kỹ thuật, dễ phân biệt các block.
   */
  const drawGrid = () => {
    const lines = [];
    const width = mapCols * GRID_SIZE;
    const height = mapRows * GRID_SIZE;

    lines.push(
      <Rect key="bg" x={0} y={0} width={width} height={height} fill="#f8fafc" />
    );

    for (let i = 1; i < mapCols; i++) {
      lines.push(
        <Line key={`v-${i}`} points={[i * GRID_SIZE, 0, i * GRID_SIZE, height]} stroke="#cbd5e1" strokeWidth={1} opacity={0.2} />
      );
    }
    for (let j = 1; j < mapRows; j++) {
      lines.push(
        <Line key={`h-${j}`} points={[0, j * GRID_SIZE, width, j * GRID_SIZE]} stroke="#cbd5e1" strokeWidth={1} opacity={0.2} />
      );
    }

    lines.push(
      <Rect key="border" x={0} y={0} width={width} height={height} stroke="#334155" strokeWidth={4} listening={false} />
    );

    return lines;
  };




  /**
   * MỤC ĐÍCH:
   * Chứa toàn bộ giao diện Cột Bên Trái (Action Console) của cổng IN.
   * 
   * Bao gồm 3 phần chính:
   * 1. HÌNH ẢNH CAMERA (Top Zone): Hiện ảnh Panorama (toàn cảnh) và ảnh cắt Biển Số LPR.
   * 2. THÔNG TIN VÀ CẢNH BÁO (Middle Zone): Hiện ID thẻ, Loại khách, Input cho phép nhân viên sửa biển số AI đọc sai, các cảnh báo (Booking, Blacklist), và Bảng trạng thái sức chứa các khu vực (Zone Status).
   * 3. NÚT XỬ LÝ (Bottom Zone): Hủy bỏ phiên, hoặc Xác nhận cho xe vào.
   */
  const renderInGatePanel = () => (
    <div className="flex flex-col flex-1 h-full min-h-0 overflow-hidden w-full bg-slate-100">
      {/* TASK 1 & 2: Top Zone (Cameras) */}
      <div className="h-[35%] min-h-[200px] max-h-[300px] flex-none p-2 relative flex bg-slate-900 border-b-4 border-slate-800">
        <div className="absolute top-0 left-0 bg-black/70 text-white px-2 py-1 text-[10px] z-10 font-bold uppercase tracking-widest">
          Camera Feeds
        </div>
        {scanData ? (
          <>
            <div className="flex-1 relative border-r-2 border-slate-800 h-full">
              <img src={getImageUrl(scanData.imageBase64)} alt="Panorama" className="w-full h-full object-cover" />
            </div>
            <div className="w-1/3 h-full relative bg-slate-950 flex flex-col items-center justify-center p-2">
              <div className="w-[80%] aspect-[3/1] border-2 border-blue-500 rounded relative overflow-hidden shadow-[0_0_10px_rgba(59,130,246,0.5)] bg-white flex items-center justify-center">
                <img src={getImageUrl(scanData.lprImageBase64)} alt="LPR Crop" className="max-w-full max-h-full object-contain" />
              </div>
              <Text className="text-slate-400 text-[9px] mt-1 font-bold tracking-widest uppercase">LPR Snapshot</Text>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900">
            <AimOutlined className="text-5xl mb-2 opacity-30 animate-spin" style={{ animationDuration: '3s' }} />
            <Text className="text-slate-400 font-bold tracking-widest text-sm">WAITING FOR THE CAR SIGNAL FROM THE GATE</Text>
          </div>
        )}
      </div>

      {/* TASK 1 & 3: Middle Zone (Info & Alerts) - Flexible Space */}
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2 bg-slate-50 custom-scrollbar">
        <div className={`p-2 rounded-lg shadow-sm flex-none text-xs flex flex-col gap-1 overflow-hidden border ${(scanData?.warnings?.length || 0) > 0 ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-green-50 border-green-300 text-green-700'}`}>
          <div className="font-bold flex items-center justify-between">
            <div className="flex items-center">
              {(scanData?.warnings?.length || 0) > 0 ? <WarningOutlined className="mr-1" /> : <CheckCircleOutlined className="mr-1" />}

              WARNING / NOTE:
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-[100px] min-h-[30px]">
            {(scanData?.warnings?.length || 0) > 0 ? (
              <ul className="list-disc pl-4 m-0">
                {scanData!.warnings.map((w: string, idx: number) => <li key={idx} className="whitespace-normal break-words" title={w}>{w}</li>)}
              </ul>
            ) : (
              <span className="text-green-600">The system does not record any warnings for this vehicle</span>
            )}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm flex-none flex flex-col gap-2">
          <div className="flex justify-between items-center bg-slate-100 p-2 rounded-lg border border-slate-200 shadow-sm">
            <div className="flex items-center space-x-2">
              <IdcardOutlined className="text-2xl text-blue-600" />
              <Text className="text-xl font-bold text-slate-700 font-mono tracking-wider">{scanData?.cardId || scanData?.rfid || '---'}</Text>
            </div>
            <div className="flex items-center space-x-2">
              <Tag color={
                !scanData ? 'default' :
                  scanData.customerType === 'Haunt' ? 'blue' :
                    (scanData.customerType === 'BOOK' ? 'gold' : 'green')
              } className="m-0 font-bold px-3 py-1 text-sm rounded shadow-sm border border-transparent">
                {scanData?.customerType || '---'}
              </Tag>
              {scanData ? (
                <Select
                  size="large"
                  value={scanData.vehicleType}
                  onChange={(val) => setScanData({ ...scanData, vehicleType: val })}
                  className="w-40 font-bold text-base"
                  options={vehicleTypes ? vehicleTypes.filter((v: any) => !activeFloor?.type || activeFloor.type === v.category).map((v: any) => ({
                    value: v.typeName,
                    label: <div className="flex items-center gap-2">{v.iconUrl ? <img src={getImageUrl(v.iconUrl)} style={{ width: 20, height: 20, objectFit: 'contain' }} /> : (v.category === 'FOUR_WHEEL' ? '🚗' : '🏍️')} {v.typeName}</div>
                  })) : []}
                />
              ) : (
                <Tag className="m-0 font-bold px-3 py-1 text-sm rounded border-slate-300">---</Tag>
              )}
            </div>
          </div>

          <div className="flex flex-col items-center justify-center flex-none min-h-0">
            <Text className="text-slate-500 font-bold mb-1 uppercase tracking-widest text-[10px]">License Plate Identification (AI)</Text>
            <Input
              value={editablePlate}
              onChange={(e) => setEditablePlate(normalizePlateNumber(e.target.value))}
              disabled={!scanData}
              placeholder="---"
              className="w-full text-2xl h-10 font-mono text-center font-bold uppercase rounded-lg border-2 border-blue-400 focus:border-blue-600 focus:shadow-[0_0_8px_rgba(37,99,235,0.2)] bg-slate-50 text-slate-900"
            />
          </div>
        </div>

        {/* REAL-TIME ZONE STATUS */}
        <div className="bg-white border border-slate-300 shadow-sm rounded-xl p-2 flex-1 overflow-y-auto custom-scrollbar flex flex-col min-h-0 relative">
          {scanData && (
            <div className="bg-green-50 border-2 border-green-400 rounded-lg p-3 mb-2 flex flex-col items-center justify-center shadow-sm min-h-[80px] shrink-0 relative">
              <Text className="text-green-600 text-[12px] uppercase font-bold tracking-widest mb-1">Suggested Route:</Text>
              <div className="text-3xl font-black text-green-800 truncate w-full text-center tracking-tight">{scanData.routing || 'Free'}</div>
              <Button
                size="small"
                className={`absolute top-2 right-2 font-bold ${(!scanData.routing || scanData.routing === 'Free') ? '' : 'border-green-600 text-green-600'}`}
                disabled={!scanData.routing || scanData.routing === 'Free'}
                onClick={() => {
                  setScanData({ ...scanData, routing: 'Free', suggestedZoneId: undefined });
                }}
              >
                Switch to Free
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-1.5 shrink-0">
            {Array.isArray(mapData) && mapData.filter((z: any) => z.floorId === activeGate?.floorId).map((zone: any) => {
              const total = zone.capacity || 0;
              const disabledCount = (zone.slots || []).filter((s: any) => s.status === 'DISABLED').length;
              const occupiedCount = (zone.slots || []).filter((s: any) => s.status === 'OCCUPIED').length;

              const effectiveCapacity = Math.max(0, total - disabledCount);
              const reserved = zone.pendingReservations || 0;
              const availableCount = Math.max(0, effectiveCapacity - occupiedCount - reserved);

              const occupancyRate = effectiveCapacity > 0
                ? ((occupiedCount + reserved) / effectiveCapacity) * 100
                : 0;

              const isFull = availableCount <= 0;
              const isOverbooked = occupancyRate > 100;
              const isSuggested = scanData?.suggestedZoneId === zone.id;

              return (
                <div key={zone.id} className={`flex flex-col p-1.5 rounded border ${isSuggested ? 'bg-green-100 border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.3)]' : (isFull ? 'bg-red-50 border-red-400' : 'bg-slate-50 border-slate-300')}`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className={`font-bold text-xs truncate flex items-center gap-1 mr-1 ${isSuggested ? 'text-green-700' : 'text-slate-700'}`} title={zone.zoneName || zone.name}>
                      {zone.zoneName || zone.name}
                      {isOverbooked && <WarningOutlined className="text-red-500 text-sm" title="Overbooked!" />}
                    </span>
                    <span className={`font-mono text-xs font-bold ${isFull ? 'text-red-600' : 'text-blue-600'}`}>{availableCount} <span className="text-[10px] font-normal text-slate-500">/ {effectiveCapacity}</span></span>
                  </div>
                  <div className="flex justify-between items-center text-[9px] font-mono text-slate-500">
                    <span>Reserved incoming: <strong className="text-orange-500">{reserved}</strong></span>
                    <span>Fill rate: <strong className={occupancyRate > 100 ? 'text-red-600' : occupancyRate >= 90 ? 'text-red-500' : 'text-blue-500'}>{occupancyRate.toFixed(1)}%</strong></span>
                  </div>
                </div>
              );
            })}
            {(!Array.isArray(mapData) || mapData.filter((z: any) => z.floorId === activeGate?.floorId).length === 0) && (
              <div className="text-center text-slate-500 text-xs py-2 italic col-span-2">No zones on this floor</div>
            )}
          </div>
        </div>
      </div>

      {/* TASK 1 & 4: Bottom Zone (Actions) - Fixed Height */}
      <div className="h-[88px] flex-none px-3 pt-2 pb-3 border-t border-slate-200 bg-white flex gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.02)]">
        <Button
          size="large"
          danger
          icon={<CloseCircleOutlined />}
          className="h-full flex-1 text-lg font-bold rounded-lg border border-red-500 text-red-600 hover:bg-red-50"
          disabled={!scanData}
          onClick={handleCancel}
        >

          Cancel
        </Button>
        <Button
          type="primary"
          size="large"
          className="h-full flex-[2] text-xl font-bold rounded-lg bg-green-600 hover:bg-green-500 shadow-md border-b-2 border-green-800 active:border-b-0 active:translate-y-1 transition-all"
          disabled={!scanData || scanData.warnings?.some((w: string) => w.startsWith('Notice: This vehicle has a booking at'))}
          loading={isLoading}
          onClick={handleCheckIn}
        >

          {scanData?.warnings?.some((w: string) => w.startsWith('Notice: This vehicle has a booking at')) ? 'Blocked: Cancel Booking First' : 'Confirm & Put the car in'}
        </Button>
      </div>
    </div>
  );


  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100 relative">
      <Row className="h-full w-full m-0">
        <>
          {/* LEFT PANEL: Action Console (IN) */}
          <Col span={9} className="h-full overflow-hidden p-4 flex flex-col border-r border-slate-300 bg-slate-50">

            <div className="flex justify-between items-center mb-2 shrink-0 gap-2">
              <Title level={4} className="m-0 text-slate-800 whitespace-nowrap flex items-center">
                {activeGate?.name} <span className="text-[10px] ml-2 bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-sm">LIVE</span>
              </Title>
              <div className="flex items-center space-x-2">
                <Button size="small" type="primary" icon={<AimOutlined />} onClick={() => {
                  if (containerRef.current) {
                    const mapW = mapCols * GRID_SIZE;
                    const mapH = mapRows * GRID_SIZE;
                    const scale = Math.min((containerRef.current?.clientWidth || 0) / mapW, (containerRef.current?.clientHeight || 0) / mapH) * 0.95;
                    const minScaleLocked = Math.min(scale, 1);
                    const tween = new Konva.Tween({
                      node: stageRef.current,
                      duration: 0.5,
                      easing: Konva.Easings.EaseInOut,
                      x: ((containerRef.current?.clientWidth || 0) - mapW * minScaleLocked) / 2,
                      y: ((containerRef.current?.clientHeight || 0) - mapH * minScaleLocked) / 2,
                      scaleX: minScaleLocked,
                      scaleY: minScaleLocked,
                      onFinish: () => {
                        setStagePos({ x: ((containerRef.current?.clientWidth || 0) - mapW * minScaleLocked) / 2, y: ((containerRef.current?.clientHeight || 0) - mapH * minScaleLocked) / 2 });
                        setStageScale(minScaleLocked);
                      }
                    });
                    tween.play();
                  }
                }}>Overall</Button>
                <Select
                  size="small"
                  placeholder="Zoom to Zone"
                  style={{ width: 130 }}
                  onChange={(zoneId) => {
                    const zone = mapData.find((z: any) => z.id === zoneId);
                    if (zone) handleAutoZoom(zone);
                  }}
                  options={Array.isArray(mapData) ? mapData.filter((z: any) => z.floorId === activeGate?.floorId).map((zone: any) => ({
                    value: zone.id,
                    label: zone.name || zone.zoneName
                  })) : []}
                />

                {scanData?.warnings?.some((w: string) => w.startsWith('Notice: This vehicle has a booking at')) && (
                  <div className="bg-red-500 text-white text-xs px-2 py-1 rounded shadow flex items-center gap-1 font-bold animate-pulse">
                    <WarningOutlined /> Early Arrival
                  </div>
                )}
              </div>
            </div>
            {renderInGatePanel()}
          </Col>

          {/* RIGHT PANEL: Live Space Map */}
          <Col span={15} className="h-full bg-slate-200 flex flex-col relative overflow-hidden">


            <div className="flex-1 w-full h-full cursor-grab active:cursor-grabbing" ref={containerRef}>
              {containerRef.current && (
                <Stage
                  width={(containerRef.current?.clientWidth || 0)}
                  height={(containerRef.current?.clientHeight || 0)}
                  draggable
                  scaleX={stageScale}
                  scaleY={stageScale}
                  x={stagePos.x}
                  y={stagePos.y}
                  ref={stageRef}
                  onDragEnd={(e) => {
                    if (e.target === e.target.getStage()) {
                      setStagePos({ x: e.target.x(), y: e.target.y() });
                    }
                  }}
                >
                  <Layer>
                    {drawGrid()}
                  </Layer>
                  <Layer>
                    {Array.isArray(mapData) && mapData.filter((z: any) => z.floorId === activeGate?.floorId).map((zone: any) => {
                      const slotW = ((mapConfigData?.vehicleTypes?.find((v: any) => v.id === zone.vehicleTypeId))?.matrixWidth || 3) * GRID_SIZE;

                      const slotH = ((mapConfigData?.vehicleTypes?.find((v: any) => v.id === zone.vehicleTypeId))?.matrixHeight || 6) * GRID_SIZE;
                      const zoneW = zone.capacity * slotW;
                      const zoneH = slotH;

                      return (
                        <Group
                          key={zone.id}
                          x={zone.layoutX ?? 0}
                          y={zone.layoutY ?? 0}
                          rotation={zone.rotation ?? 0}
                        >
                          <Rect
                            width={zoneW}
                            height={zoneH}
                            fill={zone.functionType === 'WALK_IN' ? 'rgba(186, 230, 253, 0.4)' : zone.functionType === 'MONTHLY' ? 'rgba(167, 243, 208, 0.4)' : 'rgba(241, 245, 249, 0.6)'}
                            stroke="#64748b"
                            strokeWidth={2}
                          />
                          {(zone.slots || []).map((slot: any, i: number) => {
                            const xPos = i * slotW;
                            let slotFill = 'transparent';
                            if (slot.status === 'OCCUPIED') slotFill = '#fecaca';
                            else if (slot.status === 'DISABLED') slotFill = '#f1f5f9';

                            let vtIconUrl = '';
                            if (vehicleTypes) {
                              const zoneVt = vehicleTypes.find((v: any) => v.id === zone.vehicleTypeId);
                              if (zoneVt?.iconUrl) vtIconUrl = getImageUrl(zoneVt.iconUrl);
                            }

                            return (
                              <Group key={slot.id} x={xPos} y={0}>
                                <Rect
                                  id={`slot-${slot.id}`}
                                  width={slotW}
                                  height={slotH}
                                  fill={slotFill}
                                  stroke="#94a3b8"
                                  strokeWidth={2}
                                />
                                <KonvaText
                                  x={0}
                                  y={slot.status === 'OCCUPIED' ? slotH / 2 + 5 : slotH / 2 - 8}
                                  width={slotW}
                                  align="center"
                                  text={slot.status === 'DISABLED' ? 'Maintenance' : slot.slotName}
                                  fontSize={slot.status === 'DISABLED' ? 12 : 16}
                                  fill="#334155"
                                  fontStyle="bold"
                                  listening={false}
                                />
                                {slot.status === 'OCCUPIED' && (
                                  vtIconUrl ? (
                                    <URLImage src={vtIconUrl} x={slotW / 2 - 16} y={slotH / 2 - 25} width={32} height={32} />
                                  ) : (
                                    <KonvaText
                                      x={0}
                                      y={slotH / 2 - 25}
                                      width={slotW}
                                      align="center"
                                      text="🚗"
                                      fontSize={28}
                                      listening={false}
                                    />
                                  )
                                )}
                              </Group>
                            );
                          })}
                          <Label x={5} y={5} listening={false}>
                            <KonvaTag fill="rgba(255, 255, 255, 0.95)" cornerRadius={6} shadowColor="black" shadowBlur={4} shadowOpacity={0.15} shadowOffset={{ x: 0, y: 2 }} />
                            <KonvaText
                              text={`${zone.name || zone.zoneName} ${zone.activeReservationsCount ? `(Res: ${zone.activeReservationsCount})` : ''}`}
                              fontSize={18}
                              fontFamily="sans-serif"
                              fill="#0f172a"
                              fontStyle="bold"
                              padding={6}
                            />
                          </Label>
                        </Group>
                      );
                    })}
                  </Layer>
                  <Layer>
                    {/* Draw All Gates */}
                    {mapConfigData?.gates?.filter((g: any) => g.floorId === activeGate?.floorId).map((gate: any) => {
                      const isActive = gate.id === activeGate?.id;
                      return (
                        <Group
                          key={`gate-${gate.id}`}
                          x={gate.layoutX ?? 0}
                          y={gate.layoutY ?? 0}
                          rotation={gate.rotation ?? 0}
                        >
                          <Rect
                            width={3 * GRID_SIZE} height={GRID_SIZE}
                            fill={isActive ? "#059669" : "#475569"}
                            stroke={isActive ? "#facc15" : "#94a3b8"}
                            strokeWidth={isActive ? 3 : 2}
                            cornerRadius={6}
                            shadowColor="black"
                            shadowBlur={isActive ? 8 : 4}
                            shadowOpacity={isActive ? 0.4 : 0.2}
                            shadowOffset={{ x: 0, y: isActive ? 3 : 2 }}
                          />
                          <KonvaText
                            x={0} y={GRID_SIZE / 2 - 6}
                            width={3 * GRID_SIZE}
                            align="center"
                            text={`[GATE] ${gate.name}${isActive ? ' (YOU)' : ''}`}
                            fontSize={14}
                            fontStyle="bold"
                            fill="#ffffff"
                            listening={false}
                          />
                        </Group>
                      );
                    })}
                  </Layer>
                </Stage>
              )}
            </div>
          </Col>
        </>
      </Row>
    </div>
  );
};

