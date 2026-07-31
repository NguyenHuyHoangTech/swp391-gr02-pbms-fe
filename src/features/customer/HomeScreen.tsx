import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';
import { useNavigate } from 'react-router-dom';
import { DatePicker } from 'antd';
import { simulatedDayjs } from '../../core/utils/timeProvider';
import dayjs from 'dayjs';
import {
  CarOutlined,
  ClockCircleOutlined,
  BookOutlined
} from '@ant-design/icons';

// Data structures
type VehicleType = 'CAR' | 'MOTORBIKE' | 'EBIKE';

interface SlotData {
  type: string;
  label: string;
  available: number;
  icon: React.ReactNode;
}

export const HomeScreen = () => {
  const navigate = useNavigate();
  // 1. REAL-TIME STATE
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState<string | null>(null);

  // 2. HERO FORM STATE
  const [formVehicle, setFormVehicle] = useState<string>('');
  const [formArrivalTime, setFormArrivalTime] = useState<dayjs.Dayjs | null>(() => simulatedDayjs().add(30, 'minute'));

  const { data: parkingStatusData } = useQuery({
    queryKey: ['public-parking-status'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/parking-status');
        return res.data.data;
      } catch (err) {
        return [];
      }
    },
    refetchInterval: 5000 // Real-time polling
  });

  const { data: vehicleTypes } = useQuery({
    queryKey: ['public-vehicle-types'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/vehicle-types');
        return res.data.data;
      } catch (err) {
        return [];
      }
    }
  });

  useEffect(() => {
    if (parkingStatusData && parkingStatusData.length > 0) {
      let filteredData = parkingStatusData;
      if (vehicleTypes) {
        const activeVTs = vehicleTypes.filter((vt: any) => vt.status === 'ACTIVE');
        const nonBlockedLabels = activeVTs.map((vt: any) => vt.typeName);
        filteredData = parkingStatusData.filter((d: any) => nonBlockedLabels.includes(d.label));

        if (!selectedVehicleTypeId && activeVTs.length > 0) {
          setSelectedVehicleTypeId(activeVTs[0].id);
        }
        if (!formVehicle && activeVTs.length > 0) {
          setFormVehicle(activeVTs[0].id);
        }
      }

      setSlots(filteredData.map((d: any) => {
        const matchedVt = (vehicleTypes || []).find((vt: any) => vt.typeName === d.label);
        let iconElement: React.ReactNode = <CarOutlined />;
        if (matchedVt && matchedVt.iconUrl) {
          iconElement = <img src={getImageUrl(matchedVt.iconUrl)} style={{ width: 32, height: 32, objectFit: 'contain' }} alt={d.label} />;
        } else {
          const nameLower = d.label.toLowerCase();
          if (nameLower.includes('motor') || nameLower.includes('máy')) iconElement = <span className="text-2xl leading-none">🏍️</span>;
          else if (nameLower.includes('bike') || nameLower.includes('bicycle') || nameLower.includes('đạp')) iconElement = <span className="text-2xl leading-none">🚲</span>;
          else if (nameLower.includes('truck') || nameLower.includes('tải')) iconElement = <span className="text-2xl leading-none">🚐</span>;
          else if (d.type === 'TWO_WHEEL') iconElement = <span className="text-2xl leading-none">🏍️</span>;
          else if (d.type === 'EBIKE') iconElement = <span className="text-2xl leading-none">⚡</span>;
        }

        return {
          type: d.type,
          label: d.label,
          available: d.available,
          icon: iconElement
        };
      }));
    }

    if (!formArrivalTime) {
      setFormArrivalTime(simulatedDayjs().add(30, 'minute'));
    }
  }, [parkingStatusData, vehicleTypes]);

  const { data: pricingPolicies } = useQuery({
    queryKey: ['public-pricing'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/public/pricing');
        return res.data.data;
      } catch (err) {
        return [];
      }
    }
  });

  const { data: buildingProfile } = useQuery({
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

  // Helpers for Slot rendering (New UI)
  const renderSlotCard = (slot: SlotData) => {
    const isFull = slot.available === 0;
    const isWarning = slot.available > 0 && slot.available <= 5;

    let borderClass = "border-gray-200 hover:border-cyan-400";
    let iconBg = "bg-blue-50 text-blue-600";
    let statusBg = "bg-green-100 text-green-700 border-green-200";
    let statusText = "Available";
    let numberColor = "text-green-600";

    if (isFull) {
      borderClass = "border-red-200 grayscale-[50%]";
      iconBg = "bg-red-50 text-red-400";
      statusBg = "bg-red-100 text-red-600 border-red-200 animate-pulse";
      statusText = "SOLD OUT";
      numberColor = "text-red-600";
    } else if (isWarning) {
      borderClass = "border-orange-200 hover:border-orange-400";
      iconBg = "bg-orange-50 text-orange-500";
      statusBg = "bg-orange-100 text-orange-700 border-orange-200";
      statusText = "Almost Full";
      numberColor = "text-orange-600";
    }

    const nameLower = slot.label.toLowerCase();
    if (nameLower.includes('motor') || nameLower.includes('máy') || slot.type === 'TWO_WHEEL') {
      iconBg = "bg-purple-50 text-purple-600";
    } else if (nameLower.includes('điện') || nameLower.includes('electric') || nameLower.includes('ebike') || nameLower.includes('e_bike') || slot.type === 'EBIKE') {
      iconBg = "bg-cyan-50 text-cyan-600";
    } else if (nameLower.includes('đạp') || nameLower.includes('bicycle')) {
      iconBg = "bg-emerald-50 text-emerald-600";
    }

    return (
      <div key={slot.type} className={`bg-white/80 backdrop-blur-xl rounded-2xl p-6 relative border ${borderClass} shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1`}>
        <div className={`w-14 h-14 rounded-full ${iconBg} flex items-center justify-center mb-6 text-3xl shadow-inner`}>
          {slot.icon}
        </div>
        <h3 className="text-lg font-bold text-slate-800">{slot.label}</h3>
        <div className="mt-4 flex flex-col md:flex-row md:items-end justify-between relative z-10 gap-3">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide font-semibold">Available Slots</p>
            <p className={`text-4xl font-black font-mono mt-1 ${numberColor}`}>{isFull ? '00' : slot.available}</p>
          </div>
          <span className={`text-[10px] md:text-xs px-2 md:px-3 py-1 md:py-1.5 rounded-full border font-bold text-center ${statusBg}`}>{statusText}</span>
        </div>
      </div>
    );
  };

  // Pricing rendering
  const renderPricingCards = () => {
    if (!pricingPolicies || pricingPolicies.length === 0) return <p className="text-slate-500 italic text-center">System is updating pricing...</p>;

    const activeVTs = (vehicleTypes || []).filter((vt: any) => vt.status === 'ACTIVE');
    if (activeVTs.length === 0) return null;

    const selectedVt = activeVTs.find((vt: any) => vt.id === selectedVehicleTypeId) || activeVTs[0];
    const policy = pricingPolicies.find((p: any) => p.vehicleTypeId === selectedVt.id);

    return (
      <div className="w-full">
        <div className="flex flex-wrap justify-center gap-4 mb-12">
          {activeVTs.map((vt: any) => {
            const isSelected = vt.id === selectedVehicleTypeId;
            return (
              <button
                key={vt.id}
                onClick={() => setSelectedVehicleTypeId(vt.id)}
                className={`px-8 py-3 rounded-full font-bold transition-all duration-300 shadow-sm ${isSelected
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_4px_14px_0_rgba(6,182,212,0.39)] transform -translate-y-1'
                    : 'bg-white text-slate-500 border border-slate-200 hover:border-cyan-300 hover:text-cyan-600'
                  }`}
              >
                {vt.typeName}
              </button>
            );
          })}
        </div>

        {policy ? (
          <div key={selectedVt.id} className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto animate-fade-in">
            {/* Khách vãng lai */}
            <details className="group bg-white/90 backdrop-blur-xl rounded-3xl border border-slate-200 shadow-lg hover:border-cyan-300 transition-all duration-300 [&_summary::-webkit-details-marker]:hidden">
              <summary className="p-8 cursor-pointer list-none flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-2xl font-bold text-slate-800">Walk-in Guests</h3>
                    <span className="text-cyan-500 transform transition-transform duration-300 group-open:rotate-180 bg-cyan-50 p-2 rounded-full">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-6 font-medium">Suitable for short-term parking. Click for details.</p>
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-black text-slate-800 font-mono tracking-tighter">
                      {policy.globalBaseFee?.toLocaleString() || '0'}
                      <span className="text-2xl text-slate-400 font-sans ml-1">VND</span>
                    </span>
                    <span className="text-slate-500 font-medium mb-1">/ {policy.globalBaseMins} mins</span>
                  </div>
                </div>
              </summary>

              <div className="px-8 pb-8 pt-2 border-t border-slate-100">
                <ul className="space-y-4 text-sm text-slate-600 font-medium mt-4">
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Flexible payment at the exit gate</li>
                  <li className="flex items-center gap-3"><svg className="w-5 h-5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> 99% accurate LPR license plate recognition</li>


                  {/* Chi tiết ca đỗ */}
                  {policy.shifts && policy.shifts.length > 0 && (
                    <div className="mt-6 pt-4 border-t border-dashed border-slate-200">
                      <h4 className="font-bold text-slate-800 mb-3">Shift pricing details:</h4>
                      {policy.shifts.map((shift: any, idx: number) => (
                        <div key={idx} className="mb-4 last:mb-0 p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <div className="font-bold text-slate-700 mb-2 flex items-center gap-2">
                            <ClockCircleOutlined className="text-cyan-600" />
                            Shift: {shift.shiftName} ({shift.startTime} - {shift.endTime})
                          </div>
                          <div className="space-y-1 mt-2">
                            {shift.blocks?.map((b: any, bIdx: number) => (
                              <div key={bIdx} className="flex justify-between text-sm text-slate-600 border-b border-slate-200 border-dashed last:border-0 py-1.5">
                                <span>Block {b.blockOrder} ({b.durationMins} mins)</span>
                                <span className="font-bold text-slate-800">{b.fee?.toLocaleString()} VND</span>
                              </div>
                            ))}
                            {(!shift.blocks || shift.blocks.length === 0) && (
                              <div className="text-slate-400 italic text-sm">No pricing blocks for this shift</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </ul>
              </div>
            </details>

            {/* Vé tháng */}
            {policy.monthlyRate > 0 && (
              <div className="rounded-3xl p-1 bg-gradient-to-b from-cyan-400 to-blue-600 shadow-xl transform md:-translate-y-4 hover:shadow-2xl transition-all duration-300">
                <div className="bg-white h-full rounded-[23px] p-8 relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <div className="absolute top-4 right-4 bg-cyan-100 text-cyan-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide border border-cyan-200">Best Value</div>

                    <h3 className="text-2xl font-bold text-slate-800 mb-2">Monthly Pass</h3>
                    <p className="text-sm text-slate-500 mb-6 font-medium">Optimal solution for residents and office workers.</p>
                    <div className="mb-6 pb-6 border-b border-slate-100 flex items-end gap-2">
                      <span className="text-5xl font-black text-slate-800 font-mono tracking-tighter">
                        {policy.monthlyRate?.toLocaleString()}
                        <span className="text-2xl text-slate-400 font-sans ml-1">VND</span>
                      </span>
                      <span className="text-slate-500 font-medium mb-1">/ month</span>
                    </div>
                    <ul className="space-y-4 text-sm text-slate-600 mb-8 relative z-10 font-medium">
                      <li className="flex items-center gap-3"><svg className="w-5 h-5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> <strong className="text-slate-800">Fixed parking spot in VIP ZONE</strong></li>
                      <li className="flex items-center gap-3"><svg className="w-5 h-5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Unlimited entry/exit</li>
                      <li className="flex items-center gap-3"><svg className="w-5 h-5 text-cyan-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg> Integrated anti-copy RFID physical card</li>
                    </ul>
                  </div>
                  <button
                    onClick={() => navigate('/customer/monthly-pass')}
                    className="w-full mt-4 py-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold transition shadow-lg relative z-10 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    Register Monthly Pass Now
                  </button>

                  <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-cyan-50 blur-3xl rounded-full"></div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-slate-500 italic text-center">No pricing table for this vehicle type yet.</p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 font-sans selection:bg-cyan-200">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-20">

        {/* HERO SECTION */}
        <section className="relative rounded-[2rem] md:rounded-[2.5rem] bg-white overflow-hidden shadow-sm border border-slate-100 min-h-[auto] md:min-h-[75vh] flex flex-col justify-center pt-8 pb-8 px-4 md:px-8 lg:px-12 mt-4 md:mt-8">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-blue-50/30 to-indigo-50/20"></div>
          <div className="absolute top-0 right-0 w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-cyan-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className="absolute bottom-0 left-0 w-[300px] md:w-[600px] h-[300px] md:h-[600px] bg-blue-400/10 rounded-full blur-3xl translate-y-1/3 -translate-x-1/3"></div>

          <div className="relative z-10 w-full flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
            <div className="flex-1 w-full max-w-2xl text-center lg:text-left mt-8 lg:mt-0">
              <div className="inline-flex items-center gap-2 px-3 md:px-4 py-1.5 md:py-2 rounded-full border border-cyan-200 bg-cyan-50 text-cyan-700 mb-6 md:mb-8 backdrop-blur-sm shadow-sm">
                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                <span className="text-[10px] md:text-xs font-bold uppercase tracking-wider">AI Navigation System Activated</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-7xl font-black leading-tight mb-4 md:mb-6 tracking-tight text-slate-800">
                Smart space.<br className="hidden md:block" />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-500 to-blue-600 block mt-2 md:mt-0">Touchless experience.</span>
              </h1>
              <p className="text-slate-500 text-base md:text-lg lg:text-xl mb-8 md:mb-10 max-w-xl mx-auto lg:mx-0 leading-relaxed font-medium whitespace-pre-line">
                {buildingProfile?.description || `${buildingProfile?.name || "Smart parking system."} Parking easier than ever. Real-time empty slot updates, smart AI navigation, and automated payment via License Plate Recognition (LPR).`}
              </p>
            </div>

            {/* Booking Card */}
            <div className="w-full lg:max-w-md">
              <div className="bg-white/80 backdrop-blur-2xl rounded-3xl p-6 md:p-8 border border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)] relative">
                <div className="absolute -inset-0.5 bg-gradient-to-br from-cyan-400 to-blue-600 rounded-[1.6rem] blur opacity-20"></div>
                <div className="relative">
                  <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    <CarOutlined className="text-cyan-500" />
                    Pre-booking
                  </h3>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-xs text-slate-500 tracking-wider mb-2 uppercase font-bold">Vehicle Type</label>
                      <select
                        value={formVehicle}
                        onChange={(e) => setFormVehicle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 py-3.5 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all appearance-none font-medium"
                      >
                        {(vehicleTypes || []).filter((vt: any) => vt.status === 'ACTIVE').map((vt: any) => (
                          <option key={vt.id} value={vt.id}>{vt.typeName}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-slate-500 tracking-wider mb-2 uppercase font-bold">Expected Arrival Time</label>
                      <div className="hidden md:block">
                        <DatePicker
                          showTime
                          format="HH:mm DD/MM/YYYY"
                          value={formArrivalTime}
                          onChange={(val) => val && setFormArrivalTime(val)}
                          className="w-full h-[52px] rounded-xl bg-slate-50 border-slate-200 hover:border-cyan-400 focus:border-cyan-400 font-medium text-lg"
                          minDate={simulatedDayjs()}
                          inputReadOnly={true}
                        />
                      </div>
                      <div className="block md:hidden">
                        <input
                          type="datetime-local"
                          className="w-full h-[52px] bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-4 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all font-medium text-base"
                          value={formArrivalTime ? formArrivalTime.format('YYYY-MM-DDTHH:mm') : ''}
                          min={simulatedDayjs().format('YYYY-MM-DDTHH:mm')}
                          onChange={(e) => { if (e.target.value) setFormArrivalTime(dayjs(e.target.value)) }}
                        />
                      </div>
                    </div>

                    <div className="pt-2">
                      <button
                        onClick={() => navigate('/customer/pre-booking', { state: { vehicleTypeId: parseInt(formVehicle), arrivalTime: formArrivalTime?.toISOString() } })}
                        className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold py-4 px-8 rounded-xl shadow-[0_4px_14px_0_rgba(6,182,212,0.39)] hover:shadow-[0_6px_20px_rgba(6,182,212,0.23)] hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200"
                      >
                        CONTINUE BOOKING
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* STATUS SECTION */}
        <section className="relative">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 md:mb-10 pb-6 border-b border-slate-200 gap-4">
            <div>
              <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
                <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]"></span>
                Parking Status
              </h2>
              <p className="text-slate-500 mt-2 font-medium">Real-time data updated directly from AI/IoT sensor system</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-cyan-600 font-mono bg-cyan-50 px-3 py-1.5 rounded-full border border-cyan-100">
              <ClockCircleOutlined /> Last updated: Just now
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {slots.length > 0 ? slots.map(renderSlotCard) : (
              <div className="col-span-full py-12 text-center text-slate-400 bg-white rounded-2xl border border-dashed border-slate-200">
                No parking data.
              </div>
            )}
          </div>
        </section>

        {/* PRICING SECTION */}
        <section className="relative">
          <div className="text-center mb-8 md:mb-16 max-w-3xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-black text-slate-800 tracking-tight mb-4">Flexible Service Packages</h2>
            <p className="text-slate-500 font-medium text-sm md:text-base">Automated cashless payment via electronic gates. Transparent pricing, no hidden fees, integrated license plate recognition.</p>
          </div>

          {renderPricingCards()}
        </section>

      </main>
    </div>
  );
};
