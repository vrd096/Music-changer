import React from 'react';

export const ProBadge: React.FC = () => (
  <svg width="22" height="14" viewBox="0 0 22 14" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="22" height="14" rx="3" fill="#FFD700" />
    <text
      x="11"
      y="10"
      textAnchor="middle"
      fill="black"
      fontSize="8"
      fontWeight="bold"
      fontFamily="Arial">
      PRO
    </text>
  </svg>
);

export const ProBannerSidepanel: React.FC = () => (
  <div className="pro-banner">
    <div className="pro-banner-content">
      <div className="pro-banner-text">
        <h3>Transpose ▲▼ PRO</h3>
        <p>Unlock all features</p>
      </div>
      <button className="pro-banner-button">Upgrade</button>
    </div>
  </div>
);

export const ProBannerFree: React.FC = () => (
  <div className="pro-banner-free">
    <span>MUSIC PITCH CHANGER</span>
    <button className="pro-banner-button">Get PRO</button>
  </div>
);

export const AutoSaveBanner: React.FC = () => (
  <div className="auto-save-banner">
    <span className="material-icons">info</span>
    <span>Auto-save enabled</span>
  </div>
);
