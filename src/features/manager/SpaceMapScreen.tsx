/**
 * @Author: Nguyen Huu Thanh (TH)
 * @Date: 2026-07-12
 * @Description: Màn hình cấu hình sơ đồ bãi đỗ (SpaceMap) cho Manager. Cho phép
 *   vẽ/kéo thả/xoay Zone, Slot, Gate trên canvas theo lưới, phát hiện va chạm,
 *   đồng bộ trạng thái slot realtime và lưu toàn bộ layout lên server.
 * @Dependencies:
 * - axiosClient (Local: core/api) - gọi API /infrastructure/map/config, /map/save,
 *   /slots/{id}/status, /gates/{id}/command
 * - useWebSocket (Local: core/websocket) - nhận cập nhật trạng thái slot realtime
 * - getImageUrl (Local: core/utils/imageHelper) - dựng URL icon loại xe
 * - react-konva / konva (External) - vẽ và animate canvas
 * - @tanstack/react-query (External) - fetch/cache cấu hình bản đồ
 * - antd, @ant-design/icons (External) - UI panel cấu hình
 */
import React, { useState, useEffect, useRef } from 'react';
import { Typography, Button, message, Spin, Input, Select, InputNumber, Collapse, Slider, Switch, Radio, notification, Badge, Tooltip, Modal } from 'antd';
import {
  SaveOutlined, SyncOutlined, AimOutlined, PlusOutlined,
  SettingOutlined, CompassOutlined, GatewayOutlined,
  CloseCircleOutlined, SwapRightOutlined, SwapLeftOutlined,
  StopOutlined, DeleteOutlined, ZoomInOutlined, ZoomOutOutlined
} from '@ant-design/icons';
import { Stage, Layer, Line, Group, Rect, Text as KonvaText, Label, Tag, Image as KonvaImage } from 'react-konva';
import { useQuery, useMutation } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import Konva from 'konva';

/**
 * @Function: URLImage
 * @Description: Vẽ 1 ảnh (icon loại xe) lên canvas Konva. Tự nạp ảnh bất đồng bộ,
 *   chỉ render sau khi ảnh load xong để tránh vẽ ảnh rỗng.
 */
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

const { Title, Text } = Typography;
const { Panel } = Collapse;

/** Kích thước (px) của 1 ô lưới. Mọi toạ độ/kích thước trên canvas là bội số của giá trị này để snap vào lưới chính xác. */
const GRID_SIZE = 50;

interface Floor {
  id: number;
  name: string;
  type: 'FOUR_WHEEL' | 'TWO_WHEEL';
  mapCols: number;
  mapRows: number;
}

interface Slot {
  id: string;
  name: string;
  status: 'EMPTY' | 'OCCUPIED' | 'DISABLED';
  plate?: string;
}

interface Zone {
  id: number;
  floorId: number;
  name: string;
  capacity: number;
  vehicleTypeId: number;
  vehicleTypeName?: string;
  vehicleCategory?: string;
  functionType: 'WALK_IN' | 'MONTHLY';
  layoutX: number;
  layoutY: number;
  rotation: number;
  slots: Slot[];
  activeReservationsCount?: number;
}

interface Gate {
  id: string | number;
  floorId: number;
  name: string;
  type: 'ENTRY' | 'EXIT' | 'ENTRY_EXIT';
  status: 'IDLE' | 'OCCUPIED' | 'MAINTENANCE' | string;
  staffName?: string;
  layoutX: number;
  layoutY: number;
  rotation: number;
  vehicleTypeId?: number;
  pendingCommand?: string | null;
}

interface VehicleType {
  id: number;
  typeName: string;
  category: 'FOUR_WHEEL' | 'TWO_WHEEL';
  matrixWidth: number;
  matrixHeight: number;
  iconUrl?: string;
}

type SelectedEntity =
  | { type: 'ZONE'; id: number }
  | { type: 'SLOT'; zoneId: number; slotId: string }
  | { type: 'GATE'; id: string | number }
  | null;

/**
 * @Function: getVehicleDimensions
 * @Description: Tính kích thước thật (px) của 1 chỗ đỗ theo loại xe. Trả về kích
 *   thước mặc định 3x6 ô nếu không tìm thấy loại xe, tránh vẽ hình kích thước 0.
 */
const getVehicleDimensions = (typeId: number, vehicleTypes: VehicleType[]) => {
  const type = vehicleTypes.find(v => v.id === typeId);
  if (type) {
      return { width: type.matrixWidth * GRID_SIZE, height: type.matrixHeight * GRID_SIZE };
  }
  return { width: 3 * GRID_SIZE, height: 6 * GRID_SIZE };
};

