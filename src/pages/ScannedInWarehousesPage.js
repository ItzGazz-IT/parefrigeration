import DataTablePage from '../components/DataTablePage';

const ScannedInWarehousesPage = () => {
  return (
    <DataTablePage
      title="Scanned In - Warehouses"
      endpoint="/api/dashboard/scanned-in-warehouse-breakdown"
      subtitle="Each warehouse name with scanned-in sources (1-6) and totals"
      hiddenColumns={['source_id']}
    />
  );
};

export default ScannedInWarehousesPage;
