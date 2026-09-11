import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MarkAttendanceScreen from '../MarkAttendanceScreen';
import { useNetInfo } from '@react-native-community/netinfo';
import { useCameraPermissions } from 'expo-camera';

// Mock dependencies
jest.mock('@react-native-community/netinfo', () => ({
  useNetInfo: jest.fn(),
}));

jest.mock('expo-camera', () => ({
  CameraView: jest.fn().mockImplementation(() => null),
  useCameraPermissions: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
}));

jest.mock('expo-file-system', () => ({
  documentDirectory: 'file://document/directory/',
  copyAsync: jest.fn(),
}));

jest.mock('../../api/client', () => ({
  coreApiClient: {
    post: jest.fn(),
  },
  faceInstance: {
    post: jest.fn(),
  },
}));

jest.mock('../../store/authStore', () => ({
  useAuthStore: jest.fn(() => 'Test User'),
}));

describe('MarkAttendanceScreen Offline Mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly in online mode', () => {
    (useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, jest.fn()]);
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: true });

    const { getByText, queryByText } = render(<MarkAttendanceScreen navigation={{ navigate: jest.fn(), openDrawer: jest.fn() }} />);
    
    // Check initial idle screen
    expect(getByText('SCAN TO CLOCK IN')).toBeTruthy();
    expect(queryByText('OFFLINE MODE')).toBeNull();
  });

  it('renders OFFLINE MODE badge and tap to capture button when offline', async () => {
    (useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, jest.fn()]);
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: false });

    const { getByText } = render(<MarkAttendanceScreen navigation={{ navigate: jest.fn(), openDrawer: jest.fn() }} />);
    
    // Start scan to enter scanning screen
    fireEvent.press(getByText('SCAN TO CLOCK IN'));

    // Wait for the scanning state to render
    await waitFor(() => {
      expect(getByText('OFFLINE MODE')).toBeTruthy();
      expect(getByText('Tap to Capture')).toBeTruthy();
    });
  });

  it('captures photo offline and saves it to local queue', async () => {
    (useCameraPermissions as jest.Mock).mockReturnValue([{ granted: true }, jest.fn()]);
    (useNetInfo as jest.Mock).mockReturnValue({ isConnected: true, isInternetReachable: false });

    const mockTakePicture = jest.fn().mockResolvedValue({ uri: 'file://mock/photo.jpg' });
    
    // Mock the camera ref's takePictureAsync
    const { CameraView } = require('expo-camera');
    CameraView.mockImplementation(React.forwardRef((props, ref) => {
      React.useImperativeHandle(ref, () => ({
        takePictureAsync: mockTakePicture,
      }));
      return null;
    }));

    const { getByText } = render(<MarkAttendanceScreen navigation={{ navigate: jest.fn(), openDrawer: jest.fn() }} />);
    
    // Start scan to enter scanning screen
    fireEvent.press(getByText('SCAN TO CLOCK IN'));

    let captureBtn;
    await waitFor(() => {
      captureBtn = getByText('Tap to Capture');
      expect(captureBtn).toBeTruthy();
    });

    // Tap to capture
    fireEvent.press(captureBtn);

    // Verify it takes picture
    await waitFor(() => {
      expect(mockTakePicture).toHaveBeenCalled();
    });

    // Verify file system copy
    const FileSystem = require('expo-file-system');
    await waitFor(() => {
      expect(FileSystem.copyAsync).toHaveBeenCalledWith(expect.objectContaining({
        from: 'file://mock/photo.jpg',
      }));
    });

    // Verify it adds to AsyncStorage queue
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    await waitFor(() => {
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@offline_attendance_queue',
        expect.any(String)
      );
    });
  });
});
