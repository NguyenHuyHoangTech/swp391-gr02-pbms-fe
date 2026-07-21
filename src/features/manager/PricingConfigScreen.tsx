import { simulatedDayjs } from '../../core/utils/timeProvider';
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';
import { Typography, Tabs, Button, InputNumber, Switch, Input, TimePicker, Collapse, Modal, message, Checkbox, Card } from 'antd';
import {
  CalculatorOutlined,
  PlusOutlined,
  SaveOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  CarOutlined,
  DollarOutlined,
  InfoCircleOutlined,
  ArrowRightOutlined,
  DeleteOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';

dayjs.extend(customParseFormat);

const { Title, Text } = Typography;
const { Panel } = Collapse;

/*
Viết Thử Tiếng Việt
*/

interface Slice {
  id: string;
  duration: number | null;
  price: number;
  isTail: boolean;
}

interface Shift {
  id: string;
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  color: string;
  slices: Slice[];
}

interface VehicleConfig {
  id?: number;
  policyName?: string;
  vehicleTypeId?: number;
  globalBaseGuardEnabled: boolean;
  globalBaseGuardTime: number;
  globalBaseGuardPrice: number;
  monthlyRate: number;
  shifts: Shift[];
}

export const PricingConfigScreen = () => {

  const queryClient = useQueryClient();
  const [activeTabId, setActiveTabId] = useState<number | null>(null);

  const { data: vehicleTypesData } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types?activeOnly=true');
      return res.data.data;
    }
  });

  // Default Empty Config
  const defaultEmptyConfig = (typeId: number | null): VehicleConfig => ({
    globalBaseGuardEnabled: false,
    globalBaseGuardTime: 0,
    globalBaseGuardPrice: 0,
    monthlyRate: 0,
    shifts: [{
      id: `shift_${Date.now()}`,
      name: 'Default Ca',
      startTime: '00:00',
      endTime: '23:59',
      color: 'bg-blue-100 border-blue-300 text-blue-800',
      slices: [{ id: `slice_${Date.now()}`, duration: null, price: 10000, isTail: true }]
    }]
  });

  const [config, setConfig] = useState<VehicleConfig>(defaultEmptyConfig(0));
  const [initialConfig, setInitialConfig] = useState<VehicleConfig | null>(null);
  const [selectedShiftId, setSelectedShiftId] = useState<string | null>(null);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [activeAccordion, setActiveAccordion] = useState<string | string[]>(['1', '2']);

  const isDirty = initialConfig ? JSON.stringify(config) !== JSON.stringify(initialConfig) : false;

  // Calculator State
  const [timeIn, setTimeIn] = useState<Dayjs | null>(simulatedDayjs('08:00', 'HH:mm'));
  const [timeOut, setTimeOut] = useState<Dayjs | null>(simulatedDayjs('10:30', 'HH:mm'));
  const [calcResult, setCalcResult] = useState<{ total: number, breakdown: string[], minutes: number } | null>(null);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');

  const { data: policiesData, isLoading } = useQuery({
    queryKey: ['pricing-policies'],
    queryFn: async () => {
      const res = await axiosClient.get('/finance/pricing-policies');
      return res.data.data; // List of PricingPolicyDTO
    }
  });



  useEffect(() => {
    if (vehicleTypesData && vehicleTypesData.length > 0 && !activeTabId) {
      setActiveTabId(vehicleTypesData[0].id);
    }
  }, [vehicleTypesData]);

  useEffect(() => {
    if (policiesData && activeTabId) {
      const policy = policiesData.find((p: any) => p.vehicleTypeId === activeTabId);
      if (policy) {
        // Map DTO back to VehicleConfig
        const mappedConfig: VehicleConfig = {
          id: policy.id,
          policyName: policy.policyName,
          vehicleTypeId: policy.vehicleTypeId,
          globalBaseGuardEnabled: policy.globalBaseMins > 0,
          globalBaseGuardTime: policy.globalBaseMins,
          globalBaseGuardPrice: policy.globalBaseFee,
          monthlyRate: policy.monthlyRate || 0,
          shifts: policy.shifts.map((s: any, idx: number) => {
            const slices: Slice[] = s.blocks.map((b: any, bIdx: number) => {
              return {
                id: b.id || `slice_${bIdx}_${Date.now()}`,
                duration: b.durationMins,
                price: b.fee,
                isTail: bIdx === s.blocks.length - 1
              };
            });
            // If the last block is tail, set duration to null to match UI logic
            if (slices.length > 0) {
              slices[slices.length - 1].isTail = true;
              slices[slices.length - 1].duration = null;
            }
            return {
              id: s.id || `shift_${idx}_${Date.now()}`,
              name: s.shiftName,
              startTime: s.startTime.substring(0, 5),
              endTime: s.endTime.substring(0, 5),
              color: idx % 2 === 0 ? 'bg-blue-100 border-blue-300 text-blue-800' : 'bg-indigo-100 border-indigo-300 text-indigo-800',
              slices
            };
          })
        };
        setConfig(mappedConfig);
        setInitialConfig(mappedConfig);
        setSelectedShiftId(mappedConfig.shifts[0]?.id || null);
      } else {
        const empty = defaultEmptyConfig(activeTabId);
        setConfig(empty);
        setInitialConfig(empty);
        setSelectedShiftId(empty.shifts[0]?.id || null);
      }
      setSelectedSliceId(null);
      setCalcResult(null);
    }
  }, [activeTabId, policiesData]);


  const selectedShift = config.shifts.find(s => s.id === selectedShiftId);
  const selectedSlice = selectedShift?.slices.find(s => s.id === selectedSliceId);

  const parseTime = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const getShiftDuration = (shift: Shift) => {
    const start = parseTime(shift.startTime);
    let end = parseTime(shift.endTime);
    if (end <= start) end += 24 * 60;
    return end - start;
  };

  const getTailDuration = (shift: Shift) => {
    const shiftDur = getShiftDuration(shift);
    const othersSum = shift.slices.filter(s => !s.isTail).reduce((sum, s) => sum + (s.duration || 0), 0);
    return Math.max(0, shiftDur - othersSum);
  };

  // Helper to get shift percentage for timeline
  const getShiftPosition = (startTime: string, endTime: string) => {
    const startMins = parseTime(startTime);
    let endMins = parseTime(endTime);
    if (endMins <= startMins) endMins += 24 * 60;

    const left = (startMins / (24 * 60)) * 100;
    const width = ((endMins - startMins) / (24 * 60)) * 100;

    if (startMins + (endMins - startMins) > 24 * 60) {
      return { left: `${left}%`, width: `${width}%`, isWrap: true };
    }

    return { left: `${left}%`, width: `${width}%`, isWrap: false };
  };

  const testCalculateMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await axiosClient.post('/finance/pricing-policies/test-calculate', payload);
    },
    onSuccess: (data: any) => {
      const result = data.data.data;
      setCalcResult({
        total: result.fee,
        breakdown: result.breakdown,
        minutes: timeOut ? Math.max(1, timeOut.diff(timeIn, 'minute') > 0 ? timeOut.diff(timeIn, 'minute') : timeOut.diff(timeIn, 'minute') + 24 * 60) : 0
      });
    },
    onError: (error: any) => {
      message.error('Lỗi khi tính thử phí: ' + (error.response?.data?.message || error.message));
    }
  });

  const calculatePrice = () => {
    if (!timeIn || !timeOut) return;

    // Create policy payload dynamically (similar to handleSave)
    const policyPayload = {
      id: (config as any).id,
      policyName: config.policyName || `Pricing table ${vehicleTypesData?.find((v: any) => v.id === activeTabId)?.typeName || 'Default'}`,
      vehicleTypeId: activeTabId,
      globalBaseMins: config.globalBaseGuardEnabled ? config.globalBaseGuardTime : 0,
      globalBaseFee: config.globalBaseGuardEnabled ? config.globalBaseGuardPrice : 0,
      monthlyRate: config.monthlyRate,
      status: 'ACTIVE',
      shifts: config.shifts.map(s => {
        const totalDurationMins = getShiftDuration(s);
        const blocks = s.slices.map((sl, idx) => {
          const isTail = sl.isTail;
          return {
            id: typeof sl.id === 'number' ? sl.id : null,
            blockOrder: idx + 1,
            durationMins: isTail ? getTailDuration(s) : sl.duration,
            fee: sl.price
          };
        });
        return {
          id: typeof s.id === 'number' ? s.id : null,
          shiftName: s.name,
          startTime: s.startTime,
          endTime: s.endTime,
          totalDurationMins: totalDurationMins,
          blocks: blocks
        };
      })
    };

    const payload = {
      policy: policyPayload,
      timeIn: timeIn.format('YYYY-MM-DDTHH:mm:ss'),
      timeOut: timeOut.format('YYYY-MM-DDTHH:mm:ss')
    };

    testCalculateMutation.mutate(payload);
  };


  const saveMutation = useMutation({
    mutationFn: async (payload: any) => {
      return await axiosClient.post('/finance/pricing-policies', payload);
    },
    onSuccess: () => {
      message.success('Price list configuration saved Success!');
      setIsConfirmModalOpen(false);
      setConfirmInput('');
      setInitialConfig(config);
      queryClient.invalidateQueries({ queryKey: ['pricing-policies'] });
    },
    onError: (error: any) => {
      message.error('Error when saving price list: ' + (error.response?.data?.message || error.message));
    }
  });

  const handleSave = () => {
    if (confirmInput.toUpperCase() === 'XACNHAN') {
      const payload = {
        id: (config as any).id,
        policyName: config.policyName || `Pricing table ${vehicleTypesData?.find((v: any) => v.id === activeTabId)?.typeName || 'Default'}`,
        vehicleTypeId: activeTabId,
        globalBaseMins: config.globalBaseGuardEnabled ? config.globalBaseGuardTime : 0,
        globalBaseFee: config.globalBaseGuardEnabled ? config.globalBaseGuardPrice : 0,
        monthlyRate: config.monthlyRate,
        status: 'ACTIVE',
        shifts: config.shifts.map(s => {

          const totalDurationMins = getShiftDuration(s);

          const blocks = s.slices.map((sl, idx) => {
            const isTail = sl.isTail;
            return {
              id: typeof sl.id === 'number' ? sl.id : null,
              blockOrder: idx + 1,
              durationMins: isTail ? getTailDuration(s) : sl.duration,
              fee: sl.price
            };
          });

          return {
            id: typeof s.id === 'number' ? s.id : null,
            shiftName: s.name,
            startTime: s.startTime,
            endTime: s.endTime,
            totalDurationMins: totalDurationMins,
            blocks: blocks
          };
        })
      };

      saveMutation.mutate(payload);
    } else {
      message.error('Confirmation code is invalid!');
    }
  };


  const updateConfig = (field: keyof VehicleConfig, value: any) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSliceUpdate = (field: string, value: any) => {
    if (!selectedShiftId || !selectedSliceId) return;
    setConfig(prev => ({
      ...prev,
      shifts: prev.shifts.map(s => {
        if (s.id !== selectedShiftId) return s;
        return {
          ...s,
          slices: s.slices.map(sl => {
            if (sl.id !== selectedSliceId) return sl;
            const newSl = { ...sl, [field]: value };
            if (field === 'isTail' && value === true) {
              newSl.duration = null;
            }
            return newSl;
          })
        };
      })
    }));
  };

  const handleAddShift = () => {
    const newId = `shift_${Date.now()}`;

    // Calculate total timeline and find gaps
    let timeline: { start: number, end: number }[] = [];
    config.shifts.forEach(s => {
      let st = parseTime(s.startTime);
      let et = parseTime(s.endTime);
      if (et <= st) {
        timeline.push({ start: st, end: 1440 });
        if (et > 0) timeline.push({ start: 0, end: et });
      } else {
        timeline.push({ start: st, end: et });
      }
    });

    timeline.sort((a, b) => a.start - b.start);
    let gaps: { start: number, end: number }[] = [];
    let currentMaxEnd = 0;

    for (let i = 0; i < timeline.length; i++) {
      if (timeline[i].start > currentMaxEnd) {
        gaps.push({ start: currentMaxEnd, end: timeline[i].start });
      }
      currentMaxEnd = Math.max(currentMaxEnd, timeline[i].end);
    }
    if (currentMaxEnd < 1440) {
      gaps.push({ start: currentMaxEnd, end: 1440 });
    }

    let newStartTime = '00:00';
    let newEndTime = '04:00';

    if (gaps.length > 0) {
      gaps.sort((a, b) => (b.end - b.start) - (a.end - a.start));
      const largestGap = gaps[0];
      const startH = Math.floor(largestGap.start / 60);
      const startM = largestGap.start % 60;
      let endH = Math.floor(largestGap.end / 60);
      const endM = largestGap.end % 60;
      if (endH === 24 && endM === 0) {
        endH = 0;
      } else {
        endH = endH % 24;
      }
      newStartTime = `${startH.toString().padStart(2, '0')}:${startM.toString().padStart(2, '0')}`;
      newEndTime = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
    } else {
      message.error('Các ca đã kín 24h, không thể thêm ca mới!');
      return;
    }

    setConfig(prev => {
      const newColor = prev.shifts.length % 2 === 0
        ? 'bg-blue-100 border-blue-300 text-blue-800'
        : 'bg-indigo-100 border-indigo-300 text-indigo-800';

      return {
        ...prev,
        shifts: [...prev.shifts, {
          id: newId,
          name: `New Shift ${prev.shifts.length + 1}`,
          startTime: newStartTime,
          endTime: newEndTime,
          color: newColor,
          slices: [{ id: `slice_${Date.now()}`, duration: null, price: 10000, isTail: true }]
        }]
      };
    });
    setSelectedShiftId(newId);
  };

  const handleDeleteShift = () => {
    if (!selectedShiftId) return;
    if (config.shifts.length <= 1) {
      message.error('System requires at least 1 shift!');
      return;
    }
    setConfig(prev => ({
      ...prev,
      shifts: prev.shifts.filter(s => s.id !== selectedShiftId)
    }));
    setSelectedShiftId(null);
    setSelectedSliceId(null);
  };

  const handleAddSlice = () => {
    if (!selectedShiftId) return;
    const newId = `slice_${Date.now()}`;
    setConfig(prev => ({
      ...prev,
      shifts: prev.shifts.map(s => {
        if (s.id !== selectedShiftId) return s;
        const tailIndex = s.slices.findIndex(sl => sl.isTail);
        const newSlice = { id: newId, duration: 60, price: 10000, isTail: false };
        const newSlices = [...s.slices];
        if (tailIndex !== -1) {
          newSlices.splice(tailIndex, 0, newSlice);
        } else {
          newSlices.push(newSlice);
        }
        return { ...s, slices: newSlices };
      })
    }));
  };

  const handleDeleteSlice = () => {
    if (!selectedShiftId || !selectedSliceId) return;
    setConfig(prev => ({
      ...prev,
      shifts: prev.shifts.map(s => {
        if (s.id !== selectedShiftId) return s;
        return { ...s, slices: s.slices.filter(sl => sl.id !== selectedSliceId) };
      })
    }));
    setSelectedSliceId(null);
  };

  const handleMoveSlice = (direction: 'left' | 'right') => {
    if (!selectedShiftId || !selectedSliceId) return;
    setConfig(prev => ({
      ...prev,
      shifts: prev.shifts.map(s => {
        if (s.id !== selectedShiftId) return s;
        const idx = s.slices.findIndex(sl => sl.id === selectedSliceId);
        if (idx === -1 || s.slices[idx].isTail) return s;
        const newIdx = direction === 'left' ? idx - 1 : idx + 1;
        if (newIdx < 0 || newIdx >= s.slices.length || s.slices[newIdx].isTail) return s;

        const newSlices = [...s.slices];
        [newSlices[idx], newSlices[newIdx]] = [newSlices[newIdx], newSlices[idx]];
        return { ...s, slices: newSlices };
      })
    }));
  };

  const checkTimelineCoverage = () => {
    let totalMins = 0;
    config.shifts.forEach(s => {
      const start = parseTime(s.startTime);
      let end = parseTime(s.endTime);
      if (end <= start) end += 24 * 60;
      totalMins += (end - start);
    });
    // Allow 1 minute tolerance (e.g., ends at 23:59 instead of 00:00)
    return totalMins >= 1439 && totalMins <= 1440;
  };
  const is24HCovered = checkTimelineCoverage();

  return (
    <div className="flex h-[calc(100vh-64px)] bg-gray-50 text-gray-800 overflow-hidden font-sans">

      {/* 1. LEFT COLUMN: MAIN PRICING CANVAS */}
      <div className="flex-1 flex flex-col bg-white border-r border-gray-200 shadow-sm z-10 overflow-hidden">

        {/* Header / Tabs */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-white z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100">
              <DollarOutlined className="text-blue-600 text-xl" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-800 m-0">Price List Configuration</h1>
              <p className="text-xs text-gray-500 m-0">Manage fare matrix & Time</p>
            </div>
          </div>

          <div className="flex bg-gray-100/80 p-1.5 rounded-xl border border-gray-200 shadow-inner gap-1">
            {vehicleTypesData?.map((vt: any) => (
              <button
                key={vt.id}
                onClick={() => setActiveTabId(vt.id)}
                className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition-all duration-300 cursor-pointer border-none outline-none ${activeTabId === vt.id ? 'bg-white text-blue-600 shadow ring-1 ring-black/5 scale-[1.02]' : 'bg-transparent text-gray-500 hover:text-gray-800 hover:bg-gray-200/70'}`}
              >
                <span className="text-lg flex items-center justify-center">{vt.iconUrl ? <img src={getImageUrl(vt.iconUrl)} style={{ width: 50, height: 50, objectFit: 'contain', transform: vt.category === 'TWO_WHEEL' ? 'scale(1.6)' : 'scale(1.1)' }} /> : (vt.category === 'FOUR_WHEEL' ? '🚗' : '🛵')}</span>
                {vt.typeName}
              </button>
            ))}
          </div>
        </div>

        {/* Canvas Body */}
        <div className="flex-1 p-6 flex flex-col gap-8 overflow-y-auto custom-scrollbar bg-gray-50/50">

          {/* Master Timeline 24H */}
          <div className="space-y-3 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide flex items-center gap-2 m-0">
                <ClockCircleOutlined />  Overall Time Axis (24H)
              </h3>
              <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={handleAddShift}>

                Add Ca
              </Button>
            </div>

            {!is24HCovered && (
              <div className="text-xs text-amber-600 font-semibold bg-amber-50 px-3 py-2 rounded-md border border-amber-200 inline-block mb-2">

                ⚠️ The total time of the cases is not 24 hours or there is an overlap. Please check again.
              </div>
            )}

            <div className="relative h-16 bg-gray-100 rounded-lg border border-gray-200 overflow-hidden mt-4">
              {/* Grid Lines */}
              <div className="absolute inset-0 flex justify-between px-2 opacity-30 pointer-events-none">
                {[0, 6, 12, 18, 24].map(h => (
                  <div key={h} className="h-full border-l border-dashed border-gray-400 relative">
                    <span className="absolute -bottom-6 -translate-x-1/2 text-xs font-mono text-gray-500">{h.toString().padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>

              {/* Shift Blocks */}
              {config.shifts.map(shift => {
                const { left, width, isWrap } = getShiftPosition(shift.startTime, shift.endTime);
                const isSelected = selectedShiftId === shift.id;

                const renderBlock = (styleLeft: string, styleWidth: string, extraClasses: string = '') => (
                  <div
                    onClick={() => {
                      setSelectedShiftId(shift.id);
                      setSelectedSliceId(null);
                      setActiveAccordion(prev => {
                        const arr = Array.isArray(prev) ? prev : [prev];
                        return arr.includes('2') ? arr : [...arr, '2'];
                      });
                    }}
                    className={`absolute top-1 bottom-1 rounded-md transition-all duration-200 cursor-pointer flex items-center justify-center border
                        ${shift.color} ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2 z-10' : 'opacity-80 hover:opacity-100'} ${extraClasses}`}
                    style={{ left: styleLeft, width: styleWidth }}
                  >
                    <span className={`text-xs font-bold px-2 truncate`}>
                      {shift.name} ({shift.startTime} - {shift.endTime})
                    </span>
                  </div>
                );

                if (isWrap) {
                  const startMins = parseTime(shift.startTime);
                  const width1 = ((24 * 60 - startMins) / (24 * 60)) * 100;
                  const endMins = parseTime(shift.endTime);
                  const width2 = (endMins / (24 * 60)) * 100;
                  return (
                    <React.Fragment key={shift.id}>
                      {renderBlock(`${(startMins / (24 * 60)) * 100}%`, `${width1}%`, 'rounded-r-none border-r-0')}
                      {renderBlock('0%', `${width2}%`, 'rounded-l-none border-l-0')}
                    </React.Fragment>
                  )
                }

                return <React.Fragment key={shift.id}>{renderBlock(left, width)}</React.Fragment>;
              })}
            </div>
            <div className="h-4"></div> {/* Spacer for time labels */}
          </div>

          {/* Shift Slicing Workspace */}
          <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm p-6 flex flex-col relative overflow-hidden">
            <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wide m-0 mb-6 flex items-center gap-2">
              <DollarOutlined />  Price Cutting Class: <span className="text-blue-600">{selectedShift?.name || 'Ca not selected'}</span>
            </h3>

            {selectedShift ? (
              <div className="flex-1 flex flex-col relative py-4">

                {(() => {
                  const shiftDur = getShiftDuration(selectedShift);
                  const othersSum = selectedShift.slices.filter(s => !s.isTail).reduce((sum, s) => sum + (s.duration || 0), 0);
                  const tailDuration = Math.max(0, shiftDur - othersSum);
                  const isOverLimit = othersSum > shiftDur;

                  return (
                    <>
                      {isOverLimit && (
                        <div className="text-xs text-red-600 font-semibold bg-red-50 px-3 py-2 rounded-md border border-red-200 mb-4 inline-block self-start">

                          ⚠️ Total class time exceeds shift duration ({othersSum}/{shiftDur}  min)e The key layer is currently 0 Minutes
                        </div>
                      )}

                      <div className="flex gap-4 items-stretch w-full overflow-x-auto pb-4 custom-scrollbar px-2">
                        {selectedShift.slices.map((slice, index) => {
                          const isTail = slice.isTail;
                          const isSelected = selectedSliceId === slice.id;
                          const displayDuration = isTail ? tailDuration : slice.duration;

                          return (
                            <div
                              key={slice.id}
                              onClick={() => {
                                setSelectedSliceId(slice.id);
                                setActiveAccordion(prev => {
                                  const arr = Array.isArray(prev) ? prev : [prev];
                                  return arr.includes('3') ? arr : [...arr, '3'];
                                });
                              }}
                              className={`relative flex-shrink-0 flex flex-col justify-center items-center p-4 rounded-lg border-2 transition-all cursor-pointer group
                                ${isTail ? 'bg-blue-50 border-blue-200 w-48' : 'bg-white border-gray-200 hover:border-gray-300 w-40'}
                                ${isSelected ? '!border-blue-500 shadow-md scale-105 z-10' : ''}
                                ${isTail && isOverLimit ? '!border-red-300 bg-red-50' : ''}
                              `}
                            >
                              <div className="text-xs text-gray-500 mb-2 font-medium uppercase">
                                {isTail ? 'Latch Layer (Automatic)' : `Layer ${index + 1}`}
                              </div>
                              <div className={`text-lg font-bold mb-3 flex items-center gap-2 ${isTail && isOverLimit ? 'text-red-500' : 'text-gray-800'}`}>
                                {isTail ? `${displayDuration} Minutes` : `${slice.duration} Minutes`}
                              </div>
                              <div className="bg-green-100 text-green-700 px-3 py-1 rounded-md text-sm font-bold border border-green-200">
                                {(slice.price || 0).toLocaleString()}  D
                              </div>

                              {/* Connection arrow between blocks */}
                              {!isTail && (
                                <div className="absolute -right-4 top-1/2 -translate-y-1/2 z-0 text-gray-300">
                                  <ArrowRightOutlined />
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Add Slice block */}
                        <div
                          onClick={handleAddSlice}
                          className="w-32 flex-shrink-0 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 hover:text-blue-500 hover:border-blue-400 hover:bg-blue-50 transition-all cursor-pointer ml-4"
                        >
                          <PlusOutlined className="text-2xl" />
                        </div>
                      </div>
                    </>
                  );
                })()}

              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-400 bg-gray-50 rounded-lg border border-gray-200 border-dashed">
                <div className="text-center">
                  <ClockCircleOutlined className="text-3xl mb-2 text-gray-300" />
                  <p>Please select a Shift on the Time axis to configure the cutting layer</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 2. RIGHT COLUMN: INSPECTOR PANEL */}
      <div className="w-[450px] bg-white flex flex-col relative z-20">

        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
          <h2 className="text-sm font-bold text-gray-700 m-0 uppercase tracking-wide">Parameter configuration</h2>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar pb-32">

          {/* CALCULATOR WIDGET FIXED AT TOP OF INSPECTOR */}
          <div className="p-4 border-b border-gray-200 bg-blue-50/50">
            <div className="flex items-center gap-2 text-blue-700 font-bold text-sm mb-3">
              <CalculatorOutlined />  WIDGET COMPUTATION TEST
            </div>

            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Time to Enter</label>
                <TimePicker
                  className="w-full"
                  format="HH:mm"
                  value={timeIn}
                  onChange={setTimeIn}
                  allowClear={false}
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs text-gray-500 mb-1">Out time</label>
                <TimePicker
                  className="w-full"
                  format="HH:mm"
                  value={timeOut}
                  onChange={setTimeOut}
                  allowClear={false}
                />
              </div>
              <div className="pt-5">
                <Button type="primary" onClick={calculatePrice} loading={testCalculateMutation.isPending} className="bg-blue-600 shadow-sm">Calculate</Button>
              </div>
            </div>

            {/* Output Screen */}
            <div className="bg-white rounded-lg p-3 border border-gray-200 shadow-sm min-h-[90px] flex flex-col justify-between">
              {calcResult ? (
                <>
                  <div className="text-xs text-gray-600 space-y-1 mb-2">
                    <div className="font-semibold text-gray-800 mb-1 border-b border-gray-100 pb-1">

                      Total Parking Time: {calcResult.minutes}  minute
                    </div>
                    {calcResult.breakdown.map((line, i) => <div key={i}>{line}</div>)}
                  </div>
                  <div className="text-right pt-2 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-xs text-gray-500 font-bold">TOTAL</span>
                    <span className="text-lg text-green-600 font-bold">
                      {calcResult.total.toLocaleString()}  D
                    </span>
                  </div>
                </>
              ) : (
                <div className="text-gray-400 text-xs flex h-full items-center justify-center">

                  None calculated data
                </div>
              )}
            </div>
          </div>

          <Collapse
            activeKey={activeAccordion}
            onChange={setActiveAccordion}
            ghost
            expandIconPosition="end"
            className="[&_.ant-collapse-item]:border-b [&_.ant-collapse-item]:border-gray-200 [&_.ant-collapse-header]:text-gray-800 [&_.ant-collapse-header]:font-bold [&_.ant-collapse-header]:p-4"
          >
            {/* Section 1: Global */}
            <Panel header={<span className="text-orange-500 text-sm"><CarOutlined className="mr-2" />  GLOBAL CONFIGURATION</span>} key="1">
              <div className="space-y-4 px-2 pb-2">
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-700 font-semibold text-sm">Monthly Passes Price (VND)</span>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 block mb-1 font-medium">Monthly Pass fee for this Vehicle</label>
                    <InputNumber className="w-full font-mono text-blue-600" placeholder="VD: 1000000" value={config.monthlyRate} onChange={v => updateConfig('monthlyRate', v || 0)} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                  </div>
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-gray-700 font-semibold text-sm">Base Guard</span>
                    <Switch checked={config.globalBaseGuardEnabled} onChange={v => updateConfig('globalBaseGuardEnabled', v)} />
                  </div>
                  <div className="space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">Time mark (Minutes)</label>
                      <InputNumber disabled={!config.globalBaseGuardEnabled} className="w-full" value={config.globalBaseGuardTime} onChange={v => updateConfig('globalBaseGuardTime', v || 0)} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">Price (VND)</label>
                      <InputNumber disabled={!config.globalBaseGuardEnabled} className="w-full font-mono text-green-600" value={config.globalBaseGuardPrice} onChange={v => updateConfig('globalBaseGuardPrice', v || 0)} formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
                    </div>
                  </div>
                </div>
              </div>
            </Panel>

            {/* Section 2: Shift */}
            {selectedShiftId && (
              <Panel header={<span className="text-blue-500 text-sm"><ClockCircleOutlined className="mr-2" />  CONFIGURATION Ca</span>} key="2">
                <div className="space-y-4 px-2 pb-2">
                  <div>
                    <label className="text-xs text-gray-500 block mb-1 font-medium">Name Ca</label>
                    <Input value={selectedShift?.name} onChange={e => {
                      setConfig(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === selectedShiftId ? { ...s, name: e.target.value } : s) }));
                    }} />
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">Begin</label>
                      <TimePicker className="w-full" value={simulatedDayjs(selectedShift?.startTime, 'HH:mm')} format="HH:mm" allowClear={false} onChange={(t, ts) => {
                        if (typeof ts === 'string') {
                          setConfig(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === selectedShiftId ? { ...s, startTime: ts } : s) }));
                        }
                      }} />
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">End</label>
                      <TimePicker className="w-full" value={simulatedDayjs(selectedShift?.endTime, 'HH:mm')} format="HH:mm" allowClear={false} onChange={(t, ts) => {
                        if (typeof ts === 'string') {
                          setConfig(prev => ({ ...prev, shifts: prev.shifts.map(s => s.id === selectedShiftId ? { ...s, endTime: ts } : s) }));
                        }
                      }} />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2 border-t border-gray-100">
                    <Button danger size="small" icon={<DeleteOutlined />} onClick={handleDeleteShift}>

                      Delete This Song
                    </Button>
                  </div>
                </div>
              </Panel>
            )}

            {/* Section 3: Slice */}
            {selectedSliceId && selectedSlice && (
              <Panel header={<span className="text-green-600 text-sm"><DollarOutlined className="mr-2" />  CUT LAYER Detail</span>} key="3">
                <div className="space-y-4 px-2 pb-2">
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <h4 className="text-green-800 font-bold mb-4 text-sm flex justify-between items-center">
                      <span>Configuration Layer no {selectedShift?.slices.findIndex(s => s.id === selectedSliceId) !== undefined ? (selectedShift!.slices.findIndex(s => s.id === selectedSliceId) + 1) : 'X'}</span>
                      {selectedSlice.isTail && <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">Latch Class</span>}
                    </h4>

                    <div className="space-y-4">
                      <div>
                        <label className="text-xs text-gray-600 block mb-1 font-medium">

                          Duration {selectedSlice.isTail && "(Automatic calculation)"}
                        </label>
                        <InputNumber
                          disabled={selectedSlice?.isTail}
                          className="w-full"
                          value={selectedSlice?.isTail ? getTailDuration(selectedShift!) : selectedSlice?.duration}
                          onChange={v => handleSliceUpdate('duration', v)}
                          addonAfter={<span className="text-gray-500 text-xs">Minute</span>}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 block mb-1 font-medium">Price applies</label>
                        <InputNumber
                          className="w-full font-mono text-green-600 text-base"
                          value={selectedSlice?.price}
                          onChange={v => handleSliceUpdate('price', v)}
                          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          addonAfter={<span className="text-gray-500 text-xs">VND</span>}
                        />
                      </div>

                      <div className="flex justify-between items-center pt-3 mt-4 border-t border-green-200/60 border-dashed">
                        <div className="flex gap-2">
                          <Button
                            size="small"
                            icon={<ArrowLeftOutlined />}
                            disabled={selectedSlice.isTail || selectedShift!.slices.findIndex(s => s.id === selectedSliceId) === 0}
                            onClick={() => handleMoveSlice('left')}
                          />
                          <Button
                            size="small"
                            icon={<ArrowRightOutlined />}
                            disabled={selectedSlice.isTail || selectedShift!.slices.findIndex(s => s.id === selectedSliceId) >= selectedShift!.slices.length - 2}
                            onClick={() => handleMoveSlice('right')}
                          />
                        </div>
                        <Button
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          disabled={selectedSlice.isTail}
                          onClick={handleDeleteSlice}
                        >

                          Delete Class
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Panel>
            )}

          </Collapse>
        </div>

        {/* BOTTOM ACTION - FIXED */}
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-200 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] z-30 flex gap-3">
          <Button size="large" icon={<CloseOutlined />} className="flex-1 bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100" onClick={() => {
            if (initialConfig) {
              setConfig(JSON.parse(JSON.stringify(initialConfig)));
            }
          }}>
            Cancel
          </Button>
          <Button
            size="large" type="primary" icon={<SaveOutlined />}
            className="flex-[2] bg-blue-600 hover:bg-blue-500 border-none font-bold shadow-md"
            onClick={() => setIsConfirmModalOpen(true)}
            disabled={!isDirty}
          >

            SAVE PRICE LIST
          </Button>
        </div>

      </div>

      {/* CONFIRMATION MODAL */}
      <Modal
        title={<span className="text-red-500 font-bold flex items-center gap-2"><InfoCircleOutlined />  Confirm CASH FLOW CHANGE</span>}
        open={isConfirmModalOpen}
        onCancel={() => setIsConfirmModalOpen(false)}
        footer={null}
        centered
        width={400}
      >
        <div className="py-4 text-gray-700">
          <p className="mb-4 text-sm">This action will Update the payment algorithm <strong>{vehicleTypesData?.find((v: any) => v.id === activeTabId)?.typeName}</strong>e Please type Confirm:</p>
          <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4">
            <p className="mb-2 text-xs text-gray-500 flex justify-between">
              <span>Confirmation code:</span>
              <strong className="text-blue-600 bg-blue-50 px-1 rounded font-mono">XACNHAN</strong>
            </p>
            <Input
              autoFocus
              placeholder="Type XaCNHaNeee"
              value={confirmInput}
              onChange={e => setConfirmInput(e.target.value)}
              className="text-center font-mono uppercase"
              onPressEnter={handleSave}
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setIsConfirmModalOpen(false)} className="flex-1">Cancel Cancel</Button>
            <Button type="primary" danger onClick={handleSave} disabled={confirmInput.toUpperCase() !== 'XACNHAN'} className="flex-1 font-bold">

              Confirm SAVE
            </Button>
          </div>
        </div>
      </Modal>

      {/* Global Style Overrides */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
      `}</style>
    </div>
  );
};
