import { type ReactNode } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import TaskBar from './TaskBar';

interface ShellProps {
  children: ReactNode;
  onOpenSettings: () => void;
}

export default function Shell({ children, onOpenSettings }: ShellProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#08080a] text-[#dadadf] rounded-lg">
      <Sidebar onOpenSettings={onOpenSettings} />
      <div className="flex flex-1 flex-col min-w-0">
        <Header />
        <main className="flex-1 overflow-y-auto relative">
          {/* Subtle top glow */}
          <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-[#3b82f6]/[0.03] to-transparent pointer-events-none" />
          <div className="relative mx-auto max-w-[600px] px-5 py-6">
            {children}
          </div>
        </main>
        <TaskBar />
      </div>
    </div>
  );
}
