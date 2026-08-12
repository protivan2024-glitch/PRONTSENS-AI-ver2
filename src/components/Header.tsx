import React, { useState, useEffect } from 'react';
import { HseLogo } from './HseLogo';
import { UserDoc } from '../types';
import { LogOut, FileEdit, UserCheck, ShieldAlert, BarChart3, Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  user: UserDoc | null;
  onLogout: () => void;
  syncState: 'synchronized' | 'connecting' | 'offline';
  draftsCount: number;
  onOpenDrafts: () => void;
  metrics: {
    total: number;
    conformes: number;
    alertasCriticos: number;
    scoreHse: number;
  };
  onOpenAdminPanel?: () => void;
  isAdminOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  onLogout,
  syncState,
  draftsCount,
  onOpenDrafts,
  metrics,
  onOpenAdminPanel,
  isAdminOpen = false
}) => {
  const [isVisible, setIsVisible] = useState(true);
  const [lastScrollY, setLastScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY > lastScrollY && currentScrollY > 60) {
        setIsVisible(false); // Hide on scroll down on mobile
      } else {
        setIsVisible(true);  // Show on scroll up
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  // Sync state badge rendering
  let syncColorClass = 'bg-emerald-500';
  let syncText = 'SINCRONIZADO';
  if (syncState === 'connecting') {
    syncColorClass = 'bg-amber-500';
    syncText = 'CONECTANDO';
  } else if (syncState === 'offline') {
    syncColorClass = 'bg-red-500';
    syncText = 'OFFLINE';
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-40 bg-[#3F3F3F] text-white transition-transform duration-200 border-b border-gray-700/50 shadow-md ${
        isVisible ? 'translate-y-0' : '-translate-y-full sm:translate-y-0'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo */}
          <div className="flex items-center gap-4">
            <HseLogo className="h-9 sm:h-11" variant="light" />
          </div>

          {/* Desktop Metrics Bar */}
          <div className="hidden lg:flex items-center gap-6 bg-gray-800/60 px-5 py-2 rounded-xl border border-gray-700/60">
            <div className="flex flex-col">
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Atendimentos</span>
              <span className="text-base font-bold text-white">{metrics.total}</span>
            </div>
            <div className="h-6 w-px bg-gray-700" />
            <div className="flex flex-col">
              <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">Conformes</span>
              <span className="text-base font-bold text-emerald-400">{metrics.conformes}</span>
            </div>
            <div className="h-6 w-px bg-gray-700" />
            <div className="flex flex-col">
              <span className="text-[10px] text-amber-400 font-medium uppercase tracking-wider">Alertas / Críticos</span>
              <span className="text-base font-bold text-amber-400">{metrics.alertasCriticos}</span>
            </div>
            <div className="h-6 w-px bg-gray-700" />
            <div className="flex flex-col">
              <span className="text-[10px] text-lime-400 font-medium uppercase tracking-wider">Score HSE</span>
              <span className="text-base font-bold text-lime-400">{metrics.scoreHse}%</span>
            </div>
          </div>

          {/* Actions & User Menu */}
          <div className="flex items-center gap-3">

            {/* Sync State Indicator */}
            <div className="flex items-center gap-2 bg-gray-800/80 px-3 py-1.5 rounded-lg border border-gray-700/80 text-[11px] font-semibold text-gray-200">
              <span className="relative flex h-2.5 w-2.5">
                {syncState !== 'offline' && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${syncColorClass}`} />
                )}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${syncColorClass}`} />
              </span>
              <span className="hidden sm:inline tracking-wider">{syncText}</span>
            </div>

            {/* Drafts Button */}
            <button
              onClick={onOpenDrafts}
              className="relative flex items-center gap-1.5 bg-gray-700 hover:bg-gray-600 active:bg-gray-800 text-white px-3 py-2 rounded-lg text-xs font-medium transition-colors border border-gray-600"
              title="Atendimentos Pausados (Rascunhos)"
            >
              <FileEdit className="w-4 h-4 text-lime-400" />
              <span className="hidden md:inline">Rascunhos</span>
              {draftsCount > 0 && (
                <span className="ml-1 bg-lime-500 text-gray-900 font-bold text-[10px] px-1.5 py-0.5 rounded-full">
                  {draftsCount}
                </span>
              )}
            </button>

            {/* Admin Panel Toggle (if Supervisor/Admin) */}
            {user && (user.role === 'Administrador' || user.role === 'Supervisor') && onOpenAdminPanel && (
              <button
                onClick={onOpenAdminPanel}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                  isAdminOpen
                    ? 'bg-lime-500 text-gray-900 border-lime-400'
                    : 'bg-gray-700 text-white border-gray-600 hover:bg-gray-600'
                }`}
              >
                <BarChart3 className="w-4 h-4" />
                <span className="hidden sm:inline">Painel Admin</span>
              </button>
            )}

            {/* User Profile / Logout */}
            {user && (
              <div className="flex items-center gap-2 border-l border-gray-700 pl-3 ml-1">
                <div className="hidden sm:flex flex-col text-right">
                  <span className="text-xs font-medium text-white truncate max-w-[140px]">{user.name}</span>
                  <span className="text-[10px] text-lime-400 font-bold tracking-wider uppercase">
                    {user.role}
                  </span>
                </div>

                <button
                  onClick={onLogout}
                  className="p-2 text-gray-300 hover:text-red-400 hover:bg-gray-800 rounded-lg transition-colors"
                  title="Sair da Conta"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
