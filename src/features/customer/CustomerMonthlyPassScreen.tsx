/**
 * @Author: Thái Tân Phú
 * @Date: 2026-07-06
 * @Description: Monthly Pass registration screen. Allows customers to buy long-term parking tickets, calculates discounts, and integrates with payment gateways.
 * @Dependencies: 
 * - React Query (pricing, vehicle-types, payments)
 * - AxiosClient
 * - Zustand (useAuthStore)
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Typography, Space, DatePicker, message, Spin, Input, Modal, QRCode } from 'antd';
import {
    IdcardOutlined, CarOutlined, CreditCardOutlined,
    CheckCircleOutlined, UserOutlined, CalendarOutlined, NumberOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useQuery, useMutation } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl as getGlobalImageUrl } from '../../core/utils/imageHelper';
import { simulatedDayjs } from '../../core/utils/timeProvider';

const { Title, Text } = Typography;

// Configuration for Monthly Packages (Discounts applied)
const PACKAGES = [
    { id: 1, name: '1 month', discount: 0 },
    { id: 3, name: '3 Months', discount: 0.05 }, // 5% off
    { id: 6, name: '6 Months', discount: 0.10 }, // 10% off
    { id: 12, name: '12 Months', discount: 0.15 }, // 15% off
];

// Configuration for Payment Gateways
const GATEWAYS = [
    { id: 'PAYPAL', name: 'PayPal Sandbox', icon: 'https://www.paypalobjects.com/webstatic/mktg/logo/pp_cc_mark_111x69.jpg' },
    { id: 'PAYOS', name: 'PayOS (VietQR)', icon: getGlobalImageUrl('/uploads/PayOS_Icon.webp') }
];

export const CustomerMonthlyPassScreen = () => {
    const navigate = useNavigate();

    // 1. Get user info from global store (Zustand)
    const email = useAuthStore(state => state.email);
    const name = useAuthStore(state => state.name);

    // 2. Form States
    const [fullName, setFullName] = useState<string>('');
    const [selectedVehicle, setSelectedVehicle] = useState<number | null>(null);
    const [plateNumber, setPlateNumber] = useState<string>('');
    const [selectedDuration, setSelectedDuration] = useState<number>(1);
    const [startDate, setStartDate] = useState<Dayjs>(simulatedDayjs());

    // 3. Payment & Modal States
    const [selectedGateway, setSelectedGateway] = useState<string>('PAYPAL');
    const [isQRModalVisible, setIsQRModalVisible] = useState(false);
    const [countdown, setCountdown] = useState(60);
    const [isPaymentSuccess, setIsPaymentSuccess] = useState(false);
    const [paymentUrl, setPaymentUrl] = useState<string>('');
    const [paymentQrCode, setPaymentQrCode] = useState<string>('');
    const [paymentOrderId, setPaymentOrderId] = useState<string>('');

    // 4. Auto-fill full name if available in store
    useEffect(() => {
        if (name) setFullName(name);
    }, [name]);

    // 5. Fetch Pricing Policies & Vehicle Types from API
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

    // 6. Map backend vehicles with their monthly prices
    const dynamicVehicles = pricingPolicies.map((p: any) => {
        const vt = vehicleTypes.find((v: any) => v.id === p.vehicleTypeId);
        return {
            id: p.vehicleTypeId,
            name: vt?.typeName || p.policyName.replace(/Bảng giá |Price list /gi, ''),
            iconUrl: vt?.iconUrl,
            pricePerMonth: p.monthlyRate || 0
        };
    });

    // 7. Business Logic: Calculate Fees & Discounts
    const vehicleConfig = dynamicVehicles.find((v: any) => v.id === selectedVehicle);
    const packageConfig = PACKAGES.find(p => p.id === selectedDuration);

    const baseFee = (vehicleConfig?.pricePerMonth || 0) * selectedDuration;
    const discountAmount = baseFee * (packageConfig?.discount || 0);
    const totalFee = baseFee - discountAmount;
    const endDate = startDate.add(selectedDuration, 'month');

    // 8. Utility to resolve image URLs properly
    const getImageUrl = (url: string) => {
        if (!url) return '';
        if (url.startsWith('http')) return url;
        const baseUrl = import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace('/api/v1', '') : 'http://localhost:8080';
        return `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
    };

    // 9. Mutation: Generate Payment Link
    const generateLinkMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                fullName: fullName,
                vehicleTypeId: selectedVehicle,
                plateNumber: plateNumber,
                validFrom: startDate.format('YYYY-MM-DDTHH:mm:ss'),
                duration: selectedDuration
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
            const errMsg = err.response?.data?.message || err.message || 'Error generating payment link';
            message.error(errMsg);
            setIsQRModalVisible(false);
        }
    });

    // 10. Handle Confirm Button Click
    const handleConfirm = () => {
        // Áp dụng Guard Clause để check dữ liệu đầu vào
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

    // 11. Polling: Check Payment Status & Execute Action (Đã được REFACTOR SẠCH SẼ)
    useEffect(() => {
        // 🛡️ Guard Clause 1: Nếu Modal đang tắt, hoặc đã thanh toán xong, hoặc chưa có OrderID -> DỪNG LẠI (Không làm gì cả)
        if (!isQRModalVisible || isPaymentSuccess || !paymentOrderId) return;

        // 🛡️ Guard Clause 2: Nếu thời gian đếm ngược về 0 -> TẮT MODAL VÀ BÁO HẾT HẠN
        if (countdown <= 0) {
            setIsQRModalVisible(false);
            message.warning('Payment timeout reached!');
            return;
        }

        // Nếu qua được 2 ải bảo vệ trên, bắt đầu tính giờ
        const timer = setTimeout(() => {
            setCountdown(c => c - 1); // Trừ đi 1 giây trên màn hình

            // 🛡️ Guard Clause 3: Cứ đếm qua 3 giây mới cho phép gọi API hỏi Backend 1 lần để đỡ sập Server. Không chia hết cho 3 thì DỪNG LẠI.
            if (countdown % 3 !== 0) return;

            // Logic gọi Backend hỏi xem Khách đã trả tiền chưa
            const captureUrl = selectedGateway === 'PAYOS'
                ? '/finance/payments/payos/capture'
                : '/finance/payments/paypal/capture';

            axiosClient.post(captureUrl, { token: paymentOrderId })
                .then(res => {
                    if (res.data?.data?.status === 'COMPLETED') { // Khách đã quét QR trả tiền!
                        // Kích hoạt Ticket
                        axiosClient.post('/finance/payments/execute-action', { token: paymentOrderId })
                            .then(() => {
                                message.success('Monthly Pass registered successfully!');
                                setIsPaymentSuccess(true);
                                setIsQRModalVisible(false);
                                setTimeout(() => navigate('/customer/my-parking?tab=monthly'), 2000);
                            })
                            .catch(execErr => {
                                message.error(execErr.response?.data?.message || 'System failed to process ticket. Your payment has been queued for a full refund.');
                                setIsQRModalVisible(false);
                                clearTimeout(timer);
                            });
                    }
                })
                .catch(() => { /* Vẫn đang đợi khách quét, cứ lờ đi và đợi 3 giây sau hỏi tiếp */ });

        }, 1000); // Tốc độ chạy hàm là 1 giây/lần

        return () => clearTimeout(timer); // Xóa bộ nhớ dọn dẹp (Cleanup)
    }, [isQRModalVisible, isPaymentSuccess, paymentOrderId, countdown]);

    // --- KHOẢNG TRỐNG CHO BƯỚC 4 (GIAO DIỆN) ---
    return (
        <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
            <Title level={2} style={{ marginBottom: 4, fontWeight: 700 }}>Subscribe to Monthly Pass</Title>
            <Text type="secondary" style={{ fontSize: 16 }}>Secure a long-term parking spot with our premium monthly plans.</Text>

            {/* Main Grid Layout */}
            <div style={{ display: 'flex', gap: '32px', marginTop: '32px', flexWrap: 'wrap' }}>

                {/* LEFT COLUMN: Form Area (70%) */}
                <div style={{ flex: '1 1 600px' }}>

                    {/* Card 1: User Info */}
                    <Card
                        title={<><UserOutlined /> Subscriber Information</>}
                        bordered={false}
                        style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: 24 }}
                    >
                        <Input
                            size="large"
                            prefix={<IdcardOutlined style={{ color: '#bfbfbf' }} />}
                            value={fullName}
                            onChange={e => setFullName(e.target.value)}
                            placeholder="Enter your full name"
                            style={{ borderRadius: 8 }}
                        />
                    </Card>

                    {/* Card 2: Vehicle Selection & Plate */}
                    <Card
                        title={<><CarOutlined /> Vehicle Details</>}
                        bordered={false}
                        style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)', marginBottom: 24 }}
                    >
                        <Spin spinning={isPricingLoading}>
                            <Text strong style={{ display: 'block', marginBottom: 12 }}>1. Select Vehicle Type</Text>
                            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                                {dynamicVehicles.map((v: any) => (
                                    <div
                                        key={v.id}
                                        onClick={() => setSelectedVehicle(v.id)}
                                        style={{
                                            flex: 1, minWidth: 140, padding: 16, cursor: 'pointer',
                                            borderRadius: 12, border: selectedVehicle === v.id ? '2px solid #1677ff' : '1px solid #f0f0f0',
                                            backgroundColor: selectedVehicle === v.id ? '#e6f4ff' : '#fff',
                                            textAlign: 'center', transition: 'all 0.3s'
                                        }}
                                    >
                                        <img src={getImageUrl(v.iconUrl)} alt={v.name} style={{ height: 40, objectFit: 'contain', marginBottom: 8 }} />
                                        <div style={{ fontWeight: 600 }}>{v.name}</div>
                                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{v.pricePerMonth.toLocaleString()} ₫ / month</div>
                                    </div>
                                ))}
                            </div>

                            <Text strong style={{ display: 'block', marginBottom: 12 }}>2. License Plate Number</Text>
                            <Input
                                size="large"
                                prefix={<NumberOutlined style={{ color: '#bfbfbf' }} />}
                                value={plateNumber}
                                onChange={e => setPlateNumber(e.target.value.toUpperCase())}
                                placeholder="e.g. 51F-123.45"
                                style={{ borderRadius: 8, textTransform: 'uppercase' }}
                            />
                        </Spin>
                    </Card>

                    {/* Card 3: Duration & Dates */}
                    <Card
                        title={<><CalendarOutlined /> Subscription Duration</>}
                        bordered={false}
                        style={{ borderRadius: 16, boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}
                    >
                        <Text strong style={{ display: 'block', marginBottom: 12 }}>Select Duration</Text>
                        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
                            {PACKAGES.map(pkg => (
                                <div
                                    key={pkg.id}
                                    onClick={() => setSelectedDuration(pkg.id)}
                                    style={{
                                        position: 'relative', flex: 1, minWidth: 100, padding: '16px 8px', cursor: 'pointer',
                                        borderRadius: 12, border: selectedDuration === pkg.id ? '2px solid #1677ff' : '1px solid #f0f0f0',
                                        backgroundColor: selectedDuration === pkg.id ? '#e6f4ff' : '#fff',
                                        textAlign: 'center', transition: 'all 0.3s'
                                    }}
                                >
                                    {pkg.discount > 0 && (
                                        <div style={{
                                            position: 'absolute', top: -10, right: -10, backgroundColor: '#ff4d4f',
                                            color: 'white', fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 'bold'
                                        }}>
                                            Save {pkg.discount * 100}%
                                        </div>
                                    )}
                                    <div style={{ fontWeight: 600, fontSize: 16 }}>{pkg.name}</div>
                                </div>
                            ))}
                        </div>

                        <Text strong style={{ display: 'block', marginBottom: 12 }}>Effective Start Date</Text>
                        <DatePicker
                            size="large"
                            value={startDate}
                            onChange={(date) => date && setStartDate(date)}
                            style={{ width: '100%', borderRadius: 8 }}
                            format="DD/MM/YYYY"
                            allowClear={false}
                        />
                    </Card>
                </div>

                {/* RIGHT COLUMN: Sticky Invoice (30%) */}
                <div style={{ flex: '1 1 350px', position: 'sticky', top: 24, height: 'fit-content' }}>
                    <Card
                        bordered={false}
                        style={{
                            borderRadius: 16,
                            background: 'linear-gradient(145deg, #ffffff, #f5f7fa)',
                            boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
                        }}
                    >
                        <Title level={4} style={{ borderBottom: '1px solid #f0f0f0', paddingBottom: 16, marginBottom: 16 }}>
                            Order Summary
                        </Title>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <Text type="secondary">Base Fee ({selectedDuration} months)</Text>
                            <Text>{baseFee.toLocaleString()} ₫</Text>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                            <Text type="secondary">Discount</Text>
                            <Text type="success" strong>- {discountAmount.toLocaleString()} ₫</Text>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 0', borderTop: '2px dashed #e8e8e8', borderBottom: '2px dashed #e8e8e8', marginBottom: 24 }}>
                            <Text strong style={{ fontSize: 18 }}>Total Due</Text>
                            <Text strong style={{ fontSize: 24, color: '#1677ff' }}>{totalFee.toLocaleString()} ₫</Text>
                        </div>

                        <Text strong style={{ display: 'block', marginBottom: 12 }}>Payment Method</Text>
                        <div style={{ display: 'flex', gap: 12, marginBottom: 24 }}>
                            {GATEWAYS.map(gw => (
                                <div
                                    key={gw.id}
                                    onClick={() => setSelectedGateway(gw.id)}
                                    style={{
                                        flex: 1, padding: 8, cursor: 'pointer', textAlign: 'center',
                                        borderRadius: 8, border: selectedGateway === gw.id ? '2px solid #1677ff' : '1px solid #d9d9d9',
                                        opacity: selectedGateway === gw.id ? 1 : 0.6
                                    }}
                                >
                                    <img src={gw.icon} alt={gw.name} style={{ height: 24, objectFit: 'contain' }} />
                                </div>
                            ))}
                        </div>

                        <Button
                            type="primary"
                            size="large"
                            block
                            onClick={handleConfirm}
                            loading={generateLinkMutation.isPending}
                            icon={<CreditCardOutlined />}
                            style={{ height: 50, borderRadius: 25, fontSize: 16, fontWeight: 'bold' }}
                        >
                            Confirm & Pay
                        </Button>
                        <Text type="secondary" style={{ display: 'block', textAlign: 'center', marginTop: 16, fontSize: 12 }}>
                            Valid until: {endDate.format('DD/MM/YYYY')}
                        </Text>
                    </Card>
                </div>
            </div>

            {/* Modal for QR Code Scanning */}
            <Modal
                title={null}
                open={isQRModalVisible}
                footer={null}
                closable={false}
                centered
                width={400}
                styles={{ body: { padding: 32, textAlign: 'center' } }}
            >
                {!isPaymentSuccess ? (
                    <>
                        <Title level={4}>Scan to Pay</Title>
                        <Text type="secondary">Please scan the QR code with your banking app.</Text>

                        <div style={{ margin: '24px auto', padding: 16, background: '#f5f5f5', borderRadius: 16, width: 250, height: 250, position: 'relative' }}>
                            {paymentQrCode ? (
                                <img src={paymentQrCode} alt="QR Code" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                            ) : (
                                <Spin size="large" style={{ marginTop: 80 }} />
                            )}
                            {/* Minimalist scanner line animation effect */}
                            {paymentQrCode && (
                                <div style={{
                                    position: 'absolute', top: 16, left: 16, right: 16, height: 2, background: 'rgba(22, 119, 255, 0.5)',
                                    boxShadow: '0 0 10px rgba(22, 119, 255, 0.8)', animation: 'scan 2s infinite linear'
                                }} />
                            )}
                        </div>

                        <Title level={2} style={{ color: '#1677ff', margin: 0 }}>{totalFee.toLocaleString()} ₫</Title>
                        <div style={{ marginTop: 16, color: '#ff4d4f', fontWeight: 'bold' }}>
                            Expires in: {countdown}s
                        </div>

                        <Button type="default" style={{ marginTop: 24 }} onClick={() => setIsQRModalVisible(false)}>
                            Cancel Payment
                        </Button>

                        <style>{`
               @keyframes scan {
                 0% { top: 16px; }
                 50% { top: calc(100% - 18px); }
                 100% { top: 16px; }
               }
             `}</style>
                    </>
                ) : (
                    <div style={{ padding: '40px 0' }}>
                        <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a', marginBottom: 24 }} />
                        <Title level={3}>Payment Successful!</Title>
                        <Text>Your monthly pass has been activated.</Text>
                        <div style={{ marginTop: 16 }}><Spin /> Redirecting...</div>
                    </div>
                )}
            </Modal>
        </div>
    );


};

