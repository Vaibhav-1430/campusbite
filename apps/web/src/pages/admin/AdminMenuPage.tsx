import React, { useEffect, useState, useMemo } from 'react';
import {
  CategoryDto,
  MenuItemDto,
  StockItemDto,
  createCategorySchema,
  updateCategorySchema,
  createMenuItemSchema,
  updateMenuItemSchema,
  formatPaise,
  rupeesToPaise,
  paiseToRupees
} from '@campusbite/shared';
import { apiRequest, ApiError } from '../../services/api.js';
import { Navbar } from '../../components/common/Navbar.js';
import { Badge } from '../../components/common/Badge.js';
import { Modal } from '../../components/common/Modal.js';
import { Link } from 'react-router-dom';
import {
  Utensils,
  Layers,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertCircle,
  CheckCircle2,
  Users,
  Eye,
  EyeOff,
  Clock,
  Boxes,
  BarChart3,
  Sparkles
} from 'lucide-react';

export const AdminMenuPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [categories, setCategories] = useState<CategoryDto[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [isInitializingMenu, setIsInitializingMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryDto | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', displayOrder: 0, isActive: true });
  const [categorySubmitting, setCategorySubmitting] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Stock Items State
  const [stockItems, setStockItems] = useState<StockItemDto[]>([]);

  // Menu Item Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItemDto | null>(null);
  const [itemForm, setItemForm] = useState({
    categoryId: '',
    name: '',
    description: '',
    priceRupees: 0,
    prepTimeMinutes: 10,
    imageUrl: '',
    isAvailable: true,
    stockItemId: ''
  });
  const [itemSubmitting, setItemSubmitting] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [catsRes, itemsRes, stockRes] = await Promise.all([
        apiRequest<{ categories: CategoryDto[] }>('/categories?includeInactive=true'),
        apiRequest<{ items: MenuItemDto[] }>('/menu?includeInactiveCategory=true'),
        apiRequest<{ items: StockItemDto[] }>('/inventory')
      ]);
      setCategories(catsRes.categories);
      setMenuItems(itemsRes.items);
      setStockItems(stockRes.items);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.statusCode === 401 || err.code === 'USER_NOT_FOUND') {
          // Handled by unauthorizedHandler which clears session and triggers redirect
          return;
        }
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to load menu data.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const clearMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory =
        selectedCategoryFilter === 'all' || item.categoryId === selectedCategoryFilter;
      const matchesSearch =
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, selectedCategoryFilter, searchQuery]);

  // Handle Category Submit (Add / Edit)
  const handleCategorySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCategoryError(null);

    const schema = editingCategory ? updateCategorySchema : createCategorySchema;
    const validation = schema.safeParse(categoryForm);

    if (!validation.success) {
      setCategoryError(validation.error.errors[0]?.message || 'Invalid category data.');
      return;
    }

    try {
      setCategorySubmitting(true);
      if (editingCategory) {
        const data = await apiRequest<{ category: CategoryDto }>(
          `/categories/${editingCategory.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify(validation.data)
          }
        );
        setCategories(categories.map((c) => (c.id === data.category.id ? data.category : c)));
        setSuccessMessage(`Category "${data.category.name}" updated successfully.`);
      } else {
        const data = await apiRequest<{ category: CategoryDto }>('/categories', {
          method: 'POST',
          body: JSON.stringify(validation.data)
        });
        setCategories([...categories, data.category]);
        setSuccessMessage(`Category "${data.category.name}" created successfully.`);
      }
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      setCategoryForm({ name: '', displayOrder: 0, isActive: true });
    } catch (err) {
      if (err instanceof ApiError) setCategoryError(err.message);
      else setCategoryError('Failed to save category.');
    } finally {
      setCategorySubmitting(false);
    }
  };

  // Handle Delete Category
  const handleDeleteCategory = async (cat: CategoryDto) => {
    clearMessages();
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    try {
      await apiRequest(`/categories/${cat.id}`, { method: 'DELETE' });
      setCategories(categories.filter((c) => c.id !== cat.id));
      setSuccessMessage(`Category "${cat.name}" deleted successfully.`);
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to delete category.');
    }
  };

  // Handle Menu Item Submit (Add / Edit)
  const handleItemSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setItemError(null);

    const pricePaise = rupeesToPaise(Number(itemForm.priceRupees));
    const payload = {
      categoryId: itemForm.categoryId,
      name: itemForm.name,
      description: itemForm.description.trim() ? itemForm.description : null,
      pricePaise,
      prepTimeMinutes: Number(itemForm.prepTimeMinutes),
      imageUrl: itemForm.imageUrl.trim() ? itemForm.imageUrl : null,
      isAvailable: itemForm.isAvailable,
      stockItemId: itemForm.stockItemId ? itemForm.stockItemId : null
    };

    const schema = editingItem ? updateMenuItemSchema : createMenuItemSchema;
    const validation = schema.safeParse(payload);

    if (!validation.success) {
      setItemError(validation.error.errors[0]?.message || 'Invalid menu item data.');
      return;
    }

    try {
      setItemSubmitting(true);
      if (editingItem) {
        const data = await apiRequest<{ item: MenuItemDto }>(`/menu/${editingItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(validation.data)
        });
        setMenuItems(menuItems.map((m) => (m.id === data.item.id ? data.item : m)));
        setSuccessMessage(`Menu item "${data.item.name}" updated successfully.`);
      } else {
        const data = await apiRequest<{ item: MenuItemDto }>('/menu', {
          method: 'POST',
          body: JSON.stringify(validation.data)
        });
        setMenuItems([data.item, ...menuItems]);
        setSuccessMessage(`Menu item "${data.item.name}" created successfully.`);
      }
      setIsItemModalOpen(false);
      setEditingItem(null);
    } catch (err) {
      if (err instanceof ApiError) setItemError(err.message);
      else setItemError('Failed to save menu item.');
    } finally {
      setItemSubmitting(false);
    }
  };

  // Handle Toggle Item Availability
  const handleToggleItemAvailability = async (item: MenuItemDto) => {
    clearMessages();
    const newStatus = !item.isAvailable;

    try {
      const data = await apiRequest<{ item: MenuItemDto }>(`/menu/${item.id}/availability`, {
        method: 'PATCH',
        body: JSON.stringify({ isAvailable: newStatus })
      });
      setMenuItems(menuItems.map((m) => (m.id === data.item.id ? data.item : m)));
      setSuccessMessage(
        `"${data.item.name}" is now ${newStatus ? 'available' : 'unavailable'} for ordering.`
      );
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to update item availability.');
    }
  };

  // Handle Delete Menu Item
  const handleDeleteItem = async (item: MenuItemDto) => {
    clearMessages();
    if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;

    try {
      await apiRequest(`/menu/${item.id}`, { method: 'DELETE' });
      setMenuItems(menuItems.filter((m) => m.id !== item.id));
      setSuccessMessage(`Menu item "${item.name}" deleted successfully.`);
    } catch (err) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to delete menu item.');
    }
  };

  // Handle Initialize Cafe47 Menu
  const handleInitializeCafe47Menu = async () => {
    clearMessages();
    const confirmed = window.confirm(
      'Initialize Cafe47 standard menu with 9 categories and 65 food items?\n\nThis will load the verified Himalayan & fast-food menu items (Noodles, Momos, Burgers, Starters, etc.). Existing items will not be duplicated.'
    );
    if (!confirmed) return;

    try {
      setIsInitializingMenu(true);
      const res = await apiRequest<{
        categoriesCreated: number;
        totalCategories: number;
        itemsCreated: number;
        totalItems: number;
      }>('/menu/initialize-cafe47', { method: 'POST' });

      setSuccessMessage(
        `Cafe47 menu initialized successfully (${res.categoriesCreated || res.totalCategories} categories, ${res.itemsCreated || res.totalItems} food items ready).`
      );
      await fetchData();
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage('Failed to initialize Cafe47 menu.');
      }
    } finally {
      setIsInitializingMenu(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Navigation Tabs (Menu vs Inventory vs Staff) */}
        <div className="flex border-b border-slate-200 space-x-6 mb-6">
          <Link
            to="/admin/menu"
            className="pb-3 text-sm font-semibold text-orange-600 border-b-2 border-orange-600 flex items-center space-x-2"
          >
            <Utensils className="w-4 h-4" />
            <span>Menu & Categories</span>
          </Link>
          <Link
            to="/admin/inventory"
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2"
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
            className="pb-3 text-sm font-medium text-slate-500 hover:text-slate-800 flex items-center space-x-2 whitespace-nowrap"
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics & Reports</span>
          </Link>
        </div>

        {/* Page Actions Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Restaurant Menu Management
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Configure food offerings, categories, integer prices, preparation times, and real-time availability.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            {activeTab === 'items' ? (
              <button
                onClick={() => {
                  setItemError(null);
                  setEditingItem(null);
                  setItemForm({
                    categoryId: categories[0]?.id || '',
                    name: '',
                    description: '',
                    priceRupees: 60,
                    prepTimeMinutes: 10,
                    imageUrl: '',
                    isAvailable: true,
                    stockItemId: ''
                  });
                  setIsItemModalOpen(true);
                }}
                disabled={categories.length === 0}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors disabled:opacity-50"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Food Item
              </button>
            ) : (
              <button
                onClick={() => {
                  setCategoryError(null);
                  setEditingCategory(null);
                  setCategoryForm({ name: '', displayOrder: categories.length + 1, isActive: true });
                  setIsCategoryModalOpen(true);
                }}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Add Category
              </button>
            )}

            {categories.length === 0 && (
              <button
                onClick={handleInitializeCafe47Menu}
                disabled={isInitializingMenu}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-sm font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 shadow-sm transition-colors disabled:opacity-60"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                {isInitializingMenu ? 'Initializing...' : 'Initialize Cafe47 Menu'}
              </button>
            )}
          </div>
        </div>

        {/* Global Notifications */}
        {errorMessage && (
          <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-700 text-xs font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700 text-xs font-semibold">
              Dismiss
            </button>
          </div>
        )}

        {/* Inner View Switcher (Items vs Categories) */}
        <div className="flex space-x-2 p-1 bg-slate-200/70 rounded-lg max-w-xs mb-6">
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'items'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Menu Items ({menuItems.length})
          </button>
          <button
            onClick={() => setActiveTab('categories')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              activeTab === 'categories'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Categories ({categories.length})
          </button>
        </div>

        {/* TAB 1: MENU ITEMS */}
        {activeTab === 'items' && (
          <div className="space-y-4">
            {/* Search & Category Filter Row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search food by name or description..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
                />
              </div>

              <select
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
              >
                <option value="all">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Menu Items Table / Cards */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-12 text-center">
                  <div className="w-8 h-8 border-3 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="mt-3 text-sm text-slate-500">Loading menu offerings...</p>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-12 text-center max-w-lg mx-auto">
                  <Utensils className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="mt-3 text-base font-semibold text-slate-900">No menu items found</p>
                  <p className="text-xs text-slate-500 mt-1">
                    {categories.length === 0
                      ? 'The menu database is currently empty. Initialize the standard Cafe47 menu or add your first category.'
                      : 'Click "Add Food Item" to create offerings or adjust your search filter.'}
                  </p>
                  {categories.length === 0 && (
                    <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                      <button
                        onClick={() => {
                          setCategoryError(null);
                          setEditingCategory(null);
                          setCategoryForm({ name: '', displayOrder: 1, isActive: true });
                          setIsCategoryModalOpen(true);
                        }}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                      >
                        <Plus className="w-4 h-4 mr-1.5 text-slate-500" />
                        Add First Category
                      </button>
                      <button
                        onClick={handleInitializeCafe47Menu}
                        disabled={isInitializingMenu}
                        className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors disabled:opacity-60"
                      >
                        <Sparkles className="w-4 h-4 mr-1.5" />
                        {isInitializingMenu ? 'Initializing...' : 'Initialize Cafe47 Menu (65 Items)'}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th scope="col" className="px-6 py-3.5">Food Item</th>
                        <th scope="col" className="px-6 py-3.5">Category</th>
                        <th scope="col" className="px-6 py-3.5">Price</th>
                        <th scope="col" className="px-6 py-3.5">Prep Time</th>
                        <th scope="col" className="px-6 py-3.5">Availability</th>
                        <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/75 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{item.name}</div>
                            {item.description && (
                              <div className="text-xs text-slate-500 max-w-xs truncate">
                                {item.description}
                              </div>
                            )}
                            {item.stockItem ? (
                              <div className="mt-1 flex items-center space-x-1.5 text-xs">
                                <Boxes className="w-3.5 h-3.5 text-slate-400" />
                                <span className="text-slate-600 font-medium">
                                  {item.stockItem.name}:
                                </span>
                                {item.stockItem.isOutOfStock ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                                    0 {item.stockItem.unit} (Out of Stock)
                                  </span>
                                ) : item.stockItem.isLowStock ? (
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                                    {item.stockItem.currentQuantity} {item.stockItem.unit} (Low Stock)
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                    {item.stockItem.currentQuantity} {item.stockItem.unit}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <div className="mt-1 text-[11px] text-slate-400">
                                Unmonitored (No inventory linkage)
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-medium px-2 py-1 bg-slate-100 rounded text-slate-700">
                              {item.categoryName || 'Uncategorized'}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            {formatPaise(item.pricePaise)}
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">
                            <div className="flex items-center space-x-1">
                              <Clock className="w-3.5 h-3.5 text-slate-400" />
                              <span>{item.prepTimeMinutes} mins</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              onClick={() => handleToggleItemAvailability(item)}
                              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                item.isAvailable
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                              }`}
                              title="Click to toggle availability"
                            >
                              {item.isAvailable ? (
                                <>
                                  <Eye className="w-3 h-3 mr-1" /> Available
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3 h-3 mr-1" /> Unavailable
                                </>
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right space-x-2">
                            <button
                              onClick={() => {
                                setEditingItem(item);
                                setItemError(null);
                                setItemForm({
                                  categoryId: item.categoryId,
                                  name: item.name,
                                  description: item.description || '',
                                  priceRupees: paiseToRupees(item.pricePaise),
                                  prepTimeMinutes: item.prepTimeMinutes,
                                  imageUrl: item.imageUrl || '',
                                  isAvailable: item.isAvailable,
                                  stockItemId: item.stockItemId || ''
                                });
                                setIsItemModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                              title="Edit Item"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                              title="Delete Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {categories.length === 0 ? (
              <div className="p-12 text-center max-w-lg mx-auto">
                <Layers className="w-12 h-12 text-slate-300 mx-auto" />
                <p className="mt-3 text-base font-semibold text-slate-900">No categories found</p>
                <p className="text-xs text-slate-500 mt-1">
                  Click "Add Category" to create your own food groups, or initialize the verified Cafe47 Himalayan menu structure.
                </p>
                <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      setCategoryError(null);
                      setEditingCategory(null);
                      setCategoryForm({ name: '', displayOrder: 1, isActive: true });
                      setIsCategoryModalOpen(true);
                    }}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors"
                  >
                    <Plus className="w-4 h-4 mr-1.5 text-slate-500" />
                    Add Category
                  </button>
                  <button
                    onClick={handleInitializeCafe47Menu}
                    disabled={isInitializingMenu}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-semibold text-white bg-orange-600 hover:bg-orange-700 shadow-sm transition-colors disabled:opacity-60"
                  >
                    <Sparkles className="w-4 h-4 mr-1.5" />
                    {isInitializingMenu ? 'Initializing...' : 'Initialize Cafe47 Menu (65 Items)'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 font-semibold">
                    <tr>
                      <th scope="col" className="px-6 py-3.5">Category Name</th>
                      <th scope="col" className="px-6 py-3.5">Display Order</th>
                      <th scope="col" className="px-6 py-3.5">Linked Items</th>
                      <th scope="col" className="px-6 py-3.5">Status</th>
                      <th scope="col" className="px-6 py-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.map((cat) => (
                      <tr key={cat.id} className="hover:bg-slate-50/75 transition-colors">
                        <td className="px-6 py-4 font-semibold text-slate-900">{cat.name}</td>
                        <td className="px-6 py-4 text-slate-600">#{cat.displayOrder}</td>
                        <td className="px-6 py-4 text-xs text-slate-500">
                          {cat.itemCount || 0} item(s)
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={cat.isActive ? 'success' : 'neutral'}>
                            {cat.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => {
                              setEditingCategory(cat);
                              setCategoryError(null);
                              setCategoryForm({
                                name: cat.name,
                                displayOrder: cat.displayOrder,
                                isActive: cat.isActive
                              });
                              setIsCategoryModalOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100"
                            title="Edit Category"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1.5 rounded-lg text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                            title="Delete Category"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal: Category Add / Edit */}
      <Modal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title={editingCategory ? `Edit Category: ${editingCategory.name}` : 'Add Menu Category'}
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4">
          {categoryError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{categoryError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">Category Name</label>
            <input
              type="text"
              required
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              placeholder="e.g. Beverages, Sandwiches, Desserts"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Display Order</label>
            <input
              type="number"
              value={categoryForm.displayOrder}
              onChange={(e) =>
                setCategoryForm({ ...categoryForm, displayOrder: parseInt(e.target.value, 10) || 0 })
              }
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="categoryActive"
              checked={categoryForm.isActive}
              onChange={(e) => setCategoryForm({ ...categoryForm, isActive: e.target.checked })}
              className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
            />
            <label htmlFor="categoryActive" className="text-sm text-slate-700">
              Active Category (visible on counter menu)
            </label>
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={categorySubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {categorySubmitting ? 'Saving...' : 'Save Category'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal: Menu Item Add / Edit */}
      <Modal
        isOpen={isItemModalOpen}
        onClose={() => setIsItemModalOpen(false)}
        title={editingItem ? `Edit Item: ${editingItem.name}` : 'Add Food Item'}
      >
        <form onSubmit={handleItemSubmit} className="space-y-4">
          {itemError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{itemError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700">Category</label>
            <select
              required
              value={itemForm.categoryId}
              onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
            >
              <option value="">Select a Category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Food Item Name</label>
            <input
              type="text"
              required
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              placeholder="e.g. Veg Grilled Sandwich"
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700">Price in Rupees (₹)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                required
                value={itemForm.priceRupees}
                onChange={(e) =>
                  setItemForm({ ...itemForm, priceRupees: parseFloat(e.target.value) || 0 })
                }
                className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Stored as {rupeesToPaise(Number(itemForm.priceRupees))} paise.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Prep Time (Minutes)</label>
              <input
                type="number"
                min="1"
                max="180"
                required
                value={itemForm.prepTimeMinutes}
                onChange={(e) =>
                  setItemForm({ ...itemForm, prepTimeMinutes: parseInt(e.target.value, 10) || 10 })
                }
                className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Description (Optional)</label>
            <textarea
              rows={2}
              value={itemForm.description}
              onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              placeholder="Ingredients, toppings, or dietary details..."
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-orange-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">
              Linked Inventory Stock Item (Optional)
            </label>
            <select
              value={itemForm.stockItemId}
              onChange={(e) => setItemForm({ ...itemForm, stockItemId: e.target.value })}
              className="mt-1 block w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white focus:ring-2 focus:ring-orange-600 focus:outline-none"
            >
              <option value="">No stock tracking (Unmonitored)</option>
              {stockItems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.currentQuantity} {s.unit} in stock)
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">
              When linked, customer orders will automatically deduct stock and reject orders when depleted.
            </p>
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <input
              type="checkbox"
              id="itemAvailable"
              checked={itemForm.isAvailable}
              onChange={(e) => setItemForm({ ...itemForm, isAvailable: e.target.checked })}
              className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500"
            />
            <label htmlFor="itemAvailable" className="text-sm text-slate-700">
              Available for Ordering immediately
            </label>
          </div>

          <div className="pt-2 flex justify-end space-x-3">
            <button
              type="button"
              onClick={() => setIsItemModalOpen(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={itemSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg shadow-sm transition-colors disabled:opacity-60"
            >
              {itemSubmitting ? 'Saving...' : 'Save Item'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
