// Author: Võ Trung Hiếu
import { useEffect, useState } from 'react';
import { Card, Typography, Button, InputNumber, Form, message, Alert } from 'antd';
import { SaveOutlined, WarningOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axiosClient from '../../core/api/axiosClient';

const { Title, Text } = Typography;

export const PenaltyConfigScreen = () => {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [isDirty, setIsDirty] = useState(false);

  // QUERY: GET /api/v1/system/configs
  const { data: configsData = [], isLoading } = useQuery({
    queryKey: ['system_configs'],
    queryFn: async () => {
      const res = await axiosClient.get('/system/configs');
      return res.data?.data || [];
    },
  });

  // Load configs into form when data is ready
  useEffect(() => {
    if (configsData && configsData.length > 0) {
      form.setFieldsValue({
        PENALTY_LOST_CARD: getInitialValue('PENALTY_LOST_CARD', 200000),
        PENALTY_DAMAGED_CARD: getInitialValue('PENALTY_DAMAGED_CARD', 50000),
        PENALTY_ZONE_VIOLATION_2W: getInitialValue('PENALTY_ZONE_VIOLATION_2W', 50000),
        PENALTY_ZONE_VIOLATION_4W: getInitialValue('PENALTY_ZONE_VIOLATION_4W', 100000),
        PENALTY_BLACKLIST_UNPAID_2W: getInitialValue('PENALTY_BLACKLIST_UNPAID_2W', 100000),
        PENALTY_BLACKLIST_UNPAID_4W: getInitialValue('PENALTY_BLACKLIST_UNPAID_4W', 200000),
      });
    }
  }, [configsData, form]);

  const getInitialValue = (key: string, fallback: number) => {
    if (!configsData || configsData.length === 0) return fallback;
    const config = configsData.find((c: any) => c.configKey === key);
    return config ? Number(config.configValue) : fallback;
  };

  // MUTATION: Save configs
  const updateConfigMutation = useMutation({
    mutationFn: async (values: any) => {
      const promises = [];
      for (const key of Object.keys(values)) {
        const existingConfig = configsData.find((c: any) => c.configKey === key);
        if (existingConfig) {
           promises.push(axiosClient.put(`/system/configs/${existingConfig.id}`, {
             configKey: key,
             configValue: values[key].toString(),
             description: existingConfig.description
           }));
        } else {
           promises.push(axiosClient.post(`/system/configs`, {
             configKey: key,
             configValue: values[key].toString(),
             description: 'Penalty Configuration'
           }));
        }
      }
      await Promise.all(promises);
    },
    onSuccess: () => {
      message.success('Penalty configurations updated successfully!');
      queryClient.invalidateQueries({ queryKey: ['system_configs'] });
      setIsDirty(false);
    },
    onError: () => {
      message.error('Failed to update penalty configurations.');
    }
  });

  const onFinish = (values: any) => {
    updateConfigMutation.mutate(values);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-6 h-full flex flex-col bg-slate-50">
      <div className="mb-6 flex justify-between items-center">
        <div>
          <Title level={2} className="m-0 text-slate-800">Penalty Configuration</Title>
          <Text type="secondary">Manage standard penalty fees applied to operational incidents.</Text>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto">
          <Card className="rounded-xl shadow-sm border border-gray-100" bodyStyle={{ padding: '24px 32px' }}>
            <Alert 
              type="warning" 
              showIcon 
              icon={<WarningOutlined />} 
              message="Important" 
              description="Changes to these fees will immediately take effect for all new incidents processed by staff at the Exception Desk."
              className="mb-6"
            />

            <Form
              form={form}
              layout="vertical"
              onFinish={onFinish}
              onValuesChange={() => setIsDirty(true)}
              size="large"
              initialValues={{
                PENALTY_LOST_CARD: getInitialValue('PENALTY_LOST_CARD', 200000),
                PENALTY_DAMAGED_CARD: getInitialValue('PENALTY_DAMAGED_CARD', 50000),
                PENALTY_ZONE_VIOLATION_2W: getInitialValue('PENALTY_ZONE_VIOLATION_2W', 50000),
                PENALTY_ZONE_VIOLATION_4W: getInitialValue('PENALTY_ZONE_VIOLATION_4W', 100000),
                PENALTY_BLACKLIST_UNPAID_2W: getInitialValue('PENALTY_BLACKLIST_UNPAID_2W', 100000),
                PENALTY_BLACKLIST_UNPAID_4W: getInitialValue('PENALTY_BLACKLIST_UNPAID_4W', 200000),
              }}
            >
              <Form.Item 
                name="PENALTY_LOST_CARD" 
                label={<span className="font-bold text-slate-700">Lost Card Penalty Fee (VND)</span>}
                help="Applied when a customer loses their parking card."
                rules={[{ required: true, message: 'Please enter the lost card penalty fee' }]}
              >
                <InputNumber
                  className="w-full"
                  min={0}
                  step={10000}
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value: any) => (value ? Number(value.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                />
              </Form.Item>

              <Form.Item 
                name="PENALTY_DAMAGED_CARD" 
                label={<span className="font-bold text-slate-700">Damaged Card Penalty Fee (VND)</span>}
                help="Applied when a customer damages their parking card (customer's fault)."
                rules={[{ required: true, message: 'Please enter the damaged card penalty fee' }]}
              >
                <InputNumber
                  className="w-full"
                  min={0}
                  step={5000}
                  formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  parser={(value: any) => (value ? Number(value.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                />
              </Form.Item>

              <div className="flex gap-4">
                <Form.Item 
                  name="PENALTY_ZONE_VIOLATION_2W" 
                  label={<span className="font-bold text-slate-700">Wrong Zone Penalty (2-Wheeler)</span>}
                  help="For motorbikes/bicycles in unauthorized zones."
                  rules={[{ required: true, message: 'Please enter fee' }]}
                  className="flex-1"
                >
                  <InputNumber
                    className="w-full"
                    min={0}
                    step={5000}
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value: any) => (value ? Number(value.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                  />
                </Form.Item>
                <Form.Item 
                  name="PENALTY_ZONE_VIOLATION_4W" 
                  label={<span className="font-bold text-slate-700">Wrong Zone Penalty (4-Wheeler)</span>}
                  help="For cars/trucks in unauthorized zones."
                  rules={[{ required: true, message: 'Please enter fee' }]}
                  className="flex-1"
                >
                  <InputNumber
                    className="w-full"
                    min={0}
                    step={5000}
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value: any) => (value ? Number(value.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                  />
                </Form.Item>
              </div>

              <div className="flex gap-4">
                <Form.Item 
                  name="PENALTY_BLACKLIST_UNPAID_2W" 
                  label={<span className="font-bold text-slate-700">Unpaid Penalty (Blacklist 2W)</span>}
                  help="Blacklisted 2-wheeler unpaid fee."
                  rules={[{ required: true, message: 'Please enter fee' }]}
                  className="flex-1"
                >
                  <InputNumber
                    className="w-full"
                    min={0}
                    step={10000}
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value: any) => (value ? Number(value.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                  />
                </Form.Item>
                <Form.Item 
                  name="PENALTY_BLACKLIST_UNPAID_4W" 
                  label={<span className="font-bold text-slate-700">Unpaid Penalty (Blacklist 4W)</span>}
                  help="Blacklisted 4-wheeler unpaid fee."
                  rules={[{ required: true, message: 'Please enter fee' }]}
                  className="flex-1"
                >
                  <InputNumber
                    className="w-full"
                    min={0}
                    step={10000}
                    formatter={value => `${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={(value: any) => (value ? Number(value.replace(/\$\s?|(,*)/g, '')) : 0) as any}
                  />
                </Form.Item>
              </div>

              <div className="mt-8 flex justify-end">
                <Button 
                  type="primary" 
                  htmlType="submit" 
                  icon={<SaveOutlined />} 
                  loading={updateConfigMutation.isPending}
                  disabled={!isDirty}
                  className="bg-blue-600 w-32"
                >
                  Save Changes
                </Button>
              </div>
            </Form>
          </Card>
        </div>
      </div>
    </div>
  );
};
