import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';
import { useAuthStore } from '../../core/store/useAuthStore';
import { useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';

type View = 'login' | 'register' | 'forgot-password' | 'setup-password';

/**
 * LoginScreen quản lý toàn bộ giao diện xác thực của frontend.
 * Component này xử lý login, register, xác thực OTP, quên mật khẩu, Google login
 * và setup password sau khi đăng nhập bằng Google.
 *
 * Frontend không tự đăng nhập trực tiếp.
 * Frontend gửi request qua axiosClient đến backend, chủ yếu là nhóm API /identity/auth/**.
 *
 * Backend liên quan:
 * - SecurityConfig: cho phép public /api/v1/identity/auth/** để người chưa đăng nhập vẫn gọi được.
 * - JwtProvider: backend dùng để tạo accessToken sau khi login thành công.
 * - JwtAuthFilter: dùng cho các request sau login khi frontend gửi Authorization: Bearer token.
 * - ApiResponse: backend trả response theo format chung, frontend đọc data.data.
 * - EmailService: dùng khi register hoặc forgot password cần gửi OTP qua email.
 * - GlobalExceptionHandler: trả message lỗi để frontend hiển thị bằng setError().
 *
 * Pseudo code:
 * 1. Người dùng chọn login, register, forgot password hoặc setup password.
 * 2. Frontend lấy dữ liệu từ input.
 * 3. handleSubmit kiểm tra dữ liệu cơ bản ở frontend.
 * 4. useMutation gọi API backend tương ứng.
 * 5. Nếu backend trả thành công thì lưu token hoặc chuyển sang bước tiếp theo.
 * 6. Nếu backend trả lỗi thì hiển thị message lỗi.
 */
export const LoginScreen = () => {
  const [view, setView] = useState<View>('login');
  const [regStep, setRegStep] = useState<1 | 2>(1);
  const [forgotStep, setForgotStep] = useState<1 | 2 | 3>(1);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [setupToken, setSetupToken] = useState('');

  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isOtpMode, setIsOtpMode] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  /**
   * Xóa message lỗi và message thành công hiện tại.
   *
   * Pseudo code:
   * 1. Set error về chuỗi rỗng.
   * 2. Set successMsg về chuỗi rỗng.
   */
  const clearMessages = () => {
    setError('');
    setSuccessMsg('');
  };

  /**
   * Điều hướng người dùng sau khi login thành công dựa trên role backend trả về.
   *
   * Backend liên quan:
   * - Role thường được lấy từ User entity trong module identity.
   * - Role cũng có thể được backend đưa vào JWT claim bằng JwtProvider.
   *
   * Pseudo code:
   * 1. Nhận role của user.
   * 2. Nếu là SUPER_ADMIN hoặc ADMIN thì chuyển đến trang admin.
   * 3. Nếu là MANAGER thì chuyển đến trang manager.
   * 4. Nếu là STAFF thì chuyển đến trang staff.
   * 5. Nếu là CUSTOMER thì chuyển đến trang customer.
   * 6. Nếu role không hợp lệ thì quay về trang login.
   */
  const navigateByRole = (role: string) => {
    switch (role) {
      case 'ROLE_SUPER_ADMIN':
      case 'ROLE_ADMIN':
        navigate('/admin/users');
        break;
      case 'ROLE_MANAGER':
        navigate('/manager/building-profile');
        break;
      case 'ROLE_STAFF':
        navigate('/staff/shift-management');
        break;
      case 'ROLE_CUSTOMER':
        navigate('/customer/home');
        break;
      default:
        navigate('/login');
    }
  };

  /**
   * Xử lý response sau khi backend xác thực thành công.
   * Method này lấy accessToken và thông tin user từ response rồi lưu vào auth store.
   *
   * Backend liên quan:
   * - API login/register/google login trả về accessToken, email, role, fullName, hasPassword và linkedGoogle.
   * - accessToken được backend tạo bằng JwtProvider.
   * - Các request sau login sẽ dùng token này để JwtAuthFilter xác thực.
   *
   * Pseudo code:
   * 1. Lấy data thật từ response backend.
   * 2. Lưu accessToken và thông tin user vào useAuthStore.
   * 3. Nếu backend yêu cầu setup password thì chuyển sang màn hình setup-password.
   * 4. Nếu không cần setup password thì điều hướng theo role.
   */
  const handleSuccessAuth = (data: any) => {
    const d = data.data;

    setAuth(d.accessToken, d.email, d.role, d.fullName, d.hasPassword, d.linkedGoogle);

    if (d.needsPasswordSetup) {
      setSetupToken(d.accessToken);
      setView('setup-password');
    } else {
      navigateByRole(d.role);
    }
  };

  /**
   * Gọi API login bằng email và password.
   *
   * Backend gọi đến:
   * POST /identity/auth/login
   *
   * Request thật thường là:
   * POST /api/v1/identity/auth/login
   * nếu axiosClient có baseURL là /api/v1.
   *
   * Backend thường xử lý:
   * 1. AuthController nhận email và password.
   * 2. AuthService tìm user bằng email.
   * 3. PasswordEncoder trong SecurityConfig kiểm tra password.
   * 4. Kiểm tra user có ACTIVE không.
   * 5. JwtProvider tạo accessToken.
   * 6. Backend trả accessToken và thông tin user về frontend.
   *
   * Pseudo code frontend:
   * 1. Gửi email và password lên backend.
   * 2. Nếu thành công thì gọi handleSuccessAuth().
   * 3. Nếu lỗi thì lấy message backend trả về và hiển thị bằng setError().
   */
  const loginMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post('/identity/auth/login', { email, password })).data,
    onSuccess: handleSuccessAuth,
    onError: (err: any) => {
      const msg = err.response?.data?.message || err.message || 'Login Failed';
      setError(msg);
    },
  });

  /**
   * Gọi API đăng ký tài khoản mới.
   *
   * Backend gọi đến:
   * POST /identity/auth/register
   *
   * Backend thường xử lý:
   * 1. Kiểm tra email đã tồn tại chưa.
   * 2. Kiểm tra password và confirmPassword.
   * 3. Mã hóa password bằng PasswordEncoder trong SecurityConfig.
   * 4. Tạo user mới.
   * 5. Tạo OTP.
   * 6. Gửi OTP qua EmailService.
   *
   * Pseudo code frontend:
   * 1. Gửi email, password, confirmPassword và fullName lên backend.
   * 2. Nếu thành công thì chuyển sang bước nhập OTP.
   * 3. Nếu lỗi thì hiển thị message lỗi.
   */
  const registerMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post('/identity/auth/register', {
        email,
        password,
        confirmPassword,
        fullName,
      })).data,
    onSuccess: () => {
      setSuccessMsg('Registration Success! OTP sent to email');
      setError('');
      setRegStep(2);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Failed Registration');
      setSuccessMsg('');
    },
  });

  /**
   * Gọi API xác thực OTP sau khi đăng ký.
   *
   * Backend gọi đến:
   * POST /identity/auth/verify-otp
   *
   * Backend thường xử lý:
   * 1. Nhận email, otpCode và purpose REGISTER.
   * 2. Kiểm tra OTP có đúng và còn hạn không.
   * 3. Kích hoạt tài khoản nếu OTP hợp lệ.
   * 4. Trả kết quả thành công về frontend.
   *
   * Pseudo code frontend:
   * 1. Gửi email, otpCode và purpose REGISTER.
   * 2. Nếu OTP đúng thì báo thành công.
   * 3. Sau một khoảng ngắn thì quay về màn hình login.
   */
  const verifyRegisterOtpMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post('/identity/auth/verify-otp', {
        email,
        otpCode,
        purpose: 'REGISTER',
      })).data,
    onSuccess: () => {
      setSuccessMsg('authentication Success! Go to Login page');
      setError('');
      setTimeout(() => goToLogin(), 1500);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Invalid OTP code');
    },
  });

  /**
   * Gọi API quên mật khẩu để gửi OTP về email.
   *
   * Backend gọi đến:
   * POST /identity/auth/forgot-password
   *
   * Backend thường xử lý:
   * 1. Kiểm tra email có tồn tại không.
   * 2. Tạo OTP cho mục đích FORGOT_PASSWORD.
   * 3. Gửi OTP qua EmailService.
   *
   * Pseudo code frontend:
   * 1. Gửi email lên backend.
   * 2. Nếu email hợp lệ thì chuyển sang bước nhập OTP.
   * 3. Nếu lỗi thì hiển thị message lỗi.
   */
  const forgotMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post('/identity/auth/forgot-password', { email })).data,
    onSuccess: () => {
      setForgotStep(2);
      setSuccessMsg('OTP sent to email');
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Account not found');
      setSuccessMsg('');
    },
  });

  /**
   * Gọi API xác thực OTP quên mật khẩu.
   *
   * Backend gọi đến:
   * POST /identity/auth/verify-forgot-password
   *
   * Backend thường xử lý:
   * 1. Nhận email và otpCode.
   * 2. Kiểm tra OTP quên mật khẩu.
   * 3. Nếu hợp lệ thì tạo resetToken tạm thời.
   * 4. Trả resetToken về frontend.
   *
   * Pseudo code frontend:
   * 1. Gửi email và otpCode lên backend.
   * 2. Nếu OTP đúng thì lưu resetToken.
   * 3. Chuyển sang bước nhập mật khẩu mới.
   */
  const verifyForgotOtpMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post('/identity/auth/verify-forgot-password', {
        email,
        otpCode,
      })).data,
    onSuccess: (data) => {
      setResetToken(data.data);
      setForgotStep(3);
      setOtpCode('');
      setPassword('');
      setConfirmPassword('');
      setSuccessMsg('Authentication Success! Enter new Password');
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Invalid OTP code');
      setSuccessMsg('');
    },
  });

  /**
   * Gọi API đặt lại mật khẩu bằng resetToken.
   *
   * Backend gọi đến:
   * POST /identity/auth/reset-password
   *
   * Header gửi kèm:
   * Authorization: Bearer resetToken
   *
   * Backend thường xử lý:
   * 1. JwtAuthFilter hoặc logic riêng kiểm tra resetToken.
   * 2. Lấy user từ token.
   * 3. Kiểm tra newPassword và confirmPassword.
   * 4. Mã hóa password mới bằng PasswordEncoder.
   * 5. Lưu password mới vào database.
   *
   * Pseudo code frontend:
   * 1. Gửi newPassword và confirmPassword.
   * 2. Gửi resetToken trong Authorization header.
   * 3. Nếu thành công thì báo đổi mật khẩu thành công.
   * 4. Quay về màn hình login.
   */
  const resetPasswordMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post(
        '/identity/auth/reset-password',
        { newPassword: password, confirmPassword },
        { headers: { Authorization: `Bearer ${resetToken}` } }
      )).data,
    onSuccess: () => {
      setSuccessMsg('Change Password Success! Please Login');
      setError('');
      setTimeout(() => goToLogin(), 1500);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Change Password Failed');
      setSuccessMsg('');
    },
  });

  /**
   * Gọi API gửi lại OTP.
   *
   * Backend gọi đến:
   * POST /identity/auth/send-otp
   *
   * Backend thường xử lý:
   * 1. Nhận email và purpose.
   * 2. Tạo OTP mới cho REGISTER hoặc FORGOT_PASSWORD.
   * 3. Gửi OTP qua EmailService.
   *
   * Pseudo code frontend:
   * 1. Nhận purpose từ button gửi lại OTP.
   * 2. Gửi email và purpose lên backend.
   * 3. Nếu thành công thì báo OTP mới đã được gửi.
   */
  const sendOtpMutation = useMutation({
    mutationFn: async (purpose: string) =>
      (await axiosClient.post('/identity/auth/send-otp', { email, purpose })).data,
    onSuccess: () => {
      setSuccessMsg('New OTP has been sent to email');
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Send OTP Failed');
    },
  });

  /**
   * Gọi API login bằng Google.
   *
   * Backend gọi đến:
   * POST /identity/auth/login/google
   *
   * Backend thường xử lý:
   * 1. Nhận googleIdToken từ GoogleLogin component.
   * 2. Verify token với Google.
   * 3. Lấy email và thông tin user từ Google token.
   * 4. Tìm hoặc tạo user trong database.
   * 5. Tạo JWT accessToken bằng JwtProvider.
   * 6. Trả thông tin user về frontend.
   *
   * Pseudo code frontend:
   * 1. GoogleLogin trả credential sau khi user login Google thành công.
   * 2. Gửi credential đó lên backend.
   * 3. Nếu backend xác thực thành công thì gọi handleSuccessAuth().
   */
  const googleLoginMutation = useMutation({
    mutationFn: async (credential: string) =>
      (await axiosClient.post('/identity/auth/login/google', {
        googleIdToken: credential,
      })).data,
    onSuccess: handleSuccessAuth,
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Login Google Failed.');
    },
  });

  /**
   * Gọi API set password cho tài khoản đăng nhập bằng Google.
   *
   * Backend gọi đến:
   * POST /identity/auth/set-password
   *
   * Header gửi kèm:
   * Authorization: Bearer setupToken
   *
   * Backend thường xử lý:
   * 1. Kiểm tra setupToken có hợp lệ không.
   * 2. Lấy user từ token.
   * 3. Kiểm tra newPassword và confirmPassword.
   * 4. Mã hóa password bằng PasswordEncoder.
   * 5. Lưu password để user có thể login bằng email/password sau này.
   *
   * Pseudo code frontend:
   * 1. Sau Google login, nếu backend báo needsPasswordSetup thì mở màn hình setup-password.
   * 2. Người dùng nhập password mới.
   * 3. Gửi password mới kèm setupToken lên backend.
   * 4. Nếu thành công thì cập nhật auth store và điều hướng theo role.
   */
  const setupPasswordMutation = useMutation({
    mutationFn: async () =>
      (await axiosClient.post(
        '/identity/auth/set-password',
        { newPassword: password, confirmPassword },
        { headers: { Authorization: `Bearer ${setupToken}` } }
      )).data,
    onSuccess: () => {
      const store = useAuthStore.getState();

      store.setAuth(
        setupToken,
        store.email!,
        store.role!,
        store.name || '',
        true,
        store.authProvider === 'GOOGLE'
      );

      setSuccessMsg('Set up Password Success!');
      setTimeout(() => navigateByRole(useAuthStore.getState().role || ''), 1000);
    },
    onError: (err: any) => {
      setError(err.response?.data?.message || 'Password Failed Settings');
    },
  });

  /**
   * Reset màn hình về trạng thái login ban đầu.
   *
   * Pseudo code:
   * 1. Chuyển view về login.
   * 2. Xóa email, password, confirmPassword và OTP.
   * 3. Reset bước đăng ký và quên mật khẩu.
   * 4. Tắt OTP mode nếu có.
   * 5. Xóa message lỗi và message thành công.
   */
  const goToLogin = () => {
    setView('login');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setOtpCode('');
    setRegStep(1);
    setForgotStep(1);
    setIsOtpMode(false);
    clearMessages();
  };

  /**
   * Xử lý submit form cho tất cả màn hình trong LoginScreen.
   * Method này kiểm tra input ở frontend trước, sau đó gọi mutation tương ứng để gửi request lên backend.
   *
   * Backend liên quan:
   * - view login gọi /identity/auth/login.
   * - view register gọi /identity/auth/register hoặc /identity/auth/verify-otp.
   * - view forgot-password gọi /identity/auth/forgot-password, /identity/auth/verify-forgot-password hoặc /identity/auth/reset-password.
   * - view setup-password gọi /identity/auth/set-password.
   *
   * Pseudo code:
   * 1. Chặn reload page mặc định của form.
   * 2. Xóa message cũ.
   * 3. Kiểm tra view hiện tại là login, register, forgot-password hay setup-password.
   * 4. Validate dữ liệu bắt buộc ở frontend.
   * 5. Validate confirm password và format password nếu cần.
   * 6. Gọi mutation tương ứng.
   * 7. Mutation sẽ gửi request sang backend và xử lý kết quả trả về.
   */
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (view === 'login') {
      if (!email || !password) {
        return setError('Please enter your full email and password');
      }

      loginMutation.mutate();
    } else if (view === 'register') {
      if (regStep === 1) {
        if (!email || !password || !fullName || !confirmPassword) {
          return setError('Please enter all required information');
        }

        if (password !== confirmPassword) {
          return setError('Password Confirm unavailable');
        }

        if (!/^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=!_]).{8,20}$/.test(password)) {
          return setError(
            'Password must be between 8-20 characters, including uppercase, lowercase, numeric, and special characters'
          );
        }

        registerMutation.mutate();
      } else {
        if (!otpCode) {
          return setError('Please enter code,');
        }

        verifyRegisterOtpMutation.mutate();
      }
    } else if (view === 'forgot-password') {
      if (forgotStep === 1) {
        if (!email) {
          return setError('Please enter an email');
        }

        forgotMutation.mutate();
      } else if (forgotStep === 2) {
        if (!otpCode) {
          return setError('Please enter code,');
        }

        verifyForgotOtpMutation.mutate();
      } else {
        if (!password || !confirmPassword) {
          return setError('Please enter a new password');
        }

        if (password !== confirmPassword) {
          return setError('Password Confirm unavailable');
        }

        if (!/^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=!_]).{8,20}$/.test(password)) {
          return setError(
            'Password must be between 8-20 characters, including uppercase, lowercase, numeric, and special characters'
          );
        }

        resetPasswordMutation.mutate();
      }
    } else if (view === 'setup-password') {
      if (!password || !confirmPassword) {
        return setError('Please enter Passworde');
      }

      if (password !== confirmPassword) {
        return setError('Password Confirm unavailable');
      }

      if (!/^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=!_]).{8,20}$/.test(password)) {
        return setError(
          'Password must be between 8-20 characters, including uppercase, lowercase, numeric, and special characters'
        );
      }

      setupPasswordMutation.mutate();
    }
  };

  const inputCls =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors text-gray-800 placeholder-gray-400';
  const btnPrimary =
    'w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed';
  const btnSecondary = 'text-sm text-blue-600 font-medium hover:underline disabled:opacity-50';
  const btnGhost = 'text-sm text-gray-500 hover:text-gray-700 transition-colors';
  const labelCls = 'block text-sm font-medium text-gray-700 mb-1';

  const titles: Record<View, string> = {
    login: '🅿 PBMS Login',
    register: 'Create an account',
    'forgot-password': 'Lost your password?',
    'setup-password': 'Password Settings',
  };

  const isAnyPending =
    loginMutation.isPending ||
    registerMutation.isPending ||
    verifyRegisterOtpMutation.isPending ||
    forgotMutation.isPending ||
    verifyForgotOtpMutation.isPending ||
    resetPasswordMutation.isPending ||
    setupPasswordMutation.isPending;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-gray-100">
      <div className="max-w-md w-full m-4 p-8 bg-white rounded-2xl shadow-xl border border-gray-100">
        <h2 className="text-2xl font-bold text-center text-gray-800 mb-2">{titles[view]}</h2>

        {view === 'forgot-password' && (
          <div className="flex justify-center gap-2 mb-6 mt-3">
            {['Enter Email', 'Authentication OTP', 'New Password '].map((label, i) => (
              <div key={i} className="flex items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                    forgotStep > i + 1
                      ? 'bg-green-500 text-white'
                      : forgotStep === i + 1
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {forgotStep > i + 1 ? '✓' : i + 1}
                </div>
                {i < 2 && (
                  <div className={`w-8 h-0.5 ${forgotStep > i + 1 ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            ))}
          </div>
        )}

        {view === 'register' && regStep === 1 && (
          <p className="text-center text-sm text-gray-500 mb-5">
            Fill in the information to create a new account
          </p>
        )}

        {view === 'register' && regStep === 2 && (
          <p className="text-center text-sm text-gray-500 mb-5">
            Enter the OTP sent to <span className="font-semibold text-gray-700">{email}</span>
          </p>
        )}

        {view === 'setup-password' && (
          <p className="text-center text-sm text-gray-500 mb-5">
            google account has been verified, please set up a Password to Login by email later
          </p>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm flex items-start gap-2">
            <span>✅</span>
            <span>{successMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {view === 'login' && (
            <>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="user@example.com"
                  disabled={isAnyPending}
                />
              </div>

              <div>
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder="••••••••"
                    disabled={isAnyPending}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>

                <div className="flex justify-end mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setView('forgot-password');
                      setForgotStep(1);
                      clearMessages();
                    }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    Forgot Passwordo
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isAnyPending} className={btnPrimary}>
                {loginMutation.isPending ? 'Login in progress' : 'Login'}
              </button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-3 bg-white text-gray-400">Or</span>
                </div>
              </div>

              <div className="flex justify-center">
                <GoogleLogin
                  onSuccess={(cr) => {
                    if (cr.credential) {
                      googleLoginMutation.mutate(cr.credential);
                    }
                  }}
                  onError={() => setError('Login Google Failed.')}
                  useOneTap
                  theme="outline"
                  size="large"
                  text="signin_with"
                  shape="rectangular"
                />
              </div>

              <p className="text-center mt-4 text-sm text-gray-500">
                None Account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setView('register');
                    clearMessages();
                    setRegStep(1);
                  }}
                  className={btnSecondary}
                >
                  Apply Now
                </button>
              </p>
            </>
          )}

          {view === 'register' && (
            <>
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputCls}
                  placeholder="user@example.com"
                  disabled={regStep === 2 || isAnyPending}
                />
              </div>

              <div>
                <label className={labelCls}>Full name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputCls}
                  placeholder="Nguyen Van A"
                  disabled={regStep === 2 || isAnyPending}
                />
              </div>

              <div>
                <label className={labelCls}>Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder="At least 6 characters"
                    disabled={regStep === 2 || isAnyPending}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls}>Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder="••••••••"
                    disabled={regStep === 2 || isAnyPending}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>

              {regStep === 1 && (
                <button type="submit" disabled={isAnyPending} className={btnPrimary}>
                  {registerMutation.isPending ? 'Sending OTPeee code' : 'Register & Obtain OTP'}
                </button>
              )}

              {regStep === 2 && (
                <div className="pt-4 border-t border-gray-200 space-y-3">
                  <div>
                    <label className={labelCls}>OTP Code (6 digits)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className={`${inputCls} flex-1 tracking-widest text-center text-lg font-bold`}
                        placeholder="123456"
                        maxLength={6}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => sendOtpMutation.mutate('REGISTER')}
                        disabled={sendOtpMutation.isPending}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-50"
                      >
                        {sendOtpMutation.isPending ? 'Sendingieee' : 'Deliver Again'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isAnyPending}
                    className={`${btnPrimary} !bg-green-600 hover:!bg-green-700`}
                  >
                    {verifyRegisterOtpMutation.isPending ? 'Confirming in progress' : 'Confirm & Finish'}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setRegStep(1);
                        clearMessages();
                      }}
                      className={btnGhost}
                    >
                      ← Edit Info
                    </button>
                  </div>
                </div>
              )}

              <p className="text-center text-sm text-gray-500">
                Already have an accounto{' '}
                <button type="button" onClick={() => goToLogin()} className={btnSecondary}>
                  Login
                </button>
              </p>
            </>
          )}

          {view === 'forgot-password' && (
            <>
              {forgotStep === 1 && (
                <>
                  <div>
                    <label className={labelCls}>Email Account</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputCls}
                      placeholder="user@example.com"
                      disabled={isAnyPending}
                    />
                  </div>

                  <button type="submit" disabled={isAnyPending} className={btnPrimary}>
                    {forgotMutation.isPending ? 'Sending OTPeee' : 'Send Confirmation Code'}
                  </button>
                </>
              )}

              {forgotStep === 2 && (
                <>
                  <div>
                    <label className={labelCls}>OTP Code (6 digits)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        className={`${inputCls} flex-1 tracking-widest text-center text-lg font-bold`}
                        placeholder="123456"
                        maxLength={6}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => sendOtpMutation.mutate('FORGOT_PASSWORD')}
                        disabled={sendOtpMutation.isPending}
                        className="px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium rounded-lg whitespace-nowrap disabled:opacity-50"
                      >
                        {sendOtpMutation.isPending ? 'Sendingieee' : 'Deliver Again'}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={isAnyPending} className={btnPrimary}>
                    {verifyForgotOtpMutation.isPending ? 'Validating...' : 'Authentication OTP'}
                  </button>

                  <div className="text-center">
                    <button
                      type="button"
                      onClick={() => {
                        setForgotStep(1);
                        setOtpCode('');
                        clearMessages();
                      }}
                      className={btnGhost}
                    >
                      Change email
                    </button>
                  </div>
                </>
              )}

              {forgotStep === 3 && (
                <>
                  <div>
                    <label className={labelCls}>New Password </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`${inputCls} pr-10`}
                        placeholder="At least 6 characters"
                        disabled={isAnyPending}
                        autoFocus
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={labelCls}>Confirm password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className={`${inputCls} pr-10`}
                        placeholder="••••••••"
                        disabled={isAnyPending}
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      >
                        {showConfirmPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                      </button>
                    </div>
                  </div>

                  <button type="submit" disabled={isAnyPending} className={btnPrimary}>
                    {resetPasswordMutation.isPending ? 'Ongoing...' : 'Confirm Password Change'}
                  </button>
                </>
              )}

              <div className="text-center">
                <button type="button" onClick={() => goToLogin()} className={btnGhost}>
                  ← Back to Login
                </button>
              </div>
            </>
          )}

          {view === 'setup-password' && (
            <>
              <div>
                <label className={labelCls}>New Password </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder="At least 6 characters"
                    disabled={isAnyPending}
                    autoFocus
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>

              <div>
                <label className={labelCls}>Confirm Password</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${inputCls} pr-10`}
                    placeholder="••••••••"
                    disabled={isAnyPending}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={isAnyPending} className={btnPrimary}>
                {setupPasswordMutation.isPending ? 'Setting up...' : 'Password Settings'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => navigateByRole(useAuthStore.getState().role || '')}
                  className={btnGhost}
                >
                  Skip, go to System →
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};