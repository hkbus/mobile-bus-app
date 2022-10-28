import React, { useCallback, useEffect, useRef, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  BackHandler,
  NativeEventSubscription,
  Platform,
  StyleSheet,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";

export default function App() {
  const [render, setRender] = useState(false);
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
    if (Location.PermissionStatus.UNDETERMINED)
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") setRender(!render);
      })();
  }, []);

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
    window.iOSRNWebView = ${Platform.OS === 'ios'}; 
    true; // note: this is required, or you'll sometimes get silent failures
  `;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container}>
          <WebView
            ref={webViewRef}
            style={styles.webview}
            source={{ uri: "https://hkbus.app/" }}
            geolocationEnabled
            cacheEnabled
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
            pullToRefreshEnabled
            onMessage={() => {}}
            injectedJavaScript={runFirst}
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
