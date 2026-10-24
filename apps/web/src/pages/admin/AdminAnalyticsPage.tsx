import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Utensils,
  Boxes,
  Users,
  BarChart3,
  Calendar,
  Download,
  RefreshCw,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShoppingBag,
  IndianRupee,
  ChefHat,
  Package,
  Layers,
  FileSpreadsheet,
  Trash2
} from 'lucide-react';
import { Navbar } from '../../components/common/Navbar.js';
import { Modal } from '../../components/common/Modal.js';
import {
  SalesSummaryDto,
  MenuItemPerformanceDto,
  KitchenPerformanceDto,
  InventoryReportDto,
  DailyClosingReportDto,
  ResetBusinessDataResponse
} from '@campusbite/shared';
import { apiRequest, downloadCsv, ApiError } from '../../services/api.js';

type DatePreset = 'today' | '7days' | '30days' | 'custom';
type AnalyticsSubTab = 'sales' | 'menu' | 'kitchen' | 'inventory' | 'closing';

export const AdminAnalyticsPage: React.FC = () => {
  // Navigation / View state
  const [activeTab, setActiveTab] = useState<AnalyticsSubTab>('sales');

  // Date filter state
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [startDate, setStartDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });

  // Daily closing selected date
  const [closingDate, setClosingDate] = useState<string>(() => {
    const now = new Date();
    return now.toISOString().split('T')[0];
  });

  // Data states
  const [salesSummary, setSalesSummary] = useState<SalesSummaryDto | null>(null);
  const [menuPerformance, setMenuPerformance] = useState<MenuItemPerformanceDto[]>([]);
  const [kitchenPerformance, setKitchenPerformance] = useState<KitchenPerformanceDto | null>(null);
  const [inventoryReport, setInventoryReport] = useState<InventoryReportDto | null>(null);
  const [dailyClosing, setDailyClosing] = useState<DailyClosingReportDto | null>(null);

  // Loading & Error states
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Business Data Reset Modal & Action State
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  const handleResetBusinessData = async () => {
    if (resetConfirmationInput !== 'RESET BUSINESS DATA' || isResetting) return;
    setResetError(null);
    try {
      setIsResetting(true);
      const res = await apiRequest<ResetBusinessDataResponse>('/admin/reset-business-data', {
        method: 'POST',
        body: JSON.stringify({ confirmation: resetConfirmationInput })
      });
      setIsResetModalOpen(false);
      setResetConfirmationInput('');
      setSuccessMessage(
        `Business data successfully reset. Cleared ${res.summary.deletedOrders} orders while preserving all ${res.summary.preservedMenuItems} menu items and admin accounts.`
      );
      await fetchAnalyticsData();
    } catch (err) {
      if (err instanceof ApiError) {
        setResetError(err.message);
      } else {
        setResetError('Failed to reset business data. Please check network connection.');
      }
    } finally {
      setIsResetting(false);
    }
  };

  // Helper for preset changes
  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    const now = new Date();
    const end = now.toISOString().split('T')[0];

    if (preset === 'today') {
      setStartDate(end);
      setEndDate(end);
    } else if (preset === '7days') {
      const past7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      setStartDate(past7.toISOString().split('T')[0]);
      setEndDate(end);
    } else if (preset === '30days') {
      const past30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      setStartDate(past30.toISOString().split('T')[0]);
      setEndDate(end);
    }
  };

  // Main fetch effect
  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);

      if (activeTab === 'sales') {
        const data = await apiRequest<SalesSummaryDto>(
          `/analytics/summary?startDate=${startDate}&endDate=${endDate}`
        );
        setSalesSummary(data);
      } else if (activeTab === 'menu') {
        const data = await apiRequest<{ items: MenuItemPerformanceDto[] }>(
          `/analytics/menu-performance?startDate=${startDate}&endDate=${endDate}`
        );
        setMenuPerformance(data.items);
      } else if (activeTab === 'kitchen') {
        const data = await apiRequest<KitchenPerformanceDto>(
          `/analytics/kitchen-performance?startDate=${startDate}&endDate=${endDate}`
        );
        setKitchenPerformance(data);
      } else if (activeTab === 'inventory') {
        const data = await apiRequest<InventoryReportDto>(
          `/analytics/inventory?startDate=${startDate}&endDate=${endDate}`
        );
        setInventoryReport(data);
      } else if (activeTab === 'closing') {
        const data = await apiRequest<DailyClosingReportDto>(
          `/analytics/daily-closing?date=${closingDate}`
        );
        setDailyClosing(data);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401 || err.code === 'USER_NOT_FOUND') {
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load analytics data.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, startDate, endDate, closingDate]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  // CSV Export handlers
  const handleExport = async (type: 'sales' | 'menu' | 'closing') => {
    try {
      setExporting(type);
      setErrorMessage(null);

      if (type === 'sales') {
        await downloadCsv(
          `/analytics/export/sales?startDate=${startDate}&endDate=${endDate}`,
          `cafe47-sales-${startDate}-to-${endDate}.csv`
        );
      } else if (type === 'menu') {
        await downloadCsv(
          `/analytics/export/menu?startDate=${startDate}&endDate=${endDate}`,
          `cafe47-menu-performance-${startDate}-to-${endDate}.csv`
        );
      } else if (type === 'closing') {
        await downloadCsv(
          `/analytics/export/daily-closing?date=${closingDate}`,
          `cafe47-daily-closing-${closingDate}.csv`
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to download CSV export.');
      }
    } finally {
      setExporting(null);
    }
  };

  const formatRupees = (paise: number) => {
    return (paise / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Navigation Tabs (Menu vs Inventory vs Staff vs Analytics) */}
        <div className="flex border-b border-slate-200 space-x-6 mb-6 overflow-x-auto scrollbar-none">
          <Link
            to="/admin/menu"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2 whitespace-nowrap"
          >
            <Utensils className="w-4 h-4" />
            <span>Menu & Categories</span>
          </Link>
          <Link
            to="/admin/inventory"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2 whitespace-nowrap"
          >
            <Boxes className="w-4 h-4" />
            <span>Inventory & Stock</span>
          </Link>
          <Link
            to="/admin/staff"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2 whitespace-nowrap"
          >
            <Users className="w-4 h-4" />
            <span>Staff Management</span>
          </Link>
          <Link
            to="/admin/analytics"
            className="pb-3 text-sm font-semibold text-orange-600 border-b-2 border-orange-600 flex items-center space-x-2 whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics & Reports</span>
          </Link>
        </div>

        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <span>Business Analytics & Reports</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800">
                Phase 6
              </span>
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Audit sales, menu popularity, kitchen turnaround, inventory movement, and daily register closing.
            </p>
          </div>

          {/* Quick Refresh & Universal Export Button */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <button
              onClick={() => fetchAnalyticsData()}
              disabled={loading}
              className="inline-flex items-center px-3 py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
              title="Refresh report data"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin text-orange-600' : 'text-slate-500'}`} />
              <span>Refresh</span>
            </button>

            {activeTab === 'sales' && (
              <button
                onClick={() => handleExport('sales')}
                disabled={exporting === 'sales'}
                className="inline-flex items-center px-3 py-2 border border-orange-300 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4 mr-2 text-orange-600" />
                <span>{exporting === 'sales' ? 'Exporting...' : 'Export Sales CSV'}</span>
              </button>
            )}

            {activeTab === 'menu' && (
              <button
                onClick={() => handleExport('menu')}
                disabled={exporting === 'menu'}
                className="inline-flex items-center px-3 py-2 border border-orange-300 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4 mr-2 text-orange-600" />
                <span>{exporting === 'menu' ? 'Exporting...' : 'Export Menu CSV'}</span>
              </button>
            )}

            {activeTab === 'closing' && (
              <button
                onClick={() => handleExport('closing')}
                disabled={exporting === 'closing'}
                className="inline-flex items-center px-3 py-2 border border-orange-300 rounded-lg text-sm font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 disabled:opacity-50 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4 mr-2 text-orange-600" />
                <span>{exporting === 'closing' ? 'Exporting...' : 'Export Register CSV'}</span>
              </button>
            )}

            {/* Prominent Danger-styled Reset Business Data Button */}
            <button
              id="admin-reset-business-data-btn"
              onClick={() => {
                setResetConfirmationInput('');
                setResetError(null);
                setIsResetModalOpen(true);
              }}
              className="inline-flex items-center px-3 py-2 border border-rose-300 rounded-lg text-sm font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 transition-colors shadow-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
              title="Reset operational business data while preserving menu and accounts"
            >
              <Trash2 className="w-4 h-4 mr-1.5 text-rose-600" />
              <span>Reset Business Data</span>
            </button>
          </div>
        </div>

        {/* Global Success Notification */}
        {successMessage && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start justify-between text-emerald-800 text-sm">
            <div className="flex items-start space-x-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Success: </span>
                {successMessage}
              </div>
            </div>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Global Error Banner */}
        {errorMessage && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl flex items-start space-x-3 text-red-800 text-sm">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Analytics Error: </span>
              {errorMessage}
            </div>
            <button
              onClick={() => setErrorMessage(null)}
              className="text-red-500 hover:text-red-700 text-xs font-semibold"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Analytics Sub-navigation Tabs */}
        <div className="mt-6 flex border-b border-slate-200 space-x-2 sm:space-x-4 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('sales')}
            className={`pb-3 text-sm font-semibold px-2 border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'sales'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            <span>Sales & Orders</span>
          </button>

          <button
            onClick={() => setActiveTab('menu')}
            className={`pb-3 text-sm font-semibold px-2 border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'menu'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <Utensils className="w-4 h-4" />
            <span>Menu Performance</span>
          </button>

          <button
            onClick={() => setActiveTab('kitchen')}
            className={`pb-3 text-sm font-semibold px-2 border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'kitchen'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>Kitchen Turnaround</span>
          </button>

          <button
            onClick={() => setActiveTab('inventory')}
            className={`pb-3 text-sm font-semibold px-2 border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'inventory'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Inventory & Wastage</span>
          </button>

          <button
            onClick={() => setActiveTab('closing')}
            className={`pb-3 text-sm font-semibold px-2 border-b-2 flex items-center space-x-2 whitespace-nowrap transition-colors ${
              activeTab === 'closing'
                ? 'border-orange-600 text-orange-600'
                : 'border-transparent text-slate-500 hover:text-slate-850'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Daily Closing Register</span>
          </button>
        </div>

        {/* Date Filter Controls Card */}
        <div className="mt-6 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          {activeTab !== 'closing' ? (
            <>
              {/* Presets */}
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider mr-1">
                  Preset:
                </span>
                <button
                  type="button"
                  onClick={() => applyDatePreset('today')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    datePreset === 'today'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('7days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    datePreset === '7days'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Last 7 Days
                </button>
                <button
                  type="button"
                  onClick={() => applyDatePreset('30days')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    datePreset === '30days'
                      ? 'bg-orange-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Last 30 Days
                </button>
              </div>

              {/* Exact Dates */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center space-x-2">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium">From:</span>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-500 font-medium">To:</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDatePreset('custom');
                    }}
                    className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fetchAnalyticsData()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Apply Filter
                </button>
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between w-full flex-wrap gap-3">
              <div className="flex items-center space-x-3">
                <Calendar className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-semibold text-slate-600">Register Audit Date:</span>
                <input
                  type="date"
                  value={closingDate}
                  onChange={(e) => setClosingDate(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => fetchAnalyticsData()}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Load Date Register
                </button>
              </div>
              <div className="text-xs text-slate-500 italic">
                Closing snapshots are calculated idempotently on demand across all operational records.
              </div>
            </div>
          )}
        </div>

        {/* Content Section: 1. Sales & Orders */}
        {activeTab === 'sales' && salesSummary && (
          <div className="mt-6 space-y-6">
            {/* KPI Metric Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Gross Recorded Value */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Gross Ticket Value
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-bold text-slate-900">
                    ₹{formatRupees(salesSummary.grossSalesPaise)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Gross total of all {salesSummary.totalOrders} tickets placed
                </p>
              </div>

              {/* Net Completed Sales */}
              <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/30">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                    Fulfilled Sales (Net)
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-bold text-emerald-800">
                    ₹{formatRupees(salesSummary.completedSalesPaise)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-700 font-medium">
                  Revenue from {salesSummary.completedOrders} completed tickets
                </p>
              </div>

              {/* Cancelled Forfeited Value */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Cancelled Impact
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <XCircle className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-bold text-rose-600">
                    ₹{formatRupees(salesSummary.cancelledSalesPaise)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {salesSummary.cancelledOrders} cancelled ticket(s) excluded from net
                </p>
              </div>

              {/* Average Order Value (AOV) */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Avg Order Value (AOV)
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <ShoppingBag className="w-4 h-4" />
                  </div>
                </div>
                <div className="mt-3">
                  <span className="text-2xl font-bold text-slate-900">
                    ₹{formatRupees(salesSummary.averageOrderValuePaise)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Calculated strictly on completed orders
                </p>
              </div>
            </div>

            {/* Order Volume Status Breakdown Card */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-orange-600" />
                <span>Ticket Volume & Status Allocation</span>
              </h2>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-medium text-slate-500">Total Placed</span>
                  <p className="text-xl font-bold text-slate-900 mt-1">{salesSummary.totalOrders}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-xs font-medium text-emerald-700">Completed</span>
                  <p className="text-xl font-bold text-emerald-700 mt-1">{salesSummary.completedOrders}</p>
                </div>
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-xs font-medium text-amber-700">Currently Active</span>
                  <p className="text-xl font-bold text-amber-700 mt-1">{salesSummary.activeOrders}</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <span className="text-xs font-medium text-rose-700">Cancelled</span>
                  <p className="text-xl font-bold text-rose-700 mt-1">{salesSummary.cancelledOrders}</p>
                </div>
              </div>
            </div>

            {/* Daily Trends Visualization & Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Daily Sales Trends</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Breakdown of tickets placed, completed, and fulfilled sales revenue per calendar day.
                  </p>
                </div>
              </div>

              {salesSummary.dailyTrends.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No orders recorded during this date range.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left">Date</th>
                        <th scope="col" className="px-6 py-3 text-right">Orders Placed</th>
                        <th scope="col" className="px-6 py-3 text-right">Completed</th>
                        <th scope="col" className="px-6 py-3 text-right">Cancelled</th>
                        <th scope="col" className="px-6 py-3 text-right">Gross Value</th>
                        <th scope="col" className="px-6 py-3 text-right">Completed Sales</th>
                        <th scope="col" className="px-6 py-3 text-right">AOV</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {salesSummary.dailyTrends.map((d) => {
                        const aovPaise =
                          d.completedOrders > 0
                            ? Math.round(d.completedSalesPaise / d.completedOrders)
                            : 0;

                        return (
                          <tr key={d.date} className="hover:bg-slate-50 transition-colors">
                            <td className="px-6 py-3.5 font-medium text-slate-900 whitespace-nowrap">
                              {d.date}
                            </td>
                            <td className="px-6 py-3.5 text-right font-medium text-slate-700">
                              {d.totalOrders}
                            </td>
                            <td className="px-6 py-3.5 text-right font-semibold text-emerald-600">
                              {d.completedOrders}
                            </td>
                            <td className="px-6 py-3.5 text-right text-rose-600">
                              {d.cancelledOrders}
                            </td>
                            <td className="px-6 py-3.5 text-right text-slate-500">
                              ₹{formatRupees(d.grossSalesPaise)}
                            </td>
                            <td className="px-6 py-3.5 text-right font-bold text-emerald-700">
                              ₹{formatRupees(d.completedSalesPaise)}
                            </td>
                            <td className="px-6 py-3.5 text-right font-medium text-slate-800">
                              ₹{formatRupees(aovPaise)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content Section: 2. Menu Performance */}
        {activeTab === 'menu' && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Menu Item Performance & Ranking</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ordered vs fulfilled quantities, item cancellation rate, and net fulfilled revenue.
                </p>
              </div>
            </div>

            {menuPerformance.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">
                No menu item sales recorded in this period.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left">Item Name</th>
                      <th scope="col" className="px-6 py-3 text-left">Category</th>
                      <th scope="col" className="px-6 py-3 text-right">Qty Ordered</th>
                      <th scope="col" className="px-6 py-3 text-right">Qty Fulfilled</th>
                      <th scope="col" className="px-6 py-3 text-right">Qty Cancelled</th>
                      <th scope="col" className="px-6 py-3 text-right">Cancellation Rate</th>
                      <th scope="col" className="px-6 py-3 text-right">Fulfilled Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {menuPerformance.map((item, idx) => (
                      <tr key={item.menuItemId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-slate-900">
                          <div className="flex items-center space-x-2">
                            <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 text-xs font-semibold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span>{item.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3.5 text-slate-500">{item.categoryName}</td>
                        <td className="px-6 py-3.5 text-right font-medium text-slate-700">
                          {item.quantityOrdered}
                        </td>
                        <td className="px-6 py-3.5 text-right font-semibold text-emerald-600">
                          {item.quantityFulfilled}
                        </td>
                        <td className="px-6 py-3.5 text-right text-rose-600">
                          {item.quantityCancelled}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              item.cancellationRatePercent > 20
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.cancellationRatePercent}%
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-slate-900">
                          ₹{formatRupees(item.totalRevenuePaise)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Content Section: 3. Kitchen Performance */}
        {activeTab === 'kitchen' && kitchenPerformance && (
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Orders Prepared
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  {kitchenPerformance.totalPreparedOrders}
                </p>
                <p className="text-xs text-slate-500 mt-1">Orders marked prepared in period</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Avg Actual Prep Time
                </span>
                <p className="text-2xl font-bold text-orange-600 mt-2">
                  {kitchenPerformance.averageActualPrepMinutes} mins
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Vs estimated {kitchenPerformance.averageEstimatedPrepMinutes} mins
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  On-Time Fulfillment
                </span>
                <p className="text-2xl font-bold text-emerald-700 mt-2">
                  {kitchenPerformance.onTimePercentage}%
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  {kitchenPerformance.onTimeOrdersCount} orders prepared on or before target
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Delayed Orders
                </span>
                <p className="text-2xl font-bold text-rose-600 mt-2">
                  {kitchenPerformance.delayedOrdersCount}
                </p>
                <p className="text-xs text-rose-500 mt-1">
                  Avg delay: {kitchenPerformance.averageDelayMinutes} mins
                </p>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-600" />
                <span>Kitchen Speed & Timing Rules</span>
              </h2>
              <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
                <li>Preparation duration is computed as <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">preparedAt - preparationStartedAt</code>.</li>
                <li>Estimated completion includes any active preparation time extensions (+5m / +10m) granted by kitchen staff.</li>
                <li>Corrupted or missing timestamps are excluded from average durations to maintain audit reliability.</li>
              </ul>
            </div>
          </div>
        )}

        {/* Content Section: 4. Inventory & Movements */}
        {activeTab === 'inventory' && inventoryReport && (
          <div className="mt-6 space-y-6">
            {/* Threshold Counts */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Healthy Stock Items
                </span>
                <p className="text-2xl font-bold text-emerald-700 mt-2">
                  {inventoryReport.currentHealthyStockCount}
                </p>
                <p className="text-xs text-emerald-600 mt-1">Above warning thresholds</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-amber-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
                  Low Stock Warnings
                </span>
                <p className="text-2xl font-bold text-amber-600 mt-2">
                  {inventoryReport.currentLowStockCount}
                </p>
                <p className="text-xs text-amber-600 mt-1">At or below configured threshold</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-rose-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">
                  Out of Stock
                </span>
                <p className="text-2xl font-bold text-rose-600 mt-2">
                  {inventoryReport.currentOutOfStockCount}
                </p>
                <p className="text-xs text-rose-500 mt-1">Zero quantity remaining</p>
              </div>
            </div>

            {/* Movement Ledger Totals */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-4">Stock Ledger Movements in Period</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200">
                  <span className="text-xs font-medium text-blue-700">Restocked Units</span>
                  <p className="text-xl font-bold text-blue-800 mt-1">+{inventoryReport.totalRestockedUnits}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-xs font-medium text-slate-600">Deducted for Orders</span>
                  <p className="text-xl font-bold text-slate-800 mt-1">-{inventoryReport.totalDeductedUnits}</p>
                </div>
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200">
                  <span className="text-xs font-medium text-rose-700">Recorded Wastage / Spoilage</span>
                  <p className="text-xl font-bold text-rose-800 mt-1">-{inventoryReport.totalWastedUnits}</p>
                </div>
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                  <span className="text-xs font-medium text-emerald-700">Cancellation Restorations</span>
                  <p className="text-xl font-bold text-emerald-800 mt-1">+{inventoryReport.totalRestoredUnits}</p>
                </div>
              </div>
            </div>

            {/* Per-Item Summary Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-base font-bold text-slate-900">Per-Item Movement Summary</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold text-slate-600 uppercase">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left">Stock Item</th>
                      <th scope="col" className="px-6 py-3 text-right">Current On-Hand</th>
                      <th scope="col" className="px-6 py-3 text-right">Restocked</th>
                      <th scope="col" className="px-6 py-3 text-right">Deducted</th>
                      <th scope="col" className="px-6 py-3 text-right">Wasted</th>
                      <th scope="col" className="px-6 py-3 text-right">Restored</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {inventoryReport.itemSummaries.map((s) => (
                      <tr key={s.stockItemId} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3.5 font-medium text-slate-900">
                          {s.name} <span className="text-xs text-slate-400 font-normal">({s.unit})</span>
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-slate-900">
                          {s.currentQuantity}
                        </td>
                        <td className="px-6 py-3.5 text-right text-blue-600 font-medium">
                          +{s.restockedUnits}
                        </td>
                        <td className="px-6 py-3.5 text-right text-slate-600">
                          -{s.deductedUnits}
                        </td>
                        <td className="px-6 py-3.5 text-right text-rose-600 font-medium">
                          {s.wastedUnits > 0 ? `-${s.wastedUnits}` : '0'}
                        </td>
                        <td className="px-6 py-3.5 text-right text-emerald-600 font-medium">
                          +{s.restoredUnits}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Content Section: 5. Daily Closing Register */}
        {activeTab === 'closing' && dailyClosing && (
          <div className="mt-6 space-y-6">
            {/* Header Card with Date & Timezone */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  Register Closing Summary: {dailyClosing.reportDate}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Audited register report for timezone: <span className="font-semibold">{dailyClosing.timezone}</span> (Generated: {new Date(dailyClosing.generatedAt).toLocaleTimeString()})
                </p>
              </div>
              <div className="p-2.5 bg-orange-50 rounded-xl text-orange-800 text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto">
                <CheckCircle2 className="w-4 h-4 text-orange-600" />
                <span>Idempotent Calculation</span>
              </div>
            </div>

            {/* Financial Reconciliation Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Gross Recorded Value
                </span>
                <p className="text-2xl font-bold text-slate-900 mt-2">
                  ₹{formatRupees(dailyClosing.financials.grossRecordedPaise)}
                </p>
                <p className="text-xs text-slate-500 mt-1">Across all tickets placed</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-emerald-200 shadow-sm bg-gradient-to-br from-white to-emerald-50/20">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                  Net Completed Revenue
                </span>
                <p className="text-2xl font-bold text-emerald-800 mt-2">
                  ₹{formatRupees(dailyClosing.financials.completedSalesPaise)}
                </p>
                <p className="text-xs text-emerald-700 mt-1 font-medium">
                  {dailyClosing.orders.completed} completed dining orders
                </p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Cancelled Tickets Impact
                </span>
                <p className="text-2xl font-bold text-rose-600 mt-2">
                  ₹{formatRupees(dailyClosing.financials.cancelledSalesPaise)}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {dailyClosing.orders.cancelled} cancelled tickets deducted
                </p>
              </div>
            </div>

            {/* Cancelled Order Treatment Policy Note */}
            <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-start gap-2">
              <FileSpreadsheet className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-semibold">Closing Financial Policy: </span>
                {dailyClosing.financials.cancelledOrderTreatment}
              </div>
            </div>

            {/* Top Selling Items on this Day */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Utensils className="w-4 h-4 text-orange-600" />
                <span>Top Selling Menu Items</span>
              </h3>
              {dailyClosing.topSellingItems.length === 0 ? (
                <p className="text-xs text-slate-500">No fulfilled food items on this date.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {dailyClosing.topSellingItems.map((item, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between">
                      <div>
                        <p className="text-xs font-bold text-slate-900">{item.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{item.quantityFulfilled} portions served</p>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">₹{formatRupees(item.totalRevenuePaise)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Restock & Wastage Audit Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Restock Log */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  <span>Restocks Logged ({dailyClosing.inventory.restockedUnits} units)</span>
                </h3>
                {dailyClosing.inventory.restockNotes.length === 0 ? (
                  <p className="text-xs text-slate-500">No restocks logged on this date.</p>
                ) : (
                  <ul className="text-xs divide-y divide-slate-100">
                    {dailyClosing.inventory.restockNotes.map((r, i) => (
                      <li key={i} className="py-2 flex justify-between items-center">
                        <div>
                          <span className="font-semibold text-slate-800">{r.stockItemName}</span>
                          {r.note && <p className="text-slate-500 text-[11px]">{r.note}</p>}
                        </div>
                        <span className="font-bold text-blue-600">+{r.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Spoilage / Wastage Log */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900 mb-2 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Wastage & Spoilage Logged ({dailyClosing.inventory.wastedUnits} units)</span>
                </h3>
                {dailyClosing.inventory.wasteNotes.length === 0 ? (
                  <p className="text-xs text-slate-500">No wastage logged on this date.</p>
                ) : (
                  <ul className="text-xs divide-y divide-slate-100">
                    {dailyClosing.inventory.wasteNotes.map((w, i) => (
                      <li key={i} className="py-2 flex justify-between items-center">
                        <div>
                          <span className="font-semibold text-slate-800">{w.stockItemName}</span>
                          <p className="text-rose-600 text-[11px]">{w.reason}</p>
                        </div>
                        <span className="font-bold text-rose-600">-{w.quantity}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}
        {/* Business Data Reset Confirmation Modal */}
        <Modal
          isOpen={isResetModalOpen}
          onClose={() => {
            if (!isResetting) {
              setIsResetModalOpen(false);
            }
          }}
          title="Reset Operational Business Data"
        >
          <div className="space-y-4">
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2">
              <div className="flex items-center space-x-2 font-bold text-rose-700 text-sm">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>Warning: Irreversible Action</span>
              </div>
              <p>This action will permanently erase operational and business activity data.</p>
              <div className="mt-2 space-y-1">
                <p className="font-semibold text-rose-800">What will be ERASED:</p>
                <ul className="list-disc list-inside space-y-0.5 text-rose-700">
                  <li>Historical sales and revenue records</li>
                  <li>Completed and in-progress orders & line items</li>
                  <li>Kitchen turnaround metrics & prep adjustments</li>
                  <li>Order-linked inventory deductions & sequence numbers</li>
                </ul>
              </div>
              <div className="mt-2 space-y-1">
                <p className="font-semibold text-emerald-800">What will be PRESERVED:</p>
                <ul className="list-disc list-inside space-y-0.5 text-emerald-700">
                  <li>All menu categories and items (prices, names, prep times)</li>
                  <li>Administrator and staff user accounts</li>
                  <li>Stock item catalog definitions</li>
                  <li>Security audit logs (logging this reset operation)</li>
                </ul>
              </div>
            </div>

            {resetError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                <span>{resetError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Type <span className="font-mono font-bold text-rose-600">RESET BUSINESS DATA</span> below to confirm:
              </label>
              <input
                id="reset-business-data-confirmation-input"
                type="text"
                value={resetConfirmationInput}
                onChange={(e) => setResetConfirmationInput(e.target.value)}
                placeholder="RESET BUSINESS DATA"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none font-mono"
                disabled={isResetting}
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                id="confirm-reset-business-data-btn"
                type="button"
                onClick={handleResetBusinessData}
                disabled={resetConfirmationInput !== 'RESET BUSINESS DATA' || isResetting}
                className="inline-flex items-center px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm transition-colors"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    <span>Resetting Data...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    <span>Confirm Business Data Reset</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </Modal>
      </main>
    </div>
  );
};

export default AdminAnalyticsPage;
