import { useState, useEffect } from 'react';
import Sidebar from '../../components/Sidebar';
import Navbar from '../../components/Navbar';
import DownloadPopup from '../../components/DownloadPopup';
import { StatusMessage, Pagination } from '../../components/popup';
import '../../styles/pageStyles/Stock/FinalData.css';
import { Database, Search, TrendingUp, TrendingDown, Download } from 'lucide-react';
import { Dropdown } from 'rsuite';

const ITEMS_PER_PAGE = 10;

const FinalData = () => {
  const [stockBalances, setStockBalances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterClass, setFilterClass] = useState('all');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [showDownloadPopup, setShowDownloadPopup] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    fetchStockBalances();
  }, []);

  const fetchStockBalances = async () => {
    try {
      const token = sessionStorage.getItem('token');
      
      // Fetch all stock entries
      const response = await fetch(`${import.meta.env.VITE_API_URL}/stock/entries`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const entries = data.data || [];
        
        // Fetch master data to get class information
        const masterResponse = await fetch(`${import.meta.env.VITE_API_URL}/master`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
        
        const masterData = masterResponse.ok ? await masterResponse.json() : { data: [] };
        const masters = masterData.masters || masterData.data || [];
        
        // Create a map of materialCode to class
        const classMap = {};
        const catNoMap = {};
        masters.forEach(master => {
          classMap[master.materialCode] = master.class;
          catNoMap[master.materialCode] = master.catNo || '';
        });
        
        // Calculate balance for each material
        const balanceMap = {};
        
        entries.forEach(entry => {
          const key = entry.materialCode;
          
          if (!balanceMap[key]) {
            balanceMap[key] = {
              materialCode: entry.materialCode,
              materialName: entry.materialName,
              unit: entry.unit,
              quantity: 0,
              catNo: catNoMap[entry.materialCode] || '',
              class: classMap[entry.materialCode] || 'N/A'
            };
          }
          
          // Add for Credit, subtract for Debit
          if (entry.entryType === 'Credit') {
            balanceMap[key].quantity += parseFloat(entry.quantity || 0);
          } else if (entry.entryType === 'Debit') {
            balanceMap[key].quantity -= parseFloat(entry.quantity || 0);
          }
        });
        
        // Convert to array and sort by material code
        const balancesArray = Object.values(balanceMap).sort((a, b) => 
          a.materialCode.localeCompare(b.materialCode)
        );
        
        setStockBalances(balancesArray);
      } else {
        console.error('Failed to fetch stock entries');
      }
    } catch (error) {
      console.error('Error fetching stock balances:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredBalances = stockBalances.filter(balance => {
    const matchesSearch =
      balance.materialCode?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      balance.materialName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      balance.catNo?.toLowerCase().includes(searchTerm.toLowerCase());

    let matchesClass = true;
    if (filterClass !== 'all') {
      const materialCode = balance.materialCode || '';
      switch(filterClass) {
        case 'A':
          matchesClass = materialCode.startsWith('1000');
          break;
        case 'B':
          matchesClass = materialCode.startsWith('2000');
          break;
        case 'C':
          matchesClass = materialCode.startsWith('3000');
          break;
        case 'D':
          matchesClass = materialCode.startsWith('4000');
          break;
        case 'F':
          matchesClass = materialCode.startsWith('5000');
          break;
        default:
          matchesClass = true;
      }
    }

    return matchesSearch && matchesClass;
  });

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterClass]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredBalances.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedBalances = filteredBalances.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const handleDownload = async () => {
    try {
      setIsDownloading(true);
      const token = sessionStorage.getItem('token');
      
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/stock/download/current`,
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
        let filename = 'Current_stock_data.xls';
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

  return (
    <div className="final-data-container">
      <Sidebar isExpanded={sidebarExpanded} onToggle={setSidebarExpanded} />
      <Navbar 
        title="Current Stock " 
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
      
      <div className="final-main-wrapper page-with-navbar">
        <div className="final-content">
          <div className="final-wrapper">
            <div className="final-controls">
              <div className="search-wrapper">
                <Search className="search-icon" size={20} />
                <input
                  type="text"
                  placeholder="Search by material code, name or cat no..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              <Dropdown
                title={filterClass === 'all' ? 'All' : filterClass}
                onSelect={(value) => setFilterClass(value)}
                placement="bottomEnd"
                className="filter-dropdown"
              >
                <Dropdown.Item eventKey="all">All</Dropdown.Item>
                <Dropdown.Item eventKey="A">A</Dropdown.Item>
                <Dropdown.Item eventKey="B">B</Dropdown.Item>
                <Dropdown.Item eventKey="C">C</Dropdown.Item>
                <Dropdown.Item eventKey="D">D</Dropdown.Item>
                <Dropdown.Item eventKey="F">F</Dropdown.Item>
              </Dropdown>
            </div>

            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading stock balances...</p>
              </div>
            ) : filteredBalances.length === 0 ? (
              <div className="no-data">
                <Database size={48} />
                <p>No stock data found</p>
              </div>
            ) : (
              <>
                <div className="table-container">
                  <table className="final-table">
                    <thead>
                      <tr>
                        <th>S.No</th>
                        <th>Material Code</th>
                        <th>Material Name</th>
                        <th>Current Quantity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedBalances.map((balance, index) => (
                        <tr key={balance.materialCode}>
                          <td>{startIndex + index + 1}</td>
                          <td className="material-code">{balance.materialCode}</td>
                          <td>{balance.materialName}</td>
                          <td className="quantity">
                            {balance.quantity.toFixed(2)} {balance.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  className="final-pagination"
                />
              </>
            )}
          </div>
        </div>
      </div>

      <DownloadPopup
        isOpen={showDownloadPopup}
        onClose={() => setShowDownloadPopup(false)}
        onDownload={handleDownload}
        title="Download Current Stock Data"
        showDateRange={false}
      />

      {isDownloading && <StatusMessage message="Downloading Excel..." />}
    </div>
  );
};

export default FinalData;
