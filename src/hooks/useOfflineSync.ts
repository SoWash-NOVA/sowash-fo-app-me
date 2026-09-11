import { useEffect } from 'react';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { coreApiClient } from '../api/client';

export const OFFLINE_QUEUE_KEY = '@offline_attendance_queue';

export type OfflineRecord = {
  id: string;
  photoUri: string;
  action: 'clock_in' | 'clock_out';
  captured_at: string;
};

export function useOfflineSync() {
  useEffect(() => {
    // Listen for network state changes
    const unsubscribe = NetInfo.addEventListener(state => {
      // If internet is reachable, attempt to sync the queue
      if (state.isConnected && state.isInternetReachable !== false) {
        syncOfflineQueue();
      }
    });

    return () => unsubscribe();
  }, []);

  const syncOfflineQueue = async () => {
    try {
      const queueData = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (!queueData) return;

      let queue: OfflineRecord[] = JSON.parse(queueData);
      if (queue.length === 0) return;

      const remainingQueue: OfflineRecord[] = [];

      for (const record of queue) {
        try {
          // Read base64 from the local file
          const base64 = await FileSystem.readAsStringAsync(record.photoUri, {
            encoding: FileSystem.EncodingType.Base64,
          });

          // Attempt to send to your backend
          const response = await coreApiClient.post('/attendance/mark', {
            image: base64,
            action: record.action,
            captured_at: record.captured_at,
          });

          if (response.data.success || response.data.results) {
            console.log(`Successfully synced offline record: ${record.id}`);
            // Cleanup the persistent image file to save storage space
            await FileSystem.deleteAsync(record.photoUri, { idempotent: true });
            // Do NOT add it to remainingQueue so it gets removed
          } else {
            console.log(`Failed to sync record ${record.id}`);
            remainingQueue.push(record); // Keep in queue for next time
          }
        } catch (error) {
          console.error(`Network error syncing record ${record.id}:`, error);
          remainingQueue.push(record); // Keep in queue for next time
        }
      }

      // Update AsyncStorage with any records that failed to send
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
    } catch (error) {
      console.error('Error processing offline queue', error);
    }
  };
}
