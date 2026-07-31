const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'HelpdeskScreen.tsx');
let content = fs.readFileSync(filePath, 'utf-8');

// We need to add Dropdown, DownOutlined to imports
if (!content.includes('Dropdown')) {
    content = content.replace('Typography, Button, Badge, List, Tag, Select, FloatButton, Modal, message, Input', 'Typography, Button, Badge, List, Tag, Select, FloatButton, Modal, message, Input, Dropdown');
}
if (!content.includes('DownOutlined')) {
    content = content.replace('PlusOutlined, CreditCardOutlined, ArrowLeftOutlined', 'PlusOutlined, CreditCardOutlined, ArrowLeftOutlined, DownOutlined');
}

const old_mobile_categories = `              {/* Horizontal Scroll Categories */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide snap-x">
                {[
                  { id: 'ALL', label: 'Tất cả', count: ticketsData.length },
                  { id: 'CREATE_INCIDENT', label: 'Tạo Sự Cố' },
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
                    className={\`px-4 py-2 rounded-full cursor-pointer transition-all font-medium flex items-center gap-2 shrink-0 snap-start border \${selectedCategory === cat.id ? 'bg-blue-600 text-white border-blue-600 shadow-md' : 'bg-white text-gray-600 border-gray-200'}\`} 
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
              </div>`;

const old_desktop_sidebar = `      {/* Pane 1: Category Sidebar */}
      <div className={\`w-64 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden shrink-0\`}>
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center shrink-0">
          <Text strong className="text-gray-700 text-base">Phân loại sự cố</Text>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 pb-3">
          {[
            { id: 'ALL', label: 'Tất cả sự cố', icon: '📋', count: ticketsData.length },
            { id: 'CREATE_INCIDENT', label: 'Tạo Sự Cố Mới', icon: '➕', count: 0 },
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
               className={\`p-3 rounded-xl cursor-pointer transition-all font-medium flex justify-between items-center gap-3 shrink-0 \${selectedCategory === cat.id ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'text-gray-600 hover:bg-gray-100 border border-transparent hover:border-gray-200'}\`} 
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
      </div>`;

const new_categories = `
    const categories = [
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
    ];

    const dropdownMenuItems = categories.map(cat => ({
      key: cat.id,
      label: (
        <div className="flex justify-between items-center min-w-[200px] py-1">
          <div className="flex items-center gap-3">
            <span className="text-lg">{cat.icon}</span>
            <span className="font-medium text-gray-700">{cat.label}</span>
          </div>
          {cat.count > 0 && <Badge count={cat.count} style={{ backgroundColor: '#1890ff' }} />}
        </div>
      )
    }));

    const selectedCatData = categories.find(c => c.id === selectedCategory) || categories[0];
`;

const new_mobile_top_bar = `${new_categories}
              <div className="flex items-center justify-between mb-2">
                <Dropdown
                  menu={{ 
                    items: dropdownMenuItems, 
                    selectedKeys: [selectedCategory],
                    onClick: (e) => { setSelectedCategory(e.key); setSelectedTicket(null); }
                  }}
                  trigger={['click']}
                  placement="bottomLeft"
                >
                  <Button type="default" size="middle" className="flex items-center gap-2 border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 shadow-sm">
                    <span className="text-sm">{selectedCatData?.icon}</span>
                    <span className="font-medium">{selectedCatData?.label}</span>
                    {selectedCatData?.count > 0 && <Badge count={selectedCatData.count} className="ml-1" style={{ backgroundColor: '#1890ff' }} />}
                    <DownOutlined className="text-xs text-gray-400 ml-1" />
                  </Button>
                </Dropdown>
              </div>`;

const new_desktop_top_bar = `
    return (
      <div className="flex flex-col flex-1 h-full animate-fade-in bg-gray-100 overflow-hidden">
        {/* Top Action Bar */}
        <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm shrink-0">
          <div className="flex items-center gap-4">
            <Text strong className="text-gray-800 text-lg m-0">Yêu cầu hỗ trợ</Text>
            <div className="w-px h-6 bg-gray-300 mx-2"></div>
            <Dropdown
              menu={{ 
                items: dropdownMenuItems, 
                selectedKeys: [selectedCategory],
                onClick: (e) => { setSelectedCategory(e.key); setSelectedTicket(null); }
              }}
              trigger={['click']}
              placement="bottomLeft"
            >
              <Button type="default" size="large" className="flex items-center gap-2 border-gray-300 rounded-lg hover:border-blue-400 hover:text-blue-600 shadow-sm">
                <span className="text-base">{selectedCatData?.icon}</span>
                <span className="font-medium">{selectedCatData?.label}</span>
                {selectedCatData?.count > 0 && <Badge count={selectedCatData.count} className="ml-1" style={{ backgroundColor: '#1890ff' }} />}
                <DownOutlined className="text-xs text-gray-400 ml-2" />
              </Button>
            </Dropdown>
          </div>
          <Button 
            type="primary" 
            icon={<PlusOutlined />} 
            size="large"
            className="rounded-lg shadow-sm font-medium"
            onClick={() => { setSelectedCategory('CREATE_INCIDENT'); setSelectedTicket(null); }}
          >
            Tạo yêu cầu mới
          </Button>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-row flex-1 p-4 gap-4 overflow-hidden">`;

content = content.replace(old_mobile_categories, new_mobile_top_bar);
content = content.replace(old_desktop_sidebar, '');

if (content.includes('const renderDesktopView = () => (')) {
    content = content.replace('const renderDesktopView = () => (', 'const renderDesktopView = () => { ' + new_categories + new_desktop_top_bar);
    content = content.replace('      </div>\n    </div>\n  );', '      </div>\n    </div>\n    </div>\n  ); }');
}

fs.writeFileSync(filePath, content, 'utf-8');
console.log('Success');