export const SpaceMapScreen = () => {

  const [zones, setZones] = useState<Zone[]>([]);
  const [gates, setGates] = useState<Gate[]>([]);
  const [floors, setFloors] = useState<Floor[]>([]);
  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);

  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['0', '1', '2', '4']);
  const [collidingNodeId, setCollidingNodeId] = useState<string | null>(null);

  const getComparableMapState = (f: Floor[], z: Zone[], g: Gate[]) => {
    return {
      floors: f,
      zones: z.map(zone => ({ ...zone, slots: [] })),
      gates: g
    };
  };

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

  const [initialMapState, setInitialMapState] = useState<any>(null);
  const isDirty = initialMapState !== null && !deepEqual(getComparableMapState(floors, zones, gates), initialMapState);

  const [selectedFloorId, setSelectedFloorId] = useState<number>(1);

  const activeFloor = floors.find(f => f.id === selectedFloorId);
  const mapCols = activeFloor?.mapCols || 60;
  const mapRows = activeFloor?.mapRows || 40;

  /**
   * @Function: handleUpdateMapSize
   * @Description: Đổi số cột/hàng của tầng đang chọn, chặn nếu kích thước mới làm
   *   Zone/Gate (đã tính góc xoay) rớt ra ngoài biên bản đồ.
   * @Logic_Steps:
   * 1. Tính biên mới mapW/mapH theo cols/rows.
   * 2. Với mỗi Zone của tầng: tính bounding box thật theo rotation, nếu vượt biên -> isOutside.
   * 3. Nếu Zone hợp lệ, lặp tương tự cho Gate.
   * 4. Nếu isOutside -> báo lỗi, dừng.
   * 5. Ngược lại cập nhật mapCols/mapRows cho đúng tầng đang chọn.
   */
  const handleUpdateMapSize = (cols: number, rows: number) => {
    const mapW = cols * GRID_SIZE;
    const mapH = rows * GRID_SIZE;
    let isOutside = false;

    const currentZones = zones.filter(z => z.floorId === selectedFloorId);
    for (const z of currentZones) {
       const { width: slotW, height: slotH } = getVehicleDimensions(z.vehicleTypeId, vehicleTypes);
       let zw = z.capacity * slotW;
       let zh = slotH;
       if (z.rotation === 90 || z.rotation === 270) { zw = slotH; zh = z.capacity * slotW; }

       let zx = z.layoutX; let zy = z.layoutY;
       if (z.rotation === 90) zx -= zw;
       else if (z.rotation === 180) { zx -= zw; zy -= zh; }
       else if (z.rotation === 270) zy -= zh;

       if (zx + zw > mapW || zy + zh > mapH) {
           isOutside = true;
           break;
       }
    }

    if (!isOutside) {
        const currentGates = gates.filter(g => g.floorId === selectedFloorId);
        for (const g of currentGates) {
           let gw = 3 * GRID_SIZE;
           let gh = GRID_SIZE;
           if (g.vehicleTypeId) {
               const vt = vehicleTypes.find(v => v.id === g.vehicleTypeId);
               if (vt) gw = vt.matrixWidth * GRID_SIZE;
           }
           if (g.rotation === 90 || g.rotation === 270) {
               const temp = gw; gw = gh; gh = temp;
           }
           let gx = g.layoutX; let gy = g.layoutY;
           if (g.rotation === 90) gx -= gw;
           else if (g.rotation === 180) { gx -= gw; gy -= gh; }
           else if (g.rotation === 270) gy -= gh;

           if (gx + gw > mapW || gy + gh > mapH) {
               isOutside = true;
               break;
           }
        }
    }

    if (isOutside) {
        message.error('Không thể giảm kích thước vì có Zone hoặc Gate bị rớt ra ngoài bản đồ!');
        return;
    }

    setFloors(prev => prev.map(f => f.id === selectedFloorId ? { ...f, mapCols: cols, mapRows: rows } : f));
  };

  const stageRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });
  const [stageScale, setStageScale] = useState(1);
  const [defaultScale, setDefaultScale] = useState(1);

  const { stompClient, connected } = useWebSocket();

  /**
   * @Function: mapConfig query
   * @Description: Lấy toàn bộ cấu hình bản đồ (floors/zones/gates/vehicleTypes) 1
   *   lần khi vào màn hình. BE bọc dữ liệu trong ApiResponse nên phải bóc res.data.data.
   */
  const { data: mapConfigData, refetch } = useQuery({
    queryKey: ['mapConfig'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/map/config');
      return res.data.data;
    }
  });

  /**
   * @Description: Đồng bộ dữ liệu server vào state cục bộ để người dùng chỉnh sửa
   *   trước khi Save. Nếu tầng đang chọn không còn tồn tại thì nhảy về tầng đầu tiên.
   */
  useEffect(() => {
    if (mapConfigData) {
      if (mapConfigData.floors && mapConfigData.floors.length > 0) {
        setFloors(mapConfigData.floors);
        if (!selectedFloorId || !mapConfigData.floors.find((f: any) => f.id === selectedFloorId)) {
          setSelectedFloorId(mapConfigData.floors[0].id);
        }
      }
      if (mapConfigData.zones) setZones(mapConfigData.zones);
      if (mapConfigData.gates) setGates(mapConfigData.gates);
      if (mapConfigData.vehicleTypes) setVehicleTypes(mapConfigData.vehicleTypes);

      setInitialMapState(getComparableMapState(
        mapConfigData.floors || [],
        mapConfigData.zones || [],
        mapConfigData.gates || []
      ));
    }
  }, [mapConfigData]);

  /**
   * @Description: Lắng nghe realtime trạng thái slot qua WebSocket và cập nhật vào
   *   state. BE gửi "AVAILABLE" nhưng FE dùng "EMPTY" nên map lại giá trị này.
   */
  useEffect(() => {
    if (stompClient && connected) {
      const subscription = stompClient.subscribe('/topic/slots/status', (message) => {
        const payload = JSON.parse(message.body);
        setZones(prevZones => prevZones.map(z => ({
          ...z,
          slots: z.slots.map(s => {
            if (s.id === String(payload.slotId)) {
              return { ...s, status: payload.status === 'AVAILABLE' ? 'EMPTY' : payload.status };
            }
            return s;
          })
        })));
      });

      return () => {
        subscription.unsubscribe();
      };
    }
  }, [stompClient, connected]);

  /**
   * @Description: Khi đổi tầng, bỏ chọn Zone/Slot/Gate nếu nó không thuộc tầng mới,
   *   tránh panel cấu hình hiển thị nhầm dữ liệu của tầng đang ẩn.
   */
  useEffect(() => {
    if (selectedEntity) {
       let keep = false;
       if (selectedEntity.type === 'ZONE' || selectedEntity.type === 'SLOT') {
          const zId = selectedEntity.type === 'ZONE' ? (selectedEntity as any).id : selectedEntity.zoneId;
          if (zones.find(z => z.id === zId)?.floorId === selectedFloorId) keep = true;
       } else if (selectedEntity.type === 'GATE') {
          if (gates.find(g => g.id === (selectedEntity as any).id)?.floorId === selectedFloorId) keep = true;
       }
       if (!keep) setSelectedEntity(null);
    }
  }, [selectedFloorId, zones, gates]);

  const visibleZones = zones.filter(z => z.floorId === selectedFloorId);
  const visibleGates = gates.filter(g => g.floorId === selectedFloorId);

  /**
   * @Description: Theo dõi kích thước khung chứa canvas, cập nhật khi resize cửa sổ.
   *   Delay 100ms để đợi layout flexbox tính xong, tránh đo sai lúc vừa mount.
   */
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    const timer = setTimeout(updateSize, 100);
    window.addEventListener('resize', updateSize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateSize);
    };
  }, []);

  /**
   * @Description: Tính lại tỉ lệ zoom "vừa khít màn hình" và canh giữa canvas mỗi
   *   khi kích thước bản đồ hoặc khung chứa đổi. Kết quả cũng làm defaultScale
   *   (mức zoom-out tối thiểu).
   */
  useEffect(() => {
    if (containerSize.width > 0 && containerSize.height > 0) {
      const mapW = mapCols * GRID_SIZE;
      const mapH = mapRows * GRID_SIZE;

      const scale = Math.min(containerSize.width / mapW, containerSize.height / mapH) * 0.95;
      const minScaleLocked = Math.min(scale, 1);

      setDefaultScale(minScaleLocked);
      setStageScale(minScaleLocked);

      setStagePos({
        x: (containerSize.width - mapW * minScaleLocked) / 2,
        y: (containerSize.height - mapH * minScaleLocked) / 2
      });
    }
  }, [mapCols, mapRows, containerSize]);

  /**
   * @Function: handleZoomToBox
   * @Description: Zoom + trượt camera (Konva.Tween) tới đúng 1 vùng chữ nhật.
   * @Logic_Steps:
   * 1. Tính scaleX/scaleY để box vừa khít khung (trừ padding 2 mép).
   * 2. Lấy min 2 tỉ lệ rồi kẹp vào [defaultScale, 4].
   * 3. Tính tâm box, suy ra vị trí stage để tâm nằm giữa khung nhìn.
   * 4. Chạy Tween 0.5s tới vị trí/tỉ lệ mới, kết thúc thì lưu vào state.
   */
  const handleZoomToBox = (boxX: number, boxY: number, boxW: number, boxH: number, padding: number = 50) => {
    if (!stageRef.current || !containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    const containerH = containerRef.current.clientHeight;

    const scaleX = (containerW - padding * 2) / boxW;
    const scaleY = (containerH - padding * 2) / boxH;
    let newScale = Math.min(scaleX, scaleY);
    newScale = Math.max(defaultScale, Math.min(newScale, 4));

    const centerX = boxX + boxW / 2;
    const centerY = boxY + boxH / 2;

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
   * @Function: handleZoom
   * @Description: Zoom in/out theo tâm khung nhìn (dùng cho nút +/-), giữ nguyên
   *   điểm đang nhìn ở giữa để không lệch vị trí.
   */
  const handleZoom = (factor: number) => {
    if (!stageRef.current || !containerRef.current) return;
    const oldScale = stageScale;
    let newScale = oldScale * factor;
    newScale = Math.max(defaultScale, Math.min(newScale, 5));

    const center = {
      x: containerRef.current.clientWidth / 2,
      y: containerRef.current.clientHeight / 2,
    };

    const mousePointTo = {
      x: (center.x - stagePos.x) / oldScale,
      y: (center.y - stagePos.y) / oldScale,
    };

    setStageScale(newScale);
    setStagePos({
      x: center.x - mousePointTo.x * newScale,
      y: center.y - mousePointTo.y * newScale,
    });
  };

  /** @Description: Đưa canvas về tỉ lệ và vị trí "vừa khít màn hình" ban đầu. */
  const handleZoomFit = () => {
    if (!containerRef.current) return;
    const mapW = mapCols * GRID_SIZE;
    const mapH = mapRows * GRID_SIZE;

    const scale = Math.min(containerRef.current.clientWidth / mapW, containerRef.current.clientHeight / mapH) * 0.95;
    const minScaleLocked = Math.min(scale, 1);

    setStageScale(minScaleLocked);
    setStagePos({
      x: (containerRef.current.clientWidth - mapW * minScaleLocked) / 2,
      y: (containerRef.current.clientHeight - mapH * minScaleLocked) / 2
    });
  };

  /**
   * @Function: handleZoomZone
   * @Description: Chọn 1 Zone và zoom camera tới đó. Tính lại bounding box theo góc
   *   xoay vì layoutX/layoutY là điểm neo trước khi xoay, không phải góc trên-trái thật.
   */
  const handleZoomZone = (zoneId: number) => {
    const zone = zones.find(z => z.id === zoneId);
    if (!zone) return;
    setSelectedEntity({ type: 'ZONE', id: zone.id });

    const { width: slotW, height: slotH } = getVehicleDimensions(zone.vehicleTypeId, vehicleTypes);
    let zoneW = zone.capacity * slotW;
    let zoneH = slotH;
    if (zone.rotation === 90 || zone.rotation === 270) {
      zoneW = slotH;
      zoneH = zone.capacity * slotW;
    }

    let boxX = zone.layoutX;
    let boxY = zone.layoutY;
    if (zone.rotation === 90) boxX -= zoneW;
    else if (zone.rotation === 180) { boxX -= zoneW; boxY -= zoneH; }
    else if (zone.rotation === 270) boxY -= zoneH;

    handleZoomToBox(boxX, boxY, zoneW, zoneH, 100);
  };

  /** @Description: Kiểm tra 2 hình chữ nhật có chồng lấn không. Dùng chung cho phát hiện va chạm khi kéo thả và khi validate lúc Save. */
  const checkIntersection = (rect1: any, rect2: any) => {
    return !(
      rect2.x > rect1.x + rect1.width ||
      rect2.x + rect2.width < rect1.x ||
      rect2.y > rect1.y + rect1.height ||
      rect2.y + rect2.height < rect1.y
    );
  };

  /**
   * @Function: handleDragMove
   * @Description: Chạy liên tục khi kéo Zone/Gate. Quy đổi toạ độ hiển thị về toạ
   *   độ thật, kiểm tra vượt biên và đè lên phần tử khác, chỉ đổi màu viền cảnh báo.
   * @Logic_Steps:
   * 1. Lấy client rect của node, quy về toạ độ bản đồ (bỏ zoom/pan).
   * 2. Nếu vượt biên map -> hasCollision.
   * 3. Ngược lại duyệt các zoneGroup/gateGroup anh em, nếu giao nhau -> hasCollision.
   * 4. Đặt attr isColliding + cập nhật collidingNodeId để JSX tô viền đỏ nét đứt.
   */
  const handleDragMove = (e: any, id: number | string, isZone: boolean) => {
    const node = e.target;
    const stage = node.getStage();
    const layer = node.getLayer();
    const nodeRect = node.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
    const mapW = mapCols * GRID_SIZE;
    const mapH = mapRows * GRID_SIZE;

    const stageTransform = stage.getAbsoluteTransform().copy();
    stageTransform.invert();
    const absRect = {
      x: (nodeRect.x - stage.x()) / stage.scaleX(),
      y: (nodeRect.y - stage.y()) / stage.scaleY(),
      width: nodeRect.width / stage.scaleX(),
      height: nodeRect.height / stage.scaleY()
    };

    let hasCollision = false;

    if (absRect.x < 0 || absRect.y < 0 || absRect.x + absRect.width > mapW || absRect.y + absRect.height > mapH) {
      hasCollision = true;
    } else {
      for (const child of layer.getChildren()) {
        if (child !== node && (child.name() === 'zoneGroup' || child.name() === 'gateGroup')) {
          const otherRect = child.getClientRect({ skipTransform: false, skipShadow: true, skipStroke: true });
          if (checkIntersection(nodeRect, otherRect)) {
            hasCollision = true;
            break;
          }
        }
      }
    }

    if (hasCollision) {
      if (collidingNodeId !== String(id)) setCollidingNodeId(String(id));
      node.setAttr('isColliding', true);
    } else {
      if (collidingNodeId === String(id)) setCollidingNodeId(null);
      node.setAttr('isColliding', false);
    }
  };

  /**
   * @Function: handleDragEnd
   * @Description: Chạy khi thả chuột. Nếu đang va chạm thì trả object về vị trí cũ,
   *   ngược lại snap toạ độ về đúng lưới và lưu vị trí mới vào state.
   */
  const handleDragEnd = (e: any, id: number | string, isZone: boolean) => {
    setCollidingNodeId(null);
    const node = e.target;
    if (node.getAttr('isColliding')) {
      const previousState = isZone ? zones.find(z => z.id === id) : gates.find(g => g.id === id);
      if (previousState) {
        node.position({ x: previousState.layoutX, y: previousState.layoutY });
      }
      node.setAttr('isColliding', false);
      message.error('Invalid location due to duplicate or off map!');
      return;
    }

    const x = Math.round(node.x() / GRID_SIZE) * GRID_SIZE;
    const y = Math.round(node.y() / GRID_SIZE) * GRID_SIZE;
    node.position({ x, y });

    if (isZone) {
      setZones(prev => prev.map(z => z.id === id ? { ...z, layoutX: x, layoutY: y } : z));
    } else {
      setGates(prev => prev.map(g => g.id === id ? { ...g, layoutX: x, layoutY: y } : g));
    }
  };

  /** @Description: Xoay 1 Zone thêm 90 độ mỗi lần bấm (0 -> 90 -> 180 -> 270 -> 0). */
  const handleRotateZone = (zoneId: number) => {
    setZones(prev => prev.map(z => z.id === zoneId ? { ...z, rotation: (z.rotation + 90) % 360 } : z));
  };

  /**
   * @Function: findEmptyPosition
   * @Description: Tìm ô lưới trống đầu tiên đủ chỗ cho 1 Zone/Gate mới (w x h).
   * @Logic_Steps:
   * 1. Gom bounding box (đã tính rotation) của mọi Zone/Gate đang hiển thị vào rects.
   * 2. Quét lưới trái->phải, trên->dưới theo bước GRID_SIZE.
   * 3. Tại mỗi ô, nếu không giao với rect nào -> trả về {x, y}.
   * 4. Không còn chỗ -> trả về null.
   */
  const findEmptyPosition = (w: number, h: number) => {
    const mapW = mapCols * GRID_SIZE;
    const mapH = mapRows * GRID_SIZE;

    const rects = [];
    for (const z of visibleZones) {
       const { width: slotW, height: slotH } = getVehicleDimensions(z.vehicleTypeId, vehicleTypes);
       let zw = z.capacity * slotW;
       let zh = slotH;
       if (z.rotation === 90 || z.rotation === 270) { zw = slotH; zh = z.capacity * slotW; }

       let zx = z.layoutX; let zy = z.layoutY;
       if (z.rotation === 90) zx -= zw;
       else if (z.rotation === 180) { zx -= zw; zy -= zh; }
       else if (z.rotation === 270) zy -= zh;

       rects.push({ x: zx, y: zy, width: zw, height: zh });
    }
    for (const g of visibleGates) {
       let gw = 3 * GRID_SIZE;
       let gh = GRID_SIZE;
       if (g.vehicleTypeId) {
           const vt = vehicleTypes.find(v => v.id === g.vehicleTypeId);
           if (vt) gw = vt.matrixWidth * GRID_SIZE;
       }
       if (g.rotation === 90 || g.rotation === 270) {
           const temp = gw; gw = gh; gh = temp;
       }
       let gx = g.layoutX; let gy = g.layoutY;
       if (g.rotation === 90) gx -= gw;
       else if (g.rotation === 180) { gx -= gw; gy -= gh; }
       else if (g.rotation === 270) gy -= gh;
       rects.push({ x: gx, y: gy, width: gw, height: gh });
    }

    for (let y = 0; y <= mapH - h; y += GRID_SIZE) {
      for (let x = 0; x <= mapW - w; x += GRID_SIZE) {
         const newRect = { x, y, width: w, height: h };
         let collision = false;
         for (const r of rects) {
           if (!(r.x >= newRect.x + newRect.width || r.x + r.width <= newRect.x ||
                 r.y >= newRect.y + newRect.height || r.y + r.height <= newRect.y)) {
              collision = true;
              break;
           }
         }
         if (!collision) return { x, y };
      }
    }
    return null;
  };

  /**
   * @Function: handleAddZone
   * @Description: Tạo Zone mới 5 chỗ đỗ, dùng loại xe đầu tiên hợp với tầng đang
   *   chọn, tự tìm vị trí trống. Báo lỗi nếu không có loại xe phù hợp hoặc map đầy.
   */
  const handleAddZone = () => {
    const activeFloor = floors.find(f => f.id === selectedFloorId);
    const validVehicleTypes = vehicleTypes.filter(v => v.category === activeFloor?.type);
    if (validVehicleTypes.length === 0) {
      message.error("There are no vehicles suitable for this floor! Please create a vehicle type first");
      return;
    }
    const defaultVehicleType = validVehicleTypes[0];
    const { width: slotW, height: slotH } = getVehicleDimensions(defaultVehicleType.id, vehicleTypes);
    const capacity = 5;
    const w = capacity * slotW;
    const h = slotH;

    const pos = findEmptyPosition(w, h);
    if (!pos) {
      message.error("The map is full, there are no more vacancies to add new Zones!");
      return;
    }

    const newId = Date.now();
    const newZone: Zone = {
      id: newId,
      floorId: selectedFloorId,
      name: `New Zone`,
      capacity: capacity,
      vehicleTypeId: defaultVehicleType.id,
      functionType: 'WALK_IN',
      layoutX: pos.x,
      layoutY: pos.y,
      rotation: 0,
      slots: Array.from({length: capacity}).map((_, i) => ({ id: `${Date.now()}${i}`, name: `N${i+1}`, status: 'EMPTY' }))
    };

    setZones(prev => [...prev, newZone]);
    setSelectedEntity({ type: 'ZONE', id: newId });
    if (!expandedKeys.includes('2')) setExpandedKeys(prev => [...prev, '2']);
  };

  /** @Description: Như handleAddZone nhưng tạo Gate (cổng ra/vào), kích thước mặc định 3x1 ô khi chưa gán loại xe. */
  const handleAddGate = () => {
    const pos = findEmptyPosition(3 * GRID_SIZE, GRID_SIZE);
    if (!pos) {
      message.error("The map is full, there are no vacancies left to add new Gates!");
      return;
    }

    const newId = Date.now().toString();
    const newGate: Gate = {
      id: newId,
      floorId: selectedFloorId,
      name: `Gate ${gates.length + 1}`,
      type: 'ENTRY_EXIT',
      status: 'IDLE',
      layoutX: pos.x,
      layoutY: pos.y,
      rotation: 0,
      vehicleTypeId: undefined
    };
    setGates(prev => [...prev, newGate]);
    setSelectedEntity({ type: 'GATE', id: newId });
    if (!expandedKeys.includes('4')) setExpandedKeys(prev => [...prev, '4']);
  };

  /**
   * @Function: handleUpdateZoneCapacity
   * @Description: Đổi số chỗ đỗ của Zone. Tăng thì thêm slot trống ở cuối; giảm thì
   *   cắt bớt ở cuối (LIFO) nhưng chặn nếu slot bị cắt đang có xe.
   */
  const handleUpdateZoneCapacity = (zoneId: number, newCapacity: number) => {
    setZones(prev => prev.map(z => {
      if (z.id !== zoneId) return z;
      if (newCapacity === z.capacity) return z;

      let newSlots = [...z.slots];
      if (newCapacity > z.capacity) {
        for (let i = z.capacity; i < newCapacity; i++) {
          newSlots.push({ id: `${Date.now()}${i}`, name: `S${i+1}`, status: 'EMPTY' });
        }
      } else {
        const removedSlots = newSlots.slice(newCapacity);
        const hasOccupied = removedSlots.some(s => s.status !== 'EMPTY');
        if (hasOccupied) {
          message.error('Can\'t cut it! The cut off spaces are currently parked');
          return z;
        }
        newSlots = newSlots.slice(0, newCapacity);
      }
      return { ...z, capacity: newCapacity, slots: newSlots };
    }));
  };

  /**
   * @Function: handleToggleSlotStatus
   * @Description: Bật/tắt chế độ bảo trì (DISABLED) cho 1 slot. Chặn từ client nếu
   *   slot đang có xe (OCCUPIED), gọi API rồi cập nhật state ngay để UI phản hồi nhanh.
   */
  const handleToggleSlotStatus = async (zoneId: number, slotId: string, newStatus: 'EMPTY' | 'DISABLED') => {
    const zone = zones.find(z => z.id === zoneId);
    const slot = zone?.slots.find(s => s.id === slotId);
    if (slot && slot.status === 'OCCUPIED') {
      message.warning('Can\'t do maintenance on a cell that has a car!');
      return;
    }

    try {
      await axiosClient.put(`/infrastructure/slots/${slotId}/status`, { status: newStatus });
      setZones(prev => prev.map(z => {
        if (z.id !== zoneId) return z;
        return {
          ...z,
          slots: z.slots.map(s => s.id === slotId ? { ...s, status: newStatus } : s)
        };
      }));
      message.success(`Status updated successfully!`);
    } catch (err: any) {
      message.error(err.response?.data?.message || 'Error when updating cell Status');
    }
  };

  /**
   * @Function: handleGateCommand
   * @Description: Gửi lệnh điều khiển tới 1 Gate. Nếu cổng đang IDLE thì áp dụng
   *   ngay; nếu đang bận thì đánh dấu pendingCommand kèm cảnh báo khẩn cho nhân viên.
   */
  const handleGateCommand = async (gateId: string | number, cmd: string) => {
    const gate = gates.find(g => g.id === gateId);
    if (!gate) return;

    try {
      await axiosClient.post(`/infrastructure/gates/${gateId}/command`, { command: cmd });

      if (gate.status === 'IDLE') {
        message.success(`Applied command ${cmd} immediately to ${gate.name}`);
      } else {
        setGates(prev => prev.map(g => g.id === gateId ? { ...g, pendingCommand: cmd } : g));
        notification.error({
          message: 'PENDING ORDER SENT (CRITICAL)',
          description: `Sent command ${cmd} to device/staff at gate.`,
          duration: 8,
          placement: 'bottomRight'
        });
      }
    } catch (error) {
      message.error('Error when sending gate control command');
    }
  };

  /** @Description: Huỷ lệnh điều khiển đang chờ xử lý tại 1 Gate. */
  const handleCancelGateCommand = (gateId: string | number) => {
    setGates(prev => prev.map(g => g.id === gateId ? { ...g, pendingCommand: null } : g));
    message.info('Pending order canceled');
  };

  /**
   * @Function: handleSave
   * @Description: Lưu toàn bộ cấu hình bản đồ lên server, tự validate va chạm + biên
   *   cho TẤT CẢ các tầng trước khi gửi (không chỉ tầng đang xem).
   * @Logic_Steps:
   * 1. Với mỗi tầng: dựng rects bounding box (đã tính rotation) cho Zone và Gate.
   * 2. Với mỗi rect: nếu vượt biên tầng -> báo lỗi, dừng.
   * 3. So từng cặp rect, nếu giao nhau -> báo lỗi va chạm, dừng.
   * 4. POST payload (bỏ vehicleTypes), thành công thì refetch và chỉnh selectedFloorId nếu tầng đã mất.
   */
  const handleSave = () => {
    for (const floor of floors) {
      const floorZones = zones.filter(z => z.floorId === floor.id);
      const floorGates = gates.filter(g => g.floorId === floor.id);
      const rects: any[] = [];

      for (const z of floorZones) {
         const { width: slotW, height: slotH } = getVehicleDimensions(z.vehicleTypeId, vehicleTypes);
         let zw = z.capacity * slotW;
         let zh = slotH;
         if (z.rotation === 90 || z.rotation === 270) { zw = slotH; zh = z.capacity * slotW; }

         let zx = z.layoutX; let zy = z.layoutY;
         if (z.rotation === 90) zx -= zw;
         else if (z.rotation === 180) { zx -= zw; zy -= zh; }
         else if (z.rotation === 270) zy -= zh;

         rects.push({ id: `Z-${z.id}`, name: z.name, x: zx, y: zy, width: zw, height: zh });
      }

      for (const g of floorGates) {
         let gw = 3 * GRID_SIZE;
         let gh = GRID_SIZE;
         if (g.vehicleTypeId) {
             const vt = vehicleTypes.find(v => v.id === g.vehicleTypeId);
             if (vt) gw = vt.matrixWidth * GRID_SIZE;
         }
         if (g.rotation === 90 || g.rotation === 270) {
             const temp = gw; gw = gh; gh = temp;
         }
         let gx = g.layoutX; let gy = g.layoutY;
         if (g.rotation === 90) gx -= gw;
         else if (g.rotation === 180) { gx -= gw; gy -= gh; }
         else if (g.rotation === 270) gy -= gh;

         rects.push({ id: `G-${g.id}`, name: g.name, x: gx, y: gy, width: gw, height: gh });
      }

      for (let i = 0; i < rects.length; i++) {
        const r1 = rects[i];

        if (r1.x < 0 || r1.y < 0 ||
            r1.x + r1.width > floor.mapCols * GRID_SIZE ||
            r1.y + r1.height > floor.mapRows * GRID_SIZE) {
           message.error(`Cannot save! ${r1.name} on ${floor.name} exceeds map boundaries.`);
           return;
        }

        for (let j = i + 1; j < rects.length; j++) {
           const r2 = rects[j];
           if (!(r2.x >= r1.x + r1.width ||
                 r2.x + r2.width <= r1.x ||
                 r2.y >= r1.y + r1.height ||
                 r2.y + r2.height <= r1.y)) {
              message.error(`Cannot save! Collision detected on ${floor.name} between ${r1.name} and ${r2.name}.`);
              return;
            }
        }
      }
    }

    const payload = { floors, zones, gates, vehicleTypes: undefined };

    axiosClient.post('/infrastructure/map/save', payload)
      .then(res => {
        message.success('Success! control center and diagram configuration saved!');
        refetch().then((result) => {
          const fetchedData = result.data;
          if (fetchedData && fetchedData.floors && fetchedData.floors.length > 0) {
            const stillExists = fetchedData.floors.find((f: any) => f.id === selectedFloorId);
            if (!stillExists) {
               setSelectedFloorId(fetchedData.floors[fetchedData.floors.length - 1].id);
            }
          }
        });
      })
      .catch(err => {
        message.error(err.response?.data?.message || 'an error occurred when saving the configuration');
      });
  };

  /** @Description: Vẽ nền, lưới và viền bao quanh bản đồ. */
  const drawGrid = () => {
    const lines = [];
    const width = mapCols * GRID_SIZE;
    const height = mapRows * GRID_SIZE;

    lines.push(<Rect key="bg" x={0} y={0} width={width} height={height} fill="#f8fafc" />);

    for (let i = 1; i < mapCols; i++) {
      lines.push(<Line key={`v-${i}`} points={[i * GRID_SIZE, 0, i * GRID_SIZE, height]} stroke="#cbd5e1" strokeWidth={1} opacity={0.3} listening={false} />);
    }
    for (let j = 1; j < mapRows; j++) {
      lines.push(<Line key={`h-${j}`} points={[0, j * GRID_SIZE, width, j * GRID_SIZE]} stroke="#cbd5e1" strokeWidth={1} opacity={0.3} listening={false} />);
    }

    lines.push(<Rect key="border" x={0} y={0} width={width} height={height} stroke="#334155" strokeWidth={4} listening={false} />);
    return lines;
  };

  const activeZone = selectedEntity?.type === 'ZONE' || selectedEntity?.type === 'SLOT' ? zones.find(z => z.id === (selectedEntity as any).zoneId || z.id === (selectedEntity as any).id) : null;
  const activeSlot = selectedEntity?.type === 'SLOT' ? activeZone?.slots.find(s => s.id === selectedEntity.slotId) : null;
  const activeGate = selectedEntity?.type === 'GATE' ? gates.find(g => g.id === (selectedEntity as any).id) : null;
  const validVehicleTypes = vehicleTypes.filter(v => v.category === activeFloor?.type);

  return (
    <div className="flex h-full w-full bg-slate-50 overflow-hidden font-sans">

      <div className="flex-1 relative cursor-grab active:cursor-grabbing bg-gray-200" ref={containerRef}>
        {containerSize.width > 0 && containerSize.height > 0 && (
          <Stage
            width={containerSize.width}
            height={containerSize.height}
            draggable
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            onWheel={(e) => {
              e.evt.preventDefault();
              const scaleBy = 1.05;
              const stage = e.target.getStage();
              if(!stage) return;
              const oldScale = stage.scaleX();
              const pointer = stage.getPointerPosition();
              if(!pointer) return;

              const mousePointTo = {
                x: (pointer.x - stage.x()) / oldScale,
                y: (pointer.y - stage.y()) / oldScale,
              };

              let newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy;
              newScale = Math.max(defaultScale, Math.min(newScale, 5));

              setStageScale(newScale);
              setStagePos({
                x: pointer.x - mousePointTo.x * newScale,
                y: pointer.y - mousePointTo.y * newScale,
              });
            }}
            ref={stageRef}
            onClick={(e) => {
              if (e.target === e.target.getStage() || e.target.name() === 'bg') {
                setSelectedEntity(null);
              }
            }}
          >
            <Layer>
              {drawGrid()}
            </Layer>

            <Layer>
              {visibleZones.map((zone) => {
                const { width: slotW, height: slotH } = getVehicleDimensions(zone.vehicleTypeId, vehicleTypes);
                const isZoneSelected = selectedEntity?.type === 'ZONE' && (selectedEntity as any).id === zone.id;
                const isSlotSelectedInZone = selectedEntity?.type === 'SLOT' && selectedEntity.zoneId === zone.id;
                const isSelected = isZoneSelected || isSlotSelectedInZone;

                const zoneW = zone.capacity * slotW;
                const zoneH = slotH;

                return (
                  <Group
                    key={`zone-${zone.id}`}
                    name="zoneGroup"
                    x={zone.layoutX}
                    y={zone.layoutY}
                    rotation={zone.rotation}
                    draggable
                    onDragMove={(e) => handleDragMove(e, zone.id, true)}
                    onDragEnd={(e) => handleDragEnd(e, zone.id, true)}
                  >
                    <Rect
                      width={zoneW} height={zoneH}
                      fill={isZoneSelected ? 'rgba(59, 130, 246, 0.15)' : (zone.functionType === 'WALK_IN' ? 'rgba(186, 230, 253, 0.4)' : zone.functionType === 'MONTHLY' ? 'rgba(167, 243, 208, 0.4)' : 'rgba(241, 245, 249, 0.6)')}
                      stroke={collidingNodeId === String(zone.id) ? '#ef4444' : (isZoneSelected ? '#3b82f6' : '#64748b')}
                      strokeWidth={isZoneSelected ? 3 : 2}
                      dash={collidingNodeId === String(zone.id) ? [10, 5] : []}
                      onClick={(e) => { e.cancelBubble = true; setSelectedEntity({ type: 'ZONE', id: zone.id }); if(!expandedKeys.includes('2')) setExpandedKeys(p => [...p, '2']); }}
                      onTap={(e) => { e.cancelBubble = true; setSelectedEntity({ type: 'ZONE', id: zone.id }); }}
                    />

                    {zone.slots.map((slot, i) => {
                      const xPos = i * slotW;
                      const isThisSlotSelected = selectedEntity?.type === 'SLOT' && selectedEntity.slotId === slot.id;

                      let slotFill = 'transparent';
                      if (slot.status === 'OCCUPIED') slotFill = '#fecaca';
                      else if (slot.status === 'DISABLED') slotFill = '#f1f5f9';
                      else if (slot.status === 'EMPTY' && isThisSlotSelected) slotFill = '#eff6ff';
                      else slotFill = 'transparent';

                      let vtIconUrl = '';
                      if (vehicleTypes) {
                        const zoneVt = vehicleTypes.find((v: any) => v.id === zone.vehicleTypeId);
                        if (zoneVt?.iconUrl) vtIconUrl = getImageUrl(zoneVt.iconUrl);
                      }

                      return (
                        <Group
                          key={slot.id}
                          x={xPos}
                          y={0}
                          onClick={(e) => {
                            e.cancelBubble = true;
                            if (isZoneSelected) {
                              setSelectedEntity({ type: 'SLOT', zoneId: zone.id, slotId: slot.id });
                              if(!expandedKeys.includes('3')) setExpandedKeys(p => [...p, '3']);
                            } else {
                              setSelectedEntity({ type: 'ZONE', id: zone.id });
                              if(!expandedKeys.includes('2')) setExpandedKeys(p => [...p, '2']);
                            }
                          }}
                        >
                          <Rect
                            width={slotW} height={slotH}
                            fill={slotFill}
                            stroke={isThisSlotSelected ? '#2563eb' : '#94a3b8'}
                            strokeWidth={isThisSlotSelected ? 3 : 2}
                          />
                          {slot.status === 'DISABLED' && (
                            <Line points={[0, 0, slotW, slotH]} stroke="#cbd5e1" strokeWidth={2} listening={false} />
                          )}

                          <KonvaText
                            x={0} y={slot.status === 'OCCUPIED' ? slotH / 2 + 5 : slotH / 2 - 8}
                            width={slotW}
                            align="center"
                            text={slot.name}
                            fontSize={16}
                            fill={slot.status === 'DISABLED' ? '#94a3b8' : '#334155'}
                            fontStyle="bold"
                            listening={false}
                          />
                          {slot.status === 'OCCUPIED' && (
                            vtIconUrl ? (
                              <URLImage src={vtIconUrl} x={slotW / 2 - 16} y={slotH / 2 - 25} width={32} height={32} />
                            ) : (
                              <KonvaText
                                x={0} y={slotH / 2 - 25}
                                width={slotW}
                                align="center"
                                text="🚗"
                                fontSize={28}
                                listening={false}
                              />
                            )
                          )}
                          {slot.status === 'OCCUPIED' && slot.plate && (
                            <KonvaText
                              x={0} y={slotH / 2 + 22}
                              width={slotW}
                              align="center"
                              text={slot.plate}
                              fontSize={12}
                              fill="#ef4444"
                              fontStyle="bold"
                              listening={false}
                            />
                          )}
                        </Group>
                      );
                    })}

                    <Label x={5} y={5} listening={false}>
                      <Tag fill="rgba(255, 255, 255, 0.95)" cornerRadius={6} shadowColor="black" shadowBlur={4} shadowOpacity={0.15} shadowOffset={{x:0, y:2}} />
                      <KonvaText
                        text={`${zone.name} ${zone.activeReservationsCount ? `(Res: ${zone.activeReservationsCount})` : ''}`}
                        fontSize={18}
                        fontFamily="sans-serif"
                        fill={isSelected ? '#2563eb' : '#0f172a'}
                        fontStyle="bold"
                        padding={6}
                      />
                    </Label>
                  </Group>
                );
              })}

              {visibleGates.map((gate) => {
                let gateW = 3 * GRID_SIZE;
                const gateH = GRID_SIZE;
                if (gate.vehicleTypeId) {
                  const vt = vehicleTypes.find(v => v.id === gate.vehicleTypeId);
                  if (vt) gateW = vt.matrixWidth * GRID_SIZE;
                }
                const isSelected = selectedEntity?.type === 'GATE' && (selectedEntity as any).id === gate.id;
                const gateColor = gate.status === 'ACTIVE' ? '#059669' : '#94a3b8';

                return (
                  <Group
                    key={`gate-${gate.id}`}
                    name="gateGroup"
                    x={gate.layoutX}
                    y={gate.layoutY}
                    rotation={gate.rotation}
                    draggable
                    onDragMove={(e) => handleDragMove(e, gate.id, false)}
                    onDragEnd={(e) => handleDragEnd(e, gate.id, false)}
                    onClick={(e) => {
                      e.cancelBubble = true;
                      setSelectedEntity({ type: 'GATE', id: gate.id });
                      if(!expandedKeys.includes('4')) setExpandedKeys(p => [...p, '4']);
                    }}
                  >
                    <Rect
                      width={gateW} height={gateH}
                      fill={gateColor}
                      stroke={collidingNodeId === String(gate.id) ? '#ef4444' : (isSelected ? '#facc15' : '#047857')}
                      dash={collidingNodeId === String(gate.id) ? [10, 5] : []}
                      strokeWidth={isSelected ? 4 : 2}
                      cornerRadius={6}
                      shadowColor="black"
                      shadowBlur={6}
                      shadowOpacity={0.3}
                      shadowOffset={{x: 0, y: 3}}
                    />
                    <KonvaText
                      x={0} y={gateH / 2 - 6}
                      width={gateW}
                      align="center"
                      text={`[GATE] ${gate.name}`}
                      fontSize={14}
                      fontStyle="bold"
                      fill="#ffffff"
                      listening={false}
                    />
                    {gate.pendingCommand && (
                       <KonvaText x={0} y={-15} text="⚠️ PENDING" fill="#ef4444" fontSize={12} fontStyle="bold" listening={false} />
                    )}
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        )}
      </div>

      <div className="w-80 border-l border-gray-200 bg-white flex flex-col h-full shadow-[-4px_0_15px_rgba(0,0,0,0.05)] z-10 shrink-0">

        <div className="px-4 py-3 border-b border-gray-100 bg-slate-50 flex items-center justify-between shrink-0">
          <Title level={5} className="m-0 text-slate-800 flex items-center">
            <CompassOutlined className="mr-2 text-blue-600" />  Configuration Bar
                                </Title>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-gray-400">
          <Collapse
            ghost
            expandIconPosition="end"
            activeKey={expandedKeys}
            onChange={(keys) => setExpandedKeys(keys as string[])}
            className="bg-white"
          >
            <Panel header={<Text strong>0. Vision & Navigation</Text>} key="0" className="border-b border-gray-100">
              <Button size="small" block icon={<AimOutlined />} className="mb-3" onClick={() => handleZoomToBox(0, 0, mapCols*GRID_SIZE, mapRows*GRID_SIZE)}>

                                              Panoramic Zoom
                                            </Button>
              <Text type="secondary" className="text-xs mb-1 block">Go to Zone:</Text>
              <Select
                size="small"
                className="w-full"
                placeholder="Select Zone"
                onChange={handleZoomZone}
                value={selectedEntity?.type === 'ZONE' ? (selectedEntity as any).id : undefined}
              >
                {visibleZones.map(z => <Select.Option key={z.id} value={z.id}>{z.name}</Select.Option>)}
              </Select>
            </Panel>

            <Panel header={<Text strong>1. Management Floor (Floor)</Text>} key="1" className="border-b border-gray-100 bg-slate-50/50">
              <div className="space-y-3">
                <div className="flex items-center space-x-2">
                  <Select
                    size="small"
                    className="flex-1"
                    value={selectedFloorId}
                    onChange={(v) => setSelectedFloorId(v)}
                  >
                    {floors.map(f => <Select.Option key={f.id} value={f.id}>{f.name}</Select.Option>)}
                  </Select>
                  <div className="flex space-x-2">
                    <Button size="small" icon={<PlusOutlined />} onClick={() => {
                      const newId = Date.now();
                      setFloors(prev => [...prev, { id: newId, name: `New Floor`, type: 'FOUR_WHEEL', mapCols: 60, mapRows: 40 }]);
                      setSelectedFloorId(newId);
                    }}>More</Button>
                    <Button size="small" type="primary" icon={<SaveOutlined />} onClick={handleSave}>
                      Save Floor
                    </Button>
                  </div>
                </div>
                {floors.find(f => f.id === selectedFloorId) && (
                  <div className="space-y-3">
                    <div>
                      <Text className="text-xs text-gray-500 block mb-1">Floor Name:</Text>
                      <Input
                        size="small"
                        value={floors.find(f => f.id === selectedFloorId)?.name}
                        onChange={(e) => setFloors(prev => prev.map(f => f.id === selectedFloorId ? { ...f, name: e.target.value } : f))}
                      />
                    </div>
                    <div>
                    <Text className="text-xs text-gray-500 block mb-1">Floor characteristics (Limited to vehicle type):</Text>
                    <Select
                      size="small"
                      value={floors.find(f => f.id === selectedFloorId)?.type}
                      className="w-full"
                      onChange={(v) => {
                         setFloors(prev => prev.map(f => f.id === selectedFloorId ? { ...f, type: v as 'FOUR_WHEEL' | 'TWO_WHEEL' } : f));
                      }}
                    >
                      <Select.Option value="FOUR_WHEEL">Floor Car (4 wheels)</Select.Option>
                      <Select.Option value="TWO_WHEEL">Floor Motorcycle (2 wheels)</Select.Option>
                    </Select>
                  </div>
                  </div>
                )}
                <div>
                  <Text className="text-xs text-gray-500 block mb-1">Matrix size (Cell):</Text>
                  <div className="flex items-center space-x-2">
                    <InputNumber size="small" value={mapCols} onChange={v => v && handleUpdateMapSize(v, mapRows)} className="w-20" />
                    <Text type="secondary">x</Text>
                    <InputNumber size="small" value={mapRows} onChange={v => v && handleUpdateMapSize(mapCols, v)} className="w-20" />
                  </div>
                </div>
              </div>
            </Panel>

            <Panel
              header={<div className="flex justify-between items-center w-full pr-4">
                <Text strong>2. Parking Zone (Zone)</Text>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); handleAddZone(); }} />
              </div>}
              key="2"
              className="border-b border-gray-100"
            >
              {activeZone ? (
                <div className="space-y-4">
                  <div className="p-2 bg-blue-50 border border-blue-100 rounded flex justify-between items-center">
                    <Text strong className="text-blue-700">
                      <Input
                        value={activeZone.name}
                        size="small"
                        variant="borderless"
                        className="font-bold text-blue-700 p-0"
                        onChange={(e) => setZones(prev => prev.map(z => z.id === activeZone.id ? {...z, name: e.target.value} : z))}
                      />
                    </Text>
                  </div>

                  <div>
                    <Text className="text-xs text-gray-500 block mb-1">Zone function:</Text>
                    <Select
                      size="small" className="w-full" value={activeZone.functionType}
                      onChange={v => setZones(prev => prev.map(z => z.id === activeZone.id ? {...z, functionType: v} : z))}
                    >
                      <Select.Option value="WALK_IN">Walk-in</Select.Option>
                      <Select.Option value="MONTHLY">Monthly Pass (Monthly)</Select.Option>
                      <Select.Option value="BACKUP">Backup</Select.Option>
                    </Select>
                  </div>

                  <div>
                    <Text className="text-xs text-gray-500 block mb-1">Vehicle Type:</Text>
                    <Select
                      size="small" className="w-full" value={activeZone.vehicleTypeId}
                      onChange={v => setZones(prev => prev.map(z => z.id === activeZone.id ? {...z, vehicleTypeId: v} : z))}
                    >
                      {validVehicleTypes.map(vt => (
                          <Select.Option key={vt.id} value={vt.id}>
                            {vt.iconUrl ? <img src={getImageUrl(vt.iconUrl)} style={{width: 16, height: 16, marginRight: 8, objectFit: 'contain', display: 'inline-block'}} /> : null}
                            {vt.typeName}
                          </Select.Option>
                      ))}
                    </Select>
                  </div>

                  <div>
                    <Text className="text-xs text-gray-500 block mb-1">Parking Quantity (reduces to 0 to delete):</Text>
                    <InputNumber
                      size="small" min={0} max={100} value={activeZone.capacity} className="w-full"
                      onChange={v => {
                        if (v === 0) {
                          Modal.confirm({
                            title: 'Confirm delete Zone',
                            content: 'are you sure you want to delete this Zone',
                            okText: 'Delete',
                            cancelText: 'Cancel',
                            onOk: () => {
                              setZones(prev => prev.filter(z => z.id !== activeZone.id));
                              setSelectedEntity(null);
                            }
                          });
                        } else if (v !== null && v !== undefined) {
                          handleUpdateZoneCapacity(activeZone.id, v);
                        }
                      }}
                    />
                  </div>



                  <Button block icon={<SyncOutlined />} onClick={() => handleRotateZone(activeZone.id)}>
                    Xoay Zone 90°
                  </Button>
                </div>
              ) : (
                <div className="py-4 text-center text-gray-400 italic text-sm">

                                                        Click on a Zone on the map to configure it
                                                      </div>
              )}
            </Panel>

            <Panel header={<Text strong>3. Single Slot (Slot)</Text>} key="3" className="border-b border-gray-100 bg-slate-50/50">
              {activeSlot && activeZone ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 bg-white border border-gray-200 rounded">
                    <Text strong className="text-lg">{activeSlot.name}</Text>
                    <Badge status={activeSlot.status === 'EMPTY' ? 'success' : (activeSlot.status === 'OCCUPIED' ? 'error' : 'default')} text={activeSlot.status} />
                  </div>

                  <div className="flex justify-between items-center mt-4">
                    <Text>normal active:</Text>
                    <Switch
                      checked={activeSlot.status !== 'DISABLED'}
                      onChange={(checked) => handleToggleSlotStatus(activeZone.id, activeSlot.id, checked ? 'EMPTY' : 'DISABLED')}
                    />
                  </div>
                  <Text type="secondary" className="text-xs italic block mt-1">

                                                          * Turn off the switch to switch to Maintenance mode. Maintenance is not possible if the vehicle is in use
                                                        </Text>
                </div>
              ) : (
                <div className="py-4 text-center text-gray-400 italic text-sm">

                                                        Double click on a Slot to configure it separately
                                                      </div>
              )}
            </Panel>

            <Panel
              header={<div className="flex justify-between items-center w-full pr-4">
                <Text strong className={activeGate ? "text-amber-600" : ""}>4. Gate Information (Gate)</Text>
                <Button type="primary" size="small" icon={<PlusOutlined />} onClick={(e) => { e.stopPropagation(); handleAddGate(); }} />
              </div>}
              key="4"
            >
              {activeGate ? (
                <div className="space-y-4">
                  <div className={`p-3 rounded border ${activeGate.status === 'OCCUPIED' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
                    <div className="flex items-center mb-1">
                      <GatewayOutlined className="mr-2 text-lg" />
                      <Input
                        value={activeGate.name}
                        size="small"
                        variant="borderless"
                        className="font-bold p-0"
                        onChange={(e) => setGates(prev => prev.map(g => g.id === activeGate.id ? {...g, name: e.target.value} : g))}
                      />
                    </div>
                    <Text className="text-xs block mt-2 text-gray-500">

                                                                * Gate function (Enter/Exit) and Vehicle Type will be chosen by the Staff when closing the shift at this gate
                                                              </Text>
                    <div className="mt-3">
                      <Text className="text-xs block">Current status: <Text strong>{activeGate.status}</Text></Text>
                      {activeGate.staffName && <Text className="text-xs block">Staff on duty: <Text strong>{activeGate.staffName}</Text></Text>}
                    </div>
                  </div>

                  <Button
                    danger
                    block
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      Modal.confirm({
                        title: 'Confirm Delete Gate',
                        content: 'Are you sure you want to delete this Gate? This is a soft delete, old data will not be lost.',
                        okText: 'Delete',
                        cancelText: 'Cancel',
                        onOk: () => {
                          setGates(prev => prev.filter(g => g.id !== activeGate.id));
                          setSelectedEntity(null);
                        }
                      });
                    }}
                  >
                    Delete Gate (Soft Delete)
                  </Button>
                </div>
              ) : (
                <div className="py-4 text-center text-gray-400 italic text-sm">

                                                        Click on the Gate icon on the map border to operate
                                                      </div>
              )}
            </Panel>
          </Collapse>
        </div>

        <div className="p-4 border-t border-gray-200 bg-white shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.05)]">
          <Button
            type="primary"
            size="large"
            block
            icon={<SaveOutlined />}
            onClick={handleSave}
            disabled={!isDirty}
            className="bg-blue-600 hover:bg-blue-700 h-12 text-base font-medium shadow-md"
          >

                                  SAVE CONFIGURATION
                                </Button>
        </div>

      </div>
    </div>
  );
};
