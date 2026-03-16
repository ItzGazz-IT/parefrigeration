import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Paper,
  Stack,
  Typography,
} from '@mui/material';

const emptySummary = {
  totalUnits: 0,
  totalSales: 0,
  totalModels: 0,
  totalWarehouses: 0,
  weeklyReportCount: 0,
};

const emptyWarehouseBreakdown = [];

const formatNumber = (value) => new Intl.NumberFormat().format(Number(value || 0));

const fetchDashboardData = async () => {
  const endpoints = [
    {
      summary: '/api/dashboard/summary',
      warehouseBreakdown: '/api/dashboard/warehouse-breakdown',
    },
    {
      summary: 'http://localhost:5000/api/dashboard/summary',
      warehouseBreakdown: 'http://localhost:5000/api/dashboard/warehouse-breakdown',
    },
  ];

  let lastError;

  for (const endpointSet of endpoints) {
    try {
      const [summaryResult, warehouseBreakdownResult] = await Promise.allSettled([
        axios.get(endpointSet.summary),
        axios.get(endpointSet.warehouseBreakdown),
      ]);

      if (summaryResult.status !== 'fulfilled') {
        lastError = summaryResult.reason;
        continue;
      }

      const summaryResponse = summaryResult.value;
      const warehouseBreakdownResponse = warehouseBreakdownResult.status === 'fulfilled'
        ? warehouseBreakdownResult.value
        : null;

      return {
        summary: summaryResponse.data || emptySummary,
        warehouseBreakdown: warehouseBreakdownResponse.data?.rows || emptyWarehouseBreakdown,
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

const Dashboard = () => {
  const [summary, setSummary] = useState(emptySummary);
  const [warehouseBreakdown, setWarehouseBreakdown] = useState(emptyWarehouseBreakdown);
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

        const loadedData = await fetchDashboardData();
        if (!isMounted) {
          return;
        }

        setSummary(loadedData.summary || emptySummary);
        setWarehouseBreakdown(loadedData.warehouseBreakdown || emptyWarehouseBreakdown);
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

  const dashboardMetrics = useMemo(() => {
    const totalUnits = Number(summary.totalUnits || 0);
    const totalSales = Number(summary.totalSales || 0);
    const weeklyReportCount = Number(summary.weeklyReportCount || 0);
    const totalModels = Number(summary.totalModels || 0);
    const totalWarehouses = Number(summary.totalWarehouses || 0);
    const totalWarehouseUnits = warehouseBreakdown.reduce((total, row) => total + Number(row.total_units || 0), 0);
    const busiestWarehouse = warehouseBreakdown[0] || null;
    const averagePerWarehouse = totalWarehouses > 0 ? Math.round(totalUnits / totalWarehouses) : 0;
    const busiestShare = totalWarehouseUnits > 0 && busiestWarehouse
      ? Math.round((Number(busiestWarehouse.total_units || 0) / totalWarehouseUnits) * 100)
      : 0;

    return {
      primary: [
        {
          title: 'Units In System',
          value: totalUnits,
          eyebrow: 'Live inventory footprint',
          accent: 'linear-gradient(135deg, #133E87 0%, #2155CD 100%)',
        },
        {
          title: 'Sales Logged',
          value: totalSales,
          eyebrow: 'Completed sales records',
          accent: 'linear-gradient(135deg, #0C7C59 0%, #22A06B 100%)',
        },
        {
          title: 'Needs Attention',
          value: weeklyReportCount,
          eyebrow: 'Current weekly follow-up queue',
          accent: 'linear-gradient(135deg, #9A3412 0%, #F97316 100%)',
        },
      ],
      secondary: [
        { title: 'Models Tracked', value: totalModels, note: 'Catalog coverage' },
        { title: 'Warehouses', value: totalWarehouses, note: 'Active locations' },
        { title: 'Avg / Warehouse', value: averagePerWarehouse, note: 'Even-load target' },
        { title: 'Warehouse Load', value: totalWarehouseUnits, note: 'Units assigned to visible warehouses' },
      ],
      operational: [
        {
          title: 'Busiest Warehouse',
          value: busiestWarehouse?.warehouse || 'No data',
          note: busiestWarehouse ? `${formatNumber(busiestWarehouse.total_units)} units · ${busiestShare}% of stock` : 'Awaiting warehouse data',
        },
        {
          title: 'Weekly Queue',
          value: formatNumber(weeklyReportCount),
          note: 'Items still waiting for action this week',
        },
        {
          title: 'Sales Volume',
          value: formatNumber(totalSales),
          note: 'All-time sales captured in the system',
        },
      ],
    };
  }, [summary, warehouseBreakdown]);

  return (
    <Box
      sx={{
        px: { xs: 0.25, sm: 0.75, md: 1.4 },
        py: { xs: 0.75, md: 1.1 },
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
        <>
          <Paper
            elevation={0}
            sx={{
              mb: 1.6,
              overflow: 'hidden',
              borderRadius: 3.2,
              border: '1px solid rgba(19, 62, 135, 0.14)',
              background: 'linear-gradient(135deg, rgba(19,62,135,0.98) 0%, rgba(33,85,205,0.96) 44%, rgba(89,145,255,0.92) 100%)',
              color: '#F7FAFF',
              position: 'relative',
              flexShrink: 0,
            }}
          >
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                background: 'radial-gradient(circle at top right, rgba(255,255,255,0.18), transparent 28%), radial-gradient(circle at bottom left, rgba(255,255,255,0.12), transparent 26%)',
                pointerEvents: 'none',
              }}
            />
            <Grid container spacing={0} sx={{ position: 'relative' }}>
              <Grid item xs={12} md={7}>
                <Box sx={{ p: { xs: 1.8, md: 2.4 } }}>
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', opacity: 0.85, mb: 0.8 }}>
                    Operations Overview
                  </Typography>
                  <Typography variant="h4" sx={{ color: '#FFFFFF', mb: 0.8, maxWidth: 520, fontSize: { xs: '1.45rem', md: '1.85rem' } }}>
                    Cleaner live view of stock, sales, and warehouse pressure.
                  </Typography>
                  <Typography sx={{ color: 'rgba(255,255,255,0.82)', maxWidth: 560, lineHeight: 1.45, mb: 1.5, fontSize: '0.9rem' }}>
                    The page is condensed into one control view so the useful numbers stay visible without scrolling.
                  </Typography>
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2}>
                    <Box sx={{ px: 1.2, py: 0.65, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.18)' }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#FFFFFF' }}>
                        {lastUpdatedAt
                          ? `Last updated ${lastUpdatedAt.toLocaleTimeString()}${refreshing ? ' • Refreshing' : ''}`
                          : 'Connecting to live data'}
                      </Typography>
                    </Box>
                    <Box sx={{ px: 1.2, py: 0.65, borderRadius: 999, bgcolor: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.14)' }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>
                        {formatNumber(summary.totalWarehouses)} warehouse zones live
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Grid>
              <Grid item xs={12} md={5}>
                <Box sx={{ p: { xs: 1.8, md: 2.1 }, height: '100%', display: 'flex', alignItems: 'center' }}>
                  <Grid container spacing={1}>
                    {dashboardMetrics.operational.map((item) => (
                      <Grid item xs={12} sm={4} md={12} key={item.title}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1.2,
                            borderRadius: 2.5,
                            bgcolor: 'rgba(8, 21, 58, 0.24)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            color: '#FFFFFF',
                            backdropFilter: 'blur(6px)',
                          }}
                        >
                          <Typography sx={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8, mb: 0.55 }}>
                            {item.title}
                          </Typography>
                          <Typography sx={{ fontSize: item.title === 'Busiest Warehouse' ? '1rem' : '1.3rem', fontWeight: 800, lineHeight: 1.15, mb: 0.3 }}>
                            {item.value}
                          </Typography>
                          <Typography sx={{ fontSize: '0.76rem', color: 'rgba(255,255,255,0.78)' }}>
                            {item.note}
                          </Typography>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          <Grid container spacing={1.4} sx={{ mb: 1.4, flexShrink: 0 }}>
            {dashboardMetrics.primary.map((item) => (
              <Grid item xs={12} md={4} key={item.title}>
                <Paper
                  elevation={0}
                  sx={{
                    p: 1.6,
                    minHeight: 120,
                    borderRadius: 2.8,
                    background: item.accent,
                    color: '#FFFFFF',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                >
                  <Box sx={{ position: 'absolute', right: -18, top: -18, width: 76, height: 76, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.10)' }} />
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 1.1, opacity: 0.9 }}>
                    {item.eyebrow}
                  </Typography>
                  <Typography sx={{ fontSize: '2rem', fontWeight: 800, mt: 1.1, lineHeight: 1 }}>
                    {formatNumber(item.value)}
                  </Typography>
                  <Typography sx={{ mt: 0.8, fontSize: '0.95rem', fontWeight: 700 }}>
                    {item.title}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={1.4} sx={{ flex: 1, minHeight: 0 }}>
            <Grid item xs={12} lg={8} sx={{ minHeight: 0 }}>
              <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3, border: '1px solid rgba(19,62,135,0.10)', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <Typography variant="h6" sx={{ mb: 0.25 }}>
                  Warehouse Distribution
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.3, fontSize: '0.85rem' }}>
                  Highest-load warehouses at a glance.
                </Typography>

                {!warehouseBreakdown.length ? (
                  <Typography variant="body2" color="text.secondary">
                    No warehouse breakdown data available.
                  </Typography>
                ) : (
                  <Stack spacing={1} sx={{ minHeight: 0 }}>
                    {warehouseBreakdown.slice(0, 6).map((row) => {
                      const totalUnits = Number(row.total_units || 0);
                      const maxUnits = Number(warehouseBreakdown[0]?.total_units || 0);
                      const totalWarehouseUnits = warehouseBreakdown.reduce((total, item) => total + Number(item.total_units || 0), 0);
                      const widthPercent = maxUnits > 0 ? Math.max((totalUnits / maxUnits) * 100, 8) : 8;
                      const sharePercent = totalWarehouseUnits > 0 ? Math.round((totalUnits / totalWarehouseUnits) * 100) : 0;

                      return (
                        <Box key={row.warehouse || 'Unassigned'}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, mb: 0.45 }}>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontWeight: 700, color: 'text.primary', fontSize: '0.92rem' }} noWrap>
                                {row.warehouse || 'Unassigned'}
                              </Typography>
                              <Typography sx={{ fontSize: '0.76rem', color: 'text.secondary' }}>
                                {sharePercent}% of visible stock
                              </Typography>
                            </Box>
                            <Typography sx={{ fontWeight: 800, color: 'text.primary', fontSize: '0.92rem' }}>
                              {formatNumber(totalUnits)}
                            </Typography>
                          </Box>
                          <Box sx={{ height: 10, borderRadius: 999, bgcolor: 'rgba(19,62,135,0.08)', overflow: 'hidden' }}>
                            <Box
                              sx={{
                                height: '100%',
                                width: `${widthPercent}%`,
                                borderRadius: 999,
                                background: 'linear-gradient(90deg, #133E87 0%, #2155CD 65%, #5D9CFF 100%)',
                              }}
                            />
                          </Box>
                        </Box>
                      );
                    })}
                  </Stack>
                )}
              </Paper>
            </Grid>

            <Grid item xs={12} lg={4} sx={{ minHeight: 0 }}>
              <Stack spacing={1.4} sx={{ height: '100%' }}>
                {dashboardMetrics.secondary.map((item) => (
                  <Paper elevation={0} sx={{ p: 1.45, borderRadius: 2.6, minHeight: 0, border: '1px solid rgba(19,62,135,0.10)' }} key={item.title}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.9, color: 'text.secondary', mb: 1 }}>
                      {item.title}
                    </Typography>
                    <Typography sx={{ fontSize: '1.7rem', fontWeight: 800, color: 'text.primary', lineHeight: 1.05 }}>
                      {formatNumber(item.value)}
                    </Typography>
                    <Typography sx={{ mt: 0.8, color: 'text.secondary', fontSize: '0.82rem' }}>
                      {item.note}
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
};

export default Dashboard;