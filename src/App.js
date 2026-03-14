import { useEffect, useMemo, useState } from 'react';
import { Alert, AppBar, Box, Button, CircularProgress, CssBaseline, Paper, Toolbar, Typography } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { apiGet } from './api';
import Sidebar from './components/Sidebar';
import theme from './theme';
import Dashboard from './pages/Dashboard';
import UnitsPage from './pages/UnitsPage';
import SalesPage from './pages/SalesPage';
import ModelsPage from './pages/ModelsPage';
import WarehousesPage from './pages/WarehousesPage';
import QuarantinePage from './pages/QuarantinePage';
import WeeklyReportPage from './pages/WeeklyReportPage';
import ExchangesPage from './pages/ExchangesPage';
import InhouseExchangesPage from './pages/InhouseExchangesPage';
import BoughtBackPage from './pages/BoughtBackPage';
import RareCasesPage from './pages/RareCasesPage';
import ScannedInSource4Page from './pages/ScannedInSource4Page';
import ScannedInSource1Page from './pages/ScannedInSource1Page';
import ScannedInSource2Page from './pages/ScannedInSource2Page';
import ScannedInSource3Page from './pages/ScannedInSource3Page';
import ScannedInWarehousesPage from './pages/ScannedInWarehousesPage';
import DataTablePage from './components/DataTablePage';

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

const DRAWER_WIDTH = 74;
const TOP_NAV_ITEMS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'rareCases', label: 'Rare Cases' },
  { key: 'weeklyReport', label: 'Weekly Report' },
];

