import React from 'react';

export default function DataTable({ logs }) {
  return (
    <section className="bg-surface-container-low flex-grow flex flex-col overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-surface-container-highest">
              <th className="px-6 py-4 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Timestamp</th>
              <th className="px-6 py-4 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Station</th>
              <th className="px-6 py-4 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Event Type</th>
              <th className="px-6 py-4 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">User / Entity</th>
              <th className="px-6 py-4 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Action Taken</th>
              <th className="px-6 py-4 font-label text-[10px] tracking-widest uppercase text-on-surface-variant">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-transparent">
            {logs.map((log) => (
              <tr key={log.id} className="hover:bg-surface-bright transition-colors">
                <td className="px-6 py-4 font-space text-sm text-[#8bacff]">{log.timestamp}</td>
                <td className="px-6 py-4 font-body text-sm">{log.station}</td>
                <td className="px-6 py-4">
                  <span className={`${log.eventTypeBadge} px-2 py-0.5 font-label text-[10px] uppercase`}>
                    {log.eventType}
                  </span>
                </td>
                <td className="px-6 py-4 font-body text-sm text-on-surface-variant">{log.user}</td>
                <td className="px-6 py-4 font-body text-sm italic">{log.action}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 ${log.statusColor}`}></span>
                    <span className="font-label text-[10px] uppercase">{log.status}</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
