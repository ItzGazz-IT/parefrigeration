<?php
declare(strict_types=1);
session_start();
$basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/');
$basePath = ($basePath === '' ? '/' : $basePath . '/');
$isLoggedIn = isset($_SESSION['user_id']);
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Admin Dashboard (PHP)</title>
  <link rel="stylesheet" href="<?= htmlspecialchars($basePath, ENT_QUOTES, 'UTF-8') ?>assets/style.css" />
</head>
<body>
  <div class="background" aria-hidden="true">
    <span class="ball"></span>
    <span class="ball"></span>
    <span class="ball"></span>
    <span class="ball"></span>
    <span class="ball"></span>
    <span class="ball"></span>
    <span class="ball"></span>
    <span class="ball"></span>
  </div>

  <?php if (!$isLoggedIn): ?>
  <div id="loginPage" class="login-page">
    <div class="login-container">
      <div class="login-card">
        <div class="login-header">
          <h1 class="login-title">PA Refrigeration</h1>
          <p class="login-subtitle">Inventory Management System</p>
        </div>
        <form id="loginForm" class="login-form">
          <div class="login-field">
            <label for="loginEmail" class="login-label">Email or Username</label>
            <input 
              id="loginEmail" 
              type="text" 
              name="email" 
              placeholder="Enter your email or username" 
              required 
              class="login-input"
              autocomplete="username"
            />
          </div>
          <div class="login-field">
            <label for="loginPassword" class="login-label">Password</label>
            <input 
              id="loginPassword" 
              type="password" 
              name="password" 
              placeholder="Enter your password" 
              required 
              class="login-input"
              autocomplete="current-password"
            />
          </div>
          <div id="loginError" class="login-error"></div>
          <button type="submit" class="login-btn">Sign In</button>
        </form>
      </div>
      <div class="login-footer">
        <small>Default users: gareth, marnus, greg (temporary password: ChangeMe!2026)</small>
      </div>
    </div>
  </div>
  <?php endif; ?>

  <div id="dashboardApp" style="display: <?= $isLoggedIn ? 'block' : 'none'; ?>;">
  <header class="topbar">
    <div class="topbar-brand">PA Refrigeration</div>
    <nav class="top-nav" aria-label="Primary navigation">
      <button data-view="summary" class="top-nav-btn active">Dashboard</button>
      <button data-view="models" class="top-nav-btn">Models</button>
      <button data-view="weekly" class="top-nav-btn">Weekly Report</button>

      <div class="top-nav-group" data-nav-group>
        <button type="button" class="top-nav-btn top-nav-dropdown-toggle" data-role="nav-toggle" aria-expanded="false">
          Operations
          <span class="top-nav-dropdown-icon">&#9662;</span>
        </button>
        <div class="top-nav-group-menu" role="menu" aria-label="Operations">
          <button data-view="quarantine" class="top-nav-btn top-nav-menu-btn" role="menuitem">Quarantine</button>
          <button data-view="rareCases" class="top-nav-btn top-nav-menu-btn" role="menuitem">Rare Cases</button>
          <button data-view="takealot" class="top-nav-btn top-nav-menu-btn" role="menuitem">Takealot</button>
          <button data-view="archive" class="top-nav-btn top-nav-menu-btn" role="menuitem">Archive</button>
        </div>
      </div>

      <div class="top-nav-group" data-nav-group>
        <button type="button" class="top-nav-btn top-nav-dropdown-toggle" data-role="nav-toggle" aria-expanded="false">
          Admin
          <span class="top-nav-dropdown-icon">&#9662;</span>
        </button>
        <div class="top-nav-group-menu" role="menu" aria-label="Admin">
          <button data-view="serialLookup" class="top-nav-btn top-nav-menu-btn" role="menuitem">Serial Lookup</button>
          <button data-view="users" class="top-nav-btn top-nav-menu-btn" role="menuitem">Users</button>
          <button data-view="downloads" class="top-nav-btn top-nav-menu-btn" role="menuitem">Downloads</button>
        </div>
      </div>

      <hr class="topbar-sep" />
      <button id="openWarehouseDrawer" class="top-nav-btn top-nav-btn-warehouse">&#9776; Warehouses</button>
    </nav>
    <div class="topbar-actions">
      <div id="healthBadge" class="badge pending">Checking API…</div>
      <button id="logoutBtn" class="logout-btn" title="Logout">Sign Out</button>
    </div>
  </header>

  <main class="layout">
    <!-- Warehouse Drawer -->
    <div id="warehouseDrawerBackdrop" class="drawer-backdrop"></div>
    <aside id="warehouseDrawer" class="drawer" aria-label="Warehouse Actions">
      <div class="drawer-header">
        <div>
          <div class="drawer-title" id="drawerWarehouseName">Warehouse</div>
          <div class="drawer-subtitle">Pick a warehouse, then select an action</div>
        </div>
        <button class="drawer-close" id="drawerClose" aria-label="Close">&#x2715;</button>
      </div>

      <div class="drawer-section">
        <div class="drawer-section-heading">WAREHOUSE</div>
        <div id="drawerWarehousePicker" class="drawer-warehouse-picker"></div>
      </div>

      <div class="drawer-sep"></div>

      <div class="drawer-section">
        <div class="drawer-section-heading">SCAN IN</div>
        <button class="drawer-item" data-source-id="1">
          <span class="drawer-item-icon">&#8599;</span>
          <span class="drawer-item-label">TFFW Swaziland</span>
        </button>
        <button class="drawer-item" data-source-id="2">
          <span class="drawer-item-icon">&#8599;</span>
          <span class="drawer-item-label">TFFW Durban</span>
        </button>
        <button class="drawer-item" data-source-id="3">
          <span class="drawer-item-icon">&#8599;</span>
          <span class="drawer-item-label">TFFW Midrand</span>
        </button>
        <button class="drawer-item" data-source-id="4">
          <span class="drawer-item-icon">&#8599;</span>
          <span class="drawer-item-label">TFFW Exchange</span>
        </button>
        <button class="drawer-item" data-source-id="5">
          <span class="drawer-item-icon">&#8599;</span>
          <span class="drawer-item-label">Inhouse Exchange</span>
        </button>
        <button class="drawer-item" data-source-id="6">
          <span class="drawer-item-icon">&#8599;</span>
          <span class="drawer-item-label">Bought Back</span>
        </button>
      </div>

      <div class="drawer-sep"></div>

      <div class="drawer-section">
        <div class="drawer-section-heading">SCAN OUT</div>
        <button class="drawer-item" data-scan-type="ACTUAL_SALE">
          <span class="drawer-item-icon">&#8600;</span>
          <span class="drawer-item-label">Actual Sale</span>
        </button>
        <button class="drawer-item" data-scan-type="TFFW_EXCHANGE">
          <span class="drawer-item-icon">&#8600;</span>
          <span class="drawer-item-label">TFFW Exchange</span>
        </button>
        <button class="drawer-item" data-scan-type="INHOUSE_EXCHANGE">
          <span class="drawer-item-icon">&#8600;</span>
          <span class="drawer-item-label">Inhouse Exchange</span>
        </button>
        <button class="drawer-item" data-scan-type="TAKEALOT">
          <span class="drawer-item-icon">&#8600;</span>
          <span class="drawer-item-label">Takealot</span>
        </button>
        <button class="drawer-item" data-scan-type="TFF_DEALER">
          <span class="drawer-item-icon">&#8600;</span>
          <span class="drawer-item-label">TFF Dealer</span>
        </button>
      </div>
    </aside>

    <section class="content">
      <div id="message" class="message" hidden></div>

      <section id="view-models" class="view">
        <h2>Models</h2>
        <div id="modelsPage"></div>
      </section>

      <section id="view-summary" class="view active">
        <h2>Dashboard</h2>
        <div id="summaryCards" class="cards"></div>
      </section>

      <section id="view-weekly" class="view">
        <h2>Weekly Report</h2>
        <div id="weeklyReportPage"></div>
      </section>

      <section id="view-archive" class="view">
        <h2>Archive</h2>
        <div id="archiveTable"></div>
      </section>

      <section id="view-serialLookup" class="view">
        <h2>Serial Lookup</h2>
        <div id="serialLookupPage"></div>
      </section>

      <section id="view-users" class="view">
        <h2>User Management</h2>
        <div id="usersManagementPage"></div>
      </section>

      <section id="view-downloads" class="view">
        <h2>Downloads</h2>
        <div id="downloadsPage"></div>
      </section>

      <section id="view-units" class="view">
        <h2>Units</h2>
        <div id="unitsTable"></div>
      </section>

      <section id="view-quarantine" class="view">
        <h2>Quarantine</h2>
        <div id="quarantineTable"></div>
      </section>

      <section id="view-rareCases" class="view">
        <h2>Rare Cases</h2>
        <div id="rareCasesTable"></div>
      </section>

      <section id="view-takealot" class="view">
        <h2>Takealot</h2>
        <div id="takealotTable"></div>
      </section>

      <section id="view-scanout" class="view">
        <h2>Scan Out</h2>
        <form id="scanoutForm" class="form-grid">
          <label>Scan Type
            <select name="scanType" required>
              <option value="ACTUAL_SALE">ACTUAL_SALE</option>
              <option value="TFFW_EXCHANGE">TFFW_EXCHANGE</option>
              <option value="INHOUSE_EXCHANGE">INHOUSE_EXCHANGE</option>
              <option value="TAKEALOT">TAKEALOT</option>
              <option value="TFF_DEALER">TFF_DEALER</option>
            </select>
          </label>
          <label>Serial Number <input name="serialNumber" required /></label>
          <label>Client Name <input name="clientName" /></label>
          <label>Invoice Type <input name="invoiceType" /></label>
          <label>Invoice Number <input name="invoiceNumber" /></label>
          <label>IO Number <input name="ioNumber" /></label>
          <label>PO Number <input name="poNumber" /></label>
          <label>Scanned By <input name="scannedBy" /></label>
          <button type="submit">Process Scan Out</button>
        </form>
      </section>

      <section id="view-warehouseData" class="view">
        <h2 id="warehouseDataTitle">Warehouse Data</h2>
        <div id="warehouseDataTable"></div>
      </section>
    </section>
  </main>
  </div>

  <script>window.__APP_BASE__ = "<?= htmlspecialchars($basePath, ENT_QUOTES, 'UTF-8') ?>";</script>
  <script src="<?= htmlspecialchars($basePath, ENT_QUOTES, 'UTF-8') ?>assets/app.js"></script>
</body>
</html>
