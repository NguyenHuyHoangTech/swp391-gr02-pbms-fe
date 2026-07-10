/**
 * Chức năng của file:
 * AppRouter là file cấu hình routing chính của frontend PBMS.
 * File này quản lý điều hướng giữa các màn hình, bảo vệ route theo trạng thái đăng nhập và role,
 * lazy load các screen để giảm thời gian tải ban đầu, đồng bộ simulated time từ backend,
 * tự động logout khi tài khoản hiện tại bị cập nhật qua WebSocket và kích hoạt IdleTimeoutGuard.
 *
 * Liên quan frontend:
 * - useAuthStore lưu token, email, role và trạng thái đăng nhập của user.
 * - axiosClient gọi API backend để lấy simulated time offset.
 * - timeProvider lưu offset thời gian mô phỏng của hệ thống.
 * - useWebSocket cung cấp kết nối STOMP WebSocket và trạng thái kết nối.
 * - IdleTimeoutGuard theo dõi thời gian user không hoạt động.
 * - GlobalLoading hiển thị loading trong lúc lazy component đang được tải.
 * - React Router quản lý URL và điều hướng giữa các màn hình.
 *
 * Liên quan backend:
 * - JwtAuthFilter xác thực JWT token được gửi qua axiosClient.
 * - SecurityConfig kiểm tra quyền truy cập API theo role.
 * - WebSocketConfig cung cấp kết nối WebSocket cho frontend.
 * - /topic/identity/users phát thông báo khi thông tin user thay đổi.
 * - /public/time-offset trả về simulated time offset hiện tại.
 *
 * Pseudo code:
 * 1. Import các service, store, router và component dùng chung.
 * 2. Lazy load tất cả screen và layout của hệ thống.
 * 3. Tạo ProtectedRoute để kiểm tra trạng thái đăng nhập và role.
 * 4. Kết nối WebSocket và subscribe topic cập nhật user.
 * 5. Nếu tài khoản hiện tại bị update thì logout user.
 * 6. Khi ứng dụng khởi động, gọi backend để lấy simulated time offset.
 * 7. Bật IdleTimeoutGuard để theo dõi thời gian không hoạt động.
 * 8. Khai báo route cho admin, manager, customer và staff.
 * 9. Bảo vệ từng nhóm route bằng allowedRoles.
 * 10. Redirect URL không hợp lệ về trang login.
 */

import { useEffect, Suspense, lazy } from 'react';
import axiosClient from '../api/axiosClient';
import { setSimulatedOffset } from '../utils/timeProvider';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { GlobalLoading } from '../../features/shared/components/GlobalLoading';
import { IdleTimeoutGuard } from '../../features/shared/components/IdleTimeoutGuard';
import { useWebSocket } from '../websocket/useWebSocket';

