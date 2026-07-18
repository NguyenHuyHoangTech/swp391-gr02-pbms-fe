/**
 * @Author: Thái Tân Phú
 * @Date: 2026-07-19
 * @Description: Component hiển thị đồng hồ thời gian thực của hệ thống.
 * Tự động đồng bộ với Backend và cập nhật mỗi giây.
 * @Dependencies: 
 * - useSystemTime (Hook quản lý thời gian từ timeProvider)
 * - antd (Thư viện UI)
 */
import React, { useState, useEffect } from 'react';
import { Typography } from 'antd';
import { ClockCircleOutlined } from '@ant-design/icons';
import { useSystemTime } from '../../../core/utils/timeProvider';

const { Text } = Typography;

/**
 * @Function: SystemClock
 * @Description: Hiển thị đồng hồ hệ thống bao gồm giờ, phút, giây và ngày tháng.
 * @Logic_Steps:
 * 1. Gọi hook useSystemTime() để lấy thời gian hiện tại (đã được đồng bộ với server).
 * 2. Render giao diện với icon đồng hồ, chuỗi thời gian (HH:mm:ss) và ngày tháng (DD/MM/YYYY).
 * 3. Component sẽ tự động re-render mỗi giây do hook useSystemTime thay đổi state.
 * 
 * @returns {JSX.Element} Khối giao diện đồng hồ
 */
export const SystemClock: React.FC = () => {
  const time = useSystemTime();

  return (
    <div className="flex items-center space-x-2 px-3 py-1 bg-slate-100 rounded-lg border border-slate-200">
      <ClockCircleOutlined className="text-blue-600" />
      <Text strong className="text-slate-700 font-mono tracking-wide">
        {time.format('HH:mm:ss')}
      </Text>
      <Text className="text-slate-500 text-xs hidden sm:inline-block ml-1">
        {time.format('DD/MM/YYYY')}
      </Text>
    </div>
  );
};
