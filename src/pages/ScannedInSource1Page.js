import DataTablePage from '../components/DataTablePage';

const ScannedInSource1Page = () => {
  return (
    <DataTablePage
      title="Scanned In - TFFW Swaziland"
      endpoint="/api/dashboard/units-by-source/1"
      subtitle="All units scanned in linked to TFFW Swaziland"
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default ScannedInSource1Page;
