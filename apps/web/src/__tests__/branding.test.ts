import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Cafe47 Branding Consistency Checks', () => {
  const webDir = path.resolve(__dirname, '../..');

  it('should have Cafe47 as the HTML title in index.html', () => {
    const indexPath = path.join(webDir, 'index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');

    expect(content).toContain('<title>Cafe47</title>');
    expect(content).toContain('content="Cafe47 - Authentic Himalayan Cuisine, Fast Food & Beverages"');
  });

  it('should display Cafe47 and Himalayan Cafe & POS in Navbar component', () => {
    const navbarPath = path.join(webDir, 'src/components/common/Navbar.tsx');
    const content = fs.readFileSync(navbarPath, 'utf-8');

    expect(content).toContain('Cafe47');
    expect(content).toContain('Himalayan Cafe & POS');
    // Ensure exact spelling Cafe47 (no space)
    expect(content).not.toContain('>Cafe 47<');
  });

  it('should brand LoginPage as Cafe47 Staff Portal', () => {
    const loginPath = path.join(webDir, 'src/pages/LoginPage.tsx');
    const content = fs.readFileSync(loginPath, 'utf-8');

    expect(content).toContain('Cafe47 Staff Portal');
    expect(content).toContain('Cafe47 Internal Restaurant System • Staff Terminal');
  });

  it('should brand PublicDisplayBoardPage as Cafe47 Live Order Board', () => {
    const displayPath = path.join(webDir, 'src/pages/display/PublicDisplayBoardPage.tsx');
    const content = fs.readFileSync(displayPath, 'utf-8');

    expect(content).toContain('Cafe47');
    expect(content).toContain('Live Order Board');
    expect(content).toContain('Authentic Himalayan Cuisine • Live Pickup Display');
  });

  it('should brand CustomerTrackingPage and QR downloads with Cafe47', () => {
    const trackingPath = path.join(webDir, 'src/pages/tracking/CustomerTrackingPage.tsx');
    const content = fs.readFileSync(trackingPath, 'utf-8');

    expect(content).toContain('Cafe47');
    expect(content).toContain('Thank you for dining with Cafe47! Enjoy your meal.');

    const qrModalPath = path.join(webDir, 'src/components/tracking/UniversalQrModal.tsx');
    const qrContent = fs.readFileSync(qrModalPath, 'utf-8');
    expect(qrContent).toContain('cafe47-order-tracking-qr.png');
  });

  it('should use cafe47- prefixed filenames for analytics CSV exports', () => {
    const analyticsPath = path.join(webDir, 'src/pages/admin/AdminAnalyticsPage.tsx');
    const content = fs.readFileSync(analyticsPath, 'utf-8');

    expect(content).toContain('`cafe47-sales-${startDate}-to-${endDate}.csv`');
    expect(content).toContain('`cafe47-menu-performance-${startDate}-to-${endDate}.csv`');
    expect(content).toContain('`cafe47-daily-closing-${closingDate}.csv`');
  });
});
