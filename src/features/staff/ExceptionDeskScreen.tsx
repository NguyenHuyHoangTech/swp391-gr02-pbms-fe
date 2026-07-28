// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN UI VÀ TIỆN ÍCH REACT
// =========================================================================
import { useState, useMemo, useEffect } from 'react'; // Quản lý vòng đời và State của Component
import { Typography, Button, Badge, List, Tag, Modal, InputNumber, Card, Select, FloatButton } from 'antd'; // Các UI Element cơ bản của Ant Design
import { WarningOutlined, PlusOutlined, CreditCardOutlined, ArrowLeftOutlined } from '@ant-design/icons'; // Bộ icon hiển thị
import { useNavigate } from 'react-router-dom'; // Hook để điều hướng chuyển trang (Chuyển sang màn hình Giao Ca)

// =========================================================================
// PHẦN 2: CÁC THƯ VIỆN QUẢN LÝ TRẠNG THÁI VÀ KẾT NỐI API
// =========================================================================
import { useAuthStore } from '../../core/store/useAuthStore'; // Lấy thông tin user và role đang đăng nhập từ Zustand Store
import { useQuery, useMutation, useQueryClient, useIsFetching } from '@tanstack/react-query'; // Hook hỗ trợ gọi API tự động (polling) và quản lý Cache
import axiosClient from '../../core/api/axiosClient'; // Cấu hình Axios gọi API tới Backend có đính kèm Token JWT

// =========================================================================
// PHẦN 3: CÁC COMPONENT CON (UI MODULES)
// =========================================================================
import { IncidentSubmitForm } from '../incident/components/IncidentSubmitForm'; // Form tạo sự cố mới
import { IncidentDetailPanel } from '../incident/components/IncidentDetailPanel'; // Bảng chi tiết trạng thái xử lý sự cố

