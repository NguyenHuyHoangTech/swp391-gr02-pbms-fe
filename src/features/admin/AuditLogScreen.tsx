/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ NHẬT KÝ KIỂM TOÁN HỆ THỐNG (KÈM MINH CHỨNG CODE)
 * (Trình bày chi tiết luồng dữ liệu ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT VÀ THÀNH PHẦN QUẢN LÝ TRẠNG THÁI (INIT & STATE MANAGEMENT)
 * - Minh chứng 1: Tại dòng 56 có khai báo `export const AuditLogScreen = () => { ... }`.
 *   Khi Quản trị viên vào màn hình Nhật ký kiểm toán, React khởi tạo Component này trên Virtual DOM.
 * - Minh chứng 2: Tại các dòng 57-65 có khai báo State điều khiển bản ghi đang xem chi tiết (`selectedLog`),
 *   Khoảng thời gian lọc (`dateRange`), Tìm kiếm Email (`searchEmail`), Lọc hành động (`filterAction`),
 *   Lọc tài nguyên (`filterResource`), và Phân trang (`currentPage`, `pageSize`).
 * 
 * BƯỚC 2: ĐỊNH NGHĨA HÀM XỬ LÝ ĐỊNH DẠNG DỮ LIỆU AN TOÀN (SAFE JSON FORMATTER)
 * - Minh chứng: Tại dòng 68 khai báo `const formatJsonSafely = (val: string | null) => { ... }`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Hàm nhận chuỗi JSON `oldValue` hoặc `newValue` từ Database.
 *   + Tiến hành `JSON.parse` và `JSON.stringify(..., null, 2)` để định dạng đẹp có lề (pretty print).
 *   + Nếu chuỗi rỗng hoặc không đúng chuẩn JSON, trả về nguyên bản hoặc `'NULL'` mà không làm sập giao diện.
 * 
 * BƯỚC 3: TRUY VẤN VÀ TẢI DỮ LIỆU NHẬT KÝ KIỂM TOÁN PHÂN TRANG (PAGINATED AUDIT LOG QUERY)
 * - Minh chứng: Tại dòng 86 khai báo `const { data, isLoading } = useQuery(...)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + `useQuery` lắng nghe biến phụ thuộc trong `queryKey`: `[currentPage, pageSize, dateRange, searchEmail, filterAction, filterResource]`.
 *   + Khi bất kỳ bộ lọc nào thay đổi, kích hoạt API GET `/system/audit-logs` với các query params tương ứng.
 *   + Backend trả về đối tượng Page chứa danh sách bản ghi `logs` và tổng số bản ghi `totalElements`.
 * 
 * BƯỚC 4: XÂY DỰNG CẤU TRÚC BẢNG VÀ PHÂN LOẠI MÀU THAO TÁC (TABLE COLUMNS & ACTION COLORING)
 * - Minh chứng: Tại dòng 118 khai báo mảng `columns` cấu hình các cột của Antd Table.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Hàm `render` cho cột `Action` phân loại màu sắc Tag: `CREATE` (xanh lá), `UPDATE` (xanh dương), `DELETE` (đỏ).
 *   + Cột `Details` hiển thị nút bấm "View Diff" để mở Modal xem chi tiết biến đổi dữ liệu trước và sau thao tác.
 * 
 * BƯỚC 5: RENDER GIAO DIỆN VÀ TÍNH NĂNG XEM SO SÁNH BIẾN ĐỔI DỮ LIỆU (JSX & DIFF VIEWER MODAL)
 * - Minh chứng: Tại dòng 161 khối JSX Render hiển thị Header, Card chứa thanh lọc đa tiêu chí, Bảng Antd Table
 *   và Modal "Audit Log Detail (Diff Viewer)" hiển thị 2 cột so sánh song song (`Old Value` và `New Value`).
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN LÕI REACT VÀ QUẢN LÝ TRẠNG THÁI / TRUY VẤN (HOOKS & QUERY)
// Công dụng: Cung cấp Hook quản lý State của React và TanStack Query để tải dữ liệu bất đồng bộ.
// =========================================================================
import React, { useState } from 'react'; // Thư viện React tiêu chuẩn và Hook useState.
import { useQuery } from '@tanstack/react-query'; // Thư viện quản lý Data Fetching và Caching.

// =========================================================================
// PHẦN 2: CÁC THƯ VIỆN GIAO DIỆN VÀ ICON (ANT DESIGN & ICONS)
// Công dụng: Các Component UI Ant Design (Table, Card, Modal, DatePicker, Select) và Icon đồ họa.
// =========================================================================
import { Table, Typography, Card, Tag, Modal, Button, DatePicker, Input, Select, Space } from 'antd'; // Bộ thành phần UI chuẩn Ant Design.
import { HistoryOutlined, EyeOutlined, SearchOutlined } from '@ant-design/icons'; // Danh sách Icon biểu thị nhật ký, xem chi tiết và tìm kiếm.

// =========================================================================
// PHẦN 3: CÁC THƯ VIỆN XỬ LÝ THỜI GIAN VÀ CLIENT API
// Công dụng: Thư viện Dayjs xử lý ngày tháng, Axios Client gọi API và Provider thời gian giả lập.
// =========================================================================
import dayjs, { Dayjs } from 'dayjs'; // Thư viện xử lý ngày tháng Dayjs.
import axiosClient from '../../core/api/axiosClient'; // Instance Axios cấu hình sẵn cho dự án.
import { simulatedDayjs } from '../../core/utils/timeProvider'; // Utility lấy đối tượng Dayjs dựa theo thời gian giả lập của hệ thống.

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

// =========================================================================
// PHẦN 4: KHAI BÁO TYPE VÀ INTERFACE NGUYÊN THỂ DỮ LIỆU (DATA TYPES)
// Công dụng: Định nghĩa cấu trúc bản ghi Nhật ký kiểm toán (AuditLog) trả về từ Backend.
// =========================================================================

/** Interface mô tả thông tin chi tiết một bản ghi nhật ký kiểm toán hệ thống */
interface AuditLog {
    id: number;
    action: string;
    resource: string;
    actor: { email: string };
    createdAt: string;
    oldValue: string | null;
    newValue: string | null;
    ipAddress: string;
}

/**
 * === PHẦN 5: ĐỊNH NGHĨA COMPONENT AUDITLOGSCREEN ===
 * Màn hình truy vấn nhật ký kiểm toán hệ thống: Lọc theo thời gian, email, hành động, tài nguyên và xem Diff chi tiết.
 */
export const AuditLogScreen = () => {
    // --- KHỞI TẠO STATE QUẢN LÝ BẢN GHI XEM CHI TIẾT ---
    const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null); // Bản ghi được chọn để xem so sánh Diff trong Modal

    // --- KHỞI TẠO STATE CHO BỘ LỌC VÀ PHÂN TRANG ---
    const [dateRange, setDateRange] = useState<[Dayjs | null, Dayjs | null] | null>([simulatedDayjs().subtract(7, 'days').startOf('day'), simulatedDayjs().endOf('day')]); // Khoảng ngày lọc (Mặc định 7 ngày gần nhất)
    const [searchEmail, setSearchEmail] = useState<string>(''); // Từ khóa tìm kiếm theo Email người thực hiện
    const [filterAction, setFilterAction] = useState<string | null>(null); // Bộ lọc theo Loại hành động (CREATE, UPDATE, DELETE)
    const [filterResource, setFilterResource] = useState<string | null>(null); // Bộ lọc theo Tên tài nguyên bị tác động
    const [currentPage, setCurrentPage] = useState(1); // Trang hiện tại trong Bảng
    const [pageSize, setPageSize] = useState(15); // Số lượng bản ghi hiển thị trên mỗi trang

    /**
     * =========================================================================
     * HÀM BỔ TRỢ: ĐỊNH DẠNG CHUỖI JSON AN TOÀN (SAFE JSON FORMATTER)
     * =========================================================================
     * MỤC ĐÍCH:
     * Chuyển đổi chuỗi JSON thô (raw JSON) của `oldValue` và `newValue` thành dạng văn bản định dạng đẹp (pretty printed)
     * để hiển thị trên cửa sổ Modal Diff Viewer mà không gây vỡ giao diện nếu dữ liệu không phải JSON.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Kiểm tra nếu giá trị `val` rỗng/null -> Trả về chuỗi `'NULL'`.
     * 2. Thử giải mã bằng `JSON.parse(val)` và mã hóa lại với lề 2 khoảng trắng bằng `JSON.stringify(..., null, 2)`.
     * 3. Nếu gặp lỗi SyntaxError (không phải JSON hợp lệ) -> Trả về chuỗi nguyên bản `val`.
     */
    const formatJsonSafely = (val: string | null) => {
        if (!val) return 'NULL';
        try {
            return JSON.stringify(JSON.parse(val), null, 2);
        } catch (e) {
            return val;
        }
    };

    /**
     * =========================================================================
     * QUERY: TRUY VẤN DANH SÁCH NHẬT KÝ KIỂM TOÁN PHÂN TRANG VÀ LỌC
     * =========================================================================
     * MỤC ĐÍCH:
     * Gọi API GET `/system/audit-logs` để lấy danh sách nhật ký hành động dựa trên các bộ lọc tìm kiếm.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Khai báo `queryKey` phụ thuộc vào tất cả các State lọc và phân trang.
     * 2. Xây dựng đối tượng `params` chứa: `page` (trừ 1 cho chuẩn Spring Boot), `size`, `startDate`, `endDate`, `email`, `action`, `resource`.
     * 3. Thực thi HTTP GET request qua `axiosClient.get('/system/audit-logs', { params })`.
     * 4. Trả về đối tượng Page chứa mảng bản ghi và tổng số lượng.
     */
    const { data, isLoading } = useQuery({
        queryKey: ['audit-logs', currentPage, pageSize, dateRange, searchEmail, filterAction, filterResource],
        queryFn: async () => {
            const params: any = {
                page: currentPage - 1,
                size: pageSize,
            };
            if (dateRange && dateRange[0] && dateRange[1]) {
                params.startDate = dateRange[0].startOf('day').toISOString();
                params.endDate = dateRange[1].endOf('day').toISOString();
            }
            if (searchEmail) params.email = searchEmail;
            if (filterAction) params.action = filterAction;
            if (filterResource) params.resource = filterResource;

            const res = await axiosClient.get('/system/audit-logs', { params });
            return res.data.data; // Trả về đối tượng Page từ Backend
        }
    });

    const logs = data?.content || [];
    const totalElements = data?.totalElements || 0;

    /**
     * =========================================================================
     * CẤU HÌNH CÁC CỘT CHO BẢNG ANTD TABLE (COLUMNS CONFIGURATION)
     * =========================================================================
     */
    const columns = [
        { title: 'ID', dataIndex: 'id', key: 'id' },
        {
            title: 'Action',
            dataIndex: 'action',
            key: 'action',
            render: (action: string) => {
                let color = 'default';
                if (action === 'CREATE') color = 'success';
                if (action === 'UPDATE') color = 'processing';
                if (action === 'DELETE') color = 'error';
                return <Tag color={color}>{action}</Tag>;
            }
        },
        { title: 'Resource', dataIndex: 'resource', key: 'resource', render: (text: string) => <Text strong>{text}</Text> },
        { title: 'Performed By', dataIndex: ['actor', 'email'], key: 'performedBy' },
        { title: 'Time', dataIndex: 'createdAt', key: 'timestamp', render: (text: string) => text ? new Date(text).toLocaleString() : '' },
        { title: 'IP', dataIndex: 'ipAddress', key: 'ip' },
        {
            title: 'Details',
            key: 'details',
            render: (_: any, record: AuditLog) => (
                <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={() => setSelectedLog(record)}
                >
                    View Diff
                </Button>
            )
        }
    ];

    // =========================================================================
    // PHẦN 6: RENDER GIAO DIỆN COMPONENT (JSX)
    // =========================================================================
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* HEADER MÀN HÌNH NHẬT KÝ KIỂM TOÁN */}
                <div className="mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <Title level={2} className="m-0 text-gray-800 flex items-center">
                        <HistoryOutlined className="mr-3 text-blue-600" /> System Audit Logs
                    </Title>
                    <Text type="secondary" className="mt-1 block">Track all system changes and administrative actions.</Text>
                </div>

                {/* THẺ CARD CHỨA THANH CÔNG CỤ BỘ LỌC VÀ BẢNG DỮ LIỆU */}
                <Card className="shadow-sm rounded-xl border-gray-200">
                    {/* THANH BỘ LỌC ĐA TIÊU CHÍ */}
                    <div className="flex flex-wrap gap-4 justify-between items-center mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                        <Space size="middle" wrap>
                            {/* LỌC THEO EMAIL NGƯỜI THỰC HIỆN */}
                            <div>
                                <Text strong className="block mb-1 text-xs text-gray-500 uppercase">Search by Email</Text>
                                <Input
                                    placeholder="admin@example.com"
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    allowClear
                                    value={searchEmail}
                                    onChange={(e) => setSearchEmail(e.target.value)}
                                    style={{ width: 220 }}
                                />
                            </div>

                            {/* LỌC THEO HÀNH ĐỘNG (CREATE, UPDATE, DELETE) */}
                            <div>
                                <Text strong className="block mb-1 text-xs text-gray-500 uppercase">Action</Text>
                                <Select
                                    placeholder="All Actions"
                                    allowClear
                                    value={filterAction}
                                    onChange={setFilterAction}
                                    style={{ width: 140 }}
                                    options={[
                                        { value: 'CREATE', label: 'CREATE' },
                                        { value: 'UPDATE', label: 'UPDATE' },
                                        { value: 'DELETE', label: 'DELETE' }
                                    ]}
                                />
                            </div>

                            {/* LỌC THEO TÀI NGUYÊN BỊ TÁC ĐỘNG */}
                            <div>
                                <Text strong className="block mb-1 text-xs text-gray-500 uppercase">Resource</Text>
                                <Input
                                    placeholder="e.g. User, Role..."
                                    prefix={<SearchOutlined className="text-gray-400" />}
                                    allowClear
                                    value={filterResource || ''}
                                    onChange={(e) => setFilterResource(e.target.value)}
                                    style={{ width: 180 }}
                                />
                            </div>

                            {/* LỌC THEO KHOẢNG THỜI GIAN */}
                            <div>
                                <Text strong className="block mb-1 text-xs text-gray-500 uppercase">Date Range</Text>
                                <RangePicker
                                    value={dateRange as any}
                                    defaultPickerValue={[simulatedDayjs(), simulatedDayjs()]}
                                    onChange={(dates) => setDateRange(dates as [Dayjs, Dayjs] | null)}
                                    format="YYYY-MM-DD"
                                    style={{ width: 280 }}
                                />
                            </div>
                        </Space>
                    </div>

                    {/* BẢNG HIỂN THỊ DANH SÁCH NHẬT KÝ KIỂM TOÁN */}
                    <Table
                        dataSource={logs}
                        columns={columns}
                        rowKey="id"
                        loading={isLoading}
                        pagination={{
                            current: currentPage,
                            pageSize: pageSize,
                            total: totalElements,
                            onChange: (page, size) => {
                                setCurrentPage(page);
                                setPageSize(size);
                            }
                        }}
                    />
                </Card>

                {/* MODAL CHI TIẾT SO SÁNH BIẾN ĐỔI DỮ LIỆU (DIFF VIEWER) */}
                <Modal
                    title="Audit Log Detail (Diff Viewer)"
                    open={!!selectedLog}
                    onCancel={() => setSelectedLog(null)}
                    footer={[<Button key="close" onClick={() => setSelectedLog(null)}>Close</Button>]}
                    width={1000}
                >
                    {selectedLog && (
                        <div className="mt-4 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                {/* GIÁ TRỊ CŨ TRƯỚC KHI THAY ĐỔI */}
                                <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                    <Text strong className="text-gray-700 block mb-2">Old Value</Text>
                                    <pre className="text-xs overflow-auto text-gray-800 bg-white p-3 rounded whitespace-pre-wrap break-all border border-gray-100 max-h-96">
                                        {formatJsonSafely(selectedLog.oldValue)}
                                    </pre>
                                </div>
                                {/* GIÁ TRỊ MỚI SAU KHI THAY ĐỔI */}
                                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                    <Text strong className="text-blue-700 block mb-2">New Value / Details</Text>
                                    <pre className="text-xs overflow-auto text-blue-900 bg-blue-100/50 p-3 rounded whitespace-pre-wrap break-all max-h-96">
                                        {formatJsonSafely(selectedLog.newValue)}
                                    </pre>
                                </div>
                            </div>
                        </div>
                    )}
                </Modal>
            </div>
        </div>
    );
};
