import DataTablePage from '../components/DataTablePage';

const ExchangesPage = () => {
  return (
    <DataTablePage
      title="Exchanges"
      endpoint="/api/dashboard/inhouse-exchanges"
      subtitle="All inhouse exchanges"
    />
  );
};

export default ExchangesPage;
