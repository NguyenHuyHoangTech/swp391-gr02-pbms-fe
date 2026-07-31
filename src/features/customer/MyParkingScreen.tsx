import React, { useState, useEffect } from 'react';
import { Tabs, Card, Typography, List, Divider, Button, Tag, Spin, message, Input, Space, Popconfirm, Empty, Timeline, Drawer, Alert, Form, Select, Radio, Modal, QRCode, notification } from 'antd';
import { ClockCircleOutlined, CarOutlined, CreditCardOutlined, SearchOutlined, IdcardOutlined, CloseCircleOutlined, HistoryOutlined, CheckCircleOutlined, EditOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { useLocation, useNavigate } from 'react-router-dom';
import { getImageUrl } from '../../core/utils/imageHelper';
import { normalizePlateNumber } from '../../core/utils/licensePlateUtils';
import { simulatedDayjs } from '../../core/utils/timeProvider';
import { FeeBreakdown } from '../../components/FeeBreakdown';

interface Booking {
  id: string;
  status: string;
  plateNumber: string;
  expectedEntryTime: string;
  zoneName: string;
  slotName: string;
  expectedDurationMinutes?: number;
  reservationFee?: number;
  refundStatus?: string;
  refundAmount?: number;
  refundRequestId?: number;
  rejectReason?: string;
  refundProofUrl?: string;
  vehicleTypeId?: number;
  rfid?: string;
}

interface MonthlyPass {
  id: string;
  status: string;
  plate: string;
  type: string;
  endDate: string;
  hasBeenUsed?: boolean;
  vehicleTypeId?: number;
  inParkingLot?: boolean;
  rfid?: string;
}

interface HistoryRecord {
  recordType: 'SESSION' | 'RESERVATION';
  type: string; // display label
  plateNumber: string;
  fee: number;
  timeIn: string;
  timeOut: string;
  incidentDetails?: any[];
  // Reservation-specific
  status?: string;
  zoneName?: string;
  expectedEntryTime?: string;
  expectedDurationMinutes?: number;
  reservationFee?: number;
  refundAmount?: number;
  refundStatus?: string;
  forfeitedAmount?: number;
  refundProofUrl?: string;
}

const { Title, Text } = Typography;

export const MyParkingScreen = () => {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [elapsedTime, setElapsedTime] = useState('');

  // URL tab handling
  const queryParams = new URLSearchParams(location.search);
  const tabParam = queryParams.get('tab');
  const [activeTab, setActiveTab] = useState(
    tabParam === 'booking' ? '2' :
      tabParam === 'monthly' ? '3' :
        tabParam === 'history' ? '4' : '1'
  );

  const BASE_PACKAGES = [
    { id: 1, name: '1 Month' },
    { id: 3, name: '3 Months' },
    { id: 6, name: '6 Months' },
    { id: 12, name: '12 Months' },
  ];
  const VEHICLES = [
    { id: 'CAR', name: 'Car', pricePerMonth: 1000000 },
    { id: 'MOTORBIKE', name: 'Motorbike', pricePerMonth: 150000 }
  ];
  const GATEWAYS = [
    { id: 'PAYPAL', name: 'PayPal', icon: '/paypal_logo.webp' },
    { id: 'PAYOS', name: 'PayOS (VietQR)', icon: getImageUrl('/uploads/PayOS_Icon.webp') }
  ];

  // Strict Walk-in 2FA Lookup
  const [plateNumberInput, setPlateNumberInput] = useState('');
  const [rfidInput, setRfidInput] = useState('');
  const [vehicleTypeIdInput, setVehicleTypeIdInput] = useState<number | undefined>(undefined);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchParams, setSearchParams] = useState({ plate: '', rfid: '', vehicleTypeId: undefined as number | undefined });

  const { data: vehicleTypes = [] } = useQuery({
    queryKey: ['system-vehicle-types'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/vehicle-types');
        return res.data.data || [];
      } catch (err) {
        return [];
      }
    }
  });

  const [isEditPlateVisible, setIsEditPlateVisible] = useState(false);
  const [plateToEdit, setPlateToEdit] = useState<{ type: 'reservation' | 'monthly', id: string, currentPlate: string } | null>(null);
  const [newPlate, setNewPlate] = useState('');

  const [isHistoryDrawerVisible, setIsHistoryDrawerVisible] = useState(false);
  const [selectedHistoryPlate, setSelectedHistoryPlate] = useState('');

  const { data: bookings = [], isLoading: isBookingsLoading } = useQuery<Booking[]>({
    queryKey: ['my-bookings'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/customer/reservations');
        return res.data.data;
      } catch (err) {
        return [];
      }
    }
  });

  const { data: monthlyPasses = [], isLoading: isPassesLoading } = useQuery<MonthlyPass[]>({
    queryKey: ['my-passes'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/operation/monthly-tickets');
        return res.data.data;
      } catch (err) {
        return [];
      }
    }
  });

  const { data: pricingPolicies = [] } = useQuery<any[]>({
    queryKey: ['pricing-policies'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/pricing');
        return res.data.data;
      } catch (err) {
        return [];
      }
    }
  });

  const { data: configs = { earlyMins: 30, refundLate: 0.5, refundEarly: 1.0 } } = useQuery({
    queryKey: ['system_config_refunds'],
    queryFn: async () => {
      const fetchConfig = async (key: string, fallback: number) => {
        try {
          const res = await axiosClient.get(`/public/config/${key}`);
          return res.data.data ? parseFloat(res.data.data) : fallback;
        } catch (err) {
          return fallback;
        }
      };

      const earlyMins = await fetchConfig('RESERVATION_EARLY_MINS', 30);
      const refundLate = await fetchConfig('RESERVATION_REFUND_LATE_PERCENT', 0.5);
      const refundEarly = await fetchConfig('RESERVATION_REFUND_EARLY_PERCENT', 1.0);

      return { earlyMins, refundLate, refundEarly };
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

  const { data: historyRecords = [], isLoading: isHistoryLoading } = useQuery<HistoryRecord[]>({
    queryKey: ['my-history', selectedHistoryPlate],
    queryFn: async () => {
      try {
        if (!selectedHistoryPlate) return [];
        const res = await axiosClient.get(`/operation/parking-sessions/history?plate=${selectedHistoryPlate}`);
        return (res.data.data || []).map((item: any) => {
          if (item.recordType === 'RESERVATION') {
            const resStatus = item.status || 'UNKNOWN';
            const labelMap: Record<string, string> = {
              PENDING: 'Booking (Pending)',
              ACTIVE: 'Booking (Active)',
              COMPLETED: 'Booking (Completed)',
              CANCELLED: 'Booking (Cancelled)',
              COMPLETED_UNUSED: 'Booking (No-show)',
            };
            return {
              recordType: 'RESERVATION' as const,
              type: labelMap[resStatus] || `Booking (${resStatus})`,
              plateNumber: item.plate,
              fee: item.reservationFee || 0,
              timeIn: item.expectedEntryTime ? dayjs(item.expectedEntryTime).format('HH:mm DD/MM/YYYY') : '---',
              timeOut: '---',
              status: resStatus,
              zoneName: item.zoneName,
              expectedEntryTime: item.expectedEntryTime,
              expectedDurationMinutes: item.expectedDurationMinutes,
              reservationFee: item.reservationFee || 0,
              refundAmount: item.refundAmount || 0,
              refundStatus: item.refundStatus,
              forfeitedAmount: item.forfeitedAmount || 0,
              refundProofUrl: item.refundProofUrl,
            };
          }
          // Normal parking session
          return {
            recordType: 'SESSION' as const,
            type: 'Walk-in',
            plateNumber: item.plate,
            fee: item.totalFee || 0,
            timeIn: item.timeIn ? dayjs(item.timeIn).format('HH:mm DD/MM/YYYY') : '---',
            timeOut: item.timeOut ? dayjs(item.timeOut).format('HH:mm DD/MM/YYYY') : '---',
            incidentDetails: item.incidentDetails
          };
        });
      } catch (err) {
        return [];
      }
    },
    enabled: isHistoryDrawerVisible && !!selectedHistoryPlate
  });

  // We only fetch active session if we have searched in the Walk-in tab
  const { data: session, isLoading, isFetching } = useQuery({
    queryKey: ['my-active-session', searchParams.plate, searchParams.rfid, searchParams.vehicleTypeId],
    queryFn: async () => {
      let url = `/operation/parking-sessions/my-active?plate=${encodeURIComponent(searchParams.plate)}&rfid=${encodeURIComponent(searchParams.rfid)}`;
      if (searchParams.vehicleTypeId) {
        url += `&vehicleTypeId=${searchParams.vehicleTypeId}`;
      }
      const res = await axiosClient.get(url);
      return res.data?.data || null;
    },
    enabled: hasSearched && !!searchParams.plate && !!searchParams.rfid && !!searchParams.vehicleTypeId
  });



  useEffect(() => {
    if (!session || !session.timeIn) return;

    const checkIn = dayjs(session.timeIn);
    const timer = setInterval(() => {
      const now = simulatedDayjs();
      const diffHrs = now.diff(checkIn, 'hour');
      const diffMins = now.diff(checkIn, 'minute') % 60;
      const diffSecs = now.diff(checkIn, 'second') % 60;
      setElapsedTime(`${String(diffHrs).padStart(2, '0')}:${String(diffMins).padStart(2, '0')}:${String(diffSecs).padStart(2, '0')}`);
    }, 1000);
    return () => clearInterval(timer);
  }, [session]);

  const handleSearchWalkIn = () => {
    setSearchParams({ plate: plateNumberInput, rfid: rfidInput, vehicleTypeId: vehicleTypeIdInput });
    setHasSearched(true);
  };

  const handleViewParkingStatus = (plate: string, vehicleTypeId?: number, rfid?: string) => {
    setActiveTab('1');
    navigate(`/customer/my-parking?tab=walkin`, { replace: true });
    setPlateNumberInput(plate);
    setRfidInput(rfid || '');
    setVehicleTypeIdInput(vehicleTypeId);
    setSearchParams({ plate, rfid: rfid || '', vehicleTypeId });
    setHasSearched(true);
  };

  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [isIncidentModalVisible, setIsIncidentModalVisible] = useState(false);

  const cancelBookingMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number | string; data: any }) => {
      await axiosClient.put(`/customer/reservations/${id}/cancel`, data);
    },
    onSuccess: () => {
      message.success('Cancellation and refund request sent successfully.');
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      setCancelDrawerVisible(false);
      setSelectedBookingToCancel(null);
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to cancel reservation.');
    }
  });

  const resubmitRefundMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number | string; data: any }) => {
      await axiosClient.put(`/finance/refunds/${id}/resubmit`, data);
    },
    onSuccess: () => {
      message.success('Refund resubmitted successfully.');
      queryClient.invalidateQueries({ queryKey: ['my-bookings'] });
      setCancelDrawerVisible(false);
      setSelectedBookingToCancel(null);
      setIsResubmitRefund(false);
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message || 'Failed to resubmit refund.');
    }
  });

  const handleCancelBooking = () => {
    if (selectedBookingToCancel) {
      if (isResubmitRefund) {
        resubmitRefundMutation.mutate({
          id: selectedBookingToCancel.refundRequestId || 0,
          data: { bankName, accountNumber, accountName }
        });
      } else {
        cancelBookingMutation.mutate({
          id: selectedBookingToCancel.id,
          data: { bankName, accountNumber, accountName }
        });
      }
    }
  };

  const calculateRefund = (booking: Booking | null) => {
    if (!booking) return { refund: 0, penalty: 0, amount: 0, percent: 0 };
    
    const amount = booking.reservationFee || 50000;

    if (isResubmitRefund) {
      const refund = booking.refundAmount || 0;
      const penalty = amount - refund;
      const percent = amount > 0 ? Math.round((refund / amount) * 100) : 0;
      return { amount, refund, penalty, percent };
    }

    const now = simulatedDayjs();
    const arrTime = simulatedDayjs(booking.expectedEntryTime);
    const diffMins = arrTime.diff(now, 'minute');
    let refundPercent = 0;

    if (diffMins >= configs.earlyMins) {
      refundPercent = configs.refundEarly;
    } else if (diffMins > 0 && diffMins < configs.earlyMins) {
      refundPercent = configs.refundLate;
    } else {
      refundPercent = 0;
    }

    const refund = amount * refundPercent;
    const penalty = amount - refund;

    return { amount, refund, penalty, percent: refundPercent * 100 };
  };

  const [cancelDrawerVisible, setCancelDrawerVisible] = useState(false);
  const [isResubmitRefund, setIsResubmitRefund] = useState(false);
  const [selectedBookingToCancel, setSelectedBookingToCancel] = useState<Booking | null>(null);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  // Renew Pass States
  const [renewDrawerVisible, setRenewDrawerVisible] = useState(false);
  const [selectedPassToRenew, setSelectedPassToRenew] = useState<MonthlyPass | null>(null);
  const [renewDuration, setRenewDuration] = useState(1);
  const [renewGateway, setRenewGateway] = useState('PAYPAL');

  const [isRenewQRModalVisible, setIsRenewQRModalVisible] = useState(false);
  const [renewCountdown, setRenewCountdown] = useState(300);
  const [isRenewSuccess, setIsRenewSuccess] = useState(false);
  const [isRenewVerifying, setIsRenewVerifying] = useState(false);
  const [verifyCooldown, setVerifyCooldown] = useState(0);
  const [renewPaymentUrl, setRenewPaymentUrl] = useState('');
  const [renewPaymentQrCode, setRenewPaymentQrCode] = useState('');
  const [renewPaymentToken, setRenewPaymentToken] = useState('');



  const generateRenewLinkMutation = useMutation({
    mutationFn: async (totalFee: number) => {
      const res = await axiosClient.post('/finance/payments/initialize', {
        amount: totalFee,
        gateway: renewGateway,
        actionType: 'RENEW_MONTHLY_TICKET',
        payload: {
          id: selectedPassToRenew?.id?.replace('MP-', ''),
          duration: renewDuration
        }
      });
      return res.data;
    },
    onSuccess: (data) => {
      setRenewPaymentUrl(data.data.paymentUrl);
      setRenewPaymentQrCode(data.data.qrCode || data.data.paymentUrl || '');
      if (renewGateway === 'PAYPAL') {
        const urlParams = new URL(data.data.paymentUrl).searchParams;
        setRenewPaymentToken(urlParams.get('token') || '');
      } else if (renewGateway === 'PAYOS') {
        setRenewPaymentToken(data.data.orderId || '');
      } else {
        setRenewPaymentToken(data.data.paymentUrl.split('/').pop() || '');
      }
    },
    onError: (err: any) => {
      const errorMsg = err.response?.data?.message || 'Error creating renewal payment link.';
      notification.error({ message: 'Error', description: errorMsg, duration: 8 });
      setIsRenewQRModalVisible(false);
    }
  });

  const handleOpenRenew = (pass: MonthlyPass) => {
    setSelectedPassToRenew(pass);
    setRenewDuration(1);
    setRenewGateway('PAYPAL');
    setRenewDrawerVisible(true);
  };

  const handleConfirmRenew = (totalFee: number) => {
    setIsRenewQRModalVisible(true);
    setIsRenewSuccess(false);
    setRenewCountdown(300);
    setRenewPaymentUrl('');
    setRenewPaymentToken('');
    generateRenewLinkMutation.mutate(totalFee);
  };

  useEffect(() => {
    let timer: any;
    if (verifyCooldown > 0) {
      timer = setTimeout(() => setVerifyCooldown(c => c - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [verifyCooldown]);

  const handleManualVerifyRenew = () => {
    if (!renewPaymentToken || verifyCooldown > 0) return;
    setIsRenewVerifying(true);
    const captureUrl = renewGateway === 'PAYOS' ? '/finance/payments/payos/capture' : '/finance/payments/paypal/capture';
    
    axiosClient.post(captureUrl, { token: renewPaymentToken })
      .then(res => {
        if (res.data?.data?.status === 'COMPLETED') {
          axiosClient.post('/finance/payments/execute-action', { token: renewPaymentToken })
            .then(execRes => {
              setIsRenewSuccess(true);
              notification.success({ message: 'Success', description: 'Payment completed! Your ticket has been extended.', duration: 8 });
              queryClient.invalidateQueries({ queryKey: ['my-passes'] });
              setTimeout(() => {
                setIsRenewQRModalVisible(false);
                setRenewDrawerVisible(false);
              }, 2000);
            })
            .catch(err => {
              notification.error({ message: 'Payment Error', description: err.response?.data?.message || 'System Error: Payment refunded.', duration: 10 });
              setIsRenewSuccess(true); // Stop polling
              setIsRenewQRModalVisible(false);
              setRenewDrawerVisible(false);
            });
        } else {
           message.warning('Payment not yet completed on the gateway.');
        }
      })
      .catch(err => {
         if (err.response?.status === 400) {
           message.warning('Payment not yet received. Please try again later.');
         } else {
           notification.error({ message: 'Verification Error', description: 'System is busy or unable to verify.', duration: 8 });
         }
      })
      .finally(() => {
         setIsRenewVerifying(false);
         setVerifyCooldown(10);
      });
  };

  // Countdown timer for QR expiration
  useEffect(() => {
    let timer: any;
    if (isRenewQRModalVisible && !isRenewSuccess && renewPaymentToken) {
      if (renewCountdown > 0) {
        timer = setTimeout(() => {
          setRenewCountdown(c => c - 1);
        }, 1000);
      } else {
        message.warning('Payment QR code expired. Please try again.');
        setIsRenewQRModalVisible(false);
      }
    }
    return () => clearTimeout(timer);
  }, [renewCountdown, isRenewQRModalVisible, isRenewSuccess, renewPaymentToken]);

  // WebSocket listener for payment confirmation
  useEffect(() => {
    let client: any = null;
    let subscription: any = null;

    if (isRenewQRModalVisible && !isRenewSuccess && renewPaymentToken) {
      import('@stomp/stompjs').then(({ Client }) => {
        client = new Client({
          brokerURL: window.location.protocol === 'https:' ? `wss://${window.location.host}/ws-pbms` : `ws://${window.location.host}/ws-pbms`,
          reconnectDelay: 5000,
        });

        client.onConnect = () => {
          subscription = client.subscribe(`/topic/payments/${renewPaymentToken}`, (msg: any) => {
            const payload = JSON.parse(msg.body);
            if (payload.status === 'SUCCESS') {
              setIsRenewSuccess(true);
              message.success('Monthly pass renewed successfully!');
              queryClient.invalidateQueries({ queryKey: ['my-passes'] });
              setTimeout(() => {
                setIsRenewQRModalVisible(false);
                setRenewDrawerVisible(false);
              }, 2000);
            } else if (payload.status === 'FAILED') {
              notification.error({ message: 'Payment Error', description: payload.message || 'System Error: Payment refunded.', duration: 10 });
              setIsRenewSuccess(true);
              setIsRenewQRModalVisible(false);
              setRenewDrawerVisible(false);
            }
          });
        };

        client.activate();
      });
    }

    return () => {
      if (subscription) subscription.unsubscribe();
      if (client) client.deactivate();
    };
  }, [isRenewQRModalVisible, isRenewSuccess, renewPaymentToken, queryClient]);

  const renderActiveSession = () => {
    if (isLoading || isFetching) return <div className="p-12 text-center"><Spin size="large" /></div>;

    if (!session || session.found === false) {
      return (
        <div className="py-12 text-center text-gray-500 animate-fade-in">
          <CarOutlined className="text-5xl mb-4 opacity-40" />
          <Title level={4} className="text-gray-500">No active session found for this vehicle</Title>
        </div>
      );
    }

    const isBooking = session.status === 'BOOKED';
    const totalFee = session.totalFee || 0;
    const totalPenalty = (session.incidentDetails || []).reduce((sum: number, inc: any) => sum + (inc.fineAmount || 0), 0);

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-fade-in mt-6">
        <Card className="shadow-2xl border-0 rounded-[2rem] bg-gradient-to-br from-blue-50 to-indigo-50 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-4 bg-gradient-to-r from-blue-500 to-indigo-500"></div>
          <div className="flex flex-col items-center justify-center py-6">
            <CarOutlined className="text-5xl text-blue-500 mb-4" />
            <Title level={2} className="m-0 tracking-widest">{session.plate || session.plateNumber}</Title>
            <Tag color={isBooking ? 'orange' : 'blue'} className="mt-2 text-sm px-3 py-1">
              {isBooking ? 'RESERVED' : 'PARKING'}
            </Tag>

            <div className="mt-8 text-center bg-gray-50 p-6 rounded-2xl w-full">
              <ClockCircleOutlined className="text-2xl text-gray-400 mb-2" />
              <Text className="block text-gray-500 mb-1">{isBooking ? 'Reservation expires in:' : 'Parking duration:'}</Text>
              <div className="text-4xl font-mono font-bold text-gray-800 tracking-wider">
                {isBooking ? (
                  session.expiryTime ? dayjs(session.expiryTime).diff(simulatedDayjs(), 'minute') + ' minutes' : '---'
                ) : (
                  elapsedTime || "00:00:00"
                )}
              </div>
              {!isBooking && <Text className="block text-gray-400 mt-2 text-sm">In at: {dayjs(session.timeIn).format('HH:mm DD/MM/YYYY')}</Text>}
            </div>
          </div>
        </Card>

        <Card className="shadow-xl border-0 rounded-[2rem] bg-white/80 backdrop-blur-md flex flex-col h-full">
          <Title level={4} className="mb-6"><CreditCardOutlined className="mr-2" />Service Payment</Title>
          <List
            size="small"
            dataSource={[
              { label: 'Vehicle Type', value: session.vehicleType || 'Unknown' },
              { label: 'Gate In', value: session.gateInName || 'N/A' },
              { label: 'Parking Status', value: session.status || 'ACTIVE' },
            ]}
            renderItem={item => (
              <List.Item className="border-b border-gray-200 py-3">
                <Text type="secondary">{item.label}</Text>
                <Text strong>{item.value}</Text>
              </List.Item>
            )}
          />
          <div className="flex-1 flex flex-col bg-gray-50 rounded-xl border border-gray-200 p-4 mt-auto">
            {session.checkoutInfo ? (
              <FeeBreakdown
                durationMinutes={session.checkoutInfo.durationMinutes || 0}
                customerType={session.checkoutInfo.customerType || 'GUEST'}
                expectedFee={session.checkoutInfo.expectedFee || session.baseFee || 0}
                overtimeMinutes={session.checkoutInfo.overtimeMinutes || 0}
                overtimeFee={session.checkoutInfo.overtimeFee || session.overtimeFee || 0}
                penaltyFee={totalPenalty || 0}
                discountFee={session.checkoutInfo.discountFee || 0}
                totalFee={totalFee}
                isLightMode={true}
              />
            ) : (
              <FeeBreakdown
                durationMinutes={0}
                customerType={'GUEST'}
                expectedFee={session.baseFee || 0}
                overtimeMinutes={0}
                overtimeFee={session.overtimeFee || 0}
                penaltyFee={totalPenalty || 0}
                discountFee={0}
                totalFee={totalFee}
                isLightMode={true}
              />
            )}

            {session.incidentDetails && session.incidentDetails.length > 0 ? (
              <>
                <Text strong className="text-red-600 mb-2 block uppercase text-xs tracking-wider"><WarningOutlined className="mr-1" /> Penalty & Incidents</Text>
                <div className="flex flex-col gap-2">
                  {session.incidentDetails.map((inc: any, idx: number) => (
                    <div key={idx} className="bg-white border border-red-200 rounded p-3 text-sm shadow-sm">
                      <div className="flex justify-between items-start mb-1">
                        <Text strong className="text-red-700">{inc.type.replace('_', ' ')}</Text>
                        {inc.fineAmount > 0 && <Tag color="red">+{inc.fineAmount.toLocaleString()} ₫</Tag>}
                      </div>
                      <Text className="text-gray-600 text-xs block">{inc.description || 'Penalty applied due to violation.'}</Text>
                      <Button
                        type="link"
                        size="small"
                        className="p-0 mt-2 text-xs"
                        onClick={() => {
                          setSelectedIncident(inc);
                          setIsIncidentModalVisible(true);
                        }}
                      >
                        View details
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center text-center h-full text-gray-500 p-4">
                <CheckCircleOutlined className="text-3xl mb-2 text-green-500" />
                <Text>No violations found.</Text>
                <Text className="text-xs text-gray-400 mt-1">Please proceed to the exit gate to pay the parking fee.</Text>
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  };

  const renderWalkInTab = () => (
    <div className="animate-fade-in">
      <Card className="bg-blue-50/50 border-blue-100 mb-6 shadow-sm">
        <Title level={5} className="mb-4 text-blue-800">Look up Guest Vehicle (2FA Security)</Title>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            size="large"
            placeholder="Enter License Plate"
            prefix={<CarOutlined className="text-gray-400" />}
            value={plateNumberInput}
            onChange={(e) => setPlateNumberInput(normalizePlateNumber(e.target.value))}
          />
          <Select
            size="large"
            allowClear
            placeholder="Vehicle Type (Required)"
            value={vehicleTypeIdInput}
            onChange={setVehicleTypeIdInput}
            options={vehicleTypes.map((v: any) => ({ label: v.typeName, value: v.id }))}
          />
          <Input
            size="large"
            placeholder="Enter RFID Card"
            prefix={<IdcardOutlined className="text-gray-400" />}
            value={rfidInput}
            onChange={(e) => setRfidInput(e.target.value)}
          />
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="primary"
            icon={<SearchOutlined />}
            size="large"
            className="bg-blue-600"
            disabled={!plateNumberInput.trim() || !rfidInput.trim() || !vehicleTypeIdInput}
            onClick={handleSearchWalkIn}
          >
            Search
          </Button>
        </div>
      </Card>

      {hasSearched && renderActiveSession()}
    </div>
  );

  const renderBookingsTab = () => {
    const activeBookings = bookings.filter(b => b.status === 'PENDING' || b.status === 'ACTIVE');
    const historyBookings = bookings.filter(b => b.status !== 'PENDING' && b.status !== 'ACTIVE');

    const renderList = (data: any[]) => (
      data.length > 0 ? (
        <List
          grid={{ gutter: 16, column: 1 }}
          dataSource={data}
          renderItem={item => {
            const isExpired = item.status === 'PENDING' && dayjs(item.expectedEntryTime).add(item.expectedDurationMinutes || 120, 'minute').isBefore(simulatedDayjs());
            let displayStatus = isExpired ? 'COMPLETED_UNUSED' : item.status;

            if (item.status === 'CANCELLED') {
              if (item.refundStatus === 'PENDING') displayStatus = 'PENDING_REFUND';
              else if (item.refundStatus === 'REFUNDED') displayStatus = 'CANCELLED_REFUNDED';
              else if (item.refundStatus === 'REJECTED') displayStatus = 'REJECTED_REFUND';
              else if (item.refundAmount === 0 || !item.refundAmount) displayStatus = 'CANCELLED_NO_REFUND';
            }

            return (
              <List.Item>
                <Card className={`shadow-lg border-0 rounded-2xl relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-1 ${displayStatus === 'PENDING' ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-l-4 border-l-blue-500' : 'bg-white'}`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start">
                    <div className="w-full sm:w-auto">
                      <div className="flex items-center space-x-2 mb-2">
                        <Tag color={
                          displayStatus === 'PENDING' ? 'orange' :
                            displayStatus === 'ACTIVE' ? (dayjs(item.expectedEntryTime).add(item.expectedDurationMinutes || 0, 'minute').isBefore(simulatedDayjs()) ? 'red' : 'blue') :
                              displayStatus === 'COMPLETED' ? 'green' :
                                displayStatus === 'COMPLETED_UNUSED' ? 'default' :
                                  displayStatus === 'PENDING_REFUND' ? 'purple' :
                                    displayStatus === 'CANCELLED_REFUNDED' ? 'default' : 'red'
                        } className="m-0 font-bold text-[10px] md:text-xs">
                          {displayStatus === 'PENDING' ? 'PRE-BOOKING' :
                            displayStatus === 'ACTIVE' ? (dayjs(item.expectedEntryTime).add(item.expectedDurationMinutes || 0, 'minute').isBefore(simulatedDayjs()) ? 'OVERDUE (IN-PARKING)' : 'IN-PARKING') :
                              displayStatus === 'COMPLETED' ? 'COMPLETED' :
                                displayStatus === 'COMPLETED_UNUSED' ? 'NO SHOW' :
                                  displayStatus === 'PENDING_REFUND' ? 'PENDING REFUND' :
                                    displayStatus === 'CANCELLED_REFUNDED' ? 'CANCELLED & REFUNDED' :
                                      displayStatus === 'REJECTED_REFUND' ? 'REFUND REJECTED' :
                                        displayStatus === 'CANCELLED_NO_REFUND' ? 'CANCELLED (NO REFUND)' : 'CANCELLED'}
                        </Tag>
                        <Text type="secondary" className="text-[10px] md:text-xs">ID: {item.id}</Text>
                      </div>
                      <Title level={4} className={`m-0 tracking-widest ${displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400 line-through' : ''}`}>
                        {item.plateNumber} {item.vehicleType ? `- ${item.vehicleType}` : ''}
                      </Title>
                      <div className="mt-4 space-y-1">
                        <Text className={`block ${displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400' : 'text-gray-500'}`}>Expected arrival: <Text strong className={displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400' : 'text-gray-800'}>{dayjs(item.expectedEntryTime).format('HH:mm DD/MM/YYYY')}</Text></Text>
                        <Text className={`block ${displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400' : 'text-gray-500'}`}>Expected exit: <Text strong className={displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400' : 'text-gray-800'}>{dayjs(item.expectedEntryTime).add(item.expectedDurationMinutes || 0, 'minute').format('HH:mm DD/MM/YYYY')}</Text></Text>
                        <Text className={`block ${displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400' : 'text-gray-500'}`}>Reserved location: <Text strong className={displayStatus !== 'PENDING' && displayStatus !== 'ACTIVE' ? 'text-gray-400' : 'text-gray-800'}>{item.zoneName || item.slotName}</Text></Text>
                      </div>
                    </div>
                    <div className="flex flex-col items-start sm:items-end mt-4 sm:mt-0 w-full sm:w-auto">
                      {displayStatus === 'PENDING' && (
                        <div className="flex flex-col sm:flex-row gap-2 mb-2 w-full sm:w-auto">
                          {dayjs(item.expectedEntryTime).add(item.expectedDurationMinutes || 0, 'minute').isAfter(simulatedDayjs()) && (
                            <Button
                              type="primary"
                              className="bg-blue-600 w-full sm:w-auto"
                              icon={<EditOutlined />}
                              onClick={() => {
                                setPlateToEdit({ type: 'reservation', id: item.id, currentPlate: item.plateNumber });
                                setNewPlate(item.plateNumber);
                                setIsEditPlateVisible(true);
                              }}
                            >
                              Edit Plate
                            </Button>
                          )}
                          <Button
                            danger
                            className="w-full sm:w-auto"
                            icon={<CloseCircleOutlined />}
                            onClick={() => {
                              setSelectedBookingToCancel(item);
                              setCancelDrawerVisible(true);
                            }}
                          >
                            Cancel Reservation
                          </Button>
                        </div>
                      )}
                      {displayStatus === 'ACTIVE' && (
                        <Button
                          type="default"
                          className="w-full sm:w-auto border-blue-400 text-blue-600 hover:bg-blue-50"
                          icon={<SearchOutlined />}
                          onClick={() => handleViewParkingStatus(item.plateNumber, item.vehicleTypeId, item.rfid)}
                        >
                          Search
                        </Button>
                      )}
                      {displayStatus !== 'ACTIVE' && displayStatus !== 'PENDING' && (
                        <Button
                          type="default"
                          className="w-full sm:w-auto border-gray-400 text-gray-600 hover:bg-gray-50 mt-2 sm:mt-0"
                          icon={<HistoryOutlined />}
                          onClick={() => {
                            setSelectedHistoryPlate(item.plateNumber);
                            setIsHistoryDrawerVisible(true);
                          }}
                        >
                          View History
                        </Button>
                      )}
                      {displayStatus === 'PENDING_REFUND' && (
                        <Text type="secondary" className="text-sm italic mt-2">Expected processing: 1-2 days</Text>
                      )}
                      {displayStatus === 'REJECTED_REFUND' && (
                        <div className="mt-2 text-right">
                          <Text type="danger" className="text-xs block mb-1 font-semibold">Reason: {item.rejectReason || 'Invalid bank info'}</Text>
                          <Button 
                            danger 
                            size="small" 
                            onClick={() => {
                              setSelectedBookingToCancel(item);
                              setIsResubmitRefund(true);
                              setCancelDrawerVisible(true);
                            }}
                          >
                            Resubmit Refund Request
                          </Button>
                        </div>
                      )}
                      {displayStatus === 'CANCELLED_REFUNDED' && item.refundProofUrl && (
                        <div className="mt-2 text-right">
                          <a href={getImageUrl(item.refundProofUrl)} target="_blank" rel="noreferrer" className="text-blue-600 underline text-sm font-semibold flex items-center justify-end">
                             <CheckCircleOutlined className="mr-1" /> View Refund Proof
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </List.Item>
            );
          }}
        />
      ) : (
        <div className="py-16 text-center">
          <Empty description={<span className="text-gray-500 font-medium text-lg">No reservations found in this category</span>} />
          <Button type="primary" className="mt-4 bg-blue-600" onClick={() => navigate('/customer/pre-booking')}>
            Create Reservation Now
          </Button>
        </div>
      )
    );

    return (
      <div className="animate-fade-in">
        <Tabs
          defaultActiveKey="active"
          items={[
            {
              key: 'active',
              label: 'Processing / In Lot',
              children: renderList(activeBookings),
            },
            {
              key: 'history',
              label: 'History / Completed',
              children: renderList(historyBookings),
            }
          ]}
        />
      </div>
    );
  };

  const renderMonthlyPassTab = () => {
    const activePasses = monthlyPasses.filter(p => !p.status.includes('EXPIRED') || p.inParkingLot)
      .sort((a, b) => {
        const idA = parseInt(String(a.id).replace('MP-', ''), 10) || 0;
        const idB = parseInt(String(b.id).replace('MP-', ''), 10) || 0;
        return idB - idA;
      });
    const inactivePasses = monthlyPasses.filter(p => p.status === 'EXPIRED' && !p.inParkingLot)
      .sort((a, b) => {
        const idA = parseInt(String(a.id).replace('MP-', ''), 10) || 0;
        const idB = parseInt(String(b.id).replace('MP-', ''), 10) || 0;
        return idB - idA;
      });

    const renderList = (passes: MonthlyPass[]) => (
      passes.length > 0 ? (
        <List
          grid={{ gutter: 16, column: 1 }}
          dataSource={passes}
          renderItem={item => (
            <List.Item>
              <Card className="shadow-sm border border-green-200 bg-green-50/30 rounded-xl relative overflow-hidden">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div className="flex items-center space-x-4 w-full">
                    <div className="bg-green-100 p-3 md:p-4 rounded-full shrink-0">
                      <IdcardOutlined className="text-2xl md:text-3xl text-green-600" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2 mb-1">
                        <Title level={4} className="m-0 tracking-widest">{item.plate}</Title>
                        <Tag color={item.status === 'ACTIVE' ? 'green' : item.status === 'EXPIRING_SOON' ? 'orange' : 'red'} className="m-0 font-bold">{item.status}</Tag>
                        {item.inParkingLot && (
                          <Tag color={item.status === 'EXPIRED' ? 'red' : 'orange'} className="m-0 animate-pulse font-bold border">
                            IN PARKING LOT
                          </Tag>
                        )}
                      </div>
                      <Text type="secondary">Card ID: {item.id} • {item.type}</Text>
                      <div className="mt-1">
                        <Text className="text-gray-600">Expiry Date: <Text strong className={dayjs(item.endDate).isBefore(simulatedDayjs().add(7, 'day')) ? 'text-red-500' : 'text-gray-800'}>{dayjs(item.endDate).format('DD/MM/YYYY')}</Text></Text>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto mt-4 sm:mt-0">
                    {!item.hasBeenUsed && (
                      <Button
                        type="default"
                        className="w-full sm:w-auto"
                        icon={<EditOutlined />}
                        onClick={() => {
                          setPlateToEdit({ type: 'monthly', id: item.id, currentPlate: item.plate });
                          setNewPlate(item.plate);
                          setIsEditPlateVisible(true);
                        }}
                      >
                        Edit Plate
                      </Button>
                    )}
                    {item.inParkingLot && (
                      <Button
                        type="default"
                        className="border-blue-400 text-blue-600 hover:bg-blue-50 w-full sm:w-auto"
                        icon={<SearchOutlined />}
                        onClick={() => handleViewParkingStatus(item.plate, item.vehicleTypeId, item.rfid)}
                      >
                        Search
                      </Button>
                    )}
                    <Button
                      type="default"
                      className="w-full sm:w-auto"
                      icon={<HistoryOutlined />}
                      onClick={() => {
                        setSelectedHistoryPlate(item.plate);
                        setIsHistoryDrawerVisible(true);
                      }}
                    >
                      History
                    </Button>
                    <Button
                      type="primary"
                      className="bg-green-600 w-full sm:w-auto"
                      onClick={() => handleOpenRenew(item)}
                      disabled={item.inParkingLot}
                    >
                      Renew
                    </Button>
                  </div>
                </div>
              </Card>
            </List.Item>
          )}
        />
      ) : (
        <div className="py-16 text-center">
          <Empty description={<span className="text-gray-500 font-medium text-lg">You have no monthly passes in this tab</span>} />
          <Button type="primary" className="mt-4 bg-blue-600" onClick={() => navigate('/customer/monthly-pass')}>
            Register New Monthly Pass
          </Button>
        </div>
      )
    );

    return (
      <div className="animate-fade-in">
        <Tabs
          defaultActiveKey="1"
          items={[
            {
              key: '1',
              label: `Active Passes & Vehicles In Lot (${activePasses.length})`,
              children: renderList(activePasses),
            },
            {
              key: '2',
              label: `Expired Passes (${inactivePasses.length})`,
              children: renderList(inactivePasses),
            }
          ]}
        />
      </div>
    );
  };




  const editPlateMutation = useMutation({
    mutationFn: async (payload: { type: 'reservation' | 'monthly', id: string, plate: string }) => {
      if (payload.type === 'reservation') {
        await axiosClient.put(`/customer/reservations/${payload.id}/plate`, { plate: payload.plate });
      } else {
        await axiosClient.put(`/operation/monthly-tickets/${payload.id.replace('MP-', '')}/plate`, { plate: payload.plate });
      }
    },
    onSuccess: (_, variables) => {
      message.success('Plate updated successfully');
      setIsEditPlateVisible(false);
      if (variables.type === 'reservation') {
        queryClient.invalidateQueries({ queryKey: ['my-bookings'] });

      } else {
        queryClient.invalidateQueries({ queryKey: ['my-passes'] });
      }
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'Failed to update plate');
    }
  });

  const handleEditPlate = () => {
    if (!newPlate || newPlate.trim() === '') {
      message.error('Please enter a new plate number');
      return;
    }
    if (plateToEdit) {
      editPlateMutation.mutate({
        type: plateToEdit.type,
        id: plateToEdit.id,
        plate: newPlate.trim().toUpperCase()
      });
    }
  };

  return (
    <>
      <style>{`
        @media (max-width: 768px) {
          .mobile-wrap-tabs .ant-tabs-nav-list {
            flex-wrap: wrap !important;
            justify-content: center !important;
            width: 100% !important;
          }
          .mobile-wrap-tabs .ant-tabs-tab {
            flex: 1 1 40% !important;
            justify-content: center !important;
            margin: 4px !important;
            padding: 8px 4px !important;
          }
          .mobile-wrap-tabs .ant-tabs-ink-bar {
            display: none !important;
          }
        }
      `}</style>
      <div className="min-h-screen bg-gray-50 p-4 md:p-6 font-sans">
        <div className="max-w-5xl mx-auto space-y-4 md:space-y-6">
          <div className="mb-8">
            <Title level={2} className="m-0 text-gray-800">Service Management</Title>
            <Text type="secondary">Check your card, monthly pass, and reservation info</Text>
          </div>

          <div className="bg-white p-4 md:p-6 rounded-2xl shadow-sm border border-gray-100">
            <Tabs
              className="mobile-wrap-tabs"
              activeKey={activeTab}
              onChange={(key) => {
                setActiveTab(key);
                navigate(`/customer/my-parking?tab=${key === '2' ? 'booking' : key === '3' ? 'monthly' : 'walkin'}`, { replace: true });
              }}
              size="large"
              items={[
                {
                  key: '1',
                  label: 'Active Parking (Guest)',
                  children: renderWalkInTab(),
                },
                {
                  key: '2',
                  label: 'Reservation Management',
                  children: renderBookingsTab(),
                },
                {
                  key: '3',
                  label: 'Monthly Pass Management',
                  children: renderMonthlyPassTab(),
                }
              ]}
            />
          </div>
        </div>

        <Drawer
          title={<span className="text-red-600 font-bold">{isResubmitRefund ? 'RESUBMIT REFUND REQUEST' : 'CANCEL RESERVATION & REFUND'}</span>}
          width={450}
          onClose={() => { setCancelDrawerVisible(false); setIsResubmitRefund(false); }}
          open={cancelDrawerVisible}
          extra={
            <Space>
              <Button onClick={() => { setCancelDrawerVisible(false); setIsResubmitRefund(false); }}>Keep</Button>
              <Button
                type="primary"
                danger
                onClick={handleCancelBooking}
                disabled={Boolean(selectedBookingToCancel && calculateRefund(selectedBookingToCancel).refund > 0 && (!bankName || !accountNumber || !accountName))}
              >
                {isResubmitRefund ? 'Submit Refund Info' : 'Confirm Cancel'}
              </Button>
            </Space>
          }
        >
          {selectedBookingToCancel && (() => {
            const { amount, refund, penalty, percent } = calculateRefund(selectedBookingToCancel);
            return (
              <div className="space-y-6">
                <Alert
                  message={<span className="font-bold text-red-700">Reservation Refund Policy</span>}
                  description={
                    <ul className="list-disc pl-4 mt-2 text-sm text-red-600">
                      {(() => {
                        return (
                          <>
                            <li>Cancel {configs.earlyMins}+ mins before: {configs.refundEarly * 100}% Refund</li>
                            <li>Cancel within {configs.earlyMins} mins before: {configs.refundLate * 100}% Refund</li>
                            <li>Cancel after arrival time: No Refund (0%)</li>
                          </>
                        );
                      })()}
                    </ul>
                  }
                  type="error"
                  className="bg-red-50 border border-red-200"
                />

                <Card size="small" title="Amount Details" className="bg-slate-50 border-slate-200">
                  <div className="flex justify-between mb-2">
                    <Text className="text-slate-500">Expected arrival:</Text>
                    <Text strong>{dayjs(selectedBookingToCancel.expectedEntryTime).format('HH:mm DD/MM/YYYY')}</Text>
                  </div>
                  <div className="flex justify-between mb-2 border-b border-dashed border-slate-300 pb-2">
                    <Text className="text-slate-500">Initial deposit:</Text>
                    <Text strong>{amount.toLocaleString()} ₫</Text>
                  </div>
                  <div className="flex justify-between mb-2">
                    <Text className="text-red-500">Cancellation fee ({100 - percent}%):</Text>
                    <Text strong className="text-red-600">- {penalty.toLocaleString()} ₫</Text>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-slate-300">
                    <Text strong className="text-green-600">REFUND AMOUNT:</Text>
                    <Text strong className="text-xl text-green-600">{refund.toLocaleString()} ₫</Text>
                  </div>
                </Card>

                {refund > 0 && (
                  <div className="space-y-4">
                    <Title level={5}>Enter refund information</Title>
                    <Alert
                      message="Important Note"
                      description="Please enter exact Bank Account info. Refund processing takes 1-2 working days."
                      type="warning"
                      showIcon
                      className="text-xs"
                    />

                    <Form layout="vertical">
                      <Form.Item label="Bank" required>
                        <Select
                          placeholder="Select Bank"
                          value={bankName}
                          onChange={setBankName}
                          options={[
                            { value: 'VCB', label: 'Vietcombank' },
                            { value: 'TCB', label: 'Techcombank' },
                            { value: 'MB', label: 'MBBank' },
                            { value: 'VTB', label: 'VietinBank' },
                            { value: 'ACB', label: 'ACB' }
                          ]}
                        />
                      </Form.Item>
                      <Form.Item label="Account Number" required>
                        <Input
                          placeholder="Enter account number"
                          value={accountNumber}
                          onChange={(e) => setAccountNumber(e.target.value)}
                        />
                      </Form.Item>
                      <Form.Item label="Account Holder Name" required>
                        <Input
                          placeholder="Enter uppercase name without accents"
                          value={accountName}
                          onChange={(e) => setAccountName(e.target.value.toUpperCase())}
                        />
                      </Form.Item>
                    </Form>
                  </div>
                )}

                {refund === 0 && (
                  <Alert
                    message="Not eligible for refund"
                    description="Due to time limit, your deposit is not refundable according to policy."
                    type="info"
                    showIcon
                  />
                )}
              </div>
            );
          })()}
        </Drawer>

        <Drawer
          title={<span className="text-blue-600 font-bold"><IdcardOutlined className="mr-2" />RENEW MONTHLY PASS</span>}
          width={500}
          onClose={() => setRenewDrawerVisible(false)}
          open={renewDrawerVisible}
          className="bg-slate-50"
        >
          {selectedPassToRenew && (() => {
            const policy = pricingPolicies.find(p => p.vehicleTypeId === selectedPassToRenew.vehicleTypeId);
            const pricePerMonth = policy ? policy.monthlyRate : 0;
            const packageConfig = PACKAGES.find(p => p.id === renewDuration);
            const baseFee = pricePerMonth * renewDuration;
            const discountAmount = baseFee * (packageConfig?.discount || 0);
            const totalFee = baseFee - discountAmount;
            const newExpiry = dayjs(selectedPassToRenew.endDate).add(renewDuration, 'month').format('DD/MM/YYYY');

            return (
              <div className="space-y-6">
                <Card size="small" className="shadow-sm border-slate-200">
                  <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-3">
                    <Text className="text-slate-500">Card ID:</Text>
                    <Text strong className="text-slate-800">{selectedPassToRenew.id}</Text>
                  </div>
                  <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-3">
                    <Text className="text-slate-500">License Plate:</Text>
                    <Text strong className="text-slate-800 tracking-widest">{selectedPassToRenew.plate}</Text>
                  </div>
                  <div className="flex justify-between items-center mb-3 border-b border-slate-100 pb-3">
                    <Text className="text-slate-500">Vehicle Type:</Text>
                    <Text strong className="text-slate-800">{selectedPassToRenew.type}</Text>
                  </div>
                  <div className="flex justify-between items-center">
                    <Text className="text-slate-500">Current Expiry:</Text>
                    <Text strong className={dayjs(selectedPassToRenew.endDate).isBefore(simulatedDayjs().add(7, 'day')) ? 'text-red-500' : 'text-slate-800'}>{dayjs(selectedPassToRenew.endDate).format('DD/MM/YYYY')}</Text>
                  </div>
                </Card>

                <div>
                  <Text className="block font-bold mb-3 text-slate-700">Select renewal package:</Text>
                  <div className="grid grid-cols-2 gap-3">
                    {PACKAGES.map(p => (
                      <div
                        key={p.id}
                        onClick={() => setRenewDuration(p.id)}
                        className={`relative cursor-pointer p-3 rounded-xl border-2 transition-all flex flex-col items-center justify-center ${renewDuration === p.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white hover:border-blue-300'}`}
                      >
                        {p.discount > 0 && (
                          <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                            -{p.discount * 100}%
                          </div>
                        )}
                        <span className="font-bold">{p.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <Card className="shadow-sm border-slate-200 bg-white">
                  <Space direction="vertical" className="w-full">
                    <div className="flex justify-between">
                      <Text className="text-slate-500">New Expiry:</Text>
                      <Text strong className="text-green-600">{newExpiry}</Text>
                    </div>
                    <Divider className="my-2" />
                    <div className="flex justify-between">
                      <Text className="text-slate-500">Base Fee:</Text>
                      <Text strong>{baseFee.toLocaleString()} ₫</Text>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between">
                        <Text className="text-green-500">Discount:</Text>
                        <Text strong className="text-green-600">- {discountAmount.toLocaleString()} ₫</Text>
                      </div>
                    )}
                    <div className="bg-slate-50 p-3 rounded-lg mt-2 flex justify-between items-center border border-slate-200">
                      <Text strong className="text-slate-600">TOTAL PAYMENT:</Text>
                      <Text className="text-xl font-black text-blue-600">{totalFee.toLocaleString()} ₫</Text>
                    </div>
                  </Space>
                </Card>

                <div>
                  <Text className="block font-bold mb-3 text-slate-700">Payment Method:</Text>
                  <Radio.Group
                    onChange={e => setRenewGateway(e.target.value)}
                    value={renewGateway}
                    className="w-full flex flex-col space-y-3"
                  >
                    {GATEWAYS.map(gw => (
                      <Radio.Button
                        key={gw.id}
                        value={gw.id}
                        className={`h-14 flex items-center px-4 rounded-xl border-2 transition-all ${renewGateway === gw.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}
                      >
                        <div className="flex items-center space-x-3 w-full">
                          <img src={gw.icon} alt={gw.name} className="h-6 object-contain" />
                          <span className="font-bold text-slate-700">{gw.name}</span>
                        </div>
                      </Radio.Button>
                    ))}
                  </Radio.Group>
                </div>

                <Button
                  type="primary"
                  size="large"
                  className="w-full h-14 text-lg font-bold rounded-xl shadow-lg bg-blue-600 hover:bg-blue-500 animate-pulse mt-4"
                  onClick={() => handleConfirmRenew(totalFee)}
                >
                  Confirm Renewal
                </Button>
              </div>
            );
          })()}
        </Drawer>

        <Modal
          open={isRenewQRModalVisible}
          footer={null}
          closable={!isRenewSuccess}
          onCancel={() => !isRenewSuccess && setIsRenewQRModalVisible(false)}
          centered
          maskClosable={false}
          width={400}
        >
          <div className="text-center py-6">
            {!isRenewSuccess ? (
              <>
                <Title level={4} className="mb-2 text-slate-800">Scan QR to pay</Title>
                <Text className="block mb-6 text-slate-500">Open Banking app or E-wallet</Text>

                <div className="relative inline-block mb-6">
                  <div className="bg-white p-4 border-2 border-dashed border-slate-300 rounded-2xl shadow-sm relative z-10 flex justify-center items-center h-[240px] w-[240px]">
                    {renewPaymentUrl ? <QRCode value={renewGateway === 'PAYOS' && renewPaymentQrCode ? renewPaymentQrCode : renewPaymentUrl} size={200} /> : <Spin size="large" />}
                  </div>
                  <style>
                    {`
                    @keyframes scan {
                      0% { transform: translateY(0); }
                      50% { transform: translateY(220px); }
                      100% { transform: translateY(0); }
                    }
                  `}
                  </style>
                  {renewPaymentUrl && <div className="absolute top-2 left-2 w-[calc(100%-16px)] h-1 bg-blue-500 shadow-[0_0_15px_#3b82f6] z-20" style={{ animation: 'scan 2s ease-in-out infinite' }}></div>}
                </div>

                <Text className="block text-slate-500 mb-6 font-mono bg-slate-100 py-2 rounded-lg break-all px-2 text-xs">
                  {renewGateway === 'PAYOS' ? (
                    <a href={renewPaymentUrl} target="_blank" rel="noreferrer">Open PayOS Checkout</a>
                  ) : (
                    <a href={renewPaymentUrl} target="_blank" rel="noreferrer">Open PayPal Checkout</a>
                  )}
                </Text>

                {renewCountdown > 0 ? (
                  <div className="flex items-center justify-center space-x-2 text-slate-600 mb-2">
                    <Spin size="small" />
                    <Text>Waiting for payment ({renewCountdown}s)...</Text>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2 text-orange-600 mb-2 bg-orange-50 p-2 rounded-lg border border-orange-200">
                    <WarningOutlined />
                    <Text className="text-orange-600 font-semibold text-center">Auto-verification timeout. Please confirm manually if you have paid.</Text>
                  </div>
                )}

                {renewPaymentUrl && renewPaymentToken && (
                    <div className="mb-4 text-center">
                      <Button 
                        type="link" 
                        onClick={handleManualVerifyRenew} 
                        loading={isRenewVerifying}
                        disabled={verifyCooldown > 0}
                        className={`font-semibold ${verifyCooldown > 0 ? 'text-slate-400' : 'text-orange-600'}`}
                      >
                        {verifyCooldown > 0 ? `Please wait ${verifyCooldown}s to verify again` : 'I have paid but the screen hasn\'t updated. Verify now!'}
                      </Button>
                    </div>
                )}
              </>
            ) : (
              <div className="animate-fade-in py-8">
                <CheckCircleOutlined className="text-[80px] text-green-500 mb-6" />
                <Title level={3} className="text-slate-800">Renewal successful!</Title>
                <Text className="block text-slate-500 mb-2">Monthly pass expiry date has been updated.</Text>
              </div>
            )}
          </div>
        </Modal>

        <Modal
          title={<span className="text-red-600 font-bold"><WarningOutlined className="mr-2" /> Incident Details</span>}
          open={isIncidentModalVisible}
          onCancel={() => setIsIncidentModalVisible(false)}
          footer={[
            <Button key="close" type="primary" onClick={() => setIsIncidentModalVisible(false)}>Close</Button>
          ]}
        >
          {selectedIncident && (
            <div className="py-4">
              <Title level={5} className="mb-2 text-red-700">{selectedIncident.type.replace('_', ' ')}</Title>
              <Text className="block mb-4 text-slate-600">{selectedIncident.description || 'No additional description provided.'}</Text>

              {selectedIncident.fineAmount > 0 && (
                <div className="mb-4">
                  <Text strong>Penalty Amount: </Text>
                  <Tag color="red">{selectedIncident.fineAmount.toLocaleString()} ₫</Tag>
                </div>
              )}

              {selectedIncident.urls && selectedIncident.urls.length > 0 && (
                <div>
                  <Text strong className="block mb-2">Evidence Images:</Text>
                  <div className="flex gap-4 overflow-x-auto p-2">
                    {(selectedIncident.urls || []).map((url: string, uidx: number) => (
                      <img key={uidx} src={getImageUrl(url)} alt="Incident Evidence" className="h-32 object-cover rounded-md border border-slate-200 shadow-sm" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Modal>
      </div>

      <Modal
        title={<span className="text-blue-600 font-bold">Edit License Plate</span>}
        open={isEditPlateVisible}
        onCancel={() => setIsEditPlateVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setIsEditPlateVisible(false)}>Cancel</Button>,
          <Button key="save" type="primary" className="bg-blue-600" loading={editPlateMutation.isPending} onClick={handleEditPlate}>Save Plate</Button>
        ]}
      >
        <div className="py-4">
          <Text className="block mb-2 text-slate-600">Please enter the new license plate number:</Text>
          <Input
            size="large"
            placeholder="e.g. 29A-123.45"
            value={newPlate}
            onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
            className="font-bold tracking-widest text-lg"
          />
        </div>
      </Modal>

      <Drawer
        title={<span className="text-blue-600 font-bold"><HistoryOutlined className="mr-2" />History for Plate {selectedHistoryPlate}</span>}
        width={520}
        onClose={() => setIsHistoryDrawerVisible(false)}
        open={isHistoryDrawerVisible}
        className="bg-slate-50"
      >
        <div className="animate-fade-in">
          {isHistoryLoading ? (
            <div className="py-16 text-center"><Spin size="large" /></div>
          ) : historyRecords.length > 0 ? (
            <Timeline
              className="mt-4"
              items={historyRecords.map(record => {
                const isReservation = record.recordType === 'RESERVATION';
                const statusColorMap: Record<string, string> = {
                  PENDING: 'blue', ACTIVE: 'processing', COMPLETED: 'green',
                  CANCELLED: 'red', COMPLETED_UNUSED: 'orange',
                };
                const dotColor = isReservation
                  ? (record.status === 'COMPLETED_UNUSED' || record.status === 'CANCELLED' ? 'red' : 'blue')
                  : (record.fee > 0 ? 'green' : 'gray');

                return {
                  color: dotColor,
                  dot: isReservation ? (
                    record.status === 'COMPLETED_UNUSED' ? <WarningOutlined style={{ color: '#ef4444' }} /> :
                      record.status === 'CANCELLED' ? <CloseCircleOutlined style={{ color: '#ef4444' }} /> :
                        <CheckCircleOutlined style={{ color: '#3b82f6' }} />
                  ) : <CarOutlined style={{ color: record.fee > 0 ? '#22c55e' : '#94a3b8' }} />,
                  children: isReservation ? (
                    // ---- RESERVATION CARD ----
                    <div className={`bg-white p-4 rounded-xl border shadow-sm mb-4 ${(record.status === 'COMPLETED_UNUSED') ? 'border-red-200 bg-red-50' :
                        record.status === 'CANCELLED' ? 'border-orange-200 bg-orange-50' : 'border-blue-100'
                      }`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <Title level={5} className="m-0 tracking-widest text-slate-800">{record.plateNumber}</Title>
                          <Tag color={statusColorMap[record.status || ''] || 'default'} className="mt-1">
                            {record.type}
                          </Tag>
                        </div>
                        <div className="text-right">
                          <Text type="secondary" className="block text-xs">Booking Fee</Text>
                          <Text strong className="text-blue-600 text-base">{(record.reservationFee || 0).toLocaleString()} VND</Text>
                        </div>
                      </div>
                      <Divider className="my-2" />
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <Text type="secondary" className="block mb-1">📅 Entry Time:</Text>
                          <Text strong className="text-slate-700">{record.timeIn}</Text>
                        </div>
                        <div>
                          <Text type="secondary" className="block mb-1">📅 Exit Time:</Text>
                          <Text strong className="text-slate-700">{record.expectedEntryTime && record.expectedDurationMinutes ? dayjs(record.expectedEntryTime).add(record.expectedDurationMinutes, 'minute').format('HH:mm DD/MM/YYYY') : '---'}</Text>
                        </div>
                        <div>
                          <Text type="secondary" className="block mb-1">🅿️ Zone:</Text>
                          <Text strong className="text-slate-700">{record.zoneName || 'N/A'}</Text>
                        </div>
                        <div>
                          <Text type="secondary" className="block mb-1">⏱ Expected Duration:</Text>
                          <Text strong className="text-slate-700">{record.expectedDurationMinutes ? `${record.expectedDurationMinutes} mins` : '---'}</Text>
                        </div>
                        <div>
                          <Text type="secondary" className="block mb-1">💸 Refund:</Text>
                          <Text strong className={(record.refundAmount || 0) > 0 ? 'text-green-600' : 'text-slate-400'}>
                            {(record.refundAmount || 0) > 0 ? `+${(record.refundAmount || 0).toLocaleString()} VND` : 'None'}
                          </Text>
                          {record.refundProofUrl && (
                            <div className="mt-1">
                              <a href={getImageUrl(record.refundProofUrl)} target="_blank" rel="noreferrer" className="text-blue-600 underline text-xs font-semibold">
                                View Refund Proof
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                      {(record.forfeitedAmount || 0) > 0 && (
                        <div className="mt-3 pt-2 border-t border-red-200">
                          <div className="flex justify-between items-center">
                            <Text className="text-red-600 font-semibold">⚠️ Retained Fee:</Text>
                            <Text strong className="text-red-600 text-base">{(record.forfeitedAmount || 0).toLocaleString()} VND</Text>
                          </div>
                          <Text type="secondary" className="text-xs block mt-1">
                            {record.status === 'COMPLETED_UNUSED' ? 'No-show during booking period, booking fee is non-refundable.' : 'Late cancellation, booking fee is partially retained.'}
                          </Text>
                        </div>
                      )}
                    </div>
                  ) : (
                    // ---- PARKING SESSION CARD ----
                    <div className="bg-white p-4 rounded-xl border border-slate-200 mb-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <Title level={5} className="m-0 tracking-widest text-slate-800">{record.plateNumber}</Title>
                          <Tag color="green" className="mt-1">{record.type}</Tag>
                        </div>
                        <div className="text-right">
                          <Text strong className="text-blue-600 text-lg">{record.fee === 0 ? 'Free' : `${record.fee.toLocaleString()} VND`}</Text>
                        </div>
                      </div>
                      <Divider className="my-2" />
                      <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                        <div>
                          <Text type="secondary" className="block mb-1">Time In:</Text>
                          <Text strong className="text-slate-700"><ClockCircleOutlined className="mr-1 text-slate-400" /> {record.timeIn}</Text>
                        </div>
                        <div>
                          <Text type="secondary" className="block mb-1">Time Out:</Text>
                          <Text strong className="text-slate-700"><ClockCircleOutlined className="mr-1 text-slate-400" /> {record.timeOut}</Text>
                        </div>
                      </div>
                      {record.incidentDetails && record.incidentDetails.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-red-100">
                          {record.incidentDetails.map((inc: any, idx: number) => (
                            <div key={idx} className="mb-3">
                              <Tag color="red" className="mb-2">⚠️ Violation Warning ({inc.type})</Tag>
                              <div className="flex gap-2 overflow-x-auto">
                                {(inc.urls || []).map((url: string, uidx: number) => (
                                  <img key={uidx} src={getImageUrl(url)} alt="Violation" className="h-20 rounded-md border border-red-200" />
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                };
              })}
            />
          ) : (
            <div className="py-12 text-center">
              <Empty description={<span className="text-slate-500">No history found for this vehicle</span>} />
            </div>
          )}
        </div>
      </Drawer>
    </>
  );
};
