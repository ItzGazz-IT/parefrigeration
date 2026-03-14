import DataTablePage from '../components/DataTablePage';

const ScannedInSource2Page = () => {
  return (
    <DataTablePage
      title="Scanned In - TFFW Durban"
      endpoint="/api/dashboard/units-by-source/2"
      subtitle="All units scanned in linked to TFFW Durban"
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default ScannedInSource2Page;
