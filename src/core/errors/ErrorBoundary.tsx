/**
 * =========================================================================================
 * CHI TIẾT VÒNG ĐỜI VÀ KIẾN TRÚC XỬ LÝ LỖI TOÀN CỤC CỦA ỨNG DỤNG (ERROR BOUNDARY ARCHITECTURE)
 * (Trình bày chi tiết luồng dữ liệu ánh xạ trực tiếp vào các dòng code trong file này)
 * =========================================================================================
 * 
 * BƯỚC 1: KHỞI TẠO CLASS COMPONENT VÀ THIẾT LẬP TRẠNG THÁI BAN ĐẦU (COMPONENT INIT & STATE SETUP)
 * - Minh chứng 1: Tại dòng 63 có khai báo `export class ErrorBoundary extends Component<Props, State> { ... }`.
 *   Đây là một React Class Component được dùng để bao bọc toàn bộ ứng dụng nhằm bắt các ngoại lệ runtime trong cây giao diện.
 * - Minh chứng 2: Tại các dòng 65-69 có khởi tạo `public state: State = { hasError: false, error: null, errorInfo: null }`.
 *   Mặc định ban đầu trạng thái lỗi là `false`, ứng dụng vận hành bình thường.
 * 
 * BƯỚC 2: BẮT LỖI TỪ THỜI ĐIỂM RENDER (GET DERIVED STATE FROM ERROR)
 * - Minh chứng: Tại dòng 82 khai báo static method `getDerivedStateFromError(error: Error)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Khi có bất kỳ lỗi không được xử lý (uncaught exception) xảy ra ở bất kỳ Component con nào trong lúc Render,
 *     React tự động kích hoạt hàm static này.
 *   + Hàm lập tức trả về State mới `{ hasError: true, error, errorInfo: null }` để chuẩn bị cho việc chuyển đổi giao diện Fallback UI.
 * 
 * BƯỚC 3: GHI LOG VÀ THU THẬP STACK TRACE VÒNG ĐỜI (COMPONENT DID CATCH & LOGGING)
 * - Minh chứng: Tại dòng 98 khai báo `componentDidCatch(error: Error, errorInfo: ErrorInfo)`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Hàm Lifecycle này được gọi sau khi lỗi đã được kích hoạt.
 *   + In toàn bộ thông tin lỗi chi tiết và vết ngăn xếp Component (`componentStack`) ra Console (`console.error`).
 *   + Cập nhật `errorInfo` vào State để phục vụ việc hiển thị chi tiết vết lỗi cho Lập trình viên / Quản trị viên.
 * 
 * BƯỚC 4: RENDER GIAO DIỆN CẢNH BÁO CRASH VÀ KHÔI PHỤC ỨNG DỤNG (FALLBACK UI & RELOAD)
 * - Minh chứng: Tại dòng 106 hàm `render()`.
 * - Cụ thể tại sao đây là minh chứng?
 *   + Nếu `hasError === true`: Render màn hình báo hỏng giao diện (Application Crash Screen) kèm Thông điệp lỗi,
 *     Component Stack và nút bấm "Reload Application" để khôi phục ứng dụng.
 *   + Nếu không có lỗi (`hasError === false`): Trả về nguyên vẹn `this.props.children` để ứng dụng hiển thị bình thường.
 * =========================================================================================
 */

// =========================================================================
// PHẦN 1: THƯ VIỆN LÕI REACT VÀ CÁC TYPE VÒNG ĐỜI
// Công dụng: Cung cấp Class Component nền tảng của React, kiểu dữ liệu ErrorInfo và ReactNode.
// =========================================================================
import React, { Component, ErrorInfo, ReactNode } from 'react'; // Các kiểu dữ liệu và Component gốc từ React.

// =========================================================================
// PHẦN 2: KHAI BÁO PROPS VÀ STATE DÙNG CHO ERROR BOUNDARY
// Công dụng: Định nghĩa kiểu thuộc tính đầu vào (Props) và Trạng thái lưu trữ lỗi (State).
// =========================================================================

/** Interface định nghĩa thuộc tính đầu vào Props cho ErrorBoundary */
interface Props {
    children?: ReactNode; // Danh sách các Component con được ErrorBoundary bọc bên trong
}

/** Interface định nghĩa cấu trúc State lưu trữ lỗi của ErrorBoundary */
interface State {
    hasError: boolean; // Cờ đánh dấu hệ thống có gặp lỗi hay không
    error: Error | null; // Đối tượng lỗi runtime thu thập được
    errorInfo: ErrorInfo | null; // Thông tin vết ngăn xếp Component (Component Stack trace)
}

