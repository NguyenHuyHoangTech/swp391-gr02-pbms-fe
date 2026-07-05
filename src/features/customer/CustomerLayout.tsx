/**
 * @Author: Antigravity
 * @Date: 2026-07-05
 * @Description: Main layout wrapper for the Customer portal. Includes top navigation header, responsive mobile drawer, and footer.
 * @Dependencies: 
 * - Zustand (useAuthStore)
 * - WebSocket (useWebSocket)
 * - React Query (public-building-profile API)
 */
import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import { SystemClock } from '../shared/components/SystemClock';
import { UserProfileSettingsModal } from '../shared/components/UserProfileSettingsModal';
import { useQuery } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { Layout, Menu, Typography, Dropdown, Avatar, Button, Drawer } from 'antd';
import {
    HomeOutlined,
    CarOutlined,
    HistoryOutlined,
    CustomerServiceOutlined,
    LogoutOutlined,
    UserOutlined,
    IdcardOutlined,
    MenuOutlined,
    SettingOutlined
} from '@ant-design/icons';

const { Header, Content, Footer } = Layout;
const { Text } = Typography;

export const CustomerLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const logout = useAuthStore((state) => state.logout);
    const email = useAuthStore((state) => state.email);
    const name = useAuthStore((state) => state.name);

    const { connected } = useWebSocket();

    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

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

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const menuItems: any[] = [
        { key: '/customer/home', icon: <HomeOutlined />, label: 'Home' },
        { key: '/customer/pre-booking', icon: <CarOutlined />, label: 'Reservations' },
        { key: '/customer/my-parking', icon: <HistoryOutlined />, label: 'Service Management' },
        { key: '/customer/monthly-pass', icon: <IdcardOutlined />, label: 'Monthly Passes' },
        { key: '/customer/helpdesk', icon: <CustomerServiceOutlined />, label: 'Support' },
    ];
    
    const userMenu: any = {
        items: [
            { key: 'settings', icon: <SettingOutlined />, label: 'Settings', onClick: () => setIsSettingsOpen(true) },
            { type: 'divider' },
            { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout, danger: true },
        ],
    };

    return (
        <Layout className="min-h-screen bg-gray-50">
            <Header className="bg-white px-4 md:px-8 flex justify-between items-center shadow-sm fixed w-full z-10 h-16">
                <div className="flex items-center gap-4 md:gap-8 flex-1">
                    <div className="flex items-center space-x-2 cursor-pointer shrink-0" onClick={() => navigate('/customer/home')}>
                        <CarOutlined className="text-2xl text-blue-600" />
                        <Text strong className="text-xl text-gray-800 tracking-tight">PBMS</Text>
                    </div>

                    <div className="hidden md:flex flex-1 justify-center w-full">
                        <Menu
                            theme="light"
                            mode="horizontal"
                            selectedKeys={[location.pathname]}
                            items={menuItems}
                            onClick={({ key }) => navigate(key)}
                            className="border-b-0 flex-1 bg-transparent justify-center"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4 pl-4 shrink-0">
                    <SystemClock />
                    
                    <span className={`hidden md:inline-flex items-center px-2 py-1 rounded text-xs font-medium border ${connected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                        <span className={`w-2 h-2 rounded-full mr-1.5 ${connected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                        WS: {connected ? 'Live' : 'Offline'}
                    </span>
                    
                    <div className="hidden md:block">
                        <Dropdown menu={userMenu} placement="bottomRight" arrow>
                            <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 px-2 py-1 rounded transition-colors">
                                <Avatar icon={<UserOutlined />} className="bg-blue-600" />
                                <Text strong className="text-gray-700">{name || email || 'Customer'}</Text>
                            </div>
                        </Dropdown>
                    </div>
                    
                    <Button
                        className="md:hidden"
                        type="text"
                        icon={<MenuOutlined className="text-xl" />}
                        onClick={() => setIsMobileMenuOpen(true)}
                    />
                </div>
            </Header>

            <Drawer
                title={<span className="font-bold">Menu</span>}
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
                        else navigate(key);
                    }}
                    items={[
                        ...menuItems,
                        { type: 'divider' },
                        { key: 'settings', icon: <SettingOutlined className="text-gray-600" />, label: <span className="text-gray-600 font-bold">Account Settings</span> },
                        { key: 'logout', icon: <LogoutOutlined className="text-red-500" />, label: <span className="text-red-500 font-bold">Logout</span> }
                    ]}
                    className="border-r-0"
                />
            </Drawer>

            <Content className="pt-16 pb-6 m-0">
                <Outlet />
            </Content>

            <Footer className="bg-white border-t border-gray-200 text-center text-gray-500 py-6 mt-auto">
                <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <Text strong className="block mb-2 text-gray-700">{buildingProfile?.name || 'PBMS Parking'}</Text>
                        <Text className="text-gray-500 text-sm block">Smart Parking Management System</Text>
                        <Text className="text-gray-500 text-sm block">Safe - Fast - Convenient</Text>
                    </div>
                    <div>
                        <Text strong className="block mb-2 text-gray-700">Contact</Text>
                        <Text className="text-gray-500 text-sm block">Hotline: {buildingProfile?.hotline || '1900 1234'}</Text>
                        <Text className="text-gray-500 text-sm block">Hours: {buildingProfile?.operatingHours || '24/7'}</Text>
                    </div>
                    <div>
                        <Text strong className="block mb-2 text-gray-700">Address</Text>
                        <Text className="text-gray-500 text-sm block">{buildingProfile?.address ? buildingProfile.address.split(',')[0] : 'High-Tech Park'}</Text>
                        <Text className="text-gray-500 text-sm block">{buildingProfile?.address ? buildingProfile.address.split(',').slice(1).join(',').trim() : 'Thu Duc City, Ho Chi Minh City'}</Text>
                    </div>
                </div>
                <div className="mt-6 pt-4 border-t border-gray-100 text-xs">
                    PBMS © {new Date().getFullYear()} — Professional Parking Management System
                </div>
            </Footer>

            <UserProfileSettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
            />
        </Layout>
    );
};
