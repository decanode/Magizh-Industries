import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import AuthPage from './src/pages/Login.jsx';
import Home from './src/pages/home.jsx';
import Stock from './src/pages/Stock.jsx';
import Master from './src/pages/Stock/Master.jsx';
import CreateMaster from './src/pages/Stock/CreateMaster.jsx';
import ChangeMaster from './src/pages/Stock/ChangeMaster.jsx';
import DeleteMaster from './src/pages/Stock/DeleteMaster.jsx';
import ArchivedMaster from './src/pages/Stock/ArchivedMaster.jsx';
import Entry from './src/pages/Stock/Entry.jsx';
import EntryStock from './src/pages/Stock/EntryStock.jsx';
import Report from './src/pages/Stock/Report.jsx';
import Dispatch from './src/pages/Stock/Dispatch.jsx';
import LogTable from './src/pages/Stock/LogTable.jsx';
import FinalData from './src/pages/Stock/FinalData.jsx';
import EmployeeList from './src/pages/Employees/EmployeeList.jsx';
import EmployeeForm from './src/pages/Employees/EmployeeForm.jsx';
import TimesheetDay from './src/pages/Timesheet/TimesheetDay.jsx';
import Dashboard from './src/pages/Dashboard/Dashboard.jsx';
import PayslipList from './src/pages/Payslips/PayslipList.jsx';

// Helper function to decode JWT and get user role
const getUserRole = () => {
  try {
    const user = sessionStorage.getItem('user');
    if (user) {
      const parsedUser = JSON.parse(user);
      return parsedUser.role || 'employee';
    }
    return null;
  } catch (error) {
    console.error('Error parsing user data:', error);
    return null;
  }
};

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const token = sessionStorage.getItem('token');
  const userRole = getUserRole();

  if (!token || !userRole) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Admin-only routes. The backend enforces this too, so this only keeps employees off the screen.
const AdminRoute = ({ children }) => {
  if (getUserRole() !== 'admin') {
    return <Navigate to="/home" replace />;
  }

  return children;
};

function App() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Check user role on mount and when storage changes
    const checkUserRole = () => {
      const role = getUserRole();
      setIsAdmin(role === 'admin');
    };

    // Initial check
    checkUserRole();

    // Listen for storage changes (login/logout)
    window.addEventListener('storage', checkUserRole);
    
    // Also check on focus (when user returns to tab)
    window.addEventListener('focus', checkUserRole);

    // Set up an interval to periodically check (as a fallback)
    const interval = setInterval(checkUserRole, 1000);

    return () => {
      window.removeEventListener('storage', checkUserRole);
      window.removeEventListener('focus', checkUserRole);
      clearInterval(interval);
    };
  }, []);

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route
          path="/home"
          element={
            <ProtectedRoute>
              <Home isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <Stock isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/master"
          element={
            <ProtectedRoute>
              <Master isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/create-master"
          element={
            <ProtectedRoute>
              <CreateMaster isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/change-master"
          element={
            <ProtectedRoute>
              <ChangeMaster isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/delete-master"
          element={
            <ProtectedRoute>
              <DeleteMaster isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/archived-master"
          element={
            <ProtectedRoute>
              <ArchivedMaster isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/entry"
          element={
            <ProtectedRoute>
              <Entry isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/entry-stock"
          element={
            <ProtectedRoute>
              <EntryStock isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/report"
          element={
            <ProtectedRoute>
              <Report isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/dispatch"
          element={
            <ProtectedRoute>
              <Dispatch isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/log"
          element={
            <ProtectedRoute>
              <LogTable isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/stock/final-data"
          element={
            <ProtectedRoute>
              <FinalData isAdmin={isAdmin} />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <EmployeeList isAdmin={isAdmin} />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees/new"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <EmployeeForm isAdmin={isAdmin} />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <EmployeeForm isAdmin={isAdmin} />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheet"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <TimesheetDay isAdmin={isAdmin} />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/payslips"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <PayslipList isAdmin={isAdmin} />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AdminRoute>
                <Dashboard isAdmin={isAdmin} />
              </AdminRoute>
            </ProtectedRoute>
          }
        />
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
