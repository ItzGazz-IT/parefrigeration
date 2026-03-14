import DataTablePage from '../components/DataTablePage';

const RareCasesHistoryPage = () => {
  return (
    <DataTablePage
      title="Rare Cases History"
      endpoint="/api/dashboard/rare-cases-history"
      subtitle="All stock type changes made from Rare Cases (newest first)"
    />
  );
};

export default RareCasesHistoryPage;
