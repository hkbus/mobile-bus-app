import React, { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  BackHandler,
  NativeEventSubscription,
  Linking,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";
import { requestTrackingPermissionsAsync } from "expo-tracking-transparency";

interface AppState {
  render: boolean;
  iOSTracking: boolean | undefined;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    render: false,
    iOSTracking: undefined,
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
    (async () => {
      const _state: AppState = {
        render: false,
        iOSTracking: undefined,
      };

      if (Platform.OS === "ios") {
        const { status } = await requestTrackingPermissionsAsync();
        if (status === "granted") {
          _state.iOSTracking = true;
        } else {
          _state.iOSTracking = false;
        }
      }

      if (Location.PermissionStatus.UNDETERMINED) {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") _state.render = true;
      }

      if (
        _state.render !== state.render ||
        _state.iOSTracking !== state.iOSTracking
      ) {
        setState(_state);
      }
    })();
  }, [state, setState]);

  useEffect(() => {
    if (Platform.OS === "android") {
      handlerRef.current?.remove();
      handlerRef.current = BackHandler.addEventListener(
        "hardwareBackPress",
        onAndroidBackPress
      );
    }
  }, [onAndroidBackPress]);

  const runFirst = `
    window.iOSRNWebView = ${Platform.OS === "ios"};
    ${Platform.OS === "ios" ? `window.iOSTracking = ${state.iOSTracking}` : ""}
    true; // note: this is required, or you'll sometimes get silent failures
  `;

  const uri = "https://hkbus.app/";

  if (Platform.OS === 'ios' && state.iOSTracking === undefined) {
    return <></>;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container}>
        <WebView
          ref={webViewRef}
          style={styles.webview}
          source={{ uri }}
          geolocationEnabled
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
