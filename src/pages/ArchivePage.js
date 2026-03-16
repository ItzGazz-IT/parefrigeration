import DataTablePage from '../components/DataTablePage';

const ArchivePage = () => {
  return (
    <DataTablePage
      title="Archive"
      endpoint="/api/dashboard/archive"
      subtitle="Units archived after IO number upload"
      hiddenColumns={['source_event_id', 'created_at']}
    />
  );
};

export default ArchivePage;
