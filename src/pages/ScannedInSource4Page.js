import DataTablePage from '../components/DataTablePage';

const ScannedInSource4Page = () => {
  const excludeQuarantineFilter = (row) => {
    const stockType = String(row.stock_type ?? '').trim().toUpperCase();
    return stockType !== 'Q';
  };

  return (
    <DataTablePage
      title="Scanned In - TFFW Exchange"
      endpoint="/api/dashboard/units-by-source/4"
      subtitle="All released units scanned in linked to TFFW Exchange"
      rowFilter={excludeQuarantineFilter}
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default ScannedInSource4Page;
