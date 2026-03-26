import React from 'react';
import PageHeader from './PageHeader';
import Filters from './Filters';
import DataTable from './DataTable';
import { auditLogsData } from '../../data/auditLogs';

export default function SystemAuditLogs() {
  return (
    <div className="p-8 flex flex-col gap-8 flex-grow">
      <PageHeader />
      <Filters />
      <DataTable logs={auditLogsData} />
    </div>
  );
}
