import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from '@mui/material';
import { apiGet } from '../api';

const formatColumnName = (columnName) => {
  if (columnName === 'warehouse_id') {
    return 'Warehouse';
  }

  if (columnName === 'model_id') {
    return 'Model ID';
  }

  if (columnName === 'model_name' || columnName === 'model') {
    return 'Model Name';
  }

  return columnName
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const BOOLEAN_STYLE_COLUMNS = new Set(['delivered', 'include_weekly_report', 'weekly_report']);

const formatCellValue = (value, columnName) => {
  if (value === null || value === undefined || value === '') {
    return '-';
  }

  if (value === true) {
    return 'Yes';
  }

  if (value === false) {
    return 'No';
  }

  const normalizedColumnName = String(columnName || '').trim().toLowerCase();
  if (BOOLEAN_STYLE_COLUMNS.has(normalizedColumnName)) {
    if (value === 1 || value === '1') {
      return 'Yes';
    }

    if (value === 0 || value === '0') {
      return 'No';
    }
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
};

const DataTablePage = ({ title, endpoint, rowFilter, subtitle, hiddenColumns = [] }) => {
  const [rows, setRows] = useState([]);
  const [modelsById, setModelsById] = useState({});
  const [warehousesById, setWarehousesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    const loadRows = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await apiGet(endpoint);
        const loadedRows = response.data?.rows || [];
        const filteredRows = typeof rowFilter === 'function'
          ? loadedRows.filter(rowFilter)
          : loadedRows;
        setRows(filteredRows);

        const hasModelId = filteredRows.some((row) => row.model_id !== undefined && row.model_id !== null);
        const hasWarehouseId = filteredRows.some((row) => row.warehouse_id !== undefined && row.warehouse_id !== null);

        if (hasModelId) {
          const modelResponse = await apiGet('/api/dashboard/models');
          const modelRows = modelResponse.data?.rows || [];

          const candidateColumns = ['model_code', 'model_name', 'model_number', 'model_no', 'model', 'name'];
          const modelNameColumn = candidateColumns.find((columnName) =>
            modelRows.some((modelRow) => modelRow[columnName] !== undefined && modelRow[columnName] !== null)
          );

          const nextModelsById = modelRows.reduce((accumulator, modelRow) => {
            if (modelRow.id === undefined || modelRow.id === null) {
              return accumulator;
            }

            accumulator[modelRow.id] = modelNameColumn ? modelRow[modelNameColumn] : null;
            return accumulator;
          }, {});

          setModelsById(nextModelsById);
        } else {
          setModelsById({});
        }

        if (hasWarehouseId) {
          const warehouseResponse = await apiGet('/api/dashboard/warehouses');
          const warehouseRows = warehouseResponse.data?.rows || [];

          const candidateColumns = ['name', 'warehouse_name', 'warehouse', 'title'];
          const warehouseNameColumn = candidateColumns.find((columnName) =>
            warehouseRows.some((warehouseRow) => warehouseRow[columnName] !== undefined && warehouseRow[columnName] !== null)
          );

          const nextWarehousesById = warehouseRows.reduce((accumulator, warehouseRow) => {
            if (warehouseRow.id === undefined || warehouseRow.id === null) {
              return accumulator;
            }

            accumulator[warehouseRow.id] = warehouseNameColumn ? warehouseRow[warehouseNameColumn] : warehouseRow.id;
            return accumulator;
          }, {});

          setWarehousesById(nextWarehousesById);
        } else {
          setWarehousesById({});
        }

        setPage(0);
      } catch (requestError) {
        setError('Unable to load table data from the API.');
      } finally {
        setLoading(false);
      }
    };

    loadRows();
  }, [endpoint, rowFilter]);

  const columns = useMemo(() => {
    if (!rows.length) {
      return [];
    }

    const hiddenColumnsSet = new Set(hiddenColumns.map((columnName) => String(columnName).trim().toLowerCase()));
    const baseColumns = Object.keys(rows[0]).filter(
      (columnName) => !hiddenColumnsSet.has(String(columnName).trim().toLowerCase())
    );
    const hasModelIdColumn = baseColumns.includes('model_id');
    const hasModelNameColumn = baseColumns.includes('model_name') || baseColumns.includes('model');

    if (hasModelIdColumn) {
      const nextColumns = [];

      baseColumns.forEach((columnName) => {
        if (columnName === 'model') {
          return;
        }

        if (columnName === 'model_id') {
          nextColumns.push('model_id');
          nextColumns.push('model_name');
          return;
        }

        if (columnName === 'model_name') {
          return;
        }

        nextColumns.push(columnName);
      });

      if (!hasModelNameColumn) {
        return nextColumns;
      }

      return nextColumns;
    }

    return baseColumns;
  }, [rows, hiddenColumns]);

  const paginatedRows = useMemo(
    () => rows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, page, rowsPerPage]
  );

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
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2.4, textAlign: 'center' }}>
        {subtitle || `${rows.length} rows loaded`}
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Paper elevation={2} sx={{ borderRadius: 2.2, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.35, borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'rgba(46, 86, 230, 0.03)' }}>
            <Typography variant="h6" sx={{ textAlign: 'center' }}>{title} Data</Typography>
          </Box>
          <TableContainer
            sx={{
              maxHeight: '68vh',
              '& .MuiTableCell-root': {
                px: 2.25,
                py: 1.75,
              },
              '& .MuiTable-root': {
                minWidth: 980,
              },
            }}
          >
            <Table size="medium" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((columnName) => (
                  <TableCell key={columnName}>{formatColumnName(columnName)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {!rows.length ? (
                <TableRow>
                  <TableCell colSpan={Math.max(columns.length, 1)} align="center">
                    No rows found.
                  </TableCell>
                </TableRow>
              ) : (
                paginatedRows.map((row, rowIndex) => (
                  <TableRow key={row.id || rowIndex} hover>
                    {columns.map((columnName) => {
                      const value = columnName === 'model_name'
                        ? (row.model_name || modelsById[row.model_id] || row.model || null)
                        : columnName === 'warehouse_id'
                          ? (warehousesById[row.warehouse_id] || row.warehouse_name || row.warehouse || row[columnName])
                        : row[columnName];
                      return (
                        <TableCell key={`${row.id || rowIndex}-${columnName}`}>
                          {formatCellValue(value, columnName)}
                        </TableCell>
                      );
                    })}
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

export default DataTablePage;
