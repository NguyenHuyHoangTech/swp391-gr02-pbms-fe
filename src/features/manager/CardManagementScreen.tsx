// Author: Võ Trung Hiếu
import React, { useState } from 'react';
import { 
  Card, Typography, Table, Tag, Button, Space, Input, Select, 
  Modal, Row, Col, Statistic, Drawer, Upload, message, Alert, Divider, Tooltip 
} from 'antd';
import { 
  CreditCardOutlined, PlusOutlined, SearchOutlined, 
  CheckCircleOutlined, FilterOutlined, MoreOutlined, 
  InboxOutlined, StopOutlined, RetweetOutlined, 
  UnlockOutlined, WarningOutlined, SyncOutlined
} from '@ant-design/icons';
import type { UploadProps } from 'antd';

const { Title, Text } = Typography;
const { Dragger } = Upload;

interface RfidCard {
  uid: string;
  visualId: string;
  status: 'AVAILABLE' | 'IN_USE' | 'LOST' | 'DAMAGED';
  location: string;
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';

export const CardManagementScreen = () => {
  const queryClient = useQueryClient();
  const { data: cardsData = [], isLoading } = useQuery({
    queryKey: ['cards'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/cards');
      return res.data.data;
    }
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ uid, status }: { uid: string, status: string }) => {
      await axiosClient.put(`/infrastructure/cards/${uid}/status`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cards'] });
    },
    onError: (err: any) => {
      message.error(err.response?.data?.message || 'Error updating card status');
    }
  });

  const [selectedRecord, setSelectedRecord] = useState<RfidCard | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const totalCards = cardsData.length;
  const availableCount = cardsData.filter((c: RfidCard) => c.status === 'AVAILABLE').length;
  const inUseCount = cardsData.filter((c: RfidCard) => c.status === 'IN_USE').length;
  const lostDamagedCount = cardsData.filter((c: RfidCard) => c.status === 'LOST' || c.status === 'DAMAGED').length;

  const handleOpenDrawer = (record: RfidCard) => {
    setSelectedRecord(record);
    setIsDrawerOpen(true);
  };

  const handleAction = (id: string, newStatus: RfidCard['status'], newLocation: string, successMsg: string) => {
    updateStatusMutation.mutate({ uid: id, status: newStatus }, {
      onSuccess: () => {
        message.success(successMsg);
        setIsDrawerOpen(false);
      }
    });
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('file', file as Blob);
      try {
        const res = await axiosClient.post('/infrastructure/cards/import', formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        setIsUploading(false);
        onSuccess?.(res.data);
        message.success(`Successfully imported ${res.data.data} new RFID cards!`);
        setIsModalVisible(false);
        queryClient.invalidateQueries({ queryKey: ['cards'] });
      } catch (err) {
        setIsUploading(false);
        onError?.(err as any);
        message.error('Failed to import cards batch, please check the file format!');
      }
    },
  };

