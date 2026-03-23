const appBase = (() => {
  const raw = typeof window !== 'undefined' && typeof window.__APP_BASE__ === 'string'
    ? window.__APP_BASE__
    : '/';
  return raw.endsWith('/') ? raw : `${raw}/`;
})();

const api = {
  get: async (path) => {
    const response = await fetch(`${appBase}api/${path}`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  },
  post: async (path, payload) => {
    const response = await fetch(`${appBase}api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  },
  put: async (path, payload) => {
    const response = await fetch(`${appBase}api/${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    return body;
  },
};

// LOGIN HANDLING
function setupLoginForm() {
  const loginForm = document.querySelector('#loginForm');
  if (!loginForm) return;

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.querySelector('#loginEmail').value.trim();
    const password = document.querySelector('#loginPassword').value;
    const errorDiv = document.querySelector('#loginError');
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    
    // Clear error
    errorDiv.textContent = '';
    errorDiv.classList.remove('show');
    submitBtn.disabled = true;
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Signing in...';

    try {
      console.log('Attempting login to:', `${appBase}api/auth/login`);
      
      const response = await fetch(`${appBase}api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      
      console.log('Response status:', response.status);
      const result = await response.json();
      console.log('Response data:', result);
      
      if (!response.ok) {
        throw new Error(result.message || result.error || `Login failed (${response.status})`);
      }
      
      if (result.success) {
        console.log('Login successful, reloading...');
        window.location.reload();
      } else {
        throw new Error(result.message || result.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      errorDiv.textContent = error.message || 'Invalid credentials. Try admin / password';
      errorDiv.classList.add('show');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
}

// LOGOUT HANDLING
function setupLogout() {
  const logoutBtn = document.querySelector('#logoutBtn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to sign out?')) return;
    
    logoutBtn.disabled = true;
    try {
      await fetch(`${appBase}api/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }).then(r => r.json());
      window.location.href = appBase;
    } catch (error) {
      console.error('Logout error:', error);
      window.location.href = appBase;
    }
  });
}

// Initialize login form if on login page
if (document.querySelector('#loginForm')) {
  setupLoginForm();
}

// Initialize logout if on dashboard
if (document.querySelector('#logoutBtn')) {
  setupLogout();
}

const state = {
  currentView: 'summary',
  warehouses: [],
  selectedWarehouseId: null,
  quarantine: {
    rows: [],
    page: 0,
    rowsPerPage: 10,
    selectedTargets: {},
    docsReceivedByUnit: {},
    ioNumberByUnit: {},
    updatingUnitId: null,
  },
  rareCases: {
    rows: [],
    historyRows: [],
    page: 0,
    rowsPerPage: 10,
    historyPage: 0,
    historyRowsPerPage: 10,
    selectedTargets: {},
    updatingUnitId: null,
    activeUnitId: null,
    dialogOpen: false,
    icNumber: '',
    changedBy: '',
  },
  weekly: {
    summaryRows: [],
    branchSummaryRows: [],
    recentRows: [],
    historyRows: [],
    availableStockTypes: [],
    selectedBranch: '',
    serialSearch: '',
    stockTypeFilter: '',
    paidBranchFilter: '',
    paidSerialSearch: '',
    selectedKeys: {},
    bulkIoNumber: '',
    bulkSaving: false,
    selectedRow: null,
    ioNumber: '',
    dialogOpen: false,
    saving: false,
    pendingOpenSerial: '',
  },
  takealot: {
    rows: [],
    page: 0,
    rowsPerPage: 10,
    selectedRow: null,
    ioNumber: '',
    dialogOpen: false,
    saving: false,
  },
  archive: {
    rows: [],
    page: 0,
    rowsPerPage: 10,
    branchFilter: '',
    serialSearch: '',
  },
  serialLookup: {
    searchTerm: '',
    masterSearch: '',
    masterRows: [],
    masterLoading: false,
    searchedSerial: '',
    current: null,
    scanOutEvents: [],
    archiveRows: [],
    paymentHistory: [],
    rareCaseHistory: [],
    hasSearched: false,
    loading: false,
  },
  users: {
    rows: [],
    edits: {},
    creating: false,
    savingUserId: null,
    passwordUserId: null,
    passwordValue: '',
    newUser: {
      fullName: '',
      username: '',
      email: '',
      password: '',
      isActive: true,
    },
  },
  downloads: {
    rows: [],
    uploading: false,
  },
  dashboard: {
    warehouseBreakdown: [],
    scanInBreakdown: [],
    weeklyRecent: [],
    refreshing: false,
    lastUpdatedAt: null,
  },
  models: {
    modelRows: [],
    searchTerm: '',
    selectedWarehouseFilterId: '',
    expandedModelId: null,
    branchRowsByModel: {},
    loadingModelId: null,
    expandedBranchKey: '',
    unitRowsByBranch: {},
    loadingBranchKey: '',
    loading: false,
  },
};

const SOURCE_NAMES = {
  1: 'TFFW Swaziland',
  2: 'TFFW Durban',
  3: 'TFFW Midrand',
  4: 'TFFW Exchange',
  5: 'Inhouse Exchange',
  6: 'Bought Back',
};

const SCAN_OUT_NAMES = {
  ACTUAL_SALE: 'Actual Sale',
  TFFW_EXCHANGE: 'TFFW Exchange',
  INHOUSE_EXCHANGE: 'Inhouse Exchange',
  TAKEALOT: 'Takealot',
  TFF_DEALER: 'TFF Dealer',
};

const STORAGE_KEYS = {
  activeView: 'adminDashboard.activeView',
};

let messageTimeoutId = null;

function setMessage(text, isError = false) {
  const box = document.getElementById('message');
  if (!box) return;

  if (messageTimeoutId) {
    window.clearTimeout(messageTimeoutId);
    messageTimeoutId = null;
  }

  box.hidden = !text;
  box.textContent = text || '';
  box.setAttribute('role', 'status');
  box.setAttribute('aria-live', isError ? 'assertive' : 'polite');
  box.classList.toggle('is-error', isError);
  box.style.background = isError ? '#fee2e2' : '#ecfeff';
  box.style.borderColor = isError ? '#fca5a5' : '#a5f3fc';

  if (text && !isError) {
    messageTimeoutId = window.setTimeout(() => {
      box.hidden = true;
      box.textContent = '';
      messageTimeoutId = null;
    }, 4200);
  }
}

function focusInputByRole(role) {
  window.setTimeout(() => {
    const input = document.querySelector(`[data-role="${role}"]`);
    if (input instanceof HTMLInputElement) {
      input.focus();
      input.select();
    }
  }, 0);
}

