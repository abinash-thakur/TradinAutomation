import React, { useId } from 'react';

interface DeltaLogoProps {
  variant?: 'icon' | 'badge' | 'full';
  className?: string;
  subText?: string;
  withGlow?: boolean;
  type?: 'india' | 'global' | 'auto';
}

export const DeltaLogo: React.FC<DeltaLogoProps> = ({
  variant = 'icon',
  className = 'w-6 h-6',
  subText = 'EXCHANGE',
  withGlow = false,
  type = 'auto',
}) => {
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9]/g, '');
  const gradTop = `deltaGradTop_${safeId}`;
  const gradBottom = `deltaGradBottom_${safeId}`;

  const isGlobal = type === 'global' || (type === 'auto' && subText?.toLowerCase().includes('global'));

  const renderIcon = (iconClass: string = className) => (
    <div className={`relative inline-flex items-center justify-center shrink-0 ${withGlow ? 'group' : ''}`}>
      {withGlow && (
        <div
          className={`absolute -inset-1 rounded-full blur-sm opacity-70 group-hover:opacity-100 transition duration-500 ${
            isGlobal
              ? 'bg-gradient-to-r from-[#00D2B5]/30 to-[#0080FF]/30'
              : 'bg-gradient-to-r from-[#FF9300]/30 to-[#2CB72C]/30'
          }`}
        />
      )}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 30 30"
        className={`${iconClass} relative drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]`}
        fill="none"
      >
        <defs>
          <linearGradient id={gradTop} x1="32.321" x2="20.805" y1="8.563" y2="-1.108" gradientUnits="userSpaceOnUse">
            <stop stopColor={isGlobal ? '#00D2B5' : '#FD7D02'} />
            <stop offset="1" stopColor={isGlobal ? '#00E8C8' : '#FF9300'} />
          </linearGradient>
          <linearGradient id={gradBottom} x1="22.878" x2="11.929" y1="10.787" y2="20.649" gradientUnits="userSpaceOnUse">
            <stop stopColor={isGlobal ? '#0070E0' : '#168016'} />
            <stop offset="1" stopColor={isGlobal ? '#00D2B5' : '#2CB72C'} />
          </linearGradient>
        </defs>
        {/* Top facet */}
        <path fill={`url(#${gradTop})`} d="m10.12 10 9.76 5 9.757-5L10.121 0v10Z" />
        {/* Bottom facet */}
        <path fill={`url(#${gradBottom})`} d="M10.121 20v10l19.517-10-9.759-5-9.758 5Z" />
        {/* Right facet */}
        <path fill={isGlobal ? '#00D2B5' : '#2CB72C'} d="M29.638 20V10l-9.758 5 9.758 5Z" />
        {/* Left facet */}
        <path fill={isGlobal ? '#0095FF' : '#FF9300'} d="M10.12 10v10L.362 15l9.758-5Z" />
      </svg>
    </div>
  );

  if (variant === 'icon') {
    return renderIcon();
  }

  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex items-center space-x-2 px-2.5 py-1 rounded-xl bg-[#0c0e12]/80 hover:bg-[#13161b] border border-[#22262f] shadow-sm transition ${className}`}
      >
        {renderIcon('w-4 h-4')}
        <div className="flex items-center space-x-1.5 font-sans leading-none">
          <span className="text-xs font-bold text-white tracking-wide">DELTA</span>
          <span className="text-[10px] font-semibold text-[#85888e] tracking-wider uppercase">
            {subText}
          </span>
        </div>
      </div>
    );
  }

  // variant === 'full'
  return (
    <div className={`inline-flex items-center space-x-2.5 ${className}`}>
      {renderIcon('w-7 h-7')}
      <div className="flex flex-col text-left leading-none">
        <span className="text-sm font-black tracking-tight text-white flex items-center space-x-1">
          <span>DELTA</span>
          <span className="text-[#FF9300] font-normal">EXCHANGE</span>
        </span>
        {subText && (
          <span className="text-[9px] font-bold text-[#2CB72C] tracking-widest uppercase mt-0.5">
            {subText}
          </span>
        )}
      </div>
    </div>
  );
};
