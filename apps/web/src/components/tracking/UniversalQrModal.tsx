import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Modal } from '../common/Modal.js';
import { QrCode, Download, Printer, ExternalLink } from 'lucide-react';

interface UniversalQrModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UniversalQrModal: React.FC<UniversalQrModalProps> = ({ isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const trackUrl = typeof window !== 'undefined' ? `${window.location.origin}/track` : '/track';

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(trackUrl, {
        width: 320,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff'
        }
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('Failed to generate QR code', err));
    }
  }, [isOpen, trackUrl]);

  const handleDownload = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = 'cafe47-order-tracking-qr.png';
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Universal Order Tracking QR Code">
      <div className="flex flex-col items-center space-y-4 text-center py-2">
        <p className="text-xs sm:text-sm text-slate-500 max-w-sm">
          Print or place this single QR code on cafe tables and pickup counters. Customers scan it
          to track their food status live on their smartphones.
        </p>

        {/* QR Code Canvas/Image */}
        <div className="p-4 bg-white border-2 border-slate-200 rounded-2xl shadow-sm">
          {qrDataUrl ? (
            <img
              src={qrDataUrl}
              alt="Cafe47 Tracking QR Code"
              className="w-56 h-56 sm:w-64 sm:h-64 object-contain rounded-lg"
            />
          ) : (
            <div className="w-56 h-56 flex items-center justify-center text-slate-400">
              <QrCode className="w-12 h-12 animate-pulse" />
            </div>
          )}
        </div>

        {/* Direct Link */}
        <div className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-slate-600">
          <span className="truncate font-mono select-all">{trackUrl}</span>
          <a
            href="/track"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-orange-600 font-bold hover:text-orange-700 flex items-center"
          >
            <span>Open</span>
            <ExternalLink className="w-3.5 h-3.5 ml-1" />
          </a>
        </div>

        {/* Action Buttons */}
        <div className="w-full grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={handleDownload}
            className="flex items-center justify-center py-2.5 px-3 rounded-lg text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4 mr-1.5" />
            Download PNG
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center py-2.5 px-3 rounded-lg text-xs font-bold bg-orange-600 text-white hover:bg-orange-700 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Print Display Stand
          </button>
        </div>
      </div>
    </Modal>
  );
};
