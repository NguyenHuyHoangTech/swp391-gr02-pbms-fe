/**
 * @Author: Phạm Anh Tuấn
 * @Date: 12/06/2026
 * 
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC KHUNG GIAO DIỆN QUẢN TRỊ (ADMIN LAYOUT ARCHITECTURE)
 * (Trình bày chi tiết luồng dữ liệu ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO FRAMEWORK ĐIỀU HƯỚNG VÀ CÁC STATE NỘI BỘ (INIT & LAYOUT STATES)
 * - Minh chứng 1: Tại dòng 84 có khai báo `export const AdminLayout = () => { ... }`.
 *   Khi Quản trị viên truy cập bất kỳ đường dẫn nào thuộc `/admin/*`, React Router sẽ đúc Layout này làm khung bao quanh.
 * - Minh chứng 2: Tại các dòng 86-92 có khai báo các State điều khiển đóng/mở thanh Sidebar (`collapsed`),
 *   Modal cài đặt cá nhân (`isSettingsOpen`), Modal nội quy tòa nhà (`isRulesOpen`), cùng các Hooks lấy URL hiện tại (`location`)
 *   và thông tin phiên làm việc (`useAuthStore`).
 * 
 * BƯỚC 2: THIẾT LẬP MENU ĐIỀU HƯỚNG BÊN (SIDEBAR MENU CONFIGURATION)
 * - Minh chứng: Tại dòng 101 khai báo mảng `menuItems`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Định nghĩa danh sách các mục điều hướng chính cho Admin: User Management (`/admin/users`), System Config (`/admin/system-configs`), Active Log (`/admin/audit-logs`).
 *   + Antd Menu dựa vào `location.pathname` để tự động highlight mục tương ứng với Route hiện tại.
 * 
 * BƯỚC 3: CẤU HÌNH MENU TÀI KHOẢN NGƯỜI DÙNG VÀ ĐĂNG XUẤT (USER DROPDOWN MENU)
 * - Minh chứng: Tại dòng 120 khai báo đối tượng `userMenu`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Định nghĩa danh sách các thao tác trong Menu thả xuống của Avatar: Mở Cài đặt tài khoản, Xem Nội quy và Đăng xuất (`handleLogout`).
 *   + `handleLogout` thực thi xóa Token trong Zustand Store và chuyển hướng về trang `/login`.
 * 
 * BƯỚC 4: LẮP RÁP KHUNG GIAO DIỆN SIDER - HEADER - CONTENT (LAYOUT ASSEMBLY)
 * - Minh chứng: Tại dòng 147 khối JSX trả về cấu trúc khung Antd `Layout`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + `Sider`: Thanh bên chứa Logo dự án và Menu điều hướng có thể thu gọn/mở rộng.
 *   + `Header`: Thanh tiêu đề phía trên chứa nút Toggle Sidebar, Đồng hồ hệ thống (`SystemClock`) và Avatar người dùng.
 *   + `Content`: Vùng nội dung chính hiển thị các Route con.
 * 
 * BƯỚC 5: NHÚNG CÁC MODAL HỆ THỐNG VÀ TÍCH HỢP CONTEXT NỘI DUNG (MODALS & ROUTER OUTLET)
 * - Minh chứng: Tại dòng 202 hiển thị `<Outlet />` cùng hai Component Modal `<UserProfileSettingsModal />` và `<BuildingRulesModal />`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + `<Outlet />` đóng vai trò là điểm chèn (placeholder) để React Router tự động render trang con tương ứng.
 *   + Hai Modal nằm ở cấp Layout toàn cục giúp người dùng có thể mở Cài đặt hoặc Nội quy từ bất kỳ trang Admin nào.
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN LÕI REACT VÀ GIAO DIỆN ANTD (REACT & ANTD LAYOUT)
// Công dụng: Cung cấp Hook quản lý State của React và bộ cấu trúc Khung khung giao diện (Layout, Menu, Dropdown) từ Antd.
// =========================================================================
import React, { useState } from 'react'; // Thư viện React tiêu chuẩn và useState hook.
import { Layout, Menu, Typography, Avatar, Dropdown } from 'antd'; // Các component phân chia khu vực màn hình của Ant Design.

// =========================================================================
// PHẦN 2: BỘ ICON ĐỒ HỌA ANTD ICONS
// Công dụng: Bộ Icon minh họa cho từng danh mục Menu điều hướng và các nút thao tác.
// =========================================================================
import { 
  UserOutlined, 
  SettingOutlined, 
  HistoryOutlined, 
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ReadOutlined
} from '@ant-design/icons'; // Bộ Icon thao tác và điều hướng.

// =========================================================================
// PHẦN 3: CÁC HOOK ĐIỀU HƯỚNG REACT ROUTER VÀ AUTH STORE
// Công dụng: Điều hướng trang web (Outlet, useNavigate, useLocation) và quản lý phiên làm việc người dùng.
// =========================================================================
import { Outlet, useNavigate, useLocation } from 'react-router-dom'; // Bộ công cụ định tuyến React Router DOM.
import { useAuthStore } from '../../core/store/useAuthStore'; // Store Zustand quản lý trạng thái đăng nhập.

// =========================================================================
// PHẦN 4: CÁC COMPONENT NỘI DUNG VÀ MODAL DÙNG CHUNG
// Công dụng: Nhúng các Modal cấu hình tài khoản, Nội quy tòa nhà và Đồng hồ hệ thống gian thực.
// =========================================================================
import { UserProfileSettingsModal } from '../shared/components/UserProfileSettingsModal'; // Modal chỉnh sửa thông tin cá nhân.
import { BuildingRulesModal } from '../shared/components/BuildingRulesModal'; // Modal xem nội quy bãi xe / tòa nhà.
import { SystemClock } from '../shared/components/SystemClock'; // Component hiển thị đồng hồ hệ thống theo thời gian thực/giả lập.

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

/**
 * === PHẦN 5: ĐỊNH NGHĨA COMPONENT ADMINLAYOUT ===
 * Khung giao diện dùng chung cho toàn bộ phân hệ Admin (Sider điều hướng bên trái, Header trên cùng và Content động).
 */
