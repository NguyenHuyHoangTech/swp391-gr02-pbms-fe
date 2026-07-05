/**
 * @Author: Thái Tân Phú
 * @Date: 2026-07-05
 * @Description: Pre-booking screen allowing customers to reserve a parking slot. Includes vehicle selection, time picking, zone routing, pricing preview, and payment gateway integration.
 * @Dependencies: 
 * - React Query (vehicle-types, zones, preview-price, configs)
 * - AxiosClient (API operations)
 * - simulatedDayjs & useSystemTime (Time synchronization)
 */
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Typography, Modal, Calendar, Row, Col, Input, Progress, Space, Spin, QRCode, message } from 'antd';
import { 
    CarOutlined, 
    ClockCircleOutlined, 
    EnvironmentOutlined, 
    CreditCardOutlined,
    UpOutlined,
    DownOutlined,
    CheckCircleOutlined
} from '@ant-design/icons';
import { Dayjs } from 'dayjs';
import { useQuery, useMutation } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { simulatedDayjs, useSystemTime, useSimulatedOffset, refreshSimulatedOffset } from '../../core/utils/timeProvider';
import { getImageUrl } from '../../core/utils/imageHelper';

const { Title, Text } = Typography;

const GATEWAYS = [
  { id: 'PAYPAL', name: 'PayPal', icon: 'https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg' },
  { id: 'PAYOS', name: 'PayOS (VietQR)', icon: getImageUrl('/uploads/PayOS_Icon.webp') }
];

