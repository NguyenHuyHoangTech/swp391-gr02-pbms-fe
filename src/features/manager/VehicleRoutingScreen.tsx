/**
 * @Author: Nguyen Huu Thanh (TH)
 * @Date: 2026-07-16
 * @Description: Màn hình cấu hình điều phối xe tự động cho Manager. Cho phép dựng
 *   chuỗi ưu tiên giữa các khu vực vãng lai theo từng khung giờ, đặt ngưỡng lấp đầy
 *   kích hoạt việc đẩy xe sang khu kế tiếp, xem biểu đồ mật độ theo giờ và xin gợi ý
 *   cấu hình từ trợ lý AI.
 * @Dependencies:
 * - axiosClient (Local: core/api) - gọi /manager/routing-rules, /infrastructure/map/config,
 *   /system/configs, /manager/ai/routing-advice
 * - @tanstack/react-query (External) - fetch/cache cấu hình và dữ liệu biểu đồ
 * - antd, @ant-design/icons (External) - Card, Select, InputNumber, Modal
 */
/**
 * ============================================================================
 * [IMPORT LIBRARIES & UTILITIES] - Các thư viện và công cụ tiện ích
 * ============================================================================
 * 1. React & Hooks: useState, useEffect, useMemo... quản lý trạng thái, vòng đời và cache tính toán.
 * 2. Ant Design (antd): Cung cấp các UI component phong phú (Select, Card, Switch, Modal, Table...).
 * 3. Recharts: Thư viện vẽ biểu đồ đường (LineChart) trực quan hóa mật độ đỗ xe theo giờ.
 * 4. Axios & Utilities: axiosClient (gửi HTTP Request), timeProvider (xử lý thời gian mô phỏng).
 * ============================================================================
 */
import { useState, useEffect, useMemo } from 'react';
import { 
  Typography, Select, Button, InputNumber, Input, 
  Card, message, Space, Tooltip, Spin, DatePicker, Switch, Modal, Table 
} from 'antd';
import { 
  SaveOutlined, 
  NodeIndexOutlined,
  CaretLeftOutlined,
  CaretRightOutlined,
  DashboardOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
  RobotOutlined
} from '@ant-design/icons';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Legend, ReferenceLine, ResponsiveContainer, Tooltip as RechartsTooltip
} from 'recharts';
import axiosClient from '../../core/api/axiosClient';
import { simulatedDayjs, useSystemTime } from '../../core/utils/timeProvider';

const { Title, Text } = Typography;

/**
 * ============================================================================
 * MÔ TẢ TỔNG QUAN VỀ LUỒNG DỮ LIỆU & TƯƠNG TÁC CỦA VEHICLE ROUTING SCREEN
 * ============================================================================
 *
 * [PHẦN 1] MỤC ĐÍCH & VAI TRÒ CỦA COMPONENT:
 *    - Giao diện quản lý và cấu hình điều phối xe tự động (Automatic Zone Coordination).
 *    - Chịu trách nhiệm: Hiển thị biểu đồ tỷ lệ lấp đầy theo giờ từ cảm biến AI/IoT,
 *      thiết lập luật ưu tiên & ngưỡng trần đỗ xe cho từng khung giờ, và cung cấp
 *      công cụ AI Gemini tư vấn tối ưu hóa phân bổ không gian đỗ xe.
 *
 * [PHẦN 2] GIẢI PHẪU VÒNG ĐỜI DỮ LIỆU (DATA FLOW LIFECYCLE) KÈM MINH CHỨNG:
 *
 * BƯỚC 1: KHỞI TẠO DỮ LIỆU NỀN & CẤU HÌNH BẢN ĐỒ
 * - Minh chứng 1 (API Bản đồ): Gọi `GET /infrastructure/map/config` (hàm fetchMapConfig)
 *   để tải danh sách Tầng (floors), Khu vực (zones) và Loại phương tiện (vehicleTypes).
 * - Minh chứng 2 (API Cấu hình): Gọi `GET /system/configs` (hàm fetchSystemConfig)
 *   để đọc cờ `DISPLAY_ROUTING` xác định chế độ hiển thị biển báo ưu tiên tại cổng.
 *
 * BƯỚC 2: GIÁM SÁT TỶ LỆ LẤP ĐẦY TRÊN BIỂU ĐỒ (ZONE TRENDS MONITORING)
 * - Minh chứng (API Trends): Gọi `GET /manager/zone-trends` (hàm fetchTrends)
 *   lấy lịch sử mật độ sử dụng từng giờ của các khu vực vãng lai (WALK_IN),
 *   vẽ ranh giới đỏ cảnh báo tại ngưỡng 90% (Critical Threshold).
 *
 * BƯỚC 3: CẤU HÌNH LUẬT ĐIỀU PHỐI THEO KHUNG GIỜ (TIMEFRAME ROUTING RULES)
 * - Minh chứng (API Rules): Gọi `GET /manager/routing-rules` (hàm fetchRules) và
 *   `PUT /manager/routing-rules` (hàm handleSave) để lưu các luật xếp hạng ưu tiên
 *   và ngưỡng lấp đầy (fillThresholdPct) cho từng khung giờ vận hành.
 *
 * BƯỚC 4: TƯ VẤN ĐIỀU PHỐI THÔNG MINH QUA AI GEMINI (AI ADVISOR)
 * - Minh chứng (API AI): Gọi `POST /manager/ai/routing-advice` (hàm handleAskAi)
 *   gửi dữ liệu biểu đồ và cấu hình khung giờ lên máy chủ AI Gemini để nhận đề xuất
 *   phân bổ lại luồng xe tự động tối ưu nhất.
 * ============================================================================
 */

// ============================================================================
// [PHẦN ĐỊNH NGHĨA DTOs] - Các kiểu dữ liệu trao đổi với Backend
// ============================================================================
interface ZoneTrendDTO {
  timeWindow: string;    // Khung giờ theo dõi (ví dụ: "08:00")
  zoneId: number;        // Mã định danh khu vực đỗ xe
  zoneName: string;      // Tên khu vực (ví dụ: "Khu A - Tầng 1")
  occupancyPct: number;  // Tỷ lệ lấp đầy (%) tại thời điểm ghi nhận
}

