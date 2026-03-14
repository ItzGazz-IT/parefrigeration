import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  Alert,
  Box,
  CircularProgress,
  Grid,
  Paper,
  Typography,
} from '@mui/material';

const emptySummary = {
  totalUnits: 0,
  totalSales: 0,
  totalModels: 0,
  totalWarehouses: 0,
  deliveredUnits: 0,
  weeklyReportCount: 0,
};

const emptyWarehouseBreakdown = [];

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

  const stats = useMemo(
    () => [
      { title: 'Total Units', value: summary.totalUnits },
      { title: 'Delivered Units', value: summary.deliveredUnits },
      { title: 'Total Sales', value: summary.totalSales },
      { title: 'Weekly Report', value: summary.weeklyReportCount },
      { title: 'Models', value: summary.totalModels },
      { title: 'Warehouses', value: summary.totalWarehouses },
    ],
    [summary]
  );

  return (
    <Box
      sx={{
        px: { xs: 0.5, sm: 1, md: 2 },
        py: { xs: 1.5, md: 2.5 },
      }}
    >
      <Typography variant="h4" sx={{ mb: 1, textAlign: 'center' }}>
        Overview
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: { xs: 3, md: 4 }, textAlign: 'center' }}>
        Live snapshot from your SQL database
      </Typography>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 2, textAlign: 'center' }}>
        {lastUpdatedAt
          ? `Last updated: ${lastUpdatedAt.toLocaleTimeString()}${refreshing ? ' • Refreshing…' : ''}`
          : 'Connecting to live data...'}
      </Typography>

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
          <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ mb: { xs: 3, md: 4 }, justifyContent: 'center' }}>
            {stats.map((stat) => (
              <Grid item xs={12} sm={6} md={4} lg={3} key={stat.title}>
                <Paper
                  elevation={2}
                  sx={{
                    p: { xs: 2.5, md: 3 },
                    minHeight: { xs: 118, md: 132 },
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    {stat.title}
                  </Typography>
                  <Typography variant="h5" sx={{ mt: 1.2, lineHeight: 1.2 }}>
                    {stat.value}
                  </Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Box sx={{ mb: 1.5 }}>
            <Typography variant="h6" sx={{ mb: 0.5, textAlign: 'center' }}>
              Per Warehouse
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
              Units currently grouped by warehouse
            </Typography>
          </Box>

          <Grid container spacing={{ xs: 2, sm: 2.5, md: 3 }} sx={{ justifyContent: 'center' }}>
            {!warehouseBreakdown.length ? (
              <Grid item xs={12}>
                <Paper elevation={2} sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Typography variant="body2" color="text.secondary">
                    No warehouse breakdown data available.
                  </Typography>
                </Paper>
              </Grid>
            ) : (
              warehouseBreakdown.map((row) => (
                <Grid item xs={12} sm={6} md={4} lg={3} key={row.warehouse}>
                  <Paper
                    elevation={2}
                    sx={{
                      p: { xs: 2.5, md: 3 },
                      minHeight: { xs: 112, md: 124 },
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="subtitle2" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
                      {row.warehouse || 'Unassigned'}
                    </Typography>
                    <Typography variant="h5" sx={{ mt: 1.1, lineHeight: 1.2 }}>
                      {row.total_units || 0}
                    </Typography>
                  </Paper>
                </Grid>
              ))
            )}
          </Grid>
        </>
      )}
    </Box>
  );
};

export default Dashboard;