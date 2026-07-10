/**
 * Chức năng của file:
 * UserProfileSettingsModal là modal cài đặt tài khoản người dùng trong hệ thống PBMS.
 * File này cho phép người dùng xem email đăng nhập, cập nhật tên hiển thị,
 * kiểm tra trạng thái liên kết Google và tạo hoặc đổi mật khẩu.
 *
 * Liên quan backend:
 * - axiosClient gửi request có Authorization Bearer token lên backend.
 * - JwtAuthFilter bên backend xác thực token trong request.
 * - SecurityConfig bên backend kiểm tra quyền truy cập API.
 * - ApiResponse là format response backend trả về cho frontend.
 * - GlobalExceptionHandler trả message lỗi để frontend hiển thị bằng message.error().
 *
 * Pseudo code:
 * 1. Nhận trạng thái mở modal từ component cha.
 * 2. Lấy thông tin user hiện tại từ useAuthStore.
 * 3. Khi modal mở, đổ dữ liệu email và name vào form.
 * 4. Cho phép user cập nhật display name.
 * 5. Cho phép user xem trạng thái liên kết Google.
 * 6. Cho phép user tạo password nếu chưa có password.
 * 7. Cho phép user đổi password nếu đã có password.
 * 8. Gọi backend qua axiosClient.
 * 9. Nếu backend xử lý thành công thì cập nhật useAuthStore.
 * 10. Nếu backend trả lỗi thì hiển thị lỗi cho user.
 */

