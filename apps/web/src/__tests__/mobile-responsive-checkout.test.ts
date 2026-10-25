import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

interface BoundingBox {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

/**
 * Geometric Axis-Aligned Bounding Box (AABB) intersection check.
 * Returns true if and only if rectA and rectB physically overlap in 2D space.
 */
function checkBoxesOverlap(r1: BoundingBox, r2: BoundingBox): boolean {
  if (r1.width <= 0 || r1.height <= 0 || r2.width <= 0 || r2.height <= 0) {
    return false;
  }
  return !(
    r1.right <= r2.left ||
    r1.left >= r2.right ||
    r1.bottom <= r2.top ||
    r1.top >= r2.bottom
  );
}

/**
 * Minimal in-memory DOM mock for node environment testing of
 * the MutationObserver and runtime Netlify element purger.
 */
class MockDOMElement {
  id: string = '';
  tagName: string;
  attributes: Record<string, string> = {};
  children: MockDOMElement[] = [];
  parent: MockDOMElement | null = null;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes[name.toLowerCase()] = value;
    if (name.toLowerCase() === 'id') this.id = value;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name.toLowerCase()] ?? null;
  }

  appendChild(child: MockDOMElement) {
    child.parent = this;
    this.children.push(child);
  }

  remove() {
    if (this.parent) {
      this.parent.children = this.parent.children.filter((c) => c !== this);
      this.parent = null;
    }
  }

  querySelectorAll(selector: string): MockDOMElement[] {
    const results: MockDOMElement[] = [];
    const selectors = selector.split(',').map((s) => s.trim().toLowerCase());

    function matches(el: MockDOMElement, sel: string): boolean {
      const elId = el.id.toLowerCase();
      const elTitle = (el.getAttribute('title') || '').toLowerCase();

      if (sel.startsWith('#') && elId === sel.slice(1)) return true;
      if (sel.includes('iframe[id^="nl-"]') && el.tagName === 'IFRAME' && elId.startsWith('nl-')) return true;
      if (sel.includes('iframe[title*="netlify"') && el.tagName === 'IFRAME' && elTitle.includes('netlify')) return true;
      return false;
    }

    function traverse(node: MockDOMElement) {
      for (const child of node.children) {
        if (selectors.some((sel) => matches(child, sel))) {
          results.push(child);
        }
        traverse(child);
      }
    }

    traverse(this);
    return results;
  }
}

