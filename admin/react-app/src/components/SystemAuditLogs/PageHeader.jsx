import React from 'react';

export default function PageHeader() {
  return (
    <section className="flex flex-col md:flex-row md:items-end justify-between gap-6">
      <div>
        <h2 className="font-headline text-4xl font-bold tracking-tighter uppercase mb-1">System Audit Logs</h2>
      </div>
    </section>
  );
}