import React, { useState, useEffect } from 'react';
import { Modal, Form, Input, Button, Tabs, message, Typography, Divider, Alert } from 'antd';
import {
  UserOutlined,
  LockOutlined,
  GoogleOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '../../../core/store/useAuthStore';
import { useMutation } from '@tanstack/react-query';
import axiosClient from '../../../core/api/axiosClient';

const { Title, Text } = Typography;

/**
 * Props của UserProfileSettingsModal.
 *
 * Pseudo code:
 * 1. isOpen quyết định modal có được hiển thị hay không.
 * 2. onClose được gọi khi user đóng modal.
 */
interface UserProfileSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Modal quản lý cài đặt tài khoản người dùng.
 * Component này xử lý cập nhật hồ sơ, trạng thái liên kết Google và quản lý mật khẩu.
 *
 * API backend được gọi:
 * - PUT /identity/auth/profile: cập nhật tên hiển thị.
 * - POST /identity/auth/link-google: liên kết Google với tài khoản hiện tại.
 * - POST /identity/auth/reset-password: tạo hoặc đổi mật khẩu.
 *
 * Pseudo code:
 * 1. Khởi tạo form thông tin cá nhân và form mật khẩu.
 * 2. Lấy email, name, authProvider và hasPassword từ useAuthStore.
 * 3. Khi modal mở, reset dữ liệu form và quay về tab đầu tiên.
 * 4. Gửi request cập nhật profile khi user submit form thông tin cá nhân.
 * 5. Gửi request liên kết Google khi có Google credential.
 * 6. Gửi request tạo hoặc đổi mật khẩu khi user submit form bảo mật.
 * 7. Cập nhật local store nếu backend xử lý thành công.
 * 8. Hiển thị thông báo thành công hoặc thất bại.
 */
export const UserProfileSettingsModal: React.FC<UserProfileSettingsModalProps> = ({ isOpen, onClose }) => {
  const [form] = Form.useForm();
  const [pwdForm] = Form.useForm();

  const email = useAuthStore((state) => state.email);
  const name = useAuthStore((state) => state.name);
  const authProvider = useAuthStore((state) => state.authProvider);
  const hasPassword = useAuthStore((state) => state.hasPassword);

  const updateProfile = useAuthStore((state) => state.updateProfile);
  const linkGoogleAccount = useAuthStore((state) => state.linkGoogleAccount);
  const createPassword = useAuthStore((state) => state.createPassword);

  const [activeTab, setActiveTab] = useState('1');

  /**
   * Đồng bộ dữ liệu form mỗi khi modal được mở.
   *
   * Pseudo code:
   * 1. Kiểm tra modal có đang mở hay không.
   * 2. Nếu modal mở thì gán name và email hiện tại vào form thông tin cá nhân.
   * 3. Reset form mật khẩu.
   * 4. Đưa modal về tab thông tin cá nhân.
   */
  useEffect(() => {
    if (isOpen) {
      form.setFieldsValue({
        name: name || '',
        email: email || '',
      });
      pwdForm.resetFields();
      setActiveTab('1');
    }
  }, [isOpen, name, email, form, pwdForm]);

  /**
   * Gọi API cập nhật thông tin cá nhân.
   *
   * Backend xử lý:
   * 1. JwtAuthFilter xác thực user hiện tại bằng token.
   * 2. Controller nhận tên hiển thị mới.
   * 3. Service cập nhật thông tin user trong database.
   * 4. Backend trả response thành công hoặc lỗi.
   *
   * Pseudo code:
   * 1. Gửi name mới lên backend.
   * 2. Nếu thành công thì cập nhật name trong useAuthStore.
   * 3. Hiển thị thông báo cập nhật thành công.
   * 4. Nếu thất bại thì hiển thị message lỗi từ backend.
   */
  const updateProfileMutation = useMutation({
    mutationFn: async (values: any) => {
      const response = await axiosClient.put('/identity/auth/profile', { name: values.name });
      return response.data;
    },
    onSuccess: (_, variables) => {
      updateProfile(variables.name);
      message.success({ content: 'Update successful!', key: 'profile', duration: 2 });
    },
    onError: (error: any) => {
      message.error({
        content: error.response?.data?.message || 'Error when updating profile',
        key: 'profile',
        duration: 3,
      });
    },
  });

  /**
   * Xử lý submit form cập nhật thông tin cá nhân.
   *
   * Pseudo code:
   * 1. Hiển thị trạng thái đang lưu.
   * 2. Gọi updateProfileMutation để gửi dữ liệu lên backend.
   */
  const handleUpdateProfile = (values: any) => {
    message.loading({ content: 'Saving...', key: 'profile' });
    updateProfileMutation.mutate(values);
  };

  /**
   * Gọi API liên kết tài khoản Google với tài khoản hiện tại.
   *
   * Backend xử lý:
   * 1. JwtAuthFilter xác thực user hiện tại bằng token.
   * 2. Backend nhận googleIdToken từ frontend.
   * 3. Backend xác thực googleIdToken với Google.
   * 4. Backend liên kết Google account với user hiện tại.
   * 5. Backend trả response thành công hoặc lỗi.
   *
   * Pseudo code:
   * 1. Nhận Google credential.
   * 2. Gửi credential lên backend.
   * 3. Nếu thành công thì cập nhật authProvider trong useAuthStore thành GOOGLE.
   * 4. Nếu thất bại thì hiển thị message lỗi từ backend.
   */
  const linkGoogleMutation = useMutation({
    mutationFn: async (credential: string) => {
      const response = await axiosClient.post('/identity/auth/link-google', { googleIdToken: credential });
      return response.data;
    },
    onSuccess: () => {
      message.success({ content: 'Link your Google Success account!', key: 'google', duration: 2 });
      linkGoogleAccount();
    },
    onError: (error: any) => {
      message.error({
        content: error.response?.data?.message || 'Error when linking Google',
        key: 'google',
        duration: 3,
      });
    },
  });

  /**
   * Gọi API tạo mật khẩu hoặc đổi mật khẩu.
   *
   * Backend xử lý:
   * 1. JwtAuthFilter xác thực user hiện tại bằng token.
   * 2. Backend nhận newPassword và confirmPassword.
   * 3. Backend kiểm tra rule của mật khẩu.
   * 4. Backend mã hóa mật khẩu bằng PasswordEncoder.
   * 5. Backend lưu mật khẩu mới vào database.
   * 6. Backend trả response thành công hoặc lỗi.
   *
   * Pseudo code:
   * 1. Gửi newPassword và confirmPassword lên backend.
   * 2. Nếu user chưa có password thì cập nhật hasPassword trong useAuthStore thành true.
   * 3. Nếu user đã có password thì chỉ hiển thị đổi mật khẩu thành công.
   * 4. Reset form mật khẩu.
   * 5. Nếu thất bại thì hiển thị message lỗi từ backend.
   */
  const changePasswordMutation = useMutation({
    mutationFn: async (values: any) => {
      const response = await axiosClient.post('/identity/auth/reset-password', {
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      return response.data;
    },
    onSuccess: () => {
      if (!hasPassword) {
        createPassword();
        message.success({ content: 'New Password created Success!', key: 'pwd', duration: 2 });
      } else {
        message.success({ content: 'Change Password Success!', key: 'pwd', duration: 2 });
      }
      pwdForm.resetFields();
    },
    onError: (error: any) => {
      message.error({
        content: error.response?.data?.message || 'Error when changing Password',
        key: 'pwd',
        duration: 3,
      });
    },
  });

  /**
   * Xử lý submit form tạo hoặc đổi mật khẩu.
   *
   * Pseudo code:
   * 1. So sánh newPassword và confirmPassword.
   * 2. Nếu không khớp thì hiển thị lỗi.
   * 3. Nếu khớp thì hiển thị trạng thái đang xử lý.
   * 4. Gọi changePasswordMutation để gửi dữ liệu lên backend.
   */
  const handleChangePassword = (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      return message.error('Password Confirm does not match!');
    }

    message.loading({ content: 'Processingeee', key: 'pwd' });
    changePasswordMutation.mutate(values);
  };

  return (
    <Modal
      title={<span className="text-xl font-bold">Settings Account</span>}
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width={500}
      destroyOnClose
    >
      <Tabs activeKey={activeTab} onChange={setActiveTab} className="mt-4">
        <Tabs.TabPane tab={<span><UserOutlined />File</span>} key="1">
          <Form form={form} layout="vertical" onFinish={handleUpdateProfile} className="mt-2">
            <Form.Item label="Email Login">
              <Input disabled value={email || ''} className="bg-gray-50 text-gray-500" />
            </Form.Item>

            <Form.Item
              name="name"
              label="Display name"
              rules={[{ required: true, message: 'Please enter a display name!' }]}
            >
              <Input placeholder="Enter your name" size="large" />
            </Form.Item>

            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} size="large" className="w-full mt-2">
              Save Changes
            </Button>
          </Form>
        </Tabs.TabPane>

        <Tabs.TabPane tab={<span><SafetyCertificateOutlined />Security & Links</span>} key="2">
          <div className="mt-2 space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="flex justify-between items-center mb-2">
                <Text strong className="text-gray-700">Google link status:</Text>
                {authProvider === 'GOOGLE' ? (
                  <span className="text-green-600 font-bold text-sm bg-green-100 px-2 py-1 rounded">Linked</span>
                ) : (
                  <span className="text-gray-500 text-sm">Not linked yet</span>
                )}
              </div>

              {authProvider !== 'GOOGLE' ? (
                <>
                  <Text className="text-xs text-gray-500 block mb-3">
                    To link your Google account, simply log out and use the "Login with Google" button with the email: {email}
                  </Text>
                </>
              ) : (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <GoogleOutlined className="text-red-500" />
                  <Text>This account is using Login via Google</Text>
                </div>
              )}
            </div>

            <Divider className="my-0" />

            <div>
              <Title level={5} className="mb-4">
                <LockOutlined className="mr-2 text-blue-500" />
                {hasPassword ? 'Change Password' : 'Create Password Login'}
              </Title>

              {!hasPassword && (
                <Alert
                  type="info"
                  showIcon
                  className="mb-4"
                  message="You don't have a Password yet"
                  description="You are Login with Google. Please create a Password so you can Log in directly by Email without going through Google."
                />
              )}

              <Form form={pwdForm} layout="vertical" onFinish={handleChangePassword}>
                {hasPassword && (
                  <Form.Item
                    name="oldPassword"
                    label="Current password"
                    rules={[{ required: true, message: 'Enter current Password' }]}
                  >
                    <Input.Password placeholder="Enter old Passwordeee" />
                  </Form.Item>
                )}

                <Form.Item
                  name="newPassword"
                  label="New Password "
                  rules={[
                    { required: true, message: 'Enter new Password' },
                    {
                      pattern: /^(?=.*[0-9])(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&+=!_]).{8,20}$/,
                      message: 'Password must be 8-20 characters, including uppercase letters, lowercase letters, numbers and special characters',
                    },
                  ]}
                >
                  <Input.Password placeholder="Enter new Passwordeee" />
                </Form.Item>

                <Form.Item
                  name="confirmPassword"
                  label="Confirm password"
                  rules={[{ required: true, message: 'Confirm new Password' }]}
                >
                  <Input.Password placeholder="Re-enter the new Password" />
                </Form.Item>

                <Button type="primary" htmlType="submit" className="w-full">
                  {hasPassword ? 'Change Password' : 'Create Password'}
                </Button>
              </Form>
            </div>
          </div>
        </Tabs.TabPane>
      </Tabs>
    </Modal>
  );
};