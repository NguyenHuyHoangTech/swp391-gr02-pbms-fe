/**
 * @Author: Nguyen Huu Thanh (TH)
 * @Date: 2026-07-16
 * @Description: Màn hình quản lý Loại xe cho Manager. Liệt kê loại xe, tạo/sửa kích
 *   thước ô đỗ tương ứng, tải lên icon hiển thị trên sơ đồ bãi, và khoá/mở khoá
 *   một loại xe khi không còn khai thác.
 * @Dependencies:
 * - axiosClient (Local: core/api) - gọi API /operation/vehicle-types và endpoint icon
 * - @tanstack/react-query (External) - fetch/cache danh sách và làm mới sau khi ghi
 * - antd, @ant-design/icons (External) - Table, Modal, Form, Upload
 */
/**
 * ============================================================================
 * [IMPORT LIBRARIES & UTILITIES] - Các thư viện và công cụ tiện ích
 * ============================================================================
 * 1. React & Hooks: `useState` để quản lý Modal thêm/sửa và cờ "đã chỉnh sửa"
 *    (`isDirty`) — dùng để mở/khóa nút Save.
 * 2. Ant Design (antd): Bộ Form đầy đủ (`Form`, `Input`, `InputNumber`,
 *    `Select`, `Upload`) để nhập liệu; `Table` hiển thị danh sách; `Modal` cho
 *    cả form thêm/sửa lẫn hộp thoại xác nhận khóa/mở khóa.
 * 3. @ant-design/icons: Icon trang trí cho nút bấm và cột "Category"/"Actions".
 * 4. React Query: `useQuery` kéo danh sách loại xe về; `useMutation` cho 2
 *    thao tác ghi (Lưu form, Đổi trạng thái Lock/Unlock); `useQueryClient` để
 *    tự làm mới danh sách (`invalidateQueries`) ngay sau khi ghi thành công,
 *    không cần chờ người dùng F5 lại trang.
 * 5. Tiện ích khác: `axiosClient` (gọi HTTP), `getImageUrl` (ghép URL đầy đủ
 *    cho icon loại xe từ đường dẫn tương đối Backend trả về).
 * ============================================================================
 */
