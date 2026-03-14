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
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { apiGet, apiPost } from '../api';

const RareCasesPage = () => {
  const [rows, setRows] = useState([]);
  const [historyRows, setHistoryRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyRowsPerPage, setHistoryRowsPerPage] = useState(10);
  const [selectedTargets, setSelectedTargets] = useState({});
  const [updatingUnitId, setUpdatingUnitId] = useState(null);
  const [activeRow, setActiveRow] = useState(null);
  const [changeDialogOpen, setChangeDialogOpen] = useState(false);
  const [icNumberInput, setIcNumberInput] = useState('');
  const [userNameInput, setUserNameInput] = useState('');
  const [dialogError, setDialogError] = useState('');

  const loadRows = async () => {
    try {
      setLoading(true);
      setHistoryLoading(true);
      setError('');
      const [rareCasesResponse, historyResponse] = await Promise.all([
        apiGet('/api/dashboard/rare-cases'),
        apiGet('/api/dashboard/rare-cases-history'),
      ]);

      const loadedRows = rareCasesResponse.data?.rows || [];
      const loadedHistoryRows = historyResponse.data?.rows || [];
      setRows(loadedRows);
      setHistoryRows(loadedHistoryRows);
      setSelectedTargets((previousTargets) => {
        const nextTargets = { ...previousTargets };
        loadedRows.forEach((row) => {
          if (!nextTargets[row.id]) {
            nextTargets[row.id] = 'B';
          }
        });
        return nextTargets;
      });
    } catch (_error) {
      setError('Unable to load Rare Cases units.');
    } finally {
      setLoading(false);
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const paginatedRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, page, rowsPerPage]
  );

  const paginatedHistoryRows = useMemo(
    () => historyRows.slice(historyPage * historyRowsPerPage, historyPage * historyRowsPerPage + historyRowsPerPage),
    [historyRows, historyPage, historyRowsPerPage]
  );

  const handleTargetChange = (unitId, stockType) => {
    setSelectedTargets((previousTargets) => ({
      ...previousTargets,
      [unitId]: stockType,
    }));
  };

  const openChangeDialog = (row) => {
    setActiveRow(row);
    setIcNumberInput('');
    setUserNameInput('');
    setDialogError('');
    setChangeDialogOpen(true);
  };

  const closeChangeDialog = () => {
    if (updatingUnitId) {
      return;
    }

    setChangeDialogOpen(false);
    setActiveRow(null);
    setIcNumberInput('');
    setUserNameInput('');
    setDialogError('');
  };

  const handleConfirmStockTypeChange = async () => {
    if (!activeRow) {
      return;
    }

    const trimmedIc = String(icNumberInput || '').trim();
    const trimmedUserName = String(userNameInput || '').trim();

    if (!trimmedIc || !trimmedUserName) {
      setDialogError('Both IC number and user name are required.');
      return;
    }

    const targetStockType = selectedTargets[activeRow.id] || 'B';

    try {
      setUpdatingUnitId(activeRow.id);
      setError('');
      setMessage('');
      setDialogError('');

      await apiPost('/api/dashboard/rare-cases/update-stock-type', {
        unitId: activeRow.id,
        stockType: targetStockType,
        icNumber: trimmedIc,
        changedBy: trimmedUserName,
      });

      await loadRows();
      setMessage(`Serial ${activeRow.serial_number} updated to ${targetStockType} successfully by ${trimmedUserName}.`);
      closeChangeDialog();
    } catch (requestError) {
      const serverError = requestError?.response?.data?.error;
      setDialogError(serverError || 'Failed to update stock type.');
    } finally {
      setUpdatingUnitId(null);
    }
  };

  const handlePageChange = (_event, nextPage) => {
    setPage(nextPage);
  };

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(Number(event.target.value));
    setPage(0);
  };

  const handleHistoryPageChange = (_event, nextPage) => {
    setHistoryPage(nextPage);
  };

  const handleHistoryRowsPerPageChange = (event) => {
    setHistoryRowsPerPage(Number(event.target.value));
    setHistoryPage(0);
  };

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: { xs: 1, md: 1.8 } }}>
      <Typography variant="h4" sx={{ mb: 0.75, textAlign: 'center' }}>
        Rare Cases
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.4, textAlign: 'center' }}>
        Units with stock type A. Change to B or Y with IC number confirmation.
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {message && (
        <Alert severity="success" sx={{ mb: 2 }}>
          {message}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper elevation={2} sx={{ borderRadius: 2.2, overflow: 'hidden', mb: 2.2 }}>
            <Box sx={{ px: 2, py: 1.35, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(46, 86, 230, 0.03)' }}>
              <Typography variant="h6" sx={{ textAlign: 'center' }}>Rare Cases Data</Typography>
            </Box>

            <TableContainer
              sx={{
                maxHeight: '68vh',
                '& .MuiTableCell-root': {
                  px: 1.6,
                  py: 1.2,
                },
              }}
            >
              <Table size="medium" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>ID</TableCell>
                    <TableCell>Serial Number</TableCell>
                    <TableCell>Model</TableCell>
                    <TableCell>Warehouse</TableCell>
                    <TableCell>Stock Type</TableCell>
                    <TableCell>Change To</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {!rows.length ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        No units with stock type A found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedRows.map((row) => (
                      <TableRow key={row.id} hover>
                        <TableCell>{row.id}</TableCell>
                        <TableCell>{row.serial_number || '-'}</TableCell>
                        <TableCell>{row.model || row.model_id || '-'}</TableCell>
                        <TableCell>{row.warehouse_id || '-'}</TableCell>
                        <TableCell>{row.stock_type || '-'}</TableCell>
                        <TableCell>
                          <Select
                            size="small"
                            value={selectedTargets[row.id] || 'B'}
                            onChange={(event) => handleTargetChange(row.id, event.target.value)}
                            disabled={updatingUnitId === row.id}
                            sx={{ minWidth: 82 }}
                          >
                            <MenuItem value="B">B</MenuItem>
                            <MenuItem value="Y">Y</MenuItem>
                          </Select>
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            variant="contained"
                            size="small"
                            onClick={() => openChangeDialog(row)}
                            disabled={updatingUnitId === row.id}
                          >
                            {updatingUnitId === row.id ? 'Saving...' : 'Update'}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={rows.length}
              page={page}
              onPageChange={handlePageChange}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleRowsPerPageChange}
              rowsPerPageOptions={[10, 25, 50, 100]}
            />
          </Paper>

          <Paper elevation={2} sx={{ borderRadius: 2.2, overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.35, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(46, 86, 230, 0.03)' }}>
              <Typography variant="h6" sx={{ textAlign: 'center' }}>Rare Cases History</Typography>
            </Box>

            {historyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : (
              <>
                <TableContainer
                  sx={{
                    maxHeight: '55vh',
                    '& .MuiTableCell-root': {
                      px: 1.6,
                      py: 1.2,
                    },
                  }}
                >
                  <Table size="medium" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>ID</TableCell>
                        <TableCell>Unit ID</TableCell>
                        <TableCell>Serial Number</TableCell>
                        <TableCell>From</TableCell>
                        <TableCell>To</TableCell>
                        <TableCell>IC Number</TableCell>
                        <TableCell>Changed By</TableCell>
                        <TableCell>Changed At</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {!historyRows.length ? (
                        <TableRow>
                          <TableCell colSpan={8} align="center">
                            No change history found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedHistoryRows.map((historyRow) => (
                          <TableRow key={historyRow.id} hover>
                            <TableCell>{historyRow.id}</TableCell>
                            <TableCell>{historyRow.unit_id || '-'}</TableCell>
                            <TableCell>{historyRow.serial_number || '-'}</TableCell>
                            <TableCell>{historyRow.previous_stock_type || '-'}</TableCell>
                            <TableCell>{historyRow.new_stock_type || '-'}</TableCell>
                            <TableCell>{historyRow.ic_number || '-'}</TableCell>
                            <TableCell>{historyRow.changed_by || '-'}</TableCell>
                            <TableCell>{historyRow.changed_at ? new Date(historyRow.changed_at).toLocaleString() : '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>

                <TablePagination
                  component="div"
                  count={historyRows.length}
                  page={historyPage}
                  onPageChange={handleHistoryPageChange}
                  rowsPerPage={historyRowsPerPage}
                  onRowsPerPageChange={handleHistoryRowsPerPageChange}
                  rowsPerPageOptions={[10, 25, 50, 100]}
                />
              </>
            )}
          </Paper>
        </>
      )}

      <Dialog
        open={changeDialogOpen}
        onClose={closeChangeDialog}
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
          Confirm Stock Type Change
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 0.6, pb: 0.25, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {activeRow
                ? `Serial ${activeRow.serial_number} will be changed to stock type ${selectedTargets[activeRow.id] || 'B'}`
                : 'Confirm the stock type change below.'}
            </Typography>
          </Box>

          <Box
            sx={{
              mt: 1.5,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 1.5,
            }}
          >
            <TextField
              label="IC Number"
              value={icNumberInput}
              onChange={(event) => setIcNumberInput(event.target.value)}
              fullWidth
              autoFocus
              sx={{ maxWidth: 420 }}
            />
            <TextField
              label="User Name"
              value={userNameInput}
              onChange={(event) => setUserNameInput(event.target.value)}
              fullWidth
              sx={{ maxWidth: 420 }}
            />

            {dialogError && (
              <Alert severity="error" sx={{ width: '100%', maxWidth: 420 }}>
                {dialogError}
              </Alert>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'center', pb: 2.1, px: 2.5, gap: 0.8 }}>
          <Button variant="outlined" onClick={closeChangeDialog} disabled={Boolean(updatingUnitId)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={handleConfirmStockTypeChange} disabled={Boolean(updatingUnitId)}>
            {updatingUnitId ? 'Saving...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RareCasesPage;
