import { useCallback } from 'react';
import DataTablePage from '../components/DataTablePage';

const QuarantinePage = () => {
  const quarantineFilter = useCallback((row) => {
    const stockType = row.stock_stype ?? row.stock_type ?? '';
    return String(stockType).trim().toUpperCase() === 'Q';
  }, []);

  return (
    <DataTablePage
      title="Quarantine"
      endpoint="/api/dashboard/units"
      rowFilter={quarantineFilter}
      hiddenColumns={['stock_status', 'created_at']}
      subtitle="Showing units where stock type is Q"
    />
  );
};

export default QuarantinePage;
