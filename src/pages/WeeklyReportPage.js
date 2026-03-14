import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { apiGet, apiPost } from '../api';

const getCountByScanType = (summaryRows, scanType) => {
  const row = summaryRows.find((item) => item.scan_type === scanType);
  return row ? Number(row.total || 0) : 0;
};

const WeeklyReportPage = () => {
  const [summaryRows, setSummaryRows] = useState([]);
  const [recentRows, setRecentRows] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [markPaidDialogOpen, setMarkPaidDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [ioNumberInput, setIoNumberInput] = useState('');
  const [markPaidError, setMarkPaidError] = useState('');
  const [markPaidLoading, setMarkPaidLoading] = useState(false);

  useEffect(() => {
    const loadWeeklyReport = async () => {
      try {
        setLoading(true);
        setError('');
        setSuccessMessage('');

        const [reportResponse, historyResponse] = await Promise.all([
          apiGet('/api/dashboard/weekly-report'),
          apiGet('/api/dashboard/weekly-report-payment-history'),
        ]);

        setSummaryRows(reportResponse.data?.summary || []);
        setRecentRows(reportResponse.data?.recent || []);
        setHistoryRows(historyResponse.data?.rows || []);
      } catch (requestError) {
        setError('Unable to load weekly report data from the API.');
      } finally {
        setLoading(false);
      }
    };

    loadWeeklyReport();
  }, []);

  const loadWeeklyReport = async () => {
    try {
      setLoading(true);
      setError('');

      const [reportResponse, historyResponse] = await Promise.all([
        apiGet('/api/dashboard/weekly-report'),
        apiGet('/api/dashboard/weekly-report-payment-history'),
      ]);

      setSummaryRows(reportResponse.data?.summary || []);
      setRecentRows(reportResponse.data?.recent || []);
      setHistoryRows(historyResponse.data?.rows || []);
    } catch (_error) {
      setError('Unable to load weekly report data from the API.');
    } finally {
      setLoading(false);
    }
  };

  const openMarkPaidDialog = (row) => {
    setSelectedRow(row);
    setIoNumberInput('');
    setMarkPaidError('');
    setMarkPaidDialogOpen(true);
  };

  const closeMarkPaidDialog = (forceClose = false) => {
    if (markPaidLoading && !forceClose) {
      return;
    }

    setMarkPaidDialogOpen(false);
    setSelectedRow(null);
    setIoNumberInput('');
    setMarkPaidError('');
  };

  const handleConfirmMarkPaid = async () => {
    const normalizedIoNumber = String(ioNumberInput || '').trim();
    if (!normalizedIoNumber) {
      setMarkPaidError('IO number is required.');
      return;
    }

    if (!selectedRow?.serial_number) {
      setMarkPaidError('Selected row is missing a serial number.');
      return;
    }

    try {
      setMarkPaidLoading(true);
      setMarkPaidError('');
      setError('');
      setSuccessMessage('');

      await apiPost('/api/dashboard/weekly-report/mark-paid', {
        serialNumber: selectedRow.serial_number,
        ioNumber: normalizedIoNumber,
        scanType: selectedRow.scan_type || null,
      });

      await loadWeeklyReport();
      setSuccessMessage(`Serial ${selectedRow.serial_number} marked as PAID_TFFW.`);
      closeMarkPaidDialog(true);
    } catch (requestError) {
      const serverError = requestError?.response?.data?.error;
      setMarkPaidError(serverError || 'Failed to mark this unit as paid.');
    } finally {
      setMarkPaidLoading(false);
    }
  };

  const totalWeeklyEvents = useMemo(
    () => summaryRows.reduce((total, row) => total + Number(row.total || 0), 0),
    [summaryRows]
  );

  const actualSalesCount = useMemo(
    () => getCountByScanType(summaryRows, 'ACTUAL_SALE'),
    [summaryRows]
  );

  const inhouseExchangeCount = useMemo(
    () => getCountByScanType(summaryRows, 'INHOUSE_EXCHANGE'),
    [summaryRows]
  );

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: { xs: 1, md: 2 } }}>
      <Typography variant="h4" sx={{ mb: 0.75, textAlign: 'center' }}>
        Weekly Report
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
        This week&apos;s scanned-out items, including Actual Sales and Inhouse Exchanges
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {successMessage && (
        <Alert severity="success" sx={{ mb: 3 }}>
          {successMessage}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Grid container spacing={2.25} sx={{ mb: 3, justifyContent: 'center' }}>
            <Grid item xs={12} sm={6} md={4}>
              <Paper elevation={2} sx={{ p: 2.25, minHeight: 108, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Total This Week
                </Typography>
                <Typography variant="h5" sx={{ mt: 0.9 }}>
                  {totalWeeklyEvents}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Paper elevation={2} sx={{ p: 2.25, minHeight: 108, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Actual Sales
                </Typography>
                <Typography variant="h5" sx={{ mt: 0.9 }}>
                  {actualSalesCount}
                </Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <Paper elevation={2} sx={{ p: 2.25, minHeight: 108, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Inhouse Exchanges
                </Typography>
                <Typography variant="h5" sx={{ mt: 0.9 }}>
                  {inhouseExchangeCount}
                </Typography>
              </Paper>
            </Grid>
          </Grid>

          <Paper elevation={2} sx={{ mb: 3 }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6">Breakdown by Scan Type</Typography>
            </Box>
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Scan Type</TableCell>
                    <TableCell>Payment Status</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!summaryRows.length ? (
                    <TableRow>
                      <TableCell colSpan={3} align="center">
                        No weekly summary rows found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    summaryRows.map((row, index) => (
                      <TableRow key={`${row.scan_type}-${row.payment_status}-${index}`} hover>
                        <TableCell>{row.scan_type || '-'}</TableCell>
                        <TableCell>{row.payment_status || '-'}</TableCell>
                        <TableCell align="right">{row.total || 0}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper elevation={2} sx={{ mb: 3 }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6">Recent Weekly Scan-outs</Typography>
            </Box>
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Serial Number</TableCell>
                    <TableCell>Scan Type</TableCell>
                    <TableCell>Client</TableCell>
                    <TableCell>Supplier Status</TableCell>
                    <TableCell>Payment Status</TableCell>
                    <TableCell>Scanned At</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!recentRows.length ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No weekly scan-out entries found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentRows.map((row, index) => (
                      <TableRow key={`${row.serial_number || 'serial'}-${index}`} hover>
                        <TableCell>{row.serial_number || '-'}</TableCell>
                        <TableCell>{row.scan_type || '-'}</TableCell>
                        <TableCell>{row.client_name || '-'}</TableCell>
                        <TableCell>{row.supplier_status || '-'}</TableCell>
                        <TableCell>{row.payment_status || '-'}</TableCell>
                        <TableCell>
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell align="right">
                          {row.payment_status === 'UNPAID_TFFW' ? (
                            <Button
                              variant="contained"
                              size="small"
                              onClick={() => openMarkPaidDialog(row)}
                            >
                              Mark as Paid
                            </Button>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper elevation={2}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6">Weekly Payment History</Typography>
            </Box>
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Serial Number</TableCell>
                    <TableCell>Scan Type</TableCell>
                    <TableCell>Previous Status</TableCell>
                    <TableCell>New Status</TableCell>
                    <TableCell>IO Number</TableCell>
                    <TableCell>Changed At</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!historyRows.length ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        No payment changes logged for this week.
                      </TableCell>
                    </TableRow>
                  ) : (
                    historyRows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>{row.serial_number || '-'}</TableCell>
                        <TableCell>{row.scan_type || '-'}</TableCell>
                        <TableCell>{row.previous_payment_status || '-'}</TableCell>
                        <TableCell>{row.new_payment_status || '-'}</TableCell>
                        <TableCell>{row.io_number || '-'}</TableCell>
                        <TableCell>{row.changed_at ? new Date(row.changed_at).toLocaleString() : '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      <Dialog
        open={markPaidDialogOpen}
        onClose={closeMarkPaidDialog}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            borderRadius: 2.2,
            border: '1px solid rgba(46, 86, 230, 0.16)',
            boxShadow: '0 8px 24px rgba(35, 71, 184, 0.14)',
          },
        }}
      >
        <DialogTitle sx={{ textAlign: 'center', fontWeight: 700 }}>
          Mark Unit as Paid
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 0.6, pb: 0.25, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {selectedRow?.serial_number
                ? `Enter IO number for serial ${selectedRow.serial_number}`
                : 'Enter IO number to mark this item as paid.'}
            </Typography>
          </Box>

          <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'center' }}>
            <TextField
              label="IO Number"
              value={ioNumberInput}
              onChange={(event) => setIoNumberInput(event.target.value)}
              fullWidth
              autoFocus
              sx={{ maxWidth: 420 }}
            />
          </Box>

          {markPaidError && (
            <Alert severity="error" sx={{ mt: 1.5 }}>
              {markPaidError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'center', pb: 2.1, px: 2.5, gap: 0.8 }}>
          <Button variant="outlined" onClick={closeMarkPaidDialog} disabled={markPaidLoading}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleConfirmMarkPaid} disabled={markPaidLoading}>
            {markPaidLoading ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WeeklyReportPage;
