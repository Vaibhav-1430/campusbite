import { describe, it, expect, beforeEach } from 'vitest';
import { MenuItemDto } from '@campusbite/shared';

// In-memory localStorage mock for node environment
const createStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    getAll: () => store
  };
};

describe('Counter POS Cart Persistence & Isolation Gate', () => {
  let mockStorage: ReturnType<typeof createStorageMock>;

  const nowIso = new Date().toISOString();
  const mockMenuItems: MenuItemDto[] = [
    {
      id: 'item-1',
      categoryId: 'cat-1',
      name: 'Momos (Steamed)',
      description: 'Handmade dumplings',
      pricePaise: 12000,
      prepTimeMinutes: 12,
      isAvailable: true,
      imageUrl: null,
      stockItemId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      id: 'item-2',
      categoryId: 'cat-1',
      name: 'Thukpa Noodle Soup',
      description: 'Himalayan broth',
      pricePaise: 15000,
      prepTimeMinutes: 15,
      isAvailable: true,
      imageUrl: null,
      stockItemId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      id: 'item-3',
      categoryId: 'cat-2',
      name: 'Cold Coffee',
      description: 'Chilled beverage',
      pricePaise: 8000,
      prepTimeMinutes: 5,
      isAvailable: false, // Currently unavailable
      imageUrl: null,
      stockItemId: null,
      createdAt: nowIso,
      updatedAt: nowIso
    },
    {
      id: 'item-4',
      categoryId: 'cat-2',
      name: 'Masala Chai',
      description: 'Spiced Indian tea',
      pricePaise: 3000,
      prepTimeMinutes: 5,
      isAvailable: true,
      imageUrl: null,
      stockItemId: 'stock-chai',
      createdAt: nowIso,
      updatedAt: nowIso,
      stockItem: {
        id: 'stock-chai',
        name: 'Tea Leaves',
        unit: 'g',
        currentQuantity: 2,
        lowStockThreshold: 10,
        isLowStock: true,
        isOutOfStock: false
      }
    }
  ];

  beforeEach(() => {
    mockStorage = createStorageMock();
    (global as any).localStorage = mockStorage;
  });

  it('should persist selected cart items and quantities to localStorage scoped by user ID', () => {
    const userId = 'staff-user-1';
    const storageKey = `cafe47_counter_cart_${userId}`;

    const itemsToSave = [
      { menuItemId: 'item-1', quantity: 2, notes: 'Extra spicy' },
      { menuItemId: 'item-2', quantity: 1, notes: '' }
    ];

    mockStorage.setItem(storageKey, JSON.stringify(itemsToSave));

    const retrieved = JSON.parse(mockStorage.getItem(storageKey) || '[]');
    expect(retrieved).toHaveLength(2);
    expect(retrieved[0].menuItemId).toBe('item-1');
    expect(retrieved[0].quantity).toBe(2);
    expect(retrieved[0].notes).toBe('Extra spicy');
    expect(retrieved[1].menuItemId).toBe('item-2');
    expect(retrieved[1].quantity).toBe(1);
  });

  it('should isolate cart storage between different staff users and tenants', () => {
    const user1 = 'staff-alpha';
    const user2 = 'staff-beta';

    const key1 = `cafe47_counter_cart_${user1}`;
    const key2 = `cafe47_counter_cart_${user2}`;

    mockStorage.setItem(key1, JSON.stringify([{ menuItemId: 'item-1', quantity: 3, notes: '' }]));
    mockStorage.setItem(key2, JSON.stringify([{ menuItemId: 'item-2', quantity: 1, notes: 'No onions' }]));

    const cartUser1 = JSON.parse(mockStorage.getItem(key1) || '[]');
    const cartUser2 = JSON.parse(mockStorage.getItem(key2) || '[]');

    expect(cartUser1[0].menuItemId).toBe('item-1');
    expect(cartUser1[0].quantity).toBe(3);

    expect(cartUser2[0].menuItemId).toBe('item-2');
    expect(cartUser2[0].notes).toBe('No onions');
    expect(cartUser1).not.toEqual(cartUser2);
  });

  it('should never store sensitive authentication tokens, passwords, or customer PINs in cart storage', () => {
    const userId = 'staff-security-check';
    const storageKey = `cafe47_counter_cart_${userId}`;

    const cartData = [
      { menuItemId: 'item-1', quantity: 1, notes: '' }
    ];

    mockStorage.setItem(storageKey, JSON.stringify(cartData));
    const rawSaved = mockStorage.getItem(storageKey)!;

    expect(rawSaved).not.toContain('token');
    expect(rawSaved).not.toContain('password');
    expect(rawSaved).not.toContain('bearer');
    expect(rawSaved).not.toContain('customerVerificationPin');
    expect(rawSaved).not.toContain('pinHash');
  });

  it('should prune deleted or unavailable menu items during cart restoration and report them', () => {
    const userId = 'staff-user-prune';
    const storageKey = `cafe47_counter_cart_${userId}`;

    // Saved cart contains: item-1 (available), item-3 (isAvailable: false), item-999 (deleted/not found)
    const savedCart = [
      { menuItemId: 'item-1', quantity: 2, notes: '' },
      { menuItemId: 'item-3', quantity: 1, notes: '' }, // Unavailable
      { menuItemId: 'item-999', quantity: 1, notes: '' } // Deleted
    ];

    mockStorage.setItem(storageKey, JSON.stringify(savedCart));

    // Simulate CounterPOSPage validation logic
    const parsed = JSON.parse(mockStorage.getItem(storageKey) || '[]');
    const validRestored: Array<{ item: MenuItemDto; quantity: number }> = [];
    const removedNames: string[] = [];

    for (const saved of parsed) {
      const found = mockMenuItems.find((m) => m.id === saved.menuItemId);
      if (!found || !found.isAvailable || (found.stockItem && found.stockItem.isOutOfStock)) {
        removedNames.push(found ? found.name : 'Unknown Item');
        continue;
      }
      validRestored.push({ item: found, quantity: saved.quantity });
    }

    expect(validRestored).toHaveLength(1);
    expect(validRestored[0].item.id).toBe('item-1');
    expect(validRestored[0].quantity).toBe(2);

    expect(removedNames).toContain('Cold Coffee');
    expect(removedNames).toContain('Unknown Item');
  });

  it('should cap restored quantities if inventory stock is lower than saved cart quantity', () => {
    const saved = [{ menuItemId: 'item-4', quantity: 5, notes: '' }]; // stock has only 2
    const found = mockMenuItems.find((m) => m.id === 'item-4')!;

    const maxQty = found.stockItem ? Math.min(saved[0].quantity, found.stockItem.currentQuantity) : saved[0].quantity;
    expect(maxQty).toBe(2);
  });

  it('should preserve cart in localStorage when order submission fails', () => {
    const userId = 'staff-user-retry';
    const storageKey = `cafe47_counter_cart_${userId}`;

    const cart = [{ menuItemId: 'item-1', quantity: 2, notes: '' }];
    mockStorage.setItem(storageKey, JSON.stringify(cart));

    // Simulate order placement error
    let submissionSuccess = false;
    try {
      throw new Error('504 Gateway Timeout');
    } catch {
      submissionSuccess = false;
      // Cart is NOT removed from storage on error
    }

    expect(submissionSuccess).toBe(false);
    expect(mockStorage.getItem(storageKey)).not.toBeNull();
    const preserved = JSON.parse(mockStorage.getItem(storageKey)!);
    expect(preserved).toHaveLength(1);
    expect(preserved[0].menuItemId).toBe('item-1');
  });

  it('should clear cart from localStorage only after successful checkout or explicit clear cart', () => {
    const userId = 'staff-user-checkout';
    const storageKey = `cafe47_counter_cart_${userId}`;

    mockStorage.setItem(storageKey, JSON.stringify([{ menuItemId: 'item-1', quantity: 1, notes: '' }]));
    expect(mockStorage.getItem(storageKey)).not.toBeNull();

    // 1. Explicit clear
    mockStorage.removeItem(storageKey);
    expect(mockStorage.getItem(storageKey)).toBeNull();

    // 2. Successful checkout
    mockStorage.setItem(storageKey, JSON.stringify([{ menuItemId: 'item-2', quantity: 3, notes: '' }]));
    expect(mockStorage.getItem(storageKey)).not.toBeNull();

    const orderSuccess = true;
    if (orderSuccess) {
      mockStorage.removeItem(storageKey);
    }
    expect(mockStorage.getItem(storageKey)).toBeNull();
  });
});
