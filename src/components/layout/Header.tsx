import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

export default function Header() {
  const win = getCurrentWindow();

  return (
    <header
      className="flex h-12 items-center justify-end border-b border-[#222225] bg-[#09090b] px-3"
      data-tauri-drag-region
    >
      {/* Window controls (Windows/Linux style) */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => win.minimize()}
          className="flex h-8 w-10 items-center justify-center rounded text-[#6e6e76] transition-colors hover:bg-[#1a1a1d] hover:text-[#a0a0a8]"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => win.toggleMaximize()}
          className="flex h-8 w-10 items-center justify-center rounded text-[#6e6e76] transition-colors hover:bg-[#1a1a1d] hover:text-[#a0a0a8]"
        >
          <Square size={12} />
        </button>
        <button
          onClick={() => win.close()}
          className="flex h-8 w-10 items-center justify-center rounded text-[#6e6e76] transition-colors hover:bg-[#ef4444]/10 hover:text-[#ef4444]"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
