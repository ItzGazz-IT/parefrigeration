import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
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
  Typography,
} from '@mui/material';
import { apiGet, apiPost } from '../api';

const QuarantinePage = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedTargets, setSelectedTargets] = useState({});
  const [docsReceivedByUnit, setDocsReceivedByUnit] = useState({});
  const [updatingUnitId, setUpdatingUnitId] = useState(null);

  const loadRows = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiGet('/api/dashboard/quarantine');
      const loadedRows = response.data?.rows || [];
      setRows(loadedRows);

      setSelectedTargets((previousTargets) => {
        const nextTargets = { ...previousTargets };
        loadedRows.forEach((row) => {
          if (!nextTargets[row.id]) {
            nextTargets[row.id] = 'Y';
          }
        });
        return nextTargets;
      });

      setDocsReceivedByUnit((previousDocsMap) => {
        const nextDocsMap = { ...previousDocsMap };
        loadedRows.forEach((row) => {
          if (typeof nextDocsMap[row.id] !== 'boolean') {
            nextDocsMap[row.id] = false;
          }
        });
        return nextDocsMap;
      });
    } catch (_requestError) {
      setError('Unable to load quarantine units.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const paginatedRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, page, rowsPerPage]
  );

  const handleTargetChange = (unitId, stockType) => {
    setSelectedTargets((previousTargets) => ({
      ...previousTargets,
      [unitId]: stockType,
    }));
  };

  const handleDocsReceivedChange = (unitId, checked) => {
    setDocsReceivedByUnit((previousDocsMap) => ({
      ...previousDocsMap,
      [unitId]: checked,
    }));
  };

  const handleRelease = async (row) => {
    const docsReceived = docsReceivedByUnit[row.id] === true;
    if (!docsReceived) {
      setError('Confirm docs received before moving a unit from quarantine.');
      return;
    }

    try {
      setUpdatingUnitId(row.id);
      setError('');
      setMessage('');

      const targetStockType = selectedTargets[row.id] || 'Y';
      await apiPost('/api/dashboard/quarantine/release', {
        unitId: row.id,
        stockType: targetStockType,
        docsReceived: true,
      });

      await loadRows();
      setMessage(`Serial ${row.serial_number} moved to TFFW Exchange with stock type ${targetStockType}.`);
    } catch (requestError) {
      const serverError = requestError?.response?.data?.error;
      setError(serverError || 'Failed to release unit from quarantine.');
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

  return (
    <Box sx={{ px: { xs: 0, md: 1 }, py: { xs: 1, md: 1.8 } }}>
      <Typography variant="h4" sx={{ mb: 0.75, textAlign: 'center' }}>
        Quarantine
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.4, textAlign: 'center' }}>
        TFFW Exchange scan-in units remain here with stock type Q until docs are received and code is set to Y or B.
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
        <Paper elevation={2} sx={{ borderRadius: 2.2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.35, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(46, 86, 230, 0.03)' }}>
            <Typography variant="h6" sx={{ textAlign: 'center' }}>Quarantine Units</Typography>
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
                  <TableCell>Current Code</TableCell>
                  <TableCell>Change To</TableCell>
                  <TableCell>Docs Received</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {!rows.length ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      No quarantined TFFW Exchange units found.
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
                          value={selectedTargets[row.id] || 'Y'}
                          onChange={(event) => handleTargetChange(row.id, event.target.value)}
                          disabled={updatingUnitId === row.id}
                          sx={{ minWidth: 82 }}
                        >
                          <MenuItem value="Y">Y</MenuItem>
                          <MenuItem value="B">B</MenuItem>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={docsReceivedByUnit[row.id] === true}
                          onChange={(event) => handleDocsReceivedChange(row.id, event.target.checked)}
                          disabled={updatingUnitId === row.id}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="contained"
                          size="small"
                          onClick={() => handleRelease(row)}
                          disabled={updatingUnitId === row.id || docsReceivedByUnit[row.id] !== true}
                        >
                          {updatingUnitId === row.id ? 'Saving...' : 'Move to TFFW Exchange'}
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
      )}
    </Box>
  );
};

export default QuarantinePage;