export const AdminLayout = () => {
  // --- KHỞI TẠO STATE VÀ HOOKS ĐIỀU HƯỚNG ---
  const [collapsed, setCollapsed] = useState(false); // Trạng thái thu gọn/mở rộng thanh Sidebar
  const navigate = useNavigate(); // Hook chuyển hướng màn hình
  const location = useLocation(); // Hook lấy thông tin đường dẫn URL hiện tại
  const logout = useAuthStore((state) => state.logout); // Hàm đăng xuất từ Auth Store
  const email = useAuthStore((state) => state.email); // Email tài khoản đang đăng nhập
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Trạng thái ẩn/hiện Modal cài đặt cá nhân
  const [isRulesOpen, setIsRulesOpen] = useState(false); // Trạng thái ẩn/hiện Modal nội quy tòa nhà

  /** Xử lý đăng xuất tài khoản và đưa người dùng về trang đăng nhập */
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  /** Danh sách các mục chuyển trang trên thanh Sidebar bên trái */
  const menuItems = [
    {
      key: '/admin/users',
      icon: <UserOutlined />,
      label: 'User Management',
    },
    {
      key: '/admin/system-configs',
      icon: <SettingOutlined />,
      label: 'System Config',
    },
    {
      key: '/admin/audit-logs',
      icon: <HistoryOutlined />,
      label: 'Active Log',
    },
  ];

  /** Cấu hình các tính năng trong Menu thả xuống (Dropdown) khi bấm vào Avatar người dùng */
  const userMenu: any = {
    items: [
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Account Settings',
        onClick: () => setIsSettingsOpen(true),
      },
      {
        key: 'rules',
        icon: <ReadOutlined />,
        label: 'Nội Quy',
        onClick: () => setIsRulesOpen(true),
      },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Logout',
        onClick: handleLogout,
        danger: true,
      },
    ],
  };

  // =========================================================================
  // PHẦN 6: RENDER GIAO DIỆN COMPONENT LAYOUT (JSX)
  // =========================================================================
  return (
    <Layout className="min-h-screen">
      {/* 1. THANH ĐIỀU HƯỚNG BÊN (SIDER - SIDEBAR) */}
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        theme="light"
        className="shadow-md z-10"
      >
        {/* LOGO DỰ ÁN HỆ THỐNG */}
        <div className="h-16 flex items-center justify-center border-b border-gray-100">
          <Text strong className={`text-blue-600 transition-all ${collapsed ? 'text-lg' : 'text-xl'}`}>
            {collapsed ? 'PBMS' : 'PBMS Admin'}
          </Text>
        </div>
        {/* MENU CHUYỂN PHÂN HỆ NỘI BỘ */}
        <Menu
          theme="light"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="border-r-0 mt-4"
        />
      </Sider>
      
      {/* 2. KHUNG NỘI DUNG CHÍNH VA HEADER */}
      <Layout>
        {/* THANH THAO TÁC PHÍA TRÊN (HEADER) */}
        <Header className="bg-white px-4 flex justify-between items-center shadow-sm z-0" style={{ backgroundColor: '#ffffff' }}>
          {/* NÚT THU GỌN / MỞ RỘNG SIDEBAR */}
          <div 
            className="cursor-pointer text-lg text-gray-600 hover:text-blue-600 transition-colors"
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>
          
          {/* VÙNG THỜI GIAN THỰC VÀ AVATAR NGƯỜI DÙNG */}
          <div className="flex items-center gap-4">
            <SystemClock />
            <Dropdown menu={userMenu} placement="bottomRight" arrow>
              <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded transition-colors">
                <Avatar icon={<UserOutlined />} className="bg-blue-600" />
                <Text strong className="text-gray-700 hidden sm:block">{email || 'Admin'}</Text>
              </div>
            </Dropdown>
          </div>
        </Header>
        
        {/* VÙNG HIỂN THỊ NỘI DUNG TRANG CON (CONTENT) */}
        <Content className="bg-gray-50 m-0 flex flex-col flex-1 overflow-y-auto">
          {/* Nơi tự động render giao diện của các route con (nested child routes) */}
          <Outlet />
        </Content>
      </Layout>

      {/* 3. KHỐI CÁC MODAL HỆ THỐNG DÙNG CHUNG TOÀN ADMIN */}
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
