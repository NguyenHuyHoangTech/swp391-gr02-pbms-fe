import React, { useState } from 'react';
import { 
  Card, Typography, Table, Tag, Button, message, Space, Row, Col, 
  Statistic, DatePicker, Select, Input, Drawer, Timeline, Alert, Divider, Upload
} from 'antd';
import { 
  DollarOutlined, CheckCircleOutlined, SyncOutlined, CopyOutlined, 
  WarningOutlined, InboxOutlined, MoreOutlined, CloseCircleOutlined, UploadOutlined, FilterOutlined
} from '@ant-design/icons';
import type { UploadProps } from 'antd';
import dayjs from 'dayjs';
import { simulatedDayjs } from '../../core/utils/timeProvider';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;
const { Search } = Input;
const { Dragger } = Upload;
const { TextArea } = Input;

interface RefundRecord {
  id: string;
  customerName: string;
  customerEmail: string;
  registeredName: string; // App registered name
  plateNumber: string;
  bookingTime: string;
  expectedInTime: string;
  cancelTime: string;
  paidAmount: number;
  penaltyFee: number;
  refundAmount: number;
  status: 'PENDING' | 'REFUNDED' | 'REJECTED';
  bankName: string;
  accountNumber: string;
  accountName: string;
  rejectReason?: string;
  referenceType?: string;
  proofUrl?: string;
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';

export const RefundManagementScreen = () => {
  const queryClient = useQueryClient();

  const { data: refundsData = [], isLoading } = useQuery({
    queryKey: ['refunds'],
    queryFn: async () => {
      const res = await axiosClient.get('/finance/refunds');
      return res.data.data;
    }
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const numericId = id.replace('REF-', '');
      await axiosClient.put(`/finance/refunds/${numericId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string, reason: string }) => {
      const numericId = id.replace('REF-', '');
      await axiosClient.put(`/finance/refunds/${numericId}/reject`, { rejectReason: reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['refunds'] });
    }
  });
  const [selectedRecord, setSelectedRecord] = useState<RefundRecord | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  
  // Processing States
  const [proofUploaded, setProofUploaded] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const pendingCount = refundsData.filter((d: RefundRecord) => d.status === 'PENDING').length;
  const totalPendingAmount = refundsData.filter((d: RefundRecord) => d.status === 'PENDING').reduce((acc: number, curr: RefundRecord) => acc + curr.refundAmount, 0);
  const totalRefundedToday = refundsData.filter((d: RefundRecord) => d.status === 'REFUNDED').reduce((acc: number, curr: RefundRecord) => acc + curr.refundAmount, 0);

  const handleOpenDrawer = (record: RefundRecord) => {
    setSelectedRecord(record);
    setProofUploaded(false);
    setIsRejecting(false);
    setRejectReason('');
    setIsDrawerOpen(true);
  };

  const handleCopy = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    message.success(`Copied ${type}!`);
  };

  const handleApprove = () => {
    if (!selectedRecord) return;
    message.loading({ content: 'Processing the ordereee', key: 'process' });
    approveMutation.mutate(selectedRecord.id, {
      onSuccess: () => {
        setIsDrawerOpen(false);
        message.success({ content: `Refund successful for ID ${selectedRecord.id}!`, key: 'process', duration: 3 });
      }
    });
  };

  const handleReject = () => {
    if (!selectedRecord) return;
    if (!rejectReason.trim()) {
      message.error('Please enter reason for Reject!');
      return;
    }
    message.loading({ content: 'Rejecting requesteee', key: 'process' });
    rejectMutation.mutate({ id: selectedRecord.id, reason: rejectReason }, {
      onSuccess: () => {
        setIsDrawerOpen(false);
        message.success({ content: `Rejected refund request ${selectedRecord.id}!`, key: 'process', duration: 3 });
      }
    });
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      if (!selectedRecord) return;
      const formData = new FormData();
      formData.append('file', file as Blob);
      const numericId = selectedRecord.id.replace('REF-', '');
      try {
        const res = await axiosClient.post(`/finance/refunds/${numericId}/proof`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setProofUploaded(true);
        onSuccess?.(res.data);
        message.success('Download photo proof of Success!');
        queryClient.invalidateQueries({ queryKey: ['refunds'] });
        
        // Update local state to show image immediately
        setSelectedRecord(prev => prev ? {...prev, proofUrl: res.data.data} : null);
      } catch (err) {
        onError?.(err as any);
        message.error('Download image Failed!');
      }
    },
    onRemove: () => {
      setProofUploaded(false);
    }
  };

  const columns = [
    {
      title: 'Ma oeu Cau',
      dataIndex: 'id',
      key: 'id',
      render: (text: string, record: RefundRecord) => (
        <div>
          <Text strong>{text}</Text>
          <div className="text-xs text-gray-500 mt-1">{record.plateNumber}</div>
        </div>
      )
    },
    {
      title: 'Customer',
      dataIndex: 'customerName',
      key: 'customerName',
      render: (text: string, record: RefundRecord) => (
        <div>
          <Text strong>{text}</Text>
          <br/>
          <Text type="secondary" className="text-xs">{record.customerEmail}</Text>
        </div>
      )
    },
    {
      title: 'TG Cancel (Cancel Time)',
      dataIndex: 'cancelTime',
      key: 'cancelTime',
    },
    {
      title: 'Amount to be refunded',
      dataIndex: 'refundAmount',
      key: 'refundAmount',
      render: (amount: number) => <Text strong className="text-orange-600">{amount.toLocaleString()} VND</Text>
    },
    {
      title: 'Status',
      key: 'status',
      dataIndex: 'status',
      render: (status: string) => {
        if (status === 'REFUNDED') {
          return <Tag color="success" icon={<CheckCircleOutlined />}>Completed</Tag>;
        }
        if (status === 'REJECTED') {
          return <Tag color="error" icon={<CloseCircleOutlined />}>Reject</Tag>;
        }
        return <Tag color="warning" icon={<SyncOutlined spin />}>Waiting</Tag>;
      }
    },
    {
      title: '',
      key: 'action',
      render: (_: any, record: RefundRecord) => (
        <Button 
          type="text" 
          icon={<MoreOutlined />} 
          onClick={() => handleOpenDrawer(record)}
        />
      )
    }
  ];

  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchText, setSearchText] = useState<string>('');
  
  // Date states
  const [dateRange, setDateRange] = useState<any>([
    simulatedDayjs().subtract(7, 'day').startOf('day'), 
    simulatedDayjs().endOf('day')
  ]);

  const filteredData = refundsData.filter((record: RefundRecord) => {
    // 1. Filter by status
    if (filterStatus !== 'ALL' && record.status !== filterStatus) return false;
    
    // 2. Filter by search text (ID or Plate)
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      const matchId = record.id?.toLowerCase().includes(lowerSearch);
      const matchPlate = record.plateNumber?.toLowerCase().includes(lowerSearch);
      if (!matchId && !matchPlate) return false;
    }

    // 3. Filter by date (cancelTime)
    if (dateRange && dateRange[0] && dateRange[1]) {
      // Backend format is "yyyy-MM-dd HH:mm", replace space with T to make it standard ISO for dayjs
      const isoString = record.cancelTime ? record.cancelTime.replace(' ', 'T') : '';
      const recordDate = dayjs(isoString);
      
      if (recordDate.isValid()) {
        const start = dateRange[0].startOf('day');
        const end = dateRange[1].endOf('day');
        if (recordDate.isBefore(start) || recordDate.isAfter(end)) return false;
      }
    }
    
    return true;
  });

  return (
    <div className="h-full overflow-y-auto bg-slate-50 p-6 pb-24">
      {/* GLOBAL HEADER */}
      <div className="mb-6 flex justify-between items-center">
        <div>
          <Title level={2} className="m-0 text-slate-800 flex items-center">
            <DollarOutlined className="mr-3 text-green-600" /> Refund Management
          </Title>
          <Text type="secondary">Resolve requests to cancel reservations and refund deposits to Customers</Text>
        </div>
      </div>

      {/* Zone 1: TOP BAR & KPI */}
      <Row gutter={16} className="mb-6">
        <Col span={8}>
          <Card className={`shadow-sm ${pendingCount > 0 ? 'border-orange-300 bg-orange-50/30' : ''}`}>
            <Statistic 
              title={<span className={pendingCount > 0 ? 'text-orange-600 font-semibold animate-pulse' : ''}>pending request</span>}
              value={pendingCount} 
              suffix="Tickets" 
              valueStyle={{ color: pendingCount > 0 ? '#d97706' : '#000', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="shadow-sm">
            <Statistic 
              title="Total amount to be refunded (Pending)" 
              value={totalPendingAmount} 
              suffix="VND" 
              valueStyle={{ color: '#cf1322', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="shadow-sm">
            <Statistic 
              title="Completed today" 
              value={totalRefundedToday} 
              suffix="VND" 
              valueStyle={{ color: '#3f8600', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
      </Row>

      <Card className="shadow-sm mb-6">
        <div className="flex gap-4">
          <Select 
            value={filterStatus} 
            onChange={setFilterStatus}
            className="w-40" 
            options={[
              {label: 'Waiting', value: 'PENDING'},
              {label: 'Completed', value: 'REFUNDED'},
              {label: 'Reject', value: 'REJECTED'},
              {label: 'All', value: 'ALL'}
            ]} 
          />
          <RangePicker 
            format="DD/MM/YYYY" 
            placeholder={['From date', 'To date']} 
            className="w-96" 
            value={dateRange}
            onChange={setDateRange}
          />
          <Search 
            placeholder="Enter Request ID or License Plate" 
            className="w-80" 
            allowClear 
            onSearch={setSearchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button onClick={() => message.info('Export feature coming soon!')}>Export Excel File</Button>
        </div>
      </Card>

      {/* Zone 2: DATA TABLE */}
      <Card className="shadow-sm rounded-xl border-slate-200" bodyStyle={{ padding: 0 }}>
        <Table 
          columns={columns} 
          dataSource={filteredData} 
          rowKey="id"
          pagination={{ pageSize: 10 }}
          rowClassName={(record) => record.status === 'PENDING' ? 'bg-orange-50/50' : ''}
        />
      </Card>

      {/* Zone 3: RIGHT DRAWER (MASTER-DETAIL) */}
      <Drawer
        title={<span className="font-bold text-lg">Required details: {selectedRecord?.id}</span>}
        placement="right"
        width={500}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
        footer={
          selectedRecord?.status === 'PENDING' && (
            <div className="flex flex-col gap-3 w-full">
              <div className="flex justify-between items-center w-full">
                <Button danger onClick={() => setIsRejecting(!isRejecting)}>
                  
                                              Reject Refund
                                            </Button>
                <Button 
                  type="primary" 
                  className="bg-green-600 hover:bg-green-500" 
                  disabled={!proofUploaded}
                  onClick={handleApprove}
                >
                  
                                              Fund Transfer & Application Closed
                                            </Button>
              </div>
              {isRejecting && (
                <div className="bg-red-50 p-4 rounded-lg border border-red-200 mt-2">
                  <Text strong className="text-red-600 block mb-2">Reason Reject:</Text>
                  <TextArea 
                    rows={3} 
                    placeholder="Example: Wrong account information, contacted customer" 
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="mb-3"
                  />
                  <div className="flex justify-end">
                    <Button danger type="primary" onClick={handleReject}>Confirm Reject</Button>
                  </div>
                </div>
              )}
            </div>
          )
        }
      >
        {selectedRecord && (
          <div className="flex flex-col gap-6">
            
            {/* Status Banner */}
            {selectedRecord.status === 'REFUNDED' && (
              <Alert message="This application has been successfully refunded" type="success" showIcon />
            )}
            {selectedRecord.status === 'REJECTED' && selectedRecord.referenceType !== 'FAILED_TRANSACTION' && (
              <Alert 
                message="This application has been Rejected" 
                description={<Text className="text-red-700">Reason: {selectedRecord.rejectReason || 'No reason'}</Text>}
                type="error" 
                showIcon 
              />
            )}

            {/* System Error Banner for FAILED_TRANSACTION */}
            {selectedRecord.referenceType === 'FAILED_TRANSACTION' && (
              <Alert 
                message="System Error after Payment" 
                description={
                  <div>
                    <Text className="text-red-700 block mb-1">The customer successfully paid, but the system encountered an error while processing the booking. Please refund the full amount.</Text>
                    <Text className="text-xs text-gray-500 font-mono bg-red-50 p-1 rounded">{selectedRecord.rejectReason}</Text>
                  </div>
                }
                type="error" 
                showIcon 
                className="mb-4"
              />
            )}



            {/* Part A: Cancellation Audit */}
            <div>
              <Title level={5} className="text-indigo-800 border-b pb-2">ae Policy Analysis Cancel</Title>
              <Timeline className="mt-4"
                items={[
                  { color: 'green', children: `Booking time: ${selectedRecord.bookingTime}` },
                  { color: 'blue', children: `Expected in time: ${selectedRecord.expectedInTime}` },
                  { color: 'red', children: `Cancellation time: ${selectedRecord.cancelTime}` },
                ]}
              />
              <div className="bg-slate-100 p-4 rounded-lg flex flex-col gap-2">
                <div className="flex justify-between">
                  <Text>Amount paid by customer:</Text>
                  <Text strong>{selectedRecord.paidAmount.toLocaleString()}  D</Text>
                </div>
                <div className="flex justify-between text-red-600">
                  <Text type="danger">Late cancellation penalty:</Text>
                  <Text strong>- {selectedRecord.penaltyFee.toLocaleString()}  D</Text>
                </div>
                <Divider className="my-2" />
                <div className="flex justify-between items-center">
                  <Text strong className="text-base">Actual receipt (Need to be transferred):</Text>
                  <Text strong className="text-2xl text-red-600">{selectedRecord.refundAmount.toLocaleString()}  D</Text>
                </div>
              </div>
            </div>

            {/* Part B: Customer Bank Info */}
            <div>
              <Title level={5} className="text-indigo-800 border-b pb-2">Be Information Receive money</Title>
              
              {selectedRecord.customerName !== selectedRecord.registeredName && (
                <Alert 
                  message="Misinformation warning!" 
                  description={`Cardholder name does not match App Account Name (${selectedRecord.registeredName}). Please check carefully before proceeding.`}
                  type="warning" 
                  showIcon 
                  icon={<WarningOutlined />}
                  className="mb-4"
                />
              )}

              <div className="flex flex-col gap-3 mt-4">
                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Bank</div>
                    <div className="font-bold text-gray-800">{selectedRecord.bankName}</div>
                  </div>
                  <Button type="text" icon={<CopyOutlined />} onClick={() => handleCopy(selectedRecord.bankName, 'Bank')} />
                </div>

                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Account number</div>
                    <div className="font-bold text-lg text-blue-600 font-mono tracking-wider">{selectedRecord.accountNumber}</div>
                  </div>
                  <Button type="primary" ghost icon={<CopyOutlined />} onClick={() => handleCopy(selectedRecord.accountNumber, 'Account number')} />
                </div>

                <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg shadow-sm">
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Account Owner Name</div>
                    <div className="font-bold text-gray-800">{selectedRecord.accountName}</div>
                  </div>
                  <Button type="text" icon={<CopyOutlined />} onClick={() => handleCopy(selectedRecord.accountName, 'Account owner name')} />
                </div>
              </div>
            </div>

            {/* Part C: Proof Upload */}
            {(selectedRecord.status === 'PENDING' || selectedRecord.proofUrl) && (
              <div>
                <Title level={5} className="text-indigo-800 border-b pb-2 mb-4">Ce Evidence of Transfer</Title>
                
                {selectedRecord.proofUrl && (
                  <div className="mb-4 text-center">
                    <img 
                      src={getImageUrl(selectedRecord.proofUrl)}
                      alt="Proof" 
                      className="max-w-full h-auto max-h-64 rounded shadow-md border"
                    />
                  </div>
                )}

                {selectedRecord.status === 'PENDING' && (
                  <Dragger {...uploadProps}>
                    <p className="ant-upload-drag-icon">
                      <InboxOutlined className="text-blue-500" />
                    </p>
                    <p className="ant-upload-text font-semibold">Click or Drag and drop the Delegation photo here</p>
                    <p className="ant-upload-hint px-4 text-xs">
                      
                                                                To ensure audit safety, Accountants are required to upload a photo of the Success transfer transaction before closing the order.
                                                              </p>
                  </Dragger>
                )}
              </div>
            )}

          </div>
        )}
      </Drawer>

    </div>
  );
};