function formatColumnName(columnName) {
  if (columnName === 'warehouse_id') return 'Warehouse';
  if (columnName === 'model_id') return 'Model ID';
  if (columnName === 'model_name' || columnName === 'model') return 'Model Name';
  return String(columnName || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatCellValue(value, columnName) {
  if (value === null || value === undefined || value === '') return '-';
  const normalizedColumnName = String(columnName || '').trim().toLowerCase();

  if (value === true || value === 1 || value === '1') {
    if (['delivered', 'include_weekly_report', 'weekly_report'].includes(normalizedColumnName)) return 'Yes';
  }

  if (value === false || value === 0 || value === '0') {
    if (['delivered', 'include_weekly_report', 'weekly_report'].includes(normalizedColumnName)) return 'No';
  }

  if (typeof value === 'string') {
    const isoDatePattern = /^\d{4}-\d{2}-\d{2}(T|\s).*/;
    if (isoDatePattern.test(value)) {
      const dateValue = new Date(value);
      if (!Number.isNaN(dateValue.getTime())) {
        return dateValue.toLocaleString();
      }
    }
  }

  return String(value);
}

function toTable(rows) {
  if (!rows || rows.length === 0) return '<p>No rows found.</p>';
  const hiddenColumns = new Set(['stock_status', 'delivered', 'delivered_status']);
  const columns = Object.keys(rows[0]).filter((col) => !hiddenColumns.has(String(col || '').toLowerCase()));
  const thead = `<thead><tr>${columns.map((col) => `<th>${escapeHtml(formatColumnName(col))}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${rows.map((row) => `<tr>${columns.map((col) => `<td>${escapeHtml(formatCellValue(row[col], col))}</td>`).join('')}</tr>`).join('')}</tbody>`;
  return `<div class="table-wrap"><table>${thead}${tbody}</table></div>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function checkHealth() {
  const badge = document.getElementById('healthBadge');
  try {
    const result = await fetch(`${appBase}api/health`).then(r => r.json());
    if (result.ok && result.db) {
      badge.textContent = 'API + DB OK';
      badge.className = 'badge ok';
      return;
    }
    badge.textContent = 'API up, DB issue';
    badge.className = 'badge error';
  } catch (error) {
    badge.textContent = 'API unavailable';
    badge.className = 'badge error';
  }
}

async function loadSummary(background = false) {
  if (background) {
    state.dashboard.refreshing = true;
    renderDashboard();
  }

  const [warehouseData, weeklyData] = await Promise.all([
    api.get('dashboard/warehouse-breakdown'),
    api.get('dashboard/weekly-report'),
  ]);

  state.dashboard.warehouseBreakdown = warehouseData.rows || [];
  state.dashboard.weeklyRecent = weeklyData.recent || [];
  state.dashboard.lastUpdatedAt = new Date();
  state.dashboard.refreshing = false;
  renderDashboard();
}

function renderDashboard() {
  const container = document.getElementById('summaryCards');
  const dashboard = state.dashboard;
  const updatedLabel = dashboard.lastUpdatedAt
    ? `Updated ${dashboard.lastUpdatedAt.toLocaleTimeString()}${dashboard.refreshing ? ' \u2022 Refreshing' : ''}`
    : 'Connecting';

  const totalUnits = dashboard.warehouseBreakdown.reduce((sum, row) => sum + Number(row.total_units || 0), 0);
  const totalWarehouses = dashboard.warehouseBreakdown.length;
  const weeklyUnpaidItems = dashboard.weeklyRecent.filter((row) => !row.io_number).length;

  const warehouseRowsHtml = dashboard.warehouseBreakdown.length
    ? dashboard.warehouseBreakdown.map((row) => `
      <button type="button" class="dashboard-list-row" data-role="dashboard-open-warehouse" data-warehouse-id="${row.warehouse_id}">
        <div class="dashboard-list-row-copy">
          <div class="dashboard-list-row-title">${escapeHtml(row.warehouse || 'Unassigned')}</div>
          <div class="dashboard-list-row-subtitle">Click to view units</div>
        </div>
        <div class="dashboard-list-row-value">${escapeHtml(row.total_units || 0)}</div>
      </button>
    `).join('')
    : '<div class="dashboard-empty">No warehouse data available.</div>';

  const weeklyRowsHtml = dashboard.weeklyRecent.length
    ? dashboard.weeklyRecent.slice(0, 8).map((row) => {
      const hasIo = String(row.io_number || '').trim() !== '';
      if (hasIo) {
        return `
          <div class="dashboard-list-row">
            <div class="dashboard-list-row-copy">
              <div class="dashboard-list-row-title">${escapeHtml(row.serial_number || '-')}</div>
              <div class="dashboard-list-row-subtitle">${escapeHtml(row.scan_type || '-')} \u2022 ${escapeHtml(row.client_name || 'No client')}</div>
            </div>
            <div class="dashboard-list-chip is-success">IO added</div>
          </div>
        `;
      }

      return `
        <button type="button" class="dashboard-list-row dashboard-click-card" data-role="dashboard-open-weekly-serial" data-serial="${escapeHtml(row.serial_number || '')}" data-branch="${escapeHtml(row.branch || '')}">
          <div class="dashboard-list-row-copy">
            <div class="dashboard-list-row-title">${escapeHtml(row.serial_number || '-')}</div>
            <div class="dashboard-list-row-subtitle">${escapeHtml(row.scan_type || '-')} \u2022 ${escapeHtml(row.client_name || 'No client')}</div>
          </div>
          <div class="dashboard-list-chip is-warning">Needs IO</div>
        </button>
      `;
    }).join('')
    : '<div class="dashboard-empty">No weekly report items found.</div>';

  const warehouseCardsHtml = dashboard.warehouseBreakdown.length
    ? dashboard.warehouseBreakdown.slice(0, 4).map((row) => `
      <button type="button" class="weekly-stat-card dashboard-click-card" data-role="dashboard-open-models-warehouse" data-warehouse-id="${escapeHtml(row.warehouse_id || '')}">
        <div class="weekly-stat-label">${escapeHtml(row.warehouse || 'Unassigned')}</div>
        <div class="weekly-stat-value">${escapeHtml(row.total_units || 0)}</div>
      </button>
    `).join('')
    : '<div class="dashboard-empty">No warehouse cards available.</div>';

  container.innerHTML = `
    <div class="dashboard-page">
      <div class="dashboard-meta-row">
        <div class="dashboard-meta-title">Dashboard</div>
        <div class="dashboard-meta-chip">${escapeHtml(updatedLabel)}</div>
      </div>

      <div class="weekly-cards">
        <div class="weekly-stat-card">
          <div class="weekly-stat-label">Units In Stock</div>
          <div class="weekly-stat-value">${totalUnits}</div>
        </div>
        <div class="weekly-stat-card">
          <div class="weekly-stat-label">Warehouses</div>
          <div class="weekly-stat-value">${totalWarehouses}</div>
        </div>
        <button type="button" class="weekly-stat-card dashboard-click-card" data-role="dashboard-open-weekly-report">
          <div class="weekly-stat-label">Unpaid Weekly Items</div>
          <div class="weekly-stat-value">${weeklyUnpaidItems}</div>
        </button>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-card">
          <div class="dashboard-card-head">
            <div>
              <div class="dashboard-card-title">Warehouse Units In Stock</div>
              <div class="dashboard-card-subtitle">Click a warehouse card to open Models filtered by that warehouse.</div>
            </div>
            <div class="dashboard-card-count">${totalWarehouses}</div>
          </div>
          <div class="weekly-cards">${warehouseCardsHtml}</div>
        </div>

        <div class="dashboard-card">
          <div class="dashboard-card-head">
            <div>
              <div class="dashboard-card-title">Weekly Report</div>
              <div class="dashboard-card-subtitle">Recent items on the weekly report.</div>
            </div>
            <div class="dashboard-card-count">${dashboard.weeklyRecent.length}</div>
          </div>
          <div class="dashboard-list">${weeklyRowsHtml}</div>
        </div>
      </div>
    </div>
  `;
}

async function loadWeekly() {
  const branch = String(state.weekly.selectedBranch || '').trim();
  const serialNumber = String(state.weekly.serialSearch || '').trim();
  const stockType = String(state.weekly.stockTypeFilter || '').trim();
  const weeklyBranchOptions = getWeeklyBranchOptions();
  const paidBranchCandidate = String(state.weekly.paidBranchFilter || '').trim();
  const paidBranch = weeklyBranchOptions.includes(paidBranchCandidate) ? paidBranchCandidate : '';
  const paidSerial = String(state.weekly.paidSerialSearch || '').trim();
  const query = new URLSearchParams();
  const historyQuery = new URLSearchParams();

  if (branch) {
    query.set('branch', branch);
  }
  if (serialNumber) {
    query.set('serialNumber', serialNumber);
  }
  if (stockType) {
    query.set('stockType', stockType);
  }

  if (paidBranch) {
    historyQuery.set('branch', paidBranch);
  }
  if (paidSerial) {
    historyQuery.set('serialNumber', paidSerial);
  }

  const reportPath = query.toString() ? `dashboard/weekly-report?${query.toString()}` : 'dashboard/weekly-report';
  const historyPath = historyQuery.toString() ? `dashboard/weekly-report-payment-history?${historyQuery.toString()}` : 'dashboard/weekly-report-payment-history';

  const [allBranchesReport, report, history] = await Promise.all([
    api.get('dashboard/weekly-report'),
    api.get(reportPath),
    api.get(historyPath),
  ]);

  state.weekly.summaryRows = report.summary || [];
  state.weekly.branchSummaryRows = allBranchesReport.branchSummary || report.branchSummary || [];
  state.weekly.recentRows = report.recent || [];
  state.weekly.historyRows = history.rows || [];
  state.weekly.availableStockTypes = report.availableStockTypes || [];
  state.weekly.selectedKeys = {};

  const pendingSerial = String(state.weekly.pendingOpenSerial || '').trim();
  if (pendingSerial) {
    const pendingRowIndex = state.weekly.recentRows.findIndex((row) => {
      const serial = String(row.serial_number || '').trim();
      const isPaid = String(row.payment_status || '').toUpperCase() === 'PAID_TFFW' || String(row.io_number || '').trim() !== '';
      return serial === pendingSerial && !isPaid;
    });

    state.weekly.pendingOpenSerial = '';
    if (pendingRowIndex >= 0) {
      openWeeklyDialog(pendingRowIndex);
      return;
    }
  }

  renderWeeklyReport();
}

function getCountByScanType(summaryRows, scanType) {
  return summaryRows
    .filter((item) => item.scan_type === scanType)
    .reduce((total, item) => total + Number(item.total || 0), 0);
}

function getWeeklyBranchOptions() {
  const branchNames = state.warehouses
    .map((warehouse) => String(getWarehouseDisplayName(warehouse) || '').trim())
    .filter((branchName) => branchName !== '');

  return Array.from(new Set(branchNames)).slice(0, 4);
}

function weeklyRowKey(row) {
  return [
    String(row.id || '').trim(),
    String(row.serial_number || '').trim(),
    String(row.scan_type || '').trim(),
    String(row.created_at || '').trim(),
  ].join('::');
}

function groupRowsByBranch(rows) {
  const grouped = rows.reduce((acc, row) => {
    const branch = String(row.branch || 'Unassigned').trim() || 'Unassigned';
    if (!acc[branch]) {
      acc[branch] = [];
    }
    acc[branch].push(row);
    return acc;
  }, {});

  return Object.keys(grouped)
    .sort((a, b) => a.localeCompare(b))
    .map((branch) => ({ branch, rows: grouped[branch] }));
}

function renderWeeklyReport() {
  const container = document.getElementById('weeklyReportPage');
  const weekly = state.weekly;
  const selectedBranch = String(weekly.selectedBranch || '').trim();
  const weeklyBranchOptions = getWeeklyBranchOptions();
  const paidBranchFilterCandidate = String(weekly.paidBranchFilter || '').trim();
  const paidBranchFilter = weeklyBranchOptions.includes(paidBranchFilterCandidate)
    ? paidBranchFilterCandidate
    : '';
  const totalWeeklyEvents = weekly.summaryRows.reduce((total, row) => total + Number(row.total || 0), 0);
  const actualSalesCount = getCountByScanType(weekly.summaryRows, 'ACTUAL_SALE');
  const inhouseExchangeCount = getCountByScanType(weekly.summaryRows, 'INHOUSE_EXCHANGE');
  const selectedCount = weekly.recentRows.filter((row) => weekly.selectedKeys[weeklyRowKey(row)] === true).length;
  const allSelected = weekly.recentRows.length > 0 && selectedCount === weekly.recentRows.length;

  const branchChoices = (weekly.branchSummaryRows || [])
    .map((item) => ({
      branch: String(item.branch || '').trim(),
      total: Number(item.total || 0),
    }))
    .filter((item) => item.branch !== '')
    .sort((a, b) => a.branch.localeCompare(b.branch));

  const historyRowsHtml = weekly.historyRows.length
    ? weekly.historyRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.serial_number || '-')}</td>
        <td>${escapeHtml(row.branch || '-')}</td>
        <td>${escapeHtml(row.model || '-')}</td>
        <td>${escapeHtml(row.scan_type || '-')}</td>
        <td>${escapeHtml(row.previous_payment_status || '-')}</td>
        <td>${escapeHtml(row.new_payment_status || '-')}</td>
        <td>${escapeHtml(row.io_number || '-')}</td>
        <td>${formatDateTime(row.changed_at)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="8" class="quarantine-empty">No paid history found.</td></tr>';

  const paidControlsHtml = `
    <div style="padding:10px 16px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
      <label style="margin:0;min-width:180px;flex:0 1 180px;">
        Branch
        <select data-role="weekly-paid-filter-branch">
          <option value="">All branches</option>
          ${weeklyBranchOptions.map((branchOption) => `<option value="${escapeHtml(branchOption)}"${paidBranchFilter === branchOption ? ' selected' : ''}>${escapeHtml(branchOption)}</option>`).join('')}
        </select>
      </label>
      <label style="margin:0;min-width:240px;flex:1 1 240px;">
        Search Serial Number
        <input type="text" data-role="weekly-paid-filter-serial" value="${escapeHtml(weekly.paidSerialSearch)}" placeholder="Search paid serial number" />
      </label>
      <button data-role="weekly-apply-paid-filters">Apply Filters</button>
      <button data-role="weekly-clear-paid-filters" type="button">Clear</button>
      <button data-role="weekly-export-paid" type="button">Export Excel</button>
    </div>
  `;

  if (!selectedBranch) {
    const choicesHtml = branchChoices.length
      ? branchChoices.map((item) => `
        <button class="weekly-action-btn" data-role="weekly-select-branch" data-branch="${escapeHtml(item.branch)}">
          ${escapeHtml(item.branch)} (${item.total})
        </button>
      `).join('')
      : '<div class="quarantine-empty">No unpaid rows for this week.</div>';

    container.innerHTML = `
      <div class="weekly-page weekly-compact">
        <p class="weekly-subtitle">Select a branch to view unpaid weekly rows, or review paid history below.</p>
        <div class="weekly-card weekly-card-spacing">
          <div class="weekly-card-title">Choose Branch</div>
          <div style="padding:14px 16px;display:flex;flex-wrap:wrap;gap:8px;">${choicesHtml}</div>
        </div>

        <div class="weekly-card">
          <div class="weekly-card-title">Paid</div>
          ${paidControlsHtml}
          <div class="table-wrap weekly-table-wrap">
            <table>
              <thead><tr><th>Serial Number</th><th>Branch</th><th>Model</th><th>Scan Type</th><th>Previous Status</th><th>New Status</th><th>IO Number</th><th>Changed At</th></tr></thead>
              <tbody>${historyRowsHtml}</tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    return;
  }

  const currentRows = weekly.recentRows;
  const sortedCurrentRows = currentRows
    .map((row, originalIndex) => ({ row, originalIndex }))
    .sort((left, right) => {
      const leftPaid = String(left.row.payment_status || '').toUpperCase() === 'PAID_TFFW' || String(left.row.io_number || '').trim() !== '';
      const rightPaid = String(right.row.payment_status || '').toUpperCase() === 'PAID_TFFW' || String(right.row.io_number || '').trim() !== '';

      if (leftPaid !== rightPaid) {
        return leftPaid ? 1 : -1;
      }

      const leftDate = new Date(left.row.created_at || 0).getTime();
      const rightDate = new Date(right.row.created_at || 0).getTime();
      return rightDate - leftDate;
    });
  const currentActualSales = currentRows.filter((row) => row.scan_type === 'ACTUAL_SALE').length;
  const currentInhouse = currentRows.filter((row) => row.scan_type === 'INHOUSE_EXCHANGE').length;

  const currentRowsHtml = sortedCurrentRows.length
    ? sortedCurrentRows.map(({ row, originalIndex: rowIndex }) => {
      const isPaid = String(row.payment_status || '').toUpperCase() === 'PAID_TFFW' || String(row.io_number || '').trim() !== '';
      return `
        <tr>
          <td><input type="checkbox" data-role="weekly-select-row" data-row-key="${escapeHtml(weeklyRowKey(row))}" ${weekly.selectedKeys[weeklyRowKey(row)] ? 'checked' : ''} /></td>
          <td>${escapeHtml(row.serial_number || '-')}</td>
          <td>${escapeHtml(row.model || '-')}</td>
          <td>${escapeHtml(row.stock_type || '-')}</td>
          <td>${escapeHtml(row.scan_type || '-')}</td>
          <td>${escapeHtml(row.client_name || '-')}</td>
          <td>${escapeHtml(row.supplier_status || '-')}</td>
          <td>${escapeHtml(row.payment_status || '-')}</td>
          <td>${escapeHtml(row.io_number || '-')}</td>
          <td>${formatDateTime(row.created_at)}</td>
          <td class="weekly-action-cell">${isPaid ? '<span class="dashboard-list-chip is-success">Done</span>' : `<button class="weekly-action-btn" data-role="weekly-open-dialog" data-row-index="${rowIndex}">Add IO</button>`}</td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="11" class="quarantine-empty">No weekly rows for this branch.</td></tr>';

  const selectedRow = weekly.selectedRow;

  container.innerHTML = `
    <div class="weekly-page weekly-compact">
      <p class="weekly-subtitle">This week's scanned-out items, including Actual Sales and Inhouse Exchanges</p>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Branch: ${escapeHtml(selectedBranch)}</div>
        <div style="padding:10px 16px;display:flex;justify-content:flex-end;">
          <button data-role="weekly-change-branch" class="weekly-action-btn">Change Branch</button>
        </div>
      </div>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Unpaid</div>
        <div style="padding:10px 16px;display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;">
          <label style="margin:0;min-width:220px;flex:1 1 220px;">
            Search Serial Number
            <input type="text" data-role="weekly-filter-serial" value="${escapeHtml(weekly.serialSearch)}" placeholder="Search serial number" />
          </label>
          <label style="margin:0;min-width:180px;flex:0 1 180px;">
            Stock Type
            <select data-role="weekly-filter-stock-type">
              <option value="">All</option>
              ${weekly.availableStockTypes.map((value) => `<option value="${escapeHtml(value)}"${weekly.stockTypeFilter === value ? ' selected' : ''}>${escapeHtml(value)}</option>`).join('')}
            </select>
          </label>
          <button data-role="weekly-apply-filters">Apply Filters</button>
          <button data-role="weekly-clear-filters" type="button">Clear</button>
          <label style="margin:0;min-width:240px;flex:1 1 240px;">
            IO Number for Selected
            <input type="text" data-role="weekly-bulk-io-input" value="${escapeHtml(weekly.bulkIoNumber)}" placeholder="Enter one IO for selected rows" />
          </label>
          <button data-role="weekly-apply-bulk-io" type="button" ${weekly.bulkSaving ? 'disabled' : ''}>${weekly.bulkSaving ? 'Saving...' : `Apply to Selected (${selectedCount})`}</button>
        </div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead><tr><th><input type="checkbox" data-role="weekly-select-all" ${allSelected ? 'checked' : ''} /></th><th>Serial Number</th><th>Model</th><th>Stock Type</th><th>Scan Type</th><th>Client</th><th>Supplier Status</th><th>Payment Status</th><th>IO Number</th><th>Scanned At</th><th class="weekly-action-cell">Action</th></tr></thead>
            <tbody>${currentRowsHtml}</tbody>
          </table>
        </div>
      </div>

      <div class="weekly-card">
        <div class="weekly-card-title">Paid</div>
        ${paidControlsHtml}
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead><tr><th>Serial Number</th><th>Branch</th><th>Model</th><th>Scan Type</th><th>Previous Status</th><th>New Status</th><th>IO Number</th><th>Changed At</th></tr></thead>
            <tbody>${historyRowsHtml}</tbody>
          </table>
        </div>
      </div>

      <div class="weekly-dialog${weekly.dialogOpen ? ' is-open' : ''}"${weekly.dialogOpen ? '' : ' hidden'}>
        <div class="weekly-dialog-backdrop" data-role="weekly-close-dialog"></div>
        <div class="weekly-dialog-panel">
          <div class="weekly-dialog-title">Add IO Number</div>
          <p class="weekly-dialog-copy">${selectedRow?.serial_number ? `Enter IO number for serial ${escapeHtml(selectedRow.serial_number)}` : 'Enter IO number for this item.'}</p>
          <label class="weekly-dialog-field">
            IO Number
            <input type="text" data-role="weekly-io-input" value="${escapeHtml(weekly.ioNumber)}" />
          </label>
          <div class="weekly-dialog-actions">
            <button data-role="weekly-close-dialog" class="weekly-dialog-cancel">Cancel</button>
            <button data-role="weekly-confirm-dialog" class="weekly-dialog-confirm">${weekly.saving ? 'Saving...' : 'Confirm'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openWeeklyDialog(rowIndex) {
  const row = state.weekly.recentRows[rowIndex] || null;
  if (!row) return;
  state.weekly.selectedRow = row;
  state.weekly.ioNumber = String(row.io_number || '').trim();
  state.weekly.dialogOpen = true;
  renderWeeklyReport();
  focusInputByRole('weekly-io-input');
}

function closeWeeklyDialog() {
  if (state.weekly.saving) {
    return;
  }
  state.weekly.selectedRow = null;
  state.weekly.ioNumber = '';
  state.weekly.dialogOpen = false;
  renderWeeklyReport();
}

async function confirmWeeklyIo() {
  const weekly = state.weekly;
  const selectedRow = weekly.selectedRow;
  const ioNumber = String(weekly.ioNumber || '').trim();
  if (!selectedRow?.serial_number) {
    setMessage('Selected row is missing a serial number.', true);
    return;
  }
  if (!ioNumber) {
    setMessage('IO number is required.', true);
    return;
  }
  if (String(selectedRow.payment_status || '').toUpperCase() === 'PAID_TFFW' || String(selectedRow.io_number || '').trim() !== '') {
    setMessage('This row is already paid and can no longer be edited here.', true);
    return;
  }

  weekly.saving = true;
  renderWeeklyReport();

  try {
    await api.post('dashboard/weekly-report/archive-item', {
      serialNumber: selectedRow.serial_number,
      ioNumber,
      scanType: selectedRow.scan_type || null,
    });
    setMessage(`Serial ${selectedRow.serial_number} moved to Archive.`);
    weekly.saving = false;
    weekly.dialogOpen = false;
    weekly.selectedRow = null;
    weekly.ioNumber = '';
    await loadWeekly();
  } catch (error) {
    weekly.saving = false;
    renderWeeklyReport();
    setMessage(error.message, true);
  }
}

function toggleWeeklySelectAll(checked) {
  const selected = {};
  if (checked) {
    state.weekly.recentRows.forEach((row) => {
      selected[weeklyRowKey(row)] = true;
    });
  }
  state.weekly.selectedKeys = selected;
  renderWeeklyReport();
}

async function confirmWeeklyBulkIo() {
  const weekly = state.weekly;
  const ioNumber = String(weekly.bulkIoNumber || '').trim();
  const rows = weekly.recentRows.filter((row) => {
    if (weekly.selectedKeys[weeklyRowKey(row)] !== true) return false;
    const paid = String(row.payment_status || '').toUpperCase() === 'PAID_TFFW' || String(row.io_number || '').trim() !== '';
    return !paid;
  });

  if (rows.length < 1) {
    setMessage('Select at least one weekly row first.', true);
    return;
  }

  if (!ioNumber) {
    setMessage('IO number is required.', true);
    return;
  }

  weekly.bulkSaving = true;
  renderWeeklyReport();

  try {
    for (const row of rows) {
      await api.post('dashboard/weekly-report/archive-item', {
        serialNumber: row.serial_number,
        ioNumber,
        scanType: row.scan_type || null,
      });
    }

    weekly.bulkSaving = false;
    weekly.bulkIoNumber = '';
    weekly.selectedKeys = {};
    setMessage(`${rows.length} item(s) moved to Archive with IO ${ioNumber}.`);
    await loadWeekly();
  } catch (error) {
    weekly.bulkSaving = false;
    renderWeeklyReport();
    setMessage(error.message, true);
  }
}

async function loadArchive() {
  const branch = String(state.archive.branchFilter || '').trim();
  const serialNumber = String(state.archive.serialSearch || '').trim();
  const query = new URLSearchParams();

  if (branch) {
    query.set('branch', branch);
  }
  if (serialNumber) {
    query.set('serialNumber', serialNumber);
  }

  const path = query.toString() ? `dashboard/archive?${query.toString()}` : 'dashboard/archive';
  const data = await api.get(path);
  state.archive.rows = data.rows || [];
  renderArchive();
}

function renderArchive() {
  const container = document.getElementById('archiveTable');
  const archive = state.archive;
  const rows = archive.rows.slice(archive.page * archive.rowsPerPage, archive.page * archive.rowsPerPage + archive.rowsPerPage);
  const totalPages = Math.max(1, Math.ceil(archive.rows.length / archive.rowsPerPage));

  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.serial_number || '-')}</td>
        <td>${escapeHtml(row.branch || '-')}</td>
        <td>${escapeHtml(row.model || '-')}</td>
        <td>${escapeHtml(row.scan_type || '-')}</td>
        <td>${escapeHtml(row.client_name || '-')}</td>
        <td>${escapeHtml(row.payment_status || '-')}</td>
        <td>${escapeHtml(row.supplier_status || '-')}</td>
        <td>${escapeHtml(row.uploaded_io_number || row.io_number || '-')}</td>
        <td>${escapeHtml(row.invoice_number || row.po_number || '-')}</td>
        <td>${formatDateTime(row.scanned_at)}</td>
        <td>${formatDateTime(row.archived_at)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="11" class="quarantine-empty">No archived rows found.</td></tr>';

  const archiveExportQuery = new URLSearchParams();
  if (String(archive.branchFilter || '').trim() !== '') {
    archiveExportQuery.set('branch', String(archive.branchFilter || '').trim());
  }
  if (String(archive.serialSearch || '').trim() !== '') {
    archiveExportQuery.set('serialNumber', String(archive.serialSearch || '').trim());
  }
  const archiveExportHref = `${appBase}api/dashboard/archive/export${archiveExportQuery.toString() ? `?${archiveExportQuery.toString()}` : ''}`;

  container.innerHTML = `
    <div class="archive-page">
      <p class="archive-subtitle">Archived items after IO number capture, across Weekly Report, Takealot, TFFW Exchange, and Dealer flows.</p>
      <div class="archive-card">
        <div class="archive-card-title">Archive Records</div>
        <div class="form-grid" style="margin: 0 0 12px 0;">
          <label>
            Branch
            <input type="text" data-role="archive-filter-branch" value="${escapeHtml(archive.branchFilter)}" placeholder="Filter by branch" />
          </label>
          <label>
            Search Serial Number
            <input type="text" data-role="archive-filter-serial" value="${escapeHtml(archive.serialSearch)}" placeholder="Search serial number" />
          </label>
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <button data-role="archive-apply-filters" type="button">Apply Filters</button>
            <button data-role="archive-clear-filters" type="button">Clear</button>
            <a href="${escapeHtml(archiveExportHref)}" class="weekly-action-btn" style="text-decoration:none;display:inline-flex;align-items:center;">Export Excel</a>
          </div>
        </div>
        <div class="table-wrap archive-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Branch</th>
                <th>Model</th>
                <th>Scan Type</th>
                <th>Client</th>
                <th>Payment Status</th>
                <th>Supplier Status</th>
                <th>IO Number</th>
                <th>Invoice / PO</th>
                <th>Scanned At</th>
                <th>Archived At</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="quarantine-pagination">
          <label>
            Rows per page:
            <select data-role="archive-rows-per-page" class="quarantine-rows-select">
              <option value="10"${archive.rowsPerPage === 10 ? ' selected' : ''}>10</option>
              <option value="25"${archive.rowsPerPage === 25 ? ' selected' : ''}>25</option>
              <option value="50"${archive.rowsPerPage === 50 ? ' selected' : ''}>50</option>
              <option value="100"${archive.rowsPerPage === 100 ? ' selected' : ''}>100</option>
            </select>
          </label>
          <div class="quarantine-pagination-status">${archive.rows.length ? `${archive.page * archive.rowsPerPage + 1}-${Math.min(archive.rows.length, (archive.page + 1) * archive.rowsPerPage)} of ${archive.rows.length}` : '0-0 of 0'}</div>
          <div class="quarantine-pagination-buttons">
            <button data-role="archive-prev-page"${archive.page <= 0 ? ' disabled' : ''}>‹</button>
            <button data-role="archive-next-page"${archive.page >= totalPages - 1 ? ' disabled' : ''}>›</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function loadSerialLookup() {
  await loadSerialMasterList();
  renderSerialLookup();
}

async function loadSerialMasterList() {
  const lookup = state.serialLookup;
  lookup.masterLoading = true;
  renderSerialLookup();

  try {
    const search = String(lookup.masterSearch || '').trim();
    const query = new URLSearchParams();
    if (search !== '') {
      query.set('search', search);
    }

    const data = await api.get(`dashboard/serial-master-list${query.toString() ? `?${query.toString()}` : ''}`);
    lookup.masterRows = data.rows || [];
    lookup.masterLoading = false;
    renderSerialLookup();
  } catch (error) {
    lookup.masterRows = [];
    lookup.masterLoading = false;
    renderSerialLookup();
    setMessage(error.message, true);
  }
}

function formatLookupValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (value === true || value === 1 || value === '1') return 'Yes';
  if (value === false || value === 0 || value === '0') return 'No';
  return String(value);
}

function formatLookupDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

function renderSerialLookupTable(columns, rows, emptyMessage) {
  const headHtml = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const bodyHtml = rows.length
    ? rows.map((row) => `
      <tr>
        ${columns.map((column) => {
          const rawValue = column.getValue(row);
          const value = column.isDate ? formatLookupDate(rawValue) : formatLookupValue(rawValue);
          return `<td>${escapeHtml(value)}</td>`;
        }).join('')}
      </tr>
    `).join('')
    : `<tr><td colspan="${columns.length}" class="quarantine-empty">${escapeHtml(emptyMessage)}</td></tr>`;

  return `
    <div class="table-wrap weekly-table-wrap">
      <table>
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

function renderSerialLookup() {
  const container = document.getElementById('serialLookupPage');
  if (!container) return;

  const lookup = state.serialLookup;
  const current = lookup.current;
  const searchValue = String(lookup.searchTerm || '');
  const foundAnyRecord = Boolean(
    current || lookup.scanOutEvents.length || lookup.archiveRows.length || lookup.paymentHistory.length || lookup.rareCaseHistory.length
  );

  const currentFieldRows = current
    ? [
      { label: 'Serial Number', value: current.serial_number },
      { label: 'Model', value: current.model },
      { label: 'Branch', value: current.branch },
      { label: 'Stock Type', value: current.stock_type },
      { label: 'Status', value: current.status },
      { label: 'Supplier Status', value: current.supplier_status },
      { label: 'Archived', value: lookup.archiveRows.length > 0 ? 'Yes' : 'No' },
      { label: 'IO Number', value: current.io_number },
      { label: 'Source ID', value: current.source_id },
      { label: 'Date Received', value: formatLookupDate(current.date_received) },
      { label: 'Created At', value: formatLookupDate(current.created_at) },
      { label: 'Updated At', value: formatLookupDate(current.updated_at) },
    ].map((item) => `
      <tr>
        <th>${escapeHtml(item.label)}</th>
        <td>${escapeHtml(formatLookupValue(item.value))}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="2" class="quarantine-empty">No current unit record found for this serial.</td></tr>';

  const masterRowsHtml = lookup.masterRows.length
    ? lookup.masterRows.map((row) => `
      <tr>
        <td>
          <button type="button" class="weekly-action-btn" data-role="serial-master-open" data-serial="${escapeHtml(row.serial_number || '')}">
            ${escapeHtml(row.serial_number || '-')}
          </button>
        </td>
        <td>${escapeHtml(formatLookupValue(row.model))}</td>
        <td>${escapeHtml(formatLookupValue(row.branch))}</td>
        <td>${escapeHtml(formatLookupValue(row.stock_type))}</td>
        <td>${escapeHtml(formatLookupValue(row.status))}</td>
        <td>${escapeHtml(formatLookupValue(row.supplier_status))}</td>
        <td>${escapeHtml(formatLookupValue(row.io_number))}</td>
        <td>${escapeHtml(formatLookupValue(row.last_scan_type))}</td>
        <td>${escapeHtml(formatLookupDate(row.last_activity_at))}</td>
        <td>${escapeHtml(formatLookupValue(row.event_count))}</td>
        <td>${Number(row.archive_count || 0) > 0 ? 'Yes' : 'No'}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="11" class="quarantine-empty">${lookup.masterLoading ? 'Loading serial list...' : 'No serials found for this search.'}</td></tr>`;

  const lookupSummaryHtml = lookup.hasSearched
    ? `
      <div class="weekly-cards">
        <div class="weekly-stat-card">
          <div class="weekly-stat-label">Current Unit</div>
          <div class="weekly-stat-value">${current ? 'Yes' : 'No'}</div>
        </div>
        <div class="weekly-stat-card">
          <div class="weekly-stat-label">Scan-outs</div>
          <div class="weekly-stat-value">${lookup.scanOutEvents.length}</div>
        </div>
        <div class="weekly-stat-card">
          <div class="weekly-stat-label">Archive Rows</div>
          <div class="weekly-stat-value">${lookup.archiveRows.length}</div>
        </div>
        <div class="weekly-stat-card">
          <div class="weekly-stat-label">Status Changes</div>
          <div class="weekly-stat-value">${lookup.paymentHistory.length + lookup.rareCaseHistory.length}</div>
        </div>
      </div>
    `
    : '';

  const resultsHtml = !lookup.hasSearched
    ? '<div class="weekly-card"><div class="weekly-card-title">Search Result</div><div style="padding:16px;">Search for a serial number to view its current unit record and history across the dashboard.</div></div>'
    : `
      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Search Result: ${escapeHtml(lookup.searchedSerial)}</div>
        <div style="padding:0 16px 16px 16px;color:#475569;">${lookup.loading ? 'Loading serial history...' : (foundAnyRecord ? 'Showing all matching information found in the dashboard data.' : 'No matching records were found in the current dashboard data.')}</div>
      </div>

      ${lookupSummaryHtml}

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Current Unit</div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <tbody>${currentFieldRows}</tbody>
          </table>
        </div>
      </div>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Scan-out History</div>
        ${renderSerialLookupTable([
          { label: 'Scan Type', getValue: (row) => row.scan_type },
          { label: 'Model', getValue: (row) => row.model },
          { label: 'Branch', getValue: (row) => row.branch },
          { label: 'Client', getValue: (row) => row.client_name },
          { label: 'Payment Status', getValue: (row) => row.payment_status },
          { label: 'IO Number', getValue: (row) => row.io_number },
          { label: 'Invoice', getValue: (row) => row.invoice_number },
          { label: 'PO Number', getValue: (row) => row.po_number },
          { label: 'Source Table', getValue: (row) => row.source_table },
          { label: 'Scanned At', getValue: (row) => row.scanned_at, isDate: true },
        ], lookup.scanOutEvents, 'No scan-out events found for this serial.')}
      </div>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Archive History</div>
        ${renderSerialLookupTable([
          { label: 'Scan Type', getValue: (row) => row.scan_type },
          { label: 'Model', getValue: (row) => row.model },
          { label: 'Branch', getValue: (row) => row.branch },
          { label: 'Client', getValue: (row) => row.client_name },
          { label: 'Payment Status', getValue: (row) => row.payment_status },
          { label: 'Supplier Status', getValue: (row) => row.supplier_status },
          { label: 'IO Number', getValue: (row) => row.uploaded_io_number || row.io_number },
          { label: 'Invoice / PO', getValue: (row) => row.invoice_or_po },
          { label: 'Archived At', getValue: (row) => row.archived_at, isDate: true },
        ], lookup.archiveRows, 'No archive history found for this serial.')}
      </div>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Weekly Payment History</div>
        ${renderSerialLookupTable([
          { label: 'Scan Type', getValue: (row) => row.scan_type },
          { label: 'Model', getValue: (row) => row.model },
          { label: 'Branch', getValue: (row) => row.branch },
          { label: 'Previous Status', getValue: (row) => row.previous_payment_status },
          { label: 'New Status', getValue: (row) => row.new_payment_status },
          { label: 'IO Number', getValue: (row) => row.io_number },
          { label: 'Changed At', getValue: (row) => row.changed_at, isDate: true },
        ], lookup.paymentHistory, 'No weekly payment history found for this serial.')}
      </div>

      <div class="weekly-card">
        <div class="weekly-card-title">Rare Case Changes</div>
        ${renderSerialLookupTable([
          { label: 'Model', getValue: (row) => row.model },
          { label: 'Branch', getValue: (row) => row.branch },
          { label: 'From', getValue: (row) => row.previous_stock_type },
          { label: 'To', getValue: (row) => row.new_stock_type },
          { label: 'IC Number', getValue: (row) => row.ic_number },
          { label: 'Changed By', getValue: (row) => row.changed_by },
          { label: 'Changed At', getValue: (row) => row.changed_at, isDate: true },
        ], lookup.rareCaseHistory, 'No rare case changes found for this serial.')}
      </div>
    `;

  container.innerHTML = `
    <div class="weekly-page weekly-compact">
      <p class="weekly-subtitle">Search one serial number and see its current record plus history across scan-outs, archive, weekly payments, and rare case changes.</p>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Master Serials List</div>
        <form id="serialMasterForm" class="form-grid" style="margin-bottom:12px;">
          <label>
            Search All Serials
            <input type="text" data-role="serial-master-search" value="${escapeHtml(String(lookup.masterSearch || ''))}" placeholder="Search serial, model, branch" ${lookup.masterLoading ? 'disabled' : ''} />
          </label>
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <button type="submit" ${lookup.masterLoading ? 'disabled' : ''}>${lookup.masterLoading ? 'Searching...' : 'Search List'}</button>
            <button type="button" data-role="serial-master-clear" ${lookup.masterLoading ? 'disabled' : ''}>Clear</button>
          </div>
        </form>
        <div style="padding:0 0 10px 0;color:#475569;">Total serials in list: ${lookup.masterRows.length}</div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Model</th>
                <th>Branch</th>
                <th>Stock Type</th>
                <th>Status</th>
                <th>Supplier</th>
                <th>IO</th>
                <th>Last Scan</th>
                <th>Last Activity</th>
                <th>Events</th>
                <th>Archived</th>
              </tr>
            </thead>
            <tbody>${masterRowsHtml}</tbody>
          </table>
        </div>
      </div>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Serial Search</div>
        <form id="serialLookupForm" class="form-grid" style="margin-bottom:0;">
          <label>
            Serial Number
            <input type="text" data-role="serial-lookup-search" value="${escapeHtml(searchValue)}" placeholder="Enter serial number" ${lookup.loading ? 'disabled' : ''} />
          </label>
          <div style="display:flex;gap:8px;align-items:flex-end;">
            <button type="submit" ${lookup.loading ? 'disabled' : ''}>${lookup.loading ? 'Searching...' : 'Search'}</button>
            <button type="button" data-role="serial-lookup-clear" ${lookup.loading ? 'disabled' : ''}>Clear</button>
          </div>
        </form>
      </div>

      ${resultsHtml}
    </div>
  `;
}

async function performSerialLookup() {
  const serialNumber = String(state.serialLookup.searchTerm || '').trim();
  if (!serialNumber) {
    setMessage('Enter a serial number to search.', true);
    renderSerialLookup();
    return;
  }

  state.serialLookup.loading = true;
  state.serialLookup.hasSearched = true;
  state.serialLookup.searchedSerial = serialNumber;
  renderSerialLookup();

  try {
    const query = new URLSearchParams({ serialNumber });
    const data = await api.get(`dashboard/serial-lookup?${query.toString()}`);

    state.serialLookup.loading = false;
    state.serialLookup.searchedSerial = data.serialNumber || serialNumber;
    state.serialLookup.current = data.current || null;
    state.serialLookup.scanOutEvents = data.scanOutEvents || [];
    state.serialLookup.archiveRows = data.archiveRows || [];
    state.serialLookup.paymentHistory = data.paymentHistory || [];
    state.serialLookup.rareCaseHistory = data.rareCaseHistory || [];
    renderSerialLookup();
    setMessage('');
  } catch (error) {
    state.serialLookup.loading = false;
    state.serialLookup.current = null;
    state.serialLookup.scanOutEvents = [];
    state.serialLookup.archiveRows = [];
    state.serialLookup.paymentHistory = [];
    state.serialLookup.rareCaseHistory = [];
    renderSerialLookup();
    setMessage(error.message, true);
  }
}

async function loadUnits() {
  const data = await api.get('dashboard/units');
  document.getElementById('unitsTable').innerHTML = toTable(data.rows || []);
}

async function loadUsers() {
  const data = await api.get('users');
  const rows = data.rows || [];
  state.users.rows = rows;
  state.users.edits = rows.reduce((acc, row) => {
    acc[row.id] = {
      fullName: row.full_name || '',
      username: row.username || '',
      email: row.email || '',
      isActive: Number(row.is_active || 0) === 1,
    };
    return acc;
  }, {});
  renderUsersManagement();
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

async function loadDownloads() {
  const data = await api.get('downloads/apks');
  state.downloads.rows = data.rows || [];
  renderDownloadsPage();
}

function renderDownloadsPage() {
  const container = document.getElementById('downloadsPage');
  if (!container) return;

  const rows = state.downloads.rows || [];
  const rowsHtml = rows.length
    ? rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.name || '-')}</td>
        <td>${escapeHtml(formatFileSize(row.size))}</td>
        <td>${formatDateTime(row.modifiedAt)}</td>
        <td><a href="${escapeHtml(`${appBase}${row.downloadUrl || ''}`)}" target="_blank" rel="noopener">Download</a></td>
      </tr>
    `).join('')
    : '<tr><td colspan="4" class="quarantine-empty">No APK files uploaded yet.</td></tr>';

  container.innerHTML = `
    <div class="weekly-page">
      <p class="weekly-subtitle">Upload Android APK files and share direct download links.</p>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Upload APK</div>
        <form id="apkUploadForm" class="form-grid">
          <label>APK File
            <input type="file" data-role="apk-file-input" accept=".apk" required ${state.downloads.uploading ? 'disabled' : ''} />
          </label>
          <button type="submit" ${state.downloads.uploading ? 'disabled' : ''}>${state.downloads.uploading ? 'Uploading...' : 'Upload APK'}</button>
        </form>
      </div>

      <div class="weekly-card">
        <div class="weekly-card-title">Available APK Downloads</div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>File Name</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function uploadApkFile(file) {
  const formData = new FormData();
  formData.append('apk', file);

  const response = await fetch(`${appBase}api/downloads/apks/upload`, {
    method: 'POST',
    body: formData,
  });

  let body = {};
  try {
    body = await response.json();
  } catch (_error) {
    body = {};
  }

  if (!response.ok) {
    throw new Error(body.message || body.error || `Upload failed (${response.status})`);
  }

  return body;
}

function renderUsersManagement() {
  const container = document.getElementById('usersManagementPage');
  const usersState = state.users;

  const rowsHtml = usersState.rows.length
    ? usersState.rows.map((row) => {
      const userId = Number(row.id || 0);
      const edit = usersState.edits[userId] || {
        fullName: row.full_name || '',
        username: row.username || '',
        email: row.email || '',
        isActive: Number(row.is_active || 0) === 1,
      };
      const isSaving = usersState.savingUserId === userId;
      const isPasswordTarget = usersState.passwordUserId === userId;
      return `
        <tr>
          <td>${escapeHtml(row.id)}</td>
          <td><input class="users-input" type="text" data-role="users-full-name" data-user-id="${userId}" value="${escapeHtml(edit.fullName)}"${isSaving ? ' disabled' : ''} /></td>
          <td><input class="users-input" type="text" data-role="users-username" data-user-id="${userId}" value="${escapeHtml(edit.username)}"${isSaving ? ' disabled' : ''} /></td>
          <td><input class="users-input" type="email" data-role="users-email" data-user-id="${userId}" value="${escapeHtml(edit.email)}"${isSaving ? ' disabled' : ''} /></td>
          <td><input type="checkbox" data-role="users-active" data-user-id="${userId}"${edit.isActive ? ' checked' : ''}${isSaving ? ' disabled' : ''} /></td>
          <td>${formatDateTime(row.last_login_at)}</td>
          <td class="users-action-cell"><button data-role="users-save-row" data-user-id="${userId}"${isSaving ? ' disabled' : ''}>${isSaving ? 'Saving...' : 'Save'}</button></td>
          <td class="users-action-cell"><button data-role="users-target-password" data-user-id="${userId}"${isSaving ? ' disabled' : ''}>${isPasswordTarget ? 'Selected' : 'Set Password'}</button></td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="8" class="quarantine-empty">No users found.</td></tr>';

  const selectedUser = usersState.rows.find((row) => Number(row.id || 0) === Number(usersState.passwordUserId || 0));

  container.innerHTML = `
    <div class="weekly-page">
      <p class="weekly-subtitle">Manage users, credentials, and account status.</p>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Create New User</div>
        <form id="createUserForm" class="form-grid">
          <label>Full Name <input type="text" name="fullName" data-role="create-user-full-name" value="${escapeHtml(usersState.newUser.fullName)}" required /></label>
          <label>Username <input type="text" name="username" data-role="create-user-username" value="${escapeHtml(usersState.newUser.username)}" required /></label>
          <label>Email <input type="email" name="email" data-role="create-user-email" value="${escapeHtml(usersState.newUser.email)}" required /></label>
          <label>Password <input type="password" name="password" data-role="create-user-password" value="${escapeHtml(usersState.newUser.password)}" required /></label>
          <label>Active
            <select name="isActive" data-role="create-user-active">
              <option value="1"${usersState.newUser.isActive ? ' selected' : ''}>Yes</option>
              <option value="0"${usersState.newUser.isActive ? '' : ' selected'}>No</option>
            </select>
          </label>
          <button type="submit"${usersState.creating ? ' disabled' : ''}>${usersState.creating ? 'Creating...' : 'Create User'}</button>
        </form>
      </div>

      <div class="weekly-card weekly-card-spacing">
        <div class="weekly-card-title">Users</div>
        <div class="table-wrap weekly-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Full Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Active</th>
                <th>Last Login</th>
                <th class="users-action-cell">Save</th>
                <th class="users-action-cell">Password</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      </div>

      <div class="weekly-card">
        <div class="weekly-card-title">Set User Password</div>
        <form id="setUserPasswordForm" class="form-grid">
          <label>User
            <input type="text" value="${escapeHtml(selectedUser ? `${selectedUser.full_name} (${selectedUser.username})` : 'Select a user from the table') }" disabled />
          </label>
          <label>New Password
            <input type="password" name="password" data-role="users-password-input" value="${escapeHtml(usersState.passwordValue)}" ${selectedUser ? '' : 'disabled'} required />
          </label>
          <button type="submit" ${selectedUser ? '' : 'disabled'}>${usersState.savingUserId && selectedUser && Number(usersState.savingUserId) === Number(selectedUser.id) ? 'Saving...' : 'Update Password'}</button>
        </form>
      </div>
    </div>
  `;
}

async function saveUserRow(userId) {
  const edit = state.users.edits[userId];
  if (!edit) return;

  state.users.savingUserId = userId;
  renderUsersManagement();

  try {
    await api.put(`users/${userId}`, {
      fullName: String(edit.fullName || '').trim(),
      username: String(edit.username || '').trim(),
      email: String(edit.email || '').trim(),
      isActive: edit.isActive === true,
    });
    setMessage('User details updated.');
    state.users.savingUserId = null;
    await loadUsers();
  } catch (error) {
    state.users.savingUserId = null;
    renderUsersManagement();
    setMessage(error.message, true);
  }
}

async function createUser() {
  const user = state.users.newUser;
  state.users.creating = true;
  renderUsersManagement();

  try {
    await api.post('users', {
      fullName: String(user.fullName || '').trim(),
      username: String(user.username || '').trim(),
      email: String(user.email || '').trim(),
      password: String(user.password || ''),
      isActive: user.isActive === true,
    });
    state.users.creating = false;
    state.users.newUser = {
      fullName: '',
      username: '',
      email: '',
      password: '',
      isActive: true,
    };
    setMessage('User created successfully.');
    await loadUsers();
  } catch (error) {
    state.users.creating = false;
    renderUsersManagement();
    setMessage(error.message, true);
  }
}

async function updateUserPassword() {
  const userId = Number(state.users.passwordUserId || 0);
  if (!userId) {
    setMessage('Select a user before updating a password.', true);
    return;
  }

  state.users.savingUserId = userId;
  renderUsersManagement();

  try {
    await api.put(`users/${userId}/password`, {
      password: String(state.users.passwordValue || ''),
    });
    state.users.savingUserId = null;
    state.users.passwordValue = '';
    setMessage('Password updated successfully.');
    renderUsersManagement();
  } catch (error) {
    state.users.savingUserId = null;
    renderUsersManagement();
    setMessage(error.message, true);
  }
}

async function loadQuarantine() {
  const data = await api.get('dashboard/quarantine');
  state.quarantine.rows = data.rows || [];

  state.quarantine.selectedTargets = state.quarantine.rows.reduce((acc, row) => {
    acc[row.id] = state.quarantine.selectedTargets[row.id] || 'Y';
    return acc;
  }, {});

  state.quarantine.docsReceivedByUnit = state.quarantine.rows.reduce((acc, row) => {
    acc[row.id] = typeof state.quarantine.docsReceivedByUnit[row.id] === 'boolean'
      ? state.quarantine.docsReceivedByUnit[row.id]
      : false;
    return acc;
  }, {});

  state.quarantine.ioNumberByUnit = state.quarantine.rows.reduce((acc, row) => {
    acc[row.id] = String(state.quarantine.ioNumberByUnit[row.id] || '').trim();
    return acc;
  }, {});

  renderQuarantine();
}

function renderQuarantine() {
  const container = document.getElementById('quarantineTable');
  const { rows, page, rowsPerPage, selectedTargets, docsReceivedByUnit, ioNumberByUnit, updatingUnitId } = state.quarantine;
  const paginatedRows = rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  const bodyHtml = paginatedRows.length
    ? paginatedRows.map((row) => {
        const unitId = Number(row.id);
        const selectedTarget = selectedTargets[unitId] || 'Y';
        const docsReceived = docsReceivedByUnit[unitId] === true;
        const ioNumber = String(ioNumberByUnit[unitId] || '').trim();
        const disabledAttr = updatingUnitId === unitId ? ' disabled' : '';
        const actionDisabled = updatingUnitId === unitId || !docsReceived || ioNumber === '' ? ' disabled' : '';

        return `
          <tr>
            <td>${escapeHtml(row.id)}</td>
            <td>${escapeHtml(row.serial_number || '-')}</td>
            <td>${escapeHtml(row.model || row.model_id || '-')}</td>
            <td>${escapeHtml(row.warehouse_id || '-')}</td>
            <td>${escapeHtml(row.stock_type || '-')}</td>
            <td>
              <select class="quarantine-select" data-role="target-select" data-unit-id="${unitId}"${disabledAttr}>
                <option value="Y"${selectedTarget === 'Y' ? ' selected' : ''}>Y</option>
                <option value="B"${selectedTarget === 'B' ? ' selected' : ''}>B</option>
              </select>
            </td>
            <td>
              <input type="checkbox" class="quarantine-checkbox" data-role="docs-checkbox" data-unit-id="${unitId}"${docsReceived ? ' checked' : ''}${disabledAttr} />
            </td>
            <td>
              <input type="text" class="quarantine-input" data-role="quarantine-io-input" data-unit-id="${unitId}" value="${escapeHtml(ioNumber)}" placeholder="Enter IO number"${disabledAttr} />
            </td>
            <td class="quarantine-action-cell">
              <button class="quarantine-action-btn" data-role="release-btn" data-unit-id="${unitId}"${actionDisabled}>${updatingUnitId === unitId ? 'Saving...' : 'MOVE TO TFFW EXCHANGE'}</button>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="9" class="quarantine-empty">No quarantined TFFW Exchange units found.</td></tr>';

  container.innerHTML = `
    <div class="quarantine-page">
      <p class="quarantine-subtitle">TFFW Exchange scan-in units remain here with stock type Q until docs are received and code is set to Y or B.</p>
      <div class="quarantine-card">
        <div class="quarantine-card-title">Quarantine Units</div>
        <div class="table-wrap quarantine-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Serial Number</th>
                <th>Model</th>
                <th>Warehouse</th>
                <th>Current Code</th>
                <th>Change To</th>
                <th>Docs Received</th>
                <th>IO Number</th>
                <th class="quarantine-action-cell">Action</th>
              </tr>
            </thead>
            <tbody>${bodyHtml}</tbody>
          </table>
        </div>
        <div class="quarantine-pagination">
          <label>
            Rows per page:
            <select data-role="rows-per-page" class="quarantine-rows-select">
              <option value="10"${rowsPerPage === 10 ? ' selected' : ''}>10</option>
              <option value="25"${rowsPerPage === 25 ? ' selected' : ''}>25</option>
              <option value="50"${rowsPerPage === 50 ? ' selected' : ''}>50</option>
              <option value="100"${rowsPerPage === 100 ? ' selected' : ''}>100</option>
            </select>
          </label>
          <div class="quarantine-pagination-status">${rows.length ? `${page * rowsPerPage + 1}-${Math.min(rows.length, (page + 1) * rowsPerPage)} of ${rows.length}` : '0-0 of 0'}</div>
          <div class="quarantine-pagination-buttons">
            <button data-role="prev-page"${page <= 0 ? ' disabled' : ''}>‹</button>
            <button data-role="next-page"${page >= totalPages - 1 ? ' disabled' : ''}>›</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

async function handleQuarantineRelease(unitId) {
  const row = state.quarantine.rows.find((item) => Number(item.id) === Number(unitId));
  if (!row) return;

  const docsReceived = state.quarantine.docsReceivedByUnit[unitId] === true;
  if (!docsReceived) {
    setMessage('Confirm docs received before moving a unit from quarantine.', true);
    return;
  }

  const ioNumber = String(state.quarantine.ioNumberByUnit[unitId] || '').trim();
  if (!ioNumber) {
    setMessage('IO number is required before moving from quarantine.', true);
    return;
  }

  state.quarantine.updatingUnitId = unitId;
  renderQuarantine();

  try {
    await api.post('dashboard/quarantine/release', {
      unitId,
      stockType: state.quarantine.selectedTargets[unitId] || 'Y',
      docsReceived: true,
      ioNumber,
    });

    setMessage(`Serial ${row.serial_number} moved to TFFW Exchange with IO ${ioNumber} and status UNPAID_TFFW.`);
    await loadQuarantine();
  } catch (error) {
    setMessage(error.message, true);
    state.quarantine.updatingUnitId = null;
    renderQuarantine();
  }
}

async function loadRareCases() {
  const [data, history] = await Promise.all([
    api.get('dashboard/rare-cases'),
    api.get('dashboard/rare-cases-history'),
  ]);

  state.rareCases.rows = data.rows || [];
  state.rareCases.historyRows = history.rows || [];
  state.rareCases.selectedTargets = state.rareCases.rows.reduce((acc, row) => {
    acc[row.id] = state.rareCases.selectedTargets[row.id] || 'B';
    return acc;
  }, {});

  renderRareCases();
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : date.toLocaleString();
}

function renderRareCases() {
  const container = document.getElementById('rareCasesTable');
  const rare = state.rareCases;
  const rows = rare.rows.slice(rare.page * rare.rowsPerPage, rare.page * rare.rowsPerPage + rare.rowsPerPage);
  const historyRows = rare.historyRows.slice(
    rare.historyPage * rare.historyRowsPerPage,
    rare.historyPage * rare.historyRowsPerPage + rare.historyRowsPerPage,
  );
  const totalPages = Math.max(1, Math.ceil(rare.rows.length / rare.rowsPerPage));
  const totalHistoryPages = Math.max(1, Math.ceil(rare.historyRows.length / rare.historyRowsPerPage));

  const rowsHtml = rows.length
    ? rows.map((row) => {
        const unitId = Number(row.id);
        const disabled = rare.updatingUnitId === unitId ? ' disabled' : '';
        return `
          <tr>
            <td>${escapeHtml(row.id)}</td>
            <td>${escapeHtml(row.serial_number || '-')}</td>
            <td>${escapeHtml(row.model || row.model_id || '-')}</td>
            <td>${escapeHtml(row.warehouse_id || '-')}</td>
            <td>${escapeHtml(row.stock_type || '-')}</td>
            <td>
              <select class="rare-select" data-role="rare-target-select" data-unit-id="${unitId}"${disabled}>
                <option value="B"${(rare.selectedTargets[unitId] || 'B') === 'B' ? ' selected' : ''}>B</option>
                <option value="Y"${rare.selectedTargets[unitId] === 'Y' ? ' selected' : ''}>Y</option>
              </select>
            </td>
            <td class="rare-action-cell">
              <button class="rare-action-btn" data-role="rare-open-dialog" data-unit-id="${unitId}"${disabled}>${rare.updatingUnitId === unitId ? 'Saving...' : 'Update'}</button>
            </td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="7" class="quarantine-empty">No units with stock type A found.</td></tr>';

  const historyHtml = historyRows.length
    ? historyRows.map((row) => `
      <tr>
        <td>${escapeHtml(row.id)}</td>
        <td>${escapeHtml(row.unit_id || '-')}</td>
        <td>${escapeHtml(row.serial_number || '-')}</td>
        <td>${escapeHtml(row.previous_stock_type || '-')}</td>
        <td>${escapeHtml(row.new_stock_type || '-')}</td>
        <td>${escapeHtml(row.ic_number || '-')}</td>
        <td>${escapeHtml(row.changed_by || '-')}</td>
        <td>${formatDateTime(row.changed_at)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="8" class="quarantine-empty">No change history found.</td></tr>';

  const activeRow = rare.rows.find((row) => Number(row.id) === Number(rare.activeUnitId));

  container.innerHTML = `
    <div class="rare-page">
      <p class="rare-subtitle">Units with stock type A. Change to B or Y with IC number confirmation.</p>

      <div class="rare-card rare-card-spacing">
        <div class="rare-card-title">Rare Cases Data</div>
        <div class="table-wrap rare-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Serial Number</th>
                <th>Model</th>
                <th>Warehouse</th>
                <th>Stock Type</th>
                <th>Change To</th>
                <th class="rare-action-cell">Action</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="quarantine-pagination">
          <label>
            Rows per page:
            <select data-role="rare-rows-per-page" class="quarantine-rows-select">
              <option value="10"${rare.rowsPerPage === 10 ? ' selected' : ''}>10</option>
              <option value="25"${rare.rowsPerPage === 25 ? ' selected' : ''}>25</option>
              <option value="50"${rare.rowsPerPage === 50 ? ' selected' : ''}>50</option>
              <option value="100"${rare.rowsPerPage === 100 ? ' selected' : ''}>100</option>
            </select>
          </label>
          <div class="quarantine-pagination-status">${rare.rows.length ? `${rare.page * rare.rowsPerPage + 1}-${Math.min(rare.rows.length, (rare.page + 1) * rare.rowsPerPage)} of ${rare.rows.length}` : '0-0 of 0'}</div>
          <div class="quarantine-pagination-buttons">
            <button data-role="rare-prev-page"${rare.page <= 0 ? ' disabled' : ''}>‹</button>
            <button data-role="rare-next-page"${rare.page >= totalPages - 1 ? ' disabled' : ''}>›</button>
          </div>
        </div>
      </div>

      <div class="rare-card">
        <div class="rare-card-title">Rare Cases History</div>
        <div class="table-wrap rare-table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Unit ID</th>
                <th>Serial Number</th>
                <th>From</th>
                <th>To</th>
                <th>IC Number</th>
                <th>Changed By</th>
                <th>Changed At</th>
              </tr>
            </thead>
            <tbody>${historyHtml}</tbody>
          </table>
        </div>
        <div class="quarantine-pagination">
          <label>
            Rows per page:
            <select data-role="rare-history-rows-per-page" class="quarantine-rows-select">
              <option value="10"${rare.historyRowsPerPage === 10 ? ' selected' : ''}>10</option>
              <option value="25"${rare.historyRowsPerPage === 25 ? ' selected' : ''}>25</option>
              <option value="50"${rare.historyRowsPerPage === 50 ? ' selected' : ''}>50</option>
              <option value="100"${rare.historyRowsPerPage === 100 ? ' selected' : ''}>100</option>
            </select>
          </label>
          <div class="quarantine-pagination-status">${rare.historyRows.length ? `${rare.historyPage * rare.historyRowsPerPage + 1}-${Math.min(rare.historyRows.length, (rare.historyPage + 1) * rare.historyRowsPerPage)} of ${rare.historyRows.length}` : '0-0 of 0'}</div>
          <div class="quarantine-pagination-buttons">
            <button data-role="rare-history-prev-page"${rare.historyPage <= 0 ? ' disabled' : ''}>‹</button>
            <button data-role="rare-history-next-page"${rare.historyPage >= totalHistoryPages - 1 ? ' disabled' : ''}>›</button>
          </div>
        </div>
      </div>

      <div class="rare-dialog${rare.dialogOpen ? ' is-open' : ''}"${rare.dialogOpen ? '' : ' hidden'}>
        <div class="rare-dialog-backdrop" data-role="rare-close-dialog"></div>
        <div class="rare-dialog-panel">
          <div class="rare-dialog-title">Confirm Stock Type Change</div>
          <p class="rare-dialog-copy">${activeRow ? `Serial ${escapeHtml(activeRow.serial_number)} will be changed to stock type ${escapeHtml(rare.selectedTargets[activeRow.id] || 'B')}` : 'Confirm the stock type change below.'}</p>
          <div class="rare-dialog-fields">
            <label>
              IC Number
              <input type="text" data-role="rare-ic-input" value="${escapeHtml(rare.icNumber)}" />
            </label>
            <label>
              User Name
              <input type="text" data-role="rare-user-input" value="${escapeHtml(rare.changedBy)}" />
            </label>
          </div>
          <div class="rare-dialog-actions">
            <button data-role="rare-close-dialog" class="rare-dialog-cancel">Cancel</button>
            <button data-role="rare-confirm-dialog" class="rare-dialog-confirm">${rare.updatingUnitId ? 'Saving...' : 'Confirm'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openRareCasesDialog(unitId) {
  state.rareCases.activeUnitId = unitId;
  state.rareCases.dialogOpen = true;
  state.rareCases.icNumber = '';
  state.rareCases.changedBy = '';
  renderRareCases();
  focusInputByRole('rare-ic-input');
}

function closeRareCasesDialog() {
  if (state.rareCases.updatingUnitId) {
    return;
  }
  state.rareCases.dialogOpen = false;
  state.rareCases.activeUnitId = null;
  state.rareCases.icNumber = '';
  state.rareCases.changedBy = '';
  renderRareCases();
}

async function confirmRareCasesChange() {
  const rare = state.rareCases;
  const unitId = Number(rare.activeUnitId || 0);
  const row = rare.rows.find((item) => Number(item.id) === unitId);
  if (!row) return;

  const icNumber = String(rare.icNumber || '').trim();
  const changedBy = String(rare.changedBy || '').trim();
  if (!icNumber || !changedBy) {
    setMessage('Both IC number and user name are required.', true);
    return;
  }

  rare.updatingUnitId = unitId;
  renderRareCases();

  try {
    await api.post('dashboard/rare-cases/update-stock-type', {
      unitId,
      stockType: rare.selectedTargets[unitId] || 'B',
      icNumber,
      changedBy,
    });
    setMessage(`Serial ${row.serial_number} updated to ${rare.selectedTargets[unitId] || 'B'} successfully by ${changedBy}.`);
    rare.dialogOpen = false;
    rare.activeUnitId = null;
    rare.icNumber = '';
    rare.changedBy = '';
    rare.updatingUnitId = null;
    await loadRareCases();
  } catch (error) {
    rare.updatingUnitId = null;
    renderRareCases();
    setMessage(error.message, true);
  }
}

async function loadTakealot() {
  const data = await api.get('dashboard/takealot');
  state.takealot.rows = data.rows || [];
  renderTakealot();
}

function renderTakealot() {
  const container = document.getElementById('takealotTable');
  const takealot = state.takealot;
  const rows = takealot.rows.slice(takealot.page * takealot.rowsPerPage, takealot.page * takealot.rowsPerPage + takealot.rowsPerPage);
  const totalPages = Math.max(1, Math.ceil(takealot.rows.length / takealot.rowsPerPage));

  const rowsHtml = rows.length
    ? rows.map((row, index) => `
      <tr>
        <td>${escapeHtml(row.serial_number || '-')}</td>
        <td>${escapeHtml(row.model || '-')}</td>
        <td>${escapeHtml(row.branch || '-')}</td>
        <td>${escapeHtml(row.po_number || '-')}</td>
        <td>${escapeHtml(row.supplier_status || '-')}</td>
        <td>${escapeHtml(row.payment_status || '-')}</td>
        <td>${escapeHtml(row.io_number || '-')}</td>
        <td>${formatDateTime(row.created_at)}</td>
        <td class="takealot-action-cell"><button class="takealot-action-btn" data-role="takealot-open-dialog" data-row-index="${takealot.page * takealot.rowsPerPage + index}"${takealot.saving ? ' disabled' : ''}>Add IO</button></td>
      </tr>
    `).join('')
    : '<tr><td colspan="9" class="quarantine-empty">No pending Takealot rows found.</td></tr>';

  container.innerHTML = `
    <div class="takealot-page">
      <p class="takealot-subtitle">Pending Takealot scan-outs waiting for an IO number before they are archived.</p>

      <div class="takealot-cards">
        <div class="takealot-stat-card">
          <div class="takealot-stat-label">Pending Takealot Items</div>
          <div class="takealot-stat-value">${takealot.rows.length}</div>
        </div>
      </div>

      <div class="takealot-card">
        <div class="takealot-card-title">Pending Takealot Scan-outs</div>
        <div class="table-wrap takealot-table-wrap">
          <table>
            <thead>
              <tr>
                <th>Serial Number</th>
                <th>Model</th>
                <th>Branch</th>
                <th>PO Number</th>
                <th>Supplier Status</th>
                <th>Payment Status</th>
                <th>IO Number</th>
                <th>Scanned At</th>
                <th class="takealot-action-cell">Action</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
        <div class="quarantine-pagination">
          <label>
            Rows per page:
            <select data-role="takealot-rows-per-page" class="quarantine-rows-select">
              <option value="10"${takealot.rowsPerPage === 10 ? ' selected' : ''}>10</option>
              <option value="25"${takealot.rowsPerPage === 25 ? ' selected' : ''}>25</option>
              <option value="50"${takealot.rowsPerPage === 50 ? ' selected' : ''}>50</option>
              <option value="100"${takealot.rowsPerPage === 100 ? ' selected' : ''}>100</option>
            </select>
          </label>
          <div class="quarantine-pagination-status">${takealot.rows.length ? `${takealot.page * takealot.rowsPerPage + 1}-${Math.min(takealot.rows.length, (takealot.page + 1) * takealot.rowsPerPage)} of ${takealot.rows.length}` : '0-0 of 0'}</div>
          <div class="quarantine-pagination-buttons">
            <button data-role="takealot-prev-page"${takealot.page <= 0 ? ' disabled' : ''}>‹</button>
            <button data-role="takealot-next-page"${takealot.page >= totalPages - 1 ? ' disabled' : ''}>›</button>
          </div>
        </div>
      </div>

      <div class="takealot-dialog${takealot.dialogOpen ? ' is-open' : ''}"${takealot.dialogOpen ? '' : ' hidden'}>
        <div class="takealot-dialog-backdrop" data-role="takealot-close-dialog"></div>
        <div class="takealot-dialog-panel">
          <div class="takealot-dialog-title">Add IO Number</div>
          <p class="takealot-dialog-copy">${takealot.selectedRow?.serial_number ? `Enter IO number for serial ${escapeHtml(takealot.selectedRow.serial_number)}` : 'Enter IO number for this Takealot item.'}</p>
          <label class="takealot-dialog-field">
            IO Number
            <input type="text" data-role="takealot-io-input" value="${escapeHtml(takealot.ioNumber)}" />
          </label>
          <div class="takealot-dialog-actions">
            <button data-role="takealot-close-dialog" class="takealot-dialog-cancel">Cancel</button>
            <button data-role="takealot-confirm-dialog" class="takealot-dialog-confirm">${takealot.saving ? 'Saving...' : 'Save and Archive'}</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function openTakealotDialog(rowIndex) {
  const row = state.takealot.rows[rowIndex] || null;
  if (!row) {
    return;
  }

  state.takealot.selectedRow = row;
  state.takealot.ioNumber = String(row.io_number || '').trim();
  state.takealot.dialogOpen = true;
  renderTakealot();
  focusInputByRole('takealot-io-input');
}

function closeTakealotDialog() {
  if (state.takealot.saving) {
    return;
  }

  state.takealot.selectedRow = null;
  state.takealot.ioNumber = '';
  state.takealot.dialogOpen = false;
  renderTakealot();
}

async function confirmTakealotIo() {
  const takealot = state.takealot;
  const selectedRow = takealot.selectedRow;
  const ioNumber = String(takealot.ioNumber || '').trim();

  if (!selectedRow?.serial_number) {
    setMessage('Selected row is missing a serial number.', true);
    return;
  }

  if (!ioNumber) {
    setMessage('IO number is required.', true);
    return;
  }

  takealot.saving = true;
  renderTakealot();

  try {
    await api.post('dashboard/weekly-report/archive-item', {
      serialNumber: selectedRow.serial_number,
      ioNumber,
      scanType: 'TAKEALOT',
    });

    takealot.saving = false;
    takealot.dialogOpen = false;
    takealot.selectedRow = null;
    takealot.ioNumber = '';
    setMessage(`Serial ${selectedRow.serial_number} marked as paid and moved to Archive.`);
    await Promise.all([loadTakealot(), loadArchive()]);
  } catch (error) {
    takealot.saving = false;
    renderTakealot();
    setMessage(error.message, true);
  }
}

async function loadWarehouseSource(warehouseId, sourceId) {
  const data = await api.get(`dashboard/units-by-warehouse-source/${warehouseId}/${sourceId}`);
  const warehouse = state.warehouses.find((item) => Number(item.id) === Number(warehouseId));
  const warehouseName = warehouse?.name || warehouse?.warehouse_name || warehouse?.warehouse || warehouse?.title || `Warehouse ${warehouseId}`;
  const sourceName = SOURCE_NAMES[sourceId] || `Source ${sourceId}`;

  document.getElementById('warehouseDataTitle').textContent = `${warehouseName} – ${sourceName}`;
  document.getElementById('warehouseDataTable').innerHTML = toTable(data.rows || []);
}

async function loadSourceUnits(sourceId) {
  const data = await api.get(`dashboard/units-by-source/${sourceId}`);
  const sourceName = SOURCE_NAMES[sourceId] || `Source ${sourceId}`;

  document.getElementById('warehouseDataTitle').textContent = `${sourceName} – All Scanned In Units`;
  document.getElementById('warehouseDataTable').innerHTML = toTable(data.rows || []);
}

async function loadWarehouseScanOut(warehouseId, scanType) {
  const data = await api.get(`dashboard/scan-out-by-warehouse-type/${warehouseId}/${scanType}`);
  const warehouse = state.warehouses.find((item) => Number(item.id) === Number(warehouseId));
  const warehouseName = warehouse?.name || warehouse?.warehouse_name || warehouse?.warehouse || warehouse?.title || `Warehouse ${warehouseId}`;
  const scanName = SCAN_OUT_NAMES[scanType] || scanType;

  document.getElementById('warehouseDataTitle').textContent = `${warehouseName} – ${scanName}`;
  document.getElementById('warehouseDataTable').innerHTML = toTable(data.rows || []);
}

async function loadWarehouseInStock(warehouseId) {
  const data = await api.get(`dashboard/units-in-stock-by-warehouse/${warehouseId}`);
  const warehouse = state.warehouses.find((item) => Number(item.id) === Number(warehouseId));
  const warehouseName = warehouse?.name || warehouse?.warehouse_name || warehouse?.warehouse || warehouse?.title || `Warehouse ${warehouseId}`;

  document.getElementById('warehouseDataTitle').textContent = `${warehouseName} \u2013 Units In Stock`;
  document.getElementById('warehouseDataTable').innerHTML = toTable(data.rows || []);
}

async function loadModels() {
  state.models.loading = true;
  state.models.expandedModelId = null;
  state.models.branchRowsByModel = {};
  state.models.loadingModelId = null;
  state.models.expandedBranchKey = '';
  state.models.unitRowsByBranch = {};
  state.models.loadingBranchKey = '';
  renderModels();
  const warehouseFilterId = Number(state.models.selectedWarehouseFilterId || 0);
  const query = new URLSearchParams();
  if (warehouseFilterId > 0) {
    query.set('warehouseId', String(warehouseFilterId));
  }
  const data = await api.get(`dashboard/models-breakdown${query.toString() ? `?${query.toString()}` : ''}`);
  state.models.modelRows = data.rows || [];
  state.models.loading = false;
  renderModels();
}

function getModelsWarehouseOptions() {
  const optionsById = new Map();

  state.warehouses.forEach((warehouse) => {
    const warehouseId = Number(warehouse.id || 0);
    if (!warehouseId) return;
    optionsById.set(warehouseId, {
      id: warehouseId,
      name: getWarehouseDisplayName(warehouse),
    });
  });

  state.dashboard.warehouseBreakdown.forEach((row) => {
    const warehouseId = Number(row.warehouse_id || 0);
    if (!warehouseId) return;
    if (optionsById.has(warehouseId)) return;
    optionsById.set(warehouseId, {
      id: warehouseId,
      name: String(row.warehouse || `Warehouse ${warehouseId}`),
    });
  });

  return Array.from(optionsById.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function renderModels() {
  const container = document.getElementById('modelsPage');
  if (!container) return;
  const s = state.models;
  const warehouseOptions = getModelsWarehouseOptions();
  const selectedWarehouseFilterId = Number(s.selectedWarehouseFilterId || 0);
  const selectedWarehouseName = selectedWarehouseFilterId > 0
    ? (warehouseOptions.find((option) => option.id === selectedWarehouseFilterId)?.name || `Warehouse ${selectedWarehouseFilterId}`)
    : 'All Warehouses';
  const searchTerm = String(s.searchTerm || '').trim().toLowerCase();
  const filteredRows = searchTerm
    ? s.modelRows.filter((row) => String(row.model_name || '').toLowerCase().includes(searchTerm))
    : s.modelRows;

  if (s.loading) {
    container.innerHTML = '<p style="color:#667085;padding:20px 0">Loading\u2026</p>';
    return;
  }

  const rowsHtml = filteredRows.length
    ? filteredRows.map((row) => {
        const modelId = Number(row.model_id || 0);
        const modelName = String(row.model_name || 'Unknown');
        const totalUnits = Number(row.total_units || 0);
        const isExpanded = modelId === Number(s.expandedModelId || 0);
        const branchRows = s.branchRowsByModel[modelId] || [];
        const visibleBranchRows = selectedWarehouseFilterId > 0
          ? branchRows.filter((branchRow) => Number(branchRow.warehouse_id || 0) === selectedWarehouseFilterId)
          : branchRows;
        const isBranchLoading = Number(s.loadingModelId || 0) === modelId;

        const branchesHtml = isExpanded
          ? `
            <div class="models-detail-card">
              ${isBranchLoading
                ? '<div class="models-panel-empty">Loading branches...</div>'
                : visibleBranchRows.length
                  ? `
                    <div class="models-branch-table-wrap">
                      <table class="models-branch-table">
                        <thead>
                          <tr>
                            <th>Branch</th>
                            <th>Total Units</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          ${visibleBranchRows.map((branchRow) => {
                            const warehouseId = Number(branchRow.warehouse_id || 0);
                            const warehouseName = String(branchRow.warehouse_name || 'Unassigned');
                            const totalBranchUnits = Number(branchRow.total_units || 0);
                            const branchKey = `${modelId}:${warehouseId}`;
                            const isBranchExpanded = s.expandedBranchKey === branchKey;
                            const isUnitsLoading = s.loadingBranchKey === branchKey;
                            const unitRows = s.unitRowsByBranch[branchKey] || [];

                            return `
                              <tr class="models-branch-data-row ${isBranchExpanded ? 'is-open' : ''}">
                                <td>${escapeHtml(warehouseName)}</td>
                                <td class="models-number-cell">${totalBranchUnits}</td>
                                <td class="models-action-cell">
                                  <button type="button" class="models-inline-btn" data-role="models-open-branch"
                                    data-model-id="${modelId}" data-warehouse-id="${warehouseId}" data-branch-key="${branchKey}">
                                    ${isBranchExpanded ? 'Hide Units' : 'Show Units'}
                                  </button>
                                </td>
                              </tr>
                              ${isBranchExpanded ? `
                                <tr class="models-branch-units-row">
                                  <td colspan="3">
                                    <div class="models-units-panel">
                                      ${isUnitsLoading
                                        ? '<div class="models-panel-empty">Loading units...</div>'
                                        : (unitRows.length ? toTable(unitRows) : '<div class="models-panel-empty">No units found for this branch.</div>')}
                                    </div>
                                  </td>
                                </tr>
                              ` : ''}
                            `;
                          }).join('')}
                        </tbody>
                      </table>
                    </div>
                  `
                  : '<div class="models-panel-empty">No units found for this model in the selected warehouse.</div>'}
            </div>
          `
          : '';

        return `
          <tr class="models-table-row ${isExpanded ? 'is-open' : ''}">
            <td>
              <button type="button" class="models-row-toggle" data-role="models-open-model" data-model-id="${modelId}">
                <span class="models-row-toggle-icon">${isExpanded ? '\u2212' : '+'}</span>
                <span class="models-row-toggle-label">${escapeHtml(modelName)}</span>
              </button>
            </td>
            <td class="models-number-cell">${totalUnits}</td>
            <td class="models-hint-cell">${isExpanded ? 'Branches open below' : 'Click to expand branches'}</td>
          </tr>
          ${isExpanded ? `
            <tr class="models-table-detail-row">
              <td colspan="3">${branchesHtml}</td>
            </tr>
          ` : ''}
        `;
      }).join('')
    : '<div class="dashboard-empty">No models found.</div>';

  container.innerHTML = `
    <div class="models-page-shell">
      <div class="model-drill-header">
        <div class="model-drill-subtitle">Warehouse Filter: ${escapeHtml(selectedWarehouseName)}. Expand a model to see matching branches and units.</div>
      </div>
      <div class="models-toolbar">
        <label class="models-search-field">
          <span class="models-search-label">Warehouse</span>
          <select data-role="models-warehouse-filter" class="models-search-input">
            <option value="">All Warehouses</option>
            ${warehouseOptions.map((option) => `<option value="${option.id}"${Number(s.selectedWarehouseFilterId || 0) === option.id ? ' selected' : ''}>${escapeHtml(option.name)}</option>`).join('')}
          </select>
        </label>
        <label class="models-search-field">
          <span class="models-search-label">Search Models</span>
          <input type="text" value="${escapeHtml(s.searchTerm)}" placeholder="Search by model name"
            data-role="models-search" class="models-search-input" />
        </label>
        <div class="models-search-meta">${filteredRows.length} of ${s.modelRows.length} models</div>
      </div>
      ${filteredRows.length
        ? `
          <div class="models-table-shell table-wrap">
            <table class="models-master-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Total Units</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `
        : rowsHtml}
    </div>
  `;
}

function restoreModelsSearchFocus(selectionStart, selectionEnd) {
  window.setTimeout(() => {
    const input = document.querySelector('[data-role="models-search"]');
    if (!(input instanceof HTMLInputElement)) return;

    input.focus();
    const start = typeof selectionStart === 'number' ? selectionStart : input.value.length;
    const end = typeof selectionEnd === 'number' ? selectionEnd : start;
    input.setSelectionRange(start, end);
  }, 0);
}

function setupModelsActions() {
  const container = document.getElementById('modelsPage');
  if (!container) return;

  container.addEventListener('input', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    if (target.dataset.role === 'models-search') {
      const selectionStart = target instanceof HTMLInputElement ? target.selectionStart : null;
      const selectionEnd = target instanceof HTMLInputElement ? target.selectionEnd : null;
      state.models.searchTerm = target.value;
      renderModels();
      restoreModelsSearchFocus(selectionStart, selectionEnd);
      return;
    }

    if (target.dataset.role === 'models-warehouse-filter') {
      state.models.selectedWarehouseFilterId = String(target.value || '');
      loadModels().catch((error) => setMessage(error.message, true));
    }
  });

  container.addEventListener('click', async (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const modelBtn = target.closest('[data-role="models-open-model"]');
    if (modelBtn instanceof HTMLElement) {
      const modelId = Number(modelBtn.dataset.modelId || 0);
      if (!modelId) return;
      const isSameModel = Number(state.models.expandedModelId || 0) === modelId;

      if (isSameModel) {
        state.models.expandedModelId = null;
        state.models.expandedBranchKey = '';
        renderModels();
        return;
      }

      state.models.expandedModelId = modelId;
      state.models.expandedBranchKey = '';

      if (state.models.branchRowsByModel[modelId]) {
        renderModels();
        return;
      }

      state.models.loadingModelId = modelId;
      renderModels();
      try {
        const data = await api.get(`dashboard/models-breakdown/${modelId}/branches`);
        state.models.branchRowsByModel[modelId] = data.rows || [];
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        state.models.loadingModelId = null;
        renderModels();
      }
      return;
    }

    const branchBtn = target.closest('[data-role="models-open-branch"]');
    if (branchBtn instanceof HTMLElement) {
      const modelId = Number(branchBtn.dataset.modelId || 0);
      const warehouseId = Number(branchBtn.dataset.warehouseId || 0);
      const branchKey = String(branchBtn.dataset.branchKey || `${modelId}:${warehouseId}`);
      const isSameBranch = state.models.expandedBranchKey === branchKey;

      if (isSameBranch) {
        state.models.expandedBranchKey = '';
        renderModels();
        return;
      }

      state.models.expandedBranchKey = branchKey;

      if (state.models.unitRowsByBranch[branchKey]) {
        renderModels();
        return;
      }

      state.models.loadingBranchKey = branchKey;
      renderModels();
      try {
        const data = await api.get(`dashboard/models-breakdown/${modelId}/branches/${warehouseId}/units`);
        state.models.unitRowsByBranch[branchKey] = data.rows || [];
      } catch (error) {
        setMessage(error.message, true);
      } finally {
        state.models.loadingBranchKey = '';
        renderModels();
      }
      return;
    }
  });
}

async function loadView(name) {
  setMessage('');
  try {
    if (name === 'summary') await loadSummary();
    if (name === 'models') await loadModels();
    if (name === 'weekly') await loadWeekly();
    if (name === 'archive') await loadArchive();
    if (name === 'serialLookup') await loadSerialLookup();
    if (name === 'users') await loadUsers();
    if (name === 'downloads') await loadDownloads();
    if (name === 'units') await loadUnits();
    if (name === 'quarantine') await loadQuarantine();
    if (name === 'rareCases') await loadRareCases();
    if (name === 'takealot') await loadTakealot();
  } catch (error) {
    setMessage(error.message, true);
  }
}

function switchView(name) {
  state.currentView = name;
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  document.querySelectorAll('.nav-btn, .top-nav-btn').forEach((el) => el.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelectorAll(`[data-view="${name}"]`).forEach((el) => el.classList.add('active'));
  updateNavGroupActiveStates();
  closeNavMenus();
  try {
    window.localStorage.setItem(STORAGE_KEYS.activeView, name);
  } catch (_error) {
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadView(name);
}

function setupGlobalUx() {
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (document.querySelector('.top-nav-group.is-open')) {
      closeNavMenus();
      return;
    }

    if (isDrawerOpen()) {
      closeDrawer();
      return;
    }

    if (state.weekly.dialogOpen) {
      closeWeeklyDialog();
      return;
    }

    if (state.takealot.dialogOpen) {
      closeTakealotDialog();
      return;
    }

    if (state.rareCases.dialogOpen) {
      closeRareCasesDialog();
    }
  });
}

function closeNavMenus(exceptGroup = null) {
  document.querySelectorAll('.top-nav-group.is-open').forEach((group) => {
    if (group === exceptGroup) return;
    group.classList.remove('is-open');
    const toggle = group.querySelector('[data-role="nav-toggle"]');
    if (toggle instanceof HTMLElement) {
      toggle.setAttribute('aria-expanded', 'false');
    }
  });
}

function updateNavGroupActiveStates() {
  document.querySelectorAll('.top-nav-group').forEach((group) => {
    const toggle = group.querySelector('[data-role="nav-toggle"]');
    if (!(toggle instanceof HTMLElement)) return;
    const hasActiveChild = Boolean(group.querySelector('[data-view].active'));
    toggle.classList.toggle('active', hasActiveChild);
  });
}

function setupNav() {
  const nav = document.querySelector('.top-nav');
  if (!nav) return;

  nav.querySelectorAll('[data-role="nav-toggle"]').forEach((toggle) => {
    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const group = toggle.closest('.top-nav-group');
      if (!(group instanceof HTMLElement)) return;

      const shouldOpen = !group.classList.contains('is-open');
      closeNavMenus(group);
      group.classList.toggle('is-open', shouldOpen);
      toggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
    });
  });

  nav.querySelectorAll('[data-view]').forEach((viewButton) => {
    viewButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      const viewName = viewButton.dataset.view;
      if (!viewName) return;
      switchView(viewName);
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target || nav.contains(target)) return;
    closeNavMenus();
  });

  updateNavGroupActiveStates();
}

function isDrawerOpen() {
  const drawer = document.getElementById('warehouseDrawer');
  return drawer && drawer.classList.contains('is-open');
}

function getWarehouseDisplayName(warehouse) {
  return warehouse?.name || warehouse?.warehouse_name || warehouse?.warehouse || warehouse?.title || `Warehouse ${warehouse?.id || ''}`;
}

function updateDrawerSelectionUi() {
  const titleEl = document.getElementById('drawerWarehouseName');
  const selectedWarehouse = state.warehouses.find((item) => Number(item.id) === Number(state.selectedWarehouseId));
  if (titleEl) {
    titleEl.textContent = selectedWarehouse ? getWarehouseDisplayName(selectedWarehouse) : 'Select Warehouse';
  }

  document.querySelectorAll('.drawer-warehouse-btn').forEach((btn) => {
    const isActive = Number(btn.dataset.warehouseId || 0) === Number(state.selectedWarehouseId || 0);
    btn.classList.toggle('is-active', isActive);
  });

  const hasWarehouse = Boolean(state.selectedWarehouseId);
  document.querySelectorAll('.drawer-item').forEach((btn) => {
    btn.disabled = !hasWarehouse;
  });
}

function renderDrawerWarehousePicker() {
  const picker = document.getElementById('drawerWarehousePicker');
  if (!picker) return;

  if (!state.warehouses.length) {
    picker.innerHTML = '<div class="dashboard-empty">No warehouses found.</div>';
    updateDrawerSelectionUi();
    return;
  }

  picker.innerHTML = state.warehouses
    .map((warehouse) => {
      const warehouseName = getWarehouseDisplayName(warehouse);
      return `<button class="drawer-warehouse-btn" data-warehouse-id="${warehouse.id}" title="${escapeHtml(warehouseName)}">${escapeHtml(warehouseName)}</button>`;
    })
    .join('');

  updateDrawerSelectionUi();
}

function openDrawer(warehouseName) {
  const drawer = document.getElementById('warehouseDrawer');
  const backdrop = document.getElementById('warehouseDrawerBackdrop');
  if (!drawer || !backdrop) return;
  drawer.classList.add('is-open');
  backdrop.classList.add('is-open');
  updateDrawerSelectionUi();
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  const drawer = document.getElementById('warehouseDrawer');
  const backdrop = document.getElementById('warehouseDrawerBackdrop');
  if (!drawer || !backdrop) return;
  drawer.classList.remove('is-open');
  backdrop.classList.remove('is-open');
  document.body.style.overflow = '';
}

function setupWarehouseDrawer() {
  const openBtn = document.getElementById('openWarehouseDrawer');
  if (openBtn) {
    openBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openDrawer();
    });
  }

  const closeBtn = document.getElementById('drawerClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', closeDrawer);
  }

  const backdrop = document.getElementById('warehouseDrawerBackdrop');
  if (backdrop) {
    backdrop.addEventListener('click', closeDrawer);
  }

  const drawer = document.getElementById('warehouseDrawer');
  if (drawer) {
    drawer.addEventListener('click', async (event) => {
      const warehouseBtn = event.target.closest('.drawer-warehouse-btn');
      if (warehouseBtn) {
        const warehouseId = Number(warehouseBtn.dataset.warehouseId || 0);
        if (!warehouseId) return;
        state.selectedWarehouseId = warehouseId;
        updateDrawerSelectionUi();
        return;
      }

      const item = event.target.closest('.drawer-item');
      if (!item) return;

      if (!state.selectedWarehouseId) {
        setMessage('Please select a warehouse first.', true);
        return;
      }

      const sourceId = item.dataset.sourceId ? Number(item.dataset.sourceId) : null;
      const scanType = item.dataset.scanType || null;

      closeDrawer();

      try {
        switchView('warehouseData');
        if (sourceId) {
          await loadWarehouseSource(state.selectedWarehouseId, sourceId);
        } else if (scanType) {
          await loadWarehouseScanOut(state.selectedWarehouseId, scanType);
        }
      } catch (error) {
        setMessage(error.message, true);
      }
    });
  }
}

async function loadWarehouses() {
  try {
    const data = await api.get('dashboard/warehouses');
    state.warehouses = (data.rows || []).slice(0, 4);
    if (!state.selectedWarehouseId && state.warehouses.length) {
      state.selectedWarehouseId = Number(state.warehouses[0].id);
    }
  } catch (error) {
    state.warehouses = [];
    state.selectedWarehouseId = null;
  }
  renderDrawerWarehousePicker();
}

function setupScanoutForm() {
  const form = document.getElementById('scanoutForm');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries());

    try {
      const result = await api.post('scanout/process', payload);
      setMessage(`Scan saved for ${result.serialNumber} (${result.scanType})`);
      form.reset();
    } catch (error) {
      setMessage(error.message, true);
    }
  });
}

function setupQuarantineActions() {
  const container = document.getElementById('quarantineTable');
  container.addEventListener('change', (event) => {
    const target = event.target;
    if (target.dataset.role === 'target-select') {
      const unitId = Number(target.dataset.unitId || 0);
      state.quarantine.selectedTargets[unitId] = target.value;
      return;
    }

    if (target.dataset.role === 'docs-checkbox') {
      const unitId = Number(target.dataset.unitId || 0);
      state.quarantine.docsReceivedByUnit[unitId] = target.checked;
      renderQuarantine();
      return;
    }

    if (target.dataset.role === 'quarantine-io-input') {
      const unitId = Number(target.dataset.unitId || 0);
      state.quarantine.ioNumberByUnit[unitId] = String(target.value || '');
      renderQuarantine();
      return;
    }

    if (target.dataset.role === 'rows-per-page') {
      state.quarantine.rowsPerPage = Number(target.value || 10);
      state.quarantine.page = 0;
      renderQuarantine();
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'release-btn') {
      const unitId = Number(target.dataset.unitId || 0);
      if (unitId) {
        handleQuarantineRelease(unitId);
      }
      return;
    }

    if (target.dataset.role === 'prev-page' && state.quarantine.page > 0) {
      state.quarantine.page -= 1;
      renderQuarantine();
      return;
    }

    if (target.dataset.role === 'next-page') {
      const totalPages = Math.max(1, Math.ceil(state.quarantine.rows.length / state.quarantine.rowsPerPage));
      if (state.quarantine.page < totalPages - 1) {
        state.quarantine.page += 1;
        renderQuarantine();
      }
    }
  });
}

function setupRareCasesActions() {
  const container = document.getElementById('rareCasesTable');
  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'rare-target-select') {
      const select = target;
      const unitId = Number(select.dataset.unitId || 0);
      state.rareCases.selectedTargets[unitId] = select.value;
      return;
    }

    if (target.dataset.role === 'rare-rows-per-page') {
      state.rareCases.rowsPerPage = Number(target.value || 10);
      state.rareCases.page = 0;
      renderRareCases();
      return;
    }

    if (target.dataset.role === 'rare-history-rows-per-page') {
      state.rareCases.historyRowsPerPage = Number(target.value || 10);
      state.rareCases.historyPage = 0;
      renderRareCases();
      return;
    }

    if (target.dataset.role === 'rare-ic-input') {
      state.rareCases.icNumber = target.value;
      return;
    }

    if (target.dataset.role === 'rare-user-input') {
      state.rareCases.changedBy = target.value;
    }
  });

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.role === 'rare-ic-input') {
      state.rareCases.icNumber = target.value;
    }
    if (target.dataset.role === 'rare-user-input') {
      state.rareCases.changedBy = target.value;
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'rare-open-dialog') {
      openRareCasesDialog(Number(target.dataset.unitId || 0));
      return;
    }

    if (target.dataset.role === 'rare-close-dialog') {
      closeRareCasesDialog();
      return;
    }

    if (target.dataset.role === 'rare-confirm-dialog') {
      confirmRareCasesChange();
      return;
    }

    if (target.dataset.role === 'rare-prev-page' && state.rareCases.page > 0) {
      state.rareCases.page -= 1;
      renderRareCases();
      return;
    }

    if (target.dataset.role === 'rare-next-page') {
      const totalPages = Math.max(1, Math.ceil(state.rareCases.rows.length / state.rareCases.rowsPerPage));
      if (state.rareCases.page < totalPages - 1) {
        state.rareCases.page += 1;
        renderRareCases();
      }
      return;
    }

    if (target.dataset.role === 'rare-history-prev-page' && state.rareCases.historyPage > 0) {
      state.rareCases.historyPage -= 1;
      renderRareCases();
      return;
    }

    if (target.dataset.role === 'rare-history-next-page') {
      const totalPages = Math.max(1, Math.ceil(state.rareCases.historyRows.length / state.rareCases.historyRowsPerPage));
      if (state.rareCases.historyPage < totalPages - 1) {
        state.rareCases.historyPage += 1;
        renderRareCases();
      }
    }
  });
}

function setupWeeklyActions() {
  const container = document.getElementById('weeklyReportPage');
  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.role === 'weekly-io-input') {
      state.weekly.ioNumber = target.value;
      return;
    }

    if (target.dataset.role === 'weekly-filter-serial') {
      state.weekly.serialSearch = target.value;
      return;
    }

    if (target.dataset.role === 'weekly-paid-filter-branch') {
      state.weekly.paidBranchFilter = target.value;
      return;
    }

    if (target.dataset.role === 'weekly-paid-filter-serial') {
      state.weekly.paidSerialSearch = target.value;
      return;
    }

    if (target.dataset.role === 'weekly-bulk-io-input') {
      state.weekly.bulkIoNumber = target.value;
    }
  });

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'weekly-paid-filter-branch') {
      state.weekly.paidBranchFilter = getWeeklyBranchOptions().includes(target.value)
        ? target.value
        : '';
      return;
    }

    if (target.dataset.role === 'weekly-filter-stock-type') {
      state.weekly.stockTypeFilter = target.value;
      return;
    }

    if (target.dataset.role === 'weekly-select-all') {
      toggleWeeklySelectAll(Boolean(target.checked));
      return;
    }

    if (target.dataset.role === 'weekly-select-row') {
      const rowKey = String(target.dataset.rowKey || '');
      if (rowKey === '') return;
      if (target.checked) {
        state.weekly.selectedKeys[rowKey] = true;
      } else {
        delete state.weekly.selectedKeys[rowKey];
      }
      renderWeeklyReport();
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'weekly-select-branch') {
      state.weekly.selectedBranch = String(target.dataset.branch || '').trim();
      state.weekly.selectedKeys = {};
      state.weekly.bulkIoNumber = '';
      loadWeekly().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'weekly-change-branch') {
      state.weekly.selectedBranch = '';
      state.weekly.serialSearch = '';
      state.weekly.stockTypeFilter = '';
      state.weekly.selectedKeys = {};
      state.weekly.bulkIoNumber = '';
      loadWeekly().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'weekly-apply-filters') {
      loadWeekly().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'weekly-clear-filters') {
      state.weekly.serialSearch = '';
      state.weekly.stockTypeFilter = '';
      loadWeekly().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'weekly-apply-paid-filters') {
      loadWeekly().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'weekly-clear-paid-filters') {
      state.weekly.paidBranchFilter = '';
      state.weekly.paidSerialSearch = '';
      loadWeekly().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'weekly-export-paid') {
      const query = new URLSearchParams();
      const branch = String(state.weekly.paidBranchFilter || '').trim();
      const serialNumber = String(state.weekly.paidSerialSearch || '').trim();

      if (branch) {
        query.set('branch', branch);
      }
      if (serialNumber) {
        query.set('serialNumber', serialNumber);
      }

      const href = `${appBase}api/dashboard/weekly-report-payment-history/export${query.toString() ? `?${query.toString()}` : ''}`;
      window.location.href = href;
      return;
    }

    if (target.dataset.role === 'weekly-apply-bulk-io') {
      confirmWeeklyBulkIo();
      return;
    }

    if (target.dataset.role === 'weekly-open-dialog') {
      openWeeklyDialog(Number(target.dataset.rowIndex || 0));
      return;
    }
    if (target.dataset.role === 'weekly-close-dialog') {
      closeWeeklyDialog();
      return;
    }
    if (target.dataset.role === 'weekly-confirm-dialog') {
      confirmWeeklyIo();
    }
  });
}

function setupTakealotActions() {
  const container = document.getElementById('takealotTable');

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'takealot-rows-per-page') {
      state.takealot.rowsPerPage = Number(target.value || 10);
      state.takealot.page = 0;
      renderTakealot();
    }
  });

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'takealot-io-input') {
      state.takealot.ioNumber = target.value;
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'takealot-open-dialog') {
      openTakealotDialog(Number(target.dataset.rowIndex || 0));
      return;
    }

    if (target.dataset.role === 'takealot-close-dialog') {
      closeTakealotDialog();
      return;
    }

    if (target.dataset.role === 'takealot-confirm-dialog') {
      confirmTakealotIo();
      return;
    }

    if (target.dataset.role === 'takealot-prev-page' && state.takealot.page > 0) {
      state.takealot.page -= 1;
      renderTakealot();
      return;
    }

    if (target.dataset.role === 'takealot-next-page') {
      const totalPages = Math.max(1, Math.ceil(state.takealot.rows.length / state.takealot.rowsPerPage));
      if (state.takealot.page < totalPages - 1) {
        state.takealot.page += 1;
        renderTakealot();
      }
    }
  });
}

function setupDashboardActions() {
  const container = document.getElementById('summaryCards');

  container.addEventListener('click', async (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target) return;

    const sourceButton = target.closest('[data-role="dashboard-open-source"]');
    if (sourceButton) {
      const sourceId = Number(sourceButton.dataset.sourceId || 0);
      if (!sourceId) return;

      try {
        switchView('warehouseData');
        await loadSourceUnits(sourceId);
      } catch (error) {
        setMessage(error.message, true);
      }
      return;
    }

    const warehouseButton = target.closest('[data-role="dashboard-open-warehouse"]');
    if (warehouseButton) {
      const warehouseId = Number(warehouseButton.dataset.warehouseId || 0);
      if (!warehouseId) return;
      state.selectedWarehouseId = warehouseId;
      updateDrawerSelectionUi();

      try {
        switchView('warehouseData');
        await loadWarehouseInStock(warehouseId);
      } catch (error) {
        setMessage(error.message, true);
      }
      return;
    }

    const warehouseModelsButton = target.closest('[data-role="dashboard-open-models-warehouse"]');
    if (warehouseModelsButton) {
      const warehouseId = Number(warehouseModelsButton.dataset.warehouseId || 0);
      if (!warehouseId) return;

      state.models.selectedWarehouseFilterId = String(warehouseId);
      switchView('models');
      return;
    }

    if (target.closest('[data-role="dashboard-open-weekly"]')) {
      switchView('weekly');
      return;
    }

    if (target.closest('[data-role="dashboard-open-weekly-report"]')) {
      switchView('weekly');
      return;
    }

    const weeklySerialButton = target.closest('[data-role="dashboard-open-weekly-serial"]');
    if (weeklySerialButton) {
      const serial = String(weeklySerialButton.dataset.serial || '').trim();
      const branch = String(weeklySerialButton.dataset.branch || '').trim();
      if (!serial) return;

      state.weekly.selectedBranch = branch;
      state.weekly.serialSearch = serial;
      state.weekly.stockTypeFilter = '';
      state.weekly.selectedKeys = {};
      state.weekly.bulkIoNumber = '';
      state.weekly.pendingOpenSerial = serial;
      switchView('weekly');
    }
  });
}

function setupArchiveActions() {
  const container = document.getElementById('archiveTable');
  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'archive-filter-branch') {
      state.archive.branchFilter = target.value;
      return;
    }

    if (target.dataset.role === 'archive-filter-serial') {
      state.archive.serialSearch = target.value;
    }
  });

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'archive-rows-per-page') {
      state.archive.rowsPerPage = Number(target.value || 10);
      state.archive.page = 0;
      renderArchive();
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'archive-apply-filters') {
      state.archive.page = 0;
      loadArchive().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'archive-clear-filters') {
      state.archive.branchFilter = '';
      state.archive.serialSearch = '';
      state.archive.page = 0;
      loadArchive().catch((error) => setMessage(error.message, true));
      return;
    }

    if (target.dataset.role === 'archive-prev-page' && state.archive.page > 0) {
      state.archive.page -= 1;
      renderArchive();
      return;
    }

    if (target.dataset.role === 'archive-next-page') {
      const totalPages = Math.max(1, Math.ceil(state.archive.rows.length / state.archive.rowsPerPage));
      if (state.archive.page < totalPages - 1) {
        state.archive.page += 1;
        renderArchive();
      }
    }
  });
}

function setupUsersActions() {
  const container = document.getElementById('usersManagementPage');

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'users-full-name') {
      const userId = Number(target.dataset.userId || 0);
      if (!state.users.edits[userId]) return;
      state.users.edits[userId].fullName = target.value;
      return;
    }

    if (target.dataset.role === 'users-username') {
      const userId = Number(target.dataset.userId || 0);
      if (!state.users.edits[userId]) return;
      state.users.edits[userId].username = target.value;
      return;
    }

    if (target.dataset.role === 'users-email') {
      const userId = Number(target.dataset.userId || 0);
      if (!state.users.edits[userId]) return;
      state.users.edits[userId].email = target.value;
      return;
    }

    if (target.dataset.role === 'users-password-input') {
      state.users.passwordValue = target.value;
      return;
    }

    if (target.dataset.role === 'create-user-full-name') {
      state.users.newUser.fullName = target.value;
      return;
    }

    if (target.dataset.role === 'create-user-username') {
      state.users.newUser.username = target.value;
      return;
    }

    if (target.dataset.role === 'create-user-email') {
      state.users.newUser.email = target.value;
      return;
    }

    if (target.dataset.role === 'create-user-password') {
      state.users.newUser.password = target.value;
      return;
    }

    if (target.dataset.role === 'create-user-active') {
      state.users.newUser.isActive = String(target.value) === '1';
    }
  });

  container.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'users-active') {
      const userId = Number(target.dataset.userId || 0);
      if (!state.users.edits[userId]) return;
      state.users.edits[userId].isActive = target.checked;
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'users-save-row') {
      const userId = Number(target.dataset.userId || 0);
      if (userId) {
        saveUserRow(userId);
      }
      return;
    }

    if (target.dataset.role === 'users-target-password') {
      const userId = Number(target.dataset.userId || 0);
      if (!userId) return;
      state.users.passwordUserId = userId;
      state.users.passwordValue = '';
      renderUsersManagement();
    }
  });

  container.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;

    if (form.id === 'createUserForm') {
      event.preventDefault();
      createUser();
      return;
    }

    if (form.id === 'setUserPasswordForm') {
      event.preventDefault();
      updateUserPassword();
    }
  });
}

function setupSerialLookupActions() {
  const container = document.getElementById('serialLookupPage');
  if (!container) return;

  container.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'serial-lookup-search') {
      state.serialLookup.searchTerm = target.value;
      return;
    }

    if (target.dataset.role === 'serial-master-search') {
      state.serialLookup.masterSearch = target.value;
    }
  });

  container.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.dataset.role === 'serial-lookup-clear') {
      state.serialLookup.searchTerm = '';
      state.serialLookup.searchedSerial = '';
      state.serialLookup.current = null;
      state.serialLookup.scanOutEvents = [];
      state.serialLookup.archiveRows = [];
      state.serialLookup.paymentHistory = [];
      state.serialLookup.rareCaseHistory = [];
      state.serialLookup.hasSearched = false;
      renderSerialLookup();
      setMessage('');
      return;
    }

    if (target.dataset.role === 'serial-master-clear') {
      state.serialLookup.masterSearch = '';
      loadSerialMasterList();
      return;
    }

    if (target.dataset.role === 'serial-master-open') {
      const serialNumber = String(target.dataset.serial || '').trim();
      if (!serialNumber) return;
      state.serialLookup.searchTerm = serialNumber;
      performSerialLookup();
    }
  });

  container.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    event.preventDefault();

    if (form.id === 'serialLookupForm') {
      performSerialLookup();
      return;
    }

    if (form.id === 'serialMasterForm') {
      loadSerialMasterList();
    }
  });
}

function setupDownloadsActions() {
  const container = document.getElementById('downloadsPage');
  if (!container) return;

  container.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== 'apkUploadForm') return;

    event.preventDefault();
    const input = form.querySelector('[data-role="apk-file-input"]');
    if (!(input instanceof HTMLInputElement) || !input.files || !input.files[0]) {
      setMessage('Please select an APK file to upload.', true);
      return;
    }

    const file = input.files[0];
    if (!file.name.toLowerCase().endsWith('.apk')) {
      setMessage('Only .apk files are allowed.', true);
      return;
    }

    state.downloads.uploading = true;
    renderDownloadsPage();

    try {
      await uploadApkFile(file);
      setMessage(`Uploaded ${file.name} successfully.`);
      state.downloads.uploading = false;
      await loadDownloads();
    } catch (error) {
      state.downloads.uploading = false;
      renderDownloadsPage();
      setMessage(error.message, true);
    }
  });
}

(async function init() {
  setupGlobalUx();
  setupNav();
  setupWarehouseDrawer();
  setupScanoutForm();
  setupQuarantineActions();
  setupRareCasesActions();
  setupWeeklyActions();
  setupTakealotActions();
  setupArchiveActions();
  setupSerialLookupActions();
  setupUsersActions();
  setupDownloadsActions();
  setupModelsActions();
  setupDashboardActions();
  await checkHealth();
  await loadWarehouses();

  let initialView = 'summary';
  try {
    const savedView = window.localStorage.getItem(STORAGE_KEYS.activeView);
    if (savedView && document.getElementById(`view-${savedView}`)) {
      initialView = savedView;
    }
  } catch (_error) {
  }

  switchView(initialView);

  window.setInterval(async () => {
    if (state.currentView !== 'summary') return;
    try {
      await loadSummary(true);
    } catch (_error) {
      state.dashboard.refreshing = false;
    }
  }, 15000);
})();
