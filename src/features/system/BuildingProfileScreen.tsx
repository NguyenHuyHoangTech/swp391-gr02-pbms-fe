/**
 * @Author: Nguyen Huu Thanh (TH)
 * @Date: 2026-07-16
 * @Description: Màn hình hồ sơ toà nhà. Hiển thị và cập nhật thông tin nhận diện của
 *   bãi xe (tên, địa chỉ, liên hệ, mô tả) dùng chung cho trang công khai và các
 *   chứng từ do hệ thống phát hành.
 * @Dependencies:
 * - axiosClient (Local: core/api) - gọi API /system/building-profile
 * - @tanstack/react-query (External) - fetch/cache hồ sơ và làm mới sau khi lưu
 * - antd (External) - Form, Input, Card, Button
 */
/**
 * ============================================================================
 * [IMPORT LIBRARIES & UTILITIES] - Các thư viện và công cụ tiện ích
 * ============================================================================
 * 1. React & Hooks: `useState` cho toàn bộ dữ liệu Form; `useEffect` để đổ dữ
 *    liệu Backend trả về vào Form ngay khi tải xong.
 * 2. React Query: `useQuery` kéo hồ sơ tòa nhà hiện tại; `useMutation` gửi bản
 *    cập nhật; `useQueryClient` để làm mới cache sau khi lưu thành công.
 * 3. Ant Design (antd): chỉ mượn đúng 2 component đặc thù không dễ tự vẽ bằng
 *    HTML thuần (`Switch` cho công tắc 24/7, `TimePicker` cho chọn giờ) — phần
 *    còn lại của Form (input, textarea, button) đều là HTML thuần + Tailwind,
 *    không dùng `<Form>` của antd như các màn hình khác trong hệ thống.
 * 4. dayjs: chuyển đổi chuỗi giờ "HH:mm" Backend trả về sang đối tượng ngày
 *    giờ mà `TimePicker` hiểu được, và ngược lại.
 * ============================================================================
 */
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { Switch, TimePicker, message } from 'antd';
import dayjs from 'dayjs';

/**
 * [KIỂU DỮ LIỆU HỒ SƠ TÒA NHÀ] - Khớp 1-1 với `BuildingProfile` (Entity) phía
 * Backend. `is247` quyết định có cần quan tâm 2 trường giờ hoạt động
 * (`operatingStart`/`operatingEnd`) hay không — tòa nhà mở 24/7 thì bỏ qua
 * luôn 2 trường giờ này trên giao diện (xem khối `{!formData.is247 && (...)}`
 * bên dưới).
 */
interface BuildingProfile {
  id?: number;
  name: string;
  address: string;
  hotline: string;
  contactEmail: string;
  is247: boolean;
  operatingStart: string;
  operatingEnd: string;
  rules: string;
  description: string;
}

/**
 * ============================================================================
 * MÔ TẢ TỔNG QUAN VỀ VAI TRÒ & LUỒNG DỮ LIỆU CỦA BUILDING PROFILE SCREEN
 * ============================================================================
 *
 * [PHẦN 1] MỤC ĐÍCH & VAI TRÒ CỦA COMPONENT:
 *    - Màn hình cấu hình 1 hồ sơ DUY NHẤT của tòa nhà (không phải danh sách
 *      nhiều bản ghi) — tên, địa chỉ, hotline, email liên hệ, khung giờ hoạt
 *      động và nội quy bãi xe. Dữ liệu này được các màn hình PHÍA KHÁCH HÀNG
 *      (`HomeScreen`, `CustomerRulesScreen`, `PreBookingScreen`...) đọc lại
 *      qua endpoint công khai `/public/building-profile` để hiển thị thông
 *      tin liên hệ/nội quy cho khách — nên sửa sai ở đây ảnh hưởng ra bên
 *      ngoài hệ thống, không chỉ riêng nội bộ quản lý.
 *
 * [PHẦN 2] GIẢI PHẪU VÒNG ĐỜI DỮ LIỆU KÈM MINH CHỨNG:
 *
 * BƯỚC 1: TẢI HỒ SƠ HIỆN TẠI VÀ ĐỔ VÀO FORM
 * - Minh chứng: `useQuery` (dòng ~55) gọi `GET /system/building-profile`, kết
 *   quả đổ vào `data`. `useEffect` (dòng ~63) lắng nghe `data` đổi -> gọi
 *   ĐỒNG THỜI cả `setFormData(data)` (Form đang gõ) LẪN `setInitialData(data)`
 *   (bản gốc để so sánh) — 2 biến này TÁCH RIÊNG một cách CÓ CHỦ ĐÍCH, xem
 *   Bước 2 để hiểu lý do.
 *
 * BƯỚC 2: THEO DÕI "ĐÃ CHỈNH SỬA CHƯA" (DIRTY CHECKING THỦ CÔNG)
 * - Minh chứng: biến `isDirty` (dòng ~42) so sánh TỪNG TRƯỜNG của `formData`
 *   (đang gõ) với `initialData` (bản gốc lúc tải về) — khác với các màn hình
 *   khác dùng `Form` của antd (có sẵn cơ chế `onValuesChange`), màn hình này
 *   dùng input HTML thuần nên phải TỰ so sánh tay từng trường một. Nút "Save
 *   Changes" chỉ mở khóa khi `isDirty === true`, tránh gửi request thừa khi
 *   người dùng chưa đổi gì.
 *
 * BƯỚC 3: KIỂM TRA HỢP LỆ TRƯỚC KHI GỬI (VALIDATE THỦ CÔNG)
 * - Minh chứng: `handleSubmit` (dòng ~93) tự kiểm tra Hotline bằng Regex
 *   `/^\d{10}$/` (đúng 10 chữ số) TRƯỚC khi gọi `updateMutation` — không dùng
 *   `rules` khai báo như `Form` của antd vì đây là input HTML thuần, nên phải
 *   validate thủ công ngay trong hàm submit.
 *
 * BƯỚC 4: LƯU VÀ ĐỒNG BỘ LẠI "BẢN GỐC"
 * - Minh chứng: `onSuccess` của `updateMutation` (dòng ~79) gọi
 *   `setInitialData(formData)` — cập nhật lại "bản gốc" thành đúng dữ liệu vừa
 *   lưu thành công, để `isDirty` tự động trở về `false` (nút Save khóa lại)
 *   mà KHÔNG cần đợi gọi lại API tải hồ sơ từ đầu.
 * ============================================================================
 */
