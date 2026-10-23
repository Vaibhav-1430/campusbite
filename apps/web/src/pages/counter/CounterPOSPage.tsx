import React, { useEffect, useState, useMemo } from 'react';
import {
  CategoryDto,
  MenuItemDto,
  OrderDto,
  OrderStatus,
  formatPaise
} from '@campusbite/shared';
import { apiRequest, ApiError } from '../../services/api.js';
import { Navbar } from '../../components/common/Navbar.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Receipt,
  Check,
  History
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

interface CartItem {
  menuItem: MenuItemDto;
  quantity: number;
  notes: string;
}

export const CounterPOSPage: React.FC = () => {
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemDto[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Cart State
  const [cart, setCart] = useState<Map<string, CartItem>>(new Map());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Placed Order Success Modal
  const [placedOrderDetails, setPlacedOrderDetails] = useState<{
    dailyOrderNumber: string;
    customerVerificationPin: string;
    totalPaise: number;
  } | null>(null);

  // Active Orders Drawer State
  const [isActiveOrdersOpen, setIsActiveOrdersOpen] = useState(false);
  const [activeOrders, setActiveOrders] = useState<OrderDto[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderStatusFilter, setSelectedOrderStatusFilter] = useState<string>('all');

  // Cancel Order Modal State
  const [orderToCancel, setOrderToCancel] = useState<OrderDto | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Load Categories & Menu Items
  const loadMenuData = async () => {
    try {
      setLoading(true);
      const [catsRes, itemsRes] = await Promise.all([
        apiRequest<{ categories: CategoryDto[] }>('/categories'),
        apiRequest<{ items: MenuItemDto[] }>('/menu')
      ]);
      setCategories(catsRes.categories);
      setMenuItems(itemsRes.items);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load menu data.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Load Active Orders
  const loadActiveOrders = async () => {
    try {
      setOrdersLoading(true);
      const res = await apiRequest<{ orders: OrderDto[] }>('/orders?limit=50');
      setActiveOrders(res.orders);
    } catch (err) {
      console.warn('Failed to load active orders', err);
    } finally {
      setOrdersLoading(false);
    }
  };

  useEffect(() => {
    loadMenuData();
    loadActiveOrders();

    const socket: Socket = io({
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    socket.on('ORDER_CREATED', () => {
      loadActiveOrders();
    });

    socket.on('ORDER_PREPARING', (data: any) => {
      setActiveOrders((prev) =>
        prev.map((o) => (o.id === data.orderId ? { ...o, status: OrderStatus.PREPARING } : o))
      );
    });

    socket.on('ORDER_PREPARED', (data: any) => {
      setActiveOrders((prev) =>
        prev.map((o) => (o.id === data.orderId ? { ...o, status: OrderStatus.PREPARED } : o))
      );
    });

    socket.on('ORDER_COMPLETED', (data: any) => {
      setActiveOrders((prev) =>
        prev.map((o) => (o.id === data.orderId ? { ...o, status: OrderStatus.COMPLETED } : o))
      );
    });

    socket.on('ORDER_CANCELLED', (data: any) => {
      setActiveOrders((prev) =>
        prev.map((o) => (o.id === data.orderId ? { ...o, status: OrderStatus.CANCELLED } : o))
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Filter Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory =
        activeCategory === 'all' || item.categoryId === activeCategory;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, activeCategory, searchQuery]);

  // Cart Calculations
  const cartItemsList = useMemo(() => Array.from(cart.values()), [cart]);

  const cartTotalPaise = useMemo(() => {
    return cartItemsList.reduce(
      (total, item) => total + item.menuItem.pricePaise * item.quantity,
      0
    );
  }, [cartItemsList]);

  const totalCartCount = useMemo(() => {
    return cartItemsList.reduce((count, item) => count + item.quantity, 0);
  }, [cartItemsList]);

  // Cart Item Handlers
  const handleAddToCart = (item: MenuItemDto) => {
    if (!item.isAvailable) return;
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(item.id);
      if (existing) {
        next.set(item.id, { ...existing, quantity: existing.quantity + 1 });
      } else {
        next.set(item.id, { menuItem: item, quantity: 1, notes: '' });
      }
      return next;
    });
  };

  const handleDecreaseQuantity = (itemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (!existing) return prev;
      if (existing.quantity <= 1) {
        next.delete(itemId);
      } else {
        next.set(itemId, { ...existing, quantity: existing.quantity - 1 });
      }
      return next;
    });
  };

  const handleUpdateNotes = (itemId: string, notes: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      const existing = next.get(itemId);
      if (existing) {
        next.set(itemId, { ...existing, notes });
      }
      return next;
    });
  };

  const handleRemoveFromCart = (itemId: string) => {
    setCart((prev) => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  };

  const handleClearCart = () => {
    setCart(new Map());
  };

  // Place Order Checkout
  const handlePlaceOrder = async () => {
    if (cartItemsList.length === 0 || isPlacingOrder) return;
    setErrorMessage(null);

    // Client generates idempotency key
    const idempotencyKey = crypto.randomUUID();

    const payload = {
      idempotencyKey,
      items: cartItemsList.map((item) => ({
        menuItemId: item.menuItem.id,
        quantity: item.quantity,
        notes: item.notes.trim() ? item.notes.trim() : null
      }))
    };

    try {
      setIsPlacingOrder(true);
      const data = await apiRequest<{
        order: OrderDto;
        customerVerificationPin: string;
      }>('/orders', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      // Clear cart
      setCart(new Map());
      setIsCartOpen(false);

      // Show confirmation slip modal with PIN
      setPlacedOrderDetails({
        dailyOrderNumber: data.order.dailyOrderNumber,
        customerVerificationPin: data.customerVerificationPin,
        totalPaise: data.order.totalPaise
      });

      // Refresh orders queue
      loadActiveOrders();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to place order. Please check network connection.');
      }
    } finally {
      setIsPlacingOrder(false);
    }
  };

  // Mark Order as Handed Over
  const handleMarkHandover = async (orderId: string) => {
    try {
      const data = await apiRequest<{ order: OrderDto }>(`/orders/${orderId}/handover`, {
        method: 'POST'
      });
      setActiveOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
    } catch (err) {
      if (err instanceof ApiError) alert(err.message);
    }
  };

  // Submit Order Cancellation
  const handleCancelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderToCancel || !cancelReason.trim()) return;

    try {
      setCancelSubmitting(true);
      setCancelError(null);
      const data = await apiRequest<{ order: OrderDto }>(`/orders/${orderToCancel.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() })
      });

      setActiveOrders((prev) => prev.map((o) => (o.id === data.order.id ? data.order : o)));
      setOrderToCancel(null);
      setCancelReason('');
    } catch (err) {
      if (err instanceof ApiError) {
        setCancelError(err.message);
      } else {
        setCancelError('Failed to cancel order.');
      }
    } finally {
      setCancelSubmitting(false);
    }
  };

  // Filter Active Orders
  const filteredActiveOrders = useMemo(() => {
    return activeOrders.filter((ord) => {
      if (selectedOrderStatusFilter === 'all') return true;
      return ord.status === selectedOrderStatusFilter;
    });
  }, [activeOrders, selectedOrderStatusFilter]);

  const activeOrdersCount = useMemo(() => {
    return activeOrders.filter(
      (o) => o.status === OrderStatus.PLACED || o.status === OrderStatus.PREPARING || o.status === OrderStatus.PREPARED
    ).length;
  }, [activeOrders]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 lg:pb-0">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Counter Point-of-Sale
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 hidden sm:block">
              Select items, review the cart, and generate dining tickets with customer tracking PINs.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => {
                loadActiveOrders();
                setIsActiveOrdersOpen(true);
              }}
              className="inline-flex items-center px-3.5 py-2 rounded-lg text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 shadow-sm transition-colors"
            >
              <History className="w-4 h-4 mr-1.5 text-slate-500" />
              <span>Active Orders</span>
              {activeOrdersCount > 0 && (
                <span className="ml-2 px-1.5 py-0.5 text-xs font-bold rounded-full bg-orange-600 text-white">
                  {activeOrdersCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mt-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-xs font-semibold text-rose-500">
              Dismiss
            </button>
          </div>
        )}

        {/* Search & Category Pills */}
        <div className="mt-4 space-y-3">
          <div className="relative max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search food by name..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          {/* Horizontally Scrollable Category Pills */}
          <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none">
            <button
              onClick={() => setActiveCategory('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                activeCategory === 'all'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  activeCategory === cat.id
                    ? 'bg-orange-600 text-white shadow-sm'
                    : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Cards Grid */}
        <div className="mt-4 flex-1">
          {loading ? (
            <div className="p-12 text-center">
              <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="mt-3 text-sm text-slate-500">Loading food catalog...</p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="mt-2 text-sm font-semibold text-slate-900">No items match your filter</p>
              <p className="text-xs text-slate-500 mt-1">Try searching for a different item.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
              {filteredItems.map((item) => {
                const inCart = cart.get(item.id);
                const quantity = inCart?.quantity || 0;

                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border p-3.5 flex flex-col justify-between shadow-sm transition-all ${
                      !item.isAvailable
                        ? 'opacity-60 bg-slate-100 border-slate-200 cursor-not-allowed'
                        : quantity > 0
                        ? 'border-orange-500 ring-1 ring-orange-500'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="font-semibold text-slate-900 text-sm sm:text-base leading-snug line-clamp-1">
                          {item.name}
                        </h3>
                        {!item.isAvailable && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                            Unavailable
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-sm sm:text-base font-bold text-slate-900">
                          {formatPaise(item.pricePaise)}
                        </span>
                        <div className="text-[11px] text-slate-400 flex items-center space-x-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>~{item.prepTimeMinutes}m</span>
                        </div>
                      </div>

                      {item.isAvailable ? (
                        quantity === 0 ? (
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 transition-colors flex items-center space-x-1 min-h-[36px]"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add</span>
                          </button>
                        ) : (
                          <div className="flex items-center space-x-1.5 bg-orange-50 rounded-lg p-1 border border-orange-200">
                            <button
                              onClick={() => handleDecreaseQuantity(item.id)}
                              className="w-7 h-7 rounded-md bg-white text-orange-700 hover:bg-orange-100 flex items-center justify-center font-bold text-sm shadow-xs"
                              aria-label="Decrease quantity"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-sm font-bold text-orange-950 px-1 min-w-[18px] text-center">
                              {quantity}
                            </span>
                            <button
                              onClick={() => handleAddToCart(item)}
                              className="w-7 h-7 rounded-md bg-orange-600 text-white hover:bg-orange-700 flex items-center justify-center font-bold text-sm shadow-xs"
                              aria-label="Increase quantity"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )
                      ) : (
                        <span className="text-xs text-slate-400 font-medium">Sold Out</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Floating Mobile Sticky Cart Bar */}
        {totalCartCount > 0 && (
          <div className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 p-3 sm:p-4 shadow-lg z-30 flex items-center justify-between max-w-7xl mx-auto">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-orange-600 text-white flex items-center justify-center shadow-sm">
                  <ShoppingCart className="w-5 h-5" />
                </div>
                <span className="absolute -top-1 -right-1 bg-slate-900 text-white text-[11px] font-bold rounded-full w-5 h-5 flex items-center justify-center border-2 border-white">
                  {totalCartCount}
                </span>
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">{totalCartCount} portion(s)</p>
                <p className="text-lg font-bold text-slate-900 leading-tight">
                  {formatPaise(cartTotalPaise)}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors flex items-center space-x-2"
            >
              <span>Review Cart</span>
            </button>
          </div>
        )}
      </main>

      {/* Cart Review Slide-Over Drawer */}
      <Modal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        title={`Review Cart (${totalCartCount} items)`}
      >
        <div className="space-y-4">
          <div className="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 pr-1">
            {cartItemsList.map(({ menuItem, quantity, notes }) => (
              <div key={menuItem.id} className="py-3 space-y-2">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-semibold text-slate-900 text-sm">{menuItem.name}</h4>
                    <p className="text-xs text-slate-500">{formatPaise(menuItem.pricePaise)} each</p>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-slate-900 text-sm">
                      {formatPaise(menuItem.pricePaise * quantity)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => handleUpdateNotes(menuItem.id, e.target.value)}
                    placeholder="Item notes (e.g. less spicy)..."
                    className="flex-1 text-xs px-2.5 py-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  />

                  <div className="flex items-center space-x-1.5">
                    <button
                      onClick={() => handleDecreaseQuantity(menuItem.id)}
                      className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs font-bold text-slate-900 px-1">{quantity}</span>
                    <button
                      onClick={() => handleAddToCart(menuItem)}
                      className="w-7 h-7 rounded bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleRemoveFromCart(menuItem.id)}
                      className="p-1 text-slate-400 hover:text-rose-600 ml-1"
                      title="Remove"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 pt-3 space-y-2">
            <div className="flex justify-between items-center text-sm font-medium text-slate-600">
              <span>Order Gross Subtotal:</span>
              <span>{formatPaise(cartTotalPaise)}</span>
            </div>
            <div className="flex justify-between items-center text-base font-bold text-slate-900">
              <span>Total Payable:</span>
              <span className="text-lg text-orange-600">{formatPaise(cartTotalPaise)}</span>
            </div>
          </div>

          <div className="pt-2 flex items-center space-x-3">
            <button
              onClick={handleClearCart}
              className="px-3 py-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
            >
              Clear Cart
            </button>
            <button
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || cartItemsList.length === 0}
              className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow-md transition-colors disabled:opacity-60 flex items-center justify-center space-x-2"
            >
              {isPlacingOrder ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Submitting Order...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Confirm & Place Order</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Order Created Success Slip Modal */}
      <Modal
        isOpen={placedOrderDetails !== null}
        onClose={() => setPlacedOrderDetails(null)}
        title="Order Placed Successfully"
      >
        {placedOrderDetails && (
          <div className="text-center space-y-5">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div>
              <p className="text-xs uppercase tracking-wider text-slate-400 font-bold">
                Daily Dining Ticket
              </p>
              <h2 className="text-4xl font-extrabold text-slate-900 tracking-tight mt-1">
                {placedOrderDetails.dailyOrderNumber}
              </h2>
            </div>

            <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-1">
              <p className="text-xs text-orange-800 font-medium">Customer Verification PIN</p>
              <p className="text-3xl font-black text-orange-600 tracking-widest">
                {placedOrderDetails.customerVerificationPin}
              </p>
              <p className="text-[11px] text-orange-700 mt-1">
                Share this PIN with the customer to track their food live on the public QR screen.
              </p>
            </div>

            <div className="text-xs text-slate-500">
              Total Amount: <span className="font-bold text-slate-900">{formatPaise(placedOrderDetails.totalPaise)}</span>
            </div>

            <button
              onClick={() => setPlacedOrderDetails(null)}
              className="w-full py-3 rounded-xl font-bold text-white bg-orange-600 hover:bg-orange-700 shadow transition-colors"
            >
              Done / Start Next Order
            </button>
          </div>
        )}
      </Modal>

      {/* Active Orders Drawer Modal */}
      <Modal
        isOpen={isActiveOrdersOpen}
        onClose={() => setIsActiveOrdersOpen(false)}
        title="Active Shift Orders"
      >
        <div className="space-y-4">
          {/* Status Filter */}
          <div className="flex space-x-1.5 overflow-x-auto pb-1">
            {['all', OrderStatus.PLACED, OrderStatus.PREPARING, OrderStatus.PREPARED, OrderStatus.COMPLETED].map(
              (st) => (
                <button
                  key={st}
                  onClick={() => setSelectedOrderStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap capitalize transition-colors ${
                    selectedOrderStatusFilter === st
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {st.toLowerCase()}
                </button>
              )
            )}
          </div>

          {/* Orders List */}
          <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-1">
            {ordersLoading ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="mt-2 text-xs text-slate-500">Loading orders...</p>
              </div>
            ) : filteredActiveOrders.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No orders found under this status.
              </div>
            ) : (
              filteredActiveOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900 text-base">
                      {ord.dailyOrderNumber}
                    </span>
                    <Badge
                      variant={
                        ord.status === OrderStatus.COMPLETED
                          ? 'neutral'
                          : ord.status === OrderStatus.PREPARED
                          ? 'success'
                          : ord.status === OrderStatus.PREPARING
                          ? 'warning'
                          : ord.status === OrderStatus.CANCELLED
                          ? 'danger'
                          : 'primary'
                      }
                    >
                      {ord.status}
                    </Badge>
                  </div>

                  <div className="text-xs text-slate-600 space-y-0.5">
                    {ord.items.map((it) => (
                      <div key={it.id} className="flex justify-between">
                        <span>
                          {it.quantity}x {it.nameSnapshot}
                        </span>
                        <span className="text-slate-400">{formatPaise(it.subtotalPaise)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-xs">
                    <span className="font-bold text-slate-900">{formatPaise(ord.totalPaise)}</span>

                    <div className="flex items-center space-x-2">
                      {ord.status === OrderStatus.PREPARING && (
                        <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200/60">
                          Cooking in kitchen
                        </span>
                      )}

                      {ord.status === OrderStatus.PLACED && (
                        <span className="text-[11px] font-medium text-slate-400">
                          Awaiting kitchen
                        </span>
                      )}

                      {ord.status === OrderStatus.PREPARED && (
                        <button
                          onClick={() => handleMarkHandover(ord.id)}
                          className="px-2.5 py-1 rounded bg-emerald-600 text-white font-semibold hover:bg-emerald-700 shadow-sm transition-colors"
                        >
                          Hand Over
                        </button>
                      )}

                      {ord.status === OrderStatus.PLACED && (
                        <button
                          onClick={() => {
                            setOrderToCancel(ord);
                            setCancelReason('');
                            setCancelError(null);
                          }}
                          className="px-2.5 py-1 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold hover:bg-rose-100 transition-colors"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Cancel Order Reason Modal */}
      <Modal
        isOpen={orderToCancel !== null}
        onClose={() => setOrderToCancel(null)}
        title={`Cancel Order: ${orderToCancel?.dailyOrderNumber}`}
      >
        <form onSubmit={handleCancelSubmit} className="space-y-4">
          {cancelError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{cancelError}</span>
            </div>
          )}

          <p className="text-xs text-slate-500">
            A reason is mandatory for auditing and cancellation reporting.
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700">Cancellation Reason</label>
            <input
              type="text"
              required
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer changed mind, incorrect item selected"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setOrderToCancel(null)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={cancelSubmitting || !cancelReason.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-sm disabled:opacity-60"
            >
              {cancelSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
