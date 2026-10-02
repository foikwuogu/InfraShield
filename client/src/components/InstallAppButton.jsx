import React, { useEffect, useState } from 'react';

export default function InstallAppButton({ compact = false }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [isAppleMobile, setIsAppleMobile] = useState(false);
  const [help, setHelp] = useState('');

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    const appleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setInstalled(standalone);
    setIsAppleMobile(appleMobile);

    function handleInstallPrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    function handleInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
      setHelp('InfraShield has been added to this device.');
    }

    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function handleClick() {
    setHelp('');
    if (!installPrompt) {
      setHelp(isAppleMobile
        ? 'In Safari, tap Share, then Add to Home Screen to install InfraShield.'
        : 'Open your browser menu and choose Install app or Add to Home screen.');
      return;
    }

    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (outcome === 'accepted') setHelp('InfraShield is installing on this device.');
  }

  if (installed) return null;

  return (
    <div className={`install-app${compact ? ' install-app-compact' : ''}`}>
      <button className={compact ? 'btn btn-ghost install-app-button' : 'btn btn-install install-app-button'} type="button" onClick={handleClick}>
        {compact ? 'Install' : 'Get mobile app'}
      </button>
      {help && (
        <div className="install-help" role="status">
          <span>{help}</span>
          <button className="install-help-close" type="button" aria-label="Dismiss install instructions" onClick={() => setHelp('')}>×</button>
        </div>
      )}
    </div>
  );
}
