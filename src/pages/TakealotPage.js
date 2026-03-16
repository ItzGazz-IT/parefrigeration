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

const TakealotPage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState(null);
  const [ioNumberInput, setIoNumberInput] = useState('');
  const [dialogError, setDialogError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadRows = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiGet('/api/dashboard/takealot');
      setRows(response.data?.rows || []);
    } catch (_error) {
      setError('Unable to load Takealot scan-out rows from the API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const openDialog = (row) => {
    setSelectedRow(row);
    setIoNumberInput(String(row?.io_number || '').trim());
    setDialogError('');
    setDialogOpen(true);
  };

  const closeDialog = (forceClose = false) => {
    if (submitting && !forceClose) {
      return;
    }

    setDialogOpen(false);
    setSelectedRow(null);
    setIoNumberInput('');
    setDialogError('');
  };

  const handleConfirm = async () => {
    const normalizedIoNumber = String(ioNumberInput || '').trim();
    if (!normalizedIoNumber) {
      setDialogError('IO number is required.');
      return;
    }

    if (!selectedRow?.serial_number) {
      setDialogError('Selected row is missing a serial number.');
      return;
    }

    try {
      setSubmitting(true);
      setDialogError('');
      setError('');
      setSuccessMessage('');

      await apiPost('/api/dashboard/weekly-report/archive-item', {
        serialNumber: selectedRow.serial_number,
        ioNumber: normalizedIoNumber,
        scanType: 'TAKEALOT',
      });

      await loadRows();
      setSuccessMessage(`Serial ${selectedRow.serial_number} marked as paid and moved to Archive.`);
      closeDialog(true);
    } catch (requestError) {
      const serverError = requestError?.response?.data?.error;
      setDialogError(serverError || 'Failed to save IO number and archive this Takealot row.');
    } finally {
      setSubmitting(false);
    }
  };

  const pendingCount = useMemo(() => rows.length, [rows]);

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: { xs: 1, md: 2 } }}>
      <Typography variant="h4" sx={{ mb: 0.75, textAlign: 'center' }}>
        Takealot
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, textAlign: 'center' }}>
        Pending Takealot scan-outs waiting for an IO number before they are archived.
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
          <Paper elevation={2} sx={{ p: 2.25, mb: 3, maxWidth: 280 }}>
            <Typography variant="subtitle2" color="text.secondary">
              Pending Takealot Items
            </Typography>
            <Typography variant="h5" sx={{ mt: 0.9 }}>
              {pendingCount}
            </Typography>
          </Paper>

          <Paper elevation={2}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="h6">Pending Takealot Scan-outs</Typography>
            </Box>
            <TableContainer>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell>Serial Number</TableCell>
                    <TableCell>PO Number</TableCell>
                    <TableCell>Supplier Status</TableCell>
                    <TableCell>Payment Status</TableCell>
                    <TableCell>IO Number</TableCell>
                    <TableCell>Scanned At</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!rows.length ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No pending Takealot rows found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((row, index) => (
                      <TableRow key={`${row.serial_number || 'serial'}-${index}`} hover>
                        <TableCell>{row.serial_number || '-'}</TableCell>
                        <TableCell>{row.po_number || '-'}</TableCell>
                        <TableCell>{row.supplier_status || '-'}</TableCell>
                        <TableCell>{row.payment_status || '-'}</TableCell>
                        <TableCell>{row.io_number || '-'}</TableCell>
                        <TableCell>
                          {row.created_at ? new Date(row.created_at).toLocaleString() : '-'}
                        </TableCell>
                        <TableCell align="right">
                          <Button variant="contained" size="small" onClick={() => openDialog(row)}>
                            Add IO
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}

      <Dialog open={dialogOpen} onClose={() => closeDialog(false)} fullWidth maxWidth="xs">
        <DialogTitle>Add IO Number</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="IO Number"
            fullWidth
            value={ioNumberInput}
            onChange={(event) => setIoNumberInput(event.target.value)}
            disabled={submitting}
          />
          {dialogError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {dialogError}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => closeDialog(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleConfirm} variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : 'Save and Archive'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default TakealotPage;