/**
 * === PHẦN 3: ĐỊNH NGHĨA CLASS COMPONENT ERRORBOUNDARY ===
 * Màng bọc bảo vệ ứng dụng toàn cục: Bắt toàn bộ lỗi phát sinh từ các Component con và hiển thị giao diện khôi phục khẩn cấp.
 */
export class ErrorBoundary extends Component<Props, State> {
    // --- KHỞI TẠO STATE TRẠNG THÁI BAN ĐẦU ---
    public state: State = {
        hasError: false,
        error: null,
        errorInfo: null
    };

    /**
     * =========================================================================
     * HÀM STATIC VÒNG ĐỜI: LẤY STATE MỚI KHI XẢY RA LỖI RENDER
     * =========================================================================
     * MỤC ĐÍCH:
     * Chuyển đổi trạng thái `hasError` sang `true` ngay khi phát hiện lỗi không mong muốn ở bất kỳ Component con nào.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Nhận đối tượng `error` từ React Engine.
     * 2. Trả về đối tượng State mới với `hasError: true` để trigger việc render giao diện Fallback UI.
     */
    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error, errorInfo: null };
    }

    /**
     * =========================================================================
     * HÀM LIFECYCLE: BẮT GHI LOG THÔNG TIN LỖI CHI TIẾT
     * =========================================================================
     * MỤC ĐÍCH:
     * Ghi nhận thông tin chi tiết vết ngăn xếp Component (`componentStack`) để phục vụ việc debug và phát hiện nguyên nhân sự cố.
     * 
     * MÃ GIẢ CHI TIẾT:
     * 1. Nhận `error` và `errorInfo` từ hệ thống.
     * 2. In log lỗi ra Console trình duyệt qua `console.error`.
     * 3. Lưu `errorInfo` vào State để hiển thị chi tiết lên màn hình lỗi.
     */
    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Uncaught React Error:', error, errorInfo);
        this.setState({ errorInfo });
    }

    // =========================================================================
    // PHẦN 4: RENDER GIAO DIỆN COMPONENT (FALLBACK UI HOẶC CHILDREN)
    // =========================================================================
    public render() {
        // KỊCH BẢN 1: HỆ THỐNG GẶP LỖI -> RENDER MÀN HÌNH BÁO SỰ CỐ CRASH
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-red-50 flex flex-col items-center justify-center p-8 font-sans">
                    <div className="max-w-3xl w-full bg-white p-8 rounded-xl shadow-lg border-l-4 border-red-500">
                        {/* TIÊU ĐỀ THÔNG BÁO SỰ CỐ */}
                        <h1 className="text-3xl font-bold text-red-600 mb-4">React Application Crash</h1>
                        <p className="text-gray-700 mb-6">
                            A fatal error occurred during rendering. This is usually caused by an undefined component, a bad import, or a runtime exception in a render method.
                        </p>

                        {/* HIỂN THỊ NỘI DUNG THÔNG BÁO LỖI (ERROR MESSAGE) */}
                        <div className="bg-gray-100 p-4 rounded-md overflow-x-auto mb-4">
                            <h2 className="text-lg font-semibold text-gray-800 mb-2">Error Message:</h2>
                            <code className="text-red-500 font-mono text-sm">{this.state.error?.toString()}</code>
                        </div>

                        {/* HIỂN THỊ VẾT NGĂN XẾP COMPONENT (COMPONENT STACK TRACE) */}
                        {this.state.errorInfo && (
                            <div className="bg-gray-100 p-4 rounded-md overflow-x-auto mb-6">
                                <h2 className="text-lg font-semibold text-gray-800 mb-2">Component Stack:</h2>
                                <pre className="text-gray-600 font-mono text-xs whitespace-pre-wrap">
                                    {this.state.errorInfo.componentStack}
                                </pre>
                            </div>
                        )}

                        {/* NÚT TẢI LẠI TỜ TRANG ỨNG DỤNG KHÔI PHỤC TRẠNG THÁI */}
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Reload Application
                        </button>
                    </div>
                </div>
            );
        }

        // KỊCH BẢN 2: HỆ THỐNG BÌNH THƯỜNG -> RENDER CÁC COMPONENT CON NGUYÊN VẸN
        return this.props.children;
    }
}
