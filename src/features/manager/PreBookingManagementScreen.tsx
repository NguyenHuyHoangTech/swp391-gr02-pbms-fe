/**
 * @Author: Thái Tân Phú
 * @Date: 28/07/2026
 * @Description: Màn hình Quản lý Đặt chỗ (PreBooking Management) dành cho Quản lý. Giúp theo dõi lượng xe dự kiến vào bãi, cấu hình thời gian và tỷ lệ hoàn tiền.
 * @Dependencies: 
 * - React, antd
 * - axiosClient, react-query, dayjs
 */
import { simulatedDayjs } from '../../core/utils/timeProvider';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import {
  Card, Typography, Table, Tag, Button, Input, DatePicker, Select,
  Row, Col, Statistic, Drawer, Timeline, Divider, InputNumber, message, Modal, Form
} from 'antd';
import {
  ScheduleOutlined, SearchOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ClockCircleOutlined, SettingOutlined,
  RightCircleOutlined, BugOutlined
} from '@ant-design/icons';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { ReservationTimersDebug } from '../debug/ReservationTimersDebug';

const { Title, Text } = Typography;

interface PreBooking {
  id: string;
  plateNumber: string;
  expectedEntryTime: string;
  expectedDurationMinutes: number;
  actualIn: string | null;
  actualOut: string | null;
  reservationFee: number;
  penaltyFee: number;
  refundAmount?: number;
  refundStatus?: string;
  status: 'PENDING' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  createdAt: string;
  paymentTime: string | null;
  slotName: string | null;
}

