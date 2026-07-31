import { simulatedDayjs } from '../../core/utils/timeProvider';
import React, { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useWebSocket } from '../../core/websocket/useWebSocket';
import dayjs from 'dayjs';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Button, message, Tag, Typography, Modal, Row, Col, Radio, Input, Divider, Select, InputNumber, QRCode } from 'antd';
import { CarOutlined, LockOutlined, UnlockOutlined, CheckCircleOutlined, DollarOutlined, AimOutlined, WarningOutlined, CloseCircleOutlined, QrcodeOutlined, StopOutlined, CameraOutlined, ExceptionOutlined, IdcardOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { FeeBreakdown } from '../../components/FeeBreakdown';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';
import Konva from 'konva';

const { Title, Text } = Typography;

const GRID_SIZE = 50;



export const GateOutConsoleScreen = ({ activeGate }: { activeGate: any }) => {
  const { connected, stompClient } = useWebSocket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: mapData } = useQuery({
    queryKey: ['zonesMap'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/zones/map');
      return res.data.data;
    }
  });

  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicleTypes'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types?activeOnly=true');
      return res.data?.data || [];
    }
  });

  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [lastRawPayload, setLastRawPayload] = useState<any>(null);
  const [debugMinimized, setDebugMinimized] = useState(false);

  const addLog = (msg: string) => {
    setDebugLogs(prev => {
      const newLogs = [...prev, `[${simulatedDayjs().format('HH:mm:ss')}] ${msg}`];
      return newLogs.slice(-20); // keep last 20 logs
    });
  };

  const [scanData, setScanData] = useState<any>(null);
  const [editablePlate, setEditablePlate] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const isProcessingRef = useRef<boolean>(false);
  
  // OUT Gate states
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'PAYPAL' | 'PAYOS'>('CASH');
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);
  const [paymentQrCode, setPaymentQrCode] = useState<string>('');
  const [paymentOrderId, setPaymentOrderId] = useState<string>('');
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

  const shiftStatus = useAuthStore((state) => state.shiftStatus);



  useEffect(() => {
    if (activeGate && stompClient && connected) {
      const destination = `/topic/gates/${activeGate.id}/scans`;
      const notifDest = `/topic/floors/${activeGate.floorId}/notifications`;
      addLog(`Subscribed to ${destination} and ${notifDest}`);

      const notifSub = stompClient.subscribe(notifDest, (msg) => {
        const payload = JSON.parse(msg.body);
        import('antd').then(({ notification }) => {
          notification.info({
            message: 'Upcoming Reservation',
            description: payload.message,
            duration: 10,
          });
        });
      });
      
      const subscription = stompClient.subscribe(destination, (msg) => {
        if (isProcessingRef.current) {
          addLog("Close stream band: Ignore new signal due to pending processing of current vehicle");
          return;
        }
        isProcessingRef.current = true;

        addLog(`Received message. Length: ${msg.body.length} bytes`);
        
        const payload = JSON.parse(msg.body);
        if (payload.actionType === 'IN') {
            isProcessingRef.current = false;
            return;
        }
        setLastRawPayload(payload);
        
        // IOT payload contains plateNumber, imageBase64, confidence
        // For UI purposes, we'll map it to our UI state shape
        setEditablePlate(payload.plateNumber || 'UNKNOWN');
        
        axiosClient.get('/operation/gates/checkout-session-info', {
          params: { rfid: payload.rfid, plate: payload.plateNumber }
        }).then(res => {
            const info = res.data.data;
            setScanData({
                plateNumber: payload.plateNumber,
                imageBase64: payload.imageBase64 || '',
                lprImageBase64: payload.lprImageBase64 || '',
                imageInBase64: info.picInPanorama || '/placeholder_in_cam.png',
                imageOutBase64: payload.imageBase64 || '/placeholder_out_cam.png',
                lprImageInBase64: info.picInFace || '/placeholder_in_lpr.png',
                lprImageOutBase64: payload.lprImageBase64 || '/placeholder_out_lpr.png',
                plateNumberIn: info.plateNumberIn || payload.plateNumber || 'UNKNOWN',
                timeIn: info.timeIn ? simulatedDayjs(info.timeIn).format('DD/MM/YYYY HH:mm:ss') : '--:--',
                timeOut: info.timeOut ? simulatedDayjs(info.timeOut).format('DD/MM/YYYY HH:mm:ss') : simulatedDayjs().format('DD/MM/YYYY HH:mm:ss'),
                duration: info.durationMinutes ? `${info.durationMinutes} minutes` : '--',
                feeBase: info.expectedFee || 0,
                feePenalty: info.feePenalty || 0,
                discount: info.discountFee || 0,
                overtimeFee: info.overtimeFee || 0,
                expectedFee: info.expectedFee || 0,
                parkingFee: (info.expectedFee || 0) + (info.overtimeFee || 0),
                durationMinutes: info.durationMinutes || 0,
                isBlacklisted: false,
                warnings: [],
                rfid: info.rfid || payload.rfid || '---',
                customerType: info.customerType || 'Haunt',
                vehicleType: info.vehicleType || 'UNKNOWN',
                routing: info.suggestedZoneName || '',
                bookedTimeIn: info.bookedTimeIn ? simulatedDayjs(info.bookedTimeIn).format('DD/MM/YYYY HH:mm:ss') : null,
                bookedTimeOut: info.bookedTimeOut ? simulatedDayjs(info.bookedTimeOut).format('DD/MM/YYYY HH:mm:ss') : null,
                overtimeMinutes: info.overtimeMinutes || 0,
                status: info.status || 'ACTIVE'
            });
        }).catch(err => {
            message.warning(err.response?.data?.message || 'No corresponding input vehicle data found!');
            setScanData({
                plateNumber: payload.plateNumber,
                imageBase64: payload.imageBase64 || '',
                lprImageBase64: payload.lprImageBase64 || '',
                imageInBase64: '/placeholder_in_cam.png',
                imageOutBase64: payload.imageBase64 || '/placeholder_out_cam.png',
                lprImageInBase64: '/placeholder_in_lpr.png',
                lprImageOutBase64: payload.lprImageBase64 || '/placeholder_out_lpr.png',
                plateNumberIn: 'UNKNOWN',
                timeIn: '--:--',
                timeOut: simulatedDayjs().format('DD/MM/YYYY HH:mm:ss'),
                duration: '--',
                feeBase: 0,
                feePenalty: 0,
                discount: 0,
                overtimeFee: 0,
                expectedFee: 0,
                parkingFee: 0,
                durationMinutes: 0,
                isBlacklisted: false,
                warnings: ['No vehicle information found'],
                rfid: payload.rfid || '---',
                customerType: payload.customerType === 'PREBOOKED' ? 'BOOK' : (payload.customerType === 'MONTHLY' ? 'Monthly Pass' : (payload.customerType || 'Haunt')),
                vehicleType: payload.vehicleType || 'CAR',
                routing: '',
                status: 'UNKNOWN'
            });
        });
      });

      return () => {
        subscription.unsubscribe();
        notifSub.unsubscribe();
        addLog(`Unsubscribed from ${destination} and ${notifDest}`);
      };
    }
  }, [activeGate, stompClient, connected]);

  const handleCancel = () => {
    isProcessingRef.current = false;
    setScanData(null);
    setEditablePlate('');
    setPaymentMethod('CASH');
    setPaymentConfirmed(false);
    setPaymentUrl(null);
    setPaymentQrCode('');
    setPaymentOrderId('');
    message.warning('The current scanning session has been canceled. System is ready.');
  };

  const handleCheckIn = async () => {
    if (!scanData || !activeGate) return;
    setIsLoading(true);
    try {
      const payload = {
        gateId: activeGate.id,
        plateNumber: editablePlate,
        vehicleType: scanData.vehicleType || 'CAR',
        rfid: scanData.rfid,
        imageBase64: scanData.imageBase64,
        lprImageBase64: scanData.lprImageBase64
      };
      const response = await axiosClient.post('/operation/gates/check-in', payload);
      
      const suggestedZone = response.data.data.suggestedZoneName || 'Free';
      message.success(`Vehicle entry confirmed! Suggested zone: ${suggestedZone}`);
      setScanData(null);
      setEditablePlate('');
      isProcessingRef.current = false;
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Error checking in vehicle.');
      isProcessingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };


  const handleManualPaymentConfirm = () => {
    setPaymentConfirmed(true);
    message.success('Payment recorded successfully!');
  };

  const handleCompletePaymentAndOpen = async () => {
    if (!scanData || !activeGate) return;
    setIsLoading(true);
    try {
      const payload = {
        gateId: activeGate.id,
        plateNumber: editablePlate,
        rfid: scanData.rfid,
        imageBase64: scanData.imageOutBase64,
        lprImageBase64: scanData.lprImageOutBase64,
        paymentMethod: paymentMethod,
        totalFee: scanData.parkingFee || 0
      };
      const response = await axiosClient.post('/operation/gates/check-out', payload);
      
      message.success(`Barrier opened for exit! Payment fee: ${(response.data.data.checkoutFee || 0).toLocaleString()} ₫`);

      // Auto-log LPR_MISMATCH if the staff edited the plate
      if (scanData.plateNumber && editablePlate && scanData.plateNumber.toUpperCase() !== editablePlate.toUpperCase()) {
        try {
          await axiosClient.post('/incident/incidents', {
            issueType: 'LPR_MISMATCH',
            sessionId: scanData.sessionId || response.data.data.sessionId,
            description: `[AUTO] License plate mismatch on EXIT. AI recognized: ${scanData.plateNumber}. Staff edited to: ${editablePlate}.`,
            correctPlateNumber: editablePlate,
            priority: 'LOW'
          });
        } catch (e) {
          console.error("Error automatically creating LPR_MISMATCH incident:", e);
        }
      }

      setScanData(null);
      setEditablePlate('');
      setPaymentMethod('CASH');
      setPaymentConfirmed(false);
      setPaymentUrl(null);
      setPaymentQrCode('');
      setPaymentOrderId('');
      isProcessingRef.current = false;
    } catch (error: any) {
      message.error(error.response?.data?.message || 'Error checking out vehicle.');
      isProcessingRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };



  // Generate Payment URL when switching to digital method
  useEffect(() => {
    if ((paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') && scanData) {
      const calculatedTotalFee = Math.max(0, 
        (scanData.expectedFee || scanData.feeBase || 0) + 
        (scanData.overtimeFee || 0) + 
        (scanData.feePenalty || 0) - 
        (scanData.discount || scanData.discountFee || 0)
      );
      const amount = calculatedTotalFee;
      if (amount > 0) {
        setIsLoading(true);
        const payload = {
            gateId: activeGate?.id,
            plateNumber: editablePlate,
            rfid: scanData.rfid,
            imageBase64: scanData.imageOutBase64,
            lprImageBase64: scanData.lprImageOutBase64,
            paymentMethod: paymentMethod,
            totalFee: amount,
            sessionId: scanData.sessionId
        };
        axiosClient.post('/finance/payments/initialize', { 
            actionType: 'CHECKOUT',
            gateway: paymentMethod, 
            amount: amount,
            payload: payload
        })
          .then(res => {
            setPaymentUrl(res.data.data.paymentUrl);
            setPaymentQrCode(res.data.data.qrCode || res.data.data.paymentUrl || '');
            
            if (paymentMethod === 'PAYPAL') {
              const urlObj = new URL(res.data.data.paymentUrl);
              setPaymentOrderId(urlObj.searchParams.get('token') || '');
            } else {
              setPaymentOrderId(res.data.data.orderId || '');
            }
          })
          .catch((err) => {
            console.error("Payment initialization error:", err);
            const errMsg = err.response?.data?.message || err.message || `Unable to generate ${paymentMethod} QR code`;
            message.error(errMsg);
            setPaymentMethod('CASH');
          })
          .finally(() => setIsLoading(false));
      } else {
        setPaymentConfirmed(true);
      }
    } else {
      setPaymentUrl(null);
      setPaymentQrCode('');
      setPaymentOrderId('');
    }
  }, [paymentMethod, scanData]);

  // Poll for payment status
  useEffect(() => {
    if ((paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') && paymentUrl && paymentOrderId && !paymentConfirmed) {
      const intervalId = setInterval(() => {
        const captureUrl = paymentMethod === 'PAYOS' ? '/finance/payments/payos/capture' : '/finance/payments/paypal/capture';
        axiosClient.post(captureUrl, { token: paymentOrderId })
          .then(res => {
            if (res.data?.data?.status === 'COMPLETED') {
              clearInterval(intervalId);
              // Execute the checkout action internally via payments execute
              axiosClient.post('/finance/payments/execute-action', { token: paymentOrderId })
                .then(execRes => {
                    message.success(`Payment via ${paymentMethod} successful! Barrier opened!`);
                    
                    // Reset UI to accept next vehicle
                    setScanData(null);
                    setEditablePlate('');
                    setPaymentMethod('CASH');
                    setPaymentConfirmed(false);
                    setPaymentUrl(null);
                    setPaymentQrCode('');
                    setPaymentOrderId('');
                    isProcessingRef.current = false;
                })
                .catch(execErr => {
                    message.error(execErr.response?.data?.message || 'System failed to checkout. A refund has been requested automatically.');
                    setPaymentConfirmed(true); // Treat as confirmed to clear screen, but with error shown
                });
            }
          })
          .catch((err) => {
            // Wait silently if not yet approved
          });
      }, 3000);

      return () => clearInterval(intervalId);
    }
  }, [paymentMethod, paymentUrl, paymentOrderId, paymentConfirmed]);

  // Auto-submit checkout when CASH payment is confirmed
  useEffect(() => {
    if (paymentConfirmed && paymentMethod === 'CASH' && scanData && activeGate) {
      handleCompletePaymentAndOpen();
    }
  }, [paymentConfirmed]);

  const renderOutGatePanel = () => {
    const totalFee = Math.max(0, 
      (scanData?.expectedFee || scanData?.feeBase || 0) + 
      (scanData?.overtimeFee || 0) + 
      (scanData?.feePenalty || 0) - 
      (scanData?.discount || scanData?.discountFee || 0)
    );
    const duration = scanData?.durationMinutes || 0;
    const isInvalidEntry = scanData?.plateNumberIn === 'UNKNOWN' || scanData?.timeIn === '--:--';
    const isPlateMismatch = !isInvalidEntry && !!scanData?.plateNumberIn && (editablePlate.trim().toUpperCase() !== scanData.plateNumberIn.trim().toUpperCase());

    return (
      <div className="flex h-full overflow-hidden w-full bg-slate-100 rounded-xl shadow-inner gap-4">
        {/* LEFT SIDE: 4-Way Cameras (45% width) */}
        <div className="w-[45%] flex-none p-2 flex gap-2 bg-slate-900 border-4 border-slate-800 rounded-xl overflow-hidden shadow-lg">
          {!scanData ? (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 bg-slate-900">
              <AimOutlined className="text-6xl mb-4 opacity-30 animate-spin" style={{ animationDuration: '3s' }} />
              <Text className="text-slate-400 font-bold tracking-widest text-lg">WAITING FOR THE CAR SIGNAL OUT...</Text>
            </div>
          ) : (
            <>
              {/* IN Column */}
              <div className="flex-1 flex flex-col gap-2 border-r-2 border-slate-700 pr-2">
                <div className="text-xs font-bold text-green-400 text-center uppercase tracking-widest bg-slate-800 py-1 rounded">Photo of Vehicle Entering</div>
                <div className="flex-1 relative bg-black rounded overflow-hidden border border-slate-700"><img src={getImageUrl(scanData.imageInBase64)} alt="IN Pan" className="w-full h-full object-contain absolute" /></div>
                <div className="h-[25%] relative bg-white rounded flex items-center justify-center border border-slate-700"><img src={getImageUrl(scanData.lprImageInBase64)} alt="IN LPR" className="max-w-full max-h-full object-contain" /></div>
              </div>
              {/* OUT Column */}
              <div className="flex-1 flex flex-col gap-2 pl-2">
                <div className="text-xs font-bold text-blue-400 text-center uppercase tracking-widest bg-slate-800 py-1 rounded">Xe Ra photo</div>
                <div className="flex-1 relative bg-black rounded overflow-hidden border border-slate-700"><img src={getImageUrl(scanData.imageOutBase64)} alt="OUT Pan" className="w-full h-full object-contain absolute" /></div>
                <div className="h-[25%] relative bg-white rounded flex items-center justify-center border border-slate-700"><img src={getImageUrl(scanData.lprImageOutBase64)} alt="OUT LPR" className="max-w-full max-h-full object-contain" /></div>
              </div>
            </>
          )}
        </div>

        {/* RIGHT SIDE: Info, Plates, Billing, Actions (55% width) */}
        <div className="w-[55%] flex flex-col h-full bg-slate-50 border border-slate-300 rounded-xl overflow-hidden shadow-sm relative">
          
          {/* Scrollable Detail Area (Split into 2 internal columns) */}
          <div className="flex-1 p-2 flex flex-col xl:flex-row gap-4 overflow-y-auto custom-scrollbar">
            {scanData ? (
              <>
                {/* Internal Left: Info & Plates */}
                <div className="w-full xl:w-1/2 flex flex-col gap-2">
                  
                  {/* Identity & Slot */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-between items-center flex-none">
                    <div className="flex items-center space-x-2">
                      <IdcardOutlined className="text-2xl text-blue-600" />
                      <Text className="text-xl font-bold text-slate-700 font-mono tracking-wider">{scanData.rfid}</Text>
                    </div>
                    <div className="flex items-center space-x-2">
                      {scanData.routing && <Tag color="purple" className="m-0 font-bold px-3 py-1 text-sm rounded">{scanData.routing}</Tag>}
                      <Tag color="cyan" className="m-0 font-bold px-3 py-1 text-sm rounded shadow-sm border border-transparent flex items-center">
                        {(() => {
                           const vt = vehicleTypes?.find((v: any) => v.typeName === scanData.vehicleType);
                           if (vt && vt.iconUrl) {
                              return <img src={getImageUrl(vt.iconUrl)} style={{width: 16, height: 16, marginRight: 6, objectFit: 'contain'}}/>;
                           }
                           return null;
                        })()}
                        {scanData.vehicleType}
                      </Tag>
                      <Tag color={scanData.customerType === 'Haunt' ? 'blue' : (scanData.customerType === 'BOOK' ? 'gold' : 'green')} className="m-0 font-bold px-3 py-1 text-sm rounded shadow-sm border border-transparent">
                        {scanData.customerType}
                      </Tag>
                    </div>
                  </div>

                  {/* Warnings Section */}
                  <div className={`p-2 rounded-lg shadow-sm flex-none flex flex-col gap-1 border overflow-hidden ${scanData.warnings?.length > 0 || scanData.customerType === 'BOOK' ? 'bg-orange-50 border-orange-400 text-orange-700' : 'bg-green-50 border-green-300 text-green-700'}`}>
                    <div className="font-bold flex items-center justify-between text-xs">
                      <div className="flex items-center">
                        {scanData.warnings?.length > 0 || scanData.customerType === 'BOOK' ? <WarningOutlined className="mr-1 text-sm"/> : <CheckCircleOutlined className="mr-1 text-sm"/>} 
                         
                                                                    WARNING / NOTE:
                                                                  </div>
                    </div>
                    <div className="flex-1 overflow-hidden min-h-[30px] text-xs">
                      {scanData.customerType === 'BOOK' && (
                        <div className="mb-1 font-medium">
                          <strong>Guests who book in advance:</strong><br />
                          
                                                                          • Estimated arrival time: {scanData.bookedTimeIn}<br />
                          
                                                                          • Estimated departure time: {scanData.bookedTimeOut}
                        </div>
                      )}
                      {scanData.warnings?.length > 0 ? (
                        <ul className="list-disc pl-6 m-0">
                          {(scanData.warnings || []).map((w: string, idx: number) => <li key={idx} className="font-medium truncate" title={w}>{w}</li>)}
                        </ul>
                      ) : (
                        scanData.customerType !== 'BOOK' && <span className="text-green-600 font-medium">The car does not have any fines or warnings</span>
                      )}
                    </div>
                  </div>

                  {/* Time Tracker */}
                  <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm flex justify-between items-center flex-none mt-2">
                    <div className="text-center"><Text type="secondary" className="block text-xs uppercase font-bold tracking-widest">Time to Enter</Text><Text strong className="text-base">{scanData.timeIn}</Text></div>
                    <div className="text-center text-blue-600"><ClockCircleOutlined className="text-2xl" /><Text strong className="block text-xs uppercase mt-1">{scanData.duration}</Text></div>
                    <div className="text-center"><Text type="secondary" className="block text-xs uppercase font-bold tracking-widest">Out time</Text><Text strong className="text-base">{scanData.timeOut}</Text></div>
                  </div>

                  {/* Plate Comparison */}
                  <div className="flex flex-col gap-2 flex-1 min-h-0 mt-2">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-2 flex flex-col items-center justify-center flex-1">
                      <Text className="text-green-700 font-bold mb-1 uppercase tracking-widest text-[10px]">License Plate IN</Text>
                      <Input 
                        value={scanData.plateNumberIn} 
                        disabled
                        className="w-full text-2xl h-10 font-mono text-center font-bold uppercase rounded border-green-300 bg-green-100 text-green-800"
                      />
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 flex flex-col items-center justify-center shadow-inner flex-1">
                      <Text className="text-blue-700 font-bold mb-1 uppercase tracking-widest text-[10px]">License Plate Ra (Edit if wrong)</Text>
                      <Input 
                        value={editablePlate} 
                        onChange={(e) => setEditablePlate(e.target.value)} 
                        className="w-full text-2xl h-10 font-mono text-center font-bold uppercase rounded border-2 border-blue-400 focus:border-blue-600 bg-white text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Plate Mismatch Warning */}
                  {scanData.plateNumberIn && scanData.plateNumberIn !== 'UNKNOWN' && editablePlate && scanData.plateNumberIn.toUpperCase() !== editablePlate.toUpperCase() && (
                    <div className="mt-2 bg-red-100 border-2 border-red-500 text-red-700 px-3 py-2 rounded-lg flex items-center justify-center font-bold text-sm animate-pulse shadow-sm">
                      <WarningOutlined className="mr-2 text-lg" />
                      
                                                              WARNING: The Outgoing License Plate DOES NOT MATCH THE IN!
                                                            </div>
                  )}
                </div>

                {/* Internal Right: Billing & Payment */}
                <div className="w-full xl:w-1/2 flex flex-col bg-slate-800 border border-slate-700 rounded-xl shadow-lg text-white p-4">
                  {/* LOCKED SESSION BANNER */}
                  {scanData?.status === 'LOCKED' && (
                    <div className="mb-3 bg-red-600/20 border-2 border-red-500 rounded-xl p-3 flex items-center gap-3 animate-pulse">
                      <span className="text-2xl">🔒</span>
                      <div>
                        <div className="text-red-400 font-bold text-sm uppercase tracking-widest">VEHICLE IS LOCKED DUE TO Incident</div>
                        <div className="text-red-300 text-xs mt-0.5">Staff need to resolve the ticket at the Resolve Incident screen (Phase 2) before opening the gate!</div>
                      </div>
                    </div>
                  )}
                  <div className="mb-4">
                    <FeeBreakdown 
                      durationMinutes={duration}
                      customerType={scanData.customerType}
                      expectedFee={scanData.expectedFee || scanData.feeBase || 0}
                      overtimeMinutes={scanData.overtimeMinutes}
                      overtimeFee={scanData.overtimeFee || 0}
                      penaltyFee={scanData.feePenalty || 0}
                      discountFee={scanData.discount || scanData.discountFee || 0}
                      totalFee={totalFee}
                      isPaid={scanData.customerType === 'BOOK' && totalFee === 0}
                      isLightMode={false}
                    />
                  </div>

                  {/* Payment Radio */}
                  <div className="mt-6">
                    <Radio.Group 
                      value={paymentMethod} 
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="flex w-full bg-slate-700 rounded-lg p-1 border border-slate-600 shadow-inner"
                    >
                      <Radio.Button value="CASH" className="flex-1 text-center font-bold text-base h-12 leading-[40px] border-0 !text-slate-800 bg-white shadow-sm rounded-l-md">Cash</Radio.Button>
                      <Radio.Button value="PAYPAL" className="flex-1 text-center font-bold text-base h-12 leading-[40px] border-0 border-l border-slate-600 !text-slate-200">PayPal</Radio.Button>
                      <Radio.Button value="PAYOS" className="flex-1 text-center font-bold text-base h-12 leading-[40px] border-0 border-l border-slate-600 !text-slate-200 rounded-r-md">PayOS QR</Radio.Button>
                    </Radio.Group>
                  </div>

                  {/* QR Code conditionally rendered */}
                  <div className="flex-1 mt-3 relative min-h-[200px]">
                    {(paymentMethod === 'PAYPAL' || paymentMethod === 'PAYOS') ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 bg-white rounded border border-dashed border-blue-400">
                        {!paymentConfirmed ? (
                          <>
                            {paymentUrl ? (
                              <QRCode value={paymentMethod === 'PAYOS' && paymentQrCode ? paymentQrCode : paymentUrl} size={130} />
                            ) : (
                              <QrcodeOutlined className="text-5xl text-slate-800 mb-1 animate-pulse" />
                            )}
                            <Text type="secondary" className="font-bold text-[9px] uppercase mt-2 text-center">Customer scans {paymentMethod} code</Text>
                            {paymentUrl && paymentMethod !== 'PAYOS' && (
                              <Button 
                                type="primary" 
                                size="small" 
                                className="mt-2 bg-blue-600 w-full font-bold text-xs" 
                                onClick={() => window.open(paymentUrl, '_blank')}
                              >
                                Open Payment Link
                              </Button>
                            )}
                          </>
                        ) : (
                          <div className="bg-green-100 text-green-800 p-2 rounded w-full h-full text-center font-bold flex flex-col items-center justify-center text-xs shadow-inner">
                            <CheckCircleOutlined className="text-2xl mb-1 text-green-600" /> Money collected Success!
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-700 rounded border border-slate-600 text-slate-400 text-xs font-bold text-center p-4">
                        <DollarOutlined className="text-4xl mb-2 opacity-50" />
                        CASH COLLECTION DIRECTLY
                      </div>
                    )}
                  </div>
                </div>
              </>
            ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400">
                <Text className="font-bold tracking-widest text-lg uppercase text-slate-300">Waiting for data...</Text>
              </div>
            )}
          </div>

          {/* Fixed Actions Area (Fixed h-[88px]) */}
          <div className="flex-none h-[88px] px-3 pt-2 pb-3 border-t border-slate-200 bg-white flex gap-3 shadow-[0_-4px_15px_rgba(0,0,0,0.05)] relative z-10">
            <Button 
              size="large" 
              danger
              icon={<CloseCircleOutlined />}
              className="h-full flex-1 text-lg font-bold rounded-lg border-2 border-red-500 text-red-600 hover:bg-red-50 transition-colors"
              disabled={!scanData}
              onClick={handleCancel}
            >
              
                                      Cancel
                                    </Button>
            <Button 
              type="primary" 
              size="large" 
              className={`h-full flex-[2] text-xl font-bold rounded-lg shadow-lg border-b-4 active:border-b-0 active:translate-y-1 transition-all ${
                (scanData?.status === 'LOCKED') 
                  ? 'bg-red-800 border-red-900 cursor-not-allowed opacity-80'
                  : isInvalidEntry || isPlateMismatch
                    ? 'bg-slate-600 border-slate-700 cursor-not-allowed opacity-80'
                    : (paymentMethod !== 'CASH' && !paymentConfirmed) 
                      ? 'bg-slate-400 border-slate-500 cursor-not-allowed' 
                      : 'bg-green-600 hover:bg-green-500 border-green-800 animate-pulse'
              }`}
              disabled={(!scanData) || isInvalidEntry || isPlateMismatch || (paymentMethod !== 'CASH' && !paymentConfirmed) || (scanData?.status === 'LOCKED')}
              loading={isLoading}
              onClick={handleCompletePaymentAndOpen}
            >
              {scanData?.status === 'LOCKED' ? '🔒 LOCKED - Resolve Incident first' : 
                (isInvalidEntry ? '❌ NO ENTRY RECORD - Use Exception Desk' : 
                  (isPlateMismatch ? '❌ PLATE MISMATCH - Use Exception Desk' : 
                    (paymentMethod === 'CASH' ? 'Collect money & Open the gate' : 'Confirm & Open the gate')
                  )
                )
              }
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-slate-100 relative">


      <Row className="h-full w-full m-0">
        <Col span={24} className="h-full p-4 flex flex-col bg-slate-50">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <Title level={4} className="m-0 text-slate-800">
              {activeGate?.name} <span className="text-xs ml-2 bg-blue-600 text-white px-2 py-1 rounded">OUT GATE LIVE</span>
            </Title>
          </div>
          {renderOutGatePanel()}
        </Col>
      </Row>
    </div>
  );
};
