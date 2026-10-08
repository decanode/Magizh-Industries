import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import '../../styles/pageStyles/Stock/Master.css';

const Master = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);

  // Handle back button navigation - always redirect to master data page
  useEffect(() => {
    // Mark this page in history
    const currentState = { page: 'master', timestamp: Date.now() };
    window.history.replaceState(currentState, '', window.location.href);
    
    const handlePopState = (event) => {
      // When back button is pressed, navigate to master data page instead
      event.preventDefault();
      navigate('/master-data', { replace: true });
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [navigate]);

  // Debug: Log admin status
  useEffect(() => {
    console.log('Master component - isAdmin:', isAdmin);
  }, [isAdmin]);

  const masterOptions = [
    {
      title: 'Create Material',
      description: 'Create new material records',
      path: '/stock/create-master',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
      ),
      color: '#10b981'
    },
    {
      title: 'Change Material',
      description: 'Modify existing material records',
      path: '/stock/change-master',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
      ),
      color: '#3b82f6'
    },
    {
      title: 'Delete Material',
      description: 'Remove material records',
      path: '/stock/delete-master',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      ),
      color: '#ef4444'
    }
  ];

  return (
    <div className="master-wrapper">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar 
        title="Material Master Management" 
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
      />

      <div className="master-content">
        <div className="master-options-grid">
          {masterOptions
            .filter(option => {
              // Only show Delete Material to admin users
              if (option.title === 'Delete Material') {
                return isAdmin;
              }
              return true;
            })
            .map((option, index) => (
              <div
                key={index}
                className="master-option-card"
                onClick={() => navigate(option.path)}
                style={{ '--card-color': option.color }}
              >
                <div className="option-icon">{option.icon}</div>
                <h3 className="option-title">{option.title}</h3>
                <p className="option-description">{option.description}</p>
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

export default Master;
