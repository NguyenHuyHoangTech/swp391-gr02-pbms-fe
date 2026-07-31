import { simulatedDayjs, useSystemTime, useSimulatedOffset, refreshSimulatedOffset } from '../../core/utils/timeProvider';
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, Button, Typography, Space, DatePicker, message, Spin, Radio, Input, Modal, QRCode, Alert } from 'antd';
import { CarOutlined, CreditCardOutlined, CalendarOutlined, CheckCircleOutlined, EnvironmentOutlined, NumberOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';

const { Title, Text } = Typography;

const GATEWAYS = [
  { id: 'PAYPAL', name: 'PayPal', icon: '/paypal_logo.webp' },
  { id: 'PAYOS', name: 'PayOS (VietQR)', icon: getImageUrl('/uploads/PayOS_Icon.webp') }
];

export const PreBookingScreen = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(location.state?.vehicleTypeId || null);
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  
  const [arrivalTime, setArrivalTime] = useState<dayjs.Dayjs>(() => {
    if (location.state?.arrivalTime) return dayjs(location.state.arrivalTime);
    return simulatedDayjs().add(30, 'minute');
  });
  const [endTime, setEndTime] = useState<dayjs.Dayjs>(() => {
    if (location.state?.arrivalTime) return dayjs(location.state.arrivalTime).add(2, 'hour');
    return simulatedDayjs().add(2, 'hour').add(30, 'minute');
  });
  const [debugLogs, setDebugLogs] = useState<any[]>([]);

  // Automatically adjust time if system offset syncs after page load
  const systemOffset = useSimulatedOffset();
  useEffect(() => {
    refreshSimulatedOffset();
  }, []);

  // Fetch Building Profile (Public info for customers)
  const { data: buildingProfileData } = useQuery({
    queryKey: ['public-building-profile'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/building-profile');
        return res.data.data;
      } catch (err) {
        return null;
      }
    }
  });

  // Fetch System Configs
  const { data: earlyMinsData } = useQuery({
    queryKey: ['public-config-early-mins'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/config/RESERVATION_EARLY_MINS');
        return parseInt(res.data.data, 10);
      } catch (err) {
        return 30;
      }
    }
  });

  const earlyMins = React.useMemo(() => {
    if (earlyMinsData !== undefined) return earlyMinsData;
    return 30;
  }, [earlyMinsData]);

  const operatingHours = React.useMemo(() => {
    if (!buildingProfileData) return { is247: false, start: '06:00', end: '22:30' };
    return {
      is247: buildingProfileData.is247 ?? false,
      start: buildingProfileData.operatingStart || '06:00',
      end: buildingProfileData.operatingEnd || '22:30'
    };
  }, [buildingProfileData]);

  const isOutOfOperatingHours = React.useMemo(() => {
    if (operatingHours.is247) return false;
    
    const parseTime = (timeStr: string) => {
      const [h, m] = timeStr.split(':').map(Number);
      return h * 60 + m;
    };
    
    const startMins = parseTime(operatingHours.start);
    const endMins = parseTime(operatingHours.end);
    const arrivalTimeOfDayMins = arrivalTime.hour() * 60 + arrivalTime.minute();
    const endTimeOfDayMins = endTime.hour() * 60 + endTime.minute();
    
    // Check if arrivalTime or endTime falls outside the operating window
    // (Assuming start < end, e.g. 06:00 < 22:30)
    if (startMins < endMins) {
      if (arrivalTimeOfDayMins < startMins || arrivalTimeOfDayMins >= endMins) return true;
      // if it crosses the next day or crosses closing time
      if (endTime.isAfter(arrivalTime, 'day') || endTimeOfDayMins > endMins) return true;
    }
    return false;
  }, [arrivalTime, endTime, operatingHours]);

  useEffect(() => {
    // If the offset changes (e.g., initial fetch from server), update the selected times
    if (!location.state?.arrivalTime) {
      setArrivalTime(simulatedDayjs().add(earlyMins, 'minute'));
      setEndTime(simulatedDayjs().add(2, 'hour').add(earlyMins, 'minute'));
    }
  }, [systemOffset, earlyMins, location.state]);

  const addDebugLog = (type: string, data: any) => {
    setDebugLogs(prev => [...prev, { time: simulatedDayjs().format('HH:mm:ss'), type, data }]);
  };
  
  const [selectedGateway, setSelectedGateway] = useState<string>('PAYPAL');
  
  const [isQRModalVisible, setIsQRModalVisible] = useState(false);
  const [countdown, setCountdown] = useState(900);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const [paymentQrCode, setPaymentQrCode] = useState<string>('');
  const [paymentOrderId, setPaymentOrderId] = useState<string>('');

  // Fetch Vehicle Types
  const { data: vehicleTypesData } = useQuery({
    queryKey: ['vehicle-types', 'public'],
    queryFn: async () => {
      const res = await axiosClient.get('/public/vehicle-types?activeOnly=true');
      return res.data.data;
    }
  });
  const VEHICLES = vehicleTypesData || [];



  // Fetch Zones
  const { data: zonesData } = useQuery({
    queryKey: ['zones', 'map'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/zones/map');
      return res.data.data;
    }
  });

  const allZones = zonesData || [];
  const vehicleType = VEHICLES.find((v: any) => v.id === selectedVehicle)?.typeName;
  const filteredZones = allZones.filter((z: any) => {
    if (z.functionType !== 'WALK_IN') return false;
    if (!selectedVehicle) return true;
    if (z.vehicleTypeId) return z.vehicleTypeId === selectedVehicle;
    // Fallback if backend hasn't been restarted yet and vehicleTypeId is missing
    return z.vehicleType === vehicleType || (z.vehicleType && vehicleType && z.vehicleType.substring(0, 3) === vehicleType.substring(0, 3));
  });

  const durationMinutes = Math.max(1, Math.ceil(endTime.diff(arrivalTime, 'minute', true)));

  // Calculate Fee from DB
  const { data: feeData, isFetching: isFeeLoading } = useQuery({
    queryKey: ['preview-price', selectedVehicle, durationMinutes, arrivalTime.format('YYYY-MM-DDTHH:mm:ss')],
    queryFn: async () => {
      if (!selectedVehicle) return 0;
      // Calculate estimated fee from pricing engine
      try {
        const res = await axiosClient.post('/customer/reservations/preview', {
          vehicleTypeId: selectedVehicle,
          expectedEntryTime: arrivalTime.format('YYYY-MM-DDTHH:mm:00'),
          expectedDurationMinutes: durationMinutes
        });
        return res.data.data || 0;
      } catch (err) {
        console.error("Failed to fetch price preview", err);
        return 0;
      }
    },
    enabled: !!selectedVehicle && durationMinutes > 0,
  });

  const totalFee = feeData || 0;

  const createBookingMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        vehicleTypeId: selectedVehicle,
        plateNumber: plateNumber,
        zoneId: selectedZone,
        expectedEntryTime: arrivalTime.format('YYYY-MM-DDTHH:mm:00'),
        expectedDurationMinutes: durationMinutes
      };
      addDebugLog('REQUEST', payload);
      const res = await axiosClient.post('/customer/reservations', payload);
      return res.data.data;
    },
    onSuccess: (data) => {
      addDebugLog('SUCCESS', data);
      setCountdown(5);
      setIsPaymentSuccess(true);
      message.success('Payment Success! Your place has been reserved');
      setTimeout(() => {
        navigate('/customer/my-parking?tab=booking');
      }, 2000);
    },
    onError: (err: any) => {
      addDebugLog('ERROR', err.response?.data || err.message);
      message.error(err.response?.data?.message || 'an error occurred when creating a booking');
      setIsQRModalVisible(false);
    }
  });

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        vehicleTypeId: selectedVehicle,
        plateNumber: plateNumber,
        expectedEntryTime: arrivalTime.format('YYYY-MM-DDTHH:mm:ss'),
        expectedDurationMinutes: endTime.diff(arrivalTime, 'minute'),
        zoneId: selectedZone
      };
      
      const res = await axiosClient.post('/finance/payments/initialize', {
        actionType: 'CREATE_RESERVATION',
        amount: totalFee,
        gateway: selectedGateway,
        payload: payload
      });
      return res.data.data;
    },
    onSuccess: (data) => {
      setPaymentUrl(data.paymentUrl);
      setPaymentQrCode(data.qrCode || data.paymentUrl || '');
      if (selectedGateway === 'PAYPAL') {
        const urlParams = new URL(data.paymentUrl).searchParams;
        setPaymentOrderId(urlParams.get('token') || '');
      } else if (selectedGateway === 'PAYOS') {
        setPaymentOrderId(data.orderId || '');
      } else {
        setPaymentOrderId(data.paymentUrl.split('/').pop() || '');
      }
    },
    onError: (err: any) => {
      console.error("Payment initialization error:", err);
      const errMsg = err.response?.data?.message || err.message || 'Error when creating payment link (Validation failed)';
      message.error(errMsg);
      setIsQRModalVisible(false);
    }
  });

  const handleConfirm = () => {
    if (!selectedVehicle) return message.error('Please select Vehicle type');
    if (!plateNumber) return message.error('Please enter vehicle License Plate');
    if (!selectedZone) return message.error('Please select Parking Zone');
    if (arrivalTime.isBefore(simulatedDayjs().add(earlyMins - 1, 'minute'))) return message.error(`Estimated arrival time must be at least ${earlyMins} minutes later than current time`);
    if (endTime.isBefore(arrivalTime)) return message.error('Exit Time must be after Entry Time');
    
    setIsQRModalVisible(true);
    setIsPaymentSuccess(false);
    setPaymentUrl('');
    setPaymentOrderId('');
    setCountdown(900);
    generateLinkMutation.mutate();
  };

  useEffect(() => {
    let timer: any;
    if (isQRModalVisible && !isPaymentSuccess && paymentOrderId) {
      if (countdown > 0) {
        timer = setTimeout(() => {
          setCountdown(c => c - 1);
          if (countdown % 3 === 0) {
            const captureUrl = selectedGateway === 'PAYOS' ? '/finance/payments/payos/capture' : '/finance/payments/paypal/capture';
            axiosClient.post(captureUrl, { token: paymentOrderId })
              .then(res => {
                if (res.data?.data?.status === 'COMPLETED') {
                  // Execute Business Logic via Payment Execute Action
                  axiosClient.post('/finance/payments/execute-action', { token: paymentOrderId })
                    .then(execRes => {
                       message.success('Booking confirmed successfully!');
                       setIsPaymentSuccess(true);
                       setIsQRModalVisible(false);
                       setTimeout(() => {
                         navigate('/customer/my-parking?tab=booking');
                       }, 2000);
                    })
                    .catch(execErr => {
                       // The system failed to book AFTER payment. It initiated a refund.
                       message.error(execErr.response?.data?.message || 'System failed to book. Your payment has been queued for a full refund.');
                       setIsQRModalVisible(false);
                       // We do NOT set payment success, but we clear it to avoid loops
                       clearTimeout(timer);
                    });
                }
              })
              .catch(() => {});
          }
        }, 1000);
      } else {
        setIsQRModalVisible(false);
        message.warning('Waiting time for payment is over');
      }
    }
    return () => clearTimeout(timer);
  }, [isQRModalVisible, isPaymentSuccess, paymentOrderId, countdown]);
  
  // Debug: System Time
  const currentSystemTime = useSystemTime();

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 flex flex-col relative pb-12 font-sans">
      
      {/* System Time Debugger */}
      <div className="hidden fixed bottom-4 left-4 z-50 bg-slate-900/90 text-green-400 font-mono p-3 rounded-lg shadow-lg border border-green-500/30 backdrop-blur-md pointer-events-auto max-h-[50vh] overflow-y-auto w-80">
        <div className="text-[10px] text-green-500/70 mb-1 font-bold uppercase tracking-wider">⏱ System Time (Debug)</div>
        <div className="text-base font-bold mb-3 pb-2 border-b border-green-500/30">{currentSystemTime.format('DD/MM/YYYY HH:mm:ss')}</div>
        
        <div className="text-[10px] text-blue-400/70 mb-1 font-bold uppercase tracking-wider">📝 Booking Logs</div>
        {debugLogs.length === 0 ? (
          <div className="text-xs text-slate-500 italic">None log...</div>
        ) : (
          <div className="space-y-2">
            {debugLogs.map((log, idx) => (
              <div key={idx} className="bg-black/40 p-2 rounded text-[10px] break-words">
                <span className="text-slate-400">[{log.time}]</span>{' '}
                <span className={log.type === 'ERROR' ? 'text-red-400' : log.type === 'SUCCESS' ? 'text-green-400' : 'text-blue-400'}>{log.type}</span>:
                <pre className="mt-1 text-slate-300 overflow-x-auto whitespace-pre-wrap">{JSON.stringify(log.data, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 bg-white/80 backdrop-blur-md shadow-sm sticky top-16 z-10 border-b border-white/50">
        <Title level={3} className="m-0 text-slate-800 text-2xl md:text-3xl font-black">Pre-Booking</Title>
        <Text type="secondary" className="text-slate-500 text-sm">Reserve your spot in advance to ensure there is always a parking spot at PBMS</Text>
      </div>

      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 mt-2 md:mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
        
        <div className="lg:col-span-2 space-y-6">
          
          <Card title={<span className="font-black text-xl"><CarOutlined className="mr-2 text-blue-600"/>1. Vehicle Information</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md hover:shadow-2xl transition-shadow duration-300">
            <div className="mb-6">
              <Text className="block font-bold mb-3 text-slate-700">Vehicle Type:</Text>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {VEHICLES.map((v: any) => (
                  <div
                    key={v.id}
                    onClick={() => { setSelectedVehicle(v.id); setSelectedZone(null); }}
                    className={`cursor-pointer p-6 rounded-2xl border-0 shadow-md transition-all duration-300 flex flex-col items-center justify-center ${selectedVehicle === v.id ? 'ring-4 ring-blue-500 bg-blue-50 text-blue-800 scale-105 shadow-xl' : 'bg-white hover:ring-2 hover:ring-blue-300 hover:shadow-lg'}`}
                  >
                    {v.iconUrl ? <img src={getImageUrl(v.iconUrl)} className="h-10 mb-2 object-contain" /> : <CarOutlined className="text-3xl mb-2" />}
                    <span className="font-bold text-lg">{v.typeName}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Text className="block font-bold mb-2 text-slate-700">License Plate xe:</Text>
              <Input 
                size="large" 
                prefix={<NumberOutlined className="text-slate-400" />}
                placeholder="For example: 51H-123e45" 
                value={plateNumber}
                onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                className="rounded-lg h-12 text-lg font-mono font-bold uppercase"
              />
            </div>
          </Card>

          <Card title={<span className="font-black text-xl"><CalendarOutlined className="mr-2 text-green-600"/>2. Parking time</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md hover:shadow-2xl transition-shadow duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4">
                <div>
                  <Text className="block font-bold mb-2 text-slate-700">Expected arrival:</Text>
                  <div className="hidden md:block">
                    <DatePicker 
                      showTime 
                      format="HH:mm DD/MM/YYYY" 
                      value={arrivalTime}
                      onChange={(val) => val && setArrivalTime(val)} 
                      className="w-full h-12 rounded-lg text-lg" 
                      minDate={simulatedDayjs().add(30, 'minute')}
                      inputReadOnly={true}
                    />
                  </div>
                  <div className="block md:hidden">
                    <input 
                      type="datetime-local"
                      className="w-full h-12 rounded-lg border border-slate-300 px-3 text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-base"
                      value={arrivalTime.format('YYYY-MM-DDTHH:mm')}
                      min={simulatedDayjs().add(30, 'minute').format('YYYY-MM-DDTHH:mm')}
                      onChange={(e) => { if(e.target.value) setArrivalTime(dayjs(e.target.value)) }}
                    />
                  </div>
                </div>
                <div>
                  <Text className="block font-bold mb-2 text-slate-700">Expected to pick up the car:</Text>
                  <div className="hidden md:block">
                    <DatePicker 
                      showTime 
                      format="HH:mm DD/MM/YYYY" 
                      value={endTime}
                      onChange={(val) => val && setEndTime(val)} 
                      className="w-full h-12 rounded-lg text-lg" 
                      minDate={arrivalTime}
                      inputReadOnly={true}
                    />
                  </div>
                  <div className="block md:hidden">
                    <input 
                      type="datetime-local"
                      className="w-full h-12 rounded-lg border border-slate-300 px-3 text-slate-700 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white text-base"
                      value={endTime.format('YYYY-MM-DDTHH:mm')}
                      min={arrivalTime.format('YYYY-MM-DDTHH:mm')}
                      onChange={(e) => { if(e.target.value) setEndTime(dayjs(e.target.value)) }}
                    />
                  </div>
              </div>
            </div>
            {isOutOfOperatingHours && !operatingHours.is247 && (
              <div className="mt-4">
                <Alert
                  type="warning"
                  showIcon
                  message="Lưu ý ngoài giờ hoạt động"
                  description={`Bãi đỗ xe hiện đang hoạt động từ ${operatingHours.start} đến ${operatingHours.end}. Thời gian bạn chọn nằm ngoài khung giờ này, vui lòng lưu ý có thể sẽ không có nhân viên trực hỗ trợ trực tiếp.`}
                />
              </div>
            )}
          </Card>

          <Card title={<span className="font-black text-xl"><EnvironmentOutlined className="mr-2 text-orange-600"/>3. Select Zone</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md hover:shadow-2xl transition-shadow duration-300">
            {!selectedVehicle ? (
              <div className="p-8 text-center bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <Text className="text-slate-400">Please select the Vehicle type first to see the Zonee list</Text>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredZones.map((z: any) => {
                    const isFull = (z.availableSlots || 0) <= 0;
                    return (
                      <div
                        key={z.id || Math.random()}
                        onClick={() => {
                          if (!isFull) setSelectedZone(z.id);
                        }}
                        className={`p-5 rounded-2xl border-0 shadow-sm transition-all duration-300 cursor-pointer ${
                          isFull ? 'bg-slate-100 opacity-60 cursor-not-allowed' :
                          selectedZone === z.id ? 'ring-4 ring-orange-500 bg-orange-50 scale-105 shadow-lg' : 'bg-white hover:ring-2 hover:ring-orange-300 hover:shadow-md'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <Text strong className={`text-base ${selectedZone === z.id ? 'text-orange-700' : 'text-slate-700'}`}>{z.name}</Text>
                          {isFull && <span className="bg-red-100 text-red-600 text-xs px-2 py-1 rounded font-bold">BOOKED</span>}
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 bg-slate-200 h-2 rounded-full overflow-hidden">
                            <div 
                              className={`h-full ${isFull ? 'bg-red-500' : 'bg-green-500'}`} 
                              style={{ width: `${(((z.capacity || 1) - (z.availableSlots || 0)) / (z.capacity || 1)) * 100}%` }}
                            />
                          </div>
                          <Text className="text-xs font-bold whitespace-nowrap">Drum {z.availableSlots}/{z.capacity}</Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {selectedZone && (
                  <div className="mt-4">
                    <Alert 
                      message="Entry Gate Notice" 
                      description={`The selected zone is located on ${allZones.find((z: any) => z.id === selectedZone)?.floorName}. Please ensure you use the correct entry gate designated for this floor when arriving.`} 
                      type="warning" 
                      showIcon 
                    />
                  </div>
                )}
                </>
              )}
            </Card>
          </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-6">
            <Card title={<span className="font-black text-xl text-slate-800">Booking Summary</span>} className="shadow-2xl rounded-3xl border-0 overflow-hidden backdrop-blur-md bg-white/90" headStyle={{ backgroundColor: 'rgba(248, 250, 252, 0.8)', borderBottom: '1px solid rgba(226, 232, 240, 0.5)' }}>
              <Space direction="vertical" className="w-full" size="middle">
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Vehicle Type:</Text>
                  <Text strong className="text-slate-800">{VEHICLES.find((v: any) => v.id === selectedVehicle)?.typeName || '---'}</Text>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">License Plate:</Text>
                  <Text strong className="text-slate-800 font-mono">{plateNumber || '---'}</Text>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Zone (Zone):</Text>
                  <Text strong className="text-slate-800 text-right max-w-[150px]">{allZones.find((z: any) => z.id === selectedZone)?.name || '---'}</Text>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Expected on:</Text>
                  <Text strong className="text-slate-800">{arrivalTime.format('HH:mm DD/MM/YYYY')}</Text>
                </div>
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Expected release:</Text>
                  <Text strong className="text-slate-800">{endTime.format('HH:mm DD/MM/YYYY')}</Text>
                </div>
                <div className="flex justify-between pb-1">
                  <Text className="text-slate-500">Total provisional fee:</Text>
                  {isFeeLoading ? <Spin size="small" /> : <Text strong className="text-xl text-blue-600 font-bold">{totalFee.toLocaleString()}  VND</Text>}
                </div>
              </Space>
            </Card>

            <Card title={<span className="font-black text-xl"><CreditCardOutlined className="mr-2 text-purple-600"/>Payment method</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md mt-6">
              <div className="w-full flex flex-col space-y-4">
                {GATEWAYS.map(gw => {
                  const isSelected = selectedGateway === gw.id;
                  return (
                    <div 
                      key={gw.id}
                      onClick={() => setSelectedGateway(gw.id)}
                      className={`relative overflow-hidden cursor-pointer flex items-center px-5 py-4 rounded-2xl transition-all duration-300 ${isSelected ? 'ring-2 ring-purple-500 bg-purple-50 shadow-md transform scale-[1.02]' : 'ring-1 ring-slate-200 bg-white hover:ring-purple-300 hover:shadow-sm'}`}
                    >
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center mr-4 transition-colors ${isSelected ? 'border-purple-600' : 'border-slate-300'}`}>
                         {isSelected && <div className="w-3 h-3 rounded-full bg-purple-600 shadow-sm" />}
                      </div>
                      <div className="flex items-center flex-1">
                        <div className="w-16 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm border border-slate-100 p-1 mr-4">
                          <img src={gw.icon} alt={gw.name} className="max-w-full max-h-full object-contain" />
                        </div>
                        <span className={`font-bold text-lg ${isSelected ? 'text-purple-700' : 'text-slate-700'}`}>{gw.name}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

              {!isQRModalVisible && (
                <Button 
                  type="primary" 
                  size="large" 
                  block 
                  className="h-16 mt-6 text-xl font-black shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-r from-blue-600 to-indigo-600 border-0 rounded-2xl"
                  onClick={handleConfirm}
                  loading={generateLinkMutation.isPending}
                >
                  Confirm & Payment
                </Button>
              )}
              
              {isQRModalVisible && (
                <Card className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md mt-6 animate-fade-in-up">
                  <div className="text-center py-4">
                    {!isPaymentSuccess ? (
                      <>
                        <Title level={4} className="mb-2 text-slate-800">Scan QR code to pay</Title>
                        <Text className="block mb-2 text-slate-500">Use the Camera or Zalo application to scan the code</Text>
                        <Text className="block mb-6 text-orange-600 font-bold">After making payment on Success on your phone, please keep this screen intact so that the System will automatically confirm</Text>
                        
                        <div className="relative inline-block mb-6">
                          <div className="bg-white p-4 border-2 border-dashed border-slate-300 rounded-2xl shadow-sm relative z-10 flex justify-center items-center h-[240px] w-[240px]">
                            {paymentUrl ? <QRCode value={selectedGateway === 'PAYOS' && paymentQrCode ? paymentQrCode : paymentUrl} size={200} /> : <Spin size="large" />}
                          </div>
                        </div>
                        
                        <div className="text-2xl font-black text-blue-600 mb-2">{totalFee.toLocaleString()} VND</div>
                        
                        <div className="mb-6">
                          {paymentUrl ? (
                            selectedGateway !== 'PAYOS' && (
                              <Button type="primary" size="large" href={paymentUrl} target="_blank" className="w-full bg-[#0070ba] hover:bg-[#003087] border-none font-bold flex items-center justify-center">
                                Payment directly by PayPal
                              </Button>
                            )
                          ) : (
                            <Button disabled size="large" className="w-full">Creating payment linkeee</Button>
                          )}
                        </div>
                        
                        <div className="flex items-center justify-center space-x-2 text-slate-600 mb-4">
                          <Spin size="small" />
                          <Text>Awaiting payment ({Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')})...</Text>
                        </div>
                        
                        <Button type="default" onClick={() => setIsQRModalVisible(false)} className="w-full rounded-xl h-12">Cancel</Button>
                      </>
                    ) : (
                      <div className="animate-fade-in py-8">
                        <CheckCircleOutlined className="text-[80px] text-green-500 mb-6" />
                        <Title level={3} className="text-slate-800">Payment Success!</Title>
                        <Text className="block text-slate-500 mb-2">Your parking space has been recorded by the System</Text>
                        <Text className="block text-slate-500">Moving back to Managementeee page</Text>
                      </div>
                    )}
                  </div>
                </Card>
              )}
          </div>
        </div>
      </div>



    </div>
  );
};
