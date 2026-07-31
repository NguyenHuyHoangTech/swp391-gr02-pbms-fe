import { simulatedDayjs } from '../../core/utils/timeProvider';
import React, { useState } from 'react';
import { Card, Typography, Button, Modal, InputNumber, Tag, message, Spin, Radio, Space, Input } from 'antd';
import { LoginOutlined, LogoutOutlined, DollarOutlined, CarOutlined, SafetyCertificateOutlined, SelectOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../core/store/useAuthStore';
import axiosClient from '../../core/api/axiosClient';

const { Title, Text } = Typography;

const mobileBottomSheetStyle = `
  @media (max-width: 768px) {
    .mobile-bottom-sheet .ant-modal {
      max-width: 100%;
      margin: 0;
      padding: 0;
      position: absolute;
      bottom: 0;
    }
    .mobile-bottom-sheet .ant-modal-content {
      border-radius: 24px 24px 0 0 !important;
      padding-bottom: max(24px, env(safe-area-inset-bottom)) !important;
    }
  }
`;

interface Gate {
  id: number;
  name: string;
  status: string;
  type: string;
  floor: string;
  staffName?: string;
  staffEmail?: string;
}

export const ShiftManagementScreen = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const shiftStatus = useAuthStore(state => state.shiftStatus);
  const setAuthShiftStatus = useAuthStore(state => state.setShiftStatus);

  const [isStartModalVisible, setIsStartModalVisible] = useState(false);
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [selectedGateId, setSelectedGateId] = useState<number | string | null>(null);
  const [selectedGateFunction, setSelectedGateFunction] = useState<string>('ENTRY');

  // Temporary state for display during duty
  const activeGateName = sessionStorage.getItem('activeGateName') || 'Unknown';
  const activeGateType = sessionStorage.getItem('activeGateType') || 'GATE';

  const [isCloseModalVisible, setIsCloseModalVisible] = useState(false);
  const [declaredCash, setDeclaredCash] = useState<number | null>(null);
  const [cashMatchMode, setCashMatchMode] = useState<'MATCH' | 'DIFFERENT' | null>(null);
  const [varianceReason, setVarianceReason] = useState<string>('');

  const { data: gates = [] } = useQuery({
    queryKey: ['gates'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/infrastructure/gates');
        return res.data.data || [];
      } catch (err) {
        return [];
      }
    }
  });

  // Automatically fetch active session on load
  useQuery({
    queryKey: ['active-session-sync'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/identity/work-sessions/current');
        if (res.data?.data?.hasActiveSession) {
          const { gateName, gateId, gateType } = res.data.data;
          setAuthShiftStatus('OPEN');
          const currentGateType = sessionStorage.getItem('activeGateType');
          sessionStorage.setItem('activeGateName', gateName || '');
          if (!currentGateType || (currentGateType !== 'ENTRY' && currentGateType !== 'EXIT')) {
            sessionStorage.setItem('activeGateType', gateType || '');
          }
          if (gateId) {
            sessionStorage.setItem('activeGateId', String(gateId));
          }
        } else if (shiftStatus === 'OPEN') {
          // Wait, don't auto close here unless we are sure, but for now just sync 'OPEN'
        }
        return res.data;
      } catch (e) {
        return null;
      }
    }
  });

  React.useEffect(() => {
    if (gates.length > 0 && isStartModalVisible && !selectedFloor) {
      const floors = Array.from(new Set(gates.map((g: Gate) => g.floor))).filter(Boolean) as string[];
      if (floors.length > 0) {
        const firstFloor = floors[0];
        setSelectedFloor(firstFloor);
        const firstGate = gates.find((g: Gate) => g.floor === firstFloor && g.type !== 'PATROL');
        if (firstGate) setSelectedGateId(firstGate.id);
      }
    }
  }, [gates, isStartModalVisible, selectedFloor]);

  // Fetch the current preview settlement
  const { data: settlementPreview, isLoading: isLoadingPreview } = useQuery({
    queryKey: ['shift-settlement-preview'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/identity/work-sessions/current/preview-settlement');
        return res.data?.data;
      } catch (e) {
        return null;
      }
    },
    enabled: shiftStatus === 'OPEN' && isCloseModalVisible
  });

  const startShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await axiosClient.post('/identity/work-sessions/start', { gateId: selectedGateId, gateType: selectedGateFunction });
      return res.data;
    },
    onSuccess: () => {
      message.success('Shift started successfully!');

      const gate = gates.find((g: Gate) => String(g.id) === String(selectedGateId));
      if (gate) {
        sessionStorage.setItem('activeGateId', String(gate.id));
        if (gate.floorId) {
          sessionStorage.setItem('activeGateFloorId', String(gate.floorId));
        }
        sessionStorage.setItem('activeGateName', gate.name);
        sessionStorage.setItem('activeGateType', selectedGateFunction);
      }

      setAuthShiftStatus('OPEN');
      setIsStartModalVisible(false);

      navigate('/staff/gate-console');
    },
    onError: (error) => {
      message.error('Failed to start shift: ' + (error as any)?.response?.data?.message || 'Unknown error');
    }
  });

  // Cash is now blind-dropped, no systemCash or variance reasoning shown here.
  const endShiftMutation = useMutation({
    mutationFn: async () => {
      const res = await axiosClient.put('/identity/work-sessions/end', {
        declaredCash: settlementPreview?.cashRevenue || 0,
        varianceReason: null
      });
      return res.data;
    },
    onSuccess: () => {
      message.success('Shift closed and finances handed over successfully!');
      setAuthShiftStatus('CLOSED');
      sessionStorage.removeItem('activeGateId');
      sessionStorage.removeItem('activeGateFloorId');
      sessionStorage.removeItem('activeGateName');
      sessionStorage.removeItem('activeGateType');
      setIsCloseModalVisible(false);
      setDeclaredCash(null);
      setCashMatchMode(null);
      setVarianceReason('');
      queryClient.invalidateQueries({ queryKey: ['shift-settlement-preview'] });
      queryClient.invalidateQueries({ queryKey: ['gates'] });
      // Automatically open new shift selection form
      setIsStartModalVisible(true);
    },
    onError: (error) => {
      message.error('Failed to close shift: ' + (error as any)?.response?.data?.message || 'Unknown error');
    }
  });

  const handleStartShift = () => {
    if (!selectedGateId) {
      message.error('Please select a Gate!');
      return;
    }
    startShiftMutation.mutate();
  };

  const handleCloseShift = () => {
    endShiftMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-gray-50 p-3 md:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 md:mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
          <div>
            <Title level={2} className="m-0 text-gray-800">Shift Management & Assignment</Title>
            <Text type="secondary">Select Gate Duty Position or Patrol Duty</Text>
          </div>
          <Tag color={shiftStatus === 'OPEN' ? 'success' : 'default'} className="px-4 py-1 text-sm font-bold rounded-full">
            {shiftStatus === 'OPEN' ? 'ON Shift' : 'NOT IN Shift'}
          </Tag>
        </div>

        <Card className="shadow-sm border-gray-200 rounded-2xl mb-8 md:mb-8 pb-24 md:pb-6">
          <style>{mobileBottomSheetStyle}</style>
          
          <div className="flex flex-col md:flex-row justify-between items-center bg-blue-50 p-4 md:p-6 rounded-xl border border-blue-100 mb-6 md:mb-8">
            <div className="w-full md:w-auto">
              <Text className="block text-blue-600 font-medium mb-1">Current time:</Text>
              <Title level={3} className="m-0 text-blue-800 text-2xl md:text-3xl">{simulatedDayjs().format('HH:mm - DD/MM/YYYY')}</Title>
            </div>

            {/* Desktop Action Button */}
            <div className="hidden md:block">
              {shiftStatus === 'CLOSED' ? (
                <Button
                  type="primary"
                  size="large"
                  icon={<LoginOutlined />}
                  onClick={() => setIsStartModalVisible(true)}
                  className="bg-blue-600 px-8 h-12 font-medium shadow-md text-base"
                >
                  STARTING NEW ONLINE SHIFT
                </Button>
              ) : (
                <Button
                  type="primary"
                  danger
                  size="large"
                  icon={<LogoutOutlined />}
                  onClick={() => setIsCloseModalVisible(true)}
                  className="px-8 h-12 font-medium animate-pulse text-base"
                >
                  FINAL SHIFT & HANDover
                </Button>
              )}
            </div>
          </div>

          {shiftStatus === 'OPEN' && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6">
              <Text className="block text-green-700 font-bold uppercase tracking-widest text-xs mb-1">Current shift</Text>
              <div className="flex items-center space-x-3">
                <CarOutlined className="text-2xl text-green-600" />
                <Title level={4} className="m-0 text-green-800">{activeGateName}</Title>
              </div>
            </div>
          )}

          <Title level={4} className="mb-4">Status Lanes & Patrols</Title>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {gates.map((gate: Gate) => (
              <div
                key={gate.id}
                className={`p-4 rounded-xl border-2 transition-all ${gate.status === 'IDLE' ? 'border-green-200 bg-green-50/50' : 'border-gray-200 bg-gray-50'
                  }`}
              >
                <div className="flex items-center space-x-2 mb-3">
                  <CarOutlined className={`text-xl ${gate.status === 'IDLE' ? 'text-green-600' : 'text-gray-400'}`} />
                  <Text strong className="text-base truncate">{gate.name}</Text>
                </div>
                <Tag color={gate.status === 'IDLE' ? 'success' : 'default'}>{gate.status}</Tag>
                {gate.status === 'OCCUPIED' && gate.staffName && (
                  <div>
                    <Text className="block mt-2 text-xs text-gray-500">Operator: <span className="font-medium text-gray-800">{gate.staffName}</span></Text>
                    {gate.staffEmail && (
                      <Text className="block text-xs text-gray-400">({gate.staffEmail})</Text>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Mobile Fixed Bottom Action Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {shiftStatus === 'CLOSED' ? (
            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              onClick={() => setIsStartModalVisible(true)}
              className="bg-blue-600 w-full h-14 text-base font-bold shadow-lg rounded-xl"
            >
              STARTING NEW ONLINE SHIFT
            </Button>
          ) : (
            <Button
              type="primary"
              danger
              size="large"
              icon={<LogoutOutlined />}
              onClick={() => setIsCloseModalVisible(true)}
              className="w-full h-14 text-base font-bold shadow-lg rounded-xl animate-pulse"
            >
              FINAL SHIFT & HANDover
            </Button>
          )}
        </div>

        {/* Select Shift Start Location Modal */}
        <Modal
          title={<span className="text-xl font-bold"><SelectOutlined className="mr-2 text-blue-600" />Choose Work Location</span>}
          open={isStartModalVisible}
          onCancel={() => setIsStartModalVisible(false)}
          footer={[
            <Button key="back" onClick={() => setIsStartModalVisible(false)}>Cancel</Button>,
            <Button key="submit" type="primary" className="bg-blue-600 font-bold px-6" loading={startShiftMutation.isPending} onClick={handleStartShift}>

              Confirm Start
            </Button>,
          ]}
          width={600}
          className="mobile-bottom-sheet"
          style={{ top: 40 }}
          styles={{ body: { maxHeight: 'calc(100vh - 200px)', overflowY: 'auto' } }}
        >
          <div className="py-4">
            <Text className="block mb-4 text-gray-600">You are assigned to a shift. Please select a position or task to begin.</Text>

            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <Text className="block mb-2 font-bold text-gray-700">1. Select Working Floor:</Text>
              <Radio.Group
                value={selectedFloor}
                onChange={e => {
                  setSelectedFloor(e.target.value);
                  const firstGate = gates.find((g: Gate) => g.floor === e.target.value && g.type !== 'PATROL');
                  if (firstGate) setSelectedGateId(firstGate.id);
                }}
                buttonStyle="solid"
                size="large"
                className="flex flex-wrap gap-2"
              >
                {Array.from(new Set(gates.map((g: Gate) => g.floor))).filter(Boolean).map((floor: any) => (
                  <Radio.Button key={floor} value={floor}>{floor}</Radio.Button>
                ))}
              </Radio.Group>
            </div>

            <Text className="block mb-2 font-bold text-gray-700">2. Select Specific Gate:</Text>
            <div className="w-full flex flex-col gap-4">
              <div className="cursor-pointer h-auto p-4 rounded-xl border-2 flex items-center transition-all border-blue-500 bg-blue-50">
                <div className="flex items-start w-full">
                  <CarOutlined className="text-3xl mt-1 mr-2 sm:mr-4 shrink-0 text-blue-600" />
                  <div className="flex-1 min-w-0">
                    <Text strong className="block text-base sm:text-lg mb-1 truncate">Manning Gate (IN / OUT)</Text>
                    <Text type="secondary" className="text-sm">Process tickets, collect fees, control vehicle access at booths.</Text>
                    <div className="mt-4 p-3 bg-white border border-blue-200 rounded-lg">
                      <Radio.Group onChange={(e) => setSelectedGateId(e.target.value)} value={selectedGateId}>
                        <Space direction="vertical">
                          {gates.filter((g: Gate) => g.floor === selectedFloor && g.type !== 'PATROL').map((g: Gate) => (
                            <Radio key={g.id} value={g.id} disabled={g.status !== 'IDLE'}>
                              {g.name} {g.status !== 'IDLE' && <Text type="danger" className="text-xs ml-2">(Active Operator: {g.staffName} - {g.staffEmail})</Text>}
                            </Radio>
                          ))}
                        </Space>
                      </Radio.Group>
                      
                      <div className="mt-4 pt-3 border-t border-blue-100">
                        <Text className="block mb-2 text-xs font-bold text-gray-500 uppercase">Gate Function:</Text>
                        <Radio.Group
                          value={selectedGateFunction}
                          onChange={e => setSelectedGateFunction(e.target.value)}
                          className="flex"
                        >
                          <Radio.Button value="ENTRY" className="flex-1 text-center">AS ENTRY GATE</Radio.Button>
                          <Radio.Button value="EXIT" className="flex-1 text-center">AS EXIT GATE</Radio.Button>
                        </Radio.Group>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Modal>

        {/* Close Shift Modal */}
        <Modal
          title={<span className="text-xl font-bold"><DollarOutlined className="mr-2 text-green-600" />Financial handover</span>}
          open={isCloseModalVisible}
          onCancel={() => setIsCloseModalVisible(false)}
          footer={[
            <Button key="back" onClick={() => setIsCloseModalVisible(false)}>Cancel</Button>,
            <Button key="submit" type="primary" danger loading={endShiftMutation.isPending} onClick={handleCloseShift}>
              Confirm Handover & Close shift
            </Button>,
          ]}
          width={500}
          className="mobile-bottom-sheet"
        >
          {isLoadingPreview ? <Spin className="block mx-auto my-8" /> : (
            <div className="py-4">
              {activeGateType === 'OUT' || activeGateType === 'EXIT' || activeGateType === 'IN_OUT' || activeGateType === 'ENTRY_EXIT' || activeGateType === 'PATROL' ? (
                <>
                  <div className="mb-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <Text className="block text-slate-500 mb-1">System Calculated Cash Revenue</Text>
                    <Title level={2} className="m-0 text-green-600 font-bold">{settlementPreview?.cashRevenue?.toLocaleString() || '0'} VND</Title>
                  </div>
                </>
              ) : (
                <div className="text-center p-6 bg-green-50 rounded-lg border border-green-200">
                  <SafetyCertificateOutlined className="text-4xl text-green-500 mb-4" />
                  <Title level={4} className="m-0 text-green-700">Confirm Close Shift</Title>
                  <Text className="text-green-600 block mt-2">Location ({activeGateName}) does not generate cash revenue. Can close shift directly.</Text>
                </div>
              )}
            </div>
          )}
        </Modal>

      </div>
    </div>
  );
};
// HMR Trigger
