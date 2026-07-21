import { simulatedDayjs } from '../../core/utils/timeProvider';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Typography, Space, DatePicker, message, Spin, Radio, Input, Modal, Row, Col, QRCode } from 'antd';
import { IdcardOutlined, CarOutlined, CreditCardOutlined, CheckCircleOutlined, UserOutlined, CalendarOutlined, NumberOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl as getGlobalImageUrl } from '../../core/utils/imageHelper';
const { Title, Text } = Typography;

const BASE_PACKAGES = [
  { id: 1, name: '1 month' },
  { id: 3, name: '3 Months' }, 
  { id: 6, name: '6 Months' }, 
  { id: 12, name: '12 Months' }, 
];

const GATEWAYS = [
  { id: 'PAYPAL', name: 'PayPal Sandbox', icon: '/paypal_logo.webp' },
  { id: 'PAYOS', name: 'PayOS (VietQR)', icon: getGlobalImageUrl('/uploads/PayOS_Icon.webp') }
];

export const CustomerMonthlyPassScreen = () => {
  const navigate = useNavigate();
  const email = useAuthStore(state => state.email);
  const name = useAuthStore(state => state.name);
  
  const [fullName, setFullName] = useState<string>('');
  const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
  const [plateNumber, setPlateNumber] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<number>(1);
  const [startDate, setStartDate] = useState<dayjs.Dayjs>(simulatedDayjs());
  
  const [selectedGateway, setSelectedGateway] = useState<string>('PAYPAL');
  
  const [isQRModalVisible, setIsQRModalVisible] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string>('');
  const [paymentQrCode, setPaymentQrCode] = useState<string>('');
  const [paymentOrderId, setPaymentOrderId] = useState<string>('');

  const { data: pricingPolicies = [], isLoading: isPricingLoading } = useQuery({
    queryKey: ['public-pricing'],
    queryFn: async () => {
      const res = await axiosClient.get('/public/pricing');
      return res.data.data || [];
    }
  });

  const { data: vehicleTypes = [] } = useQuery({
    queryKey: ['public-vehicle-types'],
    queryFn: async () => {
      const res = await axiosClient.get('/public/vehicle-types');
      return res.data.data || [];
    }
  });

  const { data: discountConfig = {} } = useQuery({
    queryKey: ['config-discounts'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/monthly-tickets/config-discounts');
      return res.data.data || {};
    }
  });

  const PACKAGES = BASE_PACKAGES.map(p => ({
    ...p,
    discount: discountConfig[p.id.toString()] || 0
  }));

  const dynamicVehicles = pricingPolicies.map((p: any) => {
    const vt = vehicleTypes.find((v: any) => v.id === p.vehicleTypeId);
    return {
      id: p.vehicleTypeId,
      name: vt?.typeName || p.policyName.replace(/Bảng giá |Price list /gi, ''),
      iconUrl: vt?.iconUrl,
      pricePerMonth: p.monthlyRate || 0
    };
  });

  // Auto fill name if available from store
  useEffect(() => {
    if (name) {
      setFullName(name);
    }
  }, [name]);

  // Calculate fee
  const vehicleConfig = dynamicVehicles.find((v: any) => v.id === selectedVehicle);
  const packageConfig = PACKAGES.find(p => p.id === selectedDuration);
  
  const baseFee = (vehicleConfig?.pricePerMonth || 0) * selectedDuration;
  const discountAmount = baseFee * (packageConfig?.discount || 0);
  const totalFee = baseFee - discountAmount;

  const endDate = startDate.add(selectedDuration, 'month');

  const createPassMutation = useMutation({
    mutationFn: async () => {
      const res = await axiosClient.post('/operation/monthly-tickets', {
        vehicleTypeId: selectedVehicle,
        plateNumber: plateNumber,
        duration: selectedDuration
      });
      return res.data;
    },
    onSuccess: () => {
      setCountdown(5);
      setIsPaymentSuccess(true);
      message.success('Payment Success! Your Monthly Pass has been activated');
      setTimeout(() => {
        navigate('/customer/my-parking?tab=monthly');
      }, 2000);
    },
    onError: () => {
      message.error('an error occurred when registering for Monthly Pass');
      setIsQRModalVisible(false);
    }
  });

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        fullName: fullName,
        vehicleTypeId: selectedVehicle,
        plateNumber: plateNumber,
        validFrom: startDate.format('YYYY-MM-DDTHH:mm:ss'),
        durationMonths: selectedDuration
      };
      
      const res = await axiosClient.post('/finance/payments/initialize', {
        actionType: 'CREATE_MONTHLY_TICKET',
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
      const errMsg = err.response?.data?.message || err.message || 'Error when creating payment link';
      message.error(errMsg);
      setIsQRModalVisible(false);
    }
  });

  const handleConfirm = () => {
    if (!fullName.trim()) return message.error('Please enter Full Name');
    if (!selectedVehicle) return message.error('Please select Vehicle type');
    if (!plateNumber.trim()) return message.error('Please enter vehicle License Plate');
    if (!startDate) return message.error('Please select an effective date');
    
    setIsQRModalVisible(true);
    setIsPaymentSuccess(false);
    setPaymentUrl('');
    setPaymentOrderId('');
    setCountdown(60);
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
                  // Execute Business Logic
                  axiosClient.post('/finance/payments/execute-action', { token: paymentOrderId })
                    .then(execRes => {
                       message.success('Monthly Pass registered successfully!');
                       setIsPaymentSuccess(true);
                       setIsQRModalVisible(false);
                       setTimeout(() => {
                         navigate('/customer/my-parking?tab=monthly');
                       }, 2000);
                    })
                    .catch(execErr => {
                       message.error(execErr.response?.data?.message || 'System failed to process ticket. Your payment has been queued for a full refund.');
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
        message.warning('Waiting time for payment is over');
      }
    }
    return () => clearTimeout(timer);
  }, [isQRModalVisible, isPaymentSuccess, paymentOrderId, countdown]);

  const getImageUrl = (url: string) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const baseUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : 'http://localhost:8080';
    return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/20 to-indigo-50/30 flex flex-col relative pb-12 font-sans">
      <div className="p-4 md:p-6 bg-white/80 backdrop-blur-md shadow-sm sticky top-16 z-10 border-b border-white/50">
        <Title level={3} className="m-0 text-slate-800 flex items-center text-xl md:text-2xl">
          <IdcardOutlined className="mr-3 text-blue-600" />  Sign up for Monthly Passes
                          </Title>
        <Text type="secondary" className="text-slate-500 text-sm md:text-base">Register to reserve a long-term parking space with many attractive incentives</Text>
      </div>

      <div className="max-w-7xl mx-auto w-full p-4 md:p-6 mt-2 md:mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8 items-start">
        
        {/* LEFT COLUMN: Input Form */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. Personal Information */}
          <Card title={<span className="font-black text-xl"><UserOutlined className="mr-2 text-blue-600"/>1. Ticket holder information</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md hover:shadow-2xl transition-shadow duration-300">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <Text className="block font-bold mb-2 text-slate-700">Full name:</Text>
                <Input 
                  size="large" 
                  placeholder="Enter first and last name" 
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  className="rounded-lg h-12"
                />
              </div>
              <div>
                <Text className="block font-bold mb-2 text-slate-700">Email to receive invoice:</Text>
                <Input 
                  size="large" 
                  value={email || 'customer@example.com'}
                  disabled
                  className="rounded-lg h-12 bg-slate-100 text-slate-500"
                />
                <Text className="text-xs text-slate-400 mt-1 block">Email is automatically taken from Login account</Text>
              </div>
            </div>
          </Card>

          {/* 2. Vehicle Information */}
          <Card title={<span className="font-black text-xl"><CarOutlined className="mr-2 text-green-600"/>2. Vehicle registration</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md hover:shadow-2xl transition-shadow duration-300">
            <div className="mb-6">
              <Text className="block font-bold mb-3 text-slate-700">Vehicle Type:</Text>
              {isPricingLoading ? (
                 <Spin />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {dynamicVehicles.map((v: any) => (
                    <div
                      key={v.id}
                      onClick={() => setSelectedVehicle(v.id)}
                      className={`cursor-pointer p-6 rounded-2xl border-0 shadow-md transition-all duration-300 flex flex-col items-center justify-center ${selectedVehicle === v.id ? 'ring-4 ring-green-500 bg-green-50 text-green-800 scale-105 shadow-xl' : 'bg-white hover:ring-2 hover:ring-green-300 hover:shadow-lg'}`}
                    >
                      {v.iconUrl ? (
                        <img src={getImageUrl(v.iconUrl)} alt={v.name} className="h-10 w-10 object-contain mb-2" />
                      ) : (
                        <CarOutlined className="text-3xl mb-2" />
                      )}
                      <span className="font-bold text-lg mb-1">{v.name}</span>
                      <span className="text-sm text-slate-500">{v.pricePerMonth.toLocaleString()} VND/month</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Text className="block font-bold mb-2 text-slate-700">License Plate:</Text>
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

          {/* 3. Duration & Start Date */}
          <Card title={<span className="font-black text-xl"><CalendarOutlined className="mr-2 text-orange-600"/>3. Package Monthly Passes & Validity</span>} className="shadow-xl rounded-3xl border-0 bg-white/90 backdrop-blur-md hover:shadow-2xl transition-shadow duration-300">
            <div className="mb-6">
              <Text className="block font-bold mb-3 text-slate-700">Choose Time package:</Text>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                {PACKAGES.map(p => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedDuration(p.id)}
                    className={`relative cursor-pointer p-4 rounded-2xl border-0 shadow-md transition-all duration-300 flex flex-col items-center justify-center ${selectedDuration === p.id ? 'ring-4 ring-orange-500 bg-orange-50 text-orange-800 scale-105 shadow-xl' : 'bg-white hover:ring-2 hover:ring-orange-300 hover:shadow-lg'}`}
                  >
                    {p.discount > 0 && (
                      <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                        -{p.discount * 100}%
                      </div>
                    )}
                    <span className="font-bold text-base">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Text className="block font-bold mb-2 text-slate-700">Effective Start Date:</Text>
              <div className="hidden md:block">
                <DatePicker 
                  format="DD/MM/YYYY" 
                  value={startDate}
                  onChange={(val) => val && setStartDate(val)} 
                  className="w-full md:w-1/2 h-12 rounded-lg text-lg" 
                  minDate={simulatedDayjs()}
                  inputReadOnly={true}
                />
              </div>
              <div className="block md:hidden">
                <input 
                  type="date"
                  className="w-full h-12 rounded-lg border border-slate-300 px-3 text-slate-700 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 bg-white text-base"
                  value={startDate.format('YYYY-MM-DD')}
                  min={simulatedDayjs().format('YYYY-MM-DD')}
                  onChange={(e) => { if(e.target.value) setStartDate(dayjs(e.target.value)) }}
                />
              </div>
            </div>
          </Card>

        </div>

        {/* RIGHT COLUMN: Sticky Summary */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-6">
            
            <Card title={<span className="font-black text-xl text-slate-800">Payment Invoice</span>} className="shadow-2xl rounded-3xl border-0 overflow-hidden backdrop-blur-md bg-white/90" headStyle={{ backgroundColor: 'rgba(248, 250, 252, 0.8)', borderBottom: '1px solid rgba(226, 232, 240, 0.5)' }}>
              <Space direction="vertical" className="w-full" size="middle">
                
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Card holder:</Text>
                  <Text strong className="text-slate-800 text-right max-w-[150px] truncate">{fullName || '---'}</Text>
                </div>
                
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Vehicle Type:</Text>
                  <Text strong className="text-slate-800">{vehicleConfig?.name || '---'} <span className="text-slate-400 font-normal">({plateNumber || 'Not entered yet'})</span></Text>
                </div>
                
                <div className="flex justify-between border-b border-dashed border-slate-200 pb-3">
                  <Text className="text-slate-500">Duration:</Text>
                  <Text strong className="text-slate-800 text-right">
                    {selectedDuration} month(s)
                                                          <br/><span className="text-xs text-blue-500 font-normal">({startDate.format('DD/MM/YYYY')} - {endDate.format('DD/MM/YYYY')})</span>
                  </Text>
                </div>

                <div className="flex justify-between mt-2">
                  <Text className="text-slate-500">Basic fee:</Text>
                  <Text strong className="text-slate-700">{baseFee.toLocaleString()} VND</Text>
                </div>

                {discountAmount > 0 && (
                  <div className="flex justify-between">
                    <Text className="text-green-500">Special discount:</Text>
                    <Text strong className="text-green-600">- {discountAmount.toLocaleString()} VND</Text>
                  </div>
                )}
                
                <div className="bg-slate-50 p-4 rounded-lg mt-2 flex justify-between items-center border border-slate-200">
                  <Text strong className="text-slate-600">TOTAL AMOUNT:</Text>
                  <Text className="text-2xl font-black text-blue-600">{totalFee.toLocaleString()} VND</Text>
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

            <Button 
              type="primary" 
              size="large" 
              className="w-full h-16 mt-6 text-xl font-black shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 bg-gradient-to-r from-blue-600 to-indigo-600 border-0 rounded-2xl animate-pulse"
              onClick={handleConfirm}
            >
              
                                        Confirm Registration
                                      </Button>
          </div>
        </div>

      </div>

      {/* QR Code Modal */}
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
              <Title level={4} className="mb-2 text-slate-800">Scan QR code to pay</Title>
              <Text className="block mb-6 text-slate-500">Open the Banking or eWallet app</Text>
              
              <div className="relative inline-block mb-6">
                <div className="bg-white p-4 border-2 border-dashed border-slate-300 rounded-2xl shadow-sm relative z-10 flex justify-center items-center h-[240px] w-[240px]">
                  {paymentUrl ? <QRCode value={selectedGateway === 'PAYOS' && paymentQrCode ? paymentQrCode : paymentUrl} size={200} /> : <Spin size="large" />}
                </div>
                {/* Scanning animation line */}
                <style>
                  {`
                    @keyframes scan {
                      0% { transform: translateY(0); }
                      50% { transform: translateY(220px); }
                      100% { transform: translateY(0); }
                    }
                  `}
                </style>
                {paymentUrl && <div className="absolute top-2 left-2 w-[calc(100%-16px)] h-1 bg-green-500 shadow-[0_0_15px_#22c55e] z-20" style={{ animation: 'scan 2s ease-in-out infinite' }}></div>}
              </div>
              
              <div className="text-2xl font-black text-blue-600 mb-2">{totalFee.toLocaleString()} VND</div>
              <Text className="block text-slate-500 mb-6 font-mono bg-slate-100 py-2 rounded-lg break-all px-2 text-xs">
                {selectedGateway === 'PAYOS' ? (
                  <a href={paymentUrl} target="_blank" rel="noreferrer">Open PayOS Checkout</a>
                ) : (
                  <a href={paymentUrl} target="_blank" rel="noreferrer">Open PayPal Checkout</a>
                )}
              </Text>
              
              <div className="flex items-center justify-center space-x-2 text-slate-600">
                <Spin size="small" />
                <Text>Awaiting payment ({countdown}s)...</Text>
              </div>
            </>
          ) : (
            <div className="animate-fade-in py-8">
              <CheckCircleOutlined className="text-[80px] text-green-500 mb-6" />
              <Title level={3} className="text-slate-800">Payment Success!</Title>
              <Text className="block text-slate-500 mb-2">Your Monthly Pass has been activated</Text>
              <Text className="block text-slate-500">Moving back to Management page...</Text>
            </div>
          )}
        </div>
      </Modal>

    </div>
  );
};
