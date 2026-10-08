import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { ClipboardList, Truck, FileText, ArrowRight } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import '../../styles/pageStyles/Stock.css';

// Sales landing page. Deliveries, invoices and payments get their cards here as they are built.
const Sales = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  const modules = [
    {
      title: 'Sales Orders',
      description: 'Create and manage customer sales orders',
      path: '/sales/orders',
      icon: <ClipboardList size={40} strokeWidth={2} />
    },
    {
      title: 'Deliveries',
      description: 'Delivery challans, transport details and costing confirmation',
      path: '/sales/deliveries',
      icon: <Truck size={40} strokeWidth={2} />
    },
    {
      title: 'Invoices',
      description: 'Tax invoices, due dates and overdue payments',
      path: '/sales/invoices',
      icon: <FileText size={40} strokeWidth={2} />
    }
  ];

  return (
    <div className="stock-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Sales" onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="main-content page-with-navbar">
        <div id="content-wrapper-stock">
          {modules.map((module) => (
            <div key={module.path} className="stock-option-card" onClick={() => navigate(module.path)}>
              <div className="option-icon">{module.icon}</div>
              <h3 className="option-title">{module.title}</h3>
              <p className="option-description">{module.description}</p>
              <div className="option-arrow">
                <ArrowRight size={20} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Sales;
