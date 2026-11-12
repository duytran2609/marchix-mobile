import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { httpsCallable } from 'firebase/functions';
import { useEffect, useEffectEvent, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { auth, configError, emulatorMode, taskFunctions } from '../../services/firebase/firebase';
import { loadNotification, markNotificationsRead } from './notifications';
import type { WorkspaceNotification } from './notifications';

const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
const enabled = Boolean(projectId && Constants.expoConfig?.extra?.workspacePushEnabled &&
  Constants.executionEnvironment !== ExecutionEnvironment.StoreClient && !emulatorMode && !configError);
const storageKey = `marchix:workspace-push:${auth.app.options.projectId}`;
const setDevice = httpsCallable<{ token: string | null; previousToken: string | null }, void>(
  taskFunctions, 'setWorkspacePushDevice', { timeout: 8000 },
);
let deviceUpdate = Promise.resolve();

function queueDeviceUpdate(update: () => Promise<void>) {
  deviceUpdate = deviceUpdate.then(update).catch(error => {
    console.warn('Không cập nhật được đăng ký thông báo đẩy.', error?.code);
  });
  return deviceUpdate;
}

async function saveToken(token: string | null) {
  const previousToken = await AsyncStorage.getItem(storageKey);
  if (!token && !previousToken) return;
  await setDevice({ token, previousToken });
  if (token) await AsyncStorage.setItem(storageKey, token);
  else await AsyncStorage.removeItem(storageKey);
}

if (enabled) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
}

export function useWorkspacePush(email: string, onOpen: (note: WorkspaceNotification) => void) {
  const open = useEffectEvent(onOpen);
  const signingOut = useRef(false);

  useEffect(() => {
    if (!enabled || !projectId) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    signingOut.current = false;
    let active = true;
    let registering = false;
    let handlingResponse = false;
    let askedPermission = false;
    const isCurrent = () => active && !signingOut.current && auth.currentUser?.uid === uid;

    async function register(devicePushToken?: Notifications.DevicePushToken) {
      if (registering || !isCurrent()) return;
      registering = true;
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('workspace', {
            name: 'Thông báo Marchix', importance: Notifications.AndroidImportance.DEFAULT,
          });
        }
        let permission = await Notifications.getPermissionsAsync();
        if (!permission.granted && permission.canAskAgain && !askedPermission) {
          askedPermission = true;
          permission = await Notifications.requestPermissionsAsync();
        }
        const allowed = permission.granted ||
          permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
        if (!isCurrent()) return;
        const token = allowed ? (await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken })).data : null;
        if (isCurrent()) await queueDeviceUpdate(async () => {
          if (isCurrent()) await saveToken(token);
        });
      } catch (error) {
        console.warn('Không đăng ký được thông báo đẩy.', error);
      } finally {
        registering = false;
      }
    }

    async function handleResponse(response: Notifications.NotificationResponse | null) {
      if (!response || handlingResponse || !isCurrent()) return;
      const id = response.notification.request.content.data?.workspaceNotificationId;
      if (typeof id !== 'string' || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      handlingResponse = true;
      try {
        const note = await loadNotification(id, email);
        if (!isCurrent()) return;
        Notifications.clearLastNotificationResponse();
        if (note) {
          open(note);
          void markNotificationsRead([note]).catch(() => {});
        }
      } catch (error) {
        // A denied notification may belong to a previous session on this device.
        if (isCurrent() && (error as { code?: string }).code === 'permission-denied') {
          Notifications.clearLastNotificationResponse();
        }
      } finally {
        handlingResponse = false;
      }
    }

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(response => void handleResponse(response));
    const tokenSubscription = Notifications.addPushTokenListener(token => void register(token));
    function resume() {
      void handleResponse(Notifications.getLastNotificationResponse());
      void register();
    }
    const appStateSubscription = AppState.addEventListener('change', state => { if (state === 'active') resume(); });
    resume();
    return () => {
      active = false;
      responseSubscription.remove();
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [email]);

  return async () => {
    if (!enabled) return;
    signingOut.current = true;
    await queueDeviceUpdate(() => saveToken(null));
  };
}