const LoginScreen = lazy(() => import('../../features/auth/LoginScreen').then(m => ({ default: m.LoginScreen })));
const BuildingProfileScreen = lazy(() => import('../../features/system/BuildingProfileScreen').then(m => ({ default: m.BuildingProfileScreen })));
const SystemConfigScreen = lazy(() => import('../../features/system/SystemConfigScreen').then(m => ({ default: m.SystemConfigScreen })));
const AuditLogScreen = lazy(() => import('../../features/admin/AuditLogScreen').then(m => ({ default: m.AuditLogScreen })));
const GateConsoleScreen = lazy(() => import('../../features/staff/GateConsoleScreen').then(m => ({ default: m.GateConsoleScreen })));
const ShiftManagementScreen = lazy(() => import('../../features/staff/ShiftManagementScreen').then(m => ({ default: m.ShiftManagementScreen })));
const ExceptionDeskScreen = lazy(() => import('../../features/staff/ExceptionDeskScreen').then(m => ({ default: m.ExceptionDeskScreen })));
const HomeScreen = lazy(() => import('../../features/customer/HomeScreen').then(m => ({ default: m.HomeScreen })));
const PreBookingScreen = lazy(() => import('../../features/customer/PreBookingScreen').then(m => ({ default: m.PreBookingScreen })));
const MyParkingScreen = lazy(() => import('../../features/customer/MyParkingScreen').then(m => ({ default: m.MyParkingScreen })));
const HelpdeskScreen = lazy(() => import('../../features/customer/HelpdeskScreen').then(m => ({ default: m.HelpdeskScreen })));
const CustomerMonthlyPassScreen = lazy(() => import('../../features/customer/CustomerMonthlyPassScreen').then(m => ({ default: m.CustomerMonthlyPassScreen })));
const CustomerRulesScreen = lazy(() => import('../../features/customer/CustomerRulesScreen').then(m => ({ default: m.CustomerRulesScreen })));
const UserManagementScreen = lazy(() => import('../../features/admin/UserManagementScreen').then(m => ({ default: m.UserManagementScreen })));
const VehicleTypeScreen = lazy(() => import('../../features/manager/VehicleTypeScreen').then(m => ({ default: m.VehicleTypeScreen })));
const SpaceMapScreen = lazy(() => import('../../features/manager/SpaceMapScreen').then(m => ({ default: m.SpaceMapScreen })));
const PricingConfigScreen = lazy(() => import('../../features/manager/PricingConfigScreen').then(m => ({ default: m.PricingConfigScreen })));
const PenaltyConfigScreen = lazy(() => import('../../features/manager/PenaltyConfigScreen').then(m => ({ default: m.PenaltyConfigScreen })));
const MonthlyPassScreen = lazy(() => import('../../features/manager/MonthlyPassScreen').then(m => ({ default: m.MonthlyPassScreen })));
const RevenueDashboardScreen = lazy(() => import('../../features/manager/RevenueDashboardScreen').then(m => ({ default: m.RevenueDashboardScreen })));
const OperationalDashboardScreen = lazy(() => import('../../features/manager/OperationalDashboardScreen').then(m => ({ default: m.OperationalDashboardScreen })));
const RefundManagementScreen = lazy(() => import('../../features/manager/RefundManagementScreen').then(m => ({ default: m.RefundManagementScreen })));
const CardManagementScreen = lazy(() => import('../../features/manager/CardManagementScreen').then(m => ({ default: m.CardManagementScreen })));
const VehicleRoutingScreen = lazy(() => import('../../features/manager/VehicleRoutingScreen').then(m => ({ default: m.VehicleRoutingScreen })));
const PreBookingManagementScreen = lazy(() => import('../../features/manager/PreBookingManagementScreen').then(m => ({ default: m.PreBookingManagementScreen })));

const ManagerLayout = lazy(() => import('../../features/manager/ManagerLayout').then(m => ({ default: m.ManagerLayout })));
const StaffLayout = lazy(() => import('../../features/staff/StaffLayout').then(m => ({ default: m.StaffLayout })));
const CustomerLayout = lazy(() => import('../../features/customer/CustomerLayout').then(m => ({ default: m.CustomerLayout })));
const AdminLayout = lazy(() => import('../../features/admin/AdminLayout').then(m => ({ default: m.AdminLayout })));

/**
 * ProtectedRoute dùng để bảo vệ các route yêu cầu đăng nhập và role phù hợp.
 * Component này kiểm tra authentication state và role trước khi cho phép render children.
 *
 * Pseudo code:
 * 1. Lấy trạng thái đăng nhập từ useAuthStore.
 * 2. Lấy role hiện tại của user.
 * 3. Nếu user chưa đăng nhập thì chuyển về /login.
 * 4. Nếu role hiện tại không nằm trong allowedRoles thì chuyển về /login.
 * 5. Nếu hợp lệ thì render children.
 */
const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const role = useAuthStore((state) => state.role);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role && !allowedRoles.includes(role)) {
    return <Navigate to="/login" replace />; // or to a forbidden page
  }

  return <>{children}</>;
};

/**
 * AppRouter là component router chính của frontend PBMS.
 * Component này quản lý WebSocket user update, simulated time, idle timeout
 * và toàn bộ route được phân quyền theo từng loại user.
 *
 * Pseudo code:
 * 1. Lấy stompClient và connected từ useWebSocket.
 * 2. Lấy email và logout từ useAuthStore.
 * 3. Khi WebSocket kết nối thành công, subscribe topic cập nhật user.
 * 4. Nếu nhận event UPDATE cho đúng email đang đăng nhập thì logout user.
 * 5. Khi component được mount, gọi API lấy simulated time offset.
 * 6. Lưu offset vào timeProvider nếu backend trả về number.
 * 7. Khởi tạo BrowserRouter.
 * 8. Kích hoạt IdleTimeoutGuard.
 * 9. Dùng Suspense để hiển thị GlobalLoading trong lúc lazy load component.
 * 10. Khai báo route public cho login.
 * 11. Khai báo protected route cho admin, manager, customer và staff.
 * 12. Redirect tất cả route không tồn tại về /login.
 */
