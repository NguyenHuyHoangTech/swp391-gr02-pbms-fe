// =========================================================================
// PHẦN 1: THƯ VIỆN LÕI REACT & CÔNG CỤ FETCH DỮ LIỆU
// =========================================================================
import React, { useState, useEffect } from 'react'; // Quản lý vòng đời và State của Component
import { useQuery, useQueryClient } from '@tanstack/react-query'; // Hook hỗ trợ gọi API tự động (polling) và quản lý Cache
import axiosClient from '../../core/api/axiosClient'; // Cấu hình Axios gọi API tới Backend có đính kèm Token JWT

// =========================================================================
// PHẦN 2: THƯ VIỆN GIAO DIỆN (UI COMPONENTS) TỪ ANT DESIGN
// =========================================================================
import { Typography, Button, Badge, List, Tag, Select, FloatButton, Modal, message } from 'antd'; // Các UI Element cơ bản của Ant Design
import { PlusOutlined, CreditCardOutlined, ArrowLeftOutlined } from '@ant-design/icons'; // Bộ icon hiển thị

// =========================================================================
// PHẦN 3: CÁC COMPONENT CON (CHILD COMPONENTS) XỬ LÝ SỰ CỐ
// =========================================================================
import { IncidentSubmitForm } from '../incident/components/IncidentSubmitForm'; // Form tạo sự cố mới
import { IncidentDetailPanel } from '../incident/components/IncidentDetailPanel'; // Bảng chi tiết trạng thái xử lý sự cố

const { Title, Text } = Typography;

/**
 * ============================================================================
 * HELPDESK SCREEN (MÀN HÌNH HỖ TRỢ KHÁCH HÀNG)
 * ============================================================================
 * MỤC ĐÍCH: 
 * Màn hình dành cho Khách hàng (Customer) để quản lý và theo dõi các sự cố đỗ xe.
 * Hỗ trợ tạo mới sự cố (Mất thẻ, sai khu vực...) và xem chi tiết tiến độ giải quyết.
 * 
 * KIẾN TRÚC UI:
 * - Hỗ trợ Responsive: Có 2 chế độ hiển thị riêng biệt cho Mobile (`renderMobileView`) 
 *   và Desktop (`renderDesktopView`).
 * - Tích hợp React Query (`useQuery`) để tự động đồng bộ dữ liệu Real-time (refetchInterval).
 * - Tích hợp History API (`window.history.pushState`) để xử lý mượt mà nút Back vật lý 
 *   trên các thiết bị Mobile.
 * ============================================================================
 */