export const BuildingProfileScreen = () => {
  const queryClient = useQueryClient();

  // Dữ liệu Form đang gõ dở — có giá trị mặc định hợp lý ngay từ đầu (giờ mở
  // cửa 06:00-22:30) để tránh Form trống trơn trong lúc chờ API trả về.
  const [formData, setFormData] = useState<BuildingProfile>({
    name: '', address: '', hotline: '', contactEmail: '', is247: false, operatingStart: '06:00', operatingEnd: '22:30', rules: '', description: ''
  });
  // "Bản gốc" — snapshot dữ liệu tại thời điểm tải về/lưu thành công gần nhất,
  // dùng làm mốc so sánh để tính `isDirty` bên dưới.
  const [initialData, setInitialData] = useState<BuildingProfile | null>(null);

  // So sánh THỦ CÔNG từng trường giữa `formData` (đang gõ) và `initialData`
  // (bản gốc) — chỉ `true` khi có ÍT NHẤT 1 trường khác nhau. Chưa tải xong
  // (`initialData === null`) thì luôn coi là "chưa chỉnh sửa gì" (`false`).
  const isDirty = initialData ? (
    formData.name !== initialData.name ||
    formData.address !== initialData.address ||
    formData.hotline !== initialData.hotline ||
    formData.contactEmail !== initialData.contactEmail ||
    formData.is247 !== initialData.is247 ||
    formData.operatingStart !== initialData.operatingStart ||
    formData.operatingEnd !== initialData.operatingEnd ||
    formData.rules !== initialData.rules ||
    formData.description !== initialData.description
  ) : false;

  /**
   * ============================================================================
   * [API] TẢI HỒ SƠ TÒA NHÀ HIỆN TẠI
   * ============================================================================
   * MỤC ĐÍCH: Kéo về đúng 1 bản ghi hồ sơ tòa nhà (không phải danh sách) để
   * đổ vào Form chỉnh sửa.
   * ============================================================================
   */
  const { data, isLoading, isError } = useQuery({
    queryKey: ['building-profile'],
    queryFn: async () => {
      const res = await axiosClient.get('/system/building-profile');
      return res.data.data;
    }
  });

  /**
   * ============================================================================
   * [ĐỒNG BỘ DỮ LIỆU API VÀO FORM] - Chạy đúng 1 lần khi `data` có giá trị
   * ============================================================================
   * Đổ dữ liệu vào CẢ `formData` (để hiển thị/chỉnh sửa) LẪN `initialData`
   * (làm mốc so sánh `isDirty`) — nếu chỉ set 1 trong 2 thì `isDirty` sẽ tính
   * sai ngay từ lần tải đầu tiên (VD: chỉ set `formData` thì `initialData`
   * mãi mãi là `null`, `isDirty` luôn `false`, nút Save không bao giờ mở khóa
   * được kể cả khi người dùng đã thực sự gõ thay đổi).
   * ============================================================================
   */
  useEffect(() => {
    if (data) {
      setFormData(data);
      setInitialData(data);
    }
  }, [data]);

  /**
   * ============================================================================
   * [MUTATION] LƯU HỒ SƠ TÒA NHÀ MỚI
   * ============================================================================
   * Gọi `PUT /system/building-profile` với toàn bộ `formData` hiện tại. Thành
   * công thì: làm mới cache React Query (để lần fetch tiếp theo lấy đúng dữ
   * liệu mới), đồng bộ lại `initialData` = `formData` (để `isDirty` tự trở về
   * `false`), và báo message thành công.
   * ============================================================================
   */
  const updateMutation = useMutation({
    mutationFn: async (updatedProfile: BuildingProfile) => {
      const res = await axiosClient.put('/system/building-profile', updatedProfile);
      return res.data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['building-profile'] });
      setInitialData(formData);
      message.success('Profile updated successfully!');
    },
    onError: () => {
      message.error('Failed to update profile.');
    }
  });

  /**
   * ============================================================================
   * [XỬ LÝ THAY ĐỔI INPUT] - DÙNG CHUNG CHO MỌI Ô TEXT/EMAIL/TEXTAREA
   * ============================================================================
   * Vì input HTML thuần (không phải `<Form.Item name="...">` của antd), phải
   * tự đọc `e.target.name` để biết đang gõ vào trường nào rồi cập nhật đúng
   * key đó trong `formData` — 1 hàm dùng chung cho TẤT CẢ các ô input/textarea
   * nhờ cơ chế "computed property name" (`[e.target.name]`) của JavaScript.
   * ============================================================================
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  /**
   * ============================================================================
   * [SUBMIT FORM] - VALIDATE HOTLINE RỒI MỚI GỬI LÊN BACKEND
   * ============================================================================
   * `e.preventDefault()` chặn hành vi mặc định của thẻ `<form>` (tự reload lại
   * trang khi submit). Sau đó kiểm tra Hotline bằng Regex `/^\d{10}$/` — bắt
   * buộc ĐÚNG 10 CHỮ SỐ, không hơn không kém, không được có ký tự khác số.
   * Sai định dạng thì chặn lại ngay, KHÔNG gọi `updateMutation`.
   * ============================================================================
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{10}$/.test(formData.hotline)) {
      message.error('Hotline must be exactly 10 numeric digits.');
      return;
    }
    updateMutation.mutate(formData);
  };

  // Đang tải hoặc tải lỗi thì hiện thông báo tương ứng, không render Form.
  if (isLoading) return <div className="p-8 text-center">Loading profile...</div>;
  if (isError) return <div className="p-8 text-center text-red-500">Failed to load profile.</div>;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Header đơn giản, chỉ còn tiêu đề — nút Logout/badge WebSocket đã bị
            bỏ khỏi đây vì trùng lặp với những gì `ManagerLayout` (khung bọc
            ngoài màn hình này) đã cung cấp sẵn ở Header/Sidebar chung. */}
        <div className="p-6 border-b border-gray-200 bg-gray-50/50">
          <h1 className="text-xl font-semibold text-gray-800">Building Profile Settings</h1>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tên tòa nhà — chiếm trọn 2 cột (col-span-2) */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Building Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Building Description</label>
              <textarea
                name="description"
                value={formData.description || ''}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              ></textarea>
            </div>

            {/* Địa chỉ — cũng chiếm trọn 2 cột */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>

            {/* Hotline và Email — mỗi ô chiếm 1 cột, nằm cạnh nhau */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hotline</label>
              <input
                type="text"
                name="hotline"
                value={formData.hotline}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contact Email</label>
              <input
                type="email"
                name="contactEmail"
                value={formData.contactEmail || ''}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                required
              />
            </div>

            {/*
             * [KHỐI GIỜ HOẠT ĐỘNG] - Công tắc 24/7 điều khiển việc CÓ HIỆN hay
             * KHÔNG 2 ô chọn giờ Start/End bên dưới. Bật 24/7 thì bãi xe coi
             * như không có khung giờ đóng cửa, nên 2 ô giờ trở nên vô nghĩa và
             * bị ẩn hẳn đi (không phải chỉ disable).
             */}
            <div className="col-span-2 p-4 border rounded-lg bg-gray-50/30">
              <div className="flex items-center justify-between mb-4">
                <label className="block text-sm font-medium text-gray-700">24/7 Operation</label>
                <Switch
                  checked={formData.is247}
                  onChange={(checked) => setFormData({ ...formData, is247: checked })}
                />
              </div>

              {!formData.is247 && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operating Start Time</label>
                    <TimePicker
                      format="HH:mm"
                      className="w-full h-[42px] rounded-lg"
                      value={formData.operatingStart ? dayjs(formData.operatingStart, 'HH:mm') : null}
                      onChange={(time, timeString) => setFormData({ ...formData, operatingStart: timeString as string })}
                      allowClear={false}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Operating End Time</label>
                    <TimePicker
                      format="HH:mm"
                      className="w-full h-[42px] rounded-lg"
                      value={formData.operatingEnd ? dayjs(formData.operatingEnd, 'HH:mm') : null}
                      onChange={(time, timeString) => setFormData({ ...formData, operatingEnd: timeString as string })}
                      allowClear={false}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Nội quy tòa nhà — nội dung tự do (textarea), khách hàng đọc lại
                nội dung này qua `BuildingRulesModal` ở giao diện Manager và
                qua các màn hình public phía khách hàng. */}
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Building Rules</label>
              <textarea
                name="rules"
                value={formData.rules}
                onChange={handleChange}
                rows={4}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              ></textarea>
            </div>

          </div>

          {/* Nút Save — khóa (xám, không bấm được) khi đang lưu HOẶC chưa có
              thay đổi gì (`!isDirty`), tránh gửi request thừa. */}
          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={updateMutation.isPending || !isDirty}
              className={`px-6 py-2 font-medium rounded-lg shadow-sm transition-colors ${
                !isDirty || updateMutation.isPending
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
