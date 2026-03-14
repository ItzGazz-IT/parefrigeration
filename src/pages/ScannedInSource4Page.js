import DataTablePage from '../components/DataTablePage';

const ScannedInSource4Page = () => {
  return (
    <DataTablePage
      title="Scanned In - TFFW Exchange"
      endpoint="/api/dashboard/units-by-source/4"
      subtitle="All units scanned in linked to TFFW Exchange"
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default ScannedInSource4Page;