/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ CỦA ExceptionDeskScreen.tsx (KÈM MINH CHỨNG CODE)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT LỚN (SCREEN INITIALIZATION)
 * - Minh chứng: Khai báo `export const ExceptionDeskScreen = () => {`. Đây là Component
 *   đóng vai trò như một "Màn hình" (Screen) chứa nhiều chức năng. Nó tự động nạp Role 
 *   và ShiftStatus từ AuthStore.
 * 
 * BƯỚC 2: QUẢN LÝ DỮ LIỆU ĐA TẦNG VÀ ĐỊNH TUYẾN ẢO (STATE & VIRTUAL ROUTING)
 * - Minh chứng 1: Các state `selectedTicket`, `selectedCategory`, `queueFilter`. 
 *   Phân loại và lọc danh sách sự cố.
 * - Minh chứng 2: Dòng `window.history.pushState`. Ứng dụng dùng History API để tạo ra 
 *   các "đường dẫn ảo" (#create, #detail) giúp nút Back trên điện thoại không làm văng app.
 * 
 * BƯỚC 3: TỰ ĐỘNG FETCH DỮ LIỆU LIÊN TỤC (POLLING BACKGROUND DATA)
 * - Minh chứng: Khối lệnh `const { data: ticketsData } = useQuery(...)` với thuộc tính 
 *   `refetchInterval: 3000`. Cứ 3 giây, ứng dụng sẽ tự động gọi Backend lấy danh sách Yêu cầu mới 
 *   giúp nhân viên luôn thấy dữ liệu cập nhật theo thời gian thực (Real-time).
 * 
 * BƯỚC 4: RENDER GIAO DIỆN TƯƠNG THÍCH (RESPONSIVE RENDERING)
 * - Minh chứng: Khai báo `renderMobileView()` và `renderDesktopView()`. Tách biệt hoàn toàn
 *   2 bộ UI cho Mobile (dạng vuốt) và Desktop (dạng 3 cột) nhưng xài chung 1 nguồn Logic.
 * =========================================================================================
 */
const { Title, Text } = Typography;

export const ExceptionDeskScreen = () => {
    const shiftStatus = useAuthStore(state => state.shiftStatus);
    const role = useAuthStore(state => state.role);
    const isManager = role === 'ROLE_MANAGER';
    const navigate = useNavigate();
    const queryClient = useQueryClient();

    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    const [queueFilter, setQueueFilter] = useState<string>('ALL');

    /**
     * =========================================================================
     * HÀM ĐỒNG BỘ: BẮT SỰ KIỆN NÚT BACK TRÊN ĐIỆN THOẠI (HISTORY API)
     * =========================================================================
     * MỤC ĐÍCH: Ngăn người dùng dùng điện thoại bấm nút Back bị văng ra khỏi Web.
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Lắng nghe sự kiện 'popstate' (Khi bấm phím Back vật lý trên Android).
     * 2. Tắt màn hình Detail (`setSelectedTicket(null)`).
     * 3. Trả về Category mặc định nếu đang ở Form Tạo mới.
     */
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            setSelectedTicket(null);
            if (window.location.hash !== '#create') {
                setSelectedCategory(prev => (prev === 'CREATE_INCIDENT') ? 'ALL' : prev);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

    /**
     * =========================================================================
     * HÀM TIỆN ÍCH: ĐIỀU HƯỚNG ẢO (VIRTUAL NAVIGATION)
     * =========================================================================
     * MỤC ĐÍCH: Mở Form hoặc Detail Panel nhưng đồng thời đẩy 1 trạng thái rác 
     * vào Lịch sử trình duyệt để "lừa" nút Back của điện thoại.
     */
    const navigateToDetail = (ticket: any) => {
        window.history.pushState({ view: 'detail' }, '', '#detail');
        setSelectedTicket(ticket);
    };

    const navigateToForm = () => {
        window.history.pushState({ view: 'form' }, '', '#create');
        setSelectedCategory('CREATE_INCIDENT');
        setSelectedTicket(null);
    };

    const navigateBack = () => {
        window.history.back(); // This will trigger popstate
    };

    /**
     * =========================================================================
     * API: LẤY CẤU HÌNH HỆ THỐNG
     * =========================================================================
     * MỤC ĐÍCH: Lấy cấu hình hệ thống (như thời gian đỗ quá giờ cho phép).
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Gọi GET `/system/configs`.
     * 2. Thời gian làm mới (staleTime) là 5 phút để tránh gọi API liên tục.
     */
    const { data: configsData = [] } = useQuery({
        queryKey: ['system_configs'],
        queryFn: async () => {
            const res = await axiosClient.get('/system/configs');
            return res.data?.data || [];
        },
        staleTime: 5 * 60 * 1000,
    });

    /**
     * =========================================================================
     * HÀM TIỆN ÍCH: TRÍCH XUẤT CẤU HÌNH BẢN ĐỒ/HỆ THỐNG
     * =========================================================================
     * MỤC ĐÍCH: Tìm kiếm một giá trị cấu hình cụ thể trong danh sách configsData.
     */
    const getPenaltyConfig = (key: string, fallback: number) => {
        const config = configsData.find((c: any) => c.configKey === key);
        if (config && config.configValue) {
            return parseInt(config.configValue, 10) || fallback;
        }
        return fallback;
    };

    /**
     * =========================================================================
     * API MUTATION: CẬP NHẬT CẤU HÌNH THỜI GIAN QUÁ GIỜ (OVERSTAY)
     * =========================================================================
     * MỤC ĐÍCH: Cho phép Quản lý đổi quy định số giờ được phép đỗ xe trực tiếp trên UI.
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Nhận vào id cấu hình và giá trị mới.
     * 2. Gọi PUT `/system/configs/{id}`.
     * 3. Tẩy não Cache 'system_configs' để tải lại bộ cấu hình mới.
     */
    const updateConfigMutation = useMutation({
        mutationFn: async ({ id, value }: { id: number, value: string }) => {
            await axiosClient.put(`/system/configs/${id}`, {
                configValue: value
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system_configs'] });
        }
    });

    /**
     * =========================================================================
     * API: LẤY DANH SÁCH SỰ CỐ THEO THỜI GIAN THỰC (POLLING)
     * =========================================================================
     * MỤC ĐÍCH: Cập nhật liên tục danh sách sự cố/ngoại lệ để nhân viên xử lý ngay.
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Gọi GET `/incident/incidents`.
     * 2. Sử dụng `refetchInterval: 3000` (Cứ 3 giây tự động gọi ngầm 1 lần).
     */
    const { data: ticketsData = [], isLoading: isLoadingTickets } = useQuery({
        queryKey: ['incidents'],
        queryFn: async () => {
            const res = await axiosClient.get('/incident/incidents');
            return res.data?.data || [];
        },
        refetchInterval: 3000
    });

    /**
     * =========================================================================
     * HÀM ĐỒNG BỘ: LÀM MỚI CHI TIẾT SỰ CỐ HIỆN TẠI
     * =========================================================================
     * MỤC ĐÍCH: Nếu nhân viên đang mở 1 sự cố để xem, mà Backend có dữ liệu mới 
     * của sự cố đó (do người khác xử lý), thì tự động nạp dữ liệu mới vào màn hình.
     */
    useEffect(() => {
        if (selectedTicket) {
            const updated = ticketsData.find((t: any) => t.id === selectedTicket.id);
            if (updated && JSON.stringify(updated) !== JSON.stringify(selectedTicket)) {
                setSelectedTicket(updated);
            }
        }
    }, [ticketsData]);

    /**
     * =========================================================================
     * API: LẤY DANH SÁCH XE BLACKLIST
     * =========================================================================
     * MỤC ĐÍCH: Chỉ gọi khi nhân viên mở tab 'BLACKLIST' để xem danh sách đen.
     */
    const { data: vehiclesData = [] } = useQuery({
        queryKey: ['vehicles_blacklist'],
        queryFn: async () => {
            const res = await axiosClient.get('/operation/vehicles');
            return res.data?.data || [];
        },
        enabled: selectedCategory === 'BLACKLIST'
    });

    const blacklistedVehicles = vehiclesData.filter((v: any) => v.isBlacklisted);

    /**
     * =========================================================================
     * HÀM TÍNH TOÁN: ĐẾM SỐ LƯỢNG YÊU CẦU CHỜ XỬ LÝ (BADGE COUNT)
     * =========================================================================
     * MỤC ĐÍCH: Đếm số lượng sự cố đang ở Phase 1 để hiện vòng tròn đỏ thông báo.
     * Cờ isManager giúp ẩn bớt loại OTHER_FEEDBACK nếu không phải là Quản lý.
     */
    const pendingTickets = useMemo(() => {
        return ticketsData.filter((t: any) =>
            t.phase === 1 &&
            t.status !== 'CANCELLED' &&
            t.status !== 'REJECTED' &&
            t.status !== 'RESOLVED' &&
            (isManager || t.type !== 'OTHER_FEEDBACK')
        );
    }, [ticketsData, isManager]);

    /**
     * =========================================================================
     * HÀM XỬ LÝ: BỘ LỌC DANH SÁCH SỰ CỐ SIÊU NHÂN (SUPER FILTER)
     * =========================================================================
     * MỤC ĐÍCH: Lọc và Sắp xếp danh sách sự cố trước khi hiển thị ra bảng.
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Ẩn mục OTHER_FEEDBACK đối với nhân viên thường.
     * 2. Lọc theo Loại sự cố (Danh mục bên trái).
     * 3. Lọc theo Trạng thái (Phase 1, Phase 2, Hoàn tất, Đã hủy).
     * 4. Sắp xếp theo thời gian tạo (Mới nhất nằm trên cùng).
     */
    const filteredTickets = ticketsData.filter((t: any) => {
        if (!isManager && t.type === 'OTHER_FEEDBACK') return false;
        const isMismatchType = t.type === 'LPR_MISMATCH' || t.type === 'TYPE_MISMATCH' || t.type === 'MULTIPLE_MISMATCH';
        const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION') || (selectedCategory === 'MISMATCH' && isMismatchType);
        if (!catMatch) return false;

        if (queueFilter === 'PHASE_1') return t.phase === 1 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
        if (queueFilter === 'PHASE_2') return t.phase === 2 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
        if (queueFilter === 'PHASE_3') return t.status === 'RESOLVED';
        if (queueFilter === 'CANCELLED') return t.status === 'CANCELLED' || t.status === 'REJECTED';
        return true;
    }).sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const isFetchingTickets = useIsFetching({ queryKey: ['incidents'] }) > 0;
    const [shouldSelectFirstTicket, setShouldSelectFirstTicket] = useState(false);

    /**
     * =========================================================================
     * HÀM ĐỒNG BỘ: TỰ ĐỘNG CHỌN SỰ CỐ ĐẦU TIÊN
     * =========================================================================
     * MỤC ĐÍCH: Tự động mở chi tiết sự cố đầu tiên trong danh sách để màn hình 
     * không bị trống trơn khi vừa load xong.
     */
    useEffect(() => {
        if (shouldSelectFirstTicket && !isFetchingTickets && !isLoadingTickets) {
            if (filteredTickets.length > 0) {
                setSelectedTicket(filteredTickets[0]);
            } else {
                setSelectedTicket(null);
            }
            setShouldSelectFirstTicket(false);
        }
    }, [filteredTickets, isFetchingTickets, isLoadingTickets, shouldSelectFirstTicket]);

    /**
     * =========================================================================
     * HÀM XỬ LÝ (CALLBACK): KHI TẠO SỰ CỐ THÀNH CÔNG
     * =========================================================================
     * MỤC ĐÍCH: Được gọi bởi Component con (IncidentSubmitForm) báo tin vui 
     * là "Đã tạo sự cố xong rồi".
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Tẩy não Cache 'incidents' để ép React tải lại danh sách sự cố mới.
     * 2. Xóa các bộ lọc, reset về 'ALL' để nhân viên thấy ngay sự cố vừa tạo ở đầu danh sách.
     * 3. Bật cờ shouldSelectFirstTicket = true để tự động bôi xanh sự cố đó.
     * 4. Nếu đang ở giao diện Mobile (có hash #create), tự động lùi lại 1 trang (đóng form).
     */
    const handleIncidentSuccess = (category?: string, plate?: string, newTicket?: any) => {
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        setSelectedCategory('ALL');
        setQueueFilter('ALL');
        setShouldSelectFirstTicket(true);
        if (window.location.hash === '#create') {
            window.history.back();
        }
    };

    /**
     * =========================================================================
     * HÀM XỬ LÝ (CALLBACK): KHI XỬ LÝ XONG 1 SỰ CỐ
     * =========================================================================
     * MỤC ĐÍCH: Được gọi bởi Component con (IncidentDetailPanel) báo cáo "Đã 
     * thu tiền/Đã hủy/Đã chốt xong sự cố này".
     * MÃ GIẢ CHI TIẾT TỪNG BƯỚC (PSEUDO-CODE):
     * 1. Tẩy não Cache 'incidents' tải lại bảng để cập nhật trạng thái mới.
     * 2. Bỏ chọn Category và QueueFilter hiện tại, quay về 'ALL'.
     * 3. Bật cờ nhảy về sự cố đầu tiên trong hàng chờ để nhân viên làm tiếp tục mà không bị gián đoạn.
     */
    const handleActionComplete = () => {
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        setSelectedCategory('ALL');
        setQueueFilter('ALL');
        setShouldSelectFirstTicket(true);
    };



    const renderMobileView = () => {
        const isShowingDetail = selectedTicket !== null;
        const isShowingForm = (selectedCategory === 'CREATE_INCIDENT') && selectedTicket === null;
        const isShowingList = !isShowingDetail && !isShowingForm;

        return (
            <div className="flex flex-col h-full bg-slate-50 w-full relative">
                {isShowingList && (
                    <div className="flex flex-col h-full overflow-hidden animate-fade-in w-full">
                        {/* Header */}
                        <div className="bg-white p-4 shadow-sm border-b border-gray-100 shrink-0 z-10 flex flex-col gap-3">
                            <div className="flex justify-between items-center mb-1">
                                <Title level={4} className="m-0 text-gray-800">Exception Desk</Title>
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    className="rounded-lg font-medium shadow-sm px-4"
                                    onClick={navigateToForm}
                                >
                                    Create Incident
                                </Button>
                            </div>

                            {selectedCategory === 'OVERSTAY' && (
                                <div className="p-3 border rounded-lg bg-blue-50/50 flex flex-col gap-2">
                                    <Text strong className="text-gray-700 text-sm">Overstay Configuration</Text>
                                    <div className="flex items-center gap-2">
                                        <Text className="text-xs text-gray-600">Threshold (Hours):</Text>
                                        <InputNumber
                                            size="small"
                                            defaultValue={getPenaltyConfig('OVERSTAY_HOURS_LIMIT', 72)}
                                            min={1}
                                            onPressEnter={(e: any) => {
                                                const config = configsData.find((c: any) => c.configKey === 'OVERSTAY_HOURS_LIMIT');
                                                if (config) {
                                                    updateConfigMutation.mutate({ id: config.id, value: e.target.value });
                                                }
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Horizontal Scroll Categories */}
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                                {[
                                    { id: 'ALL', label: 'All', count: pendingTickets.length },
                                    { id: 'ZONE_VIOLATION', label: 'Wrong Zone', count: pendingTickets.filter((t: any) => t.type === 'ZONE_VIOLATION').length },
                                    { id: 'OVERSTAY', label: 'Overstay', count: pendingTickets.filter((t: any) => t.type === 'OVERSTAY').length },
                                    { id: 'LOST_CARD', label: 'Lost Card', count: pendingTickets.filter((t: any) => t.type === 'LOST_CARD').length },
                                    { id: 'DAMAGED_CARD', label: 'Damaged Card', count: pendingTickets.filter((t: any) => t.type === 'DAMAGED_CARD').length },
                                    { id: 'MISMATCH', label: 'Mismatch', count: pendingTickets.filter((t: any) => t.type === 'LPR_MISMATCH' || t.type === 'TYPE_MISMATCH' || t.type === 'MULTIPLE_MISMATCH').length },
                                    { id: 'SLOT_OCCUPIED', label: 'Slot Occupied', count: pendingTickets.filter((t: any) => t.type === 'SLOT_OCCUPIED').length },
                                    { id: 'FIND_CAR', label: 'Find Car', count: pendingTickets.filter((t: any) => t.type === 'FIND_CAR').length },
                                    { id: 'FEE_DISPUTE', label: 'Fee Dispute', count: pendingTickets.filter((t: any) => t.type === 'FEE_DISPUTE').length },
                                    { id: 'OTHER', label: 'Other Penalty', count: pendingTickets.filter((t: any) => t.type === 'OTHER').length },
                                    ...(isManager ? [{ id: 'OTHER_FEEDBACK', label: 'Feedback', count: pendingTickets.filter((t: any) => t.type === 'OTHER_FEEDBACK').length }] : []),
                                    { id: 'BLACKLIST', label: 'Blacklist', count: pendingTickets.filter((t: any) => t.type === 'BLACKLIST_VIOLATION').length }
                                ].map(cat => (
                                    <div
                                        key={cat.id}
                                        className={`px-4 py-2 rounded-full cursor-pointer transition-all font-medium flex items-center gap-2 shrink-0 snap-start border ${selectedCategory === cat.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200'}`}
                                        onClick={() => setSelectedCategory(cat.id)}
                                    >
                                        <span className="whitespace-nowrap text-sm">{cat.label}</span>
                                        {cat.count > 0 && (
                                            <Badge
                                                count={cat.count}
                                                style={{ backgroundColor: selectedCategory === cat.id ? '#fff' : '#e5e7eb', color: selectedCategory === cat.id ? '#1890ff' : '#4b5563', boxShadow: 'none' }}
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Filters */}
                            <Select size="large" value={queueFilter} onChange={setQueueFilter} className="w-full" options={[
                                {
                                    value: 'ALL', label: `All statuses (${ticketsData.filter((t: any) => {
                                        const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION');
                                        return catMatch;
                                    }).length})`
                                },
                                {
                                    value: 'PHASE_1', label: `🔴 Phase 1 - Pending (${ticketsData.filter((t: any) => {
                                        const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION');
                                        return catMatch && t.phase === 1 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
                                    }).length})`
                                },
                                {
                                    value: 'PHASE_2', label: `🟡 Phase 2 - Processing (${ticketsData.filter((t: any) => {
                                        const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION');
                                        return catMatch && t.phase === 2 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
                                    }).length})`
                                },
                                { value: 'PHASE_3', label: 'Phase 3 (Resolved)' },
                                { value: 'CANCELLED', label: 'Cancelled/Rejected' },
                            ]} />
                        </div>

                        {/* Ticket List */}
                        <div className="flex-1 overflow-y-auto p-3 pb-24">
                            {isLoadingTickets ? (
                                <div className="flex flex-col items-center justify-center p-12 opacity-50">
                                    <div className="animate-spin text-4xl mb-4">⏳</div>
                                    <Text type="secondary">Loading data...</Text>
                                </div>
                            ) : (
                                <>
                                    <List dataSource={filteredTickets} renderItem={(item: any) => (
                                        <div className="p-4 mb-3 rounded-2xl cursor-pointer border bg-white border-gray-200 shadow-sm active:bg-gray-50 transition-colors" onClick={() => navigateToDetail(item)}>
                                            <div className="flex justify-between items-start mb-2">
                                                <Text strong className="text-gray-800 text-base tracking-wider">{item.plate || item.rfid || 'HOLLOW'}</Text>
                                                <Text type="secondary" className="text-xs">{item.time}</Text>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <Tag color={item.type === 'LOST_CARD' ? 'volcano' : item.type === 'BLACKLIST_VIOLATION' ? 'red' : 'orange'} className="m-0 border-0 rounded-md px-2 py-1">{item.type}</Tag>
                                                {item.status === 'CANCELLED' || item.status === 'REJECTED' ? (
                                                    <Tag color="default" className="m-0 border-0 rounded-md px-2 py-1">Cancelled</Tag>
                                                ) : item.status === 'RESOLVED' ? (
                                                    <Tag color="success" className="m-0 border-0 rounded-md px-2 py-1">Resolved (P3)</Tag>
                                                ) : (
                                                    <Tag color={item.phase === 1 ? 'processing' : 'warning'} className="m-0 border-0 rounded-md px-2 py-1 font-semibold text-blue-700">Phase {item.phase}</Tag>
                                                )}
                                                {item.priority === 'HIGH' && (
                                                    <Tag color="red" className="m-0 border-0 rounded-md px-2 py-1 font-semibold">High</Tag>
                                                )}
                                                {item.priority === 'MEDIUM' && (
                                                    <Tag color="orange" className="m-0 border-0 rounded-md px-2 py-1 font-semibold">Medium</Tag>
                                                )}
                                                {item.priority === 'LOW' && (
                                                    <Tag color="green" className="m-0 border-0 rounded-md px-2 py-1 font-semibold">Low</Tag>
                                                )}
                                                {item.sessionVehicleType && (
                                                    <Tag color="purple" className="m-0 border-0 rounded-md px-2 py-1">{item.sessionVehicleType}</Tag>
                                                )}
                                            </div>
                                        </div>
                                    )} />
                                    {filteredTickets.length === 0 && (
                                        <div className="flex flex-col items-center justify-center text-gray-400 p-8 text-center mt-10">
                                            <CreditCardOutlined className="text-5xl text-slate-300 mb-4" />
                                            <Text className="text-slate-500">No incidents</Text>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>

                        {/* FAB */}
                        <FloatButton
                            icon={<PlusOutlined />}
                            type="primary"
                            style={{ right: 24, bottom: 24, width: 56, height: 56 }}
                            tooltip="Create Incident at Desk"
                            onClick={navigateToForm}
                        />
                    </div>
                )}

                {isShowingForm && selectedCategory === 'CREATE_INCIDENT' && (
                    <div className="flex flex-col h-full bg-slate-50 w-full z-20 absolute inset-0 animate-fade-in-up">
                        <div className="p-4 bg-white shadow-sm flex items-center shrink-0 sticky top-0 z-10 border-b border-gray-200">
                            <Button type="text" icon={<ArrowLeftOutlined />} onClick={navigateBack} className="mr-2" size="large" />
                            <Title level={4} className="m-0 text-gray-800">Create Incident at Desk</Title>
                        </div>
                        <div className="flex-1 overflow-y-auto pb-24">
                            <IncidentSubmitForm onSuccess={handleIncidentSuccess} userRole="STAFF" isManager={isManager} />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderDesktopView = () => (
        <div className="flex flex-row flex-1 h-full animate-fade-in bg-gray-100 p-4 gap-4 overflow-hidden">
            {/* Pane 1: Category Sidebar */}
            <div className={`w-64 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0`}>
                <div className="p-4 border-b border-gray-100 bg-gray-50 shrink-0">
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        className="w-full h-11 rounded-xl font-semibold shadow-md shadow-blue-200 text-[15px] bg-blue-600 hover:bg-blue-500"
                        onClick={navigateToForm}
                    >
                        Create Incident at Desk
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 pb-3">
                    {[
                        { id: 'ALL', label: 'All Incidents', icon: '📋', count: pendingTickets.length },
                        { id: 'ZONE_VIOLATION', label: 'Wrong Zone Parking', icon: '🚨', count: pendingTickets.filter((t: any) => t.type === 'ZONE_VIOLATION').length },
                        { id: 'OVERSTAY', label: 'Overstay Vehicles', icon: '🕒', count: pendingTickets.filter((t: any) => t.type === 'OVERSTAY').length },
                        { id: 'LOST_CARD', label: 'Lost Card Report', icon: '🔥', count: pendingTickets.filter((t: any) => t.type === 'LOST_CARD').length },
                        { id: 'DAMAGED_CARD', label: 'Damaged Card', icon: '💳', count: pendingTickets.filter((t: any) => t.type === 'DAMAGED_CARD').length },
                        { id: 'MISMATCH', label: 'Vehicle Mismatches', icon: '🤖', count: pendingTickets.filter((t: any) => t.type === 'LPR_MISMATCH' || t.type === 'TYPE_MISMATCH' || t.type === 'MULTIPLE_MISMATCH').length },
                        { id: 'SLOT_OCCUPIED', label: 'Slot Occupied', icon: '🚗', count: pendingTickets.filter((t: any) => t.type === 'SLOT_OCCUPIED').length },
                        { id: 'FIND_CAR', label: 'Find Car', icon: '🔍', count: pendingTickets.filter((t: any) => t.type === 'FIND_CAR').length },
                        { id: 'FEE_DISPUTE', label: 'Fee Dispute', icon: '💰', count: pendingTickets.filter((t: any) => t.type === 'FEE_DISPUTE').length },
                        { id: 'OTHER', label: 'Other Penalty', icon: '⚠️', count: pendingTickets.filter((t: any) => t.type === 'OTHER').length },
                        { id: 'OTHER_FEEDBACK', label: 'Other Feedback', icon: '💬', count: pendingTickets.filter((t: any) => t.type === 'OTHER_FEEDBACK').length },
                        { id: 'BLACKLIST', label: 'Blacklist', icon: '🚫', count: pendingTickets.filter((t: any) => t.type === 'BLACKLIST_VIOLATION').length }
                    ].filter(cat => cat.id !== 'OTHER_FEEDBACK' || isManager).map(cat => (
                        <div
                            key={cat.id}
                            className={`p-3 rounded-xl cursor-pointer transition-all font-medium flex justify-between items-center gap-3 shrink-0 ${selectedCategory === cat.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200'}`}
                            onClick={() => { setSelectedCategory(cat.id); setSelectedTicket(null); }}
                        >
                            <div className="flex items-center gap-3">
                                <span className="text-lg">{cat.icon}</span>
                                <span className="whitespace-nowrap">{cat.label}</span>
                            </div>
                            {cat.count > 0 && (
                                <Badge
                                    count={cat.count}
                                    style={{ backgroundColor: selectedCategory === cat.id ? '#fff' : '#1890ff', color: selectedCategory === cat.id ? '#1890ff' : '#fff' }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Pane 2: Ticket Queue */}
            <div className={`w-80 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0`}>
                <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col gap-2 shrink-0">
                    <div className="flex justify-between items-center">
                        <Text strong className="text-gray-700 text-base">Queue ({filteredTickets.length})</Text>
                    </div>
                    <Select size="small" value={queueFilter} onChange={setQueueFilter} className="w-full" options={[
                        {
                            value: 'ALL', label: `All statuses (${ticketsData.filter((t: any) => {
                                const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION');
                                return catMatch;
                            }).length})`
                        },
                        {
                            value: 'PHASE_1', label: `🔴 Phase 1 - Pending (${ticketsData.filter((t: any) => {
                                const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION');
                                return catMatch && t.phase === 1 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
                            }).length})`
                        },
                        {
                            value: 'PHASE_2', label: `🟡 Phase 2 - Processing (${ticketsData.filter((t: any) => {
                                const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory || (selectedCategory === 'BLACKLIST' && t.type === 'BLACKLIST_VIOLATION');
                                return catMatch && t.phase === 2 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
                            }).length})`
                        },
                        { value: 'PHASE_3', label: 'Phase 3 (Resolved)' },
                        { value: 'CANCELLED', label: 'Cancelled/Rejected' },
                    ]} />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <List dataSource={filteredTickets} renderItem={(item: any) => (
                        <div className={`p-3 mb-2 rounded-xl cursor-pointer border transition-all ${selectedTicket?.id === item.id ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:border-blue-300'}`} onClick={() => setSelectedTicket(item)}>
                            <div className="flex justify-between items-start mb-1"><Text strong className="text-gray-800 tracking-wider">{item.plate || item.rfid || 'HOLLOW'}</Text><Text type="secondary" className="text-xs">{item.time}</Text></div>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <Tag color={item.type === 'LOST_CARD' ? 'volcano' : item.type === 'BLACKLIST_VIOLATION' ? 'red' : 'orange'} className="m-0 border-0 text-[10px] sm:text-xs">{item.type}</Tag>
                                {item.status === 'CANCELLED' || item.status === 'REJECTED' ? (
                                    <Tag color="default" className="m-0 border-0 text-[10px] sm:text-xs">Cancelled</Tag>
                                ) : item.status === 'RESOLVED' ? (
                                    <Tag color="success" className="m-0 border-0 text-[10px] sm:text-xs">Resolved (P3)</Tag>
                                ) : (
                                    <Tag color={item.phase === 1 ? 'processing' : 'warning'} className="m-0 border-0 text-[10px] sm:text-xs">Phase {item.phase}</Tag>
                                )}
                                {item.priority === 'HIGH' && (
                                    <Tag color="red" className="m-0 border-0 text-[10px] sm:text-xs font-semibold">High</Tag>
                                )}
                                {item.priority === 'MEDIUM' && (
                                    <Tag color="orange" className="m-0 border-0 text-[10px] sm:text-xs font-semibold">Medium</Tag>
                                )}
                                {item.priority === 'LOW' && (
                                    <Tag color="green" className="m-0 border-0 text-[10px] sm:text-xs font-semibold">Low</Tag>
                                )}
                                {item.sessionVehicleType && (
                                    <Tag color="purple" className="m-0 border-0 text-[10px] sm:text-xs">{item.sessionVehicleType}</Tag>
                                )}
                            </div>
                        </div>
                    )} />
                </div>
            </div>

            {/* Pane 3: Details */}
            <div className={`flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col`}>
                {selectedCategory === 'OVERSTAY' && (
                    <div className="p-4 border-b border-gray-200 bg-blue-50/50 flex items-center justify-between shrink-0">
                        <div>
                            <Text strong className="text-gray-700 block text-sm">Overstay Configuration</Text>
                            <Text className="text-xs text-gray-500">The system scans overstay vehicles at 2:00 AM daily.</Text>
                        </div>
                        <div className="flex items-center gap-2">
                            <Text className="text-sm text-gray-600">Threshold (Hours):</Text>
                            <InputNumber
                                style={{ width: 100 }}
                                defaultValue={getPenaltyConfig('OVERSTAY_HOURS_LIMIT', 72)}
                                min={1}
                                onPressEnter={(e: any) => {
                                    const config = configsData.find((c: any) => c.configKey === 'OVERSTAY_HOURS_LIMIT');
                                    if (config) {
                                        updateConfigMutation.mutate({ id: config.id, value: e.target.value });
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}

                {selectedCategory === 'CREATE_INCIDENT' && !selectedTicket ? (
                    <div className="flex flex-col h-full overflow-y-auto">
                        <div className="p-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between shrink-0">
                            <div>
                                <Title level={4} className="m-0 text-blue-700">Create a new Incident at Desk</Title>
                                <Text className="text-sm text-gray-500">Support customers to submit reports or manually record incidents</Text>
                            </div>
                        </div>
                        <div className="p-8 flex-1">
                            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                <IncidentSubmitForm onSuccess={handleIncidentSuccess} userRole="STAFF" isManager={isManager} />
                            </div>
                        </div>
                    </div>
                ) : selectedTicket ? (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-hidden p-4">
                            <IncidentDetailPanel
                                ticket={selectedTicket}
                                userRole="STAFF"
                                isManager={isManager}
                                onClose={() => setSelectedTicket(null)}
                                onActionComplete={handleActionComplete}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-slate-50"><CreditCardOutlined className="text-6xl text-slate-300 mb-4" /><Title level={4} className="text-slate-400">No Incident selected</Title><Text>Please select a Ticket from the Queue</Text></div>
                )}
            </div>
        </div>
    );

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] lg:h-[calc(100vh-64px)] h-[100dvh] overflow-hidden bg-slate-50">
            <div className="lg:hidden h-full">
                {renderMobileView()}
            </div>
            <div className="hidden lg:flex h-full w-full">
                {renderDesktopView()}
            </div>
        </div>
    );
};
