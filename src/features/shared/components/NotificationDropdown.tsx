/**
 * @Author: Thái Tân Phú
 * @Date: 2026-07-19
 * @Description: Component hiển thị khay thông báo (quả chuông).
 * Quản lý thông báo người dùng, kết nối WebSocket để nhận thông báo real-time,
 * và lưu trữ thông báo vào LocalStorage.
 * @Dependencies: 
 * - @stomp/stompjs (Giao tiếp WebSocket)
 * - antd (Thư viện UI)
 * - useAuthStore (Quản lý trạng thái xác thực)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Badge, Dropdown, MenuProps, notification, Button, Typography, Drawer, List } from 'antd';
import { BellOutlined, DeleteOutlined } from '@ant-design/icons';
import { Client } from '@stomp/stompjs';
import { useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { simulatedDayjs } from '../../../core/utils/timeProvider';
import { useAuthStore } from '../../../core/store/useAuthStore';

const { Text } = Typography;

const MAX_NOTIFICATIONS = 50;

interface NotificationItem {
  key: string;
  message: string;
  time: Date;
  read: boolean;
  type?: 'success' | 'warning' | 'error' | 'info';
}

/**
 * @Function: getStorageKey
 * @Description: Tạo khóa lưu trữ cho từng người dùng dựa trên email, dùng cho LocalStorage.
 * @param {string | null} email - Email của người dùng hiện tại
 * @returns {string} Khóa lưu trữ dạng chuỗi
 */
const getStorageKey = (email: string | null) => `pbms_notifications_${email || 'guest'}`;

/**
 * @Function: NotificationDropdown
 * @Description: Component chính hiển thị biểu tượng chuông và danh sách thông báo.
 * @Logic_Steps:
 * 1. Khởi tạo state notifications và unreadCount từ LocalStorage.
 * 2. Theo dõi thay đổi kích thước màn hình để tự động chuyển giao diện Mobile/Web.
 * 3. Mỗi khi có thông báo mới, tự động lưu đè vào LocalStorage.
 * 4. Mở kết nối WebSocket (/ws-pbms) để lắng nghe sự kiện từ backend.
 * 5. Hiển thị UI Dropdown (Desktop) hoặc Drawer (Mobile).
 * 
 * @returns {JSX.Element} Giao diện chuông thông báo
 */
