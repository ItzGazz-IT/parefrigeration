import { useEffect, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  ButtonBase,
  Chip,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { apiGet } from '../api';

const emptyWarehouseBreakdown = [];
const emptyWeeklyReport = { summary: [], recent: [] };

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));

const Dashboard = ({ onNavigate }) => {
  const [warehouseBreakdown, setWarehouseBreakdown] = useState(emptyWarehouseBreakdown);
  const [weeklyReport, setWeeklyReport] = useState(emptyWeeklyReport);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboard = async ({ background = false } = {}) => {
      try {
        if (background) {
          setRefreshing(true);
        } else {
          setLoading(true);
          setError('');
        }

        const [warehouseResponse, weeklyReportResponse] = await Promise.all([
          apiGet('/api/dashboard/warehouse-breakdown'),
          apiGet('/api/dashboard/weekly-report'),
        ]);
        if (!isMounted) {
          return;
        }

        setWarehouseBreakdown(warehouseResponse.data?.rows || emptyWarehouseBreakdown);
        setWeeklyReport({
          summary: weeklyReportResponse.data?.summary || [],
          recent: weeklyReportResponse.data?.recent || [],
        });
        setLastUpdatedAt(new Date());
        if (background) {
          setError('');
        }
      } catch (requestError) {
        if (!isMounted || background) {
          return;
        }

        setError('Unable to load live database stats. Start with "npm start" and verify API on http://localhost:5000/api/health.');
      } finally {
        if (!isMounted) {
          return;
        }

        if (background) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    const intervalId = window.setInterval(() => {
      loadDashboard({ background: true });
    }, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const weeklyItemCount = weeklyReport.recent.length;

  return (
    <Box
      sx={{
        px: { xs: 0.25, sm: 0.75, md: 1.2 },
        py: { xs: 0.6, md: 0.9 },
        height: { xs: 'auto', lg: 'calc(100vh - 124px)' },
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: { xs: 7, md: 9 } }}>
          <CircularProgress />
        </Box>
      ) : (
        <Stack spacing={1.2} sx={{ flex: 1, minHeight: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.4 }}>
            <Typography variant="h4" sx={{ fontSize: { xs: '1.35rem', md: '1.7rem' } }}>
              Dashboard
            </Typography>
            <Chip
              label={lastUpdatedAt
                ? `Updated ${lastUpdatedAt.toLocaleTimeString()}${refreshing ? ' • Refreshing' : ''}`
                : 'Connecting'}
              size="small"
              sx={{ fontWeight: 700 }}
            />
          </Box>

          <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.2} sx={{ flex: 1, minHeight: 0 }}>
            <Paper elevation={0} sx={{ flex: 1.1, p: 1.5, borderRadius: 3, border: '1px solid rgba(19,62,135,0.10)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.1 }}>
                <Box>
                  <Typography variant="h6">Units In Stock Per Location</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Click a location to open its live in-stock units.
                  </Typography>
                </Box>
                <Chip label={`${formatNumber(warehouseBreakdown.length)} locations`} size="small" />
              </Box>
              <Divider sx={{ mb: 1 }} />

              <Stack spacing={0.8} sx={{ overflow: 'auto', pr: 0.2 }}>
                {!warehouseBreakdown.length ? (
                  <Typography variant="body2" color="text.secondary">No in-stock location data available.</Typography>
                ) : (
                  warehouseBreakdown.map((row) => (
                    <ButtonBase
                      key={`${row.warehouse_id || 'unknown'}-${row.warehouse || 'warehouse'}`}
                      onClick={() => row.warehouse_id && onNavigate?.(`warehouse-${row.warehouse_id}-instock`)}
                      disabled={!row.warehouse_id}
                      sx={{
                        width: '100%',
                        textAlign: 'left',
                        borderRadius: 2.5,
                        overflow: 'hidden',
                      }}
                    >
                      <Box
                        sx={{
                          width: '100%',
                          px: 1.35,
                          py: 1.15,
                          borderRadius: 2.5,
                          border: '1px solid rgba(19,62,135,0.10)',
                          bgcolor: 'rgba(19,62,135,0.03)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.16s ease',
                          '&:hover': {
                            bgcolor: 'rgba(33,85,205,0.08)',
                            borderColor: 'rgba(33,85,205,0.22)',
                          },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, color: 'text.primary' }} noWrap>
                            {row.warehouse || 'Unassigned'}
                          </Typography>
                          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                            Open location stock list
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: '1.2rem', fontWeight: 800, color: 'primary.main', ml: 2 }}>
                          {formatNumber(row.total_units)}
                        </Typography>
                      </Box>
                    </ButtonBase>
                  ))
                )}
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ flex: 0.9, p: 1.5, borderRadius: 3, border: '1px solid rgba(19,62,135,0.10)', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.1 }}>
                <Box>
                  <Typography variant="h6">Items On Weekly Report</Typography>
                  <Typography variant="body2" color="text.secondary">
                    Click any item to jump into Weekly Report.
                  </Typography>
                </Box>
                <Chip label={`${formatNumber(weeklyItemCount)} items`} size="small" color="primary" />
              </Box>
              <Divider sx={{ mb: 1 }} />

              <Stack spacing={0.8} sx={{ overflow: 'auto', pr: 0.2 }}>
                {!weeklyReport.recent.length ? (
                  <Typography variant="body2" color="text.secondary">No weekly report items found.</Typography>
                ) : (
                  weeklyReport.recent.slice(0, 8).map((row, index) => (
                    <ButtonBase
                      key={`${row.serial_number || 'serial'}-${index}`}
                      onClick={() => onNavigate?.('weeklyReport')}
                      sx={{ width: '100%', textAlign: 'left', borderRadius: 2.5, overflow: 'hidden' }}
                    >
                      <Box
                        sx={{
                          width: '100%',
                          px: 1.35,
                          py: 1.1,
                          borderRadius: 2.5,
                          border: '1px solid rgba(243,129,34,0.14)',
                          bgcolor: 'rgba(243,129,34,0.05)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 1,
                          transition: 'all 0.16s ease',
                          '&:hover': {
                            bgcolor: 'rgba(243,129,34,0.10)',
                            borderColor: 'rgba(243,129,34,0.26)',
                          },
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontWeight: 700, color: 'text.primary' }} noWrap>
                            {row.serial_number || '-'}
                          </Typography>
                          <Typography sx={{ fontSize: '0.78rem', color: 'text.secondary' }} noWrap>
                            {row.scan_type || '-'} • {row.client_name || 'No client'}
                          </Typography>
                        </Box>
                        <Chip label={row.io_number ? 'IO added' : 'Needs IO'} size="small" color={row.io_number ? 'success' : 'warning'} />
                      </Box>
                    </ButtonBase>
                  ))
                )}
              </Stack>
            </Paper>
          </Stack>
        </Stack>
      )}
    </Box>
  );
};

export default Dashboard;