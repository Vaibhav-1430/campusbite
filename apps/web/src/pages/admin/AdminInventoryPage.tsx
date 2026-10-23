import React, { useEffect, useState, useMemo } from 'react';
import {
  StockItemDto,
  InventoryMovementDto,
  InventoryOverviewDto,
  createStockItemSchema,
  updateStockItemSchema,
  restockStockItemSchema,
  adjustStockItemSchema
} from '@campusbite/shared';
import { apiRequest, ApiError } from '../../services/api.js';
import { Navbar } from '../../components/common/Navbar.js';
import { Modal } from '../../components/common/Modal.js';
import { Link } from 'react-router-dom';
import {
  Boxes,
  Utensils,
  Users,
  Search,
  Plus,
  Edit2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowUpRight,
  Sliders,
  RotateCcw,
  ShoppingCart,
  RefreshCw,
  TrendingDown
} from 'lucide-react';
import { io, Socket } from 'socket.io-client';

export const AdminInventoryPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stock' | 'ledger'>('stock');
  const [overview, setOverview] = useState<InventoryOverviewDto | null>(null);
  const [stockItems, setStockItems] = useState<StockItemDto[]>([]);
  const [movements, setMovements] = useState<InventoryMovementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [movementsLoading, setMovementsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out' | 'healthy'>('all');
  const [movementFilter, setMovementFilter] = useState<string>('all');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create Stock Item Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    unit: 'portions',
    currentQuantity: 0,
    lowStockThreshold: 10
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Stock Item Modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<StockItemDto | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    unit: '',
    lowStockThreshold: 10
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Restock Modal
  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [selectedRestockItem, setSelectedRestockItem] = useState<StockItemDto | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);
  const [restockNote, setRestockNote] = useState<string>('');
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);

  // Adjust / Waste Modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedAdjustItem, setSelectedAdjustItem] = useState<StockItemDto | null>(null);
  const [adjustChange, setAdjustChange] = useState<number>(-1);
  const [adjustReason, setAdjustReason] = useState<string>('Spoilage / Expired');
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Fetch Inventory Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [overviewRes, itemsRes] = await Promise.all([
        apiRequest<{ overview: InventoryOverviewDto }>('/inventory/overview'),
        apiRequest<{ items: StockItemDto[] }>('/inventory')
      ]);
      setOverview(overviewRes.overview);
      setStockItems(itemsRes.items);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load inventory data.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch Movement History
  const fetchMovements = async () => {
    try {
      setMovementsLoading(true);
      const res = await apiRequest<{ movements: InventoryMovementDto[]; total: number }>(
        '/inventory/movements?limit=100'
      );
      setMovements(res.movements);
    } catch (err) {
      console.warn('Failed to load inventory movements', err);
    } finally {
      setMovementsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    fetchMovements();

    const socket: Socket = io({
      transports: ['websocket', 'polling'],
      withCredentials: true
    });

    socket.on('STOCK_UPDATED', (data: any) => {
      // Update item in local list
      setStockItems((prev) =>
        prev.map((item) =>
          item.id === data.stockItemId
            ? {
                ...item,
                currentQuantity: data.currentQuantity,
                lowStockThreshold: data.lowStockThreshold,
                isLowStock: data.isLowStock,
                isOutOfStock: data.isOutOfStock,
                updatedAt: new Date().toISOString()
              }
            : item
        )
      );

      // Refresh overview & movements in background
      apiRequest<{ overview: InventoryOverviewDto }>('/inventory/overview')
        .then((res) => setOverview(res.overview))
        .catch(() => {});
      apiRequest<{ movements: InventoryMovementDto[]; total: number }>('/inventory/movements?limit=100')
        .then((res) => setMovements(res.movements))
        .catch(() => {});
    });

    socket.on('STOCK_LOW_ALERT', (data: any) => {
      setSuccessMessage(
        `Low Stock Alert: "${data.stockItemName}" has only ${data.currentQuantity} remaining (Threshold: ${data.threshold}).`
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Filtered Stock Items
  const filteredStockItems = useMemo(() => {
    return stockItems.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.unit.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (stockFilter === 'low') return item.isLowStock && !item.isOutOfStock;
      if (stockFilter === 'out') return item.isOutOfStock;
      if (stockFilter === 'healthy') return !item.isLowStock && !item.isOutOfStock;
      return true;
    });
  }, [stockItems, searchQuery, stockFilter]);

  // Filtered Movements
  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (movementFilter === 'all') return true;
      return m.type === movementFilter;
    });
  }, [movements, movementFilter]);

  // Handle Create Stock Item
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    const payload = {
      name: createForm.name.trim(),
      unit: createForm.unit.trim(),
      currentQuantity: Number(createForm.currentQuantity),
      lowStockThreshold: Number(createForm.lowStockThreshold)
    };

    const validation = createStockItemSchema.safeParse(payload);
    if (!validation.success) {
      setCreateError(validation.error.errors[0]?.message || 'Invalid stock item data.');
      return;
    }

    try {
      setCreateSubmitting(true);
      const res = await apiRequest<{ item: StockItemDto }>('/inventory', {
        method: 'POST',
        body: JSON.stringify(validation.data)
      });
      setStockItems([res.item, ...stockItems]);
      setSuccessMessage(`Stock item "${res.item.name}" created successfully.`);
      setIsCreateModalOpen(false);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) setCreateError(err.message);
      else setCreateError('Failed to create stock item.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  // Handle Edit Stock Item
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setEditError(null);

    const payload = {
      name: editForm.name.trim(),
      unit: editForm.unit.trim(),
      lowStockThreshold: Number(editForm.lowStockThreshold)
    };

    const validation = updateStockItemSchema.safeParse(payload);
    if (!validation.success) {
      setEditError(validation.error.errors[0]?.message || 'Invalid stock item data.');
      return;
    }

    try {
      setEditSubmitting(true);
      const res = await apiRequest<{ item: StockItemDto }>(`/inventory/${editingItem.id}`, {
        method: 'PUT',
        body: JSON.stringify(validation.data)
      });
      setStockItems(stockItems.map((item) => (item.id === res.item.id ? res.item : item)));
      setSuccessMessage(`Stock item "${res.item.name}" updated successfully.`);
      setIsEditModalOpen(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      if (err instanceof ApiError) setEditError(err.message);
      else setEditError('Failed to update stock item.');
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Restock Submit
  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRestockItem) return;
    setRestockError(null);

    const payload = {
      quantityAdded: Number(restockAmount),
      note: restockNote.trim() ? restockNote.trim() : null
    };

    const validation = restockStockItemSchema.safeParse(payload);
    if (!validation.success) {
      setRestockError(validation.error.errors[0]?.message || 'Invalid restock quantity.');
      return;
    }

    try {
      setRestockSubmitting(true);
      const res = await apiRequest<{ item: StockItemDto }>(`/inventory/${selectedRestockItem.id}/restock`, {
        method: 'POST',
        body: JSON.stringify(validation.data)
      });
      setStockItems(stockItems.map((item) => (item.id === res.item.id ? res.item : item)));
      setSuccessMessage(
        `Added +${payload.quantityAdded} ${res.item.unit} to "${res.item.name}". New balance: ${res.item.currentQuantity}`
      );
      setIsRestockModalOpen(false);
      setSelectedRestockItem(null);
      fetchData();
      fetchMovements();
    } catch (err) {
      if (err instanceof ApiError) setRestockError(err.message);
      else setRestockError('Failed to restock item.');
    } finally {
      setRestockSubmitting(false);
    }
  };

  // Handle Adjust Submit
  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAdjustItem) return;
    setAdjustError(null);

    const payload = {
      quantityChange: Number(adjustChange),
      reason: adjustReason.trim()
    };

    const validation = adjustStockItemSchema.safeParse(payload);
    if (!validation.success) {
      setAdjustError(validation.error.errors[0]?.message || 'Invalid adjustment data.');
      return;
    }

    try {
      setAdjustSubmitting(true);
      const res = await apiRequest<{ item: StockItemDto }>(`/inventory/${selectedAdjustItem.id}/adjust`, {
        method: 'POST',
        body: JSON.stringify(validation.data)
      });
      setStockItems(stockItems.map((item) => (item.id === res.item.id ? res.item : item)));
      setSuccessMessage(
        `Adjusted "${res.item.name}" by ${payload.quantityChange > 0 ? '+' : ''}${payload.quantityChange} ${res.item.unit}. New balance: ${res.item.currentQuantity}`
      );
      setIsAdjustModalOpen(false);
      setSelectedAdjustItem(null);
      fetchData();
      fetchMovements();
    } catch (err) {
      if (err instanceof ApiError) setAdjustError(err.message);
      else setAdjustError('Failed to adjust item quantity.');
    } finally {
      setAdjustSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Navigation Tabs (Menu vs Staff vs Inventory) */}
        <div className="flex border-b border-slate-200 space-x-6 mb-6">
          <Link
            to="/admin/menu"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2"
          >
            <Utensils className="w-4 h-4" />
            <span>Menu & Categories</span>
          </Link>
          <Link
            to="/admin/inventory"
            className="pb-3 text-sm font-semibold text-orange-600 border-b-2 border-orange-600 flex items-center space-x-2"
          >
            <Boxes className="w-4 h-4" />
            <span>Inventory & Stock</span>
          </Link>
          <Link
            to="/admin/staff"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2"
          >
            <Users className="w-4 h-4" />
            <span>Staff Management</span>
          </Link>
        </div>

        {/* Page Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Inventory & Operations
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage stock quantities, thresholds, restocking, waste adjustments, and audit ledger.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                fetchData();
                fetchMovements();
              }}
              className="inline-flex items-center justify-center p-2.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 shadow-sm transition-colors"
              title="Refresh Inventory"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setCreateError(null);
                setCreateForm({
                  name: '',
                  unit: 'portions',
                  currentQuantity: 0,
                  lowStockThreshold: 10
                });
                setIsCreateModalOpen(true);
              }}
              className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Add Stock Item
            </button>
          </div>
        </div>

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="mb-6 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={clearMessages} className="text-xs font-semibold text-rose-500">
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={clearMessages} className="text-xs font-semibold text-emerald-600">
              Dismiss
            </button>
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
              <span>Tracked Items</span>
              <Boxes className="w-4 h-4 text-slate-400" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-slate-900">
              {overview?.totalStockItems ?? stockItems.length}
            </div>
            <div className="mt-1 text-xs text-slate-500">Unique inventory SKUs</div>
          </div>

          <div
            onClick={() => setStockFilter('low')}
            className={`bg-white p-4 rounded-xl border shadow-sm cursor-pointer transition-colors ${
              stockFilter === 'low' ? 'border-amber-400 bg-amber-50/40' : 'border-slate-200 hover:border-amber-300'
            }`}
          >
            <div className="flex items-center justify-between text-amber-700 text-xs font-semibold uppercase tracking-wider">
              <span>Low Stock</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-amber-600">
              {overview?.lowStockCount ?? stockItems.filter((i) => i.isLowStock && !i.isOutOfStock).length}
            </div>
            <div className="mt-1 text-xs text-amber-700/80">At or below threshold</div>
          </div>

          <div
            onClick={() => setStockFilter('out')}
            className={`bg-white p-4 rounded-xl border shadow-sm cursor-pointer transition-colors ${
              stockFilter === 'out' ? 'border-rose-400 bg-rose-50/40' : 'border-slate-200 hover:border-rose-300'
            }`}
          >
            <div className="flex items-center justify-between text-rose-700 text-xs font-semibold uppercase tracking-wider">
              <span>Out of Stock</span>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-rose-600">
              {overview?.outOfStockCount ?? stockItems.filter((i) => i.isOutOfStock).length}
            </div>
            <div className="mt-1 text-xs text-rose-700/80">Exhausted items (0 left)</div>
          </div>

          <div
            onClick={() => setStockFilter('healthy')}
            className={`bg-white p-4 rounded-xl border shadow-sm cursor-pointer transition-colors ${
              stockFilter === 'healthy' ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 hover:border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold uppercase tracking-wider">
              <span>Healthy Stock</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="mt-2 text-2xl sm:text-3xl font-black text-emerald-600">
              {overview?.healthyStockCount ?? stockItems.filter((i) => !i.isLowStock && !i.isOutOfStock).length}
            </div>
            <div className="mt-1 text-xs text-emerald-700/80">Well above threshold</div>
          </div>
        </div>

        {/* Tab Switcher & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div className="flex bg-slate-200/80 p-1 rounded-xl w-fit">
            <button
              onClick={() => setActiveTab('stock')}
              className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'stock'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Stock Items ({stockItems.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('ledger');
                fetchMovements();
              }}
              className={`px-4 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
                activeTab === 'ledger'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Movement Ledger ({movements.length})
            </button>
          </div>

          {activeTab === 'stock' ? (
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search stock items..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
                />
              </div>

              {stockFilter !== 'all' && (
                <button
                  onClick={() => setStockFilter('all')}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-200 hover:bg-slate-300 transition-colors whitespace-nowrap"
                >
                  Clear Filter
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={movementFilter}
                onChange={(e) => setMovementFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
              >
                <option value="all">All Movement Types</option>
                <option value="MANUAL_RESTOCK">Manual Restock</option>
                <option value="ORDER_DEDUCTION">Order Deduction</option>
                <option value="MANUAL_ADJUSTMENT">Manual Adjustment</option>
                <option value="CANCELLATION_RESTORE">Order Cancellation</option>
              </select>
            </div>
          )}
        </div>

        {/* Content Area */}
        {loading ? (
          <div className="p-12 text-center">
            <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="mt-3 text-sm text-slate-500">Loading inventory data...</p>
          </div>
        ) : activeTab === 'stock' ? (
          /* Stock Items Cards Grid */
          filteredStockItems.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
              <Boxes className="w-12 h-12 text-slate-300 mx-auto" />
              <h3 className="mt-2 text-base font-semibold text-slate-900">No stock items found</h3>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery || stockFilter !== 'all'
                  ? 'Try adjusting your search query or status filter.'
                  : 'Start tracking inventory by creating your first stock item.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredStockItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border p-4 sm:p-5 flex flex-col justify-between shadow-sm transition-all ${
                    item.isOutOfStock
                      ? 'border-rose-300 bg-rose-50/20'
                      : item.isLowStock
                      ? 'border-amber-300 bg-amber-50/20'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div>
                    {/* Header: Name and Status Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-base sm:text-lg leading-tight">
                          {item.name}
                        </h3>
                        <span className="text-xs text-slate-500">
                          Unit: <span className="font-medium text-slate-700">{item.unit}</span>
                        </span>
                      </div>

                      {item.isOutOfStock ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertTriangle className="w-3 h-3 mr-1" />
                          Out of Stock
                        </span>
                      ) : item.isLowStock ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          In Stock
                        </span>
                      )}
                    </div>

                    {/* Quantity Display */}
                    <div className="mt-4 flex items-baseline space-x-2">
                      <span
                        className={`text-3xl sm:text-4xl font-black ${
                          item.isOutOfStock
                            ? 'text-rose-600'
                            : item.isLowStock
                            ? 'text-amber-600'
                            : 'text-slate-900'
                        }`}
                      >
                        {item.currentQuantity}
                      </span>
                      <span className="text-sm font-semibold text-slate-500">{item.unit}</span>
                    </div>

                    {/* Threshold info and Link count */}
                    <div className="mt-2 text-xs text-slate-500 space-y-1">
                      <div className="flex items-center justify-between">
                        <span>Low-stock alert threshold:</span>
                        <span className="font-semibold text-slate-700">{item.lowStockThreshold} {item.unit}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Linked Menu Items:</span>
                        <span className="font-semibold text-slate-700">
                          {item.linkedMenuItemCount > 0 ? (
                            <span className="text-orange-600 font-bold">{item.linkedMenuItemCount} active</span>
                          ) : (
                            <span className="text-slate-400">None</span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedRestockItem(item);
                        setRestockAmount(10);
                        setRestockNote('');
                        setRestockError(null);
                        setIsRestockModalOpen(true);
                      }}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors flex items-center justify-center space-x-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Restock</span>
                    </button>

                    <button
                      onClick={() => {
                        setSelectedAdjustItem(item);
                        setAdjustChange(-1);
                        setAdjustReason('Spoilage / Expired');
                        setAdjustError(null);
                        setIsAdjustModalOpen(true);
                      }}
                      className="py-2 px-3 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors flex items-center space-x-1"
                      title="Waste or Manual Adjustment"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Adjust</span>
                    </button>

                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setEditForm({
                          name: item.name,
                          unit: item.unit,
                          lowStockThreshold: item.lowStockThreshold
                        });
                        setEditError(null);
                        setIsEditModalOpen(true);
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      title="Edit Stock Item settings"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          /* Movement Ledger Table */
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {movementsLoading ? (
              <div className="p-12 text-center">
                <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="mt-3 text-sm text-slate-500">Loading movement history...</p>
              </div>
            ) : filteredMovements.length === 0 ? (
              <div className="p-12 text-center">
                <Clock className="w-10 h-10 text-slate-300 mx-auto" />
                <h4 className="mt-2 text-sm font-semibold text-slate-900">No movement records found</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Inventory movements will appear here when items are restocked, ordered, or adjusted.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredMovements.map((m) => {
                  const isPositive = m.quantityChange > 0;
                  return (
                    <div
                      key={m.id}
                      className="p-3.5 sm:p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm"
                    >
                      {/* Left: Type badge + Stock item + Details */}
                      <div className="flex items-start space-x-3">
                        <div className="mt-0.5 flex-shrink-0">
                          {m.type === 'MANUAL_RESTOCK' && (
                            <span className="p-2 rounded-lg bg-emerald-100 text-emerald-700 inline-block">
                              <ArrowUpRight className="w-4 h-4" />
                            </span>
                          )}
                          {m.type === 'ORDER_DEDUCTION' && (
                            <span className="p-2 rounded-lg bg-blue-100 text-blue-700 inline-block">
                              <ShoppingCart className="w-4 h-4" />
                            </span>
                          )}
                          {m.type === 'MANUAL_ADJUSTMENT' && (
                            <span className="p-2 rounded-lg bg-purple-100 text-purple-700 inline-block">
                              <Sliders className="w-4 h-4" />
                            </span>
                          )}
                          {m.type === 'CANCELLATION_RESTORE' && (
                            <span className="p-2 rounded-lg bg-indigo-100 text-indigo-700 inline-block">
                              <RotateCcw className="w-4 h-4" />
                            </span>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-slate-900">{m.stockItemName}</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                m.type === 'MANUAL_RESTOCK'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : m.type === 'ORDER_DEDUCTION'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : m.type === 'MANUAL_ADJUSTMENT'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              }`}
                            >
                              {m.type.replace(/_/g, ' ')}
                            </span>
                          </div>

                          <div className="mt-1 text-slate-500 text-xs flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span>
                              By: <strong className="text-slate-700">{m.performedByName}</strong> ({m.performedByRole})
                            </span>
                            {m.orderNumber && (
                              <span>
                                Order: <strong className="text-orange-600">#{m.orderNumber}</strong>
                              </span>
                            )}
                            {m.note && (
                              <span className="italic text-slate-600">"{m.note}"</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Quantity Change and Progression */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                        <div
                          className={`font-black text-base ${
                            isPositive ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {isPositive ? `+${m.quantityChange}` : m.quantityChange}
                        </div>
                        {m.previousQuantity !== null && m.newQuantity !== null && (
                          <div className="text-[11px] text-slate-400">
                            {m.previousQuantity} → {m.newQuantity}
                          </div>
                        )}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            month: 'short',
                            day: 'numeric'
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </main>

      {/* CREATE STOCK ITEM MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Add New Stock Item"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {createError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              required
              value={createForm.name}
              onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
              placeholder="e.g. Burger Patty, French Fries, Milk"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit of Measure *
              </label>
              <input
                type="text"
                required
                value={createForm.unit}
                onChange={(e) => setCreateForm({ ...createForm, unit: e.target.value })}
                placeholder="portions, kg, pcs, liters"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Initial Quantity *
              </label>
              <input
                type="number"
                min="0"
                required
                value={createForm.currentQuantity}
                onChange={(e) =>
                  setCreateForm({ ...createForm, currentQuantity: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Low-Stock Threshold (Alert Trigger) *
            </label>
            <input
              type="number"
              min="0"
              required
              value={createForm.lowStockThreshold}
              onChange={(e) =>
                setCreateForm({ ...createForm, lowStockThreshold: parseInt(e.target.value, 10) || 0 })
              }
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              When stock drops to or below this number, high-priority warnings are raised on POS and Admin.
            </p>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createSubmitting}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {createSubmitting ? 'Creating...' : 'Create Stock Item'}
            </button>
          </div>
        </form>
      </Modal>

      {/* EDIT STOCK ITEM MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit "${editingItem?.name}"`}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {editError}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Item Name *
            </label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unit of Measure *
              </label>
              <input
                type="text"
                required
                value={editForm.unit}
                onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Low-Stock Threshold *
              </label>
              <input
                type="number"
                min="0"
                required
                value={editForm.lowStockThreshold}
                onChange={(e) =>
                  setEditForm({ ...editForm, lowStockThreshold: parseInt(e.target.value, 10) || 0 })
                }
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsEditModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={editSubmitting}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {editSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* RESTOCK MODAL */}
      <Modal
        isOpen={isRestockModalOpen}
        onClose={() => setIsRestockModalOpen(false)}
        title={`Restock: ${selectedRestockItem?.name}`}
      >
        <form onSubmit={handleRestockSubmit} className="space-y-4">
          {restockError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {restockError}
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600">Current Balance:</span>
            <span className="font-bold text-slate-900">
              {selectedRestockItem?.currentQuantity} {selectedRestockItem?.unit}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quantity to Add *
            </label>
            <input
              type="number"
              min="1"
              required
              value={restockAmount}
              onChange={(e) => setRestockAmount(parseInt(e.target.value, 10) || 1)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
            {/* Quick amount chips */}
            <div className="mt-2 flex items-center space-x-2">
              {[5, 10, 25, 50, 100].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setRestockAmount(amt)}
                  className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700"
                >
                  +{amt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Restock Note / Supplier (Optional)
            </label>
            <input
              type="text"
              value={restockNote}
              onChange={(e) => setRestockNote(e.target.value)}
              placeholder="e.g. Morning delivery from Metro Cash & Carry"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          {selectedRestockItem && (
            <div className="text-xs text-emerald-700 font-medium">
              New Projected Quantity: {selectedRestockItem.currentQuantity + (Number(restockAmount) || 0)} {selectedRestockItem.unit}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsRestockModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={restockSubmitting}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {restockSubmitting ? 'Restocking...' : 'Confirm Restock'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ADJUST / WASTE MODAL */}
      <Modal
        isOpen={isAdjustModalOpen}
        onClose={() => setIsAdjustModalOpen(false)}
        title={`Adjust Stock: ${selectedAdjustItem?.name}`}
      >
        <form onSubmit={handleAdjustSubmit} className="space-y-4">
          {adjustError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {adjustError}
            </div>
          )}

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <span className="text-xs text-slate-600">Current Balance:</span>
            <span className="font-bold text-slate-900">
              {selectedAdjustItem?.currentQuantity} {selectedAdjustItem?.unit}
            </span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Quantity Change (Negative for Waste / Loss, Positive for Count surplus) *
            </label>
            <input
              type="number"
              required
              value={adjustChange}
              onChange={(e) => setAdjustChange(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
            {/* Quick deduction chips */}
            <div className="mt-2 flex items-center space-x-2">
              {[-1, -2, -5, -10].map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setAdjustChange(amt)}
                  className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold"
                >
                  {amt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Adjustment Reason (Mandatory Audit Trail) *
            </label>
            <input
              type="text"
              required
              minLength={3}
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
              placeholder="e.g. Expired batch discarded, Spillage during lunch rush"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
            {/* Quick reason suggestions */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[
                'Spoilage / Expired',
                'Damaged packaging',
                'Kitchen spillage',
                'Physical inventory recount',
                'Batch quality issue'
              ].map((reason) => (
                <button
                  type="button"
                  key={reason}
                  onClick={() => setAdjustReason(reason)}
                  className="px-2 py-0.5 rounded text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          {selectedAdjustItem && (
            <div
              className={`text-xs font-medium ${
                selectedAdjustItem.currentQuantity + adjustChange < 0
                  ? 'text-rose-600 font-bold'
                  : 'text-slate-600'
              }`}
            >
              New Projected Quantity: {selectedAdjustItem.currentQuantity + adjustChange} {selectedAdjustItem.unit}
              {selectedAdjustItem.currentQuantity + adjustChange < 0 && (
                <p className="mt-1 text-rose-600 text-[11px]">
                  Warning: Cannot adjust below 0. Adjustment will be rejected by the server.
                </p>
              )}
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
            <button
              type="button"
              onClick={() => setIsAdjustModalOpen(false)}
              className="px-4 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={Boolean(adjustSubmitting || (selectedAdjustItem && selectedAdjustItem.currentQuantity + adjustChange < 0))}
              className="px-4 py-2 bg-orange-600 hover:bg-orange-700 rounded-lg text-xs font-semibold text-white shadow-sm disabled:opacity-50"
            >
              {adjustSubmitting ? 'Adjusting...' : 'Record Adjustment'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AdminInventoryPage;
