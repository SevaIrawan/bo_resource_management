import { createContext } from 'react';
import type { AccountSyncFlowApi } from '@/hooks/useAccountSyncFlow';

export const AccountSyncFlowContext = createContext<AccountSyncFlowApi | null>(null);