export const AppRouter = () => {
  const { stompClient, connected } = useWebSocket();
  const email = useAuthStore(state => state.email);
  const logout = useAuthStore(state => state.logout);

  /**
   * Theo dõi sự kiện cập nhật user thông qua WebSocket.
   * Nếu tài khoản đang đăng nhập bị update, hệ thống sẽ tự động logout user.
   *
   * Pseudo code:
   * 1. Kiểm tra stompClient, trạng thái connected và email có tồn tại không.
   * 2. Subscribe topic /topic/identity/users.
   * 3. Khi nhận message, parse body từ JSON.
   * 4. Kiểm tra action có phải UPDATE không.
   * 5. Kiểm tra email trong event có trùng với user hiện tại không.
   * 6. Nếu trùng thì gọi logout().
   * 7. Khi effect bị cleanup thì unsubscribe topic.
   */
  useEffect(() => {
    if (stompClient && connected && email) {
      const sub = stompClient.subscribe('/topic/identity/users', (msg) => {
        try {
          const data = JSON.parse(msg.body);
          if (data.action === 'UPDATE' && data.email === email) {
            logout();
          }
        } catch (e) { }
      });
      return () => sub.unsubscribe();
    }
  }, [stompClient, connected, email, logout]);

  /**
   * Lấy simulated time offset từ backend khi ứng dụng khởi động.
   * Offset này giúp frontend hiển thị cùng thời gian mô phỏng với backend.
   *
   * Pseudo code:
   * 1. Gọi GET /public/time-offset.
   * 2. Lấy offset từ response.data.data.
   * 3. Kiểm tra offset có phải number không.
   * 4. Nếu hợp lệ thì gọi setSimulatedOffset().
   * 5. Nếu request lỗi thì ghi lỗi ra console.
   */
  useEffect(() => {
    // Fetch time offset on startup
    axiosClient.get('/public/time-offset').then((res: any) => {
      const offset = res.data?.data;
      if (typeof offset === 'number') {
        setSimulatedOffset(offset);
      }
    }).catch((e: any) => console.error('Failed to fetch time offset', e));
  }, []);

  return (
    <BrowserRouter>
      <IdleTimeoutGuard />
      <Suspense fallback={<GlobalLoading />}>
        <Routes>
          <Route path="/login" element={<LoginScreen />} />

          {/* ADMIN LAYOUT ROUTES */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ROLE_SUPER_ADMIN', 'ROLE_ADMIN']}>
                <AdminLayout />
              </ProtectedRoute>
            }
          >
            <Route path="system-configs" element={<SystemConfigScreen />} />
            <Route path="audit-logs" element={<AuditLogScreen />} />
            <Route path="users" element={<UserManagementScreen />} />
          </Route>

          {/* MANAGER LAYOUT ROUTES */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute allowedRoles={['ROLE_MANAGER']}>
                <ManagerLayout />
              </ProtectedRoute>
            }
          >
            <Route path="building-profile" element={<BuildingProfileScreen />} />
            <Route path="vehicle-types" element={<VehicleTypeScreen />} />
            <Route path="space-map" element={<SpaceMapScreen />} />
            <Route path="pricing-config" element={<PricingConfigScreen />} />
            <Route path="penalty-config" element={<PenaltyConfigScreen />} />
            <Route path="monthly-passes" element={<MonthlyPassScreen />} />
            <Route path="refund-management" element={<RefundManagementScreen />} />
            <Route path="revenue-dashboard" element={<RevenueDashboardScreen />} />
            <Route path="operational-dashboard" element={<OperationalDashboardScreen />} />
            <Route path="card-management" element={<CardManagementScreen />} />
            <Route path="routing" element={<VehicleRoutingScreen />} />
            <Route path="pre-bookings" element={<PreBookingManagementScreen />} />
            <Route path="incidents" element={<ExceptionDeskScreen />} />
          </Route>

          {/* CUSTOMER LAYOUT ROUTES */}
          <Route
            path="/customer"
            element={
              <ProtectedRoute allowedRoles={['ROLE_CUSTOMER']}>
                <CustomerLayout />
              </ProtectedRoute>
            }
          >
            <Route path="home" element={<HomeScreen />} />
            <Route path="pre-booking" element={<PreBookingScreen />} />
            <Route path="my-parking" element={<MyParkingScreen />} />
            <Route path="monthly-pass" element={<CustomerMonthlyPassScreen />} />
            <Route path="helpdesk" element={<HelpdeskScreen />} />
            <Route path="rules" element={<CustomerRulesScreen />} />
          </Route>

          {/* STAFF LAYOUT ROUTES */}
          <Route
            path="/staff"
            element={
              <ProtectedRoute allowedRoles={['ROLE_STAFF']}>
                <StaffLayout />
              </ProtectedRoute>
            }
          >
            <Route path="gate-console" element={<GateConsoleScreen />} />
            <Route path="shift-management" element={<ShiftManagementScreen />} />
            <Route path="exception-desk" element={<ExceptionDeskScreen />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};