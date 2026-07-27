/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ DỮ LIỆU CỦA HỆ THỐNG (KÈM MINH CHỨNG CODE)
 * (Trình bày chi tiết luồng dữ liệu ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO COMPONENT VÀ ĐĂNG KÝ CÁC HOOKS HỆ THỐNG
 * - Minh chứng 1: Tại dòng 75 có khai báo `export const SystemConfigScreen = () => { ... }`. 
 *   Khi người dùng truy cập màn hình Cấu hình, React sẽ khởi tạo Component này thành 1 Node trên Virtual DOM.
 * - Minh chứng 2: Tại các dòng 77-79 có khai báo `useAuthStore` và `useWebSocket()`. Tích hợp 
 *   quản lý phiên đăng nhập và kết nối kênh WebSocket thời gian thực với Server.
 * - Minh chứng 3: Từ dòng 82 đến 103 là khối khai báo các `useState` (như `smtpEmail`, `paypalClientId`, ...).
 *   React tự động cấp phát bộ nhớ cục bộ để lưu trữ trạng thái các ô nhập liệu và trạng thái kiểm tra kết nối.
 * 
 * BƯỚC 2: TRUY VẤN VÀ TẢI DỮ LIỆU CẤU HÌNH TỪ BACKEND (TANSTACK QUERY & AXIOS)
 * - Minh chứng: Tại dòng 117 khai báo `const { data: configs = [], isLoading } = useQuery(...)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + `useQuery` tự động kích hoạt một HTTP GET Request tới Endpoint `/system/configs` thông qua `axiosClient`.
 *   + Thư viện TanStack Query tự động quản lý trạng thái tải `isLoading`, bộ nhớ đệm Cache và trả dữ liệu về biến `configs`.
 * 
 * BƯỚC 3: ĐỒNG BỘ DỮ LIỆU TỪ BACKEND VÀO TRẠNG THÁI CỤC BỘ (EFFECT SYNCHRONIZATION)
 * - Minh chứng: Tại dòng 156 khai báo `useEffect(() => { ... }, [configs])`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Ngay khi `configs` được nạp thành công từ API, `useEffect` sẽ lắng nghe sự thay đổi và tự động thực thi.
 *   + Định nghĩa hàm bổ trợ `getVal(key)` để trích xuất giá trị từng tham số cấu hình (SMTP, PayOS, PayPal, Gemini).
 *   + Điền (populate) dữ liệu vào các State tương ứng và giải mã chuỗi JSON `GEMINI_AVAILABLE_MODELS` nếu tồn tại.
 * 
 * BƯỚC 4: THỰC THI KIỂM TRA KẾT NỐI DỊCH VỤ (TEST CONNECTION MUTATION)
 * - Minh chứng: Tại dòng 202 khai báo `const testConnectionMutation = useMutation(...)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Khi người dùng kích hoạt kiểm tra kết nối (Email, PayOS, PayPal, Gemini), hàm `mutationFn` phân loại `type`
 *     để gửi request POST kiểm tra tới đúng Endpoint API tương ứng.
 *   + `onMutate`: Cập nhật trạng thái test sang `'testing'` để hiển thị hiệu ứng Loading trên nút bấm.
 *   + `onSuccess`: Đổi trạng thái sang `'success'` và tự động cập nhật danh sách các AI Model tương thích từ Gemini.
 *   + `onError`: Đổi trạng thái sang `'error'` và bật thông báo lỗi bằng Ant Design `message.error`.
 * 
 * BƯỚC 5: TỔNG HỢP VÀ LƯU TRỮ CẤU HÌNH TOÀN HỆ THỐNG (BATCH SAVE CONFIGURATIONS)
 * - Minh chứng: Tại dòng 281 khai báo `const saveConfigMutation = useMutation(...)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Hàm `updateIfChanged` kiểm tra sự thay đổi giữa State hiện tại và dữ liệu gốc: Nếu đã có cấu hình thì gửi API `PUT`
 *     để cập nhật, nếu chưa có thì gửi API `POST` để tạo mới.
 *   + Sử dụng `Promise.all(promises)` để thực thi tất cả yêu cầu lưu cấu hình song song.
 *   + Sau khi lưu thành công, kích hoạt `queryClient.invalidateQueries` để làm tươi dữ liệu trên toàn bộ ứng dụng.
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: CÁC THƯ VIỆN LÕI REACT VÀ QUẢN LÝ TRẠNG THÁI / TRUY VẤN (HOOKS & QUERY)
// Công dụng: Cung cấp các Hook cơ bản của React và thư viện quản lý API/Cache TanStack Query.
// =========================================================================
import React, { useState, useEffect } from 'react'; // Thư viện React tiêu chuẩn và các Hooks quản lý vòng đời, State.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; // Thư viện quản lý Data-Fetching, Caching và Mutation.

// =========================================================================
// PHẦN 2: CÁC CLIENT API, STORE VÀ KẾT NỐI WEBSOCKET
// Công dụng: Tương tác với Backend thông qua HTTP client, Zustand Store và WebSocket.
// =========================================================================
import axiosClient from '../../core/api/axiosClient'; // Axios instance đã cấu hình base URL và interceptors.
import { useAuthStore } from '../../core/store/useAuthStore'; // Store quản lý thông tin xác thực và phiên làm việc.
import { useWebSocket } from '../../core/websocket/useWebSocket'; // Custom hook theo dõi kết nối WebSocket real-time.

// =========================================================================
// PHẦN 3: CÁC THƯ VIỆN GIAO DIỆN VÀ ICON (ANT DESIGN)
// Công dụng: Cung cấp các Component UI chuẩn mực (Card, Input, Button, Select, Message) và Icon đồ họa.
// =========================================================================
import { EyeInvisibleOutlined, EyeTwoTone, SaveOutlined, ApiOutlined, RobotOutlined } from '@ant-design/icons'; // Danh sách Icon biểu thị cho từng phân hệ.
import { Input, Button, Card, Typography, Space, message, Spin, Select } from 'antd'; // Bộ thư viện Component UI Ant Design.

const { Title, Text } = Typography;

/**
 * === PHẦN 4: ĐỊNH NGHĨA COMPONENT SYSTEMCONFIGSCREEN ===
 * Màn hình quản trị cấu hình hệ thống: Email SMTP, Cổng thanh toán (PayPal, PayOS) và AI Gemini.
 */
export const SystemConfigScreen = () => {
    // --- KHỞI TẠO HOOKS VÀ STORE HỆ THỐNG ---
    const logout = useAuthStore((state) => state.logout); // Hàm đăng xuất từ Auth Store
    const { connected } = useWebSocket(); // Trạng thái kết nối WebSocket real-time
    const queryClient = useQueryClient(); // Trình quản lý Query Cache của TanStack Query

    // --- KHỞI TẠO STATE CHO CẤU HÌNH EMAIL (SMTP) ---
    const [smtpEmail, setSmtpEmail] = useState(''); // Địa chỉ Email gửi tự động
    const [smtpPassword, setSmtpPassword] = useState(''); // Mật khẩu ứng dụng SMTP

    // --- KHỞI TẠO STATE CHO CẤU HÌNH PAYPAL ---
    const [paypalClientId, setPaypalClientId] = useState(''); // Client ID từ PayPal Developer Console
    const [paypalSecret, setPaypalSecret] = useState(''); // Secret Key từ PayPal Developer Console

    // --- KHỞI TẠO STATE CHO CẤU HÌNH PAYOS ---
    const [payosClientId, setPayosClientId] = useState(''); // Client ID của dịch vụ PayOS
    const [payosApiKey, setPayosApiKey] = useState(''); // API Key của dịch vụ PayOS
    const [payosChecksumKey, setPayosChecksumKey] = useState(''); // Checksum Key để xác thực webhook PayOS

    // --- KHỞI TẠO STATE CHO CẤU HÌNH GEMINI AI ---
    const [geminiApiKey, setGeminiApiKey] = useState(''); // API Key kết nối với Google Gemini AI
    const [geminiModel, setGeminiModel] = useState(''); // Model AI đang được lựa chọn sử dụng
    const [geminiModels, setGeminiModels] = useState<string[]>([]); // Danh sách các Model AI khả dụng trả về từ API

    // --- KHỞI TẠO STATE TRẠNG THÁI KIỂM TRA KẾT NỐI (TEST STATUS) ---
    const [testEmailStatus, setTestEmailStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testPaypalStatus, setTestPaypalStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testPayosStatus, setTestPayosStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
    const [testGeminiStatus, setTestGeminiStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');

    /**
     * =========================================================================
     * QUERY: NẠP DANH SÁCH CẤU HÌNH TỪ BACKEND
     * =========================================================================
     * MỤC ĐÍCH:
     * Tải toàn bộ các cặp Key-Value cấu hình hệ thống từ Database thông qua API GET `/system/configs`.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Kích hoạt HTTP GET Request tới `/system/configs`.
     * 2. Nếu thành công: Trả về mảng dữ liệu cấu hình.
     * 3. Nếu thất bại: Trả về mảng rỗng `[]` để tránh làm sập ứng dụng.
     */
    const { data: configs = [], isLoading } = useQuery({
        queryKey: ['system-configs'],
        queryFn: async () => {
            try {
                const res = await axiosClient.get('/system/configs');
                return res.data.data;
            } catch (err) {
                return [];
            }
        }
    });

    /**
     * =========================================================================
     * EFFECT: ĐỒNG BỘ DỮ LIỆU TẢI VỀ VÀO STATE DỰ ÁN
     * =========================================================================
     * MỤC ĐÍCH:
     * Khi mảng `configs` từ Backend được nạp hoặc thay đổi, tiến hành bóc tách các giá trị
     * và điền vào từng Input tương ứng trên giao diện.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Kiểm tra nếu `configs` có dữ liệu:
     * 2. Định nghĩa hàm `getVal(key)` để tìm giá trị theo `configKey`.
     * 3. Cập nhật State cho SMTP Email, PayPal, PayOS, Gemini API Key.
     * 4. Đánh dấu trạng thái 'success' cho các mục đã có sẵn dữ liệu cấu hình.
     * 5. Đọc chuỗi JSON `GEMINI_AVAILABLE_MODELS` để khôi phục danh sách Model AI khả dụng.
     */
    useEffect(() => {
        if (configs && configs.length > 0) {
            const getVal = (key: string) => configs.find((c: any) => c.configKey === key)?.configValue || '';

            // Đồng bộ cấu hình Email SMTP
            const em = getVal('SMTP_EMAIL');
            setSmtpEmail(em);
            setSmtpPassword(getVal('SMTP_APP_PASSWORD'));
            if (em) setTestEmailStatus('success');

            // Đồng bộ cấu hình PayPal
            const pClient = getVal('PAYPAL_CLIENT_ID');
            setPaypalClientId(pClient);
            setPaypalSecret(getVal('PAYPAL_SECRET'));
            if (pClient) setTestPaypalStatus('success');

            // Đồng bộ cấu hình PayOS
            const osClient = getVal('PAYOS_CLIENT_ID');
            setPayosClientId(osClient);
            setPayosApiKey(getVal('PAYOS_API_KEY'));
            setPayosChecksumKey(getVal('PAYOS_CHECKSUM_KEY'));
            if (osClient) setTestPayosStatus('success');

            // Đồng bộ cấu hình Gemini AI
            const gemini = getVal('GEMINI_API_KEY');
            setGeminiApiKey(gemini);
            setGeminiModel(getVal('GEMINI_MODEL'));
            if (gemini) setTestGeminiStatus('success');

            // Phân tích danh sách Model Gemini sẵn có
            const geminiModelsConfig = getVal('GEMINI_AVAILABLE_MODELS');
            if (geminiModelsConfig) {
                try {
                    const parsed = JSON.parse(geminiModelsConfig);
                    setGeminiModels(parsed);
                } catch (e) {
                    if (getVal('GEMINI_MODEL')) setGeminiModels([getVal('GEMINI_MODEL')]);
                }
            } else if (getVal('GEMINI_MODEL')) {
                setGeminiModels([getVal('GEMINI_MODEL')]);
            }
        }
    }, [configs]);

    /**
     * =========================================================================
     * MUTATION: KIỂM TRA KẾT NỐI CÁC DỊCH VỤ (EMAIL / PAYPAL / PAYOS / GEMINI)
     * =========================================================================
     * MỤC ĐÍCH:
     * Gửi thông tin xác thực lên Server để thử nghiệm kết nối thực tế tới các nhà cung cấp dịch vụ.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Nhận `type` kiểm tra ('EMAIL' | 'PAYPAL' | 'PAYOS' | 'GEMINI' | 'TEST_GEMINI_MODEL').
     * 2. Gọi Endpoint API tương ứng kèm Payload thông số cấu hình.
     * 3. `onMutate`: Bật cờ trạng thái đang kiểm tra ('testing').
     * 4. `onSuccess`: Bật thông báo thành công. Riêng với 'GEMINI', trích xuất danh sách Model phản hồi OK.
     * 5. `onError`: Bật thông báo thất bại và cập nhật trạng thái lỗi ('error').
     */
    const testConnectionMutation = useMutation({
        mutationFn: async (type: 'EMAIL' | 'PAYPAL' | 'PAYOS' | 'GEMINI' | 'TEST_GEMINI_MODEL') => {
            if (type === 'EMAIL') {
                const res = await axiosClient.post('/system/configs/test-email', { email: smtpEmail, password: smtpPassword });
                return res.data;
            } else if (type === 'PAYPAL') {
                const res = await axiosClient.post('/system/configs/test-paypal', { clientId: paypalClientId, secret: paypalSecret });
                return res.data;
            } else if (type === 'PAYOS') {
                const res = await axiosClient.post('/system/configs/test-payos', { clientId: payosClientId, apiKey: payosApiKey });
                return res.data;
            } else if (type === 'GEMINI') {
                const res = await axiosClient.post('/system/configs/test-gemini', { apiKey: geminiApiKey });
                return res.data;
            } else if (type === 'TEST_GEMINI_MODEL') {
                const res = await axiosClient.post('/system/configs/test-gemini-model', { apiKey: geminiApiKey, model: geminiModel });
                return res.data;
            }
        },
        onMutate: (type) => {
            if (type === 'EMAIL') setTestEmailStatus('testing');
            if (type === 'PAYPAL') setTestPaypalStatus('testing');
            if (type === 'PAYOS') setTestPayosStatus('testing');
            if (type === 'GEMINI' || type === 'TEST_GEMINI_MODEL') setTestGeminiStatus('testing');
        },
        onSuccess: (data, type) => {
            message.success('Connected successfully!');
            if (type === 'EMAIL') setTestEmailStatus('success');
            if (type === 'PAYPAL') setTestPaypalStatus('success');
            if (type === 'PAYOS') setTestPayosStatus('success');
            if (type === 'TEST_GEMINI_MODEL') {
                setTestGeminiStatus('success');
            }
            if (type === 'GEMINI') {
                setTestGeminiStatus('success');
                if (data && data.data) {
                    const successfulModels = data.data
                        .filter((item: any) => !item.response.startsWith('Error') || item.response.startsWith('Error: 429'))
                        .map((item: any) => item.model);

                    if (successfulModels.length === 0) {
                        message.warning("Failed to fetch compatible models. Please check your API Key.");
                        setGeminiModels([]);
                        return;
                    }

                    setGeminiModels(successfulModels);
                    if (!geminiModel || !successfulModels.includes(geminiModel)) {
                        setGeminiModel(successfulModels[0]);
                    }
                }
            }
        },
        onError: (_, type) => {
            message.error('Connection failed!');
            if (type === 'EMAIL') setTestEmailStatus('error');
            if (type === 'PAYPAL') setTestPaypalStatus('error');
            if (type === 'PAYOS') setTestPayosStatus('error');
            if (type === 'GEMINI' || type === 'TEST_GEMINI_MODEL') setTestGeminiStatus('error');
        }
    });

    /**
     * =========================================================================
     * MUTATION: LƯU TẤT CẢ CẤU HÌNH HỆ THỐNG
     * =========================================================================
     * MỤC ĐÍCH:
     * Thu thập tất cả các thông số cấu hình đã chỉnh sửa trên màn hình và đẩy lên Server để lưu trữ.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Khởi tạo mảng các Promises chứa các câu lệnh gọi API.
     * 2. Định nghĩa hàm `updateIfChanged(key, value)`:
     *    - Nếu key đã tồn tại và value bị thay đổi -> Tạo Promise gọi API `PUT` /system/configs/{id}.
     *    - Nếu key chưa tồn tại và value không rỗng -> Tạo Promise gọi API `POST` /system/configs.
     * 3. Gọi `updateIfChanged` cho từng cấu hình (SMTP, PayPal, PayOS, Gemini).
     * 4. Thực thi song song tất cả Promises với `Promise.all(promises)`.
     * 5. `onSuccess`: Làm tươi Cache dữ liệu (`invalidateQueries`) và hiện thông báo thành công.
     * 6. `onError`: Báo lỗi nếu không lưu được.
     */
    const saveConfigMutation = useMutation({
        mutationFn: async () => {
            const promises: Promise<any>[] = [];
            const updateIfChanged = (key: string, value: string) => {
                const config = configs.find((c: any) => c.configKey === key);
                if (config && config.configValue !== value) {
                    promises.push(axiosClient.put(`/system/configs/${config.id}`, { ...config, configValue: value }));
                } else if (!config && value.trim() !== '') {
                    promises.push(axiosClient.post(`/system/configs`, { configKey: key, configValue: value, description: 'System Configuration' }));
                }
            };

            updateIfChanged('SMTP_EMAIL', smtpEmail);
            updateIfChanged('SMTP_APP_PASSWORD', smtpPassword);
            updateIfChanged('PAYPAL_CLIENT_ID', paypalClientId);
            updateIfChanged('PAYPAL_SECRET', paypalSecret);
            updateIfChanged('PAYOS_CLIENT_ID', payosClientId);
            updateIfChanged('PAYOS_API_KEY', payosApiKey);
            updateIfChanged('PAYOS_CHECKSUM_KEY', payosChecksumKey);
            updateIfChanged('GEMINI_API_KEY', geminiApiKey);
            updateIfChanged('GEMINI_MODEL', geminiModel);

            if (geminiModels.length > 0) {
                updateIfChanged('GEMINI_AVAILABLE_MODELS', JSON.stringify(geminiModels));
            }

            await Promise.all(promises);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['system-configs'] });
            message.success('System configuration saved!');
        },
        onError: () => {
            message.error('Failed to save configuration.');
        }
    });

    // =========================================================================
    // PHẦN 5: RENDER GIAO DIỆN COMPONENT (JSX)
    // =========================================================================
    return (
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                {/* HEADER: TIÊU ĐỀ MÀN HÌNH VÀ TRẠNG THÁI KẾT NỐI WEBSOCKET */}
                <div className="flex justify-between items-center mb-8 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <div>
                        <Title level={2} className="m-0 text-gray-800">System Config</Title>
                        <Text type="secondary">Manage connection parameters for the entire System PBMSe</Text>
                    </div>
                    <div className="flex items-center space-x-4">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${connected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            WS: {connected ? 'Connected' : 'Disconnected'}
                        </span>
                    </div>
                </div>

                {/* HIỂN THỊ LOADING HOẶC KHỐI CẤU HÌNH CHI TIẾT */}
                {isLoading ? (
                    <div className="text-center py-12"><Spin size="large" /></div>
                ) : (
                    <div className="space-y-6">
                        {/* 1. KHỐI CẤU HÌNH EMAIL (SMTP) */}
                        <Card title={<span className="text-gray-700"><ApiOutlined className="mr-2" />Email Configuration (SMTP)</span>} className="shadow-sm border-gray-200 rounded-xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">SMTP Email Address</Text>
                                    <Input
                                        value={smtpEmail}
                                        onChange={e => { setSmtpEmail(e.target.value); setTestEmailStatus('idle'); }}
                                        size="large"
                                    />
                                </div>
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">SMTP App Password</Text>
                                    <Input.Password
                                        value={smtpPassword}
                                        onChange={e => { setSmtpPassword(e.target.value); setTestEmailStatus('idle'); }}
                                        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                                        size="large"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-t pt-4 mt-4">
                                <Button
                                    loading={testConnectionMutation.isPending && testConnectionMutation.variables === 'EMAIL'}
                                    onClick={() => testConnectionMutation.mutate('EMAIL')}
                                >
                                    Test Connection
                                </Button>
                                {testEmailStatus === 'success' && <Text type="success">Verified</Text>}
                            </div>
                        </Card>

                        {/* 2. KHỐI CẤU HÌNH PAYOS */}
                        <Card title={<span className="text-blue-700"><ApiOutlined className="mr-2" />PayOS Configuration</span>} className="shadow-sm border-gray-200 rounded-xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">Client ID</Text>
                                    <Input
                                        value={payosClientId}
                                        onChange={e => { setPayosClientId(e.target.value); setTestPayosStatus('idle'); }}
                                        size="large"
                                    />
                                </div>
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">API Key</Text>
                                    <Input.Password
                                        value={payosApiKey}
                                        onChange={e => { setPayosApiKey(e.target.value); setTestPayosStatus('idle'); }}
                                        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                                        size="large"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <Text strong className="block mb-1 text-gray-600">Checksum Key</Text>
                                    <Input.Password
                                        value={payosChecksumKey}
                                        onChange={e => { setPayosChecksumKey(e.target.value); setTestPayosStatus('idle'); }}
                                        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                                        size="large"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-t pt-4 mt-4">
                                <Button
                                    loading={testConnectionMutation.isPending && testConnectionMutation.variables === 'PAYOS'}
                                    onClick={() => testConnectionMutation.mutate('PAYOS')}
                                >
                                    Test Connection
                                </Button>
                                {testPayosStatus === 'success' && <Text type="success">Verified</Text>}
                            </div>
                        </Card>

                        {/* 3. KHỐI CẤU HÌNH PAYPAL */}
                        <Card title={<span className="text-green-700"><ApiOutlined className="mr-2" />PayPal Configuration</span>} className="shadow-sm border-gray-200 rounded-xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">Sandbox Client ID</Text>
                                    <Input
                                        value={paypalClientId}
                                        onChange={e => { setPaypalClientId(e.target.value); setTestPaypalStatus('idle'); }}
                                        size="large"
                                    />
                                </div>
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">Sandbox Secret</Text>
                                    <Input.Password
                                        value={paypalSecret}
                                        onChange={e => { setPaypalSecret(e.target.value); setTestPaypalStatus('idle'); }}
                                        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                                        size="large"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-t pt-4 mt-4">
                                <Button
                                    loading={testConnectionMutation.isPending && testConnectionMutation.variables === 'PAYPAL'}
                                    onClick={() => testConnectionMutation.mutate('PAYPAL')}
                                >
                                    Test Connection
                                </Button>
                                {testPaypalStatus === 'success' && <Text type="success">Verified</Text>}
                            </div>
                        </Card>

                        {/* 4. KHỐI CẤU HÌNH GEMINI AI */}
                        <Card title={<span className="text-purple-700"><RobotOutlined className="mr-2" />Gemini AI Configuration</span>} className="shadow-sm border-gray-200 rounded-xl">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">Gemini API Key</Text>
                                    <Input.Password
                                        value={geminiApiKey}
                                        onChange={e => { setGeminiApiKey(e.target.value); setTestGeminiStatus('idle'); }}
                                        iconRender={(visible) => (visible ? <EyeTwoTone /> : <EyeInvisibleOutlined />)}
                                        size="large"
                                    />
                                </div>
                                <div>
                                    <Text strong className="block mb-1 text-gray-600">Model</Text>
                                    <Select
                                        className="w-full"
                                        size="large"
                                        value={geminiModel}
                                        onChange={setGeminiModel}
                                        options={geminiModels.map(m => ({ label: m, value: m }))}
                                        disabled={geminiModels.length === 0}
                                        placeholder="Test connection to load models"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-between items-center border-t pt-4 mt-4">
                                <div className="flex space-x-2">
                                    <Button
                                        loading={testConnectionMutation.isPending && testConnectionMutation.variables === 'TEST_GEMINI_MODEL'}
                                        onClick={() => testConnectionMutation.mutate('TEST_GEMINI_MODEL')}
                                        disabled={!geminiModel}
                                    >
                                        Test Selected Model
                                    </Button>
                                    <Button
                                        loading={testConnectionMutation.isPending && testConnectionMutation.variables === 'GEMINI'}
                                        onClick={() => testConnectionMutation.mutate('GEMINI')}
                                    >
                                        Refresh Models List
                                    </Button>
                                </div>
                                {testGeminiStatus === 'success' && <Text type="success">Verified</Text>}
                            </div>
                        </Card>

                        {/* KHỐI NÚT LƯU TOÀN BỘ CẤU HÌNH VÀ CẢNH BÁO KIỂM TRA KẾT NỐI */}
                        <div className="flex justify-end pt-4">
                            <Button
                                type="primary"
                                size="large"
                                icon={<SaveOutlined />}
                                loading={saveConfigMutation.isPending}
                                onClick={() => saveConfigMutation.mutate()}
                                className="bg-blue-600"
                                disabled={testEmailStatus !== 'success' || testPaypalStatus !== 'success' || testPayosStatus !== 'success' || testGeminiStatus !== 'success'}
                            >
                                Save All Configurations
                            </Button>
                        </div>
                        {(testEmailStatus !== 'success' || testPaypalStatus !== 'success' || testPayosStatus !== 'success' || testGeminiStatus !== 'success') && (
                            <div className="text-right mt-2 text-xs text-red-500">
                                * You must successfully test all connections before saving.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
