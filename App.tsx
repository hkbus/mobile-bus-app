import "react-native-url-polyfill/auto";
import * as SplashScreen from "expo-splash-screen";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { StatusBar } from "expo-status-bar";
import {
  AppState,
  BackHandler,
  NativeEventSubscription,
  Linking,
  Platform,
  StyleSheet,
  Share,
  ToastAndroid,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  Accuracy,
  PermissionStatus as LocationPermissionStatus,
  requestForegroundPermissionsAsync,
  useForegroundPermissions,
  watchHeadingAsync,
  watchPositionAsync,
} from "expo-location";
import { WebView } from "react-native-webview";
import type { WebViewNavigation } from "react-native-webview";
import {
  PermissionStatus as TrackingPermissionStatus,
  useTrackingPermissions,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";
import { postAlarmToWebView, toggleAlarm } from "./stopAlarm";
import * as ExpoLinking from "expo-linking";
import AsyncStorage from '@react-native-async-storage/async-storage';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const url = ExpoLinking.useURL();

  const [locationPermission] = useForegroundPermissions({
    get: true,
    request: true,
  });

  const [trackingPermission] = useTrackingPermissions({
    get: true,
    request: false,
  });

  const [geolocationStatus, setGeolocationStatus] = useState<
    "granted" | "closed" | null
  >(null);

  const [webViewUrlState, setWebViewUrl] = useState<string>("");
  const [readyToExitState, setReadyToExit] = useState(false);

  const webViewRef = useRef<WebView>(null);
  const handlerRef = useRef<NativeEventSubscription>(null);

  const onAndroidBackPress = useCallback(() => {
    if (webViewRef.current) {
      const url = new URL(webViewUrlState);
      if (
        url.pathname === "/" ||
        url.pathname === "/zh" ||
        url.pathname === "/en"
      ) {
        // Pressing back on the home page, trying to close the app
        if (readyToExitState) {
          // Back already pressed recently, exiting
          BackHandler.exitApp();
        } else {
          // Back pressed for the first time, show confirmation
          ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
          setReadyToExit(true);
          // Allow 5 seconds for the user to press back again
          setTimeout(() => {
            setReadyToExit(false);
          }, 5000);
        }
        return true;
      } else {
        // Not on the home page, go back
        webViewRef.current.goBack();
      }
      return true;
    }
    return false;
  }, [webViewRef.current, webViewUrlState, readyToExitState]);

  // Handle Back press behaviour
  useEffect(() => {
    if (Platform.OS === "android") {
      handlerRef.current?.remove();
      handlerRef.current = BackHandler.addEventListener(
        "hardwareBackPress",
        onAndroidBackPress
      );
    }
  }, [onAndroidBackPress]);

  const handleWebViewNavigationStateChange = (
    newNavState: WebViewNavigation
  ) => {
    setWebViewUrl(newNavState.url);
  };

  useEffect(() => {
    let headingSubscription = { remove: () => {} };
    let positionSubscription = { remove: () => {} };
    if (
      locationPermission?.status === LocationPermissionStatus.GRANTED &&
      geolocationStatus === "granted"
    ) {
      watchHeadingAsync(({ accuracy, trueHeading }) => {
        webViewRef?.current?.postMessage(
          JSON.stringify({
            accuracy,
            degree: 360 - trueHeading,
            type: "compass",
          })
        );
      }).then((s) => (headingSubscription = s));
      watchPositionAsync(
        { accuracy: Accuracy.BestForNavigation },
        ({ coords: { latitude, longitude } }) => {
          webViewRef?.current?.postMessage(
            JSON.stringify({ lat: latitude, lng: longitude, type: "location" })
          );
        }
      ).then((s) => (positionSubscription = s));
    }
    return () => {
      headingSubscription.remove();
      positionSubscription.remove();
    };
  }, [locationPermission?.status, geolocationStatus]);

  const handleOnMessage = useCallback((e: any) => {
    try {
      const {
        nativeEvent: { data },
      } = e;
      const message = JSON.parse(data) as any;
      if (message.type === "start-geolocation") {
        if (locationPermission?.granted) {
          setGeolocationStatus("granted");
        } else {
          requestForegroundPermissionsAsync().then(({ status }) => {
            setGeolocationStatus(status === "granted" ? "granted" : "closed");
          });
        }
      } else if (message.type === "stop-geolocation") {
        setGeolocationStatus("closed");
      } else if (message.type === "share") {
        Share.share(
          {
            title: message?.value?.title ?? "",
            message: [message?.value?.text, message?.value?.url]
              .filter(Boolean)
              .join(" "),
            url: message?.value?.url,
          },
          {
            dialogTitle: message?.value?.title,
            subject: message?.value?.title,
          }
        );
      } else if (message.type === "stop-alarm") {
        toggleAlarm(message.value)
          .then(() => 
            postAlarmToWebView(webViewRef)
          );
      } else if (message.type === "setItem") {
        if ( message?.value?.value === null || message?.value?.value === undefined ) {
          AsyncStorage.removeItem(message?.value)
        } else {
          AsyncStorage.setItem(message?.value?.key, message?.value?.value)
        }
      } else if (message.type === "removeItem") {
        AsyncStorage.removeItem(message?.value)
      } else if (message.type === "clear") {
        AsyncStorage.clear()
      } else if (message.type === 'multiGet') {
        AsyncStorage.getAllKeys()
          .then(keys => AsyncStorage.multiGet(keys))
          .then(kvs => {
            webViewRef?.current?.postMessage(
              JSON.stringify({
                type: "initStorage",
                kvs: kvs.reduce((acc, [k, v]) => {
                  if ( k === null || v === null ) return acc;
                  acc[k] = v;
                  return acc
                }, {} as Record<string, string>)
              })
            );
          })
      }
    } catch (err) {
      console.log("UNKNOWN message:", e);
    }
  }, []);

  const readyToLoad = useMemo<boolean>(() => {
    if (
      locationPermission === null ||
      locationPermission.status === undefined ||
      locationPermission.status === LocationPermissionStatus.UNDETERMINED
    ) {
      return false;
    }
    return true;
  }, [locationPermission, locationPermission?.status]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState) => {
      if (Platform.OS !== "ios") return;
      if (
        nextAppState === "active" &&
        (trackingPermission === null ||
          trackingPermission?.status === undefined ||
          trackingPermission?.status === TrackingPermissionStatus.UNDETERMINED)
      ) {
        requestTrackingPermissionsAsync();
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    webViewRef?.current?.postMessage(
      JSON.stringify({
        type: "geoPermission",
        value: geolocationStatus,
      })
    );
    postAlarmToWebView(webViewRef);
  }, [geolocationStatus]);

  const runFirst = useMemo(
    () => `
    window.RnOs = "${Platform.OS}";
    window.iOSRNWebView = ${Platform.OS === "ios"};
    window.stopAlarm = true;
    ${
      Platform.OS === "ios"
        ? `window.iOSTracking = ${
            trackingPermission?.status === TrackingPermissionStatus.GRANTED
          };`
        : ""
    }
    if (navigator.share == null) {
      navigator.share = (param) => {
         window.ReactNativeWebView.postMessage(JSON.stringify({type: 'share', value: param}));
      };
    };
    true; // note: this is required, or you'll sometimes get silent failures
  `,
    [trackingPermission]
  );

  const handleContentTerminate = useCallback(() => {
    webViewRef.current?.reload();
  }, []);

  if (!readyToLoad) {
    return <></>;
  }

  const uri = url?.startsWith("https://hkbus.app") ? url : "https://hkbus.app/";

  return (
    <>
      <StatusBar style="light" />
      <SafeAreaProvider>
        <SafeAreaView style={styles.container}>
          <WebView
            ref={webViewRef}
            style={styles.webview}
            source={{ uri }}
            cacheEnabled
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
            pullToRefreshEnabled
            onMessage={handleOnMessage}
            injectedJavaScriptBeforeContentLoaded={runFirst}
            onShouldStartLoadWithRequest={(request) => {
              if (!request.url.startsWith(uri)) {
                Linking.openURL(request.url);
                return false;
              }
              return true;
            }}
            onContentProcessDidTerminate={handleContentTerminate}
            bounces={false}
            onNavigationStateChange={handleWebViewNavigationStateChange}
            onLoadEnd={() => SplashScreen.hideAsync()}
            startInLoadingState
          />
        </SafeAreaView>
      </SafeAreaProvider>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    backgroundColor: "#000",
    color: "#fff",
  },
  webview: {
    width: "100%",
    height: "100%",
  },
  ScrollStyle: {
    backgroundColor: "white",
    position: "relative",
  },
  loadingView: {
    backgroundColor: "black",
    width: "100%",
    height: "100%",
  },
});
