import React, { useMemo } from 'react';
import { Layout, Typography, Avatar, Dropdown, Button, Modal, Badge } from 'antd';
import {
  LogoutOutlined,
  UserOutlined,
  AlertOutlined,
  DollarOutlined,
  SettingOutlined,
  DesktopOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  ReadOutlined
} from '@ant-design/icons';
import { Outlet, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../core/store/useAuthStore';
import { UserProfileSettingsModal } from '../shared/components/UserProfileSettingsModal';
import { BuildingRulesModal } from '../shared/components/BuildingRulesModal';
import { useState } from 'react';
import { useSystemTime } from '../../core/utils/timeProvider';
import { NotificationDropdown } from '../shared/components/NotificationDropdown';
import { useEffect } from 'react';
import { Client } from '@stomp/stompjs';
import { notification } from 'antd';
import axiosClient from '../../core/api/axiosClient';
import { useQuery } from '@tanstack/react-query';

const { Header, Content } = Layout;
const { Text } = Typography;

export const StaffLayout = () => {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const email = useAuthStore((state) => state.email);
  const shiftStatus = useAuthStore((state) => state.shiftStatus);
  const name = useAuthStore((state) => state.name);
  const role = useAuthStore((state) => state.role);
  const isManager = role === 'ROLE_MANAGER';
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const systemTime = useSystemTime();
  // QUERY: GET /finance/dashboard/operational for live sensor monitoring
  const { data: operationalData } = useQuery({
    queryKey: ['operational_dashboard'],
    queryFn: async () => {
      const res = await axiosClient.get('/finance/dashboard/operational');
      return res.data?.data || {};
    },
    refetchInterval: 5000 // Poll every 5 seconds for sensor changes
  });

  const violations = useMemo(() => {
    if (!operationalData?.liveData?.floorViolations) return [];
    return operationalData.liveData.floorViolations
      .map((stat: any) => {
        const occSlots = stat.occupied_slots || 0;
        const assignedMonthly = stat.assigned_monthly || 0;
        const wrongZoneTickets = stat.wrong_zone_tickets_count || 0;
        const diff = occSlots - wrongZoneTickets - assignedMonthly;
        return { name: `${stat.floor_name} - ${stat.vehicle_type}`, diff: diff > 0 ? diff : 0, occSlots, assignedMonthly, wrongZoneTickets };
      });
  }, [operationalData]);

  const activeGateFloorId = sessionStorage.getItem('activeGateFloorId');

  const { data: mapConfig } = useQuery({
    queryKey: ['mapConfig'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/map/config');
      return res.data?.data || {};
    },
    refetchInterval: 5000
  });



  useEffect(() => {
    const client = new Client({
      brokerURL: window.location.protocol === 'https:' ? `wss://${window.location.host}/ws-pbms` : `ws://${window.location.host}/ws-pbms`,
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = function () {
      client.subscribe('/topic/staff/notifications', (message) => {
        try {
          const data = JSON.parse(message.body);
          if (data.type === 'ZONE_CONFLICT') {
            notification.error({
              message: '🚨 Zone Capacity Conflict!',
              description: data.message + ' (Check the queue to retry)',
              placement: window.innerWidth < 768 ? 'top' : 'topRight',
              duration: 3
            });
          } else if (data.type === 'ZONE_RESERVED') {
            const plate = data.plate || '';
            const zoneName = data.zoneName || '';
            const msg = data.message || '';

            if (msg.includes('expired') || msg.includes('Reservation expired')) {
              // No-show: reservation slot released, don't show misleading "reserved" toast
              notification.info({
                message: '⏰ Reservation expired',
                description: plate ? `Reservation for ${plate} (zone ${zoneName}) has expired. Slot released.` : 'A reservation has expired and the slot is released.',
                placement: window.innerWidth < 768 ? 'top' : 'topRight',
                duration: 3
              });
            } else if (msg.includes('arriving')) {
              notification.info({
                message: '⏱️ Vehicle arriving',
                description: plate ? `Vehicle ${plate} is arriving at zone ${zoneName} shortly.` : 'A reserved vehicle is arriving.',
                placement: window.innerWidth < 768 ? 'top' : 'topRight',
                duration: 3
              });
            } else if (msg.includes('arrived')) {
              notification.success({
                message: '🚗 Reserved vehicle arrived!',
                description: plate ? `Vehicle ${plate} has arrived and is routed to zone ${zoneName}.` : 'Reserved vehicle arrived.',
                placement: window.innerWidth < 768 ? 'top' : 'topRight',
                duration: 3
              });
            } else {
              notification.success({
                message: '✅ Reservation confirmed!',
                description: plate ? `Reservation for ${plate} at zone ${zoneName} is confirmed.` : 'Reservation confirmed.',
                placement: window.innerWidth < 768 ? 'top' : 'topRight',
                duration: 3
              });
            }
            if (plate) {
              window.dispatchEvent(new CustomEvent('add-notification', {
                detail: {
                  message: msg.includes('expired')
                    ? `[Expired] Reservation for ${plate} at zone ${zoneName} expired.`
                    : msg.includes('arriving') 
                      ? `[Arriving] ${plate} is arriving at zone ${zoneName}.` 
                      : `[Reserved] ${plate} at zone ${zoneName} is confirmed.`,
                  type: msg.includes('expired') ? 'warning' : 'success'
                }
              }));
            }
          }
        } catch (e) { }
      });

      client.subscribe('/topic/alerts', (message) => {
        try {
          const data = JSON.parse(message.body);
          if (data.type === 'MONTHLY_ZONE_VIOLATION') {
            notification.warning({
              message: '🚨 Monthly Zone Violation',
              description: data.message,
              placement: window.innerWidth < 768 ? 'top' : 'topRight',
              duration: 3
            });
          }
        } catch (e) { }
      });
    };

    client.activate();
    return () => {
      client.deactivate();
    };
  }, []);

  const handleLogout = () => {
    if (shiftStatus === 'OPEN') {
      Modal.warning({
        title: 'Shift not ended!',
        content: 'The system requires you to confirm ending the shift before logging out safely.',
        okText: 'Go to End Shift page',
        onOk: () => navigate('/staff/shift-management')
      });
      return;
    }
    logout();
    navigate('/login');
  };

  const userMenu: any = {
    items: [
      { key: 'shift', icon: <ClockCircleOutlined />, label: 'Shift Management', onClick: () => navigate('/staff/shift-management') },
      { key: 'settings', icon: <SettingOutlined />, label: 'Settings', onClick: () => setIsSettingsOpen(true) },
      { key: 'rules', icon: <ReadOutlined />, label: 'Rules', onClick: () => setIsRulesOpen(true) },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Logout', onClick: handleLogout, danger: true },
    ],
  };



  // Fetch incidents for the badge
  const { data: globalTicketsData = [] } = useQuery({
    queryKey: ['incidents_global_badge'],
    queryFn: async () => {
      const res = await axiosClient.get('/incident/incidents');
      return res.data?.data || [];
    },
  });

  const pendingIncidentsCount = useMemo(() => {
    return globalTicketsData.filter((t: any) => 
      t.phase === 1 && 
      t.status !== 'CANCELLED' && 
      t.status !== 'REJECTED' && 
      t.status !== 'RESOLVED' &&
      (isManager || t.type !== 'OTHER_FEEDBACK')
    ).length;
  }, [globalTicketsData, isManager]);

  const activeGateType = sessionStorage.getItem('activeGateType');

  return (
    <Layout className="h-screen flex flex-col">
      <Header className="bg-white px-4 py-2 sm:px-6 flex flex-wrap justify-between items-center gap-y-2 shadow-sm relative z-10 w-full h-auto min-h-[64px] shrink-0 border-b border-gray-100" style={{ backgroundColor: '#ffffff', lineHeight: 'normal' }}>
        <div className="flex items-center gap-4 shrink-0">
          <Text strong className="text-xl text-gray-800 tracking-widest cursor-pointer whitespace-nowrap" onClick={() => navigate('/staff/shift-management')}>
            PBMS <span className="text-blue-600">STAFF</span>
          </Text>
          <div className="hidden sm:flex items-center gap-1 ml-4 border-l border-gray-200 pl-4">
            <Button
              type="text"
              className="text-slate-600 hover:text-blue-600 hover:bg-blue-50 font-medium px-3"
              icon={<DesktopOutlined />}
              onClick={() => navigate('/staff/gate-console')}
              disabled={shiftStatus !== 'OPEN'}
              title={
                shiftStatus !== 'OPEN'
                  ? "Please start a shift to perform this action"
                  : "Gate Console"
              }
            >
              Gate Console
            </Button>
            <Badge count={pendingIncidentsCount} overflowCount={99} offset={[-10, 5]} size="small">
              <Button
                type="text"
                icon={<AlertOutlined />}
                onClick={() => navigate('/staff/exception-desk')}
                className={`font-medium px-3 transition-colors ${pendingIncidentsCount > 0 ? 'text-red-600 hover:text-red-700 bg-red-50/50 hover:bg-red-100' : 'text-slate-600 hover:text-red-600 hover:bg-red-50'}`}
                title="Resolve Incident"
              >
                Exception Desk
              </Button>
            </Badge>
          </div>
        </div>

        <div className="flex flex-1"></div>

        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          {/* System Clock */}
          <div className="flex items-center gap-2 bg-slate-50 text-slate-700 px-3 py-1.5 rounded border border-slate-200 shadow-sm font-mono text-sm select-none">
            <ClockCircleOutlined className="text-blue-500 animate-pulse text-lg" />
            <div className="flex flex-col leading-none">
              <span className="text-slate-800 font-bold text-sm tracking-widest">
                {systemTime.format('HH:mm:ss')}
              </span>
              <span className="text-slate-500 text-[10px]">{systemTime.format('DD/MM/YYYY')}</span>
            </div>
          </div>

          {/* Wrong Zone Alert Box */}
          {(
            <Dropdown
              placement="bottomRight"
              arrow
              menu={{
                items: [
                  {
                    key: 'info',
                    label: (
                      <div className="flex flex-col gap-2 p-2 w-64">
                        <span className="font-bold text-red-600 border-b border-red-100 pb-1">🚨 Monthly Zone Status</span>
                        {violations.length === 0 && (
                          <div className="text-sm text-center text-slate-500 py-2">0 wrongly parked vehicles</div>
                        )}
                        {violations.map((v: any, idx: number) => (
                          <div key={idx} className={`p-2 rounded border ${v.diff > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="text-sm text-center"><b>{v.name}</b>: <span className={v.diff > 0 ? 'text-red-600 font-bold' : 'text-slate-500'}>{v.diff} wrongly parked vehicles</span></div>
                          </div>
                        ))}
                      </div>
                    )
                  }
                ]
              }}
            >
              <div className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border transition-colors ${violations.reduce((acc: number, v: any) => acc + v.diff, 0) > 0 ? 'bg-red-50 hover:bg-red-100 border-red-300 animate-pulse' : 'bg-slate-50 hover:bg-slate-100 border-slate-200'}`}>
                <WarningOutlined className={`text-lg ${violations.reduce((acc: number, v: any) => acc + v.diff, 0) > 0 ? 'text-red-600' : 'text-slate-400'}`} />
                <div className="flex flex-col hidden sm:flex">
                  <span className={`text-xs font-bold leading-none ${violations.reduce((acc: number, v: any) => acc + v.diff, 0) > 0 ? 'text-red-600' : 'text-slate-600'}`}>Wrong Zone</span>
                  <span className={`text-[10px] mt-0.5 whitespace-nowrap font-medium ${violations.reduce((acc: number, v: any) => acc + v.diff, 0) > 0 ? 'text-red-500' : 'text-slate-500'}`}>
                    {violations.reduce((acc: number, v: any) => acc + v.diff, 0)} violations
                  </span>
                </div>
              </div>
            </Dropdown>
          )}



          <NotificationDropdown />

          <Dropdown menu={userMenu} placement="bottomRight" arrow trigger={['click']}>
            <div className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 px-3 py-1 rounded transition-colors border border-gray-200">
              <Avatar icon={<UserOutlined />} className="bg-blue-600" />
              <Text strong className="text-gray-700 hidden sm:block">{name || email || 'Staff'}</Text>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Content className="bg-gray-100 m-0 w-full flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
        <Outlet />
      </Content>


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
