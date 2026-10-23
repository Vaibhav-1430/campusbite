import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  OrderDto,
  OrderStatus,
  calculateOrderTimer,
  OrderTimerState
} from '@campusbite/shared';
import { apiRequest, ApiError } from '../../services/api.js';
import { Navbar } from '../../components/common/Navbar.js';
import { Modal } from '../../components/common/Modal.js';
import { useAuth } from '../../context/AuthContext.js';
import {
  unlockAudio,
  getAudioState,
  playNewOrderAlert,
  showBrowserNotification,
  AudioState
} from '../../utils/sound.js';
import { io, Socket } from 'socket.io-client';
import {
  ChefHat,
  Flame,
  CheckCircle2,
  Volume2,
  VolumeX,
  Plus,
  AlertCircle,
  RefreshCw,
  User,
  Check,
  Bell,
  X,
  Timer
} from 'lucide-react';

export const KitchenKDSPage: React.FC = () => {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [audioState, setAudioState] = useState<AudioState>('locked');
  const [activeTab, setActiveTab] = useState<'all' | 'placed' | 'preparing' | 'prepared'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // New Order Banner Alert
  const [activeAlert, setActiveAlert] = useState<{
    dailyOrderNumber: string;
    itemCount: number;
    audioPlayed: boolean;
  } | null>(null);

  // Time Adjustment Modal State
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedOrderForAdjust, setSelectedOrderForAdjust] = useState<OrderDto | null>(null);
  const [customMinutes, setCustomMinutes] = useState(5);
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Track already alerted order IDs to prevent replay on reconnects
  const [alertedOrderIds] = useState<Set<string>>(() => new Set());

  // Check initial audio state
  useEffect(() => {
    setAudioState(getAudioState());
  }, []);

  // Timer tick every second for authoritative timer calculation
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch active kitchen orders
  const fetchOrders = useCallback(async () => {
    try {
      const data = await apiRequest<{ orders: OrderDto[] }>(
        `/orders?status=${OrderStatus.PLACED},${OrderStatus.PREPARING},${OrderStatus.PREPARED}&direction=asc`
      );
      setOrders(data.orders);
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to load kitchen tickets.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Window focus listener to resync state if tab was backgrounded/device slept
  useEffect(() => {
    const handleFocus = () => {
      fetchOrders();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [fetchOrders]);

  // Socket.IO Real-Time Event Listener
  useEffect(() => {
    const socket: Socket = io({
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    socket.on('connect', () => {
      fetchOrders();
    });

    // New order placed at counter
    socket.on('ORDER_CREATED', (data: { orderId: string; dailyOrderNumber: string; items: any[] }) => {
      fetchOrders();

      if (!alertedOrderIds.has(data.orderId)) {
        alertedOrderIds.add(data.orderId);
        const played = playNewOrderAlert();
        showBrowserNotification(data.dailyOrderNumber, data.items.length);

        setActiveAlert({
          dailyOrderNumber: data.dailyOrderNumber,
          itemCount: data.items.length,
          audioPlayed: played
        });
      }
    });

    // Claimed event
    socket.on('ORDER_CLAIMED', (data: { orderId: string; assignedToId: string; assignedToName: string }) => {
      setOrders((prev) =>
        prev.map((ord) =>
          ord.id === data.orderId
            ? { ...ord, assignedToId: data.assignedToId, assignedToName: data.assignedToName }
            : ord
        )
      );
    });

    // Assigned event
    socket.on('ORDER_ASSIGNED', (data: { orderId: string; assignedToId: string; assignedToName: string }) => {
      setOrders((prev) =>
        prev.map((ord) =>
          ord.id === data.orderId
            ? { ...ord, assignedToId: data.assignedToId, assignedToName: data.assignedToName }
            : ord
        )
      );
    });

    // Preparing event
    socket.on('ORDER_PREPARING', (data: any) => {
      setOrders((prev) =>
        prev.map((ord) =>
          ord.id === data.orderId
            ? {
                ...ord,
                status: OrderStatus.PREPARING,
                preparationStartedAt: data.preparationStartedAt,
                estimatedCompletionAt: data.estimatedCompletionAt,
                assignedToId: data.assignedToId || ord.assignedToId,
                assignedToName: data.assignedToName || ord.assignedToName
              }
            : ord
        )
      );
    });

    // Time adjusted event
    socket.on('ORDER_TIME_ADJUSTED', (data: any) => {
      setOrders((prev) =>
        prev.map((ord) =>
          ord.id === data.orderId
            ? { ...ord, estimatedCompletionAt: data.newEstimatedCompletionAt }
            : ord
        )
      );
    });

    // Prepared event
    socket.on('ORDER_PREPARED', (data: any) => {
      setOrders((prev) =>
        prev.map((ord) =>
          ord.id === data.orderId
            ? { ...ord, status: OrderStatus.PREPARED, preparedAt: data.preparedAt }
            : ord
        )
      );
    });

    // Completed or Cancelled: Remove from kitchen queues
    socket.on('ORDER_COMPLETED', (data: { orderId: string }) => {
      setOrders((prev) => prev.filter((ord) => ord.id !== data.orderId));
    });

    socket.on('ORDER_CANCELLED', (data: { orderId: string; reason: string }) => {
      setOrders((prev) => prev.filter((ord) => ord.id !== data.orderId));
    });

    return () => {
      socket.disconnect();
    };
  }, [fetchOrders, alertedOrderIds]);

  // Audio unlock action handler
  const handleUnlockAudio = async () => {
    const success = await unlockAudio();
    if (success) {
      setAudioState('unlocked');
      setSuccessMessage('Kitchen sound alerts are now enabled!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } else {
      setErrorMessage('Could not activate audio. Please check device sound settings.');
    }
  };

  // Claim Order Action
  const handleClaimOrder = async (orderId: string) => {
    try {
      const data = await apiRequest<{ order: OrderDto }>(`/orders/${orderId}/claim`, {
        method: 'PATCH'
      });
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to claim order.');
    }
  };

  // Start Preparation Action
  const handleStartPrep = async (orderId: string) => {
    try {
      const data = await apiRequest<{ order: OrderDto }>(`/orders/${orderId}/start-prep`, {
        method: 'PATCH'
      });
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to start preparation.');
    }
  };

  // Quick Adjustment (+1, +3, +5 min)
  const handleQuickAdjust = async (orderId: string, minutes: number) => {
    try {
      const data = await apiRequest<{ order: OrderDto }>(`/orders/${orderId}/adjust-time`, {
        method: 'PATCH',
        body: JSON.stringify({ minutesAdded: minutes, reason: `Quick +${minutes}m addition` })
      });
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to add preparation time.');
    }
  };

  // Custom Adjustment Submit
  const handleCustomAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderForAdjust) return;
    setAdjustSubmitting(true);
    setAdjustError(null);

    try {
      const data = await apiRequest<{ order: OrderDto }>(
        `/orders/${selectedOrderForAdjust.id}/adjust-time`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            minutesAdded: customMinutes,
            reason: adjustReason.trim() || undefined
          })
        }
      );
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
      setIsAdjustModalOpen(false);
      setSelectedOrderForAdjust(null);
      setAdjustReason('');
    } catch (err) {
      if (err instanceof ApiError) setAdjustError(err.message);
      else setAdjustError('Failed to adjust preparation time.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  // Mark Prepared Action
  const handleMarkPrepared = async (orderId: string) => {
    try {
      const data = await apiRequest<{ order: OrderDto }>(`/orders/${orderId}/prepared`, {
        method: 'PATCH'
      });
      setOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to mark order prepared.');
    }
  };

  // Grouped Queues
  const placedOrders = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PLACED),
    [orders]
  );
  const preparingOrders = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PREPARING),
    [orders]
  );
  const preparedOrders = useMemo(
    () => orders.filter((o) => o.status === OrderStatus.PREPARED),
    [orders]
  );

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar />

      {/* Real-time Notification Banner */}
      {activeAlert && (
        <div className="bg-amber-500 text-white px-4 py-3 shadow-md transition-all duration-300">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
              </span>
              <Bell className="w-5 h-5 text-white animate-bounce" />
              <span className="font-bold text-sm sm:text-base tracking-wide">
                New Order Ticket #{activeAlert.dailyOrderNumber} Received ({activeAlert.itemCount} items)
              </span>
              {!activeAlert.audioPlayed && audioState === 'locked' && (
                <span className="hidden sm:inline-block text-xs bg-amber-600 px-2 py-0.5 rounded-full font-semibold">
                  (Audio muted - click 'Enable Sound' below)
                </span>
              )}
            </div>
            <button
              onClick={() => setActiveAlert(null)}
              className="p-1.5 rounded-lg hover:bg-amber-600 transition-colors text-white"
              title="Dismiss Alert"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Global Alerts */}
      {errorMessage && (
        <div className="max-w-7xl mx-auto px-4 mt-4 w-full">
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-500" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-xs font-semibold hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {successMessage && (
        <div className="max-w-7xl mx-auto px-4 mt-4 w-full">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-xs font-semibold hover:underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Header Controls Bar */}
      <div className="bg-white border-b border-slate-200 shadow-sm sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            {/* Title & Queue Metrics */}
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm">
                <ChefHat className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="font-bold text-lg text-slate-900 tracking-tight">Kitchen Display (KDS)</h1>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    {orders.length} Active
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  Live FIFO order preparation stream with synchronized server timers
                </p>
              </div>
            </div>

            {/* Action Buttons: Sound Unlock & Refresh */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              {audioState === 'unlocked' ? (
                <button
                  onClick={() => playNewOrderAlert()}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                  title="Click to test kitchen sound alert"
                >
                  <Volume2 className="w-4 h-4 mr-1.5 text-emerald-600" />
                  <span>Sound Active (Test)</span>
                </button>
              ) : audioState === 'locked' ? (
                <button
                  onClick={handleUnlockAudio}
                  className="inline-flex items-center px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-sm transition-all animate-pulse"
                >
                  <VolumeX className="w-4 h-4 mr-1.5" />
                  <span>Enable Kitchen Alerts</span>
                </button>
              ) : (
                <span className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs text-slate-400 bg-slate-100">
                  <VolumeX className="w-4 h-4 mr-1" />
                  <span>Audio Unavailable</span>
                </span>
              )}

              <button
                onClick={fetchOrders}
                className="inline-flex items-center p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                title="Refresh order queue"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mobile Filter Tabs */}
          <div className="flex sm:hidden border-t border-slate-100 mt-3 pt-2 space-x-1 overflow-x-auto">
            <button
              onClick={() => setActiveTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              All ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('placed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'placed' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              New ({placedOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('preparing')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'preparing' ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Cooking ({preparingOrders.length})
            </button>
            <button
              onClick={() => setActiveTab('prepared')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap ${
                activeTab === 'prepared' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Ready ({preparedOrders.length})
            </button>
          </div>
        </div>
      </div>

      {/* Main KDS Workspace Columns */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mb-3 text-orange-500" />
            <p className="text-sm font-medium">Connecting to kitchen display feed...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto shadow-sm my-12">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">All Clear! No Active Tickets</h2>
            <p className="text-slate-500 text-sm mt-1">
              No orders are waiting in the kitchen queue. New counter orders will arrive and alert automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* COLUMN 1: NEW / AWAITING PREP */}
            <div
              className={`flex flex-col space-y-4 ${
                activeTab !== 'all' && activeTab !== 'placed' ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b-2 border-amber-400">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                  <h2 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                    New / Awaiting Prep
                  </h2>
                </div>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                  {placedOrders.length}
                </span>
              </div>

              {placedOrders.length === 0 ? (
                <div className="p-8 bg-white/60 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No orders awaiting start
                </div>
              ) : (
                placedOrders.map((order) => {
                  const timer = calculateOrderTimer(order, now);
                  const isClaimedByMe = order.assignedToId === user?.id;

                  return (
                    <div
                      key={order.id}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow relative overflow-hidden"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-xl text-slate-900 tracking-tight">
                              #{order.dailyOrderNumber}
                            </span>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                              {timer.formattedRemaining}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Placed {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        {/* Assignment Badge */}
                        {order.assignedToName ? (
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center space-x-1 ${
                              isClaimedByMe
                                ? 'bg-orange-100 text-orange-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            <User className="w-3 h-3 mr-0.5" />
                            <span>{isClaimedByMe ? 'You' : order.assignedToName}</span>
                          </span>
                        ) : (
                          <button
                            onClick={() => handleClaimOrder(order.id)}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                          >
                            Claim
                          </button>
                        )}
                      </div>

                      {/* Items List */}
                      <div className="divide-y divide-slate-100 py-1">
                        {order.items.map((item) => (
                          <div key={item.id} className="py-2 text-sm">
                            <div className="flex items-start justify-between font-bold text-slate-800">
                              <span className="flex-1">{item.nameSnapshot}</span>
                              <span className="ml-2 px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-extrabold text-xs">
                                ×{item.quantity}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="mt-1 text-xs font-medium text-amber-700 bg-amber-50/70 p-1.5 rounded border border-amber-200/50">
                                Note: {item.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Action Button: Start Cooking */}
                      <button
                        onClick={() => handleStartPrep(order.id)}
                        className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg font-bold text-sm text-white bg-amber-500 hover:bg-amber-600 shadow-sm transition-colors active:scale-[0.99]"
                      >
                        <Flame className="w-4 h-4 mr-1.5" />
                        Start Preparation
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* COLUMN 2: IN PREPARATION (COOKING) */}
            <div
              className={`flex flex-col space-y-4 ${
                activeTab !== 'all' && activeTab !== 'preparing' ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b-2 border-orange-500">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"></span>
                  <h2 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                    In Preparation
                  </h2>
                </div>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                  {preparingOrders.length}
                </span>
              </div>

              {preparingOrders.length === 0 ? (
                <div className="p-8 bg-white/60 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No orders currently cooking
                </div>
              ) : (
                preparingOrders.map((order) => {
                  const timer: OrderTimerState = calculateOrderTimer(order, now);

                  return (
                    <div
                      key={order.id}
                      className={`bg-white rounded-xl border p-4 space-y-3 shadow-sm hover:shadow-md transition-all relative overflow-hidden ${
                        timer.isOverdue
                          ? 'border-rose-400 bg-rose-50/20'
                          : timer.progressPercentage >= 80
                          ? 'border-amber-300'
                          : 'border-slate-200'
                      }`}
                    >
                      {/* Ticket Header & Live Timer */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-black text-xl text-slate-900 tracking-tight">
                              #{order.dailyOrderNumber}
                            </span>
                            {/* Live Remaining Time Badge */}
                            <span
                              className={`text-xs font-black px-2.5 py-0.5 rounded-full flex items-center space-x-1 ${
                                timer.isOverdue
                                  ? 'bg-rose-100 text-rose-700 animate-pulse border border-rose-300'
                                  : timer.progressPercentage >= 80
                                  ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              }`}
                            >
                              <Timer className="w-3 h-3 mr-1" />
                              <span>{timer.formattedRemaining}</span>
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-2">
                            <span>Elapsed: {timer.formattedElapsed}</span>
                            <span>•</span>
                            <span>Cook: {order.assignedToName || 'Kitchen Staff'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full transition-all duration-1000 ${
                            timer.isOverdue
                              ? 'bg-rose-600'
                              : timer.progressPercentage >= 80
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                          }`}
                          style={{ width: `${timer.progressPercentage}%` }}
                        />
                      </div>

                      {/* Items List */}
                      <div className="divide-y divide-slate-100 py-1">
                        {order.items.map((item) => (
                          <div key={item.id} className="py-2 text-sm">
                            <div className="flex items-start justify-between font-bold text-slate-800">
                              <span className="flex-1">{item.nameSnapshot}</span>
                              <span className="ml-2 px-2 py-0.5 rounded bg-orange-50 text-orange-800 font-extrabold text-xs">
                                ×{item.quantity}
                              </span>
                            </div>
                            {item.notes && (
                              <p className="mt-1 text-xs font-medium text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200">
                                Note: {item.notes}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Adjust Time Quick Row */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-500">Add Time:</span>
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => handleQuickAdjust(order.id, 1)}
                            className="px-2 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Add 1 minute"
                          >
                            +1m
                          </button>
                          <button
                            onClick={() => handleQuickAdjust(order.id, 3)}
                            className="px-2 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Add 3 minutes"
                          >
                            +3m
                          </button>
                          <button
                            onClick={() => handleQuickAdjust(order.id, 5)}
                            className="px-2 py-1 text-xs font-bold rounded bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                            title="Add 5 minutes"
                          >
                            +5m
                          </button>
                          <button
                            onClick={() => {
                              setSelectedOrderForAdjust(order);
                              setCustomMinutes(5);
                              setAdjustReason('');
                              setAdjustError(null);
                              setIsAdjustModalOpen(true);
                            }}
                            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
                            title="Custom time adjustment"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Action Button: Mark Prepared */}
                      <button
                        onClick={() => handleMarkPrepared(order.id)}
                        className="w-full flex items-center justify-center py-2.5 px-4 rounded-lg font-bold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors active:scale-[0.99]"
                      >
                        <Check className="w-4 h-4 mr-1.5" />
                        Mark Prepared & Ready
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* COLUMN 3: PREPARED / READY FOR COUNTER */}
            <div
              className={`flex flex-col space-y-4 ${
                activeTab !== 'all' && activeTab !== 'prepared' ? 'hidden sm:flex' : 'flex'
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b-2 border-emerald-500">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <h2 className="font-bold text-slate-800 uppercase tracking-wider text-xs">
                    Prepared / Ready
                  </h2>
                </div>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  {preparedOrders.length}
                </span>
              </div>

              {preparedOrders.length === 0 ? (
                <div className="p-8 bg-white/60 border border-dashed border-slate-200 rounded-xl text-center text-xs text-slate-400">
                  No orders waiting for pickup
                </div>
              ) : (
                preparedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-emerald-200 shadow-sm p-4 space-y-3 relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-black text-xl text-slate-900 tracking-tight">
                            #{order.dailyOrderNumber}
                          </span>
                          <span className="text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Ready for Pickup
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Prepared at{' '}
                          {order.preparedAt
                            ? new Date(order.preparedAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                              })
                            : 'Just now'}
                        </p>
                      </div>
                    </div>

                    {/* Items List */}
                    <div className="divide-y divide-slate-100 py-1">
                      {order.items.map((item) => (
                        <div key={item.id} className="py-1.5 text-sm flex items-center justify-between">
                          <span className="text-slate-700">{item.nameSnapshot}</span>
                          <span className="font-bold text-slate-900">×{item.quantity}</span>
                        </div>
                      ))}
                    </div>

                    <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200/60 text-center">
                      <p className="text-xs font-bold text-emerald-800">
                        Awaiting counter staff handover to customer
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* Custom Time Adjustment Modal */}
      {isAdjustModalOpen && selectedOrderForAdjust && (
        <Modal
          isOpen={isAdjustModalOpen}
          onClose={() => {
            setIsAdjustModalOpen(false);
            setSelectedOrderForAdjust(null);
          }}
          title={`Adjust Prep Time: Ticket #${selectedOrderForAdjust.dailyOrderNumber}`}
        >
          <form onSubmit={handleCustomAdjustSubmit} className="space-y-4">
            {adjustError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{adjustError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Additional Minutes to Add
              </label>
              <input
                type="number"
                min={1}
                max={120}
                required
                value={customMinutes}
                onChange={(e) => setCustomMinutes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Authoritatively extends estimated completion on server and recalculates countdown timer.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                Reason / Note (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Deep fry station backlog, customized batter"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                maxLength={255}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:outline-none"
              />
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2">
              <button
                type="button"
                onClick={() => {
                  setIsAdjustModalOpen(false);
                  setSelectedOrderForAdjust(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={adjustSubmitting}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors disabled:opacity-50"
              >
                {adjustSubmitting ? 'Saving...' : 'Apply Adjustment'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
