import DataTablePage from '../components/DataTablePage';

const UnitsPage = () => {
  return (
    <DataTablePage
      title="Units"
      endpoint="/api/dashboard/units"
      hiddenColumns={['stock_status', 'created_at']}
    />
  );
};

export default UnitsPage;
