export interface CategoryDto {
  id: string;
  name: string;
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
}

export interface MenuItemDto {
  id: string;
  categoryId: string;
  categoryName?: string;
  name: string;
  description: string | null;
  pricePaise: number;
  prepTimeMinutes: number;
  imageUrl: string | null;
  isAvailable: boolean;
  stockItemId: string | null;
  stockItem?: {
    id: string;
    name: string;
    unit: string;
    currentQuantity: number;
    lowStockThreshold: number;
    isLowStock: boolean;
    isOutOfStock: boolean;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryWithItemsDto extends CategoryDto {
  items: MenuItemDto[];
}