function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [warehouses, setWarehouses] = useState([]);
  const [apiReady, setApiReady] = useState(false);
  const [apiChecking, setApiChecking] = useState(true);
  const [apiError, setApiError] = useState('');

  const checkApiHealth = async () => {
    try {
      setApiChecking(true);
      const response = await apiGet('/api/health');
      if (response.data?.ok && response.data?.db) {
        setApiReady(true);
        setApiError('');
      } else {
        setApiReady(false);
        setApiError('API is running, but the database connection is not ready.');
      }
    } catch (_error) {
      setApiReady(false);
      setApiError('Unable to reach the API. Start the backend server to load dashboard data.');
    } finally {
      setApiChecking(false);
    }
  };

  useEffect(() => {
    checkApiHealth();
  }, []);

  useEffect(() => {
    if (!apiReady) {
      return;
    }

    apiGet('/api/dashboard/warehouses').then((res) => {
      setWarehouses(res.data?.rows || []);
    }).catch(() => {});
  }, [apiReady]);

  const staticPageMeta = useMemo(
    () => ({
      dashboard: { title: 'Dashboard', component: <Dashboard /> },
      units: { title: 'Units', component: <UnitsPage /> },
      sales: { title: 'Sales', component: <SalesPage /> },
      exchanges: { title: 'Exchanges', component: <ExchangesPage /> },
      scannedInWarehouses: { title: 'Scanned In - Warehouses', component: <ScannedInWarehousesPage /> },
      scannedInSource1: { title: 'Scanned In - TFFW Swaziland', component: <ScannedInSource1Page /> },
      scannedInSource2: { title: 'Scanned In - TFFW Durban', component: <ScannedInSource2Page /> },
      scannedInSource3: { title: 'Scanned In - TFFW Midrand', component: <ScannedInSource3Page /> },
      scannedInSource4: { title: 'Scanned In - TFFW Exchange', component: <ScannedInSource4Page /> },
      scannedInSource5: { title: 'Scanned In - Inhouse Exchange', component: <InhouseExchangesPage /> },
      scannedInSource6: { title: 'Scanned In - Source 6', component: <BoughtBackPage /> },
      rareCases: { title: 'Rare Cases', component: <RareCasesPage /> },
      weeklyReport: { title: 'Weekly Report', component: <WeeklyReportPage /> },
      models: { title: 'Models', component: <ModelsPage /> },
      warehouses: { title: 'Warehouses', component: <WarehousesPage /> },
      quarantine: { title: 'Quarantine', component: <QuarantinePage /> },
    }),
    []
  );

  const currentPage = useMemo(() => {
    const match = activePage.match(/^wh-(\d+)-src-(\d+)$/);
    if (match) {
      const warehouseId = parseInt(match[1], 10);
      const sourceId = parseInt(match[2], 10);
      const warehouse = warehouses.find((w) => w.id === warehouseId);
      const warehouseName = warehouse?.name || warehouse?.warehouse_name || warehouse?.warehouse || warehouse?.title || `Warehouse ${warehouseId}`;
      const sourceName = SOURCE_NAMES[sourceId] || `Source ${sourceId}`;
      const title = `${warehouseName} – ${sourceName}`;
      return {
        title,
        component: (
          <DataTablePage
            key={activePage}
            title={title}
            endpoint={`/api/dashboard/units-by-warehouse-source/${warehouseId}/${sourceId}`}
            subtitle={`Units in ${warehouseName} from ${sourceName}`}
            hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
          />
        ),
      };
    }

    const scanOutMatch = activePage.match(/^wh-(\d+)-scanout-([A-Z_]+)$/);
    if (scanOutMatch) {
      const warehouseId = parseInt(scanOutMatch[1], 10);
      const scanType = String(scanOutMatch[2] || '').toUpperCase();
      const warehouse = warehouses.find((w) => w.id === warehouseId);
      const warehouseName = warehouse?.name || warehouse?.warehouse_name || warehouse?.warehouse || warehouse?.title || `Warehouse ${warehouseId}`;
      const scanOutName = SCAN_OUT_NAMES[scanType] || scanType;
      const title = `${warehouseName} – Scan Out – ${scanOutName}`;

      return {
        title,
        component: (
          <DataTablePage
            key={activePage}
            title={title}
            endpoint={`/api/dashboard/scan-out-by-warehouse-type/${warehouseId}/${scanType}`}
            subtitle={`Scan-out records in ${warehouseName} for ${scanOutName}`}
          />
        ),
      };
    }

    return staticPageMeta[activePage] || staticPageMeta.dashboard;
  }, [activePage, warehouses, staticPageMeta]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
        <AppBar
          position="static"
          elevation={0}
          sx={{
            bgcolor: 'primary.main',
            background: 'linear-gradient(90deg, #2347B8 0%, #2E56E6 55%, #2D66F0 100%)',
            color: '#FFFFFF',
            borderBottom: '1px solid rgba(18, 38, 102, 0.35)',
            boxShadow: '0 6px 20px rgba(35, 71, 184, 0.22)',
          }}
        >
          <Toolbar sx={{ minHeight: '60px !important', px: { xs: 1.5, md: 2.2 }, gap: 1, position: 'relative' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.9,
                mr: 1.4,
              }}
            >
              <Box
                sx={{
                  px: 0.7,
                  py: 0.42,
                  borderRadius: 1.3,
                  bgcolor: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.30)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Box
                  component="img"
                  src="/palogo.png"
                  alt="Phillips Africa"
                  sx={{ height: 22, width: 'auto', display: 'block' }}
                />
              </Box>
              <Typography
                variant="subtitle1"
                sx={{
                  fontWeight: 700,
                  color: '#FFFFFF',
                  whiteSpace: 'nowrap',
                  letterSpacing: 0.1,
                }}
              >
                Admin Dashboard
              </Typography>
            </Box>

            <Box
              sx={{
                position: 'absolute',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                alignItems: 'center',
                gap: 0.5,
                px: 0.55,
                py: 0.35,
                borderRadius: 1.7,
                bgcolor: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.18)',
              }}
            >
              {TOP_NAV_ITEMS.map((item) => (
                <Button
                  key={item.key}
                  onClick={() => setActivePage(item.key)}
                  variant={activePage === item.key ? 'contained' : 'text'}
                  sx={{
                    textTransform: 'none',
                    minWidth: 0,
                    px: 1.25,
                    py: 0.48,
                    borderRadius: 1.3,
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: activePage === item.key ? '#1E2A4A' : 'rgba(255,255,255,0.92)',
                    bgcolor: activePage === item.key ? '#FFFFFF' : 'transparent',
                    '&:hover': {
                      bgcolor: activePage === item.key ? '#FFFFFF' : 'rgba(255,255,255,0.16)',
                    },
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </Box>

            <Box sx={{ flexGrow: 1 }} />
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255,255,255,0.86)',
                fontWeight: 600,
                fontSize: '0.74rem',
                maxWidth: 360,
                textOverflow: 'ellipsis',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
              }}
            >
              {currentPage.title}
            </Typography>
          </Toolbar>
        </AppBar>

        <Box sx={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <Sidebar
            drawerWidth={DRAWER_WIDTH}
            activePage={activePage}
            onNavigate={setActivePage}
            currentTitle={currentPage.title}
            warehouses={warehouses}
          />
          <Box
            component="main"
            sx={{
              flexGrow: 1,
              px: { xs: 1.8, md: 2.8 },
              py: { xs: 1.8, md: 2.2 },
              minHeight: 0,
              bgcolor: 'background.default',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Box
              sx={{
                width: '100%',
                maxWidth: 1240,
                borderRadius: 2,
              }}
            >
              {apiReady ? (
                currentPage.component
              ) : (
                <Paper
                  elevation={2}
                  sx={{
                    minHeight: 360,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: 3,
                    py: 4,
                    textAlign: 'center',
                  }}
                >
                  {apiChecking ? (
                    <>
                      <CircularProgress sx={{ mb: 2 }} />
                      <Typography variant="h6" sx={{ mb: 0.75 }}>
                        Connecting To API
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Waiting for the backend and database before loading the page.
                      </Typography>
                    </>
                  ) : (
                    <>
                      <Typography variant="h6" sx={{ mb: 1 }}>
                        API Not Ready
                      </Typography>
                      <Alert severity="warning" sx={{ mb: 2, width: '100%', maxWidth: 520, textAlign: 'left' }}>
                        {apiError || 'API is not available.'}
                      </Alert>
                      <Button variant="contained" onClick={checkApiHealth}>
                        Retry API Check
                      </Button>
                    </>
                  )}
                </Paper>
              )}
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

export default App;