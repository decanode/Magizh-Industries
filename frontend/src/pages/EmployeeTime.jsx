import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Users, CalendarCheck, Receipt, LayoutDashboard } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import '../styles/pageStyles/Stock.css';

const EmployeeTime = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Handle back button navigation - always redirect to home
  useEffect(() => {
    // Mark this page in history
    const currentState = { page: 'employee-time', timestamp: Date.now() };
    window.history.replaceState(currentState, '', window.location.href);
    
    const handlePopState = (event) => {
      // When back button is pressed, navigate to home instead
      event.preventDefault();
      navigate('/home', { replace: true });
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  const handleMenuClick = () => {
    setSidebarExpanded(!sidebarExpanded);
  };

  const modules = [
    {
      title: 'Employees',
      description: 'Manage employee records',
      path: '/employees',
      icon: <Users size={40} strokeWidth={2} />
    },
    {
      title: 'Timesheet',
      description: 'Daily attendance and working hours',
      path: '/timesheet',
      icon: <CalendarCheck size={40} strokeWidth={2} />
    },
    {
      title: 'Payslips',
      description: 'Generate and view payslips',
      path: '/payslips',
      icon: <Receipt size={40} strokeWidth={2} />
    },
    {
      title: 'Dashboard',
      description: 'Employee and payroll overview',
      path: '/dashboard',
      icon: <LayoutDashboard size={40} strokeWidth={2} />
    }
  ];

  return (
    <div className="stock-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Employee and Time" onMenuClick={handleMenuClick} />

      <div className="main-content page-with-navbar">
        <div id="content-wrapper-stock">
          {modules.map((module, index) => (
            <div
              key={index}
              className="stock-option-card"
              onClick={() => navigate(module.path)}
            >
              <div className="option-icon">{module.icon}</div>
              <h3 className="option-title">{module.title}</h3>
              <p className="option-description">{module.description}</p>
              <div className="option-arrow">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default EmployeeTime;
