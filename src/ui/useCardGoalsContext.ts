import { createContext } from 'react';
import { useBrowserBoolean } from './useBrowserBoolean';

export const CARD_GOALS_CONTEXT_KEY = 'done.ui.card-goals-context';
export const CardGoalsContextDisplay = createContext(true);
export const useCardGoalsContext = () => useBrowserBoolean(CARD_GOALS_CONTEXT_KEY);
