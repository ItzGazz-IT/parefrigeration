import DataTablePage from '../components/DataTablePage';

const ScannedInSource3Page = () => {
  return (
    <DataTablePage
      title="Scanned In - TFFW Midrand"
      endpoint="/api/dashboard/units-by-source/3"
      subtitle="All units scanned in linked to TFFW Midrand"
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default ScannedInSource3Page;
