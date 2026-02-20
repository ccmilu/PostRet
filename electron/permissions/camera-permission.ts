import { systemPreferences, dialog, shell } from 'electron';

export type CameraPermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted';

/**
 * 检查当前摄像头权限状态
 */
export function checkCameraPermission(): CameraPermissionStatus {
  try {
    const status = systemPreferences.getMediaAccessStatus('camera');
    return status as CameraPermissionStatus;
  } catch (error) {
    console.error('Failed to check camera permission:', error);
    return 'denied';
  }
}

/**
 * 请求摄像头权限（仅 not-determined 时有效）
 */
export async function requestCameraPermission(): Promise<boolean> {
  try {
    return await systemPreferences.askForMediaAccess('camera');
  } catch (error) {
    console.error('Failed to request camera permission:', error);
    return false;
  }
}

/**
 * 完整权限处理流程
 * @returns true if granted, false otherwise
 */
export async function handleCameraPermission(): Promise<boolean> {
  const status = checkCameraPermission();

  switch (status) {
    case 'granted':
      return true;

    case 'not-determined': {
      const granted = await requestCameraPermission();
      return granted;
    }

    case 'denied': {
      await showPermissionDeniedDialog();
      return false;
    }

    case 'restricted': {
      await showPermissionRestrictedDialog();
      return false;
    }

    default:
      return false;
  }
}

/**
 * 显示权限被拒绝的引导对话框
 */
export async function showPermissionDeniedDialog(): Promise<void> {
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: '需要摄像头权限',
    message: 'PostRet 需要摄像头权限来检测您的坐姿。',
    detail: '请在系统设置中允许 PostRet 访问摄像头。\n\n系统设置 → 隐私与安全性 → 摄像头 → 勾选 PostRet',
    buttons: ['打开系统设置', '稍后再说'],
    defaultId: 0,
    cancelId: 1,
  });

  if (result.response === 0) {
    openCameraSettings();
  }
}

export async function showPermissionRestrictedDialog(): Promise<void> {
  await dialog.showMessageBox({
    type: 'info',
    title: '摄像头受限',
    message: '摄像头权限受到系统限制。',
    detail: '您的设备管理策略可能禁止了摄像头访问。请联系您的管理员。',
    buttons: ['确定'],
  });
}

/**
 * 打开系统偏好设置的摄像头权限页面
 */
export function openCameraSettings(): void {
  shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
}
