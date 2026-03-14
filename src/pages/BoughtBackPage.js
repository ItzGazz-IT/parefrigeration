import DataTablePage from '../components/DataTablePage';

const BoughtBackPage = () => {
  return (
    <DataTablePage
      title="Scanned In - Source 6"
      endpoint="/api/dashboard/units-by-source/6"
      subtitle="All units scanned in with source 6 (Bought Back)"
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default BoughtBackPage;
