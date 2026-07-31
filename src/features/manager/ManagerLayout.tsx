/**
 * @Author: Nguyen Huu Thanh (TH)
 * @Date: 2026-07-16
 * @Description: Khung layout dùng chung cho toàn bộ trang Manager. Dựng Sider menu
 *   điều hướng đa cấp, Header có nút thu gọn menu và menu tài khoản, và vùng
 *   Content để React Router bơm đúng trang con vào theo URL hiện tại.
 * @Dependencies:
 * - useAuthStore (Local: core/store) - lấy thông tin tài khoản và hàm đăng xuất
 * - react-router-dom (External) - Outlet render trang con, useNavigate/useLocation
 * - antd, @ant-design/icons (External) - Layout, Menu, Dropdown, Avatar
 */
/**
 * ============================================================================
 * [IMPORT LIBRARIES & UTILITIES] - Các thư viện và công cụ tiện ích
 * ============================================================================
 * 1. React & Hooks: `useState` để quản lý trạng thái đóng/mở Sidebar và 2 Modal
 *    (cài đặt tài khoản, nội quy tòa nhà).
 * 2. Ant Design (antd): `Layout` dựng khung Sider/Header/Content chuẩn của 1
 *    trang quản trị; `Menu` vẽ menu điều hướng đa cấp; `Dropdown` cho menu
 *    người dùng góc dưới Sidebar; `Avatar`/`Typography` chỉ để trang trí chữ/ảnh.
 * 3. @ant-design/icons: Toàn bộ icon gắn cho từng mục menu — thuần trang trí,
 *    không ảnh hưởng logic điều hướng (chỉ cần đúng icon đẹp mắt).
 * 4. react-router-dom: `Outlet` là "cửa sổ" hiển thị đúng trang con đang được
 *    route dẫn tới (VD: đang ở `/manager/space-map` thì Outlet render
 *    `SpaceMapScreen`); `useNavigate` để tự chuyển trang khi bấm menu/logout;
 *    `useLocation` để biết đang đứng ở URL nào, tô sáng đúng mục menu tương ứng.
 * 5. Store & Component nội bộ: `useAuthStore` (Zustand) đọc thông tin đăng nhập
 *    + hàm logout; 4 component dùng chung (`UserProfileSettingsModal`,
 *    `BuildingRulesModal`, `SystemClock`, `NotificationDropdown`) được nhúng
 *    thẳng vào khung layout này để MỌI trang con của Manager đều thừa hưởng
 *    (không phải trang con nào cũng phải tự import lại).
 * ============================================================================
 */
