export interface Cafe47MenuItemDef {
  name: string;
  priceINR: number;
  prepTimeMinutes: number;
  dietary: 'Veg' | 'Non-Veg' | 'Egg' | 'Beverage';
  description?: string;
  flaggedForReview?: string;
}

export interface Cafe47CategoryDef {
  name: string;
  displayOrder: number;
  items: Cafe47MenuItemDef[];
}

export const CAFE47_MENU_DATA: Cafe47CategoryDef[] = [
  {
    name: 'Noodles',
    displayOrder: 1,
    items: [
      { name: 'Veg Noodles', priceINR: 100, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Wok-tossed noodles with garden vegetables and aromatic spices' },
      { name: 'Chilli Garlic Noodles', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Spicy noodles tossed with roasted garlic, fresh chilies, and scallions' },
      { name: 'Schezwan Noodles', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Fiery stir-fried noodles coated in tangy Schezwan pepper sauce' },
      { name: 'Singapuri Noodles', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Yellow curry-infused thin noodles tossed with crispy vegetables' },
      { name: 'Hakka Noodles', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Traditional Hakka-style noodles tossed on high heat with crisp shredded veggies' },
      { name: 'Egg Noodles', priceINR: 120, prepTimeMinutes: 10, dietary: 'Egg', description: '[Egg] Savory noodles tossed with scrambled eggs and garden vegetables' },
      { name: 'Chicken Noodles', priceINR: 120, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Classic stir-fried noodles tossed with seasoned chicken strips' },
      { name: 'Chicken Chilli Noodles', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Spicy wok noodles tossed with diced chicken and green chilies' },
      { name: 'Chicken Schezwan Noodles', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Tender chicken pieces and noodles coated in house Schezwan sauce' },
      { name: 'Chicken Hakka Noodles', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Indo-Chinese Hakka noodles with juicy sliced chicken' },
      { name: 'Chicken Egg Noodles', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Combined chicken chunks and scrambled egg tossed with noodles' }
    ]
  },
  {
    name: 'Fried Rice',
    displayOrder: 2,
    items: [
      { name: 'Veg Fried Rice', priceINR: 100, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Fragrant basmati rice stir-fried with diced vegetables and spring onion' },
      { name: 'Veg Schezwan Rice', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Spicy wok-tossed fried rice infused with red chili Schezwan paste' },
      { name: 'Veg Chilli Garlic Rice', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Aromatic fried rice seasoned with burnt garlic and fresh chilies' },
      { name: 'Paneer Fried Rice', priceINR: 120, prepTimeMinutes: 12, dietary: 'Veg', description: '[Veg] Fried rice loaded with golden spiced paneer cubes and veggies' },
      { name: 'Egg Fried Rice', priceINR: 120, prepTimeMinutes: 10, dietary: 'Egg', description: '[Egg] Classic fried rice tossed with fluffy scrambled egg and mild soy' },
      { name: 'Chicken Fried Rice', priceINR: 120, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Wok-fried rice with tender diced chicken breast and scallions' },
      { name: 'Chicken Garlic Chilli Fried Rice', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Robust chicken fried rice with toasted garlic and chopped chilies' },
      { name: 'Chicken Schezwan Rice', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Zesty chicken fried rice tossed in spicy Sichuan pepper glaze' },
      { name: 'Chicken Egg Fried Rice', priceINR: 130, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] High-protein duo of chicken pieces and scrambled egg in fried rice' }
    ]
  },
  {
    name: 'Momos',
    displayOrder: 3,
    items: [
      { name: 'Veg Steamed Momo', priceINR: 80, prepTimeMinutes: 8, dietary: 'Veg', description: '[Veg] Steamed Himalayan dumplings stuffed with seasoned finely grated cabbage and carrots' },
      { name: 'Veg Fried Momo', priceINR: 80, prepTimeMinutes: 8, dietary: 'Veg', description: '[Veg] Golden crisp fried dumplings served with spicy tomato chili dip' },
      { name: 'Dragon Chilli Garlic Momo', priceINR: 130, prepTimeMinutes: 12, dietary: 'Veg', description: '[Veg] Crispy veg momos tossed in sizzling dragon chili garlic sauce' },
      { name: 'Veg Afgani Momo', priceINR: 130, prepTimeMinutes: 12, dietary: 'Veg', description: '[Veg] Steamed dumplings smothered in rich, creamy spiced Afghani marinade' },
      { name: 'Veg Jhol Momo', priceINR: 130, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Authentic Kathmandu-style momos immersed in tangy sesame-peanut broth' },
      { name: 'Darjeeling Chicken Momo', priceINR: 100, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Traditional Darjeeling juicy steamed chicken dumplings with fiery red chutney' },
      { name: 'Darjeeling Chicken Momo Fried', priceINR: 100, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Deep-fried Darjeeling chicken dumplings with crispy outer skin' },
      { name: 'Dragon Chilli Chicken Momo', priceINR: 150, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Crunchy chicken momos wok-tossed in pungent spicy dragon sauce' },
      { name: 'Chicken Afgani Momo', priceINR: 150, prepTimeMinutes: 12, dietary: 'Non-Veg', description: '[Non-Veg] Chicken dumplings coated in velvety cashew-cream Afghani dressing' },
      { name: 'Chicken Jhol Momo', priceINR: 150, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Himalayan chicken momos served floating in signature spiced jhol soup' }
    ]
  },
  {
    name: 'Burgers',
    displayOrder: 4,
    items: [
      { name: 'Veg Burger', priceINR: 80, prepTimeMinutes: 8, dietary: 'Veg', description: '[Veg] Spiced potato and vegetable patty with crisp lettuce, tomato, and house mayo' },
      { name: 'Chicken Burger', priceINR: 100, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Crispy seasoned chicken patty topped with fresh greens and creamy dressing' }
    ]
  },
  {
    name: 'Chinese Starters',
    displayOrder: 5,
    items: [
      { name: 'Veg Manchurian (Dry/Gravy)', priceINR: 140, prepTimeMinutes: 12, dietary: 'Veg', description: '[Veg] Vegetable dumplings in classic Indo-Chinese sauce (specify Dry or Gravy in notes)' },
      { name: 'Chicken Manchurian (Dry/Gravy)', priceINR: 160, prepTimeMinutes: 14, dietary: 'Non-Veg', description: '[Non-Veg] Diced chicken in savory garlic Manchurian glaze (specify Dry or Gravy in notes)' },
      { name: 'Chilli Paneer (Dry/Gravy)', priceINR: 160, prepTimeMinutes: 12, dietary: 'Veg', description: '[Veg] Crispy cottage cheese cubes tossed with bell peppers and onions in soy chili sauce' },
      { name: 'Chilli Potato', priceINR: 120, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Crisp potato fingers coated in spicy chili garlic sauce with sesame garnish' },
      { name: 'Honey Chilli Potato', priceINR: 130, prepTimeMinutes: 10, dietary: 'Veg', description: '[Veg] Crispy potato wedges tossed in sweet honey and spicy chili blend' },
      { name: 'Veg Spring Roll', priceINR: 100, prepTimeMinutes: 8, dietary: 'Veg', description: '[Veg] Crispy golden pastry rolls filled with shredded stir-fried vegetables' },
      { name: 'Chicken Spring Roll', priceINR: 120, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Crunchy spring rolls packed with minced spiced chicken filling' }
    ]
  },
  {
    name: 'Soups & Thukpa',
    displayOrder: 6,
    items: [
      { name: 'Veg Soup', priceINR: 100, prepTimeMinutes: 8, dietary: 'Veg', description: '[Veg] Warm comforting vegetable clear soup with fresh herbs' },
      { name: 'Chicken Soup', priceINR: 120, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Nourishing slow-simmered chicken soup with aromatic seasonings' },
      { name: 'Veg Thukpa', priceINR: 100, prepTimeMinutes: 12, dietary: 'Veg', description: '[Veg] Traditional Tibetan noodle soup brimming with fresh vegetables in a savory broth' },
      {
        name: 'Chicken Thukpa',
        priceINR: 120,
        prepTimeMinutes: 14,
        dietary: 'Non-Veg',
        description: '[Non-Veg] Hearty Tibetan noodle soup with tender chicken chunks and vegetables (Rate ₹120 on board; review flag set)',
        flaggedForReview: 'Board rate is ₹120 (user prompt noted ₹100 needs verification; confirmed ₹120 from board photo)'
      }
    ]
  },
  {
    name: 'Rolls',
    displayOrder: 7,
    items: [
      { name: 'Veg Roll', priceINR: 100, prepTimeMinutes: 8, dietary: 'Veg', description: '[Veg] Crisp spiced vegetables wrapped in a freshly toasted flatbread' },
      {
        name: 'Egg Roll',
        priceINR: 100,
        prepTimeMinutes: 8,
        dietary: 'Egg',
        description: '[Egg] Double egg omelette layered inside a flaky paratha with sliced onions and lime (Photo rate ₹120; prompt transcribed ₹100; review flag set)',
        flaggedForReview: 'Board photo displays rate ₹120; user prompt transcribed ₹100. Provisional price ₹100 imported pending admin verification.'
      },
      { name: 'Chicken Roll', priceINR: 130, prepTimeMinutes: 10, dietary: 'Non-Veg', description: '[Non-Veg] Succulent marinated chicken chunks with crisp onions rolled in warm flatbread' }
    ]
  },
  {
    name: 'Fries & Maggi',
    displayOrder: 8,
    items: [
      { name: 'French Fries', priceINR: 120, prepTimeMinutes: 6, dietary: 'Veg', description: '[Veg] Golden crispy salted potato fries' },
      { name: 'Peri Peri Fries', priceINR: 120, prepTimeMinutes: 6, dietary: 'Veg', description: '[Veg] Crispy fries tossed in zesty African peri-peri spice dust' },
      { name: 'Maggi', priceINR: 70, prepTimeMinutes: 5, dietary: 'Veg', description: '[Veg] Classic masala Maggi noodles cooked to perfection' },
      { name: 'Cheese Maggi', priceINR: 80, prepTimeMinutes: 6, dietary: 'Veg', description: '[Veg] Steaming masala Maggi crowned with melted processed cheese' },
      { name: 'Egg Maggi', priceINR: 80, prepTimeMinutes: 6, dietary: 'Egg', description: '[Egg] Classic Maggi tossed with savory scrambled egg' },
      { name: 'Chicken Maggi', priceINR: 90, prepTimeMinutes: 8, dietary: 'Non-Veg', description: '[Non-Veg] Masala Maggi tossed with tender spiced chicken shreds' },
      { name: 'Chicken Cheese Maggi', priceINR: 100, prepTimeMinutes: 8, dietary: 'Non-Veg', description: '[Non-Veg] Indulgent chicken Maggi layered with rich melted cheese' }
    ]
  },
  {
    name: 'Beverages',
    displayOrder: 9,
    items: [
      {
        name: 'Coke (250ml PET)',
        priceINR: 20,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 250 ml PET bottle Coca-Cola. (Provisional rate per board photo ₹20)',
        flaggedForReview: 'Provisional size/price: Board shows 250ml PET ₹20 (prompt listed ₹25). Admin verification recommended.'
      },
      {
        name: 'Coke (750ml PET)',
        priceINR: 40,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 750 ml PET bottle Coca-Cola. (Provisional rate per board ₹40)',
        flaggedForReview: 'Provisional size/price: Board shows 750ml PET ₹40. Admin verification recommended.'
      },
      {
        name: 'Sprite (250ml PET)',
        priceINR: 20,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 250 ml PET bottle Sprite. (Provisional rate per board photo ₹20)',
        flaggedForReview: 'Provisional size/price: Board shows 250ml PET ₹20 (prompt listed ₹25). Admin verification recommended.'
      },
      {
        name: 'Sprite (750ml PET)',
        priceINR: 40,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 750 ml PET bottle Sprite. (Provisional rate per board ₹40)',
        flaggedForReview: 'Provisional size/price: Board shows 750ml PET ₹40. Admin verification recommended.'
      },
      {
        name: 'Thums Up (250ml PET)',
        priceINR: 20,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 250 ml PET bottle Thums Up. (Provisional rate per board photo ₹20)',
        flaggedForReview: 'Provisional size/price: Board shows 250ml PET ₹20. Admin verification recommended.'
      },
      {
        name: 'Thums Up (750ml PET)',
        priceINR: 40,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 750 ml PET bottle Thums Up. (Provisional rate per board ₹40)',
        flaggedForReview: 'Provisional size/price: Board shows 750ml PET ₹40. Admin verification recommended.'
      },
      {
        name: 'Limca (250ml PET)',
        priceINR: 20,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 250 ml PET bottle Limca. (Provisional rate per board photo ₹20)',
        flaggedForReview: 'Provisional size/price: Board shows 250ml PET ₹20. Admin verification recommended.'
      },
      {
        name: 'Limca (750ml PET)',
        priceINR: 40,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 750 ml PET bottle Limca. (Provisional rate per board ₹40)',
        flaggedForReview: 'Provisional size/price: Board shows 750ml PET ₹40. Admin verification recommended.'
      },
      {
        name: 'Fanta (250ml PET)',
        priceINR: 20,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 250 ml PET bottle Fanta. (Provisional rate per board photo ₹20)',
        flaggedForReview: 'Provisional size/price: Board shows 250ml PET ₹20. Admin verification recommended.'
      },
      {
        name: 'Fanta (750ml PET)',
        priceINR: 40,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 750 ml PET bottle Fanta. (Provisional rate per board ₹40)',
        flaggedForReview: 'Provisional size/price: Board shows 750ml PET ₹40. Admin verification recommended.'
      },
      {
        name: 'Minute Maid (250ml PET)',
        priceINR: 25,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 250 ml PET bottle Minute Maid pulpy juice. (Rate per board ₹25)',
        flaggedForReview: 'Provisional size/price: Board shows 250ml PET ₹25. Admin verification recommended.'
      },
      {
        name: 'Kinley Water (1L)',
        priceINR: 20,
        prepTimeMinutes: 1,
        dietary: 'Beverage',
        description: '[Beverage] 1 Litre packaged drinking water bottle. (Rate per board ₹20)',
        flaggedForReview: 'Provisional size/price: Board shows 1L ₹20. Admin verification recommended.'
      }
    ]
  }
];
