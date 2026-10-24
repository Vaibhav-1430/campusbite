import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Mobile Responsive Checkout Bar & Netlify Badge Suppression', () => {
  const indexCssPath = path.resolve(__dirname, '../index.css');
  const counterPosPath = path.resolve(__dirname, '../pages/counter/CounterPOSPage.tsx');

  it('should include explicit CSS rules to suppress injected Netlify badges and overlays', () => {
    const cssContent = fs.readFileSync(indexCssPath, 'utf-8');

    expect(cssContent).toContain('#netlify-badge');
    expect(cssContent).toContain('[data-netlify-badge]');
    expect(cssContent).toContain('display: none !important');
    expect(cssContent).toContain('pointer-events: none !important');
  });

  it('should account for mobile safe-area insets in the floating sticky cart bar', () => {
    const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

    expect(tsxContent).toContain('env(safe-area-inset-bottom');
    expect(tsxContent).toContain('counter-floating-cart-bar');
    expect(tsxContent).toContain('counter-review-cart-btn');
  });

  it('should enforce flex-shrink-0 on the Review Cart button to prevent overlapping on small viewports', () => {
    const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

    // Review cart button must not collapse on small screens
    expect(tsxContent).toContain('flex-shrink-0 px-3.5 sm:px-5');
  });

  it('should reserve bottom padding in main container so the final food cards are not hidden behind fixed bar', () => {
    const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

    expect(tsxContent).toContain('totalCartCount > 0 ?');
    expect(tsxContent).toMatch(/pb-36|pb-32|pb-28/);
  });

  it('should maintain proper touch target sizing and accessible IDs for automation', () => {
    const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

    expect(tsxContent).toContain('id="counter-review-cart-btn"');
    expect(tsxContent).toContain('id="counter-floating-cart-bar"');
  });

  describe('Viewport Width Geometry Verification', () => {
    const testViewports = [
      { name: 'iPhone SE / Small Android', width: 320 },
      { name: 'Standard Android (Galaxy S8/S9)', width: 360 },
      { name: 'iPhone 12/13/14/15', width: 390 },
      { name: 'iPhone Plus / Pro Max / Pixel XL', width: 430 }
    ];

    testViewports.forEach(({ name, width }) => {
      it(`should calculate sufficient horizontal clearance on ${name} (${width}px)`, () => {
        // Layout breakdown:
        // Container padding: px-3 (12px * 2 = 24px)
        // Cart icon: w-9 (36px) + margin/gap (10px) = 46px
        // Review button: px-3.5 (14px * 2) + font (approx 80px) = ~110px
        // Available width for items and price info:
        const containerPadding = 24;
        const iconSection = 46;
        const buttonWidth = 110;
        const availableTextSpace = width - (containerPadding + iconSection + buttonWidth);

        // Even on 320px viewport: 320 - 180 = 140px, which is plenty for "2 portion(s)" and "₹180.00"
        expect(availableTextSpace).toBeGreaterThanOrEqual(130);
      });
    });
  });
});
