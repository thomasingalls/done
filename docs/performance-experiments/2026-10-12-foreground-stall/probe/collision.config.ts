import { defineConfig } from '@playwright/test';
import base from './stall.config';
export default defineConfig({ ...base, testMatch: 'collision.spec.ts' });
