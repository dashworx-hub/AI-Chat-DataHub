import { Link, useLocation } from 'react-router-dom';
import { Settings, UserPlus, Server, AlertCircle, PanelLeft, PanelLeftClose, Menu, X, MessageSquare, Bot } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { getApiBase, setApiBase } from '../utils/api';

const Header = ({ title, onToggleSidebar, sidebarOpen }) => {
  const location = useLocation();
  const [apiBase, setApiBaseState] = useState(getApiBase());
  const [limitsEnabled, setLimitsEnabled] = useState(false);
  const [showApiPopover, setShowApiPopover] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const apiPopoverRef = useRef(null);

  useEffect(() => {
    setApiBase(apiBase);
  }, [apiBase]);

  useEffect(() => {
    const checkLimits = () => {
      const saved = localStorage.getItem('chatLimits');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setLimitsEnabled(parsed.limitsEnabled === true);
        } catch (e) {
          setLimitsEnabled(false);
        }
      } else {
        setLimitsEnabled(false);
      }
    };
    
    checkLimits();
    
    const handleStorageChange = (e) => {
      if (e.key === 'chatLimits' || !e.key) {
        checkLimits();
      }
    };
    
    const handleCustomStorage = () => {
      checkLimits();
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('chatLimitsChanged', handleCustomStorage);
    const interval = setInterval(checkLimits, 300);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('chatLimitsChanged', handleCustomStorage);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (apiPopoverRef.current && !apiPopoverRef.current.contains(e.target)) {
        setShowApiPopover(false);
      }
    };
    if (showApiPopover) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showApiPopover]);

  const path = location.pathname;

  const tabs = [
    { to: '/', label: 'Chat', icon: <MessageSquare className="w-4 h-4" /> },
    { to: '/agents', label: 'Agents', icon: <Bot className="w-4 h-4" /> },
  ];

  return (
    <header className="glass-header">
      <div className="w-full px-4 md:px-6 min-w-0">
        <div className="flex items-center justify-between h-14 min-w-0 gap-4">
          {/* Left: sidebar toggle + logo */}
          <div className="flex items-center gap-3 min-w-0 flex-shrink-0">
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 transition-all"
                title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
              >
                {sidebarOpen ? <PanelLeftClose className="w-[18px] h-[18px]" /> : <PanelLeft className="w-[18px] h-[18px]" />}
              </button>
            )}
            <Link to="/" className="flex items-center flex-shrink-0 hover:opacity-80 transition-opacity">
              <img 
                src="/main_logo.png" 
                alt="Dashworx Logo" 
                className="h-6 w-auto max-w-[130px] object-contain"
              />
            </Link>
            {limitsEnabled && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-50 border border-amber-200 rounded-full text-[10px] font-semibold text-amber-700 flex-shrink-0">
                <AlertCircle className="w-3 h-3" />
                Limits
              </div>
            )}
          </div>

          {/* Center: primary tab navigation */}
          <nav className="hidden md:flex items-center gap-0.5 h-14">
            {tabs.map(tab => {
              const isActive = tab.to === '/' ? path === '/' : path.startsWith(tab.to);
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={`relative flex items-center gap-2 px-4 h-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-[#3E0AC2]'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-[#3E0AC2] rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right: actions + utilities */}
          <div className="flex items-center gap-2 flex-shrink-0 min-w-0">
            {/* New Agent CTA */}
            <Link
              to="/create"
              className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 ${
                path === '/create'
                  ? 'bg-[#3E0AC2] text-white shadow-sm'
                  : 'text-[#3E0AC2] bg-[#3E0AC2]/5 hover:bg-[#3E0AC2]/10 border border-[#3E0AC2]/20'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              New Agent
            </Link>

            {/* Divider */}
            <div className="hidden md:block h-5 w-px bg-gray-200/80"></div>

            {/* Settings icon */}
            <Link
              to="/settings"
              className={`hidden md:flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                path === '/settings'
                  ? 'bg-[#3E0AC2]/10 text-[#3E0AC2]'
                  : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100/80'
              }`}
              title="Settings"
            >
              <Settings className="w-[18px] h-[18px]" />
            </Link>

            {/* API Base popover */}
            <div className="relative hidden md:block" ref={apiPopoverRef}>
              <button
                onClick={() => setShowApiPopover(!showApiPopover)}
                className={`flex items-center justify-center w-8 h-8 rounded-lg transition-all ${
                  showApiPopover ? 'bg-[#3E0AC2]/10 text-[#3E0AC2]' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100/80'
                }`}
                title="API Base URL"
              >
                <Server className="w-[18px] h-[18px]" />
              </button>
              {showApiPopover && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-50">
                  <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block">API Base URL</label>
                  <div className="relative">
                    <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={apiBase}
                      onChange={(e) => setApiBaseState(e.target.value)}
                      className="input-field pl-9 pr-3 text-xs"
                      placeholder="http://localhost:8080"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Mobile sidebar toggle */}
            {onToggleSidebar && (
              <button
                onClick={onToggleSidebar}
                className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 transition-all"
                title="Toggle sidebar"
              >
                <PanelLeft className="w-[18px] h-[18px]" />
              </button>
            )}

            {/* Mobile hamburger */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100/80 transition-all"
            >
              {mobileMenuOpen ? <X className="w-[18px] h-[18px]" /> : <Menu className="w-[18px] h-[18px]" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-gray-200/50 bg-white/95 backdrop-blur-lg px-4 py-3 space-y-1">
          {tabs.map(tab => {
            const isActive = tab.to === '/' ? path === '/' : path.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-[#3E0AC2]/10 text-[#3E0AC2]'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                {tab.label}
              </Link>
            );
          })}
          <Link
            to="/create"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              path === '/create'
                ? 'bg-[#3E0AC2]/10 text-[#3E0AC2]'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            New Agent
          </Link>
          <Link
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
              path === '/settings'
                ? 'bg-[#3E0AC2]/10 text-[#3E0AC2]'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <div className="pt-2 mt-2 border-t border-gray-100">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1.5 block px-3">API Base URL</label>
            <div className="relative px-3">
              <Server className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={apiBase}
                onChange={(e) => setApiBaseState(e.target.value)}
                className="input-field pl-9 pr-3 text-xs"
                placeholder="http://localhost:8080"
              />
            </div>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
