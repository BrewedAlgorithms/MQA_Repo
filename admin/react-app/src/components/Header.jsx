import React from 'react';

export default function Header() {
  return (
    <header className="bg-transparent flex justify-end items-center w-full px-6 py-6 sticky top-0 z-50 pointer-events-none">
      <div className="flex items-center gap-6 pointer-events-auto">
        <div className="h-10 w-10 bg-surface-container-highest border border-outline-variant flex items-center justify-center overflow-hidden">
            <img 
                alt="Admin Profile Avatar" 
                className="w-full h-full object-cover" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAx-FeKE6fLMwLG8pbbnbxNzYRI8Iv-owuRLhHeXdvgsXeh3AzRzFJRVI6l8HBN2A4efu1wzi1LTHqUyVqz4mXhY-Rxaz6M4nuN79LkqyfAq3bpEelQtficAE-o1cIZsNSCmcMIJHfmaZvIeDOkbKeCpyqqJpdQvTR1lsQjSIo_rBDeg_KcYY_7q_BF_fyHQ_0yh5ZkaIJUfAjNHoFAT5HIEPcjPI5B_WU3rV_xFs5QJ5GvxlfK3udzmAPRcgPznzXAlbD7Qsz_STs"
            />
        </div>
      </div>
    </header>
  );
}
