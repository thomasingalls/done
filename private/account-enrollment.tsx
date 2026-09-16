import { createRoot } from 'react-dom/client';
import { AccountEnrollmentApp } from '../src/ui/AccountEnrollmentApp';
import type { SetupConfig } from '../src/account/firstDeviceSetup';
import '../src/styles/index.css';
import '../src/styles/local-startup.css';
import '../src/styles/account-setup.css';
declare const __ACCOUNT_SETUP_CONFIG__: SetupConfig;
if (!import.meta.env.DEV || typeof __ACCOUNT_SETUP_CONFIG__ === 'undefined')
  throw Error('Run the dedicated account setup development server.');
createRoot(document.getElementById('root')!).render(
  <AccountEnrollmentApp config={__ACCOUNT_SETUP_CONFIG__} />,
);
