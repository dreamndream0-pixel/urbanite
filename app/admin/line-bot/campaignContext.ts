'use client';

import { createContext, useContext } from 'react';
import type { Campaign } from '@/lib/types';

// LINE 機器人編輯器:一頁式活動頁清單(商品選取可依活動頁篩選)
export const CampaignsContext = createContext<Pick<Campaign, 'id' | 'name' | 'title'>[]>([]);
export const useCampaigns = () => useContext(CampaignsContext);
