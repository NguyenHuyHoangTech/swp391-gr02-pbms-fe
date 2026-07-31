import React, { useState, useMemo } from 'react';
import { Card, DatePicker, Button, Typography, Table, Space, Row, Col, Statistic, Tabs } from 'antd';
import { SearchOutlined, DownloadOutlined, DollarOutlined, TransactionOutlined, AreaChartOutlined, DashboardOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { simulatedDayjs } from '../../core/utils/timeProvider';
import axiosClient from '../../core/api/axiosClient';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// Types
interface RevenueRecord {
  date: string;
  vehicleType: string;
  gateName: string;
  revenueSource: string;
  paymentMethod: string;
  totalRevenue: number;
  totalTransactions: number;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

const RevenueDashboardScreen: React.FC = () => {
  // State for Global Control Panel
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([simulatedDayjs().subtract(60, 'days'), simulatedDayjs()]);
  const [appliedDateRange, setAppliedDateRange] = useState<[string, string]>([
    simulatedDayjs().subtract(60, 'days').format('YYYY-MM-DD'),
    simulatedDayjs().format('YYYY-MM-DD')
  ]);
  const [calendarDates, setCalendarDates] = useState<any>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  
  const [shiftPage, setShiftPage] = useState(1);
  const [shiftSize, setShiftSize] = useState(10);
  const [shiftGateType, setShiftGateType] = useState<string>('');
 
  /**
   * [FE_FN_001] Hàm lấy dữ liệu Tổng quan Doanh thu (Master Dataset) từ Backend.
   * - API Endpoint: GET /api/v1/finance/revenue/dashboard
   * - Chức năng: Gọi API lấy dữ liệu doanh thu tổng hợp không phân trang cho khoảng thời gian được chọn 
   *   (startDate, endDate) để dựng biểu đồ doanh thu theo ngày và các biểu đồ cơ cấu doanh thu.
   */
  const { data: masterData = [], isLoading: isChartsLoading } = useQuery({
    queryKey: ['revenue-dashboard', appliedDateRange],
    queryFn: async () => {
      const res = await axiosClient.get(`/finance/revenue/dashboard?startDate=${appliedDateRange[0]}&endDate=${appliedDateRange[1]}`);
      return res.data.data as RevenueRecord[];
    }
  });

  /**
   * [FE_FN_002] Hàm lấy danh sách giao dịch doanh thu phân trang (Paginated Data) từ Backend.
   * - API Endpoint: GET /api/v1/finance/revenue/table
   * - Chức năng: Lấy dữ liệu danh sách doanh thu chi tiết có phân trang (Server-side) gồm: 
   *   tiền vé, tiền lố giờ, tiền phạt, cổng ra, biển số xe, phương thức thanh toán, v.v.
   */
  const { data: tableData, isLoading: isTableLoading } = useQuery({
    queryKey: ['revenue-table', appliedDateRange, currentPage, pageSize],
    queryFn: async () => {
      const res = await axiosClient.get(`/finance/revenue/table?startDate=${appliedDateRange[0]}&endDate=${appliedDateRange[1]}&page=${currentPage}&size=${pageSize}`);
      return res.data.data;
    }
  });

  /**
   * [FE_FN_003] Hàm lấy dữ liệu lịch sử đối soát ca trực (Shift Reconciliation) của nhân viên.
   * - API Endpoint: GET /api/v1/identity/work-sessions/history
   * - Chức năng: Lấy lịch sử phiên làm việc của nhân viên trực cổng gồm: doanh thu thực tế khai báo, 
   *   doanh thu hệ thống tính toán (Tiền mặt, Khác), độ lệch chênh lệch và trạng thái đối soát.
   */
  const { data: shiftHistoryData, isLoading: isShiftLoading } = useQuery({
    queryKey: ['shift-revenue-history', appliedDateRange, shiftPage, shiftSize, shiftGateType],
    queryFn: async () => {
      let url = `/identity/work-sessions/history?startDate=${appliedDateRange[0]}&endDate=${appliedDateRange[1]}&page=${shiftPage - 1}&size=${shiftSize}`;
      if (shiftGateType) {
        url += `&gateType=${shiftGateType}`;
      }
      const res = await axiosClient.get(url);
      return res.data.data;
    }
  });

  /**
   * [FE_FN_004] Hàm tính toán khoảng thời gian so sánh ở chu kỳ trước (Previous Date Range).
   * - Chức năng: Dựa trên khoảng thời gian đang được chọn, tính lùi lại một khoảng thời gian có số ngày tương đương 
   *   để làm mốc so sánh tăng trưởng doanh thu và số lượng giao dịch.
   */
  const previousDateRange = useMemo(() => {
    const start = dayjs(appliedDateRange[0]);
    const end = dayjs(appliedDateRange[1]);
    const diffDays = end.diff(start, 'day') + 1;
    const prevStart = start.subtract(diffDays, 'day').format('YYYY-MM-DD');
    const prevEnd = start.subtract(1, 'day').format('YYYY-MM-DD');
    return [prevStart, prevEnd];
  }, [appliedDateRange]);

  /**
   * [FE_FN_005] Hàm lấy dữ liệu doanh thu của chu kỳ trước đó từ Backend.
   * - API Endpoint: GET /api/v1/finance/revenue/dashboard
   * - Chức năng: Lấy dữ liệu Master của khoảng thời gian chu kỳ trước đó để tính toán tỷ lệ tăng trưởng doanh thu.
   */
  const { data: previousMasterData = [] } = useQuery({
    queryKey: ['revenue-dashboard-previous', previousDateRange],
    queryFn: async () => {
      const res = await axiosClient.get(`/finance/revenue/dashboard?startDate=${previousDateRange[0]}&endDate=${previousDateRange[1]}`);
      return res.data.data as RevenueRecord[];
    }
  });

  /**
   * [FE_FN_006] Hàm tính toán các chỉ số KPI hiện tại (Tổng doanh thu, Tổng số lượt giao dịch).
   * - Chức năng: Duyệt qua masterData của chu kỳ hiện tại để tính tổng cộng doanh thu và tổng số lượt xe.
   */
  const kpis = useMemo(() => {
    return masterData.reduce((acc, curr) => {
      acc.totalRevenue += curr.totalRevenue;
      acc.totalTransactions += curr.totalTransactions;
      return acc;
    }, { totalRevenue: 0, totalTransactions: 0 });
  }, [masterData]);

  /**
   * [FE_FN_007] Hàm tính toán các chỉ số KPI chu kỳ trước (Tổng doanh thu, Tổng số giao dịch).
   * - Chức năng: Duyệt qua previousMasterData của chu kỳ trước để tính tổng doanh thu và tổng số xe.
   */
  const prevKpis = useMemo(() => {
    return previousMasterData.reduce((acc, curr) => {
      acc.totalRevenue += curr.totalRevenue;
      acc.totalTransactions += curr.totalTransactions;
      return acc;
    }, { totalRevenue: 0, totalTransactions: 0 });
  }, [previousMasterData]);

  /**
   * [FE_FN_008] Hàm tính toán tỷ lệ tăng trưởng phần trăm (Growth Calculation).
   * - Chức năng: So sánh chỉ số KPI hiện tại với chu kỳ trước để tính ra tỷ lệ tăng trưởng âm/dương 
   *   cho doanh thu và số lượng giao dịch.
   */
  const growth = useMemo(() => {
    const revGrowth = prevKpis.totalRevenue === 0 
        ? (kpis.totalRevenue > 0 ? 100 : 0) 
        : ((kpis.totalRevenue - prevKpis.totalRevenue) / prevKpis.totalRevenue) * 100;
        
    const transGrowth = prevKpis.totalTransactions === 0 
        ? (kpis.totalTransactions > 0 ? 100 : 0) 
        : ((kpis.totalTransactions - prevKpis.totalTransactions) / prevKpis.totalTransactions) * 100;
        
    return { revGrowth, transGrowth };
  }, [kpis, prevKpis]);

  /**
   * [FE_FN_009] Chỉ số doanh thu trung bình trên mỗi giao dịch (ARPU - Average Revenue Per Unit).
   */
  const arpu = kpis.totalTransactions > 0 ? kpis.totalRevenue / kpis.totalTransactions : 0;

  /**
   * [FE_FN_010] Hàm xử lý dữ liệu cho Biểu đồ chính theo thời gian (Hero Chart - Revenue Over Time).
   * - Chức năng: Nhóm tổng doanh thu theo từng ngày trong khoảng thời gian được chọn và điền giá trị 0 
   *   cho những ngày không có giao dịch nhằm hiển thị biểu đồ cột liên tục.
   */
  const heroChartData = useMemo(() => {
    const start = dayjs(appliedDateRange[0]);
    const end = dayjs(appliedDateRange[1]);
    const dates = [];
    let current = start;
    while (current.isBefore(end) || current.isSame(end, 'day')) {
      dates.push(current.format('YYYY-MM-DD'));
      current = current.add(1, 'day');
    }

    const map = new Map<string, number>();
    dates.forEach(d => map.set(d, 0)); // Pre-fill with 0

    masterData.forEach(r => {
      if (map.has(r.date)) {
        map.set(r.date, (map.get(r.date) || 0) + r.totalRevenue);
      }
    });
    return Array.from(map.entries()).map(([date, total]) => ({ date, total })).sort((a, b) => a.date.localeCompare(b.date));
  }, [masterData, appliedDateRange]);

  /**
   * [FE_FN_011] Hàm helper xử lý dữ liệu cho biểu đồ tròn (Pie Charts - Revenue Structure).
   * - Chức năng: Nhóm tổng doanh thu theo thuộc tính chỉ định (paymentMethod, revenueSource, hoặc vehicleType) 
   *   để phục vụ việc vẽ các biểu đồ cơ cấu doanh thu.
   */
  const processPieData = (key: keyof RevenueRecord) => {
    const map = new Map<string, number>();
    masterData.forEach(r => {
      const val = String(r[key]);
      map.set(val, (map.get(val) || 0) + Number(r.totalRevenue));
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value })).filter(d => d.value > 0);
  };

  const paymentData = useMemo(() => processPieData('paymentMethod'), [masterData]);
  const sourceData = useMemo(() => processPieData('revenueSource'), [masterData]);
  const vehicleData = useMemo(() => processPieData('vehicleType'), [masterData]);

  /**
   * [FE_FN_012] Hàm xuất dữ liệu báo cáo doanh thu ra tệp CSV/Excel.
   * - API Endpoint: GET /api/v1/finance/revenue/export
   * - Chức năng: Kích hoạt tải xuống file CSV chứa toàn bộ dữ liệu giao dịch chi tiết theo khoảng thời gian được chọn.
   */
  const handleExportCSV = () => {
    // Call separate export API that streams file directly
    window.open(`http://localhost:8080/api/v1/finance/revenue/export?startDate=${appliedDateRange[0]}&endDate=${appliedDateRange[1]}`, '_blank');
  };

  /**
   * [FE_FN_013] Component Tooltip tùy chỉnh hiển thị tiền tệ (VND) trên biểu đồ Recharts.
   * - Chức năng: Định dạng và hiển thị thông tin doanh thu bằng tiền tệ Việt Nam Đồng (₫) khi rê chuột vào các cột biểu đồ.
   */
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-md rounded">
          <p className="font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }}>
              {entry.name}: {entry.value.toLocaleString()} ₫
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-slate-50 pb-24">
      {/* Global Control Panel (Sticky) */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md p-4 rounded-xl shadow-sm border border-slate-200 mb-6 flex justify-between items-center">
        <div>
          <Title level={4} className="m-0 text-slate-800">Report Revenue</Title>
          <Text type="secondary">Multi-dimensional analysis by day, vehicle type and revenue source</Text>
        </div>
        <Space size="large">
          <RangePicker 
            size="large"
            value={dateRange}
            onChange={(dates) => dates && setDateRange([dates[0]!, dates[1]!])}
            onCalendarChange={(val) => setCalendarDates(val)}
            disabledDate={(current) => {
              if (!calendarDates || calendarDates.length === 0 || !calendarDates[0] || calendarDates[1]) {
                return false;
              }
              const tooLate = calendarDates[0] && current.diff(calendarDates[0], 'days') > 90;
              const tooEarly = calendarDates[0] && calendarDates[0].diff(current, 'days') > 90;
              return !!tooEarly || !!tooLate;
            }}
            format="DD/MM/YYYY"
          />
          <Button 
            type="primary" 
            size="large" 
            icon={<SearchOutlined />}
            onClick={() => {
               setAppliedDateRange([dateRange[0].format('YYYY-MM-DD'), dateRange[1].format('YYYY-MM-DD')]);
               setCurrentPage(1);
               setShiftPage(1);
            }}
            loading={isChartsLoading || isTableLoading}
            className="bg-blue-600"
          >
            Apply
          </Button>
        </Space>
      </div>

      {/* KPI Cards */}
      <Row gutter={24} className="mb-6">
        <Col span={8}>
          <Card className="shadow-sm rounded-xl h-full flex flex-col justify-center" style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)', border: 'none' }}>
            <Statistic 
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Revenue</span>}
              value={kpis.totalRevenue} 
              precision={0} 
              suffix="₫"
              styles={{ content: { color: '#fff', fontWeight: 'bold', fontSize: '2rem' } }}
              prefix={<DollarOutlined style={{ color: 'rgba(255,255,255,0.8)' }} />}
            />
            <div className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {growth.revGrowth >= 0 ? (
                <span className="bg-white/20 px-2 py-0.5 rounded text-white font-medium">↑ {Math.abs(growth.revGrowth).toFixed(1)}%</span>
              ) : (
                <span className="bg-red-500/80 px-2 py-0.5 rounded text-white font-medium">↓ {Math.abs(growth.revGrowth).toFixed(1)}%</span>
              )}
              <span className="ml-2 text-xs opacity-80">vs previous period</span>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card className="shadow-sm rounded-xl h-full flex flex-col justify-center" style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none' }}>
            <Statistic 
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Transactions</span>}
              value={kpis.totalTransactions} 
              styles={{ content: { color: '#fff', fontWeight: 'bold', fontSize: '2rem' } }}
              prefix={<TransactionOutlined style={{ color: 'rgba(255,255,255,0.8)' }} />}
            />
            <div className="mt-2 text-sm" style={{ color: 'rgba(255,255,255,0.9)' }}>
              {growth.transGrowth >= 0 ? (
                <span className="bg-white/20 px-2 py-0.5 rounded text-white font-medium">↑ {Math.abs(growth.transGrowth).toFixed(1)}%</span>
              ) : (
                <span className="bg-red-500/80 px-2 py-0.5 rounded text-white font-medium">↓ {Math.abs(growth.transGrowth).toFixed(1)}%</span>
              )}
              <span className="ml-2 text-xs opacity-80">vs previous period</span>
            </div>
          </Card>
        </Col>
        <Col span={8}>
          <Card className="shadow-sm rounded-xl h-full flex flex-col justify-center" style={{ background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', border: 'none' }}>
            <Statistic 
              title={<span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 600, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ARPU (Avg. Revenue Per Unit)</span>}
              value={arpu} 
              precision={0}
              suffix="₫"
              styles={{ content: { color: '#fff', fontWeight: 'bold', fontSize: '2rem' } }}
              prefix={<AreaChartOutlined style={{ color: 'rgba(255,255,255,0.8)' }} />}
            />
          </Card>
        </Col>
      </Row>

      {/* Hero & Sidebar */}
      <Row gutter={24} className="mb-6">
        {/* Left 62.5%: Hero Chart */}
        <Col span={15}>
          <Card className="shadow-sm border-slate-200 rounded-xl h-full" title="TOTAL REVENUE OVER TIME">
            <div style={{ height: 490 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={heroChartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                  <XAxis dataKey="date" tick={{fill: '#666'}} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={(val) => `${val / 1000}k`} tick={{fill: '#666'}} tickLine={false} axisLine={false} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={60} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </Col>
        
        {/* Right 37.5%: Sidebar Pies */}
        <Col span={9}>
          <Card className="shadow-sm border-slate-200 rounded-xl h-full flex flex-col">
            <Title level={5} className="mb-4 text-slate-700 text-center">REVENUE STRUCTURE</Title>
            
            <div className="flex-1 flex flex-col gap-y-6 justify-center">
              {/* Pie 1: Payment Method */}
              <div className="h-[150px]">
                <Text strong className="block text-center text-xs text-slate-500 mb-1">Payment Method</Text>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={paymentData} cx="50%" cy="45%" innerRadius={25} outerRadius={45} dataKey="value" paddingAngle={2}>
                      {paymentData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => `${val.toLocaleString()} ₫`} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', lineHeight: '14px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pie 2: Revenue Source */}
              <div className="h-[150px]">
                <Text strong className="block text-center text-xs text-slate-500 mb-1">Revenue Source</Text>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sourceData} cx="50%" cy="45%" innerRadius={25} outerRadius={45} dataKey="value" paddingAngle={2}>
                      {sourceData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[(index+2) % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => `${val.toLocaleString()} ₫`} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', lineHeight: '14px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pie 3: Vehicle Type */}
              <div className="h-[150px]">
                <Text strong className="block text-center text-xs text-slate-500 mb-1">Vehicle Type</Text>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={vehicleData} cx="50%" cy="45%" innerRadius={25} outerRadius={45} dataKey="value" paddingAngle={2}>
                      {vehicleData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[(index+1) % COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(val: any) => `${val.toLocaleString()} ₫`} />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', lineHeight: '14px' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* Shift Reconciliation Table */}
      <Card 
        className="shadow-sm border-slate-200 rounded-xl mb-6"
        title={<span><SafetyCertificateOutlined className="mr-2 text-blue-600" /> Shift Reconciliation</span>}
        extra={
          <Space>
            <Text type="secondary">Gate Status:</Text>
            <select 
              className="border border-gray-300 rounded px-2 py-1 outline-none text-sm"
              value={shiftGateType}
              onChange={(e) => {
                setShiftGateType(e.target.value);
                setShiftPage(1);
              }}
            >
              <option value="">All</option>
              <option value="ENTRY">ENTRY</option>
              <option value="EXIT">EXIT</option>
              <option value="ENTRY_EXIT">ENTRY_EXIT</option>
              <option value="PATROL">PATROL</option>
            </select>
          </Space>
        }
      >
        <Table
            dataSource={shiftHistoryData?.content || []}
            rowKey="id"
            loading={isShiftLoading}
            pagination={{
              current: shiftPage,
              pageSize: shiftSize,
              total: shiftHistoryData?.totalElements || 0,
              onChange: (p, s) => {
                setShiftPage(p);
                setShiftSize(s);
              },
              showSizeChanger: true
            }}
            scroll={{ x: 1200 }}
            bordered
            size="middle"
          >
            <Table.Column title="Shift ID" dataIndex="id" width={80} />
            <Table.Column title="Staff" dataIndex="staffName" width={180} render={(val) => <strong className="text-blue-700">{val}</strong>} />
            <Table.Column title="Gate" dataIndex="gateName" width={150} />
            <Table.Column 
              title="Gate Status" 
              dataIndex="gateType" 
              width={120} 
              render={(val) => {
                if (val === 'ENTRY') return <span className="text-blue-600 font-medium">ENTRY</span>;
                if (val === 'EXIT') return <span className="text-green-600 font-medium">EXIT</span>;
                return <span className="text-gray-600 font-medium">{val}</span>;
              }} 
            />
            <Table.Column 
              title="Working time" 
              key="time" 
              width={250}
              render={(_, record: any) => (
                <div>
                  <div><Text type="secondary">In:</Text> <Text strong>{record.loginTime ? dayjs(record.loginTime).format('HH:mm DD/MM') : '-'}</Text></div>
                  <div><Text type="secondary">Out:</Text> <Text strong>{record.logoutTime ? dayjs(record.logoutTime).format('HH:mm DD/MM') : '-'}</Text></div>
                </div>
              )} 
            />
            <Table.Column 
              title="System Total" 
              dataIndex="expectedRevenue" 
              width={130}
              align="right"
              render={(val) => val != null ? val.toLocaleString() : '-'} 
            />
            <Table.Column 
              title="System Cash" 
              dataIndex="expectedCashRevenue" 
              width={130}
              align="right"
              render={(val) => val != null ? <span className="text-orange-600">{val.toLocaleString()}</span> : '-'} 
            />
            <Table.Column 
              title="System Other" 
              dataIndex="expectedOtherRevenue" 
              width={130}
              align="right"
              render={(val) => val != null ? <span className="text-purple-600">{val.toLocaleString()}</span> : '-'} 
            />
            <Table.Column 
              title="Declared Cash (VND)" 
              dataIndex="actualRevenue" 
              width={150}
              align="right"
              render={(val) => val != null ? <strong className="text-gray-800">{val.toLocaleString()}</strong> : '-'} 
            />
            <Table.Column 
              title="Difference" 
              dataIndex="revenueVariance" 
              width={150}
              align="right"
              render={(val) => {
                if (val == null) return '-';
                if (val === 0) return <span className="text-gray-400">0</span>;
                return <strong className={val > 0 ? 'text-blue-600' : 'text-red-600'}>{val > 0 ? '+' : ''}{val.toLocaleString()}</strong>;
              }} 
            />
            <Table.Column 
              title="Status" 
              dataIndex="discrepancyStatus" 
              width={120}
              align="center"
              render={(val) => {
                if (val === 'MATCH') return <span className="text-green-600 border border-green-600 px-2 py-1 rounded text-xs">Match</span>;
                if (val === 'SHORT') return <span className="text-red-600 border border-red-600 px-2 py-1 rounded text-xs">Short</span>;
                if (val === 'OVER') return <span className="text-blue-600 border border-blue-600 px-2 py-1 rounded text-xs">Over</span>;
                return <span className="text-gray-600 border border-gray-600 px-2 py-1 rounded text-xs">{val || 'N/A'}</span>;
              }} 
            />
            <Table.Column 
              title="Reason" 
              dataIndex="varianceReason" 
              width={250}
              render={(val) => val ? <Text type="secondary" italic>{val}</Text> : '-'} 
            />
          </Table>
      </Card>

      {/* Data Table & Export */}
      <Card 
        className="shadow-sm border-slate-200 rounded-xl"
        title="General Data Table"
        extra={
          <Button 
            type="primary" 
            icon={<DownloadOutlined />} 
            onClick={handleExportCSV}
            className="bg-green-600 hover:bg-green-700 border-none"
          >
            Export Excel (CSV)
          </Button>
        }
      >
        <Table 
          dataSource={tableData?.content || []} 
          rowKey={(r, i) => `${r.date}-${i}`}
          loading={isTableLoading}
          pagination={{ 
            current: currentPage,
            pageSize: pageSize,
            total: tableData?.totalElements || 0,
            onChange: (page, size) => {
              setCurrentPage(page);
              setPageSize(size);
            }
          }}
          bordered
          size="middle"
        >
          <Table.Column title="Ngày giờ ra" dataIndex="checkoutTime" render={(val) => <strong>{dayjs(val).format('DD/MM/YYYY HH:mm')}</strong>} />
          <Table.Column title="Biển số" dataIndex="plate" render={(val) => <span className="font-semibold text-slate-800">{val || 'N/A'}</span>} />
          <Table.Column title="Loại xe" dataIndex="vehicleType" />
          <Table.Column title="Cổng ra" dataIndex="gateName" render={(val) => <span className="text-gray-600 font-medium">{val || 'N/A'}</span>} />
          <Table.Column title="Tiền vé" dataIndex="baseFee" align="right" render={(val) => <span>{val?.toLocaleString()} ₫</span>} />
          <Table.Column title="Tiền lố giờ" dataIndex="overtimeFee" align="right" render={(val) => <span>{val?.toLocaleString()} ₫</span>} />
          <Table.Column title="Tiền phạt" dataIndex="penaltyFee" align="right" render={(val) => <span>{val?.toLocaleString()} ₫</span>} />
          <Table.Column 
            title="Tổng thu" 
            dataIndex="totalFee" 
            align="right"
            render={(val) => <span className="font-bold text-blue-600">{val?.toLocaleString()} ₫</span>}
          />
          <Table.Column title="Thanh toán" dataIndex="paymentMethod" align="center" />
        </Table>
          </Card>
    </div>
  );
};

export { RevenueDashboardScreen };
