// Author: Võ Trung Hiếu
import { simulatedDayjs } from '../../core/utils/timeProvider';
import { getImageUrl } from '../../core/utils/imageHelper';
import React, { useState, useMemo } from 'react';
import { Typography, Card, Row, Col, DatePicker, Button, Table, Statistic, Select, Tag, Progress, Alert } from 'antd';
import { DownloadOutlined, NodeIndexOutlined, CalendarOutlined, WarningOutlined } from '@ant-design/icons';
import { 
  AreaChart, Area, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, 
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useQuery } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export const OperationalDashboardScreen = () => {
  const [historyPage, setHistoryPage] = useState(1);
  const [historySize, setHistorySize] = useState(10);
  const [historyDateRange, setHistoryDateRange] = useState<any>([simulatedDayjs().subtract(6, 'day'), simulatedDayjs()]);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedTrafficDate, setSelectedTrafficDate] = useState<any>(simulatedDayjs());
  const [hourlyTrafficCategory, setHourlyTrafficCategory] = useState<string>('ALL');

  // === Operational live data ===
  const { data: vehicleTypes } = useQuery({
    queryKey: ['vehicleTypes'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types?activeOnly=true');
      return res.data?.data || [];
    }
  });

  const { data: historyData, isLoading: isLoadingHistory } = useQuery({
    queryKey: ['parking-history', historyPage, historySize, historyDateRange?.[0]?.format('YYYY-MM-DD'), historyDateRange?.[1]?.format('YYYY-MM-DD')],
    queryFn: async () => {
      let url = `/operation/parking-sessions/all?page=${historyPage - 1}&size=${historySize}`;
      if (historyDateRange && historyDateRange[0] && historyDateRange[1]) {
        url += `&startDate=${historyDateRange[0].format('YYYY-MM-DD')}&endDate=${historyDateRange[1].format('YYYY-MM-DD')}`;
      }
      const res = await axiosClient.get(url);
      return res.data.data;
    },
    refetchInterval: 5000
  });

  const handleExportCSV = async () => {
    try {
      setIsExporting(true);
      let url = '/operation/parking-sessions/export';
      if (historyDateRange && historyDateRange[0] && historyDateRange[1]) {
        url += `?startDate=${historyDateRange[0].format('YYYY-MM-DD')}&endDate=${historyDateRange[1].format('YYYY-MM-DD')}`;
      }
      const response = await axiosClient.get(url, { responseType: 'blob' });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const filename = `Vehicle_History_${historyDateRange?.[0]?.format('YYYYMMDD') || 'all'}_to_${historyDateRange?.[1]?.format('YYYYMMDD') || 'all'}.csv`;
      link.href = window.URL.createObjectURL(blob);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed", error);
    } finally {
      setIsExporting(false);
    }
  };

  const { data: gatesData } = useQuery({
    queryKey: ['gates-status-report'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/gates');
      return res.data.data;
    },
    refetchInterval: 5000
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['operational-dashboard', selectedTrafficDate?.format('YYYY-MM-DD')],
    queryFn: async () => {
      const dateStr = selectedTrafficDate?.format('YYYY-MM-DD');
      const res = await axiosClient.get(`/finance/dashboard/operational?date=${dateStr}`);
      return res.data.data;
    },
    refetchInterval: 5000,
    enabled: !!selectedTrafficDate
  });

  const { data: zonesData } = useQuery({
    queryKey: ['zones-dashboard'],
    queryFn: async () => {
      const res = await axiosClient.get('/infrastructure/zones/map');
      return res.data.data;
    },
    staleTime: 60000
  });


  // === Zone 4: HOURLY TRAFFIC FLOW ===
  const { data: hourlyTrafficData = [] } = useQuery({
    queryKey: ['hourly-flow', selectedTrafficDate?.format('YYYY-MM-DD')],
    queryFn: async () => {
      const dateStr = selectedTrafficDate?.format('YYYY-MM-DD');
      const res = await axiosClient.get(`/finance/dashboard/hourly-flow?date=${dateStr}`);
      return res.data.data;
    },
    enabled: !!selectedTrafficDate
  });

  // === Zone 5: MACRO TRENDS (REMOVED - Replaced by Revenue Dashboard) ===

  const liveData = useMemo(() => {
    if (dashboardData?.liveData) return dashboardData.liveData;
    return { vehicleStats: [], checkIns: 0, checkOuts: 0 };
  }, [dashboardData]);

  // Traffic Peak Hour calculation
  const trafficPeakStats = useMemo(() => {
    if (!hourlyTrafficData.length) return { peakHour: '--', maxVolume: 0 };
    let peakHour = '--';
    let maxVolume = 0;
    hourlyTrafficData.forEach((d: any) => {
      const vol = d.totalVolume || 0;
      if (vol > maxVolume) {
        maxVolume = vol;
        peakHour = d.hour;
      }
    });
    return { peakHour, maxVolume };
  }, [hourlyTrafficData]);



  // helper to calculate percent and color
  const getProgressColor = (percent: number) => {
    if (percent >= 90) return '#f5222d'; // Red
    if (percent >= 70) return '#faad14'; // Yellow
    return '#52c41a'; // Green
  };

  const renderProgressCard = (stat: any, index: number) => {
    // Walk-in & Booking
    const walkInCapacity = stat.capacityWalkIn || stat.capacity_walk_in || 0;
    const walkInOccupied = (stat.occupiedWalkIn || stat.occupied_walk_in || 0) + (stat.occupiedBooking || stat.occupied_booking || 0);
    const walkInPercent = walkInCapacity > 0 ? Math.round((walkInOccupied / walkInCapacity) * 100) : (walkInOccupied > 0 ? 100 : 0);

    // Monthly
    const monthlyCapacity = stat.capacityMonthly || stat.capacity_monthly || 0;
    const monthlyOccupied = stat.occupiedMonthly || stat.occupied_monthly || 0;
    const monthlyPercent = monthlyCapacity > 0 ? Math.round((monthlyOccupied / monthlyCapacity) * 100) : (monthlyOccupied > 0 ? 100 : 0);

    // Icon helper
    let iconElement: React.ReactNode = <span className="text-lg">🚘</span>;
    const matchedVt = vehicleTypes?.find((v: any) => v.typeName === stat.name);
    if (matchedVt && matchedVt.iconUrl) {
      iconElement = <img src={getImageUrl(matchedVt.iconUrl)} style={{ width: 28, height: 28, objectFit: 'contain' }} alt={stat.name} />;
    } else {
      const nameLower = stat.name.toLowerCase();
      if (nameLower.includes('motor')) iconElement = <span className="text-lg">🏍️</span>;
      else if (nameLower.includes('bike') || nameLower.includes('bicycle')) iconElement = <span className="text-lg">🚲</span>;
      else if (nameLower.includes('truck')) iconElement = <span className="text-lg">🚐</span>;
    }

    return (
      <div key={index} className="flex-1 min-w-[200px] max-w-[300px] bg-slate-50 border border-slate-200 p-3 rounded-lg shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          {iconElement}
          <Text strong className="text-slate-700 uppercase tracking-wide">{stat.name}</Text>
        </div>
        
        {/* Walk-in Zone */}
        <div className="mb-2">
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Walk-in Zone</span>
            <span className="font-medium text-slate-700">{walkInOccupied} / {walkInCapacity}</span>
          </div>
          <Progress 
            percent={walkInPercent} 
            strokeColor={getProgressColor(walkInPercent)} 
            size="small" 
            status={walkInPercent >= 100 ? 'exception' : 'normal'}
            showInfo={false}
          />
        </div>

        {/* Monthly Zone */}
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Monthly Zone</span>
            <span className="font-medium text-slate-700">{monthlyOccupied} / {monthlyCapacity}</span>
          </div>
          <Progress 
            percent={monthlyPercent} 
            strokeColor={getProgressColor(monthlyPercent)} 
            size="small" 
            status={monthlyPercent >= 100 ? 'exception' : 'normal'}
            showInfo={false}
          />
        </div>
      </div>
    );
  };

  const vehicleTypeKeys = useMemo(() => {
    if (!hourlyTrafficData || hourlyTrafficData.length === 0) return [];
    const firstRow = hourlyTrafficData[0];
    const types = new Set<string>();
    Object.keys(firstRow || {}).forEach(k => {
      if (k.endsWith('_in')) types.add(k.replace('_in', ''));
    });
    return Array.from(types);
  }, [hourlyTrafficData]);

  const vehicleTypeOptions = useMemo(() => {
    return [
      { value: 'ALL', label: 'All Vehicle Types' },
      ...vehicleTypeKeys.map(k => ({ value: k, label: k }))
    ];
  }, [vehicleTypeKeys]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6 pb-24">
      {/* Header */}
      <Card className="mb-6 shadow-sm">
        <div className="flex justify-between items-center">
          <Title level={3} className="m-0 flex items-center">
            <NodeIndexOutlined className="mr-3 text-blue-600" />  Operation Report
          </Title>
        </div>
      </Card>

      {/* Live Capacity */}
      <Card className="shadow-sm mb-6"
            title={
              <div className="flex justify-between items-center text-sm font-normal">
                <span className="font-bold text-gray-700">Live Capacity</span>
              </div>
            }>
        {/* Wrong Zone Alert */}
        {(() => {
          if (!liveData.vehicleStats) return null;
          const violations = liveData.vehicleStats
            .map((stat: any) => {
              const occSlots = stat.occupied_slots_monthly || 0;
              const occSoft = stat.occupied_monthly || 0;
              const wrongZoneTickets = stat.wrong_zone_tickets_count || 0;
              const diff = occSlots - wrongZoneTickets - occSoft;
              return { name: stat.name, diff: diff > 0 ? diff : 0 };
            })
            .filter((v: any) => v.diff > 0);

          if (violations.length === 0) return null;

          return (
            <Alert
              message={<span className="font-bold">🚨 Mismatch in Monthly Zone Detected!</span>}
              description={
                <div className="mt-1">
                  {violations.map((v: any, idx: number) => (
                    <div key={idx}>
                      Hardware sensors indicate <b>{v.diff} unauthorized {v.name}(s)</b> parked in the Monthly Zone without an active ticket. Please dispatch staff to investigate!
                    </div>
                  ))}
                </div>
              }
              type="error"
              showIcon
              icon={<WarningOutlined />}
              className="mb-4 border-red-400 bg-red-50"
            />
          );
        })()}

        <div className="flex flex-wrap gap-4 mt-2">
          {liveData.vehicleStats && liveData.vehicleStats.length > 0 ? (
            liveData.vehicleStats.map((stat: any, index: number) => renderProgressCard(stat, index))
          ) : (
            <Text type="secondary" className="mx-auto mt-4">Loading capacity...</Text>
          )}
        </div>
      </Card>

      {/* Traffic KPI & Date Picker */}
      <div className="flex justify-between items-end mb-4">
        <Title level={4} className="m-0 text-slate-700">Daily Traffic KPIs</Title>
        <div className="flex items-center gap-3">
          <DatePicker
            value={selectedTrafficDate}
            onChange={setSelectedTrafficDate}
            format="DD/MM/YYYY"
            allowClear={false}
            size="middle"
            showToday={false}
            renderExtraFooter={() => (
              <div style={{ textAlign: 'center', padding: '4px 0' }}>
                <Button type="link" size="small" onClick={() => setSelectedTrafficDate(simulatedDayjs())}>
                  Today (Simulated)
                </Button>
              </div>
            )}
          />
        </div>
      </div>

      {/* Live KPI */}
      <Row gutter={16} className="mb-6">
        <Col span={8}>
          <Card className="shadow-sm h-full flex flex-col justify-center">
            <Statistic title="Total Check-ins (Today)" value={liveData.checkIns} valueStyle={{ color: '#1890ff', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="shadow-sm h-full flex flex-col justify-center">
            <Statistic title="Total Check-outs (Today)" value={liveData.checkOuts} valueStyle={{ color: '#fa8c16', fontWeight: 'bold' }} />
          </Card>
        </Col>
        <Col span={8}>
          <Card className="shadow-sm h-full bg-blue-50 border-blue-200 flex flex-col justify-center">
            <Statistic 
              title="Peak Hour" 
              value={trafficPeakStats.peakHour} 
              suffix={`(${trafficPeakStats.maxVolume} veh)`}
              valueStyle={{ color: '#eb2f96', fontWeight: 'bold' }} 
            />
          </Card>
        </Col>
      </Row>

      {/* === HOURLY TRAFFIC FLOW === */}
      <Card
        className="shadow-sm mb-6 border-blue-200"
        title={
          <span className="flex items-center gap-2">
            <NodeIndexOutlined className="text-blue-600 text-lg" />
            <span className="font-bold text-lg text-blue-800">Hourly Traffic Flow (In/Out)</span>
          </span>
        }
        extra={
          <Select
            value={hourlyTrafficCategory}
            onChange={setHourlyTrafficCategory}
            style={{ width: 200 }}
            options={vehicleTypeOptions}
            placeholder="Select Vehicle Type"
          />
        }
      >
        <Row gutter={24}>
          <Col span={12}>
            <Title level={5} className="mb-4 text-gray-700 text-center">Vehicles Entering (IN)</Title>
            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyTrafficData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fill: '#666', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      const typeName = String(name).replace('_in', ' Enter');
                      return [`${value} vehicles`, typeName];
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                  />
                  <Legend formatter={(value) => String(value).replace('_in', ' In')} />
                  {vehicleTypeKeys.filter(vt => hourlyTrafficCategory === 'ALL' || vt === hourlyTrafficCategory).map((vt, index) => {
                    const color = ['#1890ff', '#f5222d', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'][vehicleTypeKeys.indexOf(vt) % 6];
                    return <Line key={vt} type="monotone" dataKey={`${vt}_in`} name={`${vt}_in`} stroke={color} strokeWidth={3} dot={false} activeDot={{ r: 6 }} />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Col>
          <Col span={12}>
            <Title level={5} className="mb-4 text-gray-700 text-center">Vehicles Exiting (OUT)</Title>
            <div style={{ height: 350 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hourlyTrafficData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="hour" tick={{ fill: '#666', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 12 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(value: any, name: any) => {
                      const typeName = String(name).replace('_out', ' Exit');
                      return [`${value} vehicles`, typeName];
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #eee', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                  />
                  <Legend formatter={(value) => String(value).replace('_out', ' Out')} />
                  {vehicleTypeKeys.filter(vt => hourlyTrafficCategory === 'ALL' || vt === hourlyTrafficCategory).map((vt, index) => {
                    const color = ['#1890ff', '#f5222d', '#52c41a', '#fa8c16', '#722ed1', '#eb2f96'][vehicleTypeKeys.indexOf(vt) % 6];
                    return <Line key={vt} type="monotone" dataKey={`${vt}_out`} name={`${vt}_out`} stroke={color} strokeWidth={3} strokeDasharray="5 5" dot={false} activeDot={{ r: 6 }} />;
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Col>
        </Row>
      </Card>

      {/* MACRO ANALYSIS (REMOVED) */}

      {/* GATE STATUS REPORT */}
      <Card 
        className="mt-6 shadow-sm border-slate-200 rounded-xl"
        title={
          <div className="flex items-center text-slate-800">
            <span className="mr-2 text-xl">🚪</span> 
            <span className="font-bold tracking-wide">GATE & SHIFT STATUS REPORT</span>
          </div>
        }
      >
        <Table 
          dataSource={gatesData || []} 
          rowKey="id"
          pagination={false}
          bordered
          size="middle"
        >
          <Table.Column title="ID" dataIndex="id" width={60} />
          <Table.Column title="Gate name" dataIndex="name" render={(val) => <strong>{val}</strong>} />
          <Table.Column title="Vehicle Type" render={(val, record: any) => {
            if (record.floorId && zonesData) {
              const zone = zonesData.find((z: any) => z.floorId === record.floorId);
              if (zone && zone.vehicleType) {
                const typeLower = zone.vehicleType.toLowerCase();
                const isFourWheel = typeLower.includes('car') || typeLower.includes('van') || typeLower.includes('four');
                return isFourWheel ? 'Car (4-wheel)' : 'Motorbike (2-wheel)';
              }
            }
            return 'All';
          }} />
          <Table.Column title="Current function" dataIndex="type" render={(val, r: any) => {
            if (r.status !== 'OCCUPIED') return <span className="text-gray-400 italic">Not selected yet</span>;
            if (val === 'IN' || val === 'ENTRY') return <Tag color="blue">GATE IN</Tag>;
            if (val === 'OUT' || val === 'EXIT') return <Tag color="green">GATE OUT</Tag>;
            if (val === 'IN_OUT' || val === 'ENTRY_EXIT') return <Tag color="orange">GATE IN/OUT</Tag>;
            return <Tag>{val}</Tag>;
          }} />
          <Table.Column title="Status" dataIndex="status" render={(val, r: any) => {
            if (val === 'OCCUPIED') return <Tag color="green">OPEN</Tag>;
            if (val === 'IDLE') return <Tag color="default">CLOSE</Tag>;
            return <Tag color="red">Maintenance</Tag>;
          }} />
          <Table.Column title="Staff on duty" dataIndex="staffName" render={(val, record: any) => val ? (
            <div className="flex flex-col">
              <span className="font-medium text-blue-700">{val}</span>
              {record.staffEmail && <span className="text-xs text-gray-500">{record.staffEmail}</span>}
            </div>
          ) : <span className="text-gray-400 italic">No staff</span>} />
        </Table>
      </Card>



      {/* HISTORY TABLE */}
      <Card 
        className="mt-6 shadow-sm border-slate-200 rounded-xl"
        title={
          <div className="flex justify-between items-center w-full">
            <div className="flex items-center text-slate-800">
              <span className="mr-2 text-xl">📜</span> 
              <span className="font-bold tracking-wide">VEHICLE ENTRANCE / EXIT HISTORY</span>
            </div>
            <div className="flex gap-4">
              <RangePicker
                value={historyDateRange}
                onChange={(dates) => {
                  setHistoryDateRange(dates);
                  setHistoryPage(1); // Reset page on date change
                }}
                format="DD/MM/YYYY"
                allowClear={true}
              />
              <Button type="primary" icon={<DownloadOutlined />} loading={isExporting} onClick={handleExportCSV}>
                Export CSV
              </Button>
            </div>
          </div>
        }
      >
        <Table 
          dataSource={historyData?.content || []} 
          rowKey="id"
          loading={isLoadingHistory}
          pagination={{ 
            current: historyPage, 
            pageSize: historySize, 
            total: historyData?.totalElements || 0,
            onChange: (page, size) => {
              setHistoryPage(page);
              setHistorySize(size);
            }
          }}
          bordered
          size="middle"
        >
          <Table.Column title="ID" dataIndex="id" width={60} />
          <Table.Column title="License Plate" dataIndex="plate" render={(val) => <strong className="text-blue-700">{val}</strong>} />
          <Table.Column title="Vehicle Type" dataIndex="vehicleType" />
          <Table.Column title="Entry Time" dataIndex="timeIn" render={(val) => val ? simulatedDayjs(val).format('HH:mm:ss DD/MM/YYYY') : '-'} />
          <Table.Column title="Suggested Zone" dataIndex="suggestedZoneId" render={(val, record: any) => {
            if (val) {
              const z = zonesData?.find((zone: any) => zone.id === val);
              return <Tag color="geekblue">{z ? z.name : `Zone ${val}`}</Tag>;
            }
            return (record.suggestedZoneName && record.suggestedZoneName !== 'N/A') ? <Tag color="geekblue">{record.suggestedZoneName}</Tag> : '-';
          }} />
          <Table.Column title="Entry Gate" dataIndex="gateInName" render={(val) => val || '-'} />
          <Table.Column title="Exit Time" dataIndex="timeOut" render={(val) => val ? simulatedDayjs(val).format('HH:mm:ss DD/MM/YYYY') : '-'} />
          <Table.Column title="Exit Gate" dataIndex="gateOutName" render={(val) => val || '-'} />
          <Table.Column title="Fees" dataIndex="totalFee" render={(val, record: any) => {
            if (val == null) return '-';
            const overtime = record.overtimeFee || 0;
            return (
              <div className="flex flex-col">
                <span className="font-bold text-green-600">{val.toLocaleString()}  VND</span>
                {overtime > 0 && (
                  <span className="text-[10px] text-red-500 font-medium">Overtime: +{overtime.toLocaleString()}</span>
                )}
              </div>
            );
          }} />
          <Table.Column title="Status" dataIndex="status" render={(val: string) => {
            if (val === 'ACTIVE') return <Tag color="blue">Parked</Tag>;
            if (val === 'COMPLETED') return <Tag color="green">Completed</Tag>;
            if (val === 'LOCKED') return <Tag color="red">Locked</Tag>;
            return <Tag>{val}</Tag>;
          }} />
        </Table>
      </Card>
    </div>
  );
};
