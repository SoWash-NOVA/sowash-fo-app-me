import apiClient from '../api/client';

export const logUserActivity = async (actionType: string, details: string) => {
  try {
    await apiClient.post('/activity/log', {
      actionType,
      actionDetails: details,
      // userId is handled by the backend's auth middleware[cite: 1, 2]
    }); 
  } catch (err) {
    console.error("Activity logging failed", err);
  }
};