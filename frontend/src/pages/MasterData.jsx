import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { Contact, Truck } from 'lucide-react';
import Sidebar from '../components/Sidebar';
import Navbar from '../components/Navbar';
import '../styles/pageStyles/Stock.css';

const MasterData = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Handle back button navigation - always redirect to home
  useEffect(() => {
    // Mark this page in history
    const currentState = { page: 'master-data', timestamp: Date.now() };
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

  const masterModules = [
    {
      title: 'Material Master',
      description: 'Manage material master data',
      path: '/stock/master',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline>
          <polyline points="7.5 19.79 7.5 14.6 3 12"></polyline>
          <polyline points="21 12 16.5 14.6 16.5 19.79"></polyline>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      )
    },
    {
      title: 'Customer Master',
      description: 'Manage customer master data',
      path: '/master-data/customer',
      icon: <Contact size={40} strokeWidth={2} />
    },
    {
      title: 'Supplier Master',
      description: 'Manage supplier master data',
      path: '/master-data/supplier',
      icon: <Truck size={40} strokeWidth={2} />
    }
  ];

  return (
    <div className="stock-container">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title="Master Data" onMenuClick={handleMenuClick} />

      <div className="main-content page-with-navbar">
        <div id="content-wrapper-stock">
          {masterModules.map((module, index) => (
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

export default MasterData;
