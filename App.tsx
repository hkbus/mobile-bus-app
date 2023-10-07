import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { StatusBar } from "expo-status-bar";
import {
  AppState,
  BackHandler,
  NativeEventSubscription,
  Linking,
  Platform,
  StyleSheet,
  ImageBackground,
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
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";

export default function App() {

  const [locationPermission] = useForegroundPermissions({
    get: true,
    request: true,
  });

  const [trackingPermission] = useTrackingPermissions({
    get: true,
    request: false,
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

  const readyToLoad = useMemo<boolean>(() => {
    if ( locationPermission === null || locationPermission.status === undefined || locationPermission.status === LocationPermissionStatus.UNDETERMINED ) {
      return false
    }
    return true;
  }, [locationPermission, locationPermission?.status])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextAppState => {
      if ( Platform.OS !== 'ios' ) return;
      if ( nextAppState === 'active' && (
        trackingPermission === null || trackingPermission?.status === undefined ||
        trackingPermission?.status === TrackingPermissionStatus.UNDETERMINED )
      ) {
        requestTrackingPermissionsAsync()
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);
  
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

  const handleContentTerminate = useCallback(() => {
    webViewRef.current?.reload()
  }, [])

  if ( !readyToLoad ) {
    return (
      <ImageBackground
        source={require('./assets/splash.png')}
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    )
  }

  const uri = "https://hkbus.app/";

  return (
    <>
    <StatusBar style="light" />
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <WebView
          ref={webViewRef}
          style={styles.webview}
          source={{ uri }}
          geolocationEnabled={trackingPermission?.status === TrackingPermissionStatus.GRANTED}
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
          onContentProcessDidTerminate={handleContentTerminate}
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
});