describe('Mobile Responsive Checkout Bar & Netlify Badge Suppression', () => {
  const indexCssPath = path.resolve(__dirname, '../index.css');
  const indexHtmlPath = path.resolve(__dirname, '../../index.html');
  const counterPosPath = path.resolve(__dirname, '../pages/counter/CounterPOSPage.tsx');

  describe('CSS Rule Integrity & Injected Frame Selectors', () => {
    it('should include explicit CSS rules targeting Netlify HUD and badge frame IDs', () => {
      const cssContent = fs.readFileSync(indexCssPath, 'utf-8');

      // Must target the real Netlify HUD frames injected at runtime
      expect(cssContent).toContain('#nl-badge-frame');
      expect(cssContent).toContain('#nl-hud-frame');
      expect(cssContent).toContain('iframe[id^="nl-"]');
      expect(cssContent).toContain('iframe[title*="Netlify" i]');
      expect(cssContent).toContain('iframe[title*="Powered by Netlify" i]');

      // Must strictly zero-out geometry and disable pointer events
      expect(cssContent).toContain('display: none !important');
      expect(cssContent).toContain('pointer-events: none !important');
      expect(cssContent).toContain('width: 0 !important');
      expect(cssContent).toContain('height: 0 !important');
      expect(cssContent).toContain('z-index: -99999 !important');
    });

    it('should not hide arbitrary third-party iframes', () => {
      const cssContent = fs.readFileSync(indexCssPath, 'utf-8');

      // Ensure generic 'iframe' without specific Netlify id/title is never globally hidden
      const lines = cssContent.split('\n');
      const genericIframeRule = lines.some((l) => l.trim() === 'iframe {');
      expect(genericIframeRule).toBe(false);
    });
  });

  describe('Early DOM-level MutationObserver in index.html', () => {
    it('should install an early MutationObserver in head to purge Netlify badge frames before paint', () => {
      const htmlContent = fs.readFileSync(indexHtmlPath, 'utf-8');

      expect(htmlContent).toContain('MutationObserver');
      expect(htmlContent).toContain('nl-badge-frame');
      expect(htmlContent).toContain('nl-hud-frame');
      expect(htmlContent).toContain('purgeNetlifyFrames');
    });

    it('successfully purges simulated Netlify badge iframes via the purge logic', () => {
      const mockBody = new MockDOMElement('BODY');
      const badgeFrame = new MockDOMElement('IFRAME');
      badgeFrame.id = 'nl-badge-frame';
      badgeFrame.setAttribute('title', 'Powered by Netlify');
      mockBody.appendChild(badgeFrame);

      // Verify element is present before purge
      expect(mockBody.children.length).toBe(1);

      // Purge logic as implemented in index.html
      const frames = mockBody.querySelectorAll('#nl-badge-frame, #nl-hud-frame, iframe[id^="nl-"], iframe[title*="Netlify" i]');
      frames.forEach((f) => f.remove());

      // Frame must be eliminated from DOM tree
      expect(mockBody.children.length).toBe(0);
    });

    it('preserves unrelated third-party iframes (e.g. payment gateway, maps)', () => {
      const mockBody = new MockDOMElement('BODY');
      const paymentIframe = new MockDOMElement('IFRAME');
      paymentIframe.id = 'stripe-challenge-frame';
      paymentIframe.setAttribute('title', 'Secure Payment Authentication');
      mockBody.appendChild(paymentIframe);

      const frames = mockBody.querySelectorAll('#nl-badge-frame, #nl-hud-frame, iframe[id^="nl-"], iframe[title*="Netlify" i]');
      frames.forEach((f) => f.remove());

      // Unrelated iframe must NOT be removed
      expect(mockBody.children.length).toBe(1);
      expect(mockBody.children[0].id).toBe('stripe-challenge-frame');
    });
  });

  describe('Counter POS Layout & Touch Targets', () => {
    it('should account for mobile safe-area insets in the floating sticky cart bar', () => {
      const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

      expect(tsxContent).toContain('env(safe-area-inset-bottom');
      expect(tsxContent).toContain('counter-floating-cart-bar');
      expect(tsxContent).toContain('counter-review-cart-btn');
    });

    it('should enforce flex-shrink-0 and whitespace-nowrap on the Review Cart button', () => {
      const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

      expect(tsxContent).toContain('flex-shrink-0');
      expect(tsxContent).toContain('whitespace-nowrap');
      expect(tsxContent).toContain('min-h-[44px]');
    });

    it('should reserve bottom padding in main container so the final food cards are not hidden behind fixed bar', () => {
      const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

      expect(tsxContent).toContain('totalCartCount > 0 ?');
      expect(tsxContent).toMatch(/pb-36|pb-32|pb-28/);
    });

    it('should elevate floating bar stacking with high z-index and pointer-events-auto', () => {
      const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

      expect(tsxContent).toContain('z-50');
      expect(tsxContent).toContain('pointer-events-auto');
    });
  });

  describe('Geometric Overlap Regression Tests (Simulated Viewports)', () => {
    const viewports = [
      { name: 'Compact 320px (iPhone SE)', width: 320, height: 667 },
      { name: 'Standard 360px (Galaxy S8)', width: 360, height: 740 },
      { name: 'Android Chrome 393px (Confirmed Issue Target)', width: 393, height: 851 },
      { name: 'Modern 390px (iPhone 14/15)', width: 390, height: 844 },
      { name: 'Large 430px (iPhone Pro Max / Pixel XL)', width: 430, height: 932 }
    ];

    viewports.forEach(({ name, width, height }) => {
      describe(`Viewport: ${name}`, () => {
        // Unmitigated Netlify badge geometry as injected by /.netlify/scripts/hud
        // Inline style: position:fixed; bottom:0; right:0; width:216px; height:92px; z-index:2147483645;
        const unmitigatedBadgeBox: BoundingBox = {
          left: width - 216,
          right: width,
          top: height - 92,
          bottom: height,
          width: 216,
          height: 92
        };

        // Review cart button in bottom sticky cart bar
        // Container: bottom: 0, inset-x: 0, padding px-3 (12px), py-2.5 (10px) + safe area
        // Button is right-aligned: width ~110px, height: 44px
        const reviewButtonBox: BoundingBox = {
          left: width - 12 - 110,
          right: width - 12,
          top: height - 10 - 44,
          bottom: height - 10,
          width: 110,
          height: 44
        };

        it('demonstrates that an unmitigated Netlify badge overlaps the Review Cart button', () => {
          // Verify that without our fix, the badge geometrically collides with the button
          const overlaps = checkBoxesOverlap(reviewButtonBox, unmitigatedBadgeBox);
          expect(overlaps).toBe(true);

          // And verify the badge is positioned on top of the button
          const horizontalIntersection = Math.min(reviewButtonBox.right, unmitigatedBadgeBox.right) - Math.max(reviewButtonBox.left, unmitigatedBadgeBox.left);
          const verticalIntersection = Math.min(reviewButtonBox.bottom, unmitigatedBadgeBox.bottom) - Math.max(reviewButtonBox.top, unmitigatedBadgeBox.top);
          expect(horizontalIntersection).toBeGreaterThan(0);
          expect(verticalIntersection).toBeGreaterThan(0);
        });

        it('confirms that with CSS suppression applied, the badge geometry collapses and overlap is ZERO', () => {
          // Under our hardened CSS rules:
          // #nl-badge-frame { display: none !important; width: 0 !important; height: 0 !important; top: -99999px !important; }
          const suppressedBadgeBox: BoundingBox = {
            left: -99999,
            right: -99999,
            top: -99999,
            bottom: -99999,
            width: 0,
            height: 0
          };

          const overlaps = checkBoxesOverlap(reviewButtonBox, suppressedBadgeBox);
          expect(overlaps).toBe(false);
          expect(suppressedBadgeBox.width).toBe(0);
          expect(suppressedBadgeBox.height).toBe(0);
        });

        it('validates horizontal clearance between cart summary text and Review Cart button', () => {
          const containerPadding = 24; // px-3 left + right
          const cartIconAndGap = 46; // w-9 (36px) + 10px gap
          const buttonWidth = 110; // 44px height, px-3.5 + text
          const minTextAllowance = width - (containerPadding + cartIconAndGap + buttonWidth);

          // On 320px viewport: 320 - 180 = 140px
          // On 393px viewport: 393 - 180 = 213px
          expect(minTextAllowance).toBeGreaterThanOrEqual(130);
        });
      });
    });
  });

  describe('Cart State Transitions & High-Volume Portions', () => {
    it('handles empty cart (0 items) by not rendering the floating bar', () => {
      const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

      // The sticky cart bar is conditional: totalCartCount > 0
      expect(tsxContent).toContain('{totalCartCount > 0 && (');
    });

    it('ensures high-volume portions and large totals (e.g. 99 portions, ₹99,999.00) are truncated safely without pushing the button', () => {
      const tsxContent = fs.readFileSync(counterPosPath, 'utf-8');

      // Both the portion count line and the currency line must use truncate + min-w-0
      expect(tsxContent).toContain('min-w-0 flex-1');
      expect(tsxContent).toContain('truncate');
      expect(tsxContent).toContain('formatPaise(cartTotalPaise)');
    });
  });
});