export const PreBookingManagementScreen = () => {
  const [selectedRecord, setSelectedRecord] = useState<PreBooking | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [debugReservationId, setDebugReservationId] = useState<number | null>(null);

  const [filterDateRange, setFilterDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([
    simulatedDayjs().subtract(7, 'day'),
    simulatedDayjs()
  ]);
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchKeyword, setSearchKeyword] = useState('');

  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  // ==========================================
  // [DATA]: LẤY CẤU HÌNH HỆ THỐNG
  // - Bước 1: Gọi API GET `/system/configs` để lấy tất cả cấu hình.
  // - Bước 2: Dùng cấu hình này để thiết lập số phút cảnh báo sớm, tỷ lệ hoàn tiền khi khách hủy vé.
  // ==========================================
  const { data: configs } = useQuery({
    queryKey: ['system-configs'],
    queryFn: async () => {
      const res = await axiosClient.get('/system/configs');
      return res.data.data;
    }
  });

  const getCfg = (key: string, def: string) => configs?.find((c: any) => c.configKey === key)?.configValue || def;

  const openSettings = () => {
    form.setFieldsValue({
      earlyMins: parseInt(getCfg('RESERVATION_EARLY_MINS', '30')),
      refundLate: parseFloat(getCfg('RESERVATION_REFUND_LATE_PERCENT', '0.5')) * 100,
      refundEarly: parseFloat(getCfg('RESERVATION_REFUND_EARLY_PERCENT', '1.0')) * 100,
      defaultDur: parseInt(getCfg('RESERVATION_DEFAULT_DURATION_MINS', '120'))
    });
    setIsSettingsModalOpen(true);
  };

  // ==========================================
  // [API]: CẬP NHẬT CẤU HÌNH HỆ THỐNG
  // - Lặp qua 4 key cấu hình (RESERVATION_EARLY_MINS, RESERVATION_REFUND_LATE_PERCENT, RESERVATION_REFUND_EARLY_PERCENT, RESERVATION_DEFAULT_DURATION_MINS).
  // - Kiểm tra xem key đã tồn tại chưa:
  //   + Nếu tồn tại và giá trị bị thay đổi: Gọi API PUT (Cập nhật).
  //   + Nếu chưa tồn tại: Gọi API POST (Tạo mới).
  // - Sau khi chạy xong, gọi `invalidateQueries` để cập nhật giao diện.
  // ==========================================
  const updateConfigsMutation = useMutation({
    mutationFn: async (values: any) => {
      const saveOrUpdate = async (key: string, val: string, desc: string) => {
        const obj = configs?.find((c: any) => c.configKey === key);
        if (obj) {
          if (obj.configValue !== val) {
            await axiosClient.put(`/system/configs/${obj.id}`, { ...obj, configValue: val });
          }
        } else {
          await axiosClient.post(`/system/configs`, { configKey: key, configValue: val, description: desc });
        }
      };

      await saveOrUpdate('RESERVATION_EARLY_MINS', values.earlyMins.toString(), 'Minutes before reservation time');
      await saveOrUpdate('RESERVATION_REFUND_LATE_PERCENT', (values.refundLate / 100).toString(), 'Late refund %');
      await saveOrUpdate('RESERVATION_REFUND_EARLY_PERCENT', (values.refundEarly / 100).toString(), 'Early refund %');
      await saveOrUpdate('RESERVATION_DEFAULT_DURATION_MINS', values.defaultDur.toString(), 'Default duration in mins');
    },
    onSuccess: () => {
      message.success('Settings updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['system-configs'] });
      setIsSettingsModalOpen(false);
    },
    onError: () => message.error('Failed to update settings')
  });

  // ==========================================
  // [DATA]: LẤY DANH SÁCH ĐẶT CHỖ
  // - Gọi API GET `/customer/reservations`.
  // - Lấy danh sách toàn bộ phiên đặt chỗ (PENDING, ACTIVE, COMPLETED, CANCELLED) của khách hàng.
  // ==========================================
  const { data: bookingsData } = useQuery({
    queryKey: ['reservations'],
    queryFn: async () => {
      const res = await axiosClient.get('/customer/reservations');
      return res.data.data;
    }
  });

  const allBookings = React.useMemo(() => bookingsData || [], [bookingsData]);

  // ==========================================
  // [LOGIC]: LỌC DANH SÁCH THEO TỪ KHÓA VÀ THỜI GIAN
  // - Bước 1: Lọc khoảng ngày (Date matching) theo `expectedEntryTime`.
  // - Bước 2: Lọc theo text (Search keyword): Tìm theo ID, Biển số hoặc Email.
  // ==========================================
  const baseFilteredBookings = React.useMemo(() => {
    return allBookings.filter((b: any) => {
      // Lọc theo khoảng ngày (Date matching)
      let matchDate = true;
      if (filterDateRange && filterDateRange[0] && filterDateRange[1] && b.expectedEntryTime) {
        const bDate = dayjs(b.expectedEntryTime);
        const start = filterDateRange[0].startOf('day');
        const end = filterDateRange[1].endOf('day');
        matchDate = (bDate.isAfter(start) || bDate.isSame(start)) &&
          (bDate.isBefore(end) || bDate.isSame(end));
      }

      // Lọc theo từ khóa tìm kiếm (Search matching)
      let matchSearch = true;
      if (searchKeyword) {
        const kw = searchKeyword.toLowerCase();
        matchSearch =
          (b.id && String(b.id).toLowerCase().includes(kw)) ||
          (b.plateNumber && b.plateNumber.toLowerCase().includes(kw)) ||
          (b.userEmail && b.userEmail.toLowerCase().includes(kw));
      }

      return matchDate && matchSearch;
    });
  }, [allBookings, filterDateRange, searchKeyword]);

  // ==========================================
  // [LOGIC]: LỌC THEO TRẠNG THÁI
  // - Từ danh sách đã lọc ngày & từ khóa, lọc tiếp theo `filterStatus`.
  // ==========================================
  const filteredBookings = React.useMemo(() => {
    return baseFilteredBookings.filter((b: any) => {
      if (filterStatus !== 'ALL') {
        return b.status === filterStatus;
      }
      return true;
    });
  }, [baseFilteredBookings, filterStatus]);

  const upcomingCount = allBookings.filter((b: any) => b.status === 'PENDING').length;
  const ongoingCount = allBookings.filter((b: any) => b.status === 'ACTIVE').length;
  const completedCount = allBookings.filter((b: any) => b.status === 'COMPLETED').length;
  const cancelledCount = allBookings.filter((b: any) => b.status === 'CANCELLED').length;

  const handleOpenDrawer = (record: PreBooking) => {
    setSelectedRecord(record);
    setIsDrawerOpen(true);
  };

  const columns = [
    { title: 'Booking Code', dataIndex: 'id', key: 'id', render: (text: string) => <Text strong>{text}</Text> },
    { title: 'User Email', dataIndex: 'userEmail', key: 'userEmail', render: (text: string) => <Text>{text}</Text> },
    { 
      title: 'License Plate', 
      dataIndex: 'plateNumber', 
      key: 'plateNumber', 
      render: (text: string, record: PreBooking) => (
        <Tag 
          color="blue" 
          className="font-bold text-base cursor-pointer hover:bg-blue-100 transition-colors"
          onClick={() => setDebugReservationId(Number(record.id))}
          title="Click to view Debug Timers"
        >
          {text} 
        </Tag>
      ) 
    },
    {
      title: 'Expected (In - Duration)',
      key: 'expected',
      render: (_: any, record: PreBooking) => {
        const inTime = record.expectedEntryTime ? simulatedDayjs(record.expectedEntryTime).format('HH:mm DD/MM') : 'N/A';
        return <Text><ClockCircleOutlined className="mr-1 text-gray-400" />{inTime} ({record.expectedDurationMinutes} mins)</Text>;
      }
    },
    {
      title: 'Actual In',
      dataIndex: 'actualIn',
      key: 'actualIn',
      render: (text: string) => text ? <Text strong className="text-green-600">{text}</Text> : <Text type="secondary">-</Text>
    },
    {
      title: 'Actual Out',
      dataIndex: 'actualOut',
      key: 'actualOut',
      render: (text: string) => text ? <Text strong className="text-green-600">{text}</Text> : <Text type="secondary">-</Text>
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: PreBooking) => {
        if (status === 'PENDING') return <Tag color="gold" className="font-bold">ĐÃ ĐẶT CHỖ</Tag>;
        if (status === 'ACTIVE') return <Tag color="blue" className="font-bold animate-pulse">ĐANG TRONG BÃI</Tag>;
        if (status === 'ONGOING') return <Tag color="orange" className="font-bold animate-pulse">ONGOING</Tag>;
        if (status === 'COMPLETED') return <Tag color="green" className="font-bold"><CheckCircleOutlined className="mr-1" />ĐÃ HOÀN THÀNH</Tag>;
        if (status === 'COMPLETED_UNUSED') return <Tag color="default" className="font-bold">NO SHOW</Tag>;

        if (status === 'CANCELLED') {
          if (record.refundStatus === 'PENDING') return <Tag color="red" className="font-bold"><CloseCircleOutlined className="mr-1" />ĐÃ HỦY (ĐANG HOÀN TIỀN)</Tag>;
          if (record.refundStatus === 'REFUNDED' || record.refundStatus === 'SUCCESS') return <Tag color="red" className="font-bold"><CloseCircleOutlined className="mr-1" />ĐÃ HỦY (ĐÃ HOÀN TIỀN)</Tag>;
          return <Tag color="red" className="font-bold"><CloseCircleOutlined className="mr-1" />ĐÃ HỦY</Tag>;
        }
        return <Tag color="default" className="font-bold">{status}</Tag>;
      }
    },
    {
      title: 'Booking Fee',
      dataIndex: 'reservationFee',
      key: 'reservationFee',
      render: (fee: number) => <Text strong className="text-blue-600">{(fee || 0).toLocaleString()} ₫</Text>
    },
    {
      title: 'Penalty Fee',
      dataIndex: 'penaltyFee',
      key: 'penaltyFee',
      render: (fee: number) => <Text strong className="text-red-600">{(fee || 0).toLocaleString()} ₫</Text>
    },
    {
      title: 'Action',
      key: 'action',
      render: (_: any, record: PreBooking) => (
        <Button type="link" onClick={() => handleOpenDrawer(record)} icon={<RightCircleOutlined />}>Details</Button>
      )
    }
  ];

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 pb-24">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <Title level={2} className="m-0 text-gray-800 flex items-center">
            <ScheduleOutlined className="mr-3 text-indigo-600" /> Pre-booking Management
          </Title>
          <Text type="secondary">Monitor the expected traffic flow to the parking lot in Real-time</Text>
        </div>
        <Button
          type="primary"
          icon={<SettingOutlined />}
          onClick={openSettings}
          size="large"
          className="shadow-sm"
        >
          Configuration
        </Button>
      </div>

      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-blue-500 bg-blue-50/30">
            <Statistic title="ĐÃ ĐẶT CHỖ" value={upcomingCount} suffix="Vehicles" valueStyle={{ color: '#1890ff', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-orange-500 bg-orange-50/30">
            <Statistic
              title={<span className="text-orange-600 animate-pulse font-semibold">ĐANG TRONG BÃI</span>}
              value={ongoingCount} suffix="Vehicles" valueStyle={{ color: '#d97706', fontWeight: 'bold' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-green-500">
            <Statistic title="COMPLETED" value={completedCount} suffix="Reservations" valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-gray-400">
            <Statistic title="CANCELLED" value={cancelledCount} suffix="Reservations" valueStyle={{ color: '#6b7280', fontWeight: 'bold' }} />
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm mb-6">
        <div className="flex gap-4">
          <DatePicker.RangePicker
            value={[filterDateRange[0], filterDateRange[1]]}
            onChange={(dates) => {
              if (dates) {
                setFilterDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null]);
              } else {
                setFilterDateRange([null, null]);
              }
            }}
            format="DD/MM/YYYY"
            className="w-75"
            allowClear={true}
          />
          <Select value={filterStatus} onChange={setFilterStatus} className="w-48" options={[
            { label: 'All Status', value: 'ALL' },
            { label: 'Đã đặt chỗ', value: 'PENDING' },
            { label: 'Đang trong bãi', value: 'ACTIVE' },
            { label: 'Đã hoàn thành', value: 'COMPLETED' },
            { label: 'Đã hủy', value: 'CANCELLED' }
          ]} />
          <Input
            placeholder="Type in Booking Code or License Plate"
            prefix={<SearchOutlined />}
            className="w-80"
            allowClear
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
      </Card>

      <Card className="shadow-sm rounded-xl border-gray-200" bodyStyle={{ padding: 0 }}>
        <Table
          dataSource={filteredBookings}
          columns={columns}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={<div><SettingOutlined className="mr-2" /> Reservation Configuration</div>}
        open={isSettingsModalOpen}
        onCancel={() => setIsSettingsModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={updateConfigsMutation.isPending}
      >
        <Form form={form} layout="vertical" onFinish={(values) => updateConfigsMutation.mutate(values)}>
          <Form.Item label="Early Arrival Window (mins)" name="earlyMins" extra="Minutes before reservation time when early arrival is allowed without penalty">
            <InputNumber className="w-full" min={0} max={120} />
          </Form.Item>
          <Form.Item label="Late Refund Percentage (%)" name="refundLate" extra="Refund % if cancelled within the early arrival window">
            <InputNumber className="w-full" min={0} max={100} />
          </Form.Item>
          <Form.Item label="Early Refund Percentage (%)" name="refundEarly" extra="Refund % if cancelled before the early arrival window">
            <InputNumber className="w-full" min={0} max={100} />
          </Form.Item>
          <Form.Item label="Default Duration (mins)" name="defaultDur" extra="Default expected parking duration if not specified">
            <InputNumber className="w-full" min={30} max={1440} />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={<span className="font-bold text-lg">Booking Details: {selectedRecord?.id}</span>}
        placement="right"
        width={450}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
      >
        {selectedRecord && (
          <div className="flex flex-col gap-6">

            <div className="flex justify-between items-center bg-indigo-50 p-4 rounded-lg border border-indigo-100">
              <div>
                <Text type="secondary" className="block text-xs uppercase mb-1">License Plate</Text>
                <Tag color="blue" className="m-0 font-bold text-lg">{selectedRecord.plateNumber}</Tag>
              </div>
              <div className="text-right">
                <Text type="secondary" className="block text-xs uppercase mb-1">Parking Location</Text>
                {selectedRecord.slotName ? (
                  <Text strong className="text-xl text-indigo-700">{selectedRecord.slotName}</Text>
                ) : (
                  <Text type="secondary" className="italic">Not assigned yet</Text>
                )}
              </div>
            </div>

            <div>
              <Title level={5} className="text-gray-800 border-b pb-2">1. Order Lifecycle</Title>
              <Timeline className="mt-4"
                items={[
                  {
                    color: 'blue',
                    children: (
                      <div>
                        <Text strong>Customer created Reservation</Text><br />
                        <Text type="secondary" className="text-xs">At {selectedRecord.createdAt ? simulatedDayjs(selectedRecord.createdAt).format('HH:mm DD/MM') : 'N/A'}</Text>
                      </div>
                    )
                  },
                  {
                    color: selectedRecord.status === 'PENDING' ? 'gray' : 'green',
                    children: (
                      <div>
                        <Text strong>{selectedRecord.status === 'PENDING' ? 'Not yet paid' : 'Reservation fee paid'}</Text><br />
                      </div>
                    )
                  },
                  selectedRecord.status === 'CANCELLED' ? {
                    color: 'red',
                    children: (
                      <div>
                        <Text strong className="text-red-600">Reservation was cancelled</Text>
                        {(selectedRecord.refundAmount ?? 0) > 0 && (
                          <div className="mt-1">
                            <Text type="secondary" className="text-xs">Refund: </Text>
                            <Text strong className="text-blue-600">{selectedRecord.refundAmount!.toLocaleString()} ₫</Text>
                            <Tag color={selectedRecord.refundStatus === 'PENDING' ? 'gold' : 'green'} className="ml-2 text-[10px] leading-tight px-1 py-0">
                              {selectedRecord.refundStatus === 'PENDING' ? 'PENDING' : 'DONE'}
                            </Tag>
                          </div>
                        )}
                        {(selectedRecord.refundAmount ?? 0) === 0 && (
                          <div className="mt-1">
                            <Text type="secondary" className="text-xs italic">No refund (Cancelled late or invalid)</Text>
                          </div>
                        )}
                      </div>
                    )
                  } : selectedRecord.actualIn ? {
                    color: 'orange',
                    children: (
                      <div>
                        <Text strong>Vehicle checked-in</Text><br />
                        <Text type="secondary" className="text-xs">At {selectedRecord.actualIn}</Text>
                      </div>
                    )
                  } : { color: 'gray', children: <Text type="secondary">Waiting for vehicle check-in</Text> },

                  (selectedRecord.status !== 'CANCELLED' && selectedRecord.actualOut) ? {
                    color: 'green',
                    children: (
                      <div>
                        <Text strong>Checked-out</Text><br />
                        <Text type="secondary" className="text-xs">At {selectedRecord.actualOut}</Text>
                      </div>
                    )
                  } : (selectedRecord.status !== 'CANCELLED') ? { color: 'gray', children: <Text type="secondary">Waiting for vehicle check-out</Text> } : null,
                ].filter(Boolean) as any}
              />
            </div>

            <div>
              <Title level={5} className="text-gray-800 border-b pb-2">2. Financial Control</Title>
              <div className="bg-slate-100 p-4 rounded-lg flex flex-col gap-2 mt-4">
                <div className="flex justify-between">
                  <Text>Base Fee:</Text>
                  <Text strong>{(selectedRecord.reservationFee || 0).toLocaleString()} ₫</Text>
                </div>

                <div className="flex justify-between text-red-600">
                  <Text type="danger">Penalty Fee:</Text>
                  <Text strong>+ {(selectedRecord.penaltyFee || 0).toLocaleString()} ₫</Text>
                </div>
                {(selectedRecord.penaltyFee || 0) > 0 && (
                  <Text type="secondary" className="text-xs italic text-right mt-[-4px]">
                    (Overstay penalty or No-Show)
                  </Text>
                )}

                <Divider className="my-2" />
                <div className="flex justify-between items-center">
                  <Text strong className="text-base">Total Revenue:</Text>
                  <Text strong className="text-xl text-green-600">
                    {((selectedRecord.reservationFee || 0) + (selectedRecord.penaltyFee || 0)).toLocaleString()} ₫
                  </Text>
                </div>
              </div>
            </div>

          </div>
        )}
      </Drawer>
      <Modal
        title={<div><BugOutlined className="mr-2 text-blue-500" /> Debug Reservation #{debugReservationId}</div>}
        open={!!debugReservationId}
        onCancel={() => setDebugReservationId(null)}
        footer={null}
        width={800}
        destroyOnClose
      >
        {debugReservationId && <ReservationTimersDebug reservationId={debugReservationId} defaultExpanded={true} />}
      </Modal>
    </div>
  );
};
