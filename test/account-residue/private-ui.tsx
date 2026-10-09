/** Synthetic entry for the actual private utility UI; no mutation of its DEV-only production entry. */
import { createRoot } from 'react-dom/client';
import { PrivateMigrationApp } from '../../src/ui/PrivateMigrationApp';
createRoot(document.getElementById('root')!).render(<PrivateMigrationApp />);