export const PreBookingScreen = () => {
    const navigate = useNavigate();

    const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
    const [plateNumber, setPlateNumber] = useState<string>('');
    const [selectedZone, setSelectedZone] = useState<number | null>(null);
    const [activeQuickOption, setActiveQuickOption] = useState<string>('30m');

    const [isTimeModalOpen, setIsTimeModalOpen] = useState(false);
    const [modalTarget, setModalTarget] = useState<'ENTRY' | 'EXIT'>('ENTRY');
    const [tempTime, setTempTime] = useState<Dayjs>(simulatedDayjs());
    const [mockHour, setMockHour] = useState(13);
    const [mockMinute, setMockMinute] = useState(30);

    const [selectedGateway, setSelectedGateway] = useState<string>('PAYPAL');
    const [isQRModalVisible, setIsQRModalVisible] = useState(false);
    const [countdown, setCountdown] = useState(900);
    const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);
    const [paymentUrl, setPaymentUrl] = useState<string>('');
    const [paymentQrCode, setPaymentQrCode] = useState<string>('');
    const [paymentOrderId, setPaymentOrderId] = useState<string>('');
    
    const systemOffset = useSimulatedOffset();

    useEffect(() => {
        refreshSimulatedOffset();
    }, []);

    const { data: configsData } = useQuery({
        queryKey: ['system-configs'],
        queryFn: async () => {
            try {
                const res = await axiosClient.get('/system/configs');
                return res.data.data;
            } catch (err) {
                return null;
            }
        }
    });

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

    const earlyMins = useMemo(() => {
        if (earlyMinsData !== undefined) return earlyMinsData;
        if (!configsData) return 30;
        const config = configsData.find((c: any) => c.configKey === 'RESERVATION_EARLY_MINS');
        return config && config.configValue ? parseInt(config.configValue, 10) : 30;
    }, [configsData, earlyMinsData]);

    const [entryTime, setEntryTime] = useState<Dayjs>(simulatedDayjs().add(earlyMins, 'minute'));
    const [exitTime, setExitTime] = useState<Dayjs>(simulatedDayjs().add(2, 'hour').add(earlyMins, 'minute'));

    useEffect(() => {
        setEntryTime(simulatedDayjs().add(earlyMins, 'minute'));
        setExitTime(simulatedDayjs().add(2, 'hour').add(earlyMins, 'minute'));
    }, [systemOffset, earlyMins]);


    const { data: vehicleTypes, isLoading: isLoadingVehicles } = useQuery({
        queryKey: ['public-vehicle-types'],
        queryFn: async () => {
            const res = await axiosClient.get('/public/vehicle-types?activeOnly=true');
            return res.data.data;
        }   
    });
    
    const VEHICLES = vehicleTypes || [];

    const { data: zonesData, isLoading: isLoadingZones } = useQuery({
        queryKey: ['zones', selectedVehicle],
        queryFn: async () => {
            if (!selectedVehicle) return [];
            const res = await axiosClient.get(`/infrastructure/zones/map`);
            return res.data.data;
        },
        enabled: !!selectedVehicle
    });

    const allZones = zonesData || [];
    const vehicleTypeObj = VEHICLES.find((v: any) => v.id === selectedVehicle);
    const vehicleTypeName = vehicleTypeObj?.typeName || vehicleTypeObj?.name;

    const filteredZones = allZones.filter((z: any) => {
        if (z.functionType !== 'WALK_IN') return false;
        if (!selectedVehicle) return true;
        if (z.vehicleTypeId) return z.vehicleTypeId === selectedVehicle;
        return z.vehicleType === vehicleTypeName || (z.vehicleType && vehicleTypeName && z.vehicleType.substring(0, 3) === vehicleTypeName.substring(0, 3));
    });

    const durationMinutes = Math.max(1, Math.ceil(exitTime.diff(entryTime, 'minute', true)));

    const { data: feeData, isFetching: isFeeLoading } = useQuery({
        queryKey: ['preview-price', selectedVehicle, durationMinutes, entryTime.format('YYYY-MM-DDTHH:mm:ss')],
        queryFn: async () => {
            if (!selectedVehicle) return 0;
            try {
                const res = await axiosClient.post('/customer/reservations/preview', {
                    vehicleTypeId: selectedVehicle,
                    expectedEntryTime: entryTime.format('YYYY-MM-DDTHH:mm:00'),
                    expectedDurationMinutes: durationMinutes
                });
                return res.data.data || 0;
            } catch (err) {
                return 0;
            }
        },
        enabled: !!selectedVehicle && durationMinutes > 0,
    });

    const totalFee = feeData || 0;

    const generateLinkMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                vehicleTypeId: selectedVehicle,
                plateNumber: plateNumber,
                expectedEntryTime: entryTime.format('YYYY-MM-DDTHH:mm:ss'),
                expectedDurationMinutes: durationMinutes,
                zoneId: selectedZone
            };
            const res = await axiosClient.post('/payments/initialize', {
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
            const errMsg = err.response?.data?.message || 'Lỗi khi tạo liên kết thanh toán';
            message.error(errMsg);
            setIsQRModalVisible(false);
        }
    });

    const handleConfirmBooking = () => {
        if (!selectedVehicle) return message.error('Vui lòng chọn loại xe');
        if (!plateNumber) return message.error('Vui lòng nhập biển số xe');
        if (!selectedZone) return message.error('Vui lòng chọn khu vực');
        
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
                        const captureUrl = selectedGateway === 'PAYOS' ? '/payments/payos/capture' : '/payments/paypal/capture';
                        axiosClient.post(captureUrl, { token: paymentOrderId })
                        .then(res => {
                            if (res.data?.data?.status === 'COMPLETED') {
                                axiosClient.post('/payments/execute-action', { token: paymentOrderId })
                                .then(execRes => {
                                    setIsPaymentSuccess(true);
                                    setIsQRModalVisible(false);
                                    setTimeout(() => {
                                        navigate('/customer/my-parking?tab=booking');
                                    }, 2000);
                                })
                                .catch(execErr => {
                                    message.error(execErr.response?.data?.message || 'Lỗi hệ thống khi thanh toán');
                                    setIsQRModalVisible(false);
                                    clearTimeout(timer);
                                });
                            }
                        })
                        .catch(() => {});
                    }
                }, 1000);
            } else {
                setIsQRModalVisible(false);
            }
        }
        return () => clearTimeout(timer);
    }, [isQRModalVisible, isPaymentSuccess, paymentOrderId, countdown]);

    const handleQuickOption = (type: string) => {
        setActiveQuickOption(type);
        if (type === '30m') {
            setEntryTime(simulatedDayjs().add(30, 'minute'));
        } else if (type === '1h') {
            setEntryTime(simulatedDayjs().add(1, 'hour'));
        } else if (type === 'tomorrow') {
            setEntryTime(simulatedDayjs().add(1, 'day').hour(8).minute(0));
        }
    };

    const openTimeModal = (target: 'ENTRY' | 'EXIT') => {
        setModalTarget(target);
        const timeToLoad = target === 'ENTRY' ? entryTime : exitTime;
        setTempTime(timeToLoad);
        setMockHour(timeToLoad.hour());
        setMockMinute(timeToLoad.minute());
        setIsTimeModalOpen(true);
    };

    const confirmTimeModal = () => {
        const finalTime = tempTime.hour(mockHour).minute(mockMinute);
        if (modalTarget === 'ENTRY') setEntryTime(finalTime);
        else setExitTime(finalTime);
        setActiveQuickOption('custom');
        setIsTimeModalOpen(false);
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col relative pb-10">
            <div className="p-4 md:p-6 bg-white shadow-sm sticky top-16 z-10 border-b border-slate-200">
                <Title level={3} className="m-0 text-slate-800">Đặt chỗ trước</Title>
                <Text type="secondary" className="text-slate-500">Đảm bảo vị trí đỗ xe của bạn trước khi đến PBMS.</Text>
            </div>

            <div className="max-w-7xl mx-auto w-full p-4 md:p-6 mt-2 grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                <div className="lg:col-span-2 space-y-6">
                    <Card title={<><CarOutlined className="mr-2 text-blue-600" /> 1. Thông tin xe</>} className="rounded-2xl shadow-sm border-slate-200">
                        <div className="mb-6">
                            <Text className="block font-bold mb-3 text-slate-700">Loại phương tiện:</Text>
                            <div className="flex flex-wrap gap-4">
                                {isLoadingVehicles ? (
                                    <Text className="text-slate-400">Đang tải danh sách xe...</Text>
                                ) : (
                                    VEHICLES.map((v: any) => (
                                        <div 
                                            key={v.id}
                                            onClick={() => { setSelectedVehicle(v.id); setSelectedZone(null); }}
                                            className={`cursor-pointer border-2 rounded-xl p-4 flex-1 min-w-[120px] text-center transition-all ${
                                                selectedVehicle === v.id 
                                                ? 'border-blue-600 bg-blue-50 shadow-md shadow-blue-100' 
                                                : 'border-slate-200 hover:border-blue-300'
                                            }`}
                                        >
                                            <div className={`text-3xl mb-2 ${selectedVehicle === v.id ? 'text-blue-600' : 'text-slate-400'}`}>
                                                {v.iconUrl ? <img src={getImageUrl(v.iconUrl)} className="h-10 mx-auto object-contain" /> : <CarOutlined />}
                                            </div>
                                            <Text className={`font-bold block ${selectedVehicle === v.id ? 'text-blue-700' : 'text-slate-600'}`}>
                                                {v.name || v.typeName}
                                            </Text>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        <div>
                            <Text className="block font-bold mb-3 text-slate-700">Biển số xe (Bắt buộc):</Text>
                            <Input 
                                size="large"
                                placeholder="VD: 51H-12345"
                                value={plateNumber}
                                onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                                className="h-14 text-lg font-mono font-bold rounded-xl bg-slate-50 focus:bg-white"
                                maxLength={15}
                            />
                        </div>
                    </Card>

                    <Card title={<><ClockCircleOutlined className="mr-2 text-green-500" /> 2. Thời gian đỗ xe</>} className="rounded-2xl shadow-sm border-slate-200">
                        <div className="mb-6">
                            <Text className="block font-bold mb-3 text-slate-700">Tùy chọn đến bãi nhanh:</Text>
                            <div className="flex gap-3 flex-wrap">
                                <Button onClick={() => handleQuickOption('30m')} type={activeQuickOption === '30m' ? 'primary' : 'default'} shape="round" className={activeQuickOption === '30m' ? 'bg-blue-600 font-medium' : 'font-medium text-slate-600'}>Đến ngay (Sau 30p)</Button>
                                <Button onClick={() => handleQuickOption('1h')} type={activeQuickOption === '1h' ? 'primary' : 'default'} shape="round" className={activeQuickOption === '1h' ? 'bg-blue-600 font-medium' : 'font-medium text-slate-600'}>Sau 1 tiếng</Button>
                                <Button onClick={() => handleQuickOption('tomorrow')} type={activeQuickOption === 'tomorrow' ? 'primary' : 'default'} shape="round" className={activeQuickOption === 'tomorrow' ? 'bg-blue-600 font-medium' : 'font-medium text-slate-600'}>Sáng mai (8:00 AM)</Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <Text className="block font-bold mb-3 text-slate-700">Dự kiến đến bãi lúc:</Text>
                                <div onClick={() => openTimeModal('ENTRY')} className="cursor-pointer border-2 border-slate-200 rounded-xl p-4 flex justify-between items-center hover:border-blue-400 transition-colors bg-white">
                                    <div>
                                        <Text className="block text-slate-500 mb-1 text-sm">{entryTime.format('dddd, DD/MM/YYYY')}</Text>
                                        <Text className="text-xl font-bold text-blue-700">{entryTime.format('HH:mm')}</Text>
                                    </div>
                                    <Button type="text" className="text-blue-600 font-bold">Thay đổi</Button>
                                </div>
                            </div>
                            <div>
                                <Text className="block font-bold mb-3 text-slate-700">Dự kiến ra bãi lúc:</Text>
                                <div onClick={() => openTimeModal('EXIT')} className="cursor-pointer border-2 border-slate-200 rounded-xl p-4 flex justify-between items-center hover:border-orange-400 transition-colors bg-orange-50">
                                    <div>
                                        <Text className="block text-slate-500 mb-1 text-sm">{exitTime.format('dddd, DD/MM/YYYY')}</Text>
                                        <Text className="text-xl font-bold text-orange-600">{exitTime.format('HH:mm')}</Text>
                                    </div>
                                    <Button type="text" className="text-orange-500 font-bold">Thay đổi</Button>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card title={<><EnvironmentOutlined className="mr-2 text-orange-500" /> 3. Chọn Khu vực (Zone)</>} className="rounded-2xl shadow-sm border-slate-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {!selectedVehicle ? (
                                <Text className="text-slate-400 p-4 block w-full col-span-2 text-center">Vui lòng chọn Loại phương tiện ở Bước 1 để xem các khu vực phù hợp.</Text>
                            ) : isLoadingZones ? (
                                <Text className="text-slate-400 p-4 block w-full col-span-2 text-center">Đang tải danh sách khu vực...</Text>
                            ) : filteredZones?.length === 0 ? (
                                <Text className="text-slate-400 p-4 block w-full col-span-2 text-center">Không có khu vực nào khả dụng.</Text>
                            ) : (
                                filteredZones?.map((zone: any) => {
                                    const available = zone.availableSlots ?? (zone.capacity - (zone.currentOccupancy || 0));
                                    const percent = Math.round(( (zone.capacity - available) / zone.capacity) * 100);
                                    const isFull = available <= 0;
                                    const isSelected = selectedZone === zone.id;
                                    
                                    return (
                                        <div 
                                            key={zone.id}
                                            onClick={() => !isFull && setSelectedZone(zone.id)}
                                            className={`p-5 rounded-2xl border-2 transition-all duration-300 relative ${
                                                isFull ? 'bg-red-50 border-red-300 cursor-not-allowed shadow-inner opacity-90' :
                                                isSelected ? 'border-orange-500 bg-gradient-to-br from-orange-50 to-orange-100 shadow-[0_20px_40px_-15px_rgba(249,115,22,0.5)] cursor-pointer scale-[1.03] ring-2 ring-orange-500 ring-offset-2 z-10' :
                                                'border-slate-200 bg-white hover:border-orange-500 hover:shadow-[0_20px_40px_-15px_rgba(249,115,22,0.4)] hover:-translate-y-2 hover:scale-[1.02] cursor-pointer'
                                            }`}
                                        >
                                            <div className="flex justify-between items-center mb-2">
                                                <Text className={`font-bold text-lg ${isSelected ? 'text-orange-700' : isFull ? 'text-red-700 font-black' : 'text-slate-700'}`}>
                                                    {zone.name}
                                                </Text>
                                                <Text className={isFull ? 'text-red-600 font-black' : 'text-slate-500'}>
                                                    {zone.capacity - available}/{zone.capacity} chỗ
                                                </Text>
                                            </div>
                                            
                                            <Progress 
                                                percent={percent} 
                                                status={isFull ? 'exception' : 'active'}
                                                strokeColor={isFull ? '#ff4d4f' : isSelected ? '#f97316' : '#3b82f6'}
                                                showInfo={false}
                                            />
                                            <Text className={`text-xs mt-2 block text-right font-medium ${isFull ? 'text-red-500' : 'text-slate-400'}`}>
                                                {isFull ? 'Đã kín chỗ' : `Còn ${available} chỗ trống`}
                                            </Text>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </Card>
                </div>

                <div className="lg:col-span-1">
                    <div className="lg:sticky lg:top-36 space-y-6">
                        <Card title="Tóm tắt đặt chỗ" className="rounded-2xl shadow-md border-slate-200" headStyle={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                            <Space direction="vertical" className="w-full" size="middle">
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                                    <Text className="text-slate-500">Loại xe:</Text>
                                    <Text strong className="text-slate-800">{VEHICLES.find((v: any) => v.id === selectedVehicle)?.name || VEHICLES.find((v: any) => v.id === selectedVehicle)?.typeName || '---'}</Text>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                                    <Text className="text-slate-500">Biển số:</Text>
                                    <Text strong className="text-slate-800 font-mono">{plateNumber || '---'}</Text>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                                    <Text className="text-slate-500">Khu vực:</Text>
                                    <Text strong className="text-slate-800 text-right max-w-[150px]">{allZones.find((z: any) => z.id === selectedZone)?.name || '---'}</Text>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                                    <Text className="text-slate-500">Dự kiến đến:</Text>
                                    <Text strong className="text-slate-800">{entryTime.format('HH:mm DD/MM/YYYY')}</Text>
                                </div>
                                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                                    <Text className="text-slate-500">Dự kiến ra:</Text>
                                    <Text strong className="text-slate-800">{exitTime.format('HH:mm DD/MM/YYYY')}</Text>
                                </div>
                                <div className="flex justify-between pb-1">
                                    <Text className="text-slate-500">Tạm tính:</Text>
                                    {isFeeLoading ? <Spin size="small" /> : <Text strong className="text-xl text-blue-600 font-bold">{totalFee.toLocaleString()} VND</Text>}
                                </div>
                            </Space>
                        </Card>
                        
                        <Card title={<><CreditCardOutlined className="mr-2 text-purple-600"/>Thanh toán</>} className="rounded-2xl shadow-md border-slate-200">
                            <div className="w-full flex flex-col space-y-4">
                                {GATEWAYS.map(gw => {
                                    const isSelected = selectedGateway === gw.id;
                                    return (
                                        <div 
                                            key={gw.id}
                                            onClick={() => setSelectedGateway(gw.id)}
                                            className={`relative overflow-hidden cursor-pointer flex items-center px-4 py-3 rounded-xl transition-all duration-300 ${isSelected ? 'ring-2 ring-purple-500 bg-purple-50 shadow-md scale-[1.02]' : 'ring-1 ring-slate-200 bg-white hover:ring-purple-300'}`}
                                        >
                                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mr-3 transition-colors ${isSelected ? 'border-purple-600' : 'border-slate-300'}`}>
                                                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-purple-600" />}
                                            </div>
                                            <div className="flex items-center flex-1">
                                                <div className="w-12 h-8 bg-white rounded-md flex items-center justify-center shadow-sm border border-slate-100 p-1 mr-3">
                                                    <img src={gw.icon} alt={gw.name} className="max-w-full max-h-full object-contain" />
                                                </div>
                                                <span className={`font-bold ${isSelected ? 'text-purple-700' : 'text-slate-700'}`}>{gw.name}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>

                        <Button 
                            type="primary" 
                            size="large" 
                            block 
                            className={`h-14 text-lg font-bold shadow-md rounded-xl transition-all duration-300 ${(!selectedVehicle || !plateNumber || !selectedZone) ? 'bg-slate-300 cursor-not-allowed border-none' : 'bg-gradient-to-r from-blue-600 to-indigo-600 border-0 hover:-translate-y-1 hover:shadow-xl hover:shadow-blue-200'}`}
                            onClick={handleConfirmBooking}
                        >
                            Xác nhận & Thanh toán
                        </Button>
                    </div>
                </div>
            </div>

            <Modal
                title={null}
                centered
                open={isTimeModalOpen}
                onCancel={() => setIsTimeModalOpen(false)}
                footer={null}
                width={650}
                className="rounded-[2rem] overflow-hidden"
                styles={{ content: { padding: 0 } }}
                closeIcon={false}
            >
                <div className="bg-blue-600 p-6 text-white text-center">
                    <h2 className="text-2xl font-bold m-0">
                        {modalTarget === 'ENTRY' ? 'Chọn ngày giờ ĐẾN' : 'Chọn ngày giờ RA'}
                    </h2>
                    <p className="text-blue-100 mt-1 mb-0 opacity-90 text-sm">Vui lòng chọn thời gian bạn dự kiến có mặt tại bãi đỗ</p>
                </div>

                <div className="p-6 md:p-8 bg-slate-50">
                    <Row gutter={[32, 24]}>
                        <Col xs={24} md={14}>
                            <div className="bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                                <Calendar 
                                    fullscreen={false} 
                                    className="bg-transparent" 
                                    value={tempTime}
                                    onChange={(date) => setTempTime(date)}
                                />
                            </div>
                        </Col>

                        <Col xs={24} md={10}>
                            <div className="flex flex-col justify-center items-center h-full bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                                <Text className="block font-bold mb-6 text-slate-500 uppercase tracking-widest text-xs">Thời gian cụ thể</Text>
                                
                                <div className="flex justify-center items-center gap-6">
                                    <div className="flex flex-col items-center">
                                        <Button type="text" icon={<UpOutlined className="text-xl"/>} onClick={() => setMockHour(h => h === 23 ? 0 : h + 1)} className="h-12 w-12 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full" />
                                        <input 
                                            type="number"
                                            value={String(mockHour).padStart(2, '0')}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === '') {
                                                    setMockHour(0);
                                                    return;
                                                }
                                                const parsed = parseInt(val);
                                                if (!isNaN(parsed)) {
                                                    setMockHour(Math.min(23, Math.max(0, parsed)));
                                                }
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            className="text-5xl font-black font-mono text-slate-800 my-4 w-24 h-16 text-center tracking-tighter bg-transparent border-none outline-none hide-number-spin focus:bg-blue-50 focus:rounded-2xl transition-colors cursor-text"
                                        />
                                        <Button type="text" icon={<DownOutlined className="text-xl"/>} onClick={() => setMockHour(h => h === 0 ? 23 : h - 1)} className="h-12 w-12 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full" />
                                    </div>

                                    <div className="text-4xl font-bold text-slate-300 pb-2">:</div>

                                    <div className="flex flex-col items-center">
                                        <Button type="text" icon={<UpOutlined className="text-xl"/>} onClick={() => setMockMinute(m => m >= 45 ? 0 : m + 15)} className="h-12 w-12 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full" />
                                        <input 
                                            type="number"
                                            value={String(mockMinute).padStart(2, '0')}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === '') {
                                                    setMockMinute(0);
                                                    return;
                                                }
                                                const parsed = parseInt(val);
                                                if (!isNaN(parsed)) {
                                                    setMockMinute(Math.min(59, Math.max(0, parsed)));
                                                }
                                            }}
                                            onFocus={(e) => e.target.select()}
                                            className="text-5xl font-black font-mono text-slate-800 my-4 w-24 h-16 text-center tracking-tighter bg-transparent border-none outline-none hide-number-spin focus:bg-blue-50 focus:rounded-2xl transition-colors cursor-text"
                                        />
                                        <Button type="text" icon={<DownOutlined className="text-xl"/>} onClick={() => setMockMinute(m => m <= 0 ? 45 : m - 15)} className="h-12 w-12 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full" />
                                    </div>
                                </div>
                            </div>
                        </Col>
                    </Row>

                    <div className="mt-8 flex gap-4">
                        <Button size="large" onClick={() => setIsTimeModalOpen(false)} className="flex-1 h-14 rounded-full text-slate-600 border-slate-300 font-bold hover:bg-slate-100">
                            Hủy
                        </Button>
                        <Button type="primary" size="large" onClick={confirmTimeModal} className="flex-[2] h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-lg font-bold shadow-lg shadow-blue-600/30">
                            Xác nhận
                        </Button>
                    </div>
                </div>
            </Modal>

            <Modal
                open={isQRModalVisible}
                footer={null}
                closable={!isPaymentSuccess}
                onCancel={() => !isPaymentSuccess && setIsQRModalVisible(false)}
                centered
                maskClosable={false}
                width={400}
            >
                <div className="text-center py-6">
                {!isPaymentSuccess ? (
                    <>
                        <Title level={4} className="mb-2 text-slate-800">Quét mã thanh toán</Title>
                        <Text className="block mb-2 text-slate-500">Sử dụng ứng dụng ngân hàng hoặc Momo để quét mã</Text>
                        
                        <div className="relative inline-block mb-6 mt-4">
                            <div className="bg-white p-4 border-2 border-dashed border-slate-300 rounded-2xl shadow-sm relative z-10 flex justify-center items-center h-[240px] w-[240px]">
                                {paymentUrl ? <QRCode value={selectedGateway === 'PAYOS' && paymentQrCode ? paymentQrCode : paymentUrl} size={200} /> : <Spin size="large" />}
                            </div>
                            <style>{`
                                @keyframes scan {
                                    0% { transform: translateY(0); }
                                    50% { transform: translateY(220px); }
                                    100% { transform: translateY(0); }
                                }
                            `}</style>
                            {paymentUrl && <div className="absolute top-2 left-2 w-[calc(100%-16px)] h-1 bg-green-500 shadow-[0_0_15px_#22c55e] z-20" style={{ animation: 'scan 2s ease-in-out infinite' }}></div>}
                        </div>
                        
                        <div className="text-2xl font-black text-blue-600 mb-2">{totalFee.toLocaleString()} VND</div>
                        
                        <div className="mb-6">
                            {paymentUrl ? (
                                selectedGateway !== 'PAYOS' && (
                                    <Button type="primary" size="large" href={paymentUrl} target="_blank" className="w-full bg-[#0070ba] hover:bg-[#003087] border-none font-bold flex items-center justify-center">
                                        Thanh toán bằng PayPal
                                    </Button>
                                )
                            ) : (
                                <Button disabled size="large" className="w-full">Đang tạo link thanh toán...</Button>
                            )}
                        </div>
                        
                        <div className="flex items-center justify-center space-x-2 text-slate-600">
                            <Spin size="small" />
                            <Text>Đang chờ thanh toán ({Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')})...</Text>
                        </div>
                    </>
                ) : (
                    <div className="animate-fade-in py-8">
                        <CheckCircleOutlined className="text-[80px] text-green-500 mb-6" />
                        <Title level={3} className="text-slate-800">Thanh toán thành công!</Title>
                        <Text className="block text-slate-500 mb-2">Vị trí của bạn đã được hệ thống ghi nhận</Text>
                        <Text className="block text-slate-500">Đang chuyển về trang Quản lý đặt chỗ...</Text>
                    </div>
                )}
                </div>
            </Modal>

            <style>{`
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
                
                .hide-number-spin::-webkit-inner-spin-button,
                .hide-number-spin::-webkit-outer-spin-button {
                    -webkit-appearance: none;
                    margin: 0;
                }
                .hide-number-spin {
                    -moz-appearance: textfield;
                }
            `}</style>
        </div>
    );
};
