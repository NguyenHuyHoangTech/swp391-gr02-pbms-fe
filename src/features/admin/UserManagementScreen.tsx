/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ QUẢN LÝ NGUỜI DÙNG HỆ THỐNG (KÈM MINH CHỨNG CODE)
 * (Trình bày chi tiết luồng dữ liệu ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT VÀ THÀNH PHẦN QUẢN LÝ TRẠNG THÁI (INIT & STATE MANAGEMENT)
 * - Minh chứng 1: Tại dòng 102 có khai báo `export const UserManagementScreen = () => { ... }`.
 *   Khi Quản trị viên vào màn hình Quản lý người dùng, React sẽ khởi tạo Component này trên Virtual DOM.
 * - Minh chứng 2: Tại các dòng 104-110 có khai báo các State điều khiển Modal, Từ khóa tìm kiếm (`keyword`),
 *   Bộ lọc Vai trò (`roleFilter`), Trạng thái (`statusFilter`), và Phân trang (`pagination`).
 * - Minh chứng 3: Tại các dòng 113-119 có khởi tạo Antd Form (`form`, `editForm`), `queryClient`, `useAuthStore` 
 *   để lấy thông tin tài khoản đăng nhập hiện tại (`currentEmail`, `token`) và `useNavigate` chuyển trang.
 * 
 * BƯỚC 2: KẾT NỐI KÊNH WEBSOCKET ĐỒNG BỘ NGUỜI DÙNG THỜI GIAN THỰC (REAL-TIME WEBSOCKET SYNC)
 * - Minh chứng: Tại dòng 136 khai báo `useEffect(() => { ... }, [queryClient, token])`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Khởi tạo STOMP Client kết nối tới WebSocket Endpoint `/ws-pbms` kèm Bearer Token xác thực.
 *   + Khi kết nối thành công, subscribe kênh `/topic/identity/users`. Bất kỳ thay đổi người dùng nào 
 *     từ Server sẽ kích hoạt `queryClient.invalidateQueries({ queryKey: ['users'] })` để làm tươi bảng lập tức.
 * 
 * BƯỚC 3: TRUY VẤN VÀ TẢI DANH SÁCH NGUỜI DÙNG PHÂN TRANG (PAGINATED QUERY FETCHING)
 * - Minh chứng: Tại dòng 160 khai báo `const { data, isLoading } = useQuery(...)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + `useQuery` lắng nghe sự thay đổi của `[keyword, roleFilter, statusFilter, pagination.current, pagination.pageSize]`.
 *   + Gọi API GET `/identity/users` gửi các tham số tìm kiếm, phân trang (trừ 1 vì Spring Boot đếm từ trang 0).
 *   + Dữ liệu trả về được giải mã thành danh sách `users` và tổng số bản ghi `totalElements`.
 * 
 * BƯỚC 4: THỰC THI CÁC TÁC VỤ THAY ĐỔI DỮ LIỆU (MUTATIONS - CREATE, UPDATE, LOCK/UNLOCK, RESET PASSWORD)
 * - Minh chứng 1: Dòng 186 `createUserMutation`: Gọi API POST `/identity/users` tạo tài khoản mới và phát mật khẩu tạm qua Email.
 * - Minh chứng 2: Dòng 213 `updateUserMutation`: Gọi API PUT `/identity/users/{id}` cập nhật Họ tên & Vai trò.
 * - Minh chứng 3: Dòng 238 `changeStatusMutation`: Gọi API PUT `/identity/users/{id}/status` Khóa/Mở khóa tài khoản.
 * - Minh chứng 4: Dòng 260 `resetPasswordMutation`: Gọi API PUT `/identity/users/{id}/reset-password` Cấp lại mật khẩu.
 * 
 * BƯỚC 5: XÂY DỰNG CẤU TRÚC BẢNG DỮ LIỆU VÀ RENDER GIAO DIỆN (TABLE COLUMNS & JSX RENDER)
 * - Minh chứng 1: Tại dòng 279 khai báo mảng `columns` quy định cấu trúc hiển thị các cột (Full Name, Role, Status, Authentication, Action).
 * - Minh chứng 2: Tại dòng 407 khối JSX Render hiển thị Header, thanh công cụ Tìm kiếm/Lọc, Bảng Antd Table và 2 Modal Form (Tạo mới & Chỉnh sửa).
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN LÕI REACT VÀ QUẢN LÝ TRẠNG THÁI / TRUY VẤN (HOOKS & QUERY)
// Công dụng: Thư viện React tiêu chuẩn và TanStack Query hỗ trợ nạp/cập nhật dữ liệu bất đồng bộ.
// =========================================================================
import React, { useState, useEffect } from 'react'; // Hooks quản lý vòng đời và State của React.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; // Bộ công cụ quản lý API Caching và Mutation.

// =========================================================================
// PHẦN 2: CÁC THƯ VIỆN GIAO DIỆN VÀ ICON (ANT DESIGN & ICONS)
// Công dụng: Cung cấp các thành phần UI cao cấp (Table, Modal, Form, Tag, Popconfirm) và các Icon.
// =========================================================================
import { Table, Button, Modal, Form, Input, Select, Tag, message, Popconfirm, Space, Tooltip } from 'antd'; // Các Component UI Ant Design.
import { SearchOutlined, LockOutlined, UnlockOutlined, EditOutlined, KeyOutlined, UserAddOutlined } from '@ant-design/icons'; // Bộ Icon thao tác tài khoản.

// =========================================================================
// PHẦN 3: CÁC CLIENT API, STORE VÀ KẾT NỐI WEBSOCKET / ROUTING
// Công dụng: Kết nối HTTP Axios, WebSocket STOMP real-time, Store lưu Token và điều hướng trang.
// =========================================================================
import { Client } from '@stomp/stompjs'; // Thư viện STOMP Client xử lý kết nối WebSocket.
import axiosClient from '../../core/api/axiosClient'; // Axios instance gọi API Backend.
import { useAuthStore } from '../../core/store/useAuthStore'; // Store lưu trữ phiên làm việc người dùng.
import { useNavigate } from 'react-router-dom'; // Hook chuyển hướng đường dẫn trong React Router.

// =========================================================================
// PHẦN 4: KHAI BÁO TYPE, CONSTANT VÀ HÀM BỔ TRỢ (DATA TYPES & HELPERS)
// Công dụng: Định nghĩa kiểu dữ liệu User, cấu hình danh sách Vai trò và hàm hiển thị Tag màu.
// =========================================================================

/** Interface định nghĩa cấu trúc một tài khoản người dùng trong hệ thống */
interface User {
    id: number;
    name: string;
    email: string;
    role: string;
    isVerified: boolean;
    isActive: boolean;
}

/** Danh sách các vai trò (Role) khả dụng kèm cấu hình nhãn và màu sắc hiển thị */
const ROLE_OPTIONS = [
    { value: 'SUPER_ADMIN', label: 'Super Admin', color: 'volcano' },
    { value: 'MANAGER', label: 'Manager', color: 'blue' },
    { value: 'STAFF', label: 'Staff', color: 'geekblue' },
    { value: 'CUSTOMER', label: 'Customer', color: 'default' },
];

/**
 * Hàm hỗ trợ lấy thông tin hiển thị Vai trò (Label và Màu Tag)
 * @param role Chuỗi vai trò trả về từ Backend (ví dụ: 'ROLE_STAFF' hoặc 'STAFF')
 */
const getRoleDisplay = (role: string) => {
    // Loại bỏ tiền tố 'ROLE_' nếu có để tra cứu trong mảng ROLE_OPTIONS
    const key = role?.replace(/^ROLE_/, '');
    const found = ROLE_OPTIONS.find(r => r.value === key);
    return found || { value: key, label: key, color: 'default' };
};

/**
 * === PHẦN 5: ĐỊNH NGHĨA COMPONENT USERMANAGEMENTSCREEN ===
 * Màn hình quản lý người dùng nội bộ: Xem danh sách, tạo mới, chỉnh sửa thông tin, khóa/mở khóa và cấp lại mật khẩu.
 */
export const UserManagementScreen = () => {
    // --- KHỞI TẠO STATE ĐIỀU KHIỂN GIAO DIỆN VÀ BỘ LỌC ---
    const [isModalVisible, setIsModalVisible] = useState(false); // Trạng thái ẩn/hiện Modal tạo tài khoản
    const [isEditModalVisible, setIsEditModalVisible] = useState(false); // Trạng thái ẩn/hiện Modal chỉnh sửa
    const [editingUser, setEditingUser] = useState<User | null>(null); // Đối tượng người dùng đang được chỉnh sửa
    const [keyword, setKeyword] = useState(''); // Từ khóa tìm kiếm (Tên, Email)
    const [roleFilter, setRoleFilter] = useState<string | undefined>(undefined); // Bộ lọc theo Vai trò
    const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined); // Bộ lọc theo Trạng thái (ACTIVE/INACTIVE)
    const [pagination, setPagination] = useState({ current: 1, pageSize: 10 }); // Trạng thái phân trang

    // --- KHỞI TẠO HOOKS CỦA ANTD VÀ QUẢN LÝ HỆ THỐNG ---
    const [form] = Form.useForm(); // Form Instance cho Modal tạo tài khoản
    const [editForm] = Form.useForm(); // Form Instance cho Modal cập nhật
    const queryClient = useQueryClient(); // Query Client để invalidate cache
    const logout = useAuthStore((s) => s.logout); // Hàm đăng xuất tài khoản
    const token = useAuthStore((s) => s.token); // Bearer Token của người dùng hiện tại
    const currentEmail = useAuthStore((s: any) => s.account?.email ?? ''); // Email tài khoản đang đăng nhập
    const navigate = useNavigate(); // Hook chuyển hướng đường dẫn

    /**
     * =========================================================================
     * EFFECT: KẾT NỐI WEBSOCKET STOMP ĐỒNG BỘ DỮ LIỆU THỜI GIAN THỰC
     * =========================================================================
     * MỤC ĐÍCH:
     * Lắng nghe kênh tin nhắn `/topic/identity/users`. Khi có bất kỳ thay đổi tài khoản nào từ các máy khác,
     * client sẽ tự động invalidate query 'users' để nạp lại dữ liệu mới nhất mà không cần F5.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Khởi tạo `Client` STOMP kết nối tới endpoint `/ws-pbms` với giao thức ws:// hoặc wss://.
     * 2. Truyền Bearer Token trong `connectHeaders` để xác thực.
     * 3. `onConnect`: Đăng ký lắng nghe (subscribe) đường dẫn `/topic/identity/users`.
     * 4. Khi nhận thông báo -> Gọi `queryClient.invalidateQueries({ queryKey: ['users'] })`.
     * 5. Cleanup: Ngắt kết nối (`stomp.deactivate()`) khi component unmount.
     */
    useEffect(() => {
        const stomp = new Client({
            brokerURL: window.location.protocol === 'https:' ? `wss://${window.location.host}/ws-pbms` : `ws://${window.location.host}/ws-pbms`,
            connectHeaders: { Authorization: `Bearer ${token}` },
            onConnect: () => {
                stomp.subscribe('/topic/identity/users', () => {
                    queryClient.invalidateQueries({ queryKey: ['users'] });
                });
            },
        });
        stomp.activate();
        return () => { stomp.deactivate(); };
    }, [queryClient, token]);

    /**
     * =========================================================================
     * QUERY: TRUY VẤN DANH SÁCH NGUỜI DÙNG PHÂN TRANG VÀ LỌC
     * =========================================================================
     * MỤC ĐÍCH:
     * Tải danh sách người dùng từ API `/identity/users` dựa trên từ khóa tìm kiếm, vai trò, trạng thái và trang hiện tại.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Định nghĩa `queryKey` chứa tất cả các biến phụ thuộc (keyword, roleFilter, statusFilter, pagination).
     * 2. Trong `queryFn`: Gọi API GET `/identity/users` với các query params: `keyword`, `role`, `status`, `page`, `size`.
     * 3. Trả về đối tượng chứa `content` (mảng người dùng) và `totalElements` (tổng số bản ghi).
     */
    const { data, isLoading } = useQuery({
        queryKey: ['users', keyword, roleFilter, statusFilter, pagination.current, pagination.pageSize],
        queryFn: async () => {
            const res = await axiosClient.get('/identity/users', {
                params: {
                    keyword: keyword || undefined,
                    role: roleFilter || undefined,
                    status: statusFilter || undefined,
                    page: pagination.current - 1,
                    size: pagination.pageSize,
                },
            });
            return res.data.data;
        },
    });

    const users: User[] = data?.content || [];
    const totalElements = data?.totalElements || 0;

    /**
     * =========================================================================
     * MUTATION: TẠO TÀI KHOẢN NGUỜI DÙNG MỚI
     * =========================================================================
     * MỤC ĐÍCH:
     * Đẩy dữ liệu Form đăng ký người dùng mới lên Backend qua API POST `/identity/users`.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. `mutationFn`: Gọi API POST `/identity/users` với dữ liệu form (`name`, `email`, `role`).
     * 2. `onSuccess`: Đóng Modal, reset Form, thông báo tạo thành công và mật khẩu tạm đã gửi qua email, làm tươi danh sách.
     * 3. `onError`: Bắt lỗi trùng email (status 409) để gán lỗi trực tiếp lên field `email` của Form, hiển thị message lỗi.
     */
    const createUserMutation = useMutation({
        mutationFn: (values: any) => axiosClient.post('/identity/users', values).then(r => r.data),
        onSuccess: () => {
            message.success('Account created successfully. Temporary password sent via email.');
            setIsModalVisible(false);
            form.resetFields();
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => {
            const msg = err.response?.data?.message || '';
            if (err.response?.status === 409 || msg.includes('already exists') || msg.includes('Email')) {
                form.setFields([{ name: 'email', errors: ['This email is already in use.'] }]);
            }
            message.error(msg || 'Failed to create account.');
        },
    });

    /**
     * =========================================================================
     * MUTATION: CẬP NHẬT THÔNG TIN NGUỜI DÙNG
     * =========================================================================
     * MỤC ĐÍCH:
     * Gửi thông tin chỉnh sửa (Họ tên, Vai trò) của người dùng lên API PUT `/identity/users/{id}`.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. `mutationFn`: Gọi API PUT `/identity/users/{id}` với `values` mới.
     * 2. `onSuccess`: Đóng Modal chỉnh sửa, reset Form, xóa state `editingUser`, thông báo thành công và reload danh sách.
     * 3. `onError`: Hiển thị thông báo lỗi cập nhật.
     */
    const updateUserMutation = useMutation({
        mutationFn: ({ id, values }: { id: number; values: any }) =>
            axiosClient.put(`/identity/users/${id}`, values).then(r => r.data),
        onSuccess: () => {
            message.success('Information updated successfully.');
            setIsEditModalVisible(false);
            editForm.resetFields();
            setEditingUser(null);
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => {
            message.error(err.response?.data?.message || 'Update failed.');
        },
    });

    /**
     * =========================================================================
     * MUTATION: KHÓA HOẶC MỞ KHÓA TÀI KHOẢN NGUỜI DÙNG
     * =========================================================================
     * MỤC ĐÍCH:
     * Thay đổi trạng thái hoạt động (`isActive`) của người dùng thông qua API PUT `/identity/users/{id}/status`.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. `mutationFn`: Gọi API PUT `/identity/users/{id}/status?activate={boolean}`.
     * 2. `onSuccess`: Thông báo đã Khóa/Mở khóa thành công và invalidate cache danh sách người dùng.
     * 3. `onError`: Hiển thị thông báo lỗi nếu thao tác thất bại.
     */
    const changeStatusMutation = useMutation({
        mutationFn: ({ id, activate }: { id: number; activate: boolean }) =>
            axiosClient.put(`/identity/users/${id}/status`, null, { params: { activate } }).then(r => r.data),
        onSuccess: (_, vars) => {
            message.success(`Account has been ${vars.activate ? 'unlocked' : 'locked'} successfully.`);
            queryClient.invalidateQueries({ queryKey: ['users'] });
        },
        onError: (err: any) => {
            message.error(err.response?.data?.message || 'Actions Failed.');
        },
    });

    /**
     * =========================================================================
     * MUTATION: CẤP LẠI MẬT KHẨU (RESET PASSWORD)
     * =========================================================================
     * MỤC ĐÍCH:
     * Yêu cầu Server tạo mật khẩu ngẫu nhiên mới và gửi qua Email cho người dùng qua API PUT `/identity/users/{id}/reset-password`.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. `mutationFn`: Gọi API PUT `/identity/users/{id}/reset-password`.
     * 2. `onSuccess`: Thông báo mật khẩu mới đã được gửi qua email thành công.
     * 3. `onError`: Thông báo lỗi cấp lại mật khẩu thất bại.
     */
    const resetPasswordMutation = useMutation({
        mutationFn: (id: number) =>
            axiosClient.put(`/identity/users/${id}/reset-password`).then(r => r.data),
        onSuccess: () => message.success('New password sent via email.'),
        onError: () => message.error('Failed to reset password.'),
    });

    // --- HÀM BỔ TRỢ MỞ MODAL CHỈNH SỬA ---
    const openEdit = (record: User) => {
        setEditingUser(record);
        editForm.setFieldsValue({
            name: record.name,
            email: record.email,
            role: record.role?.replace(/^ROLE_/, ''), // Chuẩn hóa bỏ tiền tố ROLE_ để gắn vào Select
        });
        setIsEditModalVisible(true);
    };

    /**
     * =========================================================================
     * CẤU HÌNH CÁC CỘT CHO BẢNG ANTD TABLE (COLUMNS CONFIGURATION)
     * =========================================================================
     */
    const columns = [
        {
            title: 'Full Name',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, r: User) => (
                <div>
                    <div className="font-medium text-gray-800">{name || '—'}</div>
                    <div className="text-xs text-gray-400">{r.email}</div>
                </div>
            ),
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role: string) => {
                const r = getRoleDisplay(role);
                return <Tag color={r.color}>{r.label}</Tag>;
            },
        },
        {
            title: 'Status',
            dataIndex: 'isActive',
            key: 'isActive',
            render: (isActive: boolean) =>
                isActive
                    ? <Tag color="success">Active</Tag>
                    : <Tag color="error">Locked</Tag>,
        },
        {
            title: 'Authentication',
            dataIndex: 'isVerified',
            key: 'isVerified',
            render: (v: boolean) => v ? <Tag color="cyan">Verified</Tag> : <Tag>Unverified</Tag>,
        },
        {
            title: 'Action',
            key: 'actions',
            width: 260,
            render: (_: any, record: User) => {
                const isSelf = record.email === currentEmail; // Kiểm tra xem bản ghi có phải chính tài khoản đang đăng nhập không
                return (
                    <Space size={4}>
                        {/* NÚT CHỈNH SỬA THÔNG TIN */}
                        <Tooltip title="Edit info & role">
                            <Button
                                size="small"
                                icon={<EditOutlined />}
                                onClick={() => openEdit(record)}
                            >
                                Edit
                            </Button>
                        </Tooltip>

                        {/* NÚT KHÓA / MỞ KHÓA TÀI KHOẢN */}
                        {record.isActive ? (
                            <Tooltip title={isSelf ? 'Cannot lock own account' : 'Lock account'}>
                                <Popconfirm
                                    title="Lock account?"
                                    description={`Lock account ${record.name || record.email}?`}
                                    onConfirm={() => changeStatusMutation.mutate({ id: record.id, activate: false })}
                                    okText="Lock"
                                    cancelText="Cancel"
                                    okButtonProps={{ danger: true }}
                                    disabled={isSelf}
                                >
                                    <Button
                                        size="small"
                                        danger
                                        disabled={isSelf}
                                        icon={<LockOutlined />}
                                        loading={changeStatusMutation.isPending}
                                    >
                                        Lock
                                    </Button>
                                </Popconfirm>
                            </Tooltip>
                        ) : (
                            <Popconfirm
                                title="Unlock account?"
                                description={`Unlock account ${record.name || record.email}?`}
                                onConfirm={() => changeStatusMutation.mutate({ id: record.id, activate: true })}
                                okText="Unlock"
                                cancelText="Cancel"
                            >
                                <Button
                                    size="small"
                                    icon={<UnlockOutlined />}
                                    style={{ color: '#16a34a', borderColor: '#16a34a' }}
                                    loading={changeStatusMutation.isPending}
                                >
                                    Unlock
                                </Button>
                            </Popconfirm>
                        )}

                        {/* NÚT RESET MẬT KHẨU */}
                        <Tooltip title="Reset password & send via email">
                            <Popconfirm
                                title="Reset password?"
                                description={`A new password will be sent to ${record.email}.`}
                                onConfirm={() => resetPasswordMutation.mutate(record.id)}
                                okText="Reset"
                                cancelText="Cancel"
                            >
                                <Button
                                    size="small"
                                    icon={<KeyOutlined />}
                                    loading={resetPasswordMutation.isPending}
                                >
                                    Reset PW
                                </Button>
                            </Popconfirm>
                        </Tooltip>
                    </Space>
                );
            },
        },
    ];

    // =========================================================================
    // PHẦN 6: RENDER GIAO DIỆN COMPONENT (JSX)
    // =========================================================================
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-7xl mx-auto">

                {/* HEADER TỔNG QUAN VÀ NÚT TẠO TÀI KHOẢN / ĐĂNG XUẤT */}
                <div className="flex justify-between items-center mb-6 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-800">Internal User Management</h1>
                        <p className="text-sm text-gray-400 mt-1">Administrator · Management · Staff · Customer</p>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            type="primary"
                            size="large"
                            icon={<UserAddOutlined />}
                            onClick={() => setIsModalVisible(true)}
                        >
                            Add User
                        </Button>
                        <button
                            onClick={() => { logout(); navigate('/login'); }}
                            className="px-4 py-2 text-red-600 bg-red-50 font-medium rounded-lg hover:bg-red-100 transition"
                        >
                            Logout
                        </button>
                    </div>
                </div>

                {/* THANH CÔNG CỤ TÌM KIẾM, BỘ LỌC VÀ BẢNG DANH SÁCH NGUỜI DÙNG */}
                <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 mb-4">
                    <div className="flex flex-wrap gap-3 mb-4">
                        <Input.Search
                            placeholder="Search Name, Emaileee"
                            allowClear
                            onSearch={setKeyword}
                            style={{ width: 300 }}
                            enterButton={<Button icon={<SearchOutlined />} type="primary">Search</Button>}
                        />
                        <Select
                            placeholder="Filter by Role"
                            allowClear
                            style={{ width: 200 }}
                            onChange={setRoleFilter}
                            options={ROLE_OPTIONS.map(r => ({ value: r.value, label: r.label }))}
                        />
                        <Select
                            placeholder="Filter by Status"
                            allowClear
                            style={{ width: 200 }}
                            onChange={setStatusFilter}
                            options={[
                                { value: 'ACTIVE', label: 'Active' },
                                { value: 'INACTIVE', label: 'Locked' },
                            ]}
                        />
                    </div>

                    <Table
                        dataSource={users}
                        columns={columns}
                        rowKey="id"
                        loading={isLoading}
                        pagination={{
                            current: pagination.current,
                            pageSize: pagination.pageSize,
                            total: totalElements,
                            showSizeChanger: true,
                            showTotal: (total) => `Total ${total} Account`,
                            onChange: (page, size) => setPagination({ current: page, pageSize: size }),
                        }}
                        bordered
                        size="middle"
                    />
                </div>

                {/* MODAL 1: TẠO TÀI KHOẢN NGUỜI DÙNG MỚI */}
                <Modal
                    title="Create new account"
                    open={isModalVisible}
                    onCancel={() => { setIsModalVisible(false); form.resetFields(); }}
                    footer={null}
                    destroyOnClose
                >
                    <Form form={form} layout="vertical" onFinish={(v) => createUserMutation.mutate(v)} className="mt-4">
                        <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Please enter full name' }]}>
                            <Input placeholder="Nguyen Van A" />
                        </Form.Item>

                        <Form.Item
                            name="email"
                            label="Email Address"
                            rules={[{ required: true, type: 'email', message: 'Invalid email' }]}
                        >
                            <Input placeholder="user@example.com" />
                        </Form.Item>

                        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a Role' }]}>
                            <Select placeholder="Select role">
                                {ROLE_OPTIONS.filter(r => r.value !== 'SUPER_ADMIN').map(r => (
                                    <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>
                                ))}
                            </Select>
                        </Form.Item>

                        <Form.Item className="mb-0 flex justify-end">
                            <Button onClick={() => { setIsModalVisible(false); form.resetFields(); }} className="mr-2">Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={createUserMutation.isPending}>
                                Create an account
                            </Button>
                        </Form.Item>
                    </Form>
                </Modal>

                {/* MODAL 2: CHỈNH SỬA THÔNG TIN NGUỜI DÙNG */}
                <Modal
                    title="Edit account"
                    open={isEditModalVisible}
                    onCancel={() => { setIsEditModalVisible(false); setEditingUser(null); editForm.resetFields(); }}
                    footer={null}
                    destroyOnClose
                >
                    <Form
                        form={editForm}
                        layout="vertical"
                        onFinish={(values) => {
                            if (editingUser) updateUserMutation.mutate({ id: editingUser.id, values });
                        }}
                        className="mt-4"
                    >
                        <Form.Item name="name" label="Full Name" rules={[{ required: true, message: 'Please enter full name' }]}>
                            <Input placeholder="Nguyen Van A" />
                        </Form.Item>

                        <Form.Item name="email" label="Email (Not Edited)">
                            <Input disabled />
                        </Form.Item>

                        <Form.Item name="role" label="Role" rules={[{ required: true, message: 'Please select a Role' }]}>
                            <Select
                                placeholder="Select role"
                                disabled={editingUser?.role?.includes('SUPER_ADMIN')}
                            >
                                {ROLE_OPTIONS
                                    .filter(r => r.value !== 'SUPER_ADMIN' || editingUser?.role?.includes('SUPER_ADMIN'))
                                    .map(r => (
                                        <Select.Option key={r.value} value={r.value}>{r.label}</Select.Option>
                                    ))}
                            </Select>
                        </Form.Item>

                        <Form.Item className="mb-0 flex justify-end">
                            <Button onClick={() => { setIsEditModalVisible(false); editForm.resetFields(); }} className="mr-2">Cancel</Button>
                            <Button type="primary" htmlType="submit" loading={updateUserMutation.isPending}>
                                Update
                            </Button>
                        </Form.Item>
                    </Form>
                </Modal>

            </div>
        </div>
    );
};
