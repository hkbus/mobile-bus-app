import React, { useLayoutEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { StyleSheet } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { WebView } from "react-native-webview";

export default function App() {
  const [render, setRender] = useState(false);

  useLayoutEffect(() => {
    if (Location.PermissionStatus.UNDETERMINED)
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") setRender(!render);
      })();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={styles.container}>
        <WebView
          style={styles.webview}
          source={{ uri: "https://hkbus.app/" }}
          geolocationEnabled={true}
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
});
