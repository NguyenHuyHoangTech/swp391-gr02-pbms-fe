/**
 * @Author: Thái Tân Phú
 * @Date: 28/07/2026
 * @Description: Layout chung cho cổng thông tin Khách hàng (Customer Portal). Bao gồm Header điều hướng, thanh Menu trượt (Drawer) trên Mobile và Footer thông tin.
 * @Dependencies: 
 * - Zustand (useAuthStore) để quản lý phiên đăng nhập
 * - WebSocket (useWebSocket) để báo trạng thái kết nối hệ thống
 * - React Query (public-building-profile API) lấy cấu hình chung của tòa nhà
 */
import React, { useState } from 'react';
import { Layout, Menu, Dropdown, Button, Drawer } from 'antd';
import { 
  HomeOutlined, 
  CarOutlined, 
  HistoryOutlined, 
  CustomerServiceOutlined,
  LogoutOutlined,

  IdcardOutlined,
  MenuOutlined,
  SettingOutlined,
  ReadOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import { UserProfileSettingsModal } from '../shared/components/UserProfileSettingsModal';
import { BuildingRulesModal } from '../shared/components/BuildingRulesModal';
import { SystemClock } from '../shared/components/SystemClock';
import { useQuery } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { GlobalReservationDebugWidget } from '../debug/GlobalReservationDebugWidget';

const { Content } = Layout;

export const CustomerLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((state) => state.logout);
  const email = useAuthStore((state) => state.email);
  const name = useAuthStore((state) => state.name);
  const { connected } = useWebSocket();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);

  // ==========================================
  // [DATA]: LẤY THÔNG TIN CẤU HÌNH TÒA NHÀ (BUILDING PROFILE)
  // - Mã giả: Gọi API `/public/building-profile` để lấy thông tin như Hotline, Email, Tên tòa nhà để hiển thị dưới Footer.
  // ==========================================
  const { data: buildingProfile } = useQuery({
    queryKey: ['public-building-profile'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/building-profile');
        return res.data.data;
      } catch {
        return null;
      }
    }
  });

  // ==========================================
  // [ACTION]: ĐĂNG XUẤT
  // - Gọi hàm logout() từ store Zustand để xóa thông tin phiên đăng nhập.
  // - Dùng react-router-dom để chuyển hướng (navigate) người dùng về trang '/login'.
  // ==========================================
  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // ==========================================
  // [CONFIG]: DANH SÁCH MENU ĐIỀU HƯỚNG (NAV LINKS)
  // - Khai báo cấu trúc đường dẫn (key) và tên hiển thị (label) cho Navbar.
  // - Sử dụng cho cả Menu Desktop (Header) và Menu Mobile (Drawer).
  // ==========================================
  const navLinks = [
    { key: '/customer/home', label: 'Trang chủ' },
    { key: '/customer/pre-booking', label: 'Đặt chỗ (Booking)' },
    { key: '/customer/monthly-pass', label: 'Vé tháng' },
    { key: '/customer/my-parking', label: 'Quản lý dịch vụ' },
    { key: '/customer/helpdesk', label: 'Hỗ trợ (e-KYC)' },
  ];

  // ==========================================
  // [CONFIG]: MENU NGƯỜI DÙNG (AVATAR DROPDOWN)
  // - Khai báo các menu item xổ xuống khi click vào Avatar ở Desktop.
  // - Các hành động: Mở Cài đặt, Xem Quy định, Đăng xuất.
  // ==========================================
  const userMenu: any = {
    items: [
      { key: 'settings', icon: <SettingOutlined />, label: 'Setting', onClick: () => setIsSettingsOpen(true) },
      { key: 'rules', icon: <ReadOutlined />, label: 'Quy định', onClick: () => setIsRulesOpen(true) },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout, danger: true },
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans selection:bg-blue-500/30">
      
      {/* ========================================== */}
      {/* [RENDER]: HEADER TRONG SUỐT (GLASS HEADER) */}
      {/* - Bao gồm: Logo, Menu điều hướng (Desktop), Đồng hồ, Trạng thái Hệ thống, Avatar và Nút Menu Mobile. */}
      {/* ========================================== */}
      <header className="fixed w-full top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-4 lg:px-6 h-20 flex items-center justify-between">
              <div className="flex items-center gap-4 lg:gap-8 xl:gap-12">
                  <div className="flex items-center gap-2 group cursor-pointer shrink-0" onClick={() => navigate('/customer/home')}>
                      <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-[0_4px_14px_0_rgba(59,130,246,0.39)] group-hover:scale-105 transition">
                          <svg className="w-5 h-5 lg:w-6 lg:h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                      </div>
                      <span className="font-sans font-black text-xl lg:text-2xl tracking-wider text-slate-800">PBMS<span className="text-blue-600">.</span></span>
                  </div>
                  
                  <nav className="hidden lg:flex gap-4 xl:gap-8 text-xs xl:text-sm font-bold text-slate-500 whitespace-nowrap">
                      {navLinks.map(link => {
                        const isActive = location.pathname.startsWith(link.key);
                        return (
                          <a 
                            key={link.key} 
                            onClick={() => navigate(link.key)} 
                            className={`cursor-pointer transition-colors ${isActive ? 'text-blue-600 border-b-2 border-blue-600 pb-1' : 'hover:text-blue-600'}`}
                          >
                            {link.label}
                          </a>
                        );
                      })}
                  </nav>
              </div>

              <div className="flex items-center gap-2 lg:gap-4 xl:gap-6 shrink-0">
                  <div className="hidden xl:block text-slate-500 text-xs font-mono font-medium">
                    <SystemClock />
                  </div>
                  
                  <div className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full border shrink-0 ${connected ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                      <span className={`w-2 h-2 rounded-full animate-ping ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      <span className={`text-[10px] xl:text-xs font-mono font-bold tracking-wide ${connected ? 'text-green-700' : 'text-red-700'}`}>
                        SYSTEM: {connected ? 'ONLINE' : 'OFFLINE'}
                      </span>
                  </div>

                  <div className="hidden lg:block shrink-0">
                    <GlobalReservationDebugWidget />
                  </div>

                  <div className="hidden lg:block pl-2 lg:pl-4 border-l border-slate-200 shrink-0">
                    <Dropdown menu={userMenu} placement="bottomRight" arrow>
                      <div className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 p-1 pr-3 rounded-full transition-colors">
                          <img src={`https://ui-avatars.com/api/?name=${name || email || 'C'}&background=2563eb&color=fff`} className="w-8 h-8 rounded-full shadow-sm" />
                          <span className="font-bold text-xs xl:text-sm text-slate-700 max-w-[80px] xl:max-w-[120px] truncate">{name || email || 'Customer'}</span>
                      </div>
                    </Dropdown>
                  </div>

                  <Button 
                    className="lg:hidden text-slate-600" 
                    type="text" 
                    icon={<MenuOutlined className="text-xl" />} 
                    onClick={() => setIsMobileMenuOpen(true)} 
                  />
              </div>
          </div>
      </header>
      
      {/* ========================================== */}
      {/* [RENDER]: MENU TRƯỢT DI ĐỘNG (MOBILE DRAWER) */}
      {/* - Hiển thị khi người dùng ấn vào icon Menu trên màn hình nhỏ. */}
      {/* ========================================== */}
      <Drawer
        title={<span className="font-bold text-slate-800">Menu</span>}
        placement="right"
        onClose={() => setIsMobileMenuOpen(false)}
        open={isMobileMenuOpen}
        styles={{ body: { padding: 0 } }}
        width={250}
      >
        <Menu
          mode="vertical"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => {
            setIsMobileMenuOpen(false);
            if (key === 'logout') handleLogout();
            else if (key === 'settings') setIsSettingsOpen(true);
            else if (key === 'rules') setIsRulesOpen(true);
            else navigate(key);
          }}
          items={[
            { key: '/customer/home', icon: <HomeOutlined />, label: 'Trang chủ' },
            { key: '/customer/pre-booking', icon: <CarOutlined />, label: 'Đặt chỗ' },
            { key: '/customer/monthly-pass', icon: <IdcardOutlined />, label: 'Vé tháng' },
            { key: '/customer/my-parking', icon: <HistoryOutlined />, label: 'Quản lý dịch vụ' },
            { key: '/customer/helpdesk', icon: <CustomerServiceOutlined />, label: 'Hỗ trợ' },
            { type: 'divider' }, 
            { key: 'rules', icon: <ReadOutlined className="text-blue-600" />, label: <span className="text-blue-600 font-bold">Quy định bãi đỗ xe</span> },
            { key: 'settings', icon: <SettingOutlined className="text-slate-600" />, label: <span className="text-slate-600 font-bold">Cài đặt</span> },
            { key: 'logout', icon: <LogoutOutlined className="text-red-500" />, label: <span className="text-red-500 font-bold">Đăng xuất</span> }
          ]}
          className="border-r-0"
        />
      </Drawer>

      <Content className="pt-20 m-0 flex-1 bg-slate-50">
        <Outlet />
      </Content>

      {/* ========================================== */}
      {/* [RENDER]: FOOTER THÔNG TIN */}
      {/* - Hiển thị thông tin liên hệ, hotline, địa chỉ tòa nhà lấy từ API `buildingProfile`. */}
      {/* ========================================== */}
      <footer className="bg-white border-t border-slate-200 pt-16 pb-8">
          <div className="max-w-7xl mx-auto px-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-12 border-b border-slate-100 pb-12 mb-8">
                  <div className="col-span-1 md:col-span-2">
                      <div className="flex items-center gap-2 mb-4">
                          <span className="font-sans font-black text-2xl text-slate-800">PBMS<span className="text-blue-600">.</span></span>
                      </div>
                      <p className="text-slate-500 text-sm max-w-sm mb-6 font-medium">Hệ thống Quản lý Bãi đỗ xe Thông minh ứng dụng AI và IoT hàng đầu. An toàn, Minh bạch, Nhanh chóng.</p>
                      <div className="flex items-center gap-4">
                          <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700 flex items-center gap-2 font-bold shadow-sm">
                              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path></svg>
                              Bảo mật RSA 2048-bit
                          </div>
                      </div>
                  </div>
                  
                  <div>
                      <h4 className="text-slate-800 font-bold mb-4">Hỗ trợ Khách hàng</h4>
                      <ul className="space-y-3 text-sm text-slate-500 font-medium">
                          <li><a onClick={() => navigate('/customer/my-parking')} className="hover:text-blue-600 transition cursor-pointer">Tra cứu hóa đơn</a></li>
                          <li><a onClick={() => navigate('/customer/helpdesk')} className="hover:text-blue-600 transition cursor-pointer">Báo mất thẻ / Sự cố</a></li>
                          <li><a onClick={() => setIsRulesOpen(true)} className="hover:text-blue-600 transition cursor-pointer">Quy định bãi giữ xe</a></li>
                      </ul>
                  </div>
                  <div>
                      <h4 className="text-slate-800 font-bold mb-4">Liên hệ (24/7)</h4>
                      <ul className="space-y-3 text-sm text-slate-500 font-medium">
                          <li className="flex items-center gap-2">Hotline: <span className="text-blue-600 font-mono font-bold bg-blue-50 px-2 py-0.5 rounded">{buildingProfile?.hotline || '1900 1234'}</span></li>
                          <li>Email: <span className="text-slate-700">{buildingProfile?.contactEmail || 'support@pbms.vn'}</span></li>
                          <li>{buildingProfile?.address || 'Khu Công Nghệ Cao, TP.HCM'}</li>
                      </ul>
                  </div>
              </div>
              
              <div className="flex flex-col md:flex-row justify-between items-center text-xs font-semibold text-slate-400">
                  <p>&copy; {new Date().getFullYear()} {buildingProfile?.name || 'PBMS'} - Smart Parking Management System. All rights reserved.</p>
                  <div className="flex gap-4 mt-4 md:mt-0">
                      <a className="hover:text-blue-600 transition cursor-pointer">Điều khoản dịch vụ</a>
                      <a className="hover:text-blue-600 transition cursor-pointer">Chính sách bảo mật</a>
                  </div>
              </div>
          </div>
      </footer>

      {/* ========================================== */}
      {/* [COMPONENTS]: CÁC MODAL ẨN (SETTINGS & RULES) */}
      {/* - UserProfileSettingsModal: Modal Cài đặt cá nhân. */}
      {/* - BuildingRulesModal: Modal xem Quy định bãi đỗ xe. */}
      {/* ========================================== */}
      <UserProfileSettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
      />
      <BuildingRulesModal
        isOpen={isRulesOpen}
        onClose={() => setIsRulesOpen(false)}
      />
    </div>
  );
};
