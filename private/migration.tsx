import { createRoot } from 'react-dom/client';
import { PrivateMigrationApp } from '../src/ui/PrivateMigrationApp';
import '../src/styles/index.css';
import '../src/styles/local-startup.css';

// This utility is served by Vite development only and is not a production build entry or PWA route.
if (!import.meta.env.DEV) throw Error('Private migration requires the development server.');
createRoot(document.getElementById('root')!).render(<PrivateMigrationApp />);
