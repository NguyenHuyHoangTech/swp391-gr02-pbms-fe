/**
 * @Author: Thái Tân Phú
 * @Date: 2026-07-18
 * @Description: Màn hình quản lý Vé Tháng (Monthly Pass Management) dành cho Manager.
 * Tính năng chính:
 * 1. Xem danh sách khách hàng đăng ký vé tháng (Lọc theo trạng thái, loại xe, bãi đỗ).
 * 2. Cấu hình tỷ lệ cảnh báo quá tải (Threshold) và Mức giảm giá (Discounts) cho vé tháng.
 * 3. Tích hợp WebSocket nhận cảnh báo realtime khi bãi đỗ xe vượt ngưỡng (Overload).
 * @Dependencies: 
 * - axiosClient: Call API (/operation/monthly-tickets, configs)
 * - useWebSocket: Kênh '/topic/manager-alerts'
 */
import React, { useState } from 'react';
import {
  Card, Typography, Table, Tag, Button, Space, Input, Select,
  Alert, Statistic, Row, Col, Drawer, Tabs, Timeline, Divider
} from 'antd';
import {
  IdcardOutlined, SearchOutlined, CheckCircleOutlined,
  CloseCircleOutlined, FilterOutlined, MoreOutlined,
  ExclamationCircleOutlined, HistoryOutlined, UserOutlined, CarOutlined, SettingOutlined
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import { notification, Modal, InputNumber } from 'antd';
import axiosClient from '../../core/api/axiosClient';

const { Title, Text } = Typography;

// KHUÔN MẪU DỮ LIỆU (INTERFACE)
// Cấu trúc 1 thẻ Vé tháng trả về từ API lấy danh sách
interface MonthlyPass {
  id: string;
  user: string;
  email: string;
  phone: string;
  plate: string;
  type: string;
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'CANCELED' | 'PENDING' | string;
  startDate: string;
  endDate: string;
  inParkingLot?: boolean; // True = Khách đang gửi xe trong bãi | False = Xe đang ở ngoài
}

export const MonthlyPassScreen = () => {
  // STATE: ĐIỀU KHIỂN GIAO DIỆN CHUNG
  const [selectedRecord, setSelectedRecord] = useState<MonthlyPass | null>(null); // Dữ liệu khách hàng đang xem chi tiết
  const [isDrawerOpen, setIsDrawerOpen] = useState(false); // Bật/tắt ngăn kéo bên phải

  // STATE: MODAL CẤU HÌNH (THRESHOLD & DISCOUNT)
  const [isConfigModalOpen, setIsConfigModalOpen] = React.useState(false);
  const [isConfigDirty, setIsConfigDirty] = React.useState(false); // Cờ đánh dấu có thay đổi config chưa (để bật nút Save)
  const [threshold, setThreshold] = React.useState<number>(90); // Mức % cảnh báo quá tải bãi xe
  const [discounts, setDiscounts] = useState<{ [key: string]: number }>({ '1': 0, '3': 5, '6': 10, '12': 15 }); // % Giảm giá theo tháng

  // WEBSOCKET: Kênh kết nối Real-time
  const { stompClient, connected } = useWebSocket();

  // STATE: BỘ LỌC TÌM KIẾM
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterParking, setFilterParking] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  // EFFECT: Kéo cấu hình (Threshold & Discount) từ Backend ngay khi vừa load trang
  React.useEffect(() => {
    fetchThreshold();
    fetchDiscounts();
  }, []);

  const fetchThreshold = async () => {
    try {
      const res = await axiosClient.get('/operation/monthly-tickets/config-threshold');
      if (res.data.data) {
        setThreshold(res.data.data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchDiscounts = async () => {
    try {
      const res = await axiosClient.get('/operation/monthly-tickets/config-discounts');
      if (res.data.data) {
        const data = res.data.data;
        setDiscounts({
          '1': (data['1'] || 0) * 100,
          '3': (data['3'] || 0) * 100,
          '6': (data['6'] || 0) * 100,
          '12': (data['12'] || 0) * 100,
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  // HÀM: LƯU CẤU HÌNH XUỐNG BACKEND (PUT/POST APIs)
  const handleSaveConfig = async () => {
    try {
      // 1. Lưu cấu hình cảnh báo quá tải
      await axiosClient.put('/operation/monthly-tickets/config-threshold', { threshold });
      
      // 2. Lưu cấu hình giảm giá (Chuyển từ % (số nguyên) sang số thập phân (float) trước khi gửi BE)
      // Ví dụ: Nhập 15% -> Gửi BE là 0.15
      await axiosClient.post('/operation/monthly-tickets/config-discounts', {
        '1': discounts['1'] / 100,
        '3': discounts['3'] / 100,
        '6': discounts['6'] / 100,
        '12': discounts['12'] / 100,
      });
      notification.success({ message: 'Configuration saved successfully!' });
      setIsConfigModalOpen(false);
      setIsConfigDirty(false); // Reset cờ
    } catch (e) {
      notification.error({ message: 'Error saving configuration' });
    }
  };

  // EFFECT: LẮNG NGHE WEBSOCKET (REAL-TIME ALERTS)
  // Logic: Lắng nghe kênh '/topic/manager-alerts'. 
  // Nếu BE đẩy thông báo bãi quá tải (MONTHLY_ZONE_OVERLOAD) -> Mở Popup Cảnh báo ngay lập tức!
  React.useEffect(() => {
    if (stompClient && connected) {
      const subscription = stompClient.subscribe('/topic/manager-alerts', (message) => {
        if (message.body) {
          try {
            const data = JSON.parse(message.body);
            if (data.type === 'MONTHLY_ZONE_OVERLOAD') {
              notification.warning({
                message: 'Monthly Zone Overload Warning',
                description: data.message,
                duration: 0,
                placement: 'topRight',
                style: { borderLeft: '4px solid #faad14' }
              });
            }
          } catch (e) {
            // ignore
          }
        }
      });
      return () => {
        subscription.unsubscribe();
      };
    }
  }, [stompClient, connected]);

  // API QUERY: LẤY DANH SÁCH KHÁCH HÀNG VÉ THÁNG
  const { data: monthlyPassesData, isLoading } = useQuery({
    queryKey: ['monthlyPasses'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/monthly-tickets');
      return res.data.data;
    }
  });

  const passes: MonthlyPass[] = monthlyPassesData || [];

  // KIẾN TRÚC LỌC DỮ LIỆU NHIỀU LỚP (Memoization)
  const filteredPasses = React.useMemo(() => {
    return passes.filter(p => {
      let matchType = true;
      if (filterType !== 'ALL') {
        const t = p.type?.toLowerCase() || '';
        if (filterType === 'CAR') matchType = t.includes('car') || t.includes('van') || t.includes('four');
        if (filterType === 'MOTO') matchType = t.includes('moto') || t.includes('bike');
      }
      let matchStatus = true;
      if (filterStatus !== 'ALL') {
        matchStatus = p.status === filterStatus;
      }
      let matchSearch = true;
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        matchSearch = !!(
          (p.plate && p.plate.toLowerCase().includes(kw)) ||
          (p.user && p.user.toLowerCase().includes(kw)) ||
          (p.email && p.email.toLowerCase().includes(kw)) ||
          (p.phone && p.phone.toLowerCase().includes(kw))
        );
      }
      
      let matchParking = true;
      if (filterParking === 'IN_LOT') matchParking = !!p.inParkingLot;
      if (filterParking === 'OUT_LOT') matchParking = !p.inParkingLot;

      return matchType && matchStatus && matchSearch && matchParking;
    });
  }, [passes, filterType, filterStatus, filterParking, searchKeyword]);

  // TÍNH TOÁN KPI (On-the-fly)
  const activeCount = passes.filter(p => p.status === 'ACTIVE').length;
  const inactiveCount = passes.filter(p => p.status === 'EXPIRED').length;
  
  const handleOpenDrawer = (record: MonthlyPass) => {
    setSelectedRecord(record);
    setIsDrawerOpen(true);
  };

  const columns = [
    { title: 'License Plate xe', dataIndex: 'plate', key: 'plate', render: (text: string) => <Tag color="blue" className="text-base font-bold">{text}</Tag> },
    {
      title: 'Owner',
      key: 'owner',
      render: (_: any, record: MonthlyPass) => (
        <div>
          <Text strong>{record.user}</Text>
          <div className="text-xs text-gray-500">{record.email}</div>
        </div>
      )
    },
    { title: 'Vehicle Type', dataIndex: 'type', key: 'type', render: (text: string) => <Text>{text}</Text> },
    {
      title: 'Current cycle',
      key: 'cycle',
      render: (_: any, record: MonthlyPass) => (
        <Text className="text-xs">{record.startDate} <br /> {record.endDate !== '-' ? 'arrive' : ''} {record.endDate}</Text>
      )
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        if (status === 'ACTIVE') return <Tag color="success" icon={<CheckCircleOutlined />}>Active</Tag>;
        if (status === 'EXPIRING_SOON') return <Tag color="warning" icon={<ExclamationCircleOutlined />}>Expiring Soon</Tag>;
        if (status === 'EXPIRED') return <Tag color="error">Expired</Tag>;
        return <Tag>{status}</Tag>;
      }
    },
    {
      title: 'In Parking Lot',
      key: 'inParkingLot',
      render: (_: any, record: MonthlyPass) => {
        if (record.inParkingLot) {
           return <Tag color={record.status === 'EXPIRED' ? 'red' : 'orange'} className="animate-pulse font-bold border">IN LOT</Tag>;
        }
        return <Tag color="default" className="font-bold border border-gray-300 text-gray-500">OUT</Tag>;
      }
    },
    {
      title: '',
      key: 'action',
      render: (_: any, record: MonthlyPass) => (
        <Button type="text" icon={<MoreOutlined />} onClick={() => handleOpenDrawer(record)} />
      )
    }
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 pb-24">

      <div className="mb-6">
        <div className="flex justify-between items-center w-full">
          <Title level={2} className="m-0 text-gray-800 flex items-center">
            <IdcardOutlined className="mr-3 text-indigo-600" /> Monthly Pass Management
          </Title>
          <Button type="primary" icon={<SettingOutlined />} onClick={() => setIsConfigModalOpen(true)}>
            Config Threshold
          </Button>
        </div>
        <Text type="secondary">System CRM Manage subscriptions, maintain cash flow and control long-term capacity</Text>
      </div>

      {/* KPI CARDS */}
      <Row gutter={16} className="mb-6">
        <Col span={12}>
          <Card className="shadow-sm border-l-4 border-l-green-500">
            <Statistic title="Active" value={activeCount} suffix="Subscribe" valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={12}>
          <Card className="shadow-sm border-l-4 border-l-gray-400">
            <Statistic title="Expired" value={inactiveCount} suffix="Subscribe" valueStyle={{ color: '#6b7280', fontWeight: 'bold' }} />
          </Card>
        </Col>
      </Row>

      {/* FILTER BAR */}
      <Card className="shadow-sm mb-6">
        <div className="flex gap-4">
          <Select value={filterType} onChange={setFilterType} className="w-40" options={[
            { label: 'all Vehicle Types', value: 'ALL' },
            { label: 'Car', value: 'CAR' },
            { label: 'Motorbike', value: 'MOTO' }
          ]} />
          <Select value={filterStatus} onChange={setFilterStatus} className="w-48" options={[
            { label: 'All Status', value: 'ALL' },
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Expired', value: 'EXPIRED' }
          ]} />
          <Select value={filterParking} onChange={setFilterParking} className="w-48" options={[
            { label: 'All Parking Status', value: 'ALL' },
            { label: 'In Parking Lot', value: 'IN_LOT' },
            { label: 'Out of Lot', value: 'OUT_LOT' }
          ]} />
          <Input
            placeholder="Type in Vehicle License Plate, Email, Phone Number"
            prefix={<SearchOutlined />}
            className="w-80"
            allowClear
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
      </Card>

      {/* DATA TABLE */}
      <Card className="shadow-sm rounded-xl border-gray-200" bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={filteredPasses}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          loading={isLoading}
        />
      </Card>

      {/* RIGHT DRAWER: CRM DETAIL */}
      <Drawer
        title={<span className="font-bold text-lg">Subscriber Profile: {selectedRecord?.id}</span>}
        placement="right"
        width={450}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
      >
        {selectedRecord && (
          <Tabs defaultActiveKey="1" items={[
            {
              key: '1',
              label: <span><UserOutlined />  Customer profile</span>,
              children: (
                <div className="flex flex-col gap-4 mt-2">
                  <Card size="small" title="Personal Information" className="bg-slate-50">
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between"><Text type="secondary">Full name:</Text> <Text strong>{selectedRecord.user}</Text></div>
                      <div className="flex justify-between"><Text type="secondary">Email:</Text> <Text strong>{selectedRecord.email}</Text></div>
                      <div className="flex justify-between"><Text type="secondary">Phone:</Text> <Text strong>{selectedRecord.phone}</Text></div>
                    </div>
                  </Card>
                  <Card size="small" title="Vehicle information" className="bg-slate-50">
                    <div className="flex flex-col gap-2">
                      <div className="flex justify-between"><Text type="secondary">License Plate:</Text> <Tag color="blue" className="m-0 font-bold">{selectedRecord.plate}</Tag></div>
                      <div className="flex justify-between"><Text type="secondary">Vehicle Type:</Text> <Text strong><CarOutlined className="mr-1" />{selectedRecord.type}</Text></div>
                    </div>
                  </Card>
                </div>
              )
            },
            {
              key: '2',
              label: <span><HistoryOutlined />  Payment History</span>,
              children: (
                <div className="mt-4">
                  <div className="text-center py-6 text-gray-400 italic">

                    (The feature to view payment history is being developed)
                  </div>
                </div>
              )
            }
          ]} />
        )}
      </Drawer>

      <Modal
        title="Monthly Pass Configuration"
        open={isConfigModalOpen}
        onOk={handleSaveConfig}
        okButtonProps={{ disabled: !isConfigDirty }}
        onCancel={() => {
          setIsConfigModalOpen(false);
          setIsConfigDirty(false);
        }}
      >
        <div className="flex flex-col gap-4 mt-4">
          <div>
            <Text strong className="text-lg">Zone Alert Configuration</Text>
            <Text className="block text-gray-500 mb-2">
              Enter the % of registered monthly tickets compared to the total slots.
            </Text>
            <div className="flex items-center gap-2">
              <Text>Alert Threshold (%):</Text>
                <InputNumber
                  min={1}
                  max={200}
                  value={threshold}
                  onChange={(val) => {
                    setThreshold(val || 90);
                    setIsConfigDirty(true);
                  }}
                />
            </div>
          </div>
          <Divider className="my-2" />
          <div>
            <Text strong className="text-lg">Discount Configuration</Text>
            <Text className="block text-gray-500 mb-4">
              Configure the discount percentage for long-term monthly passes.
            </Text>
            <Row gutter={[16, 16]}>
              {['1', '3', '6', '12'].map((months) => (
                <Col span={12} key={months}>
                  <div className="flex flex-col">
                    <Text>{months} {months === '1' ? 'Month' : 'Months'} Discount (%):</Text>
                    <InputNumber
                      className="w-full"
                      min={0}
                      max={100}
                      value={discounts[months]}
                      onChange={(val) => {
                        setDiscounts({ ...discounts, [months]: val || 0 });
                        setIsConfigDirty(true);
                      }}
                    />
                  </div>
                </Col>
              ))}
            </Row>
          </div>
        </div>
      </Modal>
    </div>
  );
};