import React, { useState } from 'react';
import { Card, Typography, Button, Table, Modal, Form, Input, InputNumber, Select, message, Space, Upload, Avatar, Tag } from 'antd';
import { PlusOutlined, EditOutlined, CarOutlined, AppstoreOutlined, DeleteOutlined, UploadOutlined, LockOutlined, UnlockOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { getImageUrl } from '../../core/utils/imageHelper';

const { Title, Text } = Typography;

/**
 * ============================================================================
 * MÔ TẢ TỔNG QUAN VỀ VAI TRÒ & LUỒNG DỮ LIỆU CỦA VEHICLE TYPE SCREEN
 * ============================================================================
 *
 * [PHẦN 1] MỤC ĐÍCH & VAI TRÒ CỦA COMPONENT:
 *    - Màn hình quản trị danh mục "Loại xe" (Vehicle Type) — nền tảng gốc mà
 *      RẤT NHIỀU tính năng khác trong hệ thống phụ thuộc vào: kích thước ma
 *      trận (`matrixWidth`/`matrixHeight`) quyết định 1 ô đỗ của loại xe này
 *      chiếm bao nhiêu ô lưới trên Space Map; `category` (4 bánh/2 bánh) dùng
 *      để lọc Zone/Gate/Floor phù hợp ở khắp nơi trong hệ thống.
 *    - Chịu trách nhiệm: liệt kê, thêm mới, sửa, khóa/mở khóa (Lock/Unlock)
 *      từng loại xe, và cho phép tải icon riêng cho từng loại.
 *
 * [PHẦN 2] GIẢI PHẪU VÒNG ĐỜI DỮ LIỆU KÈM MINH CHỨNG:
 *
 * BƯỚC 1: TẢI DANH SÁCH BAN ĐẦU
 * - Minh chứng: `useQuery` với `queryKey: ['vehicle-types']` (dòng ~30) gọi
 *   `GET /operation/vehicle-types` — LƯU Ý: gọi KHÔNG kèm `activeOnly=true`
 *   như nhiều màn hình khác trong hệ thống, nên màn hình quản trị này CỐ Ý
 *   hiển thị CẢ loại xe đã bị khóa (để còn có chỗ bấm "Unlock" lại).
 *
 * BƯỚC 2: THÊM MỚI / CHỈNH SỬA (CÙNG 1 MODAL, CÙNG 1 MUTATION)
 * - Minh chứng: `saveMutation` (dòng ~38) tự rẽ nhánh dựa vào biến
 *   `editingRecord`: có giá trị (khác `null`) thì gọi `PUT` để sửa, `null` thì
 *   gọi `POST` để tạo mới — không cần 2 hàm mutation riêng biệt.
 * - Cờ `isDirty` (bật khi `onValuesChange` của Form kích hoạt) dùng để khóa
 *   nút "Save config" cho tới khi người dùng thực sự gõ/đổi gì đó trong form
 *   — tránh bấm Save "khống" khi chưa sửa gì.
 *
 * BƯỚC 3: KHÓA/MỞ KHÓA MỘT LOẠI XE (LOCK / UNLOCK)
 * - Minh chứng: `handleToggleStatus` (dòng ~87) luôn bật `Modal.confirm` xác
 *   nhận trước khi thực sự gọi `toggleStatusMutation` — vì khóa 1 loại xe có
 *   ảnh hưởng dây chuyền (chặn được toàn bộ check-in của loại xe đó tại cổng,
 *   xem `GateOperationService` phía Backend), nên bắt buộc phải hỏi lại.
 * - `toggleStatusMutation` gọi `PATCH /vehicle-types/{id}/status` — Backend tự
 *   đảo trạng thái ACTIVE<->INACTIVE, Frontend không cần tự tính trạng thái
 *   mới rồi gửi lên.
 *
 * BƯỚC 4: TẢI ICON RIÊNG CHO 1 LOẠI XE (CHỈ KHI ĐANG SỬA, KHÔNG PHẢI THÊM MỚI)
 * - Minh chứng: khối `<Upload>` (dòng ~224) chỉ render khi `editingRecord` có
 *   giá trị — vì cần đã có `id` thật trong DB để gắn ảnh vào đúng bản ghi; xe
 *   đang tạo mới (chưa có `id`) thì chưa thể tải icon ngay trong cùng 1 bước.
 * - `customRequest` tự viết tay (không dùng cơ chế upload mặc định của antd)
 *   để tự kiểm soát toàn bộ vòng đời: gửi `FormData` lên `POST .../icon`, nhận
 *   lại bản ghi loại xe MỚI NHẤT (đã có icon) rồi cập nhật thẳng vào
 *   `editingRecord` để Avatar xem trước trong Modal đổi ảnh ngay lập tức, đồng
 *   thời làm mới bảng danh sách phía sau (`invalidateQueries`).
 * ============================================================================
 */
export const VehicleTypeScreen = () => {
  // Modal thêm/sửa đang mở hay đóng.
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Bản ghi đang được sửa — `null` nghĩa là đang ở chế độ "Thêm mới".
  const [editingRecord, setEditingRecord] = useState<any>(null);
  // Cờ "đã có thay đổi trong form" — dùng để khóa nút Save cho tới khi người
  // dùng thực sự gõ/đổi gì đó, tránh bấm Save "khống" không có gì để lưu.
  const [isDirty, setIsDirty] = useState(false);
  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  /**
   * ============================================================================
   * [API] LẤY DANH SÁCH TOÀN BỘ LOẠI XE (CẢ ĐANG KHÓA)
   * ============================================================================
   * MỤC ĐÍCH: Kéo về danh sách đầy đủ, không lọc `activeOnly` — vì màn hình
   * quản trị này cần hiển thị CẢ loại xe đã bị khóa để nhân viên còn thấy nút
   * "Unlock" mà mở lại, khác với các màn hình khác (VD: form Check-in) chỉ cần
   * loại xe đang hoạt động.
   * ============================================================================
   */
  const { data: vehicleTypes, isLoading } = useQuery({
    queryKey: ['vehicle-types'],
    queryFn: async () => {
      const res = await axiosClient.get('/operation/vehicle-types');
      return res.data.data;
    }
  });

  /**
   * ============================================================================
   * [MUTATION] LƯU LOẠI XE (DÙNG CHUNG CHO CẢ THÊM MỚI VÀ CHỈNH SỬA)
   * ============================================================================
   * MÃ GIẢ (PSEUDO-CODE LÕI):
   * B1: Kiểm tra `editingRecord` — có giá trị (đang sửa) thì gọi `PUT
   *     /vehicle-types/{id}`, không có (đang thêm mới) thì gọi `POST
   *     /vehicle-types`. Cùng 1 payload `values` lấy từ Form, không cần tách
   *     logic riêng cho 2 trường hợp.
   * B2: Thành công -> báo message tương ứng (updated/added), làm mới danh
   *     sách bằng `invalidateQueries`, đóng Modal.
   * B3: Thất bại -> hiện message lỗi lấy từ response Backend (VD: trùng tên
   *     loại xe, hoặc đổi kích thước ma trận khi đang có ô đỗ dùng loại xe đó
   *     trên bản đồ — Backend tự chặn, Frontend chỉ hiển thị lại lý do).
   * ============================================================================
   */
  const saveMutation = useMutation({
    mutationFn: async (values: any) => {
      if (editingRecord) {
        return await axiosClient.put(`/operation/vehicle-types/${editingRecord.id}`, values);
      } else {
        return await axiosClient.post('/operation/vehicle-types', values);
      }
    },
    onSuccess: () => {
      message.success(`Successfully ${editingRecord ? 'updated' : 'added'} vehicle type!`);
      queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
      setIsModalOpen(false);
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'An error occurred.');
    }
  });

  /**
   * ============================================================================
   * [MUTATION] KHÓA / MỞ KHÓA MỘT LOẠI XE
   * ============================================================================
   * MỤC ĐÍCH: Gọi `PATCH /vehicle-types/{id}/status` — Backend tự đảo ngược
   * trạng thái hiện tại (ACTIVE -> INACTIVE hoặc ngược lại), Frontend chỉ cần
   * gửi đúng `id`, không cần tự tính trạng thái mới rồi gửi kèm.
   *
   * LƯU Ý QUAN TRỌNG: Backend có kiểm tra an toàn khi khóa (chặn nếu đang có
   * xe loại này đỗ trong bãi) — nếu lỗi thì message hiển thị lý do cụ thể từ
   * Backend, không phải lỗi chung chung.
   * ============================================================================
   */
  const toggleStatusMutation = useMutation({
    mutationFn: async (record: any) => {
      return await axiosClient.patch(`/operation/vehicle-types/${record.id}/status`);
    },
    onSuccess: () => {
      message.success('Successfully updated vehicle type status!');
      queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || 'An error occurred while updating status.');
    }
  });

  /**
   * ============================================================================
   * [MỞ MODAL] - THÊM MỚI HOẶC SỬA
   * ============================================================================
   * Nếu có truyền `record` (bấm nút "Edit" trên 1 dòng) -> đổ dữ liệu dòng đó
   * vào Form để sửa. Không truyền gì (bấm nút "Add Vehicle Type" ở góc trên) ->
   * xóa trắng Form để nhập mới. Luôn reset `isDirty` về `false` mỗi lần mở
   * Modal, để nút Save luôn khóa cho tới khi thực sự có thay đổi mới.
   * ============================================================================
   */
  const handleOpenModal = (record?: any) => {
    if (record) {
      setEditingRecord(record);
      form.setFieldsValue(record);
    } else {
      setEditingRecord(null);
      form.resetFields();
    }
    setIsDirty(false);
    setIsModalOpen(true);
  };

  /**
   * ============================================================================
   * [BẤM SAVE] - VALIDATE FORM RỒI MỚI GỌI MUTATION
   * ============================================================================
   * `form.validateFields()` tự kiểm tra các rule bắt buộc (`required`) khai
   * báo trên từng `Form.Item` (tên hiển thị, loại xe, kích thước ma trận...) —
   * chỉ khi TOÀN BỘ field hợp lệ mới thực sự gọi `saveMutation.mutate(values)`.
   * Nếu có field sai, antd tự hiện lỗi đỏ ngay dưới field đó, hàm này dừng lại
   * mà không gọi API.
   * ============================================================================
   */
  const handleSave = () => {
    form.validateFields().then(values => {
      saveMutation.mutate(values);
    });
  };

  /**
   * ============================================================================
   * [BẤM LOCK/UNLOCK] - LUÔN HỎI XÁC NHẬN TRƯỚC
   * ============================================================================
   * Vì khóa 1 loại xe có ảnh hưởng dây chuyền (chặn check-in tại cổng cho MỌI
   * xe thuộc loại đó), hàm này KHÔNG gọi thẳng `toggleStatusMutation` mà luôn
   * bọc qua `Modal.confirm` trước — tiêu đề/nội dung hộp thoại tự đổi chữ
   * "Lock"/"Unlock" theo đúng trạng thái hiện tại của bản ghi.
   * ============================================================================
   */
  const handleToggleStatus = (record: any) => {
    Modal.confirm({
      title: record.status === 'INACTIVE' ? 'Confirm Unlock' : 'Confirm Lock',
      content: `Are you sure you want to ${record.status === 'INACTIVE' ? 'unlock' : 'lock'} this vehicle type?`,
      okText: 'Confirm',
      cancelText: 'Cancel',
      onOk: () => toggleStatusMutation.mutate(record)
    });
  };

  /**
   * ============================================================================
   * [ĐỊNH NGHĨA CỘT BẢNG] - 6 CỘT HIỂN THỊ CHO BẢNG DANH SÁCH LOẠI XE
   * ============================================================================
   * 1. ID: hiển thị dạng "VT-{id}" cho dễ đọc, không lộ số ID thô.
   * 2. Icon: ảnh đại diện loại xe, chưa có ảnh thì thay bằng icon ô tô mặc định.
   * 3. Display Name: tên hiển thị, tô đậm màu xanh cho nổi bật.
   * 4. Category: dịch mã `FOUR_WHEEL`/`TWO_WHEEL` sang chữ + icon tương ứng
   *    (ô tô 4 bánh màu xanh dương, xe 2 bánh màu xanh lá).
   * 5. Matrix Size: ghép chuỗi "W cells (W) x H cells (H)" từ 2 số kích thước.
   * 6. Status: thẻ màu đỏ (INACTIVE) hoặc xanh lá (ACTIVE).
   * 7. Actions: nút Edit (luôn có) + nút Lock/Unlock đổi qua lại tùy trạng thái.
   * ============================================================================
   */
  const columns = [
    { title: 'ID', dataIndex: 'id', key: 'id', render: (text: string) => <Text strong>VT-{text}</Text> },
    {
      title: 'Icon',
      key: 'icon',
      render: (_: any, r: any) => (
        <Avatar src={r.iconUrl ? getImageUrl(r.iconUrl) : undefined} icon={!r.iconUrl && <CarOutlined />} shape="square" size="large" />
      )
    },
    { title: 'Display Name', dataIndex: 'typeName', key: 'typeName', render: (text: string) => <span className="font-semibold text-blue-700">{text}</span> },
    {
      title: 'Category',
      dataIndex: 'category',
      key: 'category',
      render: (cat: string) => cat === 'FOUR_WHEEL' ? <Space><CarOutlined className="text-blue-600"/> 4-wheel Car</Space> : <Space><AppstoreOutlined className="text-green-600"/> 2-wheel Vehicle</Space>
    },
    {
      title: 'Matrix Size',
      key: 'dimensions',
      render: (_: any, r: any) => `${r.matrixWidth} cells (W) x ${r.matrixHeight} cells (H)`
    },
    {
      title: 'Status',
      key: 'status',
      dataIndex: 'status',
      render: (status: string) => (
        <Tag color={status === 'INACTIVE' ? 'error' : 'success'}>
          {status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'}
        </Tag>
      )
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button type="text" icon={<EditOutlined />} onClick={() => handleOpenModal(record)} className="text-blue-600 hover:text-blue-800">
            Edit
          </Button>
          {record.status !== 'INACTIVE' ? (
            <Button type="text" danger icon={<LockOutlined />} onClick={() => handleToggleStatus(record)}>
              Lock
            </Button>
          ) : (
            <Button type="text" icon={<UnlockOutlined />} className="text-green-600 hover:text-green-800" onClick={() => handleToggleStatus(record)}>
              Unlock
            </Button>
          )}
        </Space>
      )
    }
  ];

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header: tiêu đề trang + nút "Add Vehicle Type" mở Modal thêm mới */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <Title level={2} className="m-0 text-gray-800 flex items-center">
              <CarOutlined className="mr-3 text-blue-600" /> Vehicle Type Management
            </Title>
            <Text type="secondary">Define standard matrix size for each vehicle type</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} size="large" onClick={() => handleOpenModal()} className="bg-blue-600">
            Add Vehicle Type
          </Button>
        </div>

        {/*
         * [BẢNG DANH SÁCH] - sắp xếp thủ công ngay trước khi render: loại xe
         * đang khóa (INACTIVE) luôn bị đẩy xuống CUỐI danh sách, còn lại sắp
         * theo `id` tăng dần — giúp loại xe đang hoạt động luôn dễ thấy hơn.
         */}
        <Card className="shadow-sm rounded-xl border-gray-200">
          <Table
            dataSource={(vehicleTypes || []).sort((a: any, b: any) => {
              if (a.status === 'INACTIVE' && b.status !== 'INACTIVE') return 1;
              if (a.status !== 'INACTIVE' && b.status === 'INACTIVE') return -1;
              return a.id - b.id;
            })}
            columns={columns}
            rowKey="id"
            pagination={false}
            loading={isLoading}
          />
        </Card>

        {/*
         * [MODAL THÊM/SỬA] - tiêu đề đổi theo `editingRecord`, nút Save bị
         * khóa (`okButtonProps.disabled`) cho tới khi `isDirty === true`.
         */}
        <Modal
          title={editingRecord ? "Edit Vehicle Type" : "Add New Vehicle Type"}
          open={isModalOpen}
          onOk={handleSave}
          onCancel={() => {
            setIsModalOpen(false);
            setIsDirty(false);
          }}
          okText="Save config"
          okButtonProps={{ disabled: !isDirty }}
          cancelText="Cancel"
          width={600}
          confirmLoading={saveMutation.isPending}
        >
          <Form form={form} layout="vertical" className="mt-4" initialValues={{ category: 'FOUR_WHEEL' }} onValuesChange={() => setIsDirty(true)}>
            <Form.Item name="typeName" label="Display Name (E.g. 4-seat car, Scooter)" rules={[{ required: true }]}>
              <Input placeholder="Enter display name..." />
            </Form.Item>

            <Form.Item name="category" label="Vehicle Category" rules={[{ required: true }]}>
              <Select>
                <Select.Option value="FOUR_WHEEL">Car / 4-wheel vehicle</Select.Option>
                <Select.Option value="TWO_WHEEL">Motorbike / 2-wheel vehicle</Select.Option>
              </Select>
            </Form.Item>

            {/* Kích thước ma trận: bị KHÓA không cho sửa nếu bản ghi đang có
                Slot thật nào trên bản đồ dùng loại xe này (`hasMapSlots`) —
                tránh làm lệch bố cục các ô đỗ đã vẽ sẵn trên Space Map. */}
            <div className="grid grid-cols-2 gap-4">
              <Form.Item name="matrixWidth" label="Width (Grid cells)" rules={[{ required: true }]}>
                <InputNumber disabled={editingRecord?.hasMapSlots} className="w-full" min={1} max={100} placeholder="VD: 3" />
              </Form.Item>
              <Form.Item name="matrixHeight" label="Height (Grid cells)" rules={[{ required: true }]}>
                <InputNumber disabled={editingRecord?.hasMapSlots} className="w-full" min={1} max={100} placeholder="VD: 5" />
              </Form.Item>
            </div>

            {editingRecord && editingRecord.hasMapSlots && (
              <div className="text-red-500 text-sm mb-4">
                * You cannot change the dimensions because there are slots of this type currently on the map.
              </div>
            )}

            {/* Chỉ hiện phần tải Icon khi ĐANG SỬA (đã có `id` thật) — thêm
                mới thì chưa có bản ghi để gắn ảnh vào. */}
            {editingRecord && (
              <Form.Item label="Vehicle Icon (Upload Image)">
                <div className="flex items-center gap-4 mb-4">
                  <Avatar src={editingRecord.iconUrl ? getImageUrl(editingRecord.iconUrl) : undefined} icon={!editingRecord.iconUrl && <CarOutlined />} shape="square" size={64} className="bg-gray-100" />
                  <Upload
                    name="file"
                    showUploadList={false}
                    customRequest={async (options) => {
                      const { file, onSuccess, onError } = options;
                      try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const res = await axiosClient.post(`/operation/vehicle-types/${editingRecord.id}/icon`, formData, {
                          headers: { 'Content-Type': 'multipart/form-data' }
                        });
                        message.success('Icon uploaded successfully');
                        // Cập nhật lại bản ghi đang sửa để Avatar xem trước
                        // trong Modal đổi ảnh NGAY LẬP TỨC, không cần đóng/mở
                        // lại Modal mới thấy icon mới.
                        setEditingRecord(res.data.data);
                        queryClient.invalidateQueries({ queryKey: ['vehicle-types'] });
                        if (onSuccess) onSuccess("ok");
                      } catch (err: any) {
                        message.error(err.response?.data?.message || 'Failed to upload icon');
                        if (onError) onError(err);
                      }
                    }}
                  >
                    <Button icon={<UploadOutlined />}>Upload New Icon</Button>
                  </Upload>
                </div>
              </Form.Item>
            )}
          </Form>
        </Modal>
      </div>
    </div>
  );
};
