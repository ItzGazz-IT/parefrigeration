import DataTablePage from '../components/DataTablePage';

const InhouseExchangesPage = () => {
  return (
    <DataTablePage
      title="Scanned In - Inhouse Exchange"
      endpoint="/api/dashboard/units-by-source/5"
      subtitle="All units scanned in linked to Inhouse Exchange"
      hiddenColumns={['stock_status', 'source_id', 'date_received', 'created_at']}
    />
  );
};

export default InhouseExchangesPage;
