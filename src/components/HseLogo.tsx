import React from 'react';

interface HseLogoProps {
  className?: string;
  variant?: 'light' | 'dark' | 'header';
}

export const HseLogo: React.FC<HseLogoProps> = ({ className = 'h-10', variant = 'light' }) => {
  const textColor = variant === 'dark' ? '#3F3F3F' : '#FFFFFF';
  const subTextColor = variant === 'dark' ? '#6B7280' : '#A6CE39';

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* SVG Monogram hse */}
      <svg
        viewBox="0 0 160 65"
        className="h-full w-auto select-none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Floating lime green pill over shoulder of 'h' */}
        <rect x="22" y="8" width="10" height="24" rx="5" fill="#A6CE39" />

        {/* 'h' stem and arch in graphite */}
        <path
          d="M12 8 C12 5.7, 13.7 4, 16 4 C18.3 4, 20 5.7, 20 8 V52 C20 54.3, 18.3 56, 16 56 C13.7 56, 12 54.3, 12 52 V8 Z"
          fill="#3D3D3D"
        />
        <path
          d="M19 28 C23 21, 33 21, 37 27 C40 31.5, 40 52, 40 52 C40 54.3, 38.3 56, 36 56 C33.7 56, 32 54.3, 32 52 V32 C32 28.5, 27 28.5, 20 33 Z"
          fill="#3D3D3D"
        />

        {/* 's' curve */}
        <path
          d="M62 26 C53 24, 46 28, 47 35 C48 42, 63 41, 62 49 C61 56, 47 56, 45 50"
          stroke="#3D3D3D"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 'e' loop */}
        <path
          d="M87 39 H69 C69 29, 87 26, 86 36 C85 46, 70 56, 86 54"
          stroke="#3D3D3D"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Institutional Text */}
      <div className="flex flex-col justify-center leading-none border-l border-gray-300/40 pl-3">
        <span className="font-bold tracking-widest text-[11px] sm:text-[13px]" style={{ color: textColor }}>
          SAÚDE · SEGURANÇA
        </span>
        <span className="font-semibold tracking-wider text-[9px] sm:text-[10px] mt-0.5" style={{ color: subTextColor }}>
          MEIO AMBIENTE
        </span>
      </div>
    </div>
  );
};
