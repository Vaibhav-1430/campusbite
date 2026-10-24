import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import {
  OrderStatus,
  TrackingOrderDto,
  calculateOrderTimer,
  OrderTimerState
} from '@campusbite/shared';
import { apiRequest } from '../../services/api.js';
import {
  playOrderReadyAlert,
  unlockAudio,
  showCustomerReadyNotification
} from '../../utils/sound.js';
import {
  Utensils,
  Clock,
  Flame,
  CheckCircle2,
  Sparkles,
  AlertTriangle,
  Bell,
  Volume2,
  VolumeX,
  Search,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Monitor
} from 'lucide-react';

const SESSION_KEY = 'campusbite_tracking_session';

interface TrackingSession {
  orderId: string;
  dailyOrderNumber: string;
  trackingToken: string;
}

export const CustomerTrackingPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber?: string }>();
  const navigate = useNavigate();

  // Lookup Form State
  const [dailyOrderNumberInput, setDailyOrderNumberInput] = useState<string>(orderNumber ? orderNumber.toUpperCase() : '');
  const [pinInput, setPinInput] = useState<string>('');
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Active Verified Order State
  const [order, setOrder] = useState<TrackingOrderDto | null>(null);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);
  const [timerState, setTimerState] = useState<OrderTimerState | null>(null);

  // Connectivity & Preferences
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [notificationsGranted, setNotificationsGranted] = useState<boolean>(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );
  const [initialLoading, setInitialLoading] = useState<boolean>(true);

  const socketRef = useRef<Socket | null>(null);
  const prevStatusRef = useRef<OrderStatus | null>(null);

  // 1. Authoritative Timer Update (ticking every 1s)
  useEffect(() => {
    if (!order) {
      setTimerState(null);
      return;
    }

    const updateTimer = () => {
      setTimerState(calculateOrderTimer(order, Date.now()));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [order]);

  // 2. Fetch authoritative order status from API with Bearer token
  const fetchAuthoritativeStatus = useCallback(async (token: string): Promise<TrackingOrderDto | null> => {
    try {
      const res = await apiRequest<{ order: TrackingOrderDto }>('/tracking/status', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      return res.order;
    } catch {
      return null;
    }
  }, []);

  // 3. Restore session on mount (survives refresh / device sleep)
  useEffect(() => {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      setInitialLoading(false);
      return;
    }

    try {
      const session: TrackingSession = JSON.parse(raw);
      if (session.trackingToken) {
        setTrackingToken(session.trackingToken);
        setDailyOrderNumberInput(session.dailyOrderNumber);

        fetchAuthoritativeStatus(session.trackingToken).then((fetchedOrder) => {
          if (fetchedOrder) {
            setOrder(fetchedOrder);
            prevStatusRef.current = fetchedOrder.status;
          } else {
            // Token expired or invalid
            sessionStorage.removeItem(SESSION_KEY);
            setTrackingToken(null);
          }
          setInitialLoading(false);
        });
        return;
      }
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }

    setInitialLoading(false);
  }, [fetchAuthoritativeStatus]);

  // Sync route param with input if user navigates with a URL parameter like /track/CB-101
  useEffect(() => {
    if (orderNumber && !order) {
      setDailyOrderNumberInput(orderNumber.toUpperCase());
    }
  }, [orderNumber, order]);

  // 4. Handle Order Verification (Form Submission)
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLookupError(null);

    const cleanOrderNumber = dailyOrderNumberInput.trim().toUpperCase();
    const cleanPin = pinInput.trim();

    if (!cleanOrderNumber) {
      setLookupError('Please enter your daily order number (e.g., CB-101).');
      return;
    }

    if (!cleanPin || cleanPin.length !== 4) {
      setLookupError('Please enter the 4-digit verification PIN found on your receipt.');
      return;
    }

    setLookupLoading(true);

    try {
      const data = await apiRequest<{ trackingToken: string; order: TrackingOrderDto }>('/tracking/verify', {
        method: 'POST',
        body: JSON.stringify({
          dailyOrderNumber: cleanOrderNumber,
          pin: cleanPin
        })
      });

      setOrder(data.order);
      setTrackingToken(data.trackingToken);
      prevStatusRef.current = data.order.status;

      // Store in sessionStorage for seamless refresh/reconnection survival
      const session: TrackingSession = {
        orderId: data.order.id,
        dailyOrderNumber: data.order.dailyOrderNumber,
        trackingToken: data.trackingToken
      };
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));

      // Attempt to unlock audio with user touch interaction
      if (soundEnabled) {
        unlockAudio().catch(() => {});
      }
    } catch (err: any) {
      if (err.statusCode === 429) {
        setLookupError('Too many verification attempts. Please wait a minute before trying again.');
      } else {
        setLookupError(err.message || 'Invalid Order Number or PIN combination.');
      }
    } finally {
      setLookupLoading(false);
    }
  };

  // 5. Clear tracking session & track another order
  const handleClearSession = () => {
    sessionStorage.removeItem(SESSION_KEY);
    setOrder(null);
    setTrackingToken(null);
    setPinInput('');
    setLookupError(null);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    navigate('/track');
  };

  // 6. Sound & Notification Trigger on Status Transition to PREPARED
  const checkStatusTransition = useCallback((newStatus: OrderStatus, orderNum: string) => {
    if (prevStatusRef.current !== OrderStatus.PREPARED && newStatus === OrderStatus.PREPARED) {
      if (soundEnabled) {
        playOrderReadyAlert();
      }
      showCustomerReadyNotification(orderNum);
    }
    prevStatusRef.current = newStatus;
  }, [soundEnabled]);

  // 7. Socket.IO Connection & Room Subscription
  useEffect(() => {
    if (!order || !trackingToken) return;

    const socketUrl = import.meta.env.VITE_SOCKET_URL || window.location.origin;
    const socket: Socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      // Join order room with signed tracking token
      socket.emit('subscribe:order', {
        trackingToken,
        orderId: order.id
      });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('reconnect', () => {
      setIsConnected(true);
      // Authoritatively sync state from database upon reconnect
      fetchAuthoritativeStatus(trackingToken).then((fresh) => {
        if (fresh) {
          setOrder(fresh);
          checkStatusTransition(fresh.status, fresh.dailyOrderNumber);
        }
      });
      socket.emit('subscribe:order', {
        trackingToken,
        orderId: order.id
      });
    });

    // Real-Time Event Handlers
    socket.on('ORDER_PREPARING', (data: {
      orderId: string;
      preparationStartedAt: string;
      estimatedCompletionAt: string;
    }) => {
      if (data.orderId === order.id) {
        setOrder((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: OrderStatus.PREPARING,
            preparationStartedAt: data.preparationStartedAt,
            estimatedCompletionAt: data.estimatedCompletionAt
          };
        });
      }
    });

    socket.on('ORDER_TIME_ADJUSTED', (data: {
      orderId: string;
      minutesAdded: number;
      newEstimatedCompletionAt: string;
      reason?: string | null;
    }) => {
      if (data.orderId === order.id) {
        setOrder((prev) => {
          if (!prev) return null;
          const newAdjustments = [
            ...(prev.prepAdjustments || []),
            {
              minutesAdded: data.minutesAdded,
              reason: data.reason || null,
              createdAt: new Date().toISOString()
            }
          ];
          return {
            ...prev,
            estimatedCompletionAt: data.newEstimatedCompletionAt,
            prepAdjustments: newAdjustments
          };
        });
      }
    });

    socket.on('ORDER_PREPARED', (data: { orderId: string; preparedAt: string }) => {
      if (data.orderId === order.id) {
        setOrder((prev) => {
          if (!prev) return null;
          const updated = {
            ...prev,
            status: OrderStatus.PREPARED,
            preparedAt: data.preparedAt
          };
          checkStatusTransition(OrderStatus.PREPARED, prev.dailyOrderNumber);
          return updated;
        });
      }
    });

    socket.on('ORDER_COMPLETED', (data: { orderId: string; completedAt: string }) => {
      if (data.orderId === order.id) {
        setOrder((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: OrderStatus.COMPLETED,
            completedAt: data.completedAt
          };
        });
      }
    });

    socket.on('ORDER_CANCELLED', (data: { orderId: string; reason?: string }) => {
      if (data.orderId === order.id) {
        setOrder((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            status: OrderStatus.CANCELLED,
            cancellationReason: data.reason
          };
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [order?.id, trackingToken, fetchAuthoritativeStatus, checkStatusTransition]);

  // 8. Resynchronize on page visibility change (survives phone screen sleep)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingToken) {
        fetchAuthoritativeStatus(trackingToken).then((fresh) => {
          if (fresh) {
            setOrder(fresh);
            checkStatusTransition(fresh.status, fresh.dailyOrderNumber);
          }
        });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [trackingToken, fetchAuthoritativeStatus, checkStatusTransition]);

  // Request browser notification permission explicitly
  const handleEnableNotifications = async () => {
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          setNotificationsGranted(true);
        }
      } catch {
        // ignore
      }
    }
  };

  const handleToggleSound = async () => {
    if (!soundEnabled) {
      await unlockAudio();
      setSoundEnabled(true);
    } else {
      setSoundEnabled(false);
    }
  };

  // Loading skeleton during session check
  if (initialLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-slate-400 text-sm font-medium">Checking order status...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-orange-500 selection:text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 py-3 sm:px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-sm">
              <Utensils className="w-4 h-4" />
            </div>
            <div>
              <span className="font-black text-base tracking-tight text-white">Cafe47</span>
              <span className="hidden sm:inline-block text-xs text-orange-400 ml-2 font-medium">Order Tracker</span>
            </div>
          </Link>

          <div className="flex items-center space-x-2">
            {order && (
              <>
                {/* Live connection dot */}
                <div
                  className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    isConnected
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}
                  title={isConnected ? 'Live Socket Connected' : 'Reconnecting...'}
                >
                  <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                  <span className="hidden xs:inline">{isConnected ? 'Live' : 'Reconnecting'}</span>
                </div>

                {/* Sound Toggle */}
                <button
                  type="button"
                  onClick={handleToggleSound}
                  className={`p-2 rounded-lg border text-xs transition-colors ${
                    soundEnabled
                      ? 'bg-slate-800 border-slate-700 text-orange-400 hover:bg-slate-700'
                      : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'
                  }`}
                  title={soundEnabled ? 'Alert Chime Enabled' : 'Muted'}
                  aria-label="Toggle Alert Sound"
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
              </>
            )}

            {/* Display Board Link */}
            <Link
              to="/board"
              className="p-2 rounded-lg border border-slate-800 bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Cafe47 Live Order Board"
              aria-label="Open Public Display Board"
            >
              <Monitor className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-2xl w-full mx-auto p-4 sm:p-6 flex flex-col justify-start">
        {!order ? (
          /* ========================================================= */
          /* 1. ORDER LOOKUP FORM                                      */
          /* ========================================================= */
          <div className="my-auto py-8">
            <div className="text-center mb-8">
              <div className="inline-flex p-3 rounded-2xl bg-orange-500/10 text-orange-400 border border-orange-500/20 mb-3 shadow-inner">
                <Search className="w-7 h-7" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Track Your Order
              </h1>
              <p className="mt-2 text-sm text-slate-400 max-w-sm mx-auto">
                Enter the daily order number and 4-digit PIN printed on your receipt or counter token.
              </p>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 sm:p-7 shadow-xl backdrop-blur">
              <form onSubmit={handleVerify} className="space-y-5">
                {lookupError && (
                  <div
                    className="p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs sm:text-sm flex items-start space-x-2.5"
                    role="alert"
                  >
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 text-rose-400" />
                    <span>{lookupError}</span>
                  </div>
                )}

                <div>
                  <label htmlFor="orderNumber" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Order Number
                  </label>
                  <input
                    id="orderNumber"
                    type="text"
                    required
                    placeholder="e.g. CB-101"
                    value={dailyOrderNumberInput}
                    onChange={(e) => setDailyOrderNumberInput(e.target.value.toUpperCase())}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl px-4 py-3 text-white font-mono text-base placeholder-slate-600 transition-colors uppercase outline-none"
                    autoComplete="off"
                    autoFocus={!orderNumber}
                  />
                  <p className="mt-1 text-xs text-slate-500">Found on the top of your counter receipt</p>
                </div>

                <div>
                  <label htmlFor="pin" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    4-Digit Verification PIN
                  </label>
                  <input
                    id="pin"
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={4}
                    required
                    placeholder="••••"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-950 border border-slate-700 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl px-4 py-3 text-white font-mono text-center tracking-[0.5em] text-xl placeholder-slate-600 transition-colors outline-none"
                    autoComplete="off"
                  />
                  <p className="mt-1 text-xs text-slate-500">4 numbers printed beside your order code</p>
                </div>

                <button
                  type="submit"
                  disabled={lookupLoading}
                  className="w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-sm font-bold bg-orange-600 text-white hover:bg-orange-500 active:bg-orange-700 disabled:opacity-50 transition-colors shadow-lg shadow-orange-950/50 min-h-[48px]"
                >
                  {lookupLoading ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Track Order</span>
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-2">
                <span>Looking for live order board?</span>
                <Link to="/board" className="text-orange-400 hover:text-orange-300 font-semibold flex items-center">
                  <span>View Public TV Board</span>
                  <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================= */
          /* 2. ACTIVE LIVE ORDER TRACKING VIEW                        */
          /* ========================================================= */
          <div className="space-y-4 py-2">
            {/* Top Order Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">Order Token</span>
                  <h1 className="text-3xl sm:text-4xl font-black text-white font-mono tracking-tight">
                    {order.dailyOrderNumber}
                  </h1>
                </div>

                <div className="flex flex-col items-end space-y-1">
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide border bg-orange-500/10 text-orange-400 border-orange-500/20">
                    Live Order
                  </span>
                  <span className="text-xs text-slate-400">
                    Placed at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>

              {/* Progress Stepper */}
              <div className="mt-6 pt-5 border-t border-slate-800">
                <div className="grid grid-cols-4 gap-1 sm:gap-2 relative">
                  {/* Step 1: Placed */}
                  <div className="flex flex-col items-center text-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        order.status === OrderStatus.PLACED ||
                        order.status === OrderStatus.PREPARING ||
                        order.status === OrderStatus.PREPARED ||
                        order.status === OrderStatus.COMPLETED
                          ? 'bg-orange-600 text-white shadow-md shadow-orange-900/40 ring-2 ring-orange-500/30'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="mt-1.5 text-[10px] sm:text-xs font-semibold text-slate-300">Placed</span>
                  </div>

                  {/* Step 2: Preparing */}
                  <div className="flex flex-col items-center text-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        order.status === OrderStatus.PREPARING
                          ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/60 ring-4 ring-amber-500/30 animate-pulse'
                          : order.status === OrderStatus.PREPARED || order.status === OrderStatus.COMPLETED
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      <Flame className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="mt-1.5 text-[10px] sm:text-xs font-semibold text-slate-300">Cooking</span>
                  </div>

                  {/* Step 3: Ready */}
                  <div className="flex flex-col items-center text-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        order.status === OrderStatus.PREPARED
                          ? 'bg-emerald-500 text-slate-950 shadow-xl shadow-emerald-950/60 ring-4 ring-emerald-500/40 animate-bounce'
                          : order.status === OrderStatus.COMPLETED
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      <Sparkles className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="mt-1.5 text-[10px] sm:text-xs font-semibold text-slate-300">Ready</span>
                  </div>

                  {/* Step 4: Completed */}
                  <div className="flex flex-col items-center text-center">
                    <div
                      className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                        order.status === OrderStatus.COMPLETED
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                          : 'bg-slate-800 text-slate-500'
                      }`}
                    >
                      <Utensils className="w-4 h-4 sm:w-5 sm:h-5" />
                    </div>
                    <span className="mt-1.5 text-[10px] sm:text-xs font-semibold text-slate-300">Done</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Status Hero Card */}
            {order.status === OrderStatus.PLACED && (
              <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-5 sm:p-6 text-center shadow-lg">
                <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 mx-auto flex items-center justify-center mb-3">
                  <Clock className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white">Order Received & In Queue</h2>
                <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                  Our kitchen staff has received your order. Authoritative live countdown begins immediately when cooking starts!
                </p>

                <div className="mt-4 inline-flex items-center space-x-2 bg-slate-800/80 px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 border border-slate-700/60">
                  <Clock className="w-4 h-4 text-orange-400" />
                  <span>Initial Estimate: ~{order.initialEstimatedMinutes} mins</span>
                </div>
              </div>
            )}

            {order.status === OrderStatus.PREPARING && timerState && (
              <div className="bg-gradient-to-br from-amber-950/30 to-slate-900 border border-amber-500/30 rounded-2xl p-5 sm:p-6 text-center shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

                <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold mb-3">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Kitchen Cooking in Progress</span>
                </div>

                <div className="my-2">
                  <span className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-white">
                    {timerState.formattedRemaining}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-slate-800 rounded-full h-3 mt-4 mb-2 overflow-hidden p-0.5 border border-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      timerState.isOverdue
                        ? 'bg-rose-500 animate-pulse'
                        : 'bg-gradient-to-r from-amber-500 to-orange-500'
                    }`}
                    style={{ width: `${timerState.progressPercentage}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-xs text-slate-400 px-1 mt-1 font-mono">
                  <span>Elapsed: {timerState.formattedElapsed}</span>
                  <span>Est: {timerState.totalEstimatedMinutes} mins</span>
                </div>

                {timerState.adjustmentsMinutesTotal > 0 && (
                  <div className="mt-3 inline-flex items-center space-x-1.5 px-3 py-1 rounded-lg bg-amber-500/10 text-amber-300 text-xs font-medium border border-amber-500/20">
                    <Flame className="w-3.5 h-3.5 text-amber-400" />
                    <span>+{timerState.adjustmentsMinutesTotal} min kitchen adjustment applied in real time</span>
                  </div>
                )}
              </div>
            )}

            {order.status === OrderStatus.PREPARED && (
              <div className="bg-gradient-to-br from-emerald-950/60 via-slate-900 to-emerald-950/40 border-2 border-emerald-500/60 rounded-2xl p-6 sm:p-7 text-center shadow-2xl relative overflow-hidden animate-pulse">
                <div className="w-16 h-16 rounded-full bg-emerald-500 text-slate-950 mx-auto flex items-center justify-center mb-3 shadow-lg shadow-emerald-500/40">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-emerald-300 tracking-tight">
                  🎉 ORDER READY FOR PICKUP! 🎉
                </h2>
                <p className="mt-2 text-base text-slate-200 font-medium max-w-sm mx-auto">
                  Please proceed to the counter and show order{' '}
                  <span className="font-mono font-black text-emerald-400 underline">{order.dailyOrderNumber}</span> to collect your meal.
                </p>
                <div className="mt-4 inline-block bg-emerald-500/20 border border-emerald-500/40 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold text-emerald-200">
                  Hot & Fresh at the counter
                </div>
              </div>
            )}

            {order.status === OrderStatus.COMPLETED && (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 text-center shadow-lg">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 mx-auto flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-white">Order Completed</h2>
                <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                  Your order has been handed over at the counter. Thank you for dining with Cafe47! Enjoy your meal.
                </p>
                <button
                  onClick={handleClearSession}
                  className="mt-4 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors"
                >
                  Track Another Order
                </button>
              </div>
            )}

            {order.status === OrderStatus.CANCELLED && (
              <div className="bg-rose-950/30 border border-rose-500/30 rounded-2xl p-5 sm:p-6 text-center shadow-lg">
                <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto flex items-center justify-center mb-3">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-xl font-bold text-rose-300">Order Cancelled</h2>
                <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
                  {order.cancellationReason || 'This order was cancelled. Please inquire with counter staff for assistance.'}
                </p>
              </div>
            )}

            {/* Food Items Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Items in this Order ({order.items.length})
              </h2>

              <div className="divide-y divide-slate-800/80">
                {order.items.map((item, idx) => (
                  <div key={`${item.name}-${idx}`} className="py-2.5 flex items-start justify-between">
                    <div>
                      <span className="text-sm font-bold text-white">{item.name}</span>
                      {item.notes && (
                        <p className="text-xs text-amber-400/90 italic mt-0.5">Note: {item.notes}</p>
                      )}
                    </div>
                    <span className="font-mono text-xs font-bold px-2 py-1 bg-slate-800 rounded-md text-orange-400 ml-3">
                      ×{item.quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Notification & Actions Toolbar */}
            <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <div className="flex items-center space-x-2">
                {!notificationsGranted && 'Notification' in window && (
                  <button
                    onClick={handleEnableNotifications}
                    className="flex items-center px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition-colors"
                  >
                    <Bell className="w-3.5 h-3.5 mr-1.5 text-orange-400" />
                    <span>Enable Pickup Alert</span>
                  </button>
                )}
                {notificationsGranted && (
                  <span className="flex items-center text-emerald-400">
                    <Bell className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                    <span>Notifications Active</span>
                  </span>
                )}
              </div>

              <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
                <button
                  onClick={handleClearSession}
                  className="text-slate-400 hover:text-white font-medium transition-colors"
                >
                  Track Another Order
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 py-4 px-4 text-center text-xs text-slate-600">
        Cafe47 • Serving Authentic Himalayan Cuisine • Keep this page open for live updates
      </footer>
    </div>
  );
};