export const HelpdeskScreen = () => {
    // ---------------------------------------------------------------------------
    // 1. STATE MANAGEMENT & HOOKS
    // ---------------------------------------------------------------------------
    /** Vé sự cố đang được chọn để xem chi tiết */
    const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
    /** Phân loại đang chọn (VD: LOST_CARD, ZONE_VIOLATION...) hoặc CREATE_INCIDENT */
    const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
    /** Bộ lọc theo trạng thái (Giai đoạn 1, 2, 3 hoặc Đã hủy) */
    const [queueFilter, setQueueFilter] = useState<string>('ALL');

    const queryClient = useQueryClient();

    // ---------------------------------------------------------------------------
    // 2. MOBILE BACK BUTTON HANDLING (HISTORY API)
    // ---------------------------------------------------------------------------
    /**
     * Xử lý sự kiện khi người dùng bấm nút Back vật lý trên điện thoại.
     * Giúp đóng màn hình chi tiết hoặc màn hình tạo sự cố thay vì thoát khỏi Web App.
     */
    // Handle mobile hardware back button using History API
    useEffect(() => {
        const handlePopState = (event: PopStateEvent) => {
            // Whenever user presses physical back button, we go back to the main list
            setSelectedTicket(null);
            if (window.location.hash !== '#create') {
                setSelectedCategory(prev => (prev === 'CREATE_INCIDENT') ? 'ALL' : prev);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, []);

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

    // ---------------------------------------------------------------------------
    // 3. FETCH DATA (REACT QUERY)
    // ---------------------------------------------------------------------------
    /**
     * Lấy danh sách sự cố của user hiện tại. 
     * Sử dụng polling (refetchInterval: 5000) để liên tục cập nhật trạng thái mới nhất từ Server.
     */
    // Fetch incidents for the current user
    const { data: ticketsData = [], isLoading: isLoadingTickets } = useQuery({
        queryKey: ['incidents'],
        queryFn: async () => {
            try {
                const res = await axiosClient.get('/incident/incidents');
                return res.data?.data || [];
            } catch (err) {
                return [];
            }
        },
        refetchInterval: 5000
    });

    useEffect(() => {
        if (selectedTicket) {
            const updated = ticketsData.find((t: any) => t.id === selectedTicket.id);
            if (updated && JSON.stringify(updated) !== JSON.stringify(selectedTicket)) {
                setSelectedTicket(updated);
            }
        }
    }, [ticketsData]);

    // ---------------------------------------------------------------------------
    // 4. DATA FILTERING LOGIC
    // ---------------------------------------------------------------------------
    /** 
     * Lọc danh sách hiển thị dựa trên Phân loại (selectedCategory) 
     * và Trạng thái Giai đoạn (queueFilter).
     */
    const filteredTickets = ticketsData.filter((t: any) => {
        const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory;
        if (!catMatch) return false;

        if (queueFilter === 'PHASE_1') return t.phase === 1 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
        if (queueFilter === 'PHASE_2') return t.phase === 2 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
        if (queueFilter === 'PHASE_3') return t.status === 'RESOLVED';
        if (queueFilter === 'CANCELLED') return t.status === 'CANCELLED' || t.status === 'REJECTED';
        return true;
    });

    // ---------------------------------------------------------------------------
    // 5. EVENT HANDLERS
    // ---------------------------------------------------------------------------
    /** 
     * Hàm callback khi form tạo sự cố hoặc xử lý sự cố thành công.
     * Tự động refetch lại danh sách và đóng form/chuyển view.
     */
    const handleIncidentSuccess = (category?: string, plate?: string, newTicket?: any) => {
        queryClient.invalidateQueries({ queryKey: ['incidents'] });
        if (newTicket) {
            setSelectedTicket(newTicket);
            setSelectedCategory('');
        } else {
            setSelectedCategory('ALL');
            setSelectedTicket(null);
        }
        if (window.location.hash === '#create') {
            window.history.back();
        }
    };

    // ---------------------------------------------------------------------------
    // 6. RENDERERS (MOBILE & DESKTOP VIEWS)
    // ---------------------------------------------------------------------------

    /**
     * Giao diện Mobile: 
     * Thiết kế dạng Single Column (Hiển thị luân phiên giữa List, Form và Detail).
     */
    const renderMobileView = () => {
        const isShowingDetail = selectedTicket !== null;
        const isShowingForm = selectedCategory === 'CREATE_INCIDENT' && selectedTicket === null;
        const isShowingList = !isShowingDetail && !isShowingForm;

        return (
            <div className="flex flex-col h-full bg-slate-50 w-full relative">
                {isShowingList && (
                    <div className="flex flex-col h-full overflow-hidden animate-fade-in w-full">
                        {/* Header */}
                        <div className="bg-white p-4 shadow-sm border-b border-gray-100 shrink-0 z-10 flex flex-col gap-3">
                            <div className="flex justify-between items-center mb-1">
                                <Title level={4} className="m-0 text-gray-800">Customer Support</Title>
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    className="rounded-lg font-medium shadow-sm px-4"
                                    onClick={navigateToForm}
                                >
                                    Submit Request
                                </Button>
                            </div>

                            {/* Horizontal Scroll Categories */}
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                                {[
                                    { id: 'ALL', label: 'All', count: ticketsData.length },
                                    { id: 'ZONE_VIOLATION', label: 'Wrong Zone', count: ticketsData.filter((t: any) => t.type === 'ZONE_VIOLATION').length },
                                    { id: 'OVERSTAY', label: 'Overstay', count: ticketsData.filter((t: any) => t.type === 'OVERSTAY').length },
                                    { id: 'LOST_CARD', label: 'Lost Card', count: ticketsData.filter((t: any) => t.type === 'LOST_CARD').length },
                                    { id: 'DAMAGED_CARD', label: 'Damaged Card', count: ticketsData.filter((t: any) => t.type === 'DAMAGED_CARD').length },
                                    { id: 'LPR_MISMATCH', label: 'License Plate', count: ticketsData.filter((t: any) => t.type === 'LPR_MISMATCH').length },
                                    { id: 'SLOT_OCCUPIED', label: 'Slot Occupied', count: ticketsData.filter((t: any) => t.type === 'SLOT_OCCUPIED').length },
                                    { id: 'BLACKLIST_WARNING', label: 'Blacklist Warning', count: ticketsData.filter((t: any) => t.type === 'BLACKLIST_WARNING').length },
                                    { id: 'FIND_CAR', label: 'Find Car', count: ticketsData.filter((t: any) => t.type === 'FIND_CAR').length },
                                    { id: 'FEE_DISPUTE', label: 'Fee', count: ticketsData.filter((t: any) => t.type === 'FEE_DISPUTE').length },
                                    { id: 'OTHER_FEEDBACK', label: 'Other', count: ticketsData.filter((t: any) => t.type === 'OTHER_FEEDBACK').length }
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
                                { value: 'ALL', label: 'All statuses' },
                                { value: 'PHASE_1', label: 'Processing (Phase 1)' },
                                { value: 'PHASE_2', label: 'Pending Exit (Phase 2)' },
                                { value: 'PHASE_3', label: 'Resolved (Phase 3)' },
                                { value: 'CANCELLED', label: 'Cancelled/Rejected' },
                            ]} />
                        </div>

                        {/* Ticket List */}
                        <div className="flex-1 overflow-y-auto p-3 pb-24">
                            <List dataSource={filteredTickets} renderItem={(item: any) => (
                                <div className="p-4 mb-3 rounded-2xl cursor-pointer border bg-white border-gray-200 shadow-sm active:bg-gray-50 transition-colors" onClick={() => navigateToDetail(item)}>
                                    <div className="flex justify-between items-start mb-2">
                                        <Text strong className="text-gray-800 text-base tracking-wider">{item.plate || item.rfid || 'HOLLOW'}</Text>
                                        <Text type="secondary" className="text-xs">{item.time ? new Date(item.time).toLocaleDateString('vi-VN') : ''}</Text>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Tag color={item.type === 'LOST_CARD' ? 'volcano' : item.type === 'BLACKLIST_VIOLATION' ? 'red' : 'orange'} className="m-0 border-0 rounded-md px-2 py-1">{item.type}</Tag>
                                        {item.status === 'CANCELLED' || item.status === 'REJECTED' ? (
                                            <Tag color="default" className="m-0 border-0 rounded-md px-2 py-1">Cancelled</Tag>
                                        ) : item.status === 'RESOLVED' ? (
                                            <Tag color="success" className="m-0 border-0 rounded-md px-2 py-1">Resolved</Tag>
                                        ) : (
                                            <Tag color={item.phase === 1 ? 'processing' : 'warning'} className="m-0 border-0 rounded-md px-2 py-1 font-semibold text-blue-700">Phase {item.phase}</Tag>
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
                        </div>

                        {/* FAB */}
                        <FloatButton
                            icon={<PlusOutlined />}
                            type="primary"
                            style={{ right: 24, bottom: 24, width: 56, height: 56 }}
                            tooltip="Create New Request"
                            onClick={navigateToForm}
                        />
                    </div>
                )}

                {isShowingForm && selectedCategory === 'CREATE_INCIDENT' && (
                    <div className="flex flex-col h-full bg-slate-50 w-full z-20 absolute inset-0 animate-fade-in-up">
                        <div className="p-4 bg-white shadow-sm flex items-center shrink-0 sticky top-0 z-10 border-b border-gray-200">
                            <Button type="text" icon={<ArrowLeftOutlined />} onClick={navigateBack} className="mr-2" size="large" />
                            <Title level={4} className="m-0 text-gray-800">Submit Support Request</Title>
                        </div>
                        <div className="flex-1 overflow-y-auto pb-24">
                            <IncidentSubmitForm onSuccess={handleIncidentSuccess} userRole="CUSTOMER" />
                        </div>
                    </div>
                )}


                {isShowingDetail && selectedTicket && (
                    <div className="flex flex-col h-full bg-slate-50 w-full z-20 absolute inset-0 animate-fade-in-right">
                        <div className="p-4 bg-white shadow-sm flex items-center shrink-0 sticky top-0 z-10 border-b border-gray-200">
                            <Button type="text" icon={<ArrowLeftOutlined />} onClick={navigateBack} className="mr-2" size="large" />
                            <Title level={4} className="m-0 text-gray-800 flex-1 truncate">{selectedTicket.plate || selectedTicket.rfid || 'Details'}</Title>
                            {selectedTicket.status === 'RESOLVED' ? <Tag color="success">Resolved</Tag> : <Tag color="processing">Phase {selectedTicket.phase}</Tag>}
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <IncidentDetailPanel
                                ticket={selectedTicket}
                                userRole="CUSTOMER"
                                onClose={navigateBack}
                            />
                        </div>
                    </div>
                )}
            </div>
        );
    };

    /**
     * Giao diện Desktop: 
     * Thiết kế dạng 3 Panes (Cột trái: Phân loại, Cột giữa: Danh sách, Cột phải: Chi tiết).
     */
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
                        Submit New Request
                    </Button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 pb-3">
                    {[
                        { id: 'ALL', label: 'All incidents', icon: '📋', count: ticketsData.length },
                        { id: 'ZONE_VIOLATION', label: 'Wrong Zone', icon: '🚨', count: ticketsData.filter((t: any) => t.type === 'ZONE_VIOLATION').length },
                        { id: 'OVERSTAY', label: 'Overstay', icon: '🕒', count: ticketsData.filter((t: any) => t.type === 'OVERSTAY').length },
                        { id: 'LOST_CARD', label: 'Lost Card', icon: '🔥', count: ticketsData.filter((t: any) => t.type === 'LOST_CARD').length },
                        { id: 'DAMAGED_CARD', label: 'Damaged Card', icon: '💳', count: ticketsData.filter((t: any) => t.type === 'DAMAGED_CARD').length },
                        { id: 'LPR_MISMATCH', label: 'License Plate Mismatch', icon: '🤖', count: ticketsData.filter((t: any) => t.type === 'LPR_MISMATCH').length },
                        { id: 'SLOT_OCCUPIED', label: 'Slot Occupied', icon: '🚗', count: ticketsData.filter((t: any) => t.type === 'SLOT_OCCUPIED').length },
                        { id: 'BLACKLIST_WARNING', label: 'Blacklist Warning', icon: '⛔', count: ticketsData.filter((t: any) => t.type === 'BLACKLIST_WARNING').length },
                        { id: 'FIND_CAR', label: 'Find Car', icon: '🔍', count: ticketsData.filter((t: any) => t.type === 'FIND_CAR').length },
                        { id: 'FEE_DISPUTE', label: 'Fee Dispute', icon: '💰', count: ticketsData.filter((t: any) => t.type === 'FEE_DISPUTE').length },
                        { id: 'OTHER_FEEDBACK', label: 'Other Feedback', icon: '💬', count: ticketsData.filter((t: any) => t.type === 'OTHER_FEEDBACK').length }
                    ].map(cat => (
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
                        <Text strong className="text-gray-700 text-base">List ({filteredTickets.length})</Text>
                    </div>
                    <Select size="small" value={queueFilter} onChange={setQueueFilter} className="w-full" options={[
                        { value: 'ALL', label: 'All statuses' },
                        { value: 'PHASE_1', label: 'Processing (Phase 1)' },
                        { value: 'PHASE_2', label: 'Pending Exit (Phase 2)' },
                        { value: 'PHASE_3', label: 'Resolved (Phase 3)' },
                        { value: 'CANCELLED', label: 'Cancelled/Rejected' },
                    ]} />
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                    <List dataSource={filteredTickets} renderItem={(item: any) => (
                        <div className={`p-3 mb-2 rounded-xl cursor-pointer border transition-all ${selectedTicket?.id === item.id ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:border-blue-300'}`} onClick={() => setSelectedTicket(item)}>
                            <div className="flex justify-between items-start mb-1"><Text strong className="text-gray-800 tracking-wider">{item.plate || item.rfid || 'HOLLOW'}</Text><Text type="secondary" className="text-xs">{item.time ? new Date(item.time).toLocaleDateString('vi-VN') : ''}</Text></div>
                            <div className="flex flex-wrap gap-2 mb-2">
                                <Tag color={item.type === 'LOST_CARD' ? 'volcano' : item.type === 'BLACKLIST_VIOLATION' ? 'red' : 'orange'} className="m-0 border-0 text-[10px] sm:text-xs">{item.type}</Tag>
                                {item.status === 'CANCELLED' || item.status === 'REJECTED' ? (
                                    <Tag color="default" className="m-0 border-0 text-[10px] sm:text-xs">Cancelled</Tag>
                                ) : item.status === 'RESOLVED' ? (
                                    <Tag color="success" className="m-0 border-0 text-[10px] sm:text-xs">Resolved</Tag>
                                ) : (
                                    <Tag color={item.phase === 1 ? 'processing' : 'warning'} className="m-0 border-0 text-[10px] sm:text-xs">Phase {item.phase}</Tag>
                                )}
                            </div>
                        </div>
                    )} />
                </div>
            </div>

            {/* Pane 3: Details */}
            <div className={`flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col`}>
                {selectedCategory === 'CREATE_INCIDENT' && !selectedTicket ? (
                    <div className="flex flex-col h-full overflow-y-auto">
                        <div className="p-4 border-b border-gray-200 bg-slate-50 flex items-center justify-between shrink-0">
                            <div>
                                <Title level={4} className="m-0 text-blue-700">Create a new support request</Title>
                                <Text className="text-sm text-gray-500">Submit incident details for management to assist in resolution</Text>
                            </div>
                        </div>
                        <div className="p-8 flex-1">
                            <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                                <IncidentSubmitForm onSuccess={handleIncidentSuccess} userRole="CUSTOMER" />
                            </div>
                        </div>
                    </div>
                ) : selectedTicket ? (
                    <div className="flex flex-col h-full overflow-hidden">
                        <div className="flex-1 overflow-hidden p-4">
                            <IncidentDetailPanel
                                ticket={selectedTicket}
                                userRole="CUSTOMER"
                                onClose={() => setSelectedTicket(null)}
                            />
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-slate-50"><CreditCardOutlined className="text-6xl text-slate-300 mb-4" /><Title level={4} className="text-slate-400">No incident selected</Title><Text>Please select an incident from the list</Text></div>
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