  const columns = [
    { title: 'UID Code (Hex)', dataIndex: 'uid', key: 'uid', render: (text: string) => <Text strong className="font-mono text-gray-600">{text}</Text> },
    { title: 'Identification Code', dataIndex: 'visualId', key: 'visualId', render: (text: string) => <Tag color="blue" className="text-base font-bold">{text}</Tag> },
    { 
      title: 'Status', 
      dataIndex: 'status', 
      key: 'status',
      render: (status: string) => {
        if (status === 'AVAILABLE') return <Tag color="success" icon={<CheckCircleOutlined />}>Ready (Empty)</Tag>;
        if (status === 'IN_USE') return <Tag color="processing" icon={<SyncOutlined spin />}>In Use</Tag>;
        if (status === 'LOST') return <Tag color="error" icon={<StopOutlined />}>Lost</Tag>;
        if (status === 'DAMAGED') return <Tag color="warning" icon={<WarningOutlined />}>Damaged</Tag>;
        return <Tag>{status}</Tag>;
      }
    },
    { 
      title: 'Current location', 
      dataIndex: 'location', 
      key: 'location',
      render: (text: string, record: RfidCard) => (
        <Text className={record.status === 'IN_USE' ? 'text-indigo-600 font-semibold' : 'text-gray-500'}>
          {text}
        </Text>
      )
    },
    {
      title: '',
      key: 'action',
      render: (_: any, record: RfidCard) => (
        <Button type="primary" size="small" onClick={() => handleOpenDrawer(record)}>Resolve</Button>
      )
    }
  ];

  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchText, setSearchText] = useState<string>('');

  const filteredCards = cardsData.filter((card: RfidCard) => {
    const matchStatus = statusFilter === 'ALL' || card.status === statusFilter;
    const searchLower = searchText.toLowerCase();
    const matchSearch = !searchText || 
      card.uid.toLowerCase().includes(searchLower) || 
      card.visualId.toLowerCase().includes(searchLower);
    return matchStatus && matchSearch;
  });

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 pb-24">
      <div className="mb-6">
        <Title level={2} className="m-0 text-gray-800 flex items-center">
          <CreditCardOutlined className="mr-3 text-indigo-600" /> Card Inventory Management (RFID)
        </Title>
        <Text type="secondary">Central control for the lifecycle of electronic cards in the system</Text>
      </div>

      {/* Zone 1: KPI CARDS */}
      <Row gutter={16} className="mb-6">
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-blue-500">
            <Statistic title="Total Cards In System" value={totalCards} valueStyle={{ color: '#1890ff', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className={`shadow-sm border-l-4 ${availableCount < 50 ? 'border-l-red-500 bg-red-50/50' : 'border-l-green-500'}`}>
            <Statistic 
              title={<span className={availableCount < 50 ? 'text-red-600 font-bold animate-pulse' : ''}>Available Cards</span>} 
              value={availableCount} 
              valueStyle={{ color: availableCount < 50 ? '#cf1322' : '#3f8600', fontWeight: 'bold' }} 
            />
            {availableCount < 50 && (
              <Text type="danger" className="text-xs font-bold animate-pulse">⚠️ RISK OF LACK OF CARD AT THE GATE!</Text>
            )}
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-orange-500">
            <Statistic title="In Use" value={inUseCount} valueStyle={{ color: '#d97706', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={6}>
          <Card className="shadow-sm border-l-4 border-l-gray-600">
            <Statistic title="Damaged & Lost Cards" value={lostDamagedCount} valueStyle={{ color: '#4b5563', fontWeight: 'bold' }} />
          </Card>
        </Col>
      </Row>

      {/* Zone 2: ACTION BAR */}
      <Card className="shadow-sm mb-6">
        <div className="flex justify-between">
          <div className="flex gap-4">
            <Select 
              value={statusFilter} 
              onChange={v => setStatusFilter(v)} 
              className="w-48" 
              options={[
                {label: 'All Status', value: 'ALL'},
                {label: 'Available', value: 'AVAILABLE'},
                {label: 'In Use', value: 'IN_USE'},
                {label: 'Lost', value: 'LOST'},
                {label: 'Damaged', value: 'DAMAGED'}
              ]} 
            />
            <Button type="primary" icon={<FilterOutlined />} ghost>Filter</Button>
            <Input 
              placeholder="Type UID or Print Code on the cardeee" 
              prefix={<SearchOutlined />} 
              className="w-80" 
              allowClear
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            size="large" 
            className="bg-indigo-600 hover:bg-indigo-500 font-bold shadow-md"
            onClick={() => setIsModalVisible(true)}
          >
            Enter New Card Batch
          </Button>
        </div>
      </Card>

      {/* Zone 3: DATA TABLE */}
      <Card className="shadow-sm rounded-xl border-gray-200" bodyStyle={{ padding: 0 }}>
        <Table 
          dataSource={filteredCards} 
          columns={columns} 
          rowKey="uid" 
          pagination={{ pageSize: 10 }}
        />
      </Card>

      {/* Zone 4: RIGHT DRAWER */}
      <Drawer
        title={<span className="font-bold text-lg">Medical Examination & Card Processing</span>}
        placement="right"
        width={400}
        onClose={() => setIsDrawerOpen(false)}
        open={isDrawerOpen}
      >
        {selectedRecord && (
          <div className="flex flex-col gap-6">
            
            {/* Identity Banner */}
            <div className="bg-slate-100 p-4 rounded-lg border border-slate-200 text-center">
              <Text type="secondary" className="block text-xs uppercase mb-1">Identification Code</Text>
              <div className="text-2xl font-black text-slate-800 tracking-wider">{selectedRecord.visualId}</div>
              <div className="mt-2 text-sm text-gray-500 font-mono">UID: {selectedRecord.uid}</div>
            </div>

            {/* Current Status */}
            <div>
              <Text strong className="block mb-2">Status & Location:</Text>
              <div className="flex flex-col gap-2 p-3 bg-white border rounded-md">
                <div className="flex justify-between">
                  <Text type="secondary">Status:</Text>
                  {selectedRecord.status === 'AVAILABLE' && <Tag color="success">Available</Tag>}
                  {selectedRecord.status === 'IN_USE' && <Tag color="processing">In Use</Tag>}
                  {selectedRecord.status === 'LOST' && <Tag color="error">Lost</Tag>}
                  {selectedRecord.status === 'DAMAGED' && <Tag color="warning">Damaged</Tag>}
                </div>
                <div className="flex justify-between">
                  <Text type="secondary">Location:</Text>
                  <Text strong className="text-right">{selectedRecord.location}</Text>
                </div>
              </div>
            </div>

            <Divider className="my-0" />            {/* Action Tools */}
            <div>
              <Title level={5} className="text-gray-800 mb-4">Therapy Tools</Title>
              <div className="flex flex-col gap-3">
                {selectedRecord.status === 'IN_USE' && (
                  <Alert type="info" showIcon message="Card is in use. Cannot perform operations." />
                )}

                {selectedRecord.status === 'AVAILABLE' && (
                  <>
                    <Tooltip title="Card will be completely locked. Barrier will not open if this card is used." placement="left">
                      <Button 
                        danger 
                        type="primary" 
                        icon={<StopOutlined />} 
                        className="w-full text-left flex justify-start items-center h-10"
                        onClick={() => handleAction(selectedRecord.uid, 'LOST', 'Unknown', 'Card has been reported lost and blacklisted!')}
                      >
                        [Report Lost / Add to Blacklist]
                      </Button>
                    </Tooltip>

                    <Button 
                      danger 
                      icon={<WarningOutlined />} 
                      className="w-full text-left flex justify-start items-center h-10 border-orange-400 text-orange-500 hover:text-orange-600 hover:border-orange-500"
                      onClick={() => handleAction(selectedRecord.uid, 'DAMAGED', 'Scrap', 'Card has been marked as physically damaged')}
                    >
                      [Mark as Damaged]
                    </Button>
                  </>
                )}

                {selectedRecord.status === 'LOST' && (
                  <Button 
                    type="primary" 
                    className="w-full bg-green-600 hover:bg-green-500 text-left flex justify-start items-center h-10 mt-2"
                    icon={<UnlockOutlined />}
                    onClick={() => handleAction(selectedRecord.uid, 'AVAILABLE', 'Available', 'Card has been found and successfully restored!')}
                  >
                    [Restore Lost Card] (Found)
                  </Button>
                )}

                {selectedRecord.status === 'DAMAGED' && (
                  <Tooltip title="Card has been repaired or reissued blank, ready for reuse" placement="left">
                    <Button 
                      type="primary" 
                      ghost 
                      icon={<RetweetOutlined />} 
                      className="w-full text-left flex justify-start items-center h-10 mt-2"
                      onClick={() => handleAction(selectedRecord.uid, 'AVAILABLE', 'Available', 'Damaged card has been successfully restored!')}
                    >
                      [Restore Damaged Card] (Repaired)
                    </Button>
                  </Tooltip>
                )}
              </div>
            </div>

          </div>
        )}
      </Drawer>

      {/* IMPORT MODAL */}
      <Modal
        title={<span className="font-bold text-lg"><PlusOutlined className="mr-2"/>  Enter New Card Batch</span>}
        open={isModalVisible}
        onCancel={() => setIsModalVisible(false)}
        footer={null}
        width={500}
      >
        <div className="py-4">
          <Alert 
            message="Import Instructions (CSV Format)" 
            description={
              <div className="text-sm mt-2">
                
                                    Please upload the file <strong>.csv</strong>  has the following column structure:
                                    <div className="bg-white border p-2 mt-2 rounded font-mono text-xs">
                  CardID,CardCode<br/>
                  1234567890,A1B2C3D4<br/>
                  0987654321,E5F6G7H8<br/>
                </div>
              </div>
            }
            type="info" 
            showIcon 
            className="mb-4"
          />
          <Dragger {...uploadProps} disabled={isUploading} accept=".csv">
            <p className="ant-upload-drag-icon">
              <InboxOutlined className={isUploading ? "text-gray-400" : "text-indigo-500"} />
            </p>
            <p className="ant-upload-text font-semibold">Click or Drag and drop the CSV file here</p>
            <p className="ant-upload-hint px-4 text-xs">
              
                                        Supports entering up to 10,000 UID lines at the same time. Only accepts ecsve format
                                      </p>
          </Dragger>
        </div>
      </Modal>

    </div>
  );
};
