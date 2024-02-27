import * as TaskManager from "expo-task-manager";
import * as Notifications from "expo-notifications";
import throttle from "lodash.throttle";
import WebView from "react-native-webview";
import {
  Accuracy,
  requestBackgroundPermissionsAsync,
  getBackgroundPermissionsAsync,
  startLocationUpdatesAsync,
  stopLocationUpdatesAsync,
} from "expo-location";
import { Platform } from "react-native";
import { AsyncAlert } from "./asyncAlert";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const LOCATION_NOTIFICATION_TASK_NAME = "background-notification-location";

const targetLocation = {
  latitude: 0,
  longitude: 0,
  stopId: "",
  title: "Arrived",
  body: "Here",
};

const setStopAlarm = async () => {
  const { status: notificationStatus } = await Notifications.requestPermissionsAsync();
  if ( notificationStatus !== "granted" ) {
    await AsyncAlert("Fail to setup alarm without notification permission.");
    return false;
  }
  
  const { status: bgStatus } = await getBackgroundPermissionsAsync();
  
  if (bgStatus !== "granted") {
    if ( Platform.OS === 'android' ) {
      await AsyncAlert('Background location permission is required for setting up the arrival reminder')
    }
    const { status } = await requestBackgroundPermissionsAsync();
    if ( status !== "granted" ) {
      return false;
    }
  }

  await startLocationUpdatesAsync(LOCATION_NOTIFICATION_TASK_NAME, {
    accuracy: Accuracy.Balanced,
    timeInterval: 5000,
    deferredUpdatesTimeout: 5000,
  });
  return true;
};

export const toggleAlarm = async ({ stopId, title, body, lat, lng }: any) => {
  if (targetLocation.stopId === stopId) {
    targetLocation.latitude = 0;
    targetLocation.longitude = 0;
    targetLocation.stopId = "";
    try { 
      stopLocationUpdatesAsync(LOCATION_NOTIFICATION_TASK_NAME);
    } catch (e) {

    }
    return true
  } else {
    targetLocation.stopId = stopId;
    targetLocation.title = title;
    targetLocation.body = body;
    targetLocation.latitude = lat;
    targetLocation.longitude = lng;
    return await setStopAlarm();
  }
};

export const postAlarmToWebView = (webViewRef: React.RefObject<WebView>) => {
  webViewRef?.current?.postMessage(
    JSON.stringify({
      type: "stop-alarm-stop-id",
      value: targetLocation.stopId,
    })
  );
};

TaskManager.defineTask(
  LOCATION_NOTIFICATION_TASK_NAME,
  throttle(({ data: { locations }, error }: { data: any; error: any }) => {
    if (error) {
      return;
    }
    if (locations && Array.isArray(locations) && locations.length) {
      if (getDistance(targetLocation, locations[0].coords) < 500) {
        Notifications.scheduleNotificationAsync({
          content: {
            title: targetLocation.title,
            body: targetLocation.body,
            data: { data: "goes" },
          },
          trigger: null,
        });
        toggleAlarm(targetLocation);
        try { 
          stopLocationUpdatesAsync(LOCATION_NOTIFICATION_TASK_NAME);
        } catch (e) {

        }
      }
      return;
    }
  }, 500)
);

const getDistance = (a: any, b: any) => {
  const R = 6371e3; // metres
  const φ1 = (a.latitude * Math.PI) / 180; // φ, λ in radians
  const φ2 = (b.latitude * Math.PI) / 180;
  const Δφ = ((b.latitude - a.latitude) * Math.PI) / 180;
  const Δλ = ((b.longitude - a.longitude) * Math.PI) / 180;

  const aa =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
  return R * c; // in metres
};
