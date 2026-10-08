import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Package, LogOut, Warehouse, Users, Database, ShoppingCart } from 'lucide-react';
import '../styles/componentStyles/Sidebar.css';

// Not every page passes isAdmin, so also read the role from the saved session.
const isAdminSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem('user') || 'null')?.role === 'admin';
  } catch {
    return false;
  }
};

const Sidebar = ({ isAdmin = false, isExpanded, onToggle }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const showAdminItems = isAdmin || isAdminSession();

  const menuItems = [
    { name: 'Home', icon: Home, path: '/home' },
    { name: 'Master Data', icon: Database, path: '/master-data' },
    { name: 'Stock', icon: Package, path: '/stock' },
    { name: 'Sales', icon: ShoppingCart, path: '/sales', adminOnly: true, children: ['/sales'] },
    { name: 'Employee and Time', icon: Users, path: '/employee-time', adminOnly: true, children: ['/employees', '/timesheet', '/payslips', '/dashboard'] },
  ].filter((item) => !item.adminOnly || showAdminItems);

  const handleNavigation = (path) => {
    navigate(path);
    if (onToggle) onToggle(false);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    navigate('/login');
  };

  const handleMouseLeave = () => {
    if (onToggle && isExpanded) {
      onToggle(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      {isExpanded && <div className="sidebar-overlay" onClick={() => onToggle && onToggle(false)}></div>}

      {/* Sidebar */}
      <div 
        className={`sidebar ${isExpanded ? 'expanded' : ''}`}
        onMouseLeave={handleMouseLeave}
      >
        {/* Company Header */}
        <div className="sidebar-header">
          <Warehouse className="sidebar-logo" size={28} />
          <span className="sidebar-company-name">Magizh Industries</span>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path ||
              (item.children || []).some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));

            return (
              <button
                key={item.name}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigation(item.path)}
              >
                <Icon className="nav-icon" size={22} />
                <span className="nav-text">{item.name}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button className="logout-btn" onClick={handleLogout}>
            <LogOut className="nav-icon" size={22} />
            <span className="nav-text">Logout</span>
          </button>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
