import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import QRCode from 'qrcode';
import { DisplayBoardData } from '@campusbite/shared';
import { apiRequest } from '../../services/api.js';
import {
  Utensils,
  Flame,
  Sparkles,
  Clock,
  Maximize2,
  Minimize2,
  RefreshCw,
  QrCode,
  Smartphone
} from 'lucide-react';

export const PublicDisplayBoardPage: React.FC = () => {
  const [boardData, setBoardData] = useState<DisplayBoardData>({
    preparing: [],
    ready: [],
    lastUpdated: new Date().toISOString()
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const socketRef = useRef<Socket | null>(null);
  const trackUrl = typeof window !== 'undefined' ? `${window.location.origin}/track` : '/track';

  // 1. Clock update every second
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        })
      );
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Generate Universal QR Code for TV board
  useEffect(() => {
    QRCode.toDataURL(trackUrl, {
      width: 180,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    })
      .then((url) => setQrCodeDataUrl(url))
      .catch((err) => console.error('Failed to generate display board QR', err));
  }, [trackUrl]);

  // 3. Fetch board data from API
  const fetchBoardData = useCallback(async () => {
    try {
      const res = await apiRequest<{ board: DisplayBoardData }>('/tracking/board');
      setBoardData(res.board);
    } catch (err) {
      console.warn('Failed to fetch public display board data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 4. Initial load & periodic background polling (every 20s as fallback)
  useEffect(() => {
    fetchBoardData();
    const fallbackPoll = setInterval(fetchBoardData, 20000);
    return () => clearInterval(fallbackPoll);
  }, [fetchBoardData]);

  // 5. Socket.IO Real-Time Synchronization
  useEffect(() => {
    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket: Socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('subscribe:board');
      fetchBoardData();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('reconnect', () => {
      setIsConnected(true);
      socket.emit('subscribe:board');
      fetchBoardData();
    });

    socket.on('BOARD_UPDATED', () => {
      fetchBoardData();
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchBoardData]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none overflow-hidden">
      {/* Top Header Bar for TV / Wall Screen */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md shadow-orange-950/50">
            <Utensils className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center">
              CampusBite <span className="text-orange-500 ml-2 text-base font-semibold">Cafeteria Board</span>
            </h1>
            <p className="text-xs text-slate-400">Live Kitchen & Pickup Display</p>
          </div>
        </div>

        {/* Center Live Badge */}
        <div className="hidden md:flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-800/90 border border-slate-700">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            {isConnected ? 'Live Sync' : 'Reconnecting...'}
          </span>
        </div>

        {/* Right Info: Clock & Fullscreen */}
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <span className="font-mono text-xl sm:text-2xl font-black tracking-wider text-white">
              {currentTime || '--:--:--'}
            </span>
          </div>

          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            aria-label="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Main Two-Column Status Board */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-6 overflow-hidden">
        {/* ========================================================= */}
        {/* LEFT COLUMN: PREPARING (Cooking in Progress)              */}
        {/* ========================================================= */}
        <div className="flex flex-col bg-slate-900/90 border-2 border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-amber-400 uppercase">
                  Preparing
                </h2>
                <p className="text-xs text-slate-400">Orders currently cooking in kitchen</p>
              </div>
            </div>

            <span className="font-mono text-base font-bold px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-xl">
              {boardData.preparing.length}
            </span>
          </div>

          {/* Tokens Grid */}
          <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              </div>
            ) : boardData.preparing.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                <Clock className="w-10 h-10 stroke-1" />
                <p className="text-sm font-medium">No orders currently preparing</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {boardData.preparing.map((orderNumber) => (
                  <div
                    key={orderNumber}
                    className="bg-slate-950/80 border-2 border-amber-500/40 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center shadow-lg transition-transform hover:scale-105"
                  >
                    <span className="text-xs uppercase tracking-wider text-amber-400/80 font-bold mb-1">
                      Order
                    </span>
                    <span className="font-mono font-black text-2xl sm:text-3xl text-white tracking-tight">
                      {orderNumber}
                    </span>
                    <span className="mt-2 text-[10px] text-amber-300/80 font-semibold flex items-center">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping mr-1.5" />
                      Cooking
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* RIGHT COLUMN: READY FOR PICKUP                            */}
        {/* ========================================================= */}
        <div className="flex flex-col bg-slate-900/90 border-2 border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden backdrop-blur">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-inner">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-emerald-400 uppercase">
                  Ready for Pickup
                </h2>
                <p className="text-xs text-slate-400">Please collect from counter</p>
              </div>
            </div>

            <span className="font-mono text-base font-bold px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl">
              {boardData.ready.length}
            </span>
          </div>

          {/* Tokens Grid */}
          <div className="flex-1 overflow-y-auto py-5 custom-scrollbar">
            {loading ? (
              <div className="h-full flex items-center justify-center">
                <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
              </div>
            ) : boardData.ready.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
                <Sparkles className="w-10 h-10 stroke-1" />
                <p className="text-sm font-medium">All ready orders collected</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                {boardData.ready.map((orderNumber) => (
                  <div
                    key={orderNumber}
                    className="bg-gradient-to-b from-emerald-950/70 to-slate-950 border-2 border-emerald-400 rounded-2xl p-4 sm:p-5 flex flex-col items-center justify-center shadow-xl shadow-emerald-950/50 animate-pulse transition-transform hover:scale-105"
                  >
                    <span className="text-xs uppercase tracking-wider text-emerald-300 font-extrabold mb-1">
                      Ready
                    </span>
                    <span className="font-mono font-black text-3xl sm:text-4xl text-emerald-300 tracking-tight">
                      {orderNumber}
                    </span>
                    <span className="mt-2 text-[10px] text-emerald-200 font-bold px-2 py-0.5 rounded bg-emerald-500/20">
                      Collect at Counter
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom Footer Bar with Embedded QR Code Widget */}
      <footer className="bg-slate-900 border-t border-slate-800 px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-inner">
        <div className="flex items-center space-x-3">
          {/* Universal QR Code */}
          <div className="p-1 bg-white rounded-lg shadow-md flex-shrink-0">
            {qrCodeDataUrl ? (
              <img src={qrCodeDataUrl} alt="Scan QR Code" className="w-12 h-12 object-contain" />
            ) : (
              <div className="w-12 h-12 bg-slate-200 flex items-center justify-center">
                <QrCode className="w-6 h-6 text-slate-600" />
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center space-x-1.5 text-xs font-bold text-white">
              <Smartphone className="w-3.5 h-3.5 text-orange-400" />
              <span>Track Live On Your Smartphone</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Scan this QR code with your phone camera or visit <span className="font-mono text-orange-400 font-semibold">{trackUrl}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 text-xs text-slate-500">
          <Link to="/track" className="hover:text-orange-400 transition-colors font-semibold">
            Track Order Lookup
          </Link>
          <span>•</span>
          <Link to="/login" className="hover:text-slate-400 transition-colors">
            Staff Portal
          </Link>
        </div>
      </footer>
    </div>
  );
};
