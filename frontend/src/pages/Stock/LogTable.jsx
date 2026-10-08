import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import DownloadPopup from '../../components/DownloadPopup';
import { StatusMessage, Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/Logtable.css';
import { Database, TrendingUp, TrendingDown, Search, Download } from 'lucide-react';

const ITEMS_PER_PAGE = 15;

const LogTable = () => {
  const [stockEntries, setStockEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchStockEntries();
  }, []);

  const fetchStockEntries = async () => {
    try {
      const token = sessionStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };
      const [response, masterResponse] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_URL}/stock/entries`, { headers }),
        fetch(`${import.meta.env.VITE_API_URL}/master`, { headers }).catch(() => null)
      ]);

      if (response.ok) {
        const data = await response.json();

        // Entries don't store the Cat No, so look it up from the material master (used for searching)
        const catNoByCode = {};
        if (masterResponse && masterResponse.ok) {
          const masterData = await masterResponse.json();
          (masterData.masters || []).forEach(master => {
            catNoByCode[master.materialCode] = master.catNo || '';
          });
        }

        setStockEntries((data.data || []).map(entry => ({ ...entry, catNo: catNoByCode[entry.materialCode] || '' })));
      } else {
        console.error('Failed to fetch stock entries');
      }
    } catch (error) {
      console.error('Error fetching stock entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async ({ fromDate, toDate }) => {
    try {
      setIsDownloading(true);
      const token = sessionStorage.getItem('token');
      
      let startDate = fromDate;
      let endDate = toDate;
      
      // If only from date is selected, download that date's records only
      if (fromDate && !toDate) {
        startDate = fromDate;
        endDate = fromDate;
      } 
      // If no dates provided, use last 60 days
      else if (!fromDate && !toDate) {
        const today = new Date();
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(today.getDate() - 60);
        
        startDate = sixtyDaysAgo.toISOString().split('T')[0];
        endDate = today.toISOString().split('T')[0];
      }
      
      // Build query params
      const params = new URLSearchParams();
      params.append('fromDate', startDate);
      params.append('toDate', endDate);
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/stock/download/log?${params.toString()}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );

      if (response.ok) {
        // Get the blob from response
        const blob = await response.blob();
        
        // Get filename from Content-Disposition header or use default
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'Stock_log_entry.xls';
        if (contentDisposition) {
          // Try to extract filename from RFC 6266 format first (filename*=UTF-8''...)
          const filenameStarMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/);
          if (filenameStarMatch) {
            filename = decodeURIComponent(filenameStarMatch[1]);
          } else {
            // Fallback to standard format (filename="...")
            const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?(?:;|$)/);
            if (filenameMatch) {
              filename = filenameMatch[1];
            }
          }
        }
        
        // Create download link
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Failed to download file');
        alert('Failed to download file. Please try again.');
      }
    } catch (error) {
      console.error('Error downloading file:', error);
      alert('Error downloading file. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  };

  const filteredEntries = stockEntries.filter(entry => {
    const matchesSearch =
      entry.materialCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.materialName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.catNo?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = filterType === 'all' || entry.entryType === filterType;

    return matchesSearch && matchesFilter;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredEntries.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedEntries = filteredEntries.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  // Reset to page 1 when search or filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterType]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const year = date.getFullYear().toString().slice(-2);
    const time = date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true 
    });
    
    return `${day} ${month} ${year} - ${time}`;
  };

  return (
    <div className="stock-log-container">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar 
        title="Stock Entry Log" 
        onMenuClick={() => setSidebarExpanded(!sidebarExpanded)}
        rightContent={
          <button 
            className="download-icon-btn" 
            onClick={() => setShowDownloadPopup(true)}
            title="Download Report"
          >
            <Download size={20} />
          </button>
        }
      />
      <div className="log-content page-with-navbar">
        <div className="log-wrapper">
          {/* Search and Filter Section */}
          <div className="log-filter-section">
            <div className="log-search-wrapper">
              <Search className="log-search-icon" size={20} />
              <input
                type="text"
                placeholder="Search by material code, name or cat no..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="log-search-input"
              />
            </div>

            <div className="log-filter-group">
              <button
                className={`log-filter-btn ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All
              </button>
              <button
                className={`log-filter-btn credit-btn ${filterType === 'Credit' ? 'active' : ''}`}
                onClick={() => setFilterType('Credit')}
              >
                <TrendingUp size={16} />
                Credit
              </button>
              <button
                className={`log-filter-btn debit-btn ${filterType === 'Debit' ? 'active' : ''}`}
                onClick={() => setFilterType('Debit')}
              >
                <TrendingDown size={16} />
                Debit
              </button>
            </div>
          </div>

          {/* Table Section */}
          {loading ? (
          <div className="log-loading-container">
            <div className="log-loading-spinner"></div>
            <p>Loading stock entries...</p>
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="log-no-data">
            <Database size={48} />
            <p>No stock entries found</p>
          </div>
        ) : (
          <div className="log-table-wrapper">
            <div className="log-table-container">
              <table className="log-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Material Number</th>
                    <th>Material Name</th>
                    <th>Quantity</th>
                    <th>Entry Type</th>
                    <th>User</th>
                    <th>Updated time</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedEntries.map((entry, index) => (
                    <tr key={entry.id || index}>
                      <td>{startIndex + index + 1}</td>
                      <td className="material-code">{entry.materialCode}</td>
                      <td>{entry.materialName}</td>
                      <td className="quantity">{entry.quantity} {entry.unit}</td>
                      <td>
                        <span className={`entry-badge ${entry.entryType?.toLowerCase()}`}>
                          {entry.entryType === 'Credit' ? (
                            <TrendingUp size={14} />
                          ) : (
                            <TrendingDown size={14} />
                          )}
                          {entry.entryType}
                        </span>
                      </td>
                      <td className="user-id">{entry.userFirstName || 'N/A'}</td>
                      <td className="date-time">{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              className="log-pagination"
            />
          </div>
        )}
        </div>
      </div>

      <DownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onDownload={handleDownload}
        title="Download Log Table Report"
      />

      {isDownloading && <StatusMessage message="Downloading Excel..." />}
    </div>
  );
};

export default LogTable;
