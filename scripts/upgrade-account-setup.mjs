import { previewConfig, upgradePreviewState } from './account-setup-state.mjs';

const result = await upgradePreviewState(previewConfig());
console.log(
  result.backup
    ? `Account preview upgraded: schema ${result.from} → ${result.to}. Backup: ${result.backup}`
    : `Account preview already uses schema ${result.to}; no upgrade needed.`,
);
