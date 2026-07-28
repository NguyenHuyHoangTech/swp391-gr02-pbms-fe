/**
 * @Author: Thái Tân Phú
 * @Date: 28/07/2026
 * @Description: Trung tâm hỗ trợ khách hàng (Helpdesk) - Giúp khách hàng xem danh sách các sự cố của mình và gửi yêu cầu hỗ trợ mới. Tự động polling mỗi 5s, hỗ trợ render linh hoạt giữa Mobile và Desktop.
 * @Dependencies: 
 * - React, antd, react-query
 * - IncidentSubmitForm, IncidentDetailPanel, axiosClient
 */
import React, { useState, useEffect } from 'react';
import { Typography, Button, Badge, List, Tag, Select, FloatButton } from 'antd';
import { PlusOutlined, CreditCardOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';

import { IncidentSubmitForm } from '../incident/components/IncidentSubmitForm';
import { IncidentDetailPanel } from '../incident/components/IncidentDetailPanel';


const { Title, Text } = Typography;

export const HelpdeskScreen = () => {
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [queueFilter, setQueueFilter] = useState<string>('ALL');
  const queryClient = useQueryClient();

  // ==========================================
  // [EFFECT]: XỬ LÝ NÚT BACK (POPSTATE) CỦA TRÌNH DUYỆT/ĐIỆN THOẠI
  // - Lắng nghe sự kiện `popstate`.
  // - Nếu người dùng bấm back, không thoát web app mà chỉ quay lại danh sách sự cố.
  // - Reset `selectedTicket` và chuyển `selectedCategory` về 'ALL'.
  // ==========================================
  useEffect(() => {
    const handlePopState = () => {
      // Whenever user presses physical back button, we go back to the main list
      setSelectedTicket(null);
      if (window.location.hash !== '#create') {
         setSelectedCategory(prev => (prev === 'CREATE_INCIDENT') ? 'ALL' : prev);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ==========================================
  // [ACTION]: CÁC HÀM ĐIỀU HƯỚNG GIAO DIỆN (MOBILE)
  // - Sử dụng HTML5 History API (`window.history.pushState`) để lưu trạng thái màn hình hiện tại (detail, form).
  // - Cho phép nút Back vật lý trên điện thoại tương tác tự nhiên với SPA.
  // ==========================================
  
  // 1. Mở xem chi tiết một sự cố
  const navigateToDetail = (ticket: any) => {
    window.history.pushState({ view: 'detail' }, '', '#detail');
    setSelectedTicket(ticket);
  };

  // 2. Mở form tạo sự cố mới
  const navigateToForm = () => {
    window.history.pushState({ view: 'form' }, '', '#create');
    setSelectedCategory('CREATE_INCIDENT');
    setSelectedTicket(null);
  };

  // 3. Quay lại màn hình trước
  const navigateBack = () => {
    window.history.back(); // This will trigger popstate
  };

  // ==========================================
  // [DATA]: LẤY DANH SÁCH SỰ CỐ TỪ SERVER
  // - Bước 1: Gọi API GET `/incident/incidents` để lấy mảng sự cố.
  // - Bước 2: Tự động gọi lại sau mỗi 5 giây (Polling) thông qua thuộc tính `refetchInterval`.
  // - Cung cấp dữ liệu theo thời gian thực cho danh sách.
  // ==========================================
  const { data: ticketsData = [] } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      try {
        const res = await axiosClient.get('/incident/incidents');
        return res.data?.data || [];
      } catch {
        return [];
      }
    },
    refetchInterval: 5000
  });

  // ==========================================
  // [EFFECT]: TỰ ĐỘNG CẬP NHẬT CHI TIẾT SỰ CỐ
  // - Bước 1: Theo dõi sự thay đổi của biến `ticketsData`.
  // - Bước 2: Tìm sự cố trong danh sách có `id` trùng với `selectedTicket`.
  // - Bước 3: So sánh chuỗi JSON của 2 object. Nếu có sự thay đổi (VD: Admin gửi tin nhắn mới), gọi `setSelectedTicket` để render lại giao diện.
  // ==========================================
  useEffect(() => {
    if (selectedTicket) {
      const updated = ticketsData.find((t: any) => t.id === selectedTicket.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedTicket)) {
        setSelectedTicket(updated);
      }
    }
  }, [ticketsData]);

  // ==========================================
  // [LOGIC]: LỌC DANH SÁCH SỰ CỐ (FILTER)
  // - Lọc theo Loại sự cố: Nếu `selectedCategory` = ALL thì lấy hết, ngược lại lọc theo thuộc tính `type`.
  // - Lọc theo Giai đoạn xử lý: Dựa trên biến `queueFilter` để lọc Phase 1 (Chờ xử lý), Phase 2 (Đang giải quyết), Phase 3 (Hoàn tất) hoặc Đã hủy.
  // ==========================================
  const filteredTickets = ticketsData.filter((t: any) => {
    const catMatch = selectedCategory === 'ALL' || selectedCategory === 'CREATE_INCIDENT' || t.type === selectedCategory;
    if (!catMatch) return false;
    
    if (queueFilter === 'PHASE_1') return t.phase === 1 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
    if (queueFilter === 'PHASE_2') return t.phase === 2 && t.status !== 'CANCELLED' && t.status !== 'REJECTED';
    if (queueFilter === 'PHASE_3') return t.status === 'RESOLVED';
    if (queueFilter === 'CANCELLED') return t.status === 'CANCELLED' || t.status === 'REJECTED';
    return true;
  });

  // ==========================================
  // [ACTION]: XỬ LÝ KHI TẠO SỰ CỐ THÀNH CÔNG
  // - Bước 1: Gọi `invalidateQueries` để ép React Query gọi lại API lấy danh sách sự cố mới nhất.
  // - Bước 2: Nếu có `newTicket` truyền vào -> Chọn mở ngay chi tiết sự cố đó.
  // - Bước 3: Nếu không -> Trở về danh sách tất cả sự cố ('ALL').
  // - Bước 4: Gọi `window.history.back()` để thoát màn hình Form.
  // ==========================================
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

  // ==========================================
  // [RENDER]: GIAO DIỆN MOBILE
  // - Hiển thị theo nguyên tắc "Stack" (Xếp chồng). 
  // - 1 thời điểm chỉ hiển thị 1 trong 3 trạng thái: Danh sách sự cố HOẶC Form tạo sự cố HOẶC Chi tiết sự cố.
  // ==========================================
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
                <Title level={4} className="m-0 text-gray-800">Hỗ trợ khách hàng</Title>
                <Button 
                  type="primary" 
                  icon={<PlusOutlined />} 
                  className="rounded-lg font-medium shadow-sm px-4"
                  onClick={navigateToForm}
                >
                  Gửi yêu cầu
                </Button>
              </div>
              
              {/* Horizontal Scroll Categories */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {[
                  { id: 'ALL', label: 'Tất cả', count: ticketsData.length },
                  { id: 'ZONE_VIOLATION', label: 'Sai khu vực', count: ticketsData.filter((t: any) => t.type === 'ZONE_VIOLATION').length },
                  { id: 'OVERSTAY', label: 'Quá giờ', count: ticketsData.filter((t: any) => t.type === 'OVERSTAY').length },
                  { id: 'LOST_CARD', label: 'Mất thẻ', count: ticketsData.filter((t: any) => t.type === 'LOST_CARD').length },
                  { id: 'DAMAGED_CARD', label: 'Hỏng thẻ', count: ticketsData.filter((t: any) => t.type === 'DAMAGED_CARD').length },
                  { id: 'LPR_MISMATCH', label: 'Biển số', count: ticketsData.filter((t: any) => t.type === 'LPR_MISMATCH').length },
                  { id: 'SLOT_OCCUPIED', label: 'Trùng chỗ', count: ticketsData.filter((t: any) => t.type === 'SLOT_OCCUPIED').length },
                  { id: 'BLACKLIST_WARNING', label: 'Cảnh báo vi phạm', count: ticketsData.filter((t: any) => t.type === 'BLACKLIST_WARNING').length },
                  { id: 'FIND_CAR', label: 'Tìm xe', count: ticketsData.filter((t: any) => t.type === 'FIND_CAR').length },
                  { id: 'FEE_DISPUTE', label: 'Phí', count: ticketsData.filter((t: any) => t.type === 'FEE_DISPUTE').length },
                  { id: 'OTHER_FEEDBACK', label: 'Khác', count: ticketsData.filter((t: any) => t.type === 'OTHER_FEEDBACK').length }
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
                {value: 'ALL', label: 'Tất cả trạng thái'},
                {value: 'PHASE_1', label: 'Đang xử lý (Phase 1)'},
                {value: 'PHASE_2', label: 'Chờ ra bãi (Phase 2)'},
                {value: 'PHASE_3', label: 'Hoàn tất (Phase 3)'},
                {value: 'CANCELLED', label: 'Đã Hủy/Từ chối'},
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
                        <Tag color="default" className="m-0 border-0 rounded-md px-2 py-1">Đã hủy</Tag>
                      ) : item.status === 'RESOLVED' ? (
                        <Tag color="success" className="m-0 border-0 rounded-md px-2 py-1">Hoàn tất</Tag>
                      ) : (
                        <Tag color={item.phase === 1 ? 'processing' : 'warning'} className="m-0 border-0 rounded-md px-2 py-1 font-semibold text-blue-700">Phase {item.phase}</Tag>
                      )}
                    </div>
                  </div>
                )} />
                {filteredTickets.length === 0 && (
                  <div className="flex flex-col items-center justify-center text-gray-400 p-8 text-center mt-10">
                    <CreditCardOutlined className="text-5xl text-slate-300 mb-4" />
                    <Text className="text-slate-500">Không có sự cố nào</Text>
                  </div>
                )}
            </div>

            {/* FAB */}
            <FloatButton
              icon={<PlusOutlined />}
              type="primary"
              style={{ right: 24, bottom: 24, width: 56, height: 56 }}
              tooltip="Tạo yêu cầu mới"
              onClick={navigateToForm}
            />
          </div>
        )}

        {isShowingForm && selectedCategory === 'CREATE_INCIDENT' && (
          <div className="flex flex-col h-full bg-slate-50 w-full z-20 absolute inset-0 animate-fade-in-up">
            <div className="p-4 bg-white shadow-sm flex items-center shrink-0 sticky top-0 z-10 border-b border-gray-200">
              <Button type="text" icon={<ArrowLeftOutlined />} onClick={navigateBack} className="mr-2" size="large" />
              <Title level={4} className="m-0 text-gray-800">Gửi yêu cầu hỗ trợ</Title>
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
              <Title level={4} className="m-0 text-gray-800 flex-1 truncate">{selectedTicket.plate || selectedTicket.rfid || 'Chi tiết'}</Title>
              {selectedTicket.status === 'RESOLVED' ? <Tag color="success">Hoàn tất</Tag> : <Tag color="processing">Phase {selectedTicket.phase}</Tag>}
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

  // ==========================================
  // [RENDER]: GIAO DIỆN DESKTOP
  // - Hiển thị theo dạng "Split Pane" (3 Cột): 
  //   + Cột 1: Phân loại sự cố (Sidebar).
  //   + Cột 2: Danh sách sự cố trong danh mục đã chọn (List Queue).
  //   + Cột 3: Chi tiết sự cố hoặc Form tạo sự cố (Main View).
  // ==========================================
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
            Gửi Yêu Cầu Mới
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 pb-3">
          {[
            { id: 'ALL', label: 'Tất cả sự cố', icon: '📋', count: ticketsData.length },
            { id: 'ZONE_VIOLATION', label: 'Đỗ sai khu vực', icon: '🚨', count: ticketsData.filter((t: any) => t.type === 'ZONE_VIOLATION').length },
            { id: 'OVERSTAY', label: 'Quá giờ', icon: '🕒', count: ticketsData.filter((t: any) => t.type === 'OVERSTAY').length },
            { id: 'LOST_CARD', label: 'Báo mất thẻ', icon: '🔥', count: ticketsData.filter((t: any) => t.type === 'LOST_CARD').length },
            { id: 'DAMAGED_CARD', label: 'Báo hỏng thẻ', icon: '💳', count: ticketsData.filter((t: any) => t.type === 'DAMAGED_CARD').length },
            { id: 'LPR_MISMATCH', label: 'Sai biển số', icon: '🤖', count: ticketsData.filter((t: any) => t.type === 'LPR_MISMATCH').length },
            { id: 'SLOT_OCCUPIED', label: 'Trùng chỗ đỗ', icon: '🚗', count: ticketsData.filter((t: any) => t.type === 'SLOT_OCCUPIED').length },
            { id: 'BLACKLIST_WARNING', label: 'Cảnh báo vi phạm', icon: '⛔', count: ticketsData.filter((t: any) => t.type === 'BLACKLIST_WARNING').length },
            { id: 'FIND_CAR', label: 'Tìm xe', icon: '🔍', count: ticketsData.filter((t: any) => t.type === 'FIND_CAR').length },
            { id: 'FEE_DISPUTE', label: 'Khiếu nại phí', icon: '💰', count: ticketsData.filter((t: any) => t.type === 'FEE_DISPUTE').length },
            { id: 'OTHER_FEEDBACK', label: 'Góp ý khác', icon: '💬', count: ticketsData.filter((t: any) => t.type === 'OTHER_FEEDBACK').length }
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
            <Text strong className="text-gray-700 text-base">Danh sách ({filteredTickets.length})</Text>
          </div>
          <Select size="small" value={queueFilter} onChange={setQueueFilter} className="w-full" options={[
            {value: 'ALL', label: 'Tất cả trạng thái'},
            {value: 'PHASE_1', label: 'Đang xử lý (Phase 1)'},
            {value: 'PHASE_2', label: 'Chờ ra bãi (Phase 2)'},
            {value: 'PHASE_3', label: 'Hoàn tất (Phase 3)'},
            {value: 'CANCELLED', label: 'Đã Hủy/Từ chối'},
          ]} />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <List dataSource={filteredTickets} renderItem={(item: any) => (
              <div className={`p-3 mb-2 rounded-xl cursor-pointer border transition-all ${selectedTicket?.id === item.id ? 'bg-blue-50 border-blue-400 ring-2 ring-blue-100' : 'bg-white border-gray-200 hover:border-blue-300'}`} onClick={() => setSelectedTicket(item)}>
                <div className="flex justify-between items-start mb-1"><Text strong className="text-gray-800 tracking-wider">{item.plate || item.rfid || 'HOLLOW'}</Text><Text type="secondary" className="text-xs">{item.time ? new Date(item.time).toLocaleDateString('vi-VN') : ''}</Text></div>
                <div className="flex flex-wrap gap-2 mb-2">
                  <Tag color={item.type === 'LOST_CARD' ? 'volcano' : item.type === 'BLACKLIST_VIOLATION' ? 'red' : 'orange'} className="m-0 border-0 text-[10px] sm:text-xs">{item.type}</Tag>
                  {item.status === 'CANCELLED' || item.status === 'REJECTED' ? (
                    <Tag color="default" className="m-0 border-0 text-[10px] sm:text-xs">Đã hủy</Tag>
                  ) : item.status === 'RESOLVED' ? (
                    <Tag color="success" className="m-0 border-0 text-[10px] sm:text-xs">Hoàn tất</Tag>
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
                <Title level={4} className="m-0 text-blue-700">Tạo yêu cầu hỗ trợ mới</Title>
                <Text className="text-sm text-gray-500">Gửi thông tin sự cố để ban quản lý hỗ trợ giải quyết</Text>
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
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 p-8 text-center bg-slate-50"><CreditCardOutlined className="text-6xl text-slate-300 mb-4" /><Title level={4} className="text-slate-400">Chưa chọn sự cố</Title><Text>Vui lòng chọn một sự cố từ danh sách</Text></div>
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
