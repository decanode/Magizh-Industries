import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { useState } from 'react';
import { FilePlus, FilePen, Trash2, ArrowRight } from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import { PARTY_TYPES } from './partyConfig';
import '../../styles/pageStyles/Stock/Master.css';

// Landing page for one party master: Create / Change / Delete cards.
const PartyMaster = ({ isAdmin = false }) => {
  const navigate = useNavigate();
  const { type } = useParams();
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const party = PARTY_TYPES[type];

  if (!party) return <Navigate to="/master-data" replace />;

  const options = [
    {
      title: `Create ${party.label}`,
      description: `Create new ${party.label.toLowerCase()} records`,
      path: `${party.route}/create`,
      icon: <FilePlus size={40} strokeWidth={2} />,
      color: '#10b981'
    },
    {
      title: `Change ${party.label}`,
      description: `Modify existing ${party.label.toLowerCase()} records`,
      path: `${party.route}/change`,
      icon: <FilePen size={40} strokeWidth={2} />,
      color: '#3b82f6'
    },
    {
      title: `Delete ${party.label}`,
      description: `Remove ${party.label.toLowerCase()} records`,
      path: `${party.route}/delete`,
      icon: <Trash2 size={40} strokeWidth={2} />,
      color: '#ef4444',
      adminOnly: true
    }
  ].filter((option) => !option.adminOnly || isAdmin);

  return (
    <div className="master-wrapper">
      <Sidebar isAdmin={isAdmin} isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar title={`${party.label} Master Management`} onMenuClick={() => setSidebarExpanded(!sidebarExpanded)} />

      <div className="master-content">
        <div className="master-options-grid">
          {options.map((option) => (
            <div
              key={option.path}
              className="master-option-card"
              onClick={() => navigate(option.path)}
              style={{ '--card-color': option.color }}
            >
              <div className="option-icon">{option.icon}</div>
              <h3 className="option-title">{option.title}</h3>
              <p className="option-description">{option.description}</p>
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

export default PartyMaster;