import React, { useState } from 'react';
import { Layout, Menu, Typography, Avatar, Dropdown } from 'antd';
import {
  DashboardOutlined,
  BlockOutlined,
  CarOutlined,
  DollarOutlined,
  IdcardOutlined,
  BankOutlined,
  CreditCardOutlined,
  CustomerServiceOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  NodeIndexOutlined,
  ScheduleOutlined,
  SettingOutlined,
  WarningOutlined,
  ReadOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../core/store/useAuthStore';
import { UserProfileSettingsModal } from '../shared/components/UserProfileSettingsModal';
import { BuildingRulesModal } from '../shared/components/BuildingRulesModal';
import { SystemClock } from '../shared/components/SystemClock';
import { NotificationDropdown } from '../shared/components/NotificationDropdown';

const { Sider, Content, Header } = Layout;
const { Text } = Typography;

/**
 * ============================================================================
 * MÔ TẢ TỔNG QUAN VỀ VAI TRÒ & KIẾN TRÚC CỦA MANAGER LAYOUT
 * ============================================================================
 *
 * [PHẦN 1] MỤC ĐÍCH & VAI TRÒ CỦA COMPONENT:
 *    - Đây KHÔNG phải 1 màn hình nghiệp vụ (không tự gọi API tính toán gì) mà
 *      là "cái khung xương" bọc quanh TOÀN BỘ các màn hình dành cho vai trò
 *      Manager (Sơ đồ bãi, Điều phối Zone, Cấu hình giá, Dashboard doanh thu...).
 *    - Chịu trách nhiệm: vẽ Sidebar menu điều hướng đa cấp bên trái, Header
 *      cố định bên trên (đồng hồ hệ thống + thông báo), và 1 "cửa sổ" ở giữa
 *      (`<Outlet />`) để React Router tự động bơm đúng trang con vào theo URL.
 *
 * [PHẦN 2] GIẢI PHẪU KIẾN TRÚC ĐIỀU HƯỚNG (ROUTING ARCHITECTURE) KÈM MINH CHỨNG:
 *
 * BƯỚC 1: KHAI BÁO CÂY MENU TĨNH (STATIC MENU TREE)
 * - Minh chứng: Biến `menuItems` (dòng ~66) là 1 mảng cố định, cứng trong code
 *   (không gọi API để lấy menu động) — chia làm 5 nhóm lớn (Overview, Operations,
 *   Asset & Pricing, Revenue & Financial, System & Storage), mỗi nhóm chứa các
 *   mục con với `key` chính là đường dẫn URL thật (VD: `/manager/space-map`).
 * - LƯU Ý: `key` của mục con được dùng LÀM LUÔN tham số cho `navigate(key)` khi
 *   bấm chọn (dòng ~152 `onClick={({ key }) => navigate(key)}`) — không có tầng
 *   ánh xạ trung gian nào cả, nên đặt sai `key` menu là điều hướng sai URL ngay.
 *
 * BƯỚC 2: TÔ SÁNG ĐÚNG MỤC MENU THEO URL HIỆN TẠI (2 CHIỀU ĐỒNG BỘ)
 * - Minh chứng: `selectedKeys={[location.pathname]}` (dòng ~150) — lấy thẳng
 *   đường dẫn hiện tại của trình duyệt (từ `useLocation()`) làm danh sách mục
 *   đang được chọn. Nhờ đó nếu người dùng F5 lại trang hoặc gõ thẳng URL vào
 *   thanh địa chỉ, menu vẫn tự tô sáng đúng mục tương ứng — không cần đồng bộ
 *   thủ công qua 1 biến state riêng.
 *
 * BƯỚC 3: HIỂN THỊ TRANG CON QUA OUTLET (NƠI NỘI DUNG THẬT SỰ NẰM)
 * - Minh chứng: `<Outlet />` (dòng ~178) đặt bên trong `<Content>` — đây chính
 *   là "khe cắm" mà React Router sẽ tự động render đúng Component con khớp với
 *   route hiện tại (định nghĩa ở `AppRouter.tsx`, ví dụ route `space-map` sẽ
 *   render `SpaceMapScreen`). Layout này không biết và không cần biết đang
 *   hiển thị màn hình cụ thể nào.
 *
 * BƯỚC 4: THU GỌN/MỞ RỘNG SIDEBAR (RESPONSIVE TOGGLE)
 * - Minh chứng: `collapsed` (state) điều khiển cả `width` của `<Sider>` lẫn
 *   việc ẩn/hiện phần chữ (tên app, tên người dùng...) — chỉ giữ lại icon khi
 *   thu gọn, để tiết kiệm diện tích màn hình cho các bảng dữ liệu/bản đồ lớn
 *   ở các trang con (VD: Space Map cần nhiều chỗ hiển thị).
 * ============================================================================
 */
export const ManagerLayout = () => {
  // Cờ đóng/mở Sidebar bên trái — thu gọn thì chỉ còn icon, ẩn hết chữ.
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Lấy hàm logout + thông tin hiển thị (email/tên) từ kho trạng thái đăng
  // nhập toàn cục (Zustand store) — không tự quản lý state đăng nhập ở đây.
  const logout = useAuthStore((state) => state.logout);
  const email = useAuthStore((state) => state.email);
  const name = useAuthStore((state) => state.name);

  // 2 cờ điều khiển đóng/mở 2 Modal dùng chung, gắn ở cuối cùng của cây JSX
  // (Modal cài đặt tài khoản và Modal xem nội quy tòa nhà).
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);

  /**
   * ============================================================================
   * [ĐĂNG XUẤT] - HANDLE LOGOUT
   * ============================================================================
   * MỤC ĐÍCH: Xóa sạch phiên đăng nhập hiện tại rồi đẩy người dùng về màn hình
   * Login. Đơn giản, không cần gọi API riêng vì `logout()` (từ store) đã tự lo
   * việc xóa token/thông tin phiên ở phía client.
   * ============================================================================
   */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /**
   * ============================================================================
   * [CÂY MENU ĐIỀU HƯỚNG] - 5 NHÓM CHỨC NĂNG CHO VAI TRÒ MANAGER
   * ============================================================================
   * Mỗi phần tử cấp 1 là 1 "nhóm" gấp lại được (VD: "Operations"), bên trong là
   * danh sách các mục cấp 2 mà `key` chính là URL thật của trang con. Bấm vào
   * mục nào, `onClick` ở `<Menu>` bên dưới sẽ gọi `navigate(key)` với đúng
   * `key` đó — không cần bảng tra cứu (lookup table) trung gian.
   *
   * DANH SÁCH 5 NHÓM:
   * 1. Overview — 2 Dashboard tổng quan (Doanh thu, Vận hành).
   * 2. Operations — Sơ đồ bãi, Điều phối Zone tự động (Routing), Quản lý sự cố.
   * 3. Asset & Pricing — Loại xe, Cấu hình giá, Cấu hình phạt, Vé tháng, Đặt chỗ.
   * 4. Revenue & Financial — Quản lý hoàn tiền.
   * 5. System & Storage — Kho thẻ RFID, Hồ sơ tòa nhà.
   * ============================================================================
   */
  const menuItems: any[] = [
    {
      key: 'sub-overview',
      label: 'Overview',
      icon: <DashboardOutlined />,
      children: [
        { key: '/manager/revenue-dashboard', label: 'Revenue Dashboard' },
        { key: '/manager/operational-dashboard', label: 'Operational Dashboard' },
      ],
    },
    {
      key: 'sub-operations',
      label: 'Operations',
      icon: <CustomerServiceOutlined />,
      children: [
        { key: '/manager/space-map', label: 'Space Map', icon: <BlockOutlined /> },
        { key: '/manager/routing', label: 'Routing', icon: <NodeIndexOutlined /> },
        { key: '/manager/incidents', label: 'Incident Management', icon: <WarningOutlined /> },
      ],
    },
    {
      key: 'sub-assets-pricing',
      label: 'Asset & Pricing',
      icon: <CarOutlined />,
      children: [
        { key: '/manager/vehicle-types', label: 'Vehicle Type' },
        { key: '/manager/pricing-config', label: 'Price Configuration' },
        { key: '/manager/penalty-config', label: 'Penalty Configuration' },
        { key: '/manager/monthly-passes', label: 'Monthly Passes', icon: <IdcardOutlined /> },
        { key: '/manager/pre-bookings', label: 'Pre-booking Management', icon: <ScheduleOutlined /> },
      ],
    },
    {
      key: 'sub-revenue',
      label: 'Revenue & Financial',
      icon: <DollarOutlined />,
      children: [
        { key: '/manager/refund-management', label: 'Refund Management' },
      ],
    },
    {
      key: 'sub-system',
      label: 'System & Storage',
      icon: <SettingOutlined />,
      children: [
        { key: '/manager/card-management', label: 'Card Warehouse', icon: <CreditCardOutlined /> },
        { key: '/manager/building-profile', label: 'Building Profile', icon: <BankOutlined /> },
      ],
    }
  ];

  /**
   * ============================================================================
   * [MENU NGƯỜI DÙNG] - DROPDOWN GÓC DƯỚI SIDEBAR
   * ============================================================================
   * 3 lựa chọn khi bấm vào avatar/tên người dùng ở đáy Sidebar:
   * - Setting: mở Modal cài đặt tài khoản (`UserProfileSettingsModal`).
   * - Rules: mở Modal xem nội quy tòa nhà (`BuildingRulesModal`).
   * - Logout: gọi `handleLogout` ở trên (tô màu đỏ `danger` để cảnh báo thị giác
   *   đây là hành động không thể hoàn tác dễ dàng).
   * ============================================================================
   */
  const userMenu: any = {
    items: [
      { key: 'settings', icon: <SettingOutlined />, label: 'Setting', onClick: () => setIsSettingsOpen(true) },
      { key: 'rules', icon: <ReadOutlined />, label: 'Rules', onClick: () => setIsRulesOpen(true) },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout, danger: true },
    ],
  };

  return (
    <Layout className="h-screen overflow-hidden">
      {/*
       * ============================================================================
       * [SIDEBAR TRÁI] - LOGO + MENU ĐIỀU HƯỚNG + THẺ NGƯỜI DÙNG
       * Chia làm 3 khối xếp dọc, khối giữa (Menu) tự co giãn chiếm hết chỗ trống
       * còn lại, 2 khối trên/dưới (Logo, User card) có chiều cao cố định.
       * ============================================================================
       */}
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        theme="light"
        className="shadow-md z-10 flex flex-col h-screen"
        width={250}
      >
        {/* Khối 1: Logo "PBMS Manager" + nút thu gọn/mở rộng Sidebar */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 shrink-0 bg-white">
          {!collapsed && (
            <Text strong className="text-blue-600 transition-all text-xl">
              PBMS Manager
            </Text>
          )}
          <div
            className={`cursor-pointer text-lg text-gray-600 hover:text-blue-600 transition-colors ${collapsed ? 'mx-auto' : ''}`}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
        </div>

        {/* Khối 2: Menu điều hướng đa cấp — tự cuộn riêng nếu danh sách quá dài,
            không kéo giãn toàn bộ Sidebar. */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-track]:bg-transparent hover:[&::-webkit-scrollbar-thumb]:bg-gray-400">
          <Menu
            theme="light"
            mode="inline"
            defaultOpenKeys={['sub-overview', 'sub-operations', 'sub-assets-pricing', 'sub-revenue', 'sub-system']}
            selectedKeys={[location.pathname]}
            items={menuItems as any}
            onClick={({ key }) => navigate(key)}
            className="border-r-0 mt-4"
          />
        </div>

        {/* Khối 3: Thẻ người dùng (avatar + tên) — bấm vào mở Dropdown 3 lựa
            chọn (Setting/Rules/Logout) đã khai báo ở `userMenu` phía trên. */}
        <div className="border-t border-gray-100 p-4 shrink-0">
          <Dropdown menu={userMenu} placement="topRight" arrow>
            <div className={`flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded transition-colors ${collapsed ? 'justify-center' : ''}`}>
              <Avatar icon={<UserOutlined />} className="bg-blue-600 min-w-[32px]" />
              {!collapsed && (
                <div className="flex flex-col overflow-hidden">
                  <Text strong className="text-gray-700 truncate">{name || email || 'Manager'}</Text>
                  <Text type="secondary" className="text-xs">Management</Text>
                </div>
              )}
            </div>
          </Dropdown>
        </div>
      </Sider>

      {/*
       * ============================================================================
       * [VÙNG NỘI DUNG BÊN PHẢI] - HEADER CỐ ĐỊNH + CỬA SỔ OUTLET
       * ============================================================================
       */}
      <Layout className="h-screen">
        {/* Header cố định trên đầu (sticky) — chỉ chứa 2 tiện ích dùng chung
            cho MỌI trang con của Manager: chuông thông báo và đồng hồ hệ thống
            (đồng hồ giả lập, không phải giờ thật của máy). */}
        <Header className="bg-white px-6 flex justify-end items-center shadow-sm z-10 sticky top-0 w-full h-16" style={{ backgroundColor: '#ffffff', gap: '16px' }}>
          <NotificationDropdown />
          <SystemClock />
        </Header>

        {/* `<Outlet />` chính là nơi React Router bơm đúng trang con (Space Map,
            Vehicle Type, Building Profile...) tương ứng với URL hiện tại vào. */}
        <Content className="bg-gray-50 m-0 h-full overflow-y-auto flex flex-col">
          <Outlet />
        </Content>
      </Layout>

      {/*
       * ============================================================================
       * [2 MODAL DÙNG CHUNG] - Cài đặt tài khoản & Nội quy tòa nhà
       * Đặt ở ngoài cùng cây JSX (không lồng trong Sider/Content) để Modal luôn
       * che phủ toàn màn hình đúng chuẩn, không bị giới hạn bởi vùng cuộn của
       * Sider hay Content bên trong.
       * ============================================================================
       */}
      <UserProfileSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <BuildingRulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
      />
    </Layout>
  );
};
