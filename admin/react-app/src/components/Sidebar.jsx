import React from 'react';

export default function Sidebar({ currentScreen, setCurrentScreen }) {
  return (
    <aside className="fixed left-0 top-0 h-full w-64 z-40 bg-[#131313] border-r border-[#20201f] flex flex-col pt-10 pb-6 px-0 font-['Inter'] text-sm uppercase tracking-widest">
      <div className="px-6 mb-10">
        <h1 className="text-xl font-bold tracking-tighter text-[#8bacff] font-['Space_Grotesk']">TITANIUM FORGE</h1>
        <p className="font-['Inter'] font-medium text-[10px] tracking-widest uppercase opacity-60 text-zinc-400 mt-1">v4.2.0-STABLE</p>
      </div>

      <nav className="flex-1">
        {/* Dashboard Link */}
        <button 
          onClick={() => setCurrentScreen('admin_dashboard')}
          className={`w-full flex items-center px-6 py-4 transition-all gap-4 text-left ${
            currentScreen === 'admin_dashboard' 
              ? 'bg-[#20201f] text-[#8bacff] border-l-4 border-[#8bacff]'
              : 'text-gray-400 hover:text-white hover:bg-[#20201f]'
          }`}
        >
          <span className="material-symbols-outlined text-lg">dashboard</span>
          <span>Dashboard</span>
        </button>

        {/* SOP Link */}
        <button 
          onClick={() => setCurrentScreen('sop_processor')}
          className={`w-full flex items-center px-6 py-4 transition-all gap-4 text-left ${
            currentScreen === 'sop_processor' 
              ? 'bg-[#20201f] text-[#8bacff] border-l-4 border-[#8bacff]'
              : 'text-gray-400 hover:text-white hover:bg-[#20201f]'
          }`}
        >
          <span className="material-symbols-outlined text-lg">upload_file</span>
          <span>SOP Processor</span>
        </button>
        
        {/* Logs Link */}
        <button 
          onClick={() => setCurrentScreen('audit_logs')}
          className={`w-full flex items-center px-6 py-4 transition-all gap-4 text-left ${
            currentScreen === 'audit_logs' 
              ? 'bg-[#20201f] text-[#8bacff] border-l-4 border-[#8bacff]'
              : 'text-gray-400 hover:text-white hover:bg-[#20201f]'
          }`}
        >
          <span className="material-symbols-outlined text-lg">list_alt</span>
          <span>Audit Logs</span>
        </button>
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <button className="flex items-center px-6 py-3 text-gray-400 hover:text-error hover:bg-[#20201f] transition-all gap-4 text-left font-bold text-xs font-['Space_Grotesk'] tracking-widest uppercase">
          <span className="material-symbols-outlined text-lg">dangerous</span>
          <span>EMERGENCY_STOP</span>
        </button>
        
        <div className="border-t border-[#20201f] mt-2 pt-2">
          <button className="w-full flex items-center px-6 py-3 text-gray-400 hover:text-white hover:bg-[#20201f] transition-all gap-4 text-left">
            <span className="material-symbols-outlined text-lg">settings</span>
            <span>Settings</span>
          </button>
          <button className="w-full flex items-center px-6 py-3 text-gray-400 hover:text-white hover:bg-[#20201f] transition-all gap-4 text-left">
            <span className="material-symbols-outlined text-lg">logout</span>
            <span>Logout</span>
          </button>
        </div>
      </div>
    </aside>
  );
}