export const NotificationDropdown: React.FC = () => {
  const email = useAuthStore((state) => state.email);
  const storageKey = getStorageKey(email);
  const queryClient = useQueryClient();

  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Revive Date objects from ISO strings
        return parsed.map((n: any) => ({ ...n, time: new Date(n.time) }));
      }
    } catch (e) { /* ignore */ }
    return [];
  });

  const [unreadCount, setUnreadCount] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.filter((n: any) => !n.read).length;
      }
    } catch (e) { /* ignore */ }
    return 0;
  });

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Persist notifications to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notifications));
    } catch (e) { /* ignore storage errors */ }
  }, [notifications, storageKey]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  /**
   * @Function: addNotification
   * @Description: Thêm một thông báo mới vào danh sách.
   * Sử dụng useCallback để lưu hàm vào bộ nhớ cache (memoize), tránh tạo lại hàm mỗi lần render.
   * @Logic_Steps:
   * 1. Tạo đối tượng thông báo mới với thời gian hiện tại.
   * 2. Chèn vào đầu danh sách (prev), cắt bớt nếu vượt quá giới hạn MAX_NOTIFICATIONS.
   * 3. Tăng biến đếm số lượng chưa đọc.
   * 
   * @param {string} msg - Nội dung thông báo
   * @param {string} type - Loại thông báo
   */
  const addNotification = useCallback((msg: string, type?: string) => {
    const newItem: NotificationItem = {
      key: Date.now().toString() + Math.random(),
      message: msg,
      time: simulatedDayjs().toDate(),
      read: false,
      type: (type as any) || 'info',
    };
    setNotifications((prev) => [newItem, ...prev].slice(0, MAX_NOTIFICATIONS));
    setUnreadCount((prev) => prev + 1);
  }, []);

  useEffect(() => {
    const client = new Client({
      brokerURL: window.location.protocol === 'https:' ? `wss://${window.location.host}/ws-pbms` : `ws://${window.location.host}/ws-pbms`,
      debug: function (str) { /* silent */ },
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = function (frame) {
      client.subscribe('/topic/alerts', (message) => {
        // Invalidate incidents queries
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        queryClient.invalidateQueries({ queryKey: ['incidents_global_badge'] });

        const payload = message.body;
        let displayMessage = payload;

        try {
          let parsed = JSON.parse(payload);
          while (typeof parsed === 'string') {
            parsed = JSON.parse(parsed);
          }
          if (parsed && typeof parsed === 'object') {
            if (parsed.data && parsed.data.message) {
              displayMessage = parsed.data.message;
            } else if (parsed.message) {
              displayMessage = parsed.message;
            }
          }
        } catch (e) { /* Keep as string if not JSON */ }

        notification.warning({
          message: 'System Alert',
          description: displayMessage,
          placement: window.innerWidth < 768 ? 'top' : 'topRight',
          duration: 10,
          key: displayMessage,
        });

        addNotification(displayMessage, 'warning');
      });
    };

    client.activate();

    const handleCustomNotif = (e: any) => {
      addNotification(e.detail.message, e.detail.type || 'info');
    };
    window.addEventListener('add-notification', handleCustomNotif);

    return () => {
      client.deactivate();
      window.removeEventListener('add-notification', handleCustomNotif);
    };
  }, [addNotification]);

  /**
   * @Function: handleClearAll
   * @Description: Xóa toàn bộ thông báo trong danh sách và đặt số lượng chưa đọc về 0.
   */
  const handleClearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
  };

  /**
   * @Function: handleMarkAllAsRead
   * @Description: Đánh dấu tất cả thông báo hiện có trong danh sách là "đã đọc".
   */
  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const typeColorMap: Record<string, string> = {
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  };

  const menuItems: MenuProps['items'] = notifications.length === 0
    ? [
      {
        key: 'empty',
        label: (
          <div style={{ padding: '16px', textAlign: 'center', width: '300px' }}>
            <div style={{ fontSize: '28px', marginBottom: '4px' }}>🔔</div>
            <Text type="secondary">Không có thông báo nào</Text>
          </div>
        ),
        disabled: true,
      },
    ]
    : [
      {
        key: 'header',
        label: (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '320px' }}>
            <Text strong>Thông báo <Text type="secondary" style={{ fontSize: '12px' }}>({notifications.length})</Text></Text>
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button type="link" size="small" onClick={handleMarkAllAsRead}>
                Đọc tất cả
              </Button>
              <Button type="link" size="small" danger onClick={handleClearAll} icon={<DeleteOutlined />}>
                Xóa
              </Button>
            </div>
          </div>
        ),
      },
      { type: 'divider' },
      ...notifications.slice(0, 20).map((n) => ({
        key: n.key,
        label: (
          <div style={{ padding: '6px 0', opacity: n.read ? 0.55 : 1, width: '320px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: typeColorMap[n.type || 'info'], flexShrink: 0, marginTop: '5px' }} />
            <div style={{ flex: 1 }}>
              <div style={{ whiteSpace: 'normal', marginBottom: '2px', lineHeight: '1.4' }}>
                <Text strong={!n.read} style={{ fontSize: '13px' }}>{n.message}</Text>
              </div>
              <Text type="secondary" style={{ fontSize: '11px' }}>
                {dayjs(n.time).format('HH:mm DD/MM/YYYY')}
              </Text>
            </div>
          </div>
        ),
        onClick: () => {
          if (!n.read) {
            setNotifications((prev) =>
              prev.map((item) => (item.key === n.key ? { ...item, read: true } : item))
            );
            setUnreadCount((prev) => Math.max(0, prev - 1));
          }
        },
      })),
    ];

  const bellIcon = (
    <Badge count={unreadCount} style={{ cursor: 'pointer' }}>
      <BellOutlined style={{ fontSize: '20px', cursor: 'pointer', padding: '4px' }} />
    </Badge>
  );

  return (
    <>
      {isMobile ? (
        <>
          <div
            style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => setIsDrawerOpen(true)}
          >
            {bellIcon}
          </div>
          <Drawer
            title={
              <div className="flex justify-between items-center w-full">
                <span>Notifications</span>
                {notifications.length > 0 && (
                  <Button type="link" size="small" onClick={handleMarkAllAsRead}>
                    Mark all as read
                  </Button>
                )}
              </div>
            }
            placement="bottom"
            height="85vh"
            onClose={() => setIsDrawerOpen(false)}
            open={isDrawerOpen}
            className="rounded-t-2xl"
            styles={{ header: { borderBottom: '1px solid #f0f0f0' }, body: { padding: 0 } }}
          >
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No new notifications</div>
            ) : (
              <List
                className="w-full"
                itemLayout="horizontal"
                dataSource={notifications}
                renderItem={(n) => (
                  <List.Item
                    className={`px-4 py-3 cursor-pointer border-b border-gray-100 transition-colors ${!n.read ? 'bg-blue-50/50' : ''}`}
                    onClick={() => {
                      if (!n.read) {
                        setNotifications((prev) =>
                          prev.map((item) => (item.key === n.key ? { ...item, read: true } : item))
                        );
                        setUnreadCount((prev) => Math.max(0, prev - 1));
                      }
                    }}
                  >
                    <div className="flex flex-col w-full">
                      <Text strong={!n.read} className="text-sm mb-1">{n.message}</Text>
                      <Text type="secondary" className="text-xs">{dayjs(n.time).format('HH:mm DD/MM/YYYY')}</Text>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Drawer>
        </>
      ) : (
        <Dropdown menu={{ items: menuItems }} trigger={['click']} placement="bottomRight">
          <div style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', marginRight: 4 }}>
            {bellIcon}
          </div>
        </Dropdown>
      )}
    </>
  );
};
