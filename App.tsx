import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { StatusBar } from "expo-status-bar";
import {
  BackHandler,
  NativeEventSubscription,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  PermissionStatus as LocationPermissionStatus,
  useForegroundPermissions,
} from "expo-location";
import { WebView } from "react-native-webview";
import {
  PermissionStatus as TrackingPermissionStatus,
  useTrackingPermissions,
} from "expo-tracking-transparency";

interface AppState {
  render: boolean;
  iOSTracking: boolean;
}

export default function App() {
  const [locationPermission] = useForegroundPermissions({
    get: true,
    request: true,
  });
  const [trackingPermission] = useTrackingPermissions({
    get: true,
    request: true,
  });

  const webViewRef = useRef<WebView>(null);
  const handlerRef = useRef<NativeEventSubscription>();

  const onAndroidBackPress = useCallback(() => {
    if (webViewRef.current) {
      webViewRef.current.goBack();
      return true;
    }
    return false;
  }, [webViewRef.current]);

  useEffect(() => {
    if (Platform.OS === "android") {
      handlerRef.current?.remove();
      handlerRef.current = BackHandler.addEventListener(
        "hardwareBackPress",
        onAndroidBackPress
      );
    }
  }, [onAndroidBackPress]);

  const runFirst = useMemo(
    () => `
    window.iOSRNWebView = ${Platform.OS === "ios"};
    ${
      Platform.OS === "ios"
        ? `window.iOSTracking = ${
            trackingPermission?.status === TrackingPermissionStatus.GRANTED
          }`
        : ""
    }
    true; // note: this is required, or you'll sometimes get silent failures
  `,
    [trackingPermission]
  );

  const uri = "https://hkbus.app/";

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container}>
        <WebView
          ref={webViewRef}
          style={styles.webview}
          source={{ uri }}
          geolocationEnabled={
            locationPermission?.status === LocationPermissionStatus.GRANTED
          }
          cacheEnabled
          cacheMode="LOAD_CACHE_ELSE_NETWORK"
          pullToRefreshEnabled
          onMessage={() => {}}
          injectedJavaScriptBeforeContentLoaded={runFirst}
          onShouldStartLoadWithRequest={(request) => {
            if (!request.url.startsWith(uri)) {
              Linking.openURL(request.url);
              return false;
            }
            return true;
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
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
});