interface RuleItemDTO {
  id?: number;              // Mã định danh quy tắc (nếu đã lưu)
  zoneId: number;           // Mã khu vực được áp dụng quy tắc
  zoneName: string;         // Tên khu vực hiển thị
  fillThresholdPct: number; // Ngưỡng tỷ lệ lấp đầy tối đa cho phép rẽ vào (%)
  suggestedZoneId?: number; // Mã khu vực gợi ý chuyển tiếp khi vượt ngưỡng
  suggestedZoneName?: string;// Tên khu vực gợi ý chuyển tiếp
}

interface TimeFrameRuleDTO {
  timeFrameId: string;    // Mã định danh khung giờ (hoặc ID tạm thời tf_xxx)
  name: string;           // Tên hiển thị của khung giờ
  startTime: string | null;// Giờ bắt đầu (HH:mm)
  endTime: string | null;  // Giờ kết thúc (HH:mm)
  isDefault: boolean;     // Cờ xác định khung giờ mặc định (áp dụng ngoài các khung giờ cụ thể)
  rules: RuleItemDTO[];   // Danh sách quy tắc điều phối ứng với từng khu vực
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];

export const VehicleRoutingScreen = () => {
  /**
   * ============================================================================
   * [QUẢN LÝ TRẠNG THÁI] - CÁC STATE NÒNG CỐT CỦA MÀN HÌNH
   * ============================================================================
   * Nhóm 1: Bộ lọc & Lựa chọn cấu hình bãi xe
   */
  const [selectedFloor, setSelectedFloor] = useState<number | null>(null);   // Tầng đang chọn trên dropdown
  const [selectedVehicle, setSelectedVehicle] = useState<string>('');        // Loại phương tiện đang chọn (CAR, MOTO...)
  
  const [floors, setFloors] = useState<any[]>([]);                           // Danh sách Tầng tải từ Map Config
  const [vehicleTypes, setVehicleTypes] = useState<any[]>([]);               // Danh sách Loại xe tải từ Map Config
  const [zones, setZones] = useState<any[]>([]);                             // Danh sách Khu vực (Zones) bãi đỗ
  const [calendarDates, setCalendarDates] = useState<any>(null);             // Giới hạn chọn ngày trên DatePicker
  
  /**
   * Nhóm 2: Bộ nhớ đệm xác nhận (Confirmed State) - Tránh tải lại khi chưa bấm Confirm
   */
  const [confirmedFloor, setConfirmedFloor] = useState<number | null>(null); // Tầng đã xác nhận áp dụng
  const [confirmedVehicle, setConfirmedVehicle] = useState<string>('');      // Loại xe đã xác nhận áp dụng
  
  /**
   * Nhóm 3: Trạng thái tải dữ liệu & Luật điều phối (Routing Rules)
   */
  const [loading, setLoading] = useState(false);                             // Cờ báo đang tải dữ liệu từ API
  const [saving, setSaving] = useState(false);                               // Cờ báo đang lưu cấu hình xuống Backend
  const [timeFrames, setTimeFrames] = useState<TimeFrameRuleDTO[]>([]);      // Danh sách khung giờ & luật điều phối hiện tại
  const [initialTimeFrames, setInitialTimeFrames] = useState<TimeFrameRuleDTO[]>([]);// Bản sao cấu hình ban đầu để so sánh thay đổi
  const [chartDataRaw, setChartDataRaw] = useState<ZoneTrendDTO[]>([]);      // Dữ liệu thô biểu đồ lấp đầy theo giờ
  
  /**
   * Hàm so sánh sâu (Deep Comparison) kiểm tra người dùng có chỉnh sửa cấu hình hay chưa.
   * Dùng để bật/tắt nút LƯU CẤU HÌNH (disabled={!isDirty}).
   */
  const deepEqual = (obj1: any, obj2: any): boolean => {
    if (obj1 === obj2) return true;
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object' || obj1 == null || obj2 == null) return false;
    let keys1 = Object.keys(obj1);
    let keys2 = Object.keys(obj2);
    if (keys1.length !== keys2.length) return false;
    for (let key of keys1) {
      if (!keys2.includes(key) || !deepEqual(obj1[key], obj2[key])) return false;
    }
    return true;
  };

  const isDirty = initialTimeFrames.length > 0 && !deepEqual(timeFrames, initialTimeFrames);
  const [selectedTrendDateRange, setSelectedTrendDateRange] = useState<any>([simulatedDayjs().subtract(1, 'day'), simulatedDayjs()]);
  const simulatedToday = useSystemTime().format('YYYY-MM-DD');
  
  /**
   * Nhóm 4: Cờ hiển thị điều phối trên biển báo IoT (System Config: DISPLAY_ROUTING)
   */
  const [displayRouting, setDisplayRouting] = useState<boolean>(true);

  /**
   * Nhóm 5: Trạng thái cỗ máy tư vấn AI Gemini (AI Advisor State)
   */
  const [isAiModalVisible, setIsAiModalVisible] = useState(false);           // Bật/tắt modal tư vấn AI
  const [extraContext, setExtraContext] = useState('');                      // Ghi chú bổ sung từ người quản lý cho AI
  const [aiResponse, setAiResponse] = useState<any>(null);                   // Kết quả phân tích và đề xuất từ AI Gemini
  const [isAiLoading, setIsAiLoading] = useState(false);                     // Cờ báo đang gửi request sang máy chủ Gemini

  useEffect(() => {
    setSelectedTrendDateRange([simulatedDayjs().subtract(1, 'day'), simulatedDayjs()]);
  }, [simulatedToday]);

  /**
   * ============================================================================
   * [API 1] LẤY CẤU HÌNH HIỂN THỊ ĐIỀU PHỐI (SYSTEM CONFIG: DISPLAY_ROUTING)
   * ============================================================================
   * MỤC ĐÍCH: Kiểm tra cờ hệ thống xem màn hình hướng dẫn rẽ tại các cổng có đang
   * được bật hiển thị khu vực gợi ý hay không.
   * CƠ CHẾ: Gọi `GET /system/configs`, lọc theo từ khóa `DISPLAY_ROUTING`. Nếu giá trị
   * là 'FALSE', bảng điện tử tại cổng sẽ hiển thị "FREE", ngược lại hiển thị khu vực gợi ý.
   * ============================================================================
   */
  const fetchSystemConfig = async () => {
    try {
      const res = await axiosClient.get('/system/configs');
      const config = res.data.data.find((c: any) => c.configKey === 'DISPLAY_ROUTING');
      if (config && config.configValue === 'FALSE') {
        setDisplayRouting(false);
      } else {
        setDisplayRouting(true);
      }
    } catch (error) {
      console.error("Error fetching system configs", error);
    }
  };

  /**
   * ============================================================================
   * [API 2] BẬT/TẮT CỜ HIỂN THỊ ĐIỀU PHỐI (TOGGLE DISPLAY ROUTING)
   * ============================================================================
   * MỤC ĐÍCH: Cho phép quản lý bật hoặc tắt tính năng hiển thị chỉ dẫn khu vực
   * đỗ trên biển báo IoT ngay tức thời.
   * THỰC THI: Gửi request `PUT /system/configs/{id}` (hoặc POST tạo mới) cập nhật
   * giá trị 'TRUE' / 'FALSE', đồng thời hiển thị thông báo phản hồi cho người dùng.
   * ============================================================================
   */
  const toggleDisplayRouting = async (checked: boolean) => {
    try {
      setLoading(true);
      const res = await axiosClient.get('/system/configs');
      const config = res.data.data.find((c: any) => c.configKey === 'DISPLAY_ROUTING');
      if (config) {
        await axiosClient.put(`/system/configs/${config.id}`, { ...config, configValue: checked ? 'TRUE' : 'FALSE' });
      } else {
        await axiosClient.post('/system/configs', { configKey: 'DISPLAY_ROUTING', configValue: checked ? 'TRUE' : 'FALSE', description: 'Enable or disable suggested zone routing display' });
      }
      setDisplayRouting(checked);
      message.success(`Routing display ${checked ? 'enabled' : 'disabled'}. Incoming vehicles will ${checked ? 'show suggested zone' : 'show FREE'}.`);
    } catch (error) {
      message.error("Failed to update routing display config");
    } finally {
      setLoading(false);
    }
  };

  /**
   * ============================================================================
   * [API 3] TẢI LUẬT ĐIỀU PHỐI THEO LOẠI XE VÀ TẦNG (FETCH ROUTING RULES)
   * ============================================================================
   * MỤC ĐÍCH: Tải ma trận điều phối xe theo khung giờ từ Backend cho một loại phương tiện cụ thể.
   * CƠ CHẾ: Gửi `GET /manager/routing-rules?vehicleType=...&floorId=...`.
   * Kết quả nhận về được lưu vào cả `timeFrames` (để chỉnh sửa trên UI) và
   * `initialTimeFrames` (để kiểm tra xem có thay đổi chưa).
   * ============================================================================
   */
  const fetchRules = async (vehicleType: string, floorId?: number) => {
    try {
      setLoading(true);
      let url = `/manager/routing-rules?vehicleType=${encodeURIComponent(vehicleType)}`;
      if (floorId) url += `&floorId=${floorId}`;
      const res = await axiosClient.get(url);
      const data: TimeFrameRuleDTO[] = res.data.data || [];
      setTimeFrames(data);
      setInitialTimeFrames(JSON.parse(JSON.stringify(data)));
    } catch (error) {
      message.error("Error loading dispatcher configuration");
    } finally {
      setLoading(false);
    }
  };

  /**
   * ============================================================================
   * [API 4] TẢI DỮ LIỆU BIỂU ĐỒ LẤP ĐẦY THEO GIỜ (FETCH ZONE TRENDS)
   * ============================================================================
   * MỤC ĐÍCH: Kéo dữ liệu thống kê tỷ lệ lấp đầy theo thời gian thực (hoặc theo ngày chọn)
   * của từng khu vực để vẽ lên biểu đồ đường Recharts.
   * CƠ CHẾ: Gọi `GET /manager/zone-trends` kèm tham số thời gian (`startDate`, `endDate`)
   * và lọc theo `vehicleTypeId`.
   * ============================================================================
   */
  const fetchTrends = async (overrideVehicleTypeId?: number) => {
    try {
      const targetVehicleTypeId = overrideVehicleTypeId || vehicleTypes.find(v => v.typeName === confirmedVehicle)?.id;
      const startDateStr = selectedTrendDateRange?.[0]?.format('YYYY-MM-DD') || simulatedDayjs().format('YYYY-MM-DD');
      const endDateStr = selectedTrendDateRange?.[1]?.format('YYYY-MM-DD') || simulatedDayjs().format('YYYY-MM-DD');
      
      let url = `/manager/zone-trends?startDate=${startDateStr}&endDate=${endDateStr}`;
      if (targetVehicleTypeId) {
        url += `&vehicleTypeId=${targetVehicleTypeId}`;
      }
      
      const res = await axiosClient.get(url);
      setChartDataRaw(res.data.data || []);
    } catch (error) {
      console.error("Error when loading chart", error);
    }
  };

  /**
   * ============================================================================
   * [API 5] TẢI CẤU HÌNH TỔNG THỂ BÃI XE (FETCH MAP CONFIG)
   * ============================================================================
   * MỤC ĐÍCH: Lấy thông tin bản đồ, danh sách tầng, khu vực đỗ và loại xe.
   * Tự động chọn tầng đầu tiên làm tầng mặc định khi mới tải trang.
   * ============================================================================
   */
  const fetchMapConfig = async () => {
    try {
      const res = await axiosClient.get('/infrastructure/map/config');
      const data = res.data.data;
      if (data) {
        if (data.floors) setFloors(data.floors);
        if (data.vehicleTypes) setVehicleTypes(data.vehicleTypes);
        if (data.zones) setZones(data.zones);
        
        if (data.floors && data.floors.length > 0) {
          setSelectedFloor(data.floors[0].id);
          setConfirmedFloor(data.floors[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading map configuration", error);
    }
  };

  /**
   * ============================================================================
   * [NÚT XÁC NHẬN BỘ LỌC] - HANDLE CONFIRM
   * ============================================================================
   * MỤC ĐÍCH: Xác nhận áp dụng loại xe và tầng đã chọn để tải lại luật điều phối
   * và dữ liệu biểu đồ. Tránh việc gọi API liên tục mỗi khi người dùng đổi dropdown.
   * ============================================================================
   */
  const handleConfirm = () => {
    setConfirmedFloor(selectedFloor);
    setConfirmedVehicle(selectedVehicle);
    if (selectedVehicle) {
      fetchRules(selectedVehicle, selectedFloor ?? undefined);
    }
    fetchTrends();
  };

  /**
   * [EFFECT 1]: Khởi tạo tải cấu hình bản đồ và cờ hiển thị khi tải trang lần đầu
   */
  useEffect(() => {
    fetchMapConfig();
    fetchSystemConfig();
  }, []);

  useEffect(() => {
    if (selectedTrendDateRange) {
      fetchTrends();
    }
  }, [selectedTrendDateRange]);

  const handleFloorChange = (val: number) => {
    setSelectedFloor(val);
  };

  /**
   * [EFFECT 2]: Tự động đồng bộ loại xe phù hợp với tầng vừa chọn
   * Khi người dùng đổi tầng, tự động chọn loại phương tiện thuộc danh mục tầng đó
   * và tải dữ liệu ngay trong lần tải trang đầu tiên.
   */
  useEffect(() => {
    if (selectedFloor && floors.length > 0 && vehicleTypes.length > 0) {
      const floorObj = floors.find(f => f.id === selectedFloor);
      if (floorObj) {
        const validVehicles = vehicleTypes.filter(v => v.category === floorObj.type);
        if (validVehicles.length > 0) {
          const typeName = validVehicles[0].typeName;
          setSelectedVehicle(typeName);
          
          // Auto-fetch on initial load
          if (!confirmedVehicle || confirmedFloor === null) {
            setConfirmedVehicle(typeName);
            setConfirmedFloor(selectedFloor);
            fetchRules(typeName, selectedFloor);
            fetchTrends(validVehicles[0].id);
          }
        } else {
          setSelectedVehicle('');
        }
      }
    }
  }, [selectedFloor, floors, vehicleTypes]);

  /**
   * ============================================================================
   * [TÍNH TOÁN & CHUYỂN ĐỔI DỮ LIỆU BIỂU ĐỒ] - CHART DATA TRANSFORMATION
   * ============================================================================
   * MỤC ĐÍCH: Chuyển đổi danh sách dữ liệu thô (`chartDataRaw`) trả về từ API thành
   * định dạng ma trận { timeWindow, ZoneA, ZoneB... } để tương thích với thư viện
   * Recharts vẽ LineChart.
   * CƠ CHẾ: Lọc các khu vực vãng lai (`WALK_IN`) của tầng và loại xe đã xác nhận,
   * gom nhóm tỷ lệ lấp đầy (`occupancyPct`) theo từng mốc giờ (`timeWindow`).
   * ============================================================================
   */
  const { chartData, zoneNames } = useMemo(() => {
    const timeMap = new Map<string, any>();
    const zIds = new Set<number>();
    const zNamesMap = new Map<number, string>();
    const targetVehicleTypeId = vehicleTypes.find(v => v.typeName === confirmedVehicle)?.id;

    zones.forEach(zoneObj => {
      if (zoneObj.floorId === confirmedFloor && zoneObj.vehicleTypeId === targetVehicleTypeId && zoneObj.functionType === 'WALK_IN') {
        zIds.add(zoneObj.id);
        zNamesMap.set(zoneObj.id, zoneObj.name || zoneObj.zoneName);
      }
    });

    chartDataRaw.forEach(item => {
      if (zIds.has(item.zoneId)) {
        if (!timeMap.has(item.timeWindow)) {
          timeMap.set(item.timeWindow, { timeWindow: item.timeWindow });
        }
        const dataPoint = timeMap.get(item.timeWindow);
        const zName = zNamesMap.get(item.zoneId) || item.zoneName;
        dataPoint[zName] = item.occupancyPct;
      }
    });

    const flattened = Array.from(timeMap.values()).sort((a, b) => {
      // timeWindow is now "HH:00 dd/MM"
      // We shouldn't rely on string sort directly if dates change month, but for short ranges it's mostly ok if parsed.
      // But since the backend already sends them in order, maybe we can just keep their insertion order or trust it.
      // Wait, backend sends by date then by hour. If we collect them in timeMap, they will be in order.
      return 0; // maintain insertion order which matches backend chronological order
    });
    
    Array.from(zNamesMap.values()).forEach(z => {
      for (let i = 0; i < flattened.length; i++) {
        if (flattened[i][z] === undefined || flattened[i][z] === null) {
          flattened[i][z] = 0;
        }
      }
    });

    return { chartData: flattened, zoneNames: Array.from(zNamesMap.values()) };
  }, [chartDataRaw, selectedTrendDateRange, confirmedFloor, confirmedVehicle, vehicleTypes, zones]);

  /**
   * ============================================================================
   * [CÁC THAO TÁC XỬ LÝ KHUNG GIỜ & LUẬT ĐIỀU PHỐI] - MATRIX MANIPULATION
   * ============================================================================
   */

  /**
   * [THAO TÁC 1]: Di chuyển thứ tự ưu tiên khu vực đỗ sang TRÁI / PHẢI
   * Khu vực nằm bên trái có ưu tiên cao hơn (Priority #1, #2...).
   */
  const moveZone = (frameId: string, index: number, direction: 'LEFT' | 'RIGHT') => {
    setTimeFrames(prev => prev.map(tf => {
      if (tf.timeFrameId !== frameId) return tf;
      const newRules = [...tf.rules];
      if (direction === 'LEFT' && index > 0) {
        const temp = newRules[index];
        newRules[index] = newRules[index - 1];
        newRules[index - 1] = temp;
      } else if (direction === 'RIGHT' && index < newRules.length - 1) {
        const temp = newRules[index];
        newRules[index] = newRules[index + 1];
        newRules[index + 1] = temp;
      }
      return { ...tf, rules: newRules };
    }));
  };

  /**
   * [THAO TÁC 2]: Cập nhật ngưỡng lấp đầy tối đa (`fillThresholdPct`) cho khu vực
   */
  const updateThreshold = (frameId: string, index: number, value: number | null) => {
    if (value === null) return;
    setTimeFrames(prev => prev.map(tf => {
      if (tf.timeFrameId !== frameId) return tf;
      const newRules = [...tf.rules];
      newRules[index] = { ...newRules[index], fillThresholdPct: value };
      return { ...tf, rules: newRules };
    }));
  };

  /**
   * [THAO TÁC 3]: Cập nhật giờ bắt đầu / kết thúc của một khung giờ cụ thể
   */
  const handleFrameChange = (frameId: string, field: 'startTime' | 'endTime', value: string) => {
    setTimeFrames(prev => prev.map(tf => {
      if (tf.timeFrameId !== frameId) return tf;
      return { ...tf, [field]: value };
    }));
  };

  const handleAddFrame = () => {
    const defaultFrame = timeFrames.find(tf => tf.isDefault);
    
    let newRules: any[] = [];
    if (defaultFrame) {
      newRules = defaultFrame.rules.map(r => ({ ...r, id: undefined }));
    } else {
      const vt = vehicleTypes.find(v => v.typeName === confirmedVehicle);
      const availableZones = zones.filter(z => z.vehicleTypeId === vt?.id && z.zoneType === 'WALK_IN' && z.status !== 'DELETED' && z.floorId === confirmedFloor);
      newRules = availableZones.map((z, idx) => ({
        zoneId: z.id,
        zoneName: z.zoneName,
        priority: idx + 1,
        fillThresholdPct: 90
      }));
    }
    
    setTimeFrames(prev => {
      const copy = [...prev];
      const hasDefault = copy.some(tf => tf.isDefault);
      const defaultIdx = copy.findIndex(tf => tf.isDefault);
      
      const newFrame = {
        timeFrameId: `tf_${Date.now()}`,
        name: hasDefault ? `New time frame` : `Default Time Frame`,
        startTime: hasDefault ? '07:00' : '00:00',
        endTime: hasDefault ? '10:00' : '23:59',
        isDefault: !hasDefault,
        rules: newRules
      };

      if (hasDefault && defaultIdx >= 0) {
        copy.splice(defaultIdx, 0, newFrame);
      } else {
        copy.push(newFrame);
      }
      return copy;
    });
  };

  const handleRemoveFrame = (frameId: string) => {
    setTimeFrames(prev => prev.filter(tf => tf.timeFrameId !== frameId));
  };

  /**
   * ============================================================================
   * [KIỂM TRA TRÙNG LẶP KHUNG GIỜ] - OVERLAP VALIDATION
   * ============================================================================
   * MỤC ĐÍCH: Ngăn chặn lỗi người dùng cấu hình 2 khung giờ bị gối lên nhau
   * (ví dụ: Khung A 07:00 - 10:00 và Khung B 09:00 - 12:00) gây xung đột phán đoán.
   * THỰC THI: Quy đổi giờ HH:mm ra số phút từ đầu ngày và kiểm tra giao điểm khoảng.
   * ============================================================================
   */
  const checkOverlapping = () => {
    const specificFrames = timeFrames.filter(tf => !tf.isDefault);
    for (let i = 0; i < specificFrames.length; i++) {
      const f1 = specificFrames[i];
      if (!f1.startTime || !f1.endTime) {
        message.error("Please fill in the full start and end times");
        return true;
      }
      for (let j = i + 1; j < specificFrames.length; j++) {
        const f2 = specificFrames[j];
        if (!f2.startTime || !f2.endTime) continue;

        // Convert HH:mm to minutes for comparison
        const start1 = parseInt(f1.startTime.split(':')[0]) * 60 + parseInt(f1.startTime.split(':')[1]);
        const end1 = parseInt(f1.endTime.split(':')[0]) * 60 + parseInt(f1.endTime.split(':')[1]);
        const start2 = parseInt(f2.startTime.split(':')[0]) * 60 + parseInt(f2.startTime.split(':')[1]);
        const end2 = parseInt(f2.endTime.split(':')[0]) * 60 + parseInt(f2.endTime.split(':')[1]);

        if (start1 < end2 && start2 < end1) {
          message.error(`Time frame ${f1.startTime}-${f1.endTime} overlaps with frame ${f2.startTime}-${f2.endTime}`);
          return true; // overlapping
        }
      }
    }
    return false;
  };

  /**
   * ============================================================================
   * [LƯU CẤU HÌNH LUẬT ĐIỀU PHỐI VỀ BACKEND] - SAVE CONFIGURATION
   * ============================================================================
   * MỤC ĐÍCH: Gửi cấu hình luật ưu tiên & ngưỡng lấp đầy của các khung giờ
   * về Backend qua API `PUT /manager/routing-rules` để cập nhật cơ sở dữ liệu
   * và có hiệu lực ngay lập tức tại cổng ra vào.
   * ============================================================================
   */
  const handleSave = async () => {
    if (checkOverlapping()) return;

    try {
      setSaving(true);
      const payload = {
        vehicleTypeName: selectedVehicle,
        floorId: confirmedFloor,
        timeFrames: timeFrames.map(tf => ({
          startTime: tf.startTime,
          endTime: tf.endTime,
          isDefault: tf.isDefault,
          rules: tf.rules.map(r => ({
            zoneId: r.zoneId,
            fillThresholdPct: r.fillThresholdPct
          }))
        }))
      };
      await axiosClient.put(`/manager/routing-rules`, payload);
      message.success('Dispatcher configuration saved Success!');
      if (selectedVehicle && confirmedFloor) {
        fetchRules(selectedVehicle, confirmedFloor);
      }
    } catch (error) {
      message.error("Error when saving configuration");
    } finally {
      setSaving(false);
    }
  };

  /**
   * ============================================================================
   * [GỌI AI GEMINI TƯ VẤN ĐIỀU PHỐI] - ASK AI ROUTING ADVISOR
   * ============================================================================
   * MỤC ĐÍCH: Gửi yêu cầu tư vấn điều phối tự động sang máy chủ Google Gemini AI.
   * CƠ CHẾ: Lọc chỉ gửi dữ liệu biểu đồ của các khu vực vãng lai (WALK_IN), kết hợp
   * cấu hình khung giờ hiện tại và lời dặn bổ sung (`extraContext`) từ người dùng
   * tới endpoint `POST /manager/ai/routing-advice`.
   * HẬU XỬ LÝ: Dọn dẹp chuỗi JSON trả về từ LLM để hiển thị dưới dạng bảng trực quan.
   * ============================================================================
   */
  const handleAskAi = async () => {
    try {
      setIsAiLoading(true);
      setAiResponse(null);

      // Filter chart data to only send WALK_IN zones to AI
      const targetVehicleTypeId = vehicleTypes.find(v => v.typeName === confirmedVehicle)?.id;
      const walkInZoneIds = new Set<number>();
      zones.forEach(zoneObj => {
        if (zoneObj.floorId === confirmedFloor && zoneObj.vehicleTypeId === targetVehicleTypeId && (zoneObj.functionType === 'WALK_IN' || zoneObj.zoneType === 'WALK_IN')) {
          walkInZoneIds.add(zoneObj.id);
        }
      });
      const filteredChartData = chartDataRaw.filter(item => walkInZoneIds.has(item.zoneId));

      const payload = {
        vehicleType: confirmedVehicle,
        dateRange: `${selectedTrendDateRange?.[0]?.format('DD/MM/YYYY')} - ${selectedTrendDateRange?.[1]?.format('DD/MM/YYYY')}`,
        chartData: filteredChartData,
        extraContext,
        isRoutingEnabled: displayRouting,
        currentRules: timeFrames
      };
      const res = await axiosClient.post('/manager/ai/routing-advice', payload);
      let adviceStr = res.data.data;
      
      try {
        let cleanStr = adviceStr;
        const firstBrace = cleanStr.indexOf('{');
        const lastBrace = cleanStr.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          cleanStr = cleanStr.substring(firstBrace, lastBrace + 1);
        }
        const parsed = JSON.parse(cleanStr);
        setAiResponse(parsed);
      } catch (e) {
        setAiResponse({ raw: adviceStr });
      }
    } catch (error: any) {
      message.error(error.response?.data?.message || "AI connection error");
    } finally {
      setIsAiLoading(false);
    }
  };

  /**
   * ============================================================================
   * [GIAO DIỆN CHÍNH CỦA VEHICLE ROUTING SCREEN - RENDER PANEL]
   * ============================================================================
   * Bao gồm 5 thành phần kiến trúc giao diện lớn:
   * 1. HEADER BAR: Chọn tầng, loại xe, bật/tắt biển báo hướng dẫn và nút Confirm.
   * 2. CHART SECTION: Biểu đồ đường (LineChart) tỷ lệ lấp đầy khu vực theo giờ.
   * 3. ROUTING MATRIX: Danh sách khung giờ và các ô quy tắc ưu tiên có thể kéo/thả.
   * 4. BOTTOM ACTION BAR: Cụm nút bấm Lưu cấu hình và gọi Tư vấn AI Gemini.
   * 5. AI ADVISOR MODAL: Cửa sổ nhập ngữ cảnh và xem đề xuất cấu hình từ AI.
   * ============================================================================
   */
  return (
    <div className="flex-1 overflow-y-auto bg-gray-50 pb-24 relative">
      
      {/* 
       * ============================================================================
       * [THÀNH PHẦN 1] HEADER BAR - THANH ĐIỀU KHIỂN & BỘ LỌC TẦNG / LOẠI XE
       * ============================================================================
       * Chức năng:
       * - Hiển thị tiêu đề và lời dẫn mô tả chức năng điều phối xe tự động.
       * - Switch 'Routing Display': Bật/tắt chế độ hiển thị tên khu vực ưu tiên trên
       *   biển báo IoT tại cổng (nếu tắt, biển báo chỉ hiện 'FREE').
       * - Select Floor & Vehicle Type: Lọc cấu hình bãi xe theo tầng và loại phương tiện.
       * - Nút Confirm: Chốt bộ lọc để gửi request tải lại Luật điều phối và Biểu đồ,
       *   tránh việc gọi API dồn dập mỗi khi người dùng thao tác dropdown.
       * ============================================================================
       */}
      <div className="bg-white px-8 py-5 border-b border-gray-200 sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div>
          <Title level={2} className="m-0 text-gray-800">Automatic Zone Coordination</Title>
          <Text type="secondary" className="text-base">Set up smart vehicle routing for each time frame based on water level threshold</Text>
        </div>
        
        <Space size="middle" className="bg-gray-50 p-2 rounded-xl border border-gray-200">
           <div className="flex items-center gap-2 px-2 border-r border-gray-300 mr-2 pr-4">
             <Text strong className="text-gray-600">Routing Display</Text>
             <Switch 
               checked={displayRouting} 
               onChange={toggleDisplayRouting}
               checkedChildren="ON"
               unCheckedChildren="OFF"
               className={displayRouting ? 'bg-blue-600' : 'bg-gray-400'}
             />
           </div>
           <Select 
              value={selectedFloor} 
              onChange={handleFloorChange}
              options={floors.map(f => ({ label: `Floor ${f.name}`, value: f.id }))}
              className="w-32"
              size="large"
              bordered={false}
              placeholder="Select floor"
           />
           <div className="w-px h-6 bg-gray-300"></div>
           <Select 
              value={selectedVehicle}
              onChange={setSelectedVehicle}
              options={
                selectedFloor 
                  ? vehicleTypes
                      .filter(v => {
                        const floorObj = floors.find(f => f.id === selectedFloor);
                        return floorObj ? v.category === floorObj.type : false;
                      })
                      .map(v => ({ 
                        label: v.typeName === 'CAR' ? 'Car' : (v.typeName === 'MOTO' ? 'Motorbike' : v.typeName), 
                        value: v.typeName 
                      }))
                  : []
              }
              className="w-32"
              size="large"
              bordered={false}
              placeholder="Select car"
           />
           <Button type="primary" onClick={handleConfirm} loading={loading}>
             Confirm
           </Button>
        </Space>
      </div>

      {/* 
       * ============================================================================
       * [THÀNH PHẦN 2] CHART SECTION - BIỂU ĐỒ GIÁM SÁT TỶ LỆ LẤP ĐẦY THEO GIỜ
       * ============================================================================
       * Chức năng:
       * - Vẽ biểu đồ đường (Recharts LineChart) trực quan hóa mật độ đỗ xe trung bình
       *   theo từng giờ trong ngày của các khu vực vãng lai (WALK_IN).
       * - Bộ lọc ngày (RangePicker): Cho phép xem xu hướng lấp đầy trong khoảng thời gian
       *   tối đa 31 ngày để người quản lý đưa ra quyết định đặt ngưỡng trần hợp lý.
       * - ReferenceLine (Ngưỡng 90%): Đường đứt đoạn màu đỏ cảnh báo mức độ lấp đầy
       *   nguy hiểm (Critical Threshold), vượt qua ngưỡng này bãi xe dễ xảy ra ùn tắc.
       * ============================================================================
       */}
      <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mb-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <Title level={4} className="m-0 flex items-center gap-2"><DashboardOutlined className="text-blue-600"/>  Water Leveling Each Zone Automatically</Title>
              <Text type="secondary">Measure peak fill every hour through AI/IoT Sensor System</Text>
            </div>
            <div className="flex flex-col items-end gap-2">
              <DatePicker.RangePicker 
                value={selectedTrendDateRange} 
                onChange={setSelectedTrendDateRange} 
                onCalendarChange={(val) => setCalendarDates(val)}
                disabledDate={(current) => {
                  if (!calendarDates || calendarDates.length === 0 || !calendarDates[0] || calendarDates[1]) {
                    return false;
                  }
                  const tooLate = calendarDates[0] && current.diff(calendarDates[0], 'days') > 31;
                  const tooEarly = calendarDates[0] && calendarDates[0].diff(current, 'days') > 31;
                  return !!tooEarly || !!tooLate;
                }}
                format="DD/MM/YYYY" 
                allowClear={false}
              />
              <div className="text-sm bg-blue-50 text-blue-700 px-3 py-1.5 rounded-lg border border-blue-100 font-medium">
                 
                                               Update automatically every hour
                                            </div>
            </div>
          </div>
          
          {zoneNames.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="timeWindow" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dx={-10} domain={[0, 100]} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`${value}%`, '']}
                />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: '10px' }} />
                
                <ReferenceLine y={90} stroke="#ef4444" strokeDasharray="5 5" strokeWidth={2} label={{ position: 'top', value: 'Critical Threshold 90%', fill: '#ef4444', fontSize: 12, fontWeight: 'bold' }} />
                
                {zoneNames.map((zName, idx) => (
                  <Line 
                    key={zName}
                    type="monotone" 
                    dataKey={zName}
                    name={zName} 
                    stroke={COLORS[idx % COLORS.length]} 
                    strokeWidth={3}
                    dot={{r: 4, strokeWidth: 2}}
                    activeDot={{r: 6}}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
              No walk-in zones available for this configuration to track water level.
            </div>
          )}
        </div>
      </div>

      {/* 
       * ============================================================================
       * [THÀNH PHẦN 3] ROUTING MATRIX - MA TRẬN LUẬT ĐIỀU PHỐI THEO KHUNG GIỜ
       * ============================================================================
       * Chức năng:
       * - Hiển thị danh sách các Thẻ (Card) tương ứng với từng Khung Giờ (Time Frame),
       *   ví dụ: Khung cao điểm 07:00 - 10:00 hoặc Khung mặc định (Default Time Frame).
       * - Bên trái mỗi Thẻ: Cấu hình Giờ bắt đầu (startTime) & Giờ kết thúc (endTime),
       *   nút xóa Khung Giờ (trừ khung mặc định).
       * - Bên phải mỗi Thẻ: Danh sách các ô Khu Vực Đỗ theo thứ tự ưu tiên từ Trái sang Phải
       *   (#1 là ưu tiên cao nhất). Người dùng có thể:
       *   + Chỉnh sửa Ngưỡng lấp đầy tối đa (Threshold - %): Xe chỉ được dẫn vào khu vực
       *     khi mật độ hiện tại chưa vượt ngưỡng này.
       *   + Kéo/thả di chuyển thứ tự ưu tiên sang Trái (CaretLeft) hoặc Phải (CaretRight).
       * ============================================================================
       */}
      <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full pt-0">
        <div className="flex justify-between items-center mb-6">
           <div>
             <Title level={3} className="m-0 flex items-center gap-2 text-gray-800">
               <NodeIndexOutlined className="text-blue-600" />  Configuration According to Time Frame
                                       </Title>
             <Text type="secondary">Add time frames and drag and drop to prioritize the flow for each frame. The last frame is redundant</Text>
           </div>
           <Button type="primary" ghost icon={<PlusOutlined />} onClick={handleAddFrame}>Add Time Frame</Button>
        </div>

        <Spin spinning={loading}>
          <div className="flex flex-col gap-6">
            {timeFrames.map((frame, frameIdx) => (
              <Card 
                key={frame.timeFrameId} 
                className={`shadow-sm rounded-xl overflow-hidden [&_.ant-card-body]:p-6 transition-all ${frame.isDefault ? 'border-indigo-400 bg-indigo-50/20' : 'border-gray-300'}`}
              >
                <div className="flex flex-col xl:flex-row gap-6">
                  
                  {/* Left: Time Info */}
                  <div className="w-full xl:w-64 shrink-0 flex flex-col justify-start border-b xl:border-b-0 xl:border-r border-gray-200 pb-4 xl:pb-0 xl:pr-6 relative">
                    <div className={`text-lg font-bold mb-2 ${frame.isDefault ? 'text-indigo-800' : 'text-blue-800'}`}>
                      {frame.name}
                    </div>
                    
                    {!frame.isDefault && (
                      <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                        <ClockCircleOutlined />
                        <Input 
                          value={frame.startTime || ''} 
                          onChange={e => handleFrameChange(frame.timeFrameId, 'startTime', e.target.value)}
                          placeholder="07:00"
                          className="w-20 text-center font-mono" size="small"
                        />
                        <span>-</span>
                        <Input 
                          value={frame.endTime || ''} 
                          onChange={e => handleFrameChange(frame.timeFrameId, 'endTime', e.target.value)}
                          placeholder="10:00"
                          className="w-20 text-center font-mono" size="small"
                        />
                      </div>
                    )}
                    
                    {frame.isDefault && (
                      <div className="text-sm text-gray-500 italic">
                        
                                                            Applicable outside the specific time frames above
                                                          </div>
                    )}

                    {!frame.isDefault && (
                      <Button 
                        type="text" 
                        danger 
                        icon={<DeleteOutlined />} 
                        className="absolute right-0 top-0 xl:static xl:mt-auto xl:w-fit"
                        onClick={() => handleRemoveFrame(frame.timeFrameId)}
                      >
                        Delete Frame
                      </Button>
                    )}
                  </div>

                  {/* Right: Zones Rules */}
                  <div className="flex-1 overflow-x-auto pb-2">
                    <div className="flex items-center gap-2 min-w-max">
                      {frame.rules.map((rule, index) => (
                        <div key={rule.zoneId} className="flex items-center gap-2">
                          <div className={`flex flex-col items-center justify-between p-3 rounded-xl border transition-all w-48 bg-white
                            ${index === 0 ? 'border-blue-400 shadow-sm' : 'border-gray-200'}
                          `}>
                            
                            <div className="flex items-center w-full gap-2 mb-2 border-b border-gray-100 pb-2">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs shrink-0
                                ${index === 0 ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`
                              }>
                                {index + 1}
                              </div>
                              <div className="font-bold text-gray-800 text-sm truncate">{rule.zoneName}</div>
                            </div>

                            <div className="flex items-center justify-between w-full">
                              <div className="flex flex-col items-start">
                                <span className="text-[10px] text-gray-400 uppercase tracking-wide">Threshold</span>
                                <InputNumber 
                                  value={rule.fillThresholdPct} 
                                  onChange={(val) => updateThreshold(frame.timeFrameId, index, val)}
                                  min={0} max={100}
                                  size="small"
                                  formatter={(value) => `${value}%`}
                                  parser={(value) => value!.replace('%', '') as unknown as number}
                                  className="w-16 text-center text-xs text-red-600 font-semibold"
                                />
                              </div>
                              
                              <div className="flex gap-1">
                                <Button 
                                  type="text" size="small" icon={<CaretLeftOutlined />} 
                                  disabled={index === 0}
                                  onClick={() => moveZone(frame.timeFrameId, index, 'LEFT')}
                                />
                                <Button 
                                  type="text" size="small" icon={<CaretRightOutlined />} 
                                  disabled={index === frame.rules.length - 1}
                                  onClick={() => moveZone(frame.timeFrameId, index, 'RIGHT')}
                                />
                              </div>
                            </div>

                          </div>
                          
                          {/* Connection Arrow */}
                          {index < frame.rules.length - 1 && (
                            <div className="flex items-center text-gray-300">
                              <div className="w-6 h-0.5 bg-gray-300"></div>
                              <div className="w-0 h-0 border-t-4 border-t-transparent border-b-4 border-b-transparent border-l-6 border-l-gray-300"></div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </Card>
            ))}
          </div>
        </Spin>
      </div>

      {/* 
       * ============================================================================
       * [THÀNH PHẦN 4] BOTTOM ACTION BAR - THANH CÔNG CỤ THAO TÁC CỐ ĐỊNH ĐÁY
       * ============================================================================
       * Chức năng:
       * - Nút 'AI Suggestion': Mở Modal nhờ AI Gemini phân tích dữ liệu biểu đồ
       *   và tư vấn cách sắp xếp ưu tiên khu vực / khung giờ.
       * - Nút 'SAVE THE COORDINATE CONFIGURATION': Gửi request `PUT /manager/routing-rules`
       *   để lưu cấu hình về Backend. Nút bị disable khi cấu hình chưa thay đổi (`!isDirty`).
       * ============================================================================
       */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-50 flex justify-end px-8">
         <Space size="large">
            <Text type="secondary" className="hidden sm:inline-block">The configuration will be synchronized to the Backend and Gate immediately</Text>
            <Button
               type="default"
               size="large"
               icon={<RobotOutlined />}
               onClick={() => setIsAiModalVisible(true)}
               className="border-purple-500 text-purple-600 hover:text-purple-700 hover:border-purple-600 font-bold px-6 h-12 text-lg shadow-sm"
            >
               AI Suggestion
            </Button>
            <Button 
              type="primary" 
              size="large" 
              icon={<SaveOutlined />} 
              onClick={handleSave}
              disabled={!isDirty}
              loading={saving}
              className="bg-blue-600 hover:bg-blue-500 font-bold px-8 h-12 text-lg shadow-md"
            >
              SAVE THE COORDINATE CONFIGURATION
            </Button>
         </Space>
      </div>

      {/* 
       * ============================================================================
       * [THÀNH PHẦN 5] AI ADVISOR MODAL - CỬA SỔ TƯ VẤN ĐIỀU PHỐI TỪ AI GEMINI
       * ============================================================================
       * Chức năng:
       * - Cho phép người quản lý nhập thêm ngữ cảnh bãi xe (extraContext), ví dụ:
       *   "Khu A gần thang máy cần ưu tiên, Khu B đang bảo trì...".
       * - Gửi dữ liệu biểu đồ + luật hiện tại sang máy chủ Gemini AI để phân tích.
       * - Hiển thị kết quả suy luận (Reasoning) và Bảng đề xuất khung giờ mới từ AI.
       * ============================================================================
       */}
      <Modal
        title={<span><RobotOutlined className="text-purple-600 mr-2"/> Zone Routing Advisor (AI)</span>}
        open={isAiModalVisible}
        onCancel={() => !isAiLoading && setIsAiModalVisible(false)}
        width={800}
        footer={null}
        maskClosable={false}
      >
        {!aiResponse ? (
          <div className="py-4">
            <Text className="block mb-2 text-gray-700">
              AI will analyze the occupancy data of <b>{confirmedVehicle}</b> from the chart below to suggest the optimal routing. Do you want to provide additional context about the zones? (Optional)
            </Text>
            <Input.TextArea
              rows={4}
              placeholder="E.g. Zone A is near the elevator so it should be prioritized, Zone B has a narrow path so restrict entry during peak hours..."
              value={extraContext}
              onChange={e => setExtraContext(e.target.value)}
              disabled={isAiLoading}
            />
            <div className="mt-6 flex justify-end">
              <Button type="primary" onClick={handleAskAi} loading={isAiLoading} className="bg-purple-600" size="large">
                Send Analysis Request
              </Button>
            </div>
          </div>
        ) : (
          <div className="py-4">
            {aiResponse.raw ? (
              <div>
                <Text strong className="text-red-500 block mb-2">AI returned a format that cannot be parsed into a UI table. Here is the raw result:</Text>
                <div className="bg-gray-100 p-4 rounded whitespace-pre-wrap text-sm font-mono overflow-auto max-h-96">
                  {aiResponse.raw}
                </div>
              </div>
            ) : (
              <div>
                <Text strong className="block mb-2 text-lg text-purple-800">AI Analysis:</Text>
                <div className="bg-purple-50 p-4 rounded-lg mb-6 border border-purple-100">
                  <Text className="text-gray-800 italic">"{aiResponse.reasoning}"</Text>
                </div>
                
                <Text strong className="block mb-4 text-lg">Suggested Timeframes Configuration:</Text>
                {aiResponse.timeFrames?.map((tf: any, i: number) => (
                  <Card key={i} className="mb-4 shadow-sm border-gray-200" size="small" title={<span className="font-bold">{tf.name} ({tf.startTime} - {tf.endTime})</span>}>
                    <Table 
                      dataSource={tf.rules} 
                      pagination={false} 
                      size="small"
                      rowKey={(record: any) => record.zoneName}
                      columns={[
                        { title: 'Priority', dataIndex: 'priority', key: 'priority', render: text => <span className="font-bold text-blue-600">#{text}</span> },
                        { title: 'Zone', dataIndex: 'zoneName', key: 'zoneName', render: text => <span className="font-medium">{text}</span> },
                        { title: 'Threshold', dataIndex: 'threshold', key: 'threshold', render: text => <span>{text}%</span> },
                      ]}
                    />
                  </Card>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <Button onClick={() => setAiResponse(null)} disabled={isAiLoading}>Re-analyze</Button>
              <Button type="primary" onClick={() => setIsAiModalVisible(false)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
