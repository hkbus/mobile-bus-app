import "react-native-url-polyfill/auto";
import * as NavigationBar from "expo-navigation-bar";
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
  Platform,
  StyleSheet,
  Share,
  Text,
  TouchableOpacity,
  ToastAndroid,
  useColorScheme,
  View,
  Linking,
} from "react-native";
import {
  Accuracy,
  getCurrentPositionAsync,
  getForegroundPermissionsAsync,
  hasServicesEnabledAsync,
  LocationPermissionResponse,
  PermissionStatus as LocationPermissionStatus,
  requestForegroundPermissionsAsync,
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
import { AsyncConsent } from "./asyncAlert";
import * as ExpoLinking from "expo-linking";
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

// Resolve to `fallback` if `promise` doesn't settle within `ms`. Used to guard
// the location-permission flow: on some Android devices the consent Alert or the
// native permission dialog can silently fail to appear, leaving the promise
// pending forever. Without a guard that would block geolocation indefinitely.
const withTimeout = <T,>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);

// AsyncStorage key that persists the user's decline of the location disclosure,
// so the disclosure isn't re-shown on every launch. Cleared when the user later
// opts in via an explicit action.
const CONSENT_DECLINED_KEY = "locationConsentDeclined";

const useAppIsInForeground = () => {
  const appState = useRef(AppState.currentState);
  const [appIsInForeground, setAppIsInForeground] = useState(true);
  useEffect(() => {
    const handler = AppState.addEventListener('change', async nextAppState => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        setAppIsInForeground(true);
      }
      if (
        appState.current === 'active' &&
        nextAppState.match(/inactive|background/)
      ) {
        setAppIsInForeground(false);
      }
      appState.current = nextAppState;
    });

    return () => handler.remove();
  }, []);

  return appIsInForeground;
};

function AppContent() {
  const insets = useSafeAreaInsets();
  const appIsInForeground = useAppIsInForeground();
  const rawColorScheme = useColorScheme();
  // RN 0.85's useColorScheme() now returns 'light' | 'dark' | 'unspecified'
  // (previously nullable). Normalize back to 'light' | 'dark' | null so the
  // existing fallbacks and the value injected into the web app behave as before.
  const systemColorScheme =
    rawColorScheme === "light" || rawColorScheme === "dark"
      ? rawColorScheme
      : null;
  const [webAppActualColorMode, setWebAppActualColorMode] = useState<
    "light" | "dark"
  >(systemColorScheme || "dark");

  const url = ExpoLinking.useLinkingURL();

  const [locationPermission, setLocationPermission] =
    useState<LocationPermissionResponse | null>(null);

  // Runs the location-permission flow: the prominent disclosure (Android, a
  // Google Play requirement) followed by the OS permission request.
  // `force` = true is an explicit user action (e.g. tapping "use my location")
  // and always re-shows the disclosure even after a prior decline.
  // `force` = false is the automatic launch path, which honors a persisted
  // decline and stays silent so the dialog isn't shown on every launch.
  const requestLocationWithConsent = useCallback(async (force: boolean = false) => {
    const existing = await getForegroundPermissionsAsync();
    if (existing.granted) {
      AsyncStorage.removeItem(CONSENT_DECLINED_KEY);
      setLocationPermission(existing);
      return;
    }
    // Google Play's User Data policy requires a prominent disclosure shown
    // BEFORE any location permission is requested. This app also uses
    // background location (arrival reminder), so the disclosure states that
    // location may be collected even when the app is closed or not in use.
    if (Platform.OS === "android" && existing.canAskAgain) {
      // On an automatic launch, respect a previously persisted decline and do
      // not re-prompt. The user can still opt in later via a forced request.
      if (!force) {
        const declined = await AsyncStorage.getItem(CONSENT_DECLINED_KEY);
        if (declined === "true") {
          setLocationPermission({
            ...existing,
            status: LocationPermissionStatus.DENIED,
            granted: false,
          });
          return;
        }
      }
      // Guard the consent Alert with a timeout: if it never appears (a known
      // cold-start failure mode on some Android devices), treat it as not
      // consented rather than hanging forever.
      const consented = await withTimeout(
        AsyncConsent(
          "位置資料使用 / Location data",
          "「巴士到站預報」會使用你的位置資料，以顯示附近的巴士路線及車站，"
            + "並可在你接近所選車站時提示到站，即使應用程式已關閉或沒有在使用中。"
            + "位置資料只用於上述功能。\n\n"
            + "hkbus.app collects location data to show nearby bus routes and stops, "
            + "and to alert you when you are approaching your selected stop — even when "
            + "the app is closed or not in use. Location is used only for these features.",
          "允許 / Allow",
          "不允許 / Don't allow",
        ),
        30000,
        false,
      );
      if (!consented) {
        // Persist the decline so the disclosure isn't shown on every launch,
        // and load the app without location features.
        await AsyncStorage.setItem(CONSENT_DECLINED_KEY, "true");
        setLocationPermission({
          ...existing,
          status: LocationPermissionStatus.DENIED,
          granted: false,
        });
        return;
      }
      // Consented: clear any prior decline before requesting.
      await AsyncStorage.removeItem(CONSENT_DECLINED_KEY);
    }
    // Guard the native permission dialog the same way: if it doesn't resolve,
    // fall back to the last-known (denied) state so geolocation stays off
    // instead of leaving the permission state undetermined forever.
    setLocationPermission(
      await withTimeout(
        requestForegroundPermissionsAsync(),
        30000,
        {
          ...existing,
          status: LocationPermissionStatus.DENIED,
          granted: false,
        },
      ),
    );
  }, []);

  useEffect(() => {
    requestLocationWithConsent(false);
  }, [requestLocationWithConsent]);

  // requestForegroundPermissionsAsync may sometimes get stuck on Android when the permission has already been granted before
  // const [locationPermission] = useForegroundPermissions({
  //   get: true,
  //   request: true,
  // });

  const [trackingPermission] = useTrackingPermissions({
    get: true,
    request: false,
  });

  const [geolocationStatus, setGeolocationStatus] = useState<
    "granted" | "closed" | null
  >(null);

  const webViewUrl = useRef<string>("");
  const readyToExit = useRef<Boolean>(false)
  const webViewRef = useRef<WebView>(null);

  // Under enforced edge-to-edge the WebView draws full-height behind the system
  // navigation bar, and the web app reserves space for it via
  // `body { padding-bottom: env(safe-area-inset-bottom) }` (see the web app's
  // index.css). But Android System WebView 138+ reports env(safe-area-inset-*)
  // as 0 (react-native-webview #3828), so on those devices the web app can't
  // reserve the space and the 3-button nav bar covers the bottom of the page;
  // on older WebViews env() over-reports and the UI floats too high. Both are
  // the same root cause: env() is unreliable. react-native-safe-area-context
  // reports the true inset on every WebView version, so inject it as an
  // `!important` body padding-bottom that overrides whatever env() resolves to.
  // The top inset is handled natively instead (a black spacer above the
  // WebView, see render), so zero out the web app's env() top padding to avoid
  // double-padding on WebViews where env() over-reports.
  // Android only: iOS WKWebView reports env(safe-area-inset-*) correctly.
  const applyAndroidSafeAreaInsets = useCallback(() => {
    if (Platform.OS !== "android") return;
    webViewRef.current?.injectJavaScript(`
      (function () {
        var id = "rn-safe-area-inset";
        var el = document.getElementById(id);
        if (!el) {
          el = document.createElement("style");
          el.id = id;
          document.head.appendChild(el);
        }
        el.textContent = "body{padding-top:0 !important;padding-bottom:${insets.bottom}px !important;}";
      })();
      true;
    `);
  }, [insets.bottom]);

  // Re-apply whenever the inset changes (e.g. the user switches navigation
  // mode or the bar shows/hides). A full page reload recreates the DOM and
  // drops the injected <style>, so onLoadEnd re-applies it too.
  useEffect(() => {
    applyAndroidSafeAreaInsets();
  }, [applyAndroidSafeAreaInsets]);

  // Handle Back press behaviour
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handler = BackHandler.addEventListener("hardwareBackPress", function () {
      if (webViewRef.current) {
        const url = new URL(webViewUrl.current);
        if (["/", "/zh", "/en"].includes(url.pathname)) {
          // Pressing back on the home page, trying to close the app
          if (readyToExit.current) {
            // Back already pressed recently, exiting
            BackHandler.exitApp();
          } else {
            // Back pressed for the first time, show confirmation
            ToastAndroid.show("Press back again to exit", ToastAndroid.SHORT);
            readyToExit.current = true
            // Allow 5 seconds for the user to press back again
            setTimeout(() => {
              readyToExit.current = false
            }, 5000);
          }
        } else {
          // Not on the home page, go back
          webViewRef.current.goBack();
        }
        return true;
      }
      return true;
    });
    
    return () => {
      handler?.remove()
    }
  }, []);

  const handleWebViewNavigationStateChange = useCallback((
    newNavState: WebViewNavigation
  ) => {
    webViewUrl.current = newNavState.url;
  }, []);

  const postCurrentPosition = useCallback(async () => {
    try {
      if (!(await hasServicesEnabledAsync())) return;
      const {
        coords: { latitude, longitude },
      } = await getCurrentPositionAsync({
        accuracy: Accuracy.BestForNavigation,
      });
      webViewRef.current?.postMessage(
        JSON.stringify({ lat: latitude, lng: longitude, type: "location" })
      );
      console.log("post location: " + JSON.stringify({ latitude, longitude }));
    } catch (e) {
      console.log("cannot get current position", e);
    }
  }, []);

  useEffect(() => {
    let headingSubscription = { remove: () => {} };
    let positionSubscription = { remove: () => {} };
    if (
      locationPermission?.status === LocationPermissionStatus.GRANTED &&
      geolocationStatus === "granted" &&
      appIsInForeground
    ) {
      hasServicesEnabledAsync().then(enabled => {
        if (!enabled) return;
        postCurrentPosition();
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
      })
    }
    return () => {
      headingSubscription.remove();
      positionSubscription.remove();
    };
  }, [
    locationPermission?.status,
    geolocationStatus,
    appIsInForeground,
    postCurrentPosition,
  ]);

  const handleOnMessage = useCallback((e: any) => {
    try {
      const {
        nativeEvent: { data },
      } = e;
      const message = JSON.parse(data) as any;
      if (message.type === "start-geolocation") {
        if (locationPermission?.granted) {
          // setGeolocationStatus is a no-op when the status is unchanged, so the
          // watcher effect does not re-run and the reloaded WebView would sit on
          // its stale seed until the user physically moves. WebView reload.
          setGeolocationStatus("granted");
          postCurrentPosition();
        } else if (message.force) {
          // Explicit user action (e.g. tapping "use my location"): re-run the
          // full flow, clearing any prior decline. geolocationStatus updates via
          // the locationPermission effect once the request resolves.
          requestLocationWithConsent(true);
        } else if (locationPermission?.canAskAgain) {
          // Automatic request: honors a persisted decline inside the flow.
          requestLocationWithConsent(false);
        } else {
          setGeolocationStatus("closed");
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
      } else if (message.type === "color-mode") {
        setWebAppActualColorMode(message.value);
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
  }, [locationPermission, requestLocationWithConsent, postCurrentPosition]);

  // Once the permission flow resolves to a definite status, reflect it in
  // geolocationStatus. This no longer gates rendering — the WebView mounts
  // immediately (see below) so the splash screen always dismisses on load,
  // independent of how/whether the permission flow completes.
  useEffect(() => {
    if (
      locationPermission === null ||
      locationPermission.status === undefined ||
      locationPermission.status === LocationPermissionStatus.UNDETERMINED
    ) {
      return;
    }
    setGeolocationStatus(locationPermission.granted ? "granted" : "closed");
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
    // Push the current permission status to the web app whenever it changes.
    // The initial value is also posted from the WebView's onLoadEnd, so a value
    // posted here before the page has loaded is harmless.
    webViewRef?.current?.postMessage(
      JSON.stringify({
        type: "geoPermission",
        value: geolocationStatus,
      })
    );
    console.log("post geoPermission: "+JSON.stringify(geolocationStatus))
    postAlarmToWebView(webViewRef)
  }, [geolocationStatus]);

  const runFirst = useMemo(
    () => `
    window.RnOs = "${Platform.OS}";
    window.iOSRNWebView = ${Platform.OS === 'ios'};
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

    window.systemColorSchemeCallbacks = [];
    window.systemColorScheme = new Proxy(
      { value: ${JSON.stringify(systemColorScheme)} },
      {
        set(target, property, value) {
          const result = Reflect.set(target, property, value);
          if (result) {
            window.systemColorSchemeCallbacks.forEach((callback) =>
              callback(value)
            );
          } else {
            console.error(
              "Failed to set window.systemColorScheme.",
              property,
              "to",
              value
            );
          }
          return result;
        },
      }
    );

    true; // note: this is required, or you'll sometimes get silent failures
  `,
    [trackingPermission]
  );

  useEffect(() => {
    webViewRef.current?.injectJavaScript(
      `if (window.systemColorScheme && typeof window.systemColorScheme === "object") {
        window.systemColorScheme.value = ${JSON.stringify(systemColorScheme)};
      }`
    );
  }, [systemColorScheme]);

  useEffect(() => {
    if (Platform.OS !== "android") {
      return;
    }
    // Under SDK 54+ mandatory edge-to-edge, the navigation bar is transparent
    // and its background can no longer be set (the web app draws behind it via
    // its own safe-area insets). Only the button/icon style is controllable.
    NavigationBar.setStyle(
      webAppActualColorMode === "light" ? "dark" : "light"
    );
  }, [webAppActualColorMode]);

  const handleContentTerminate = useCallback(() => {
    webViewRef.current?.reload();
  }, []);

  // When the app returns to the foreground, some Android WebViews don't fire
  // `visibilitychange`, so the web app's ETA polling stays paused and every
  // time is stuck "loading". Dispatch a `focus` event into the page to force
  // it to resume (the web app listens for focus/pageshow to re-enable polling).
  useEffect(() => {
    if (appIsInForeground) {
      webViewRef.current?.injectJavaScript(
        "window.dispatchEvent(new Event('focus')); true;"
      );
    }
  }, [appIsInForeground]);

  // Final safety net: hide the splash screen unconditionally a few seconds after
  // mount. onLoadEnd is the normal path, but if it never fires (e.g. the error
  // view is shown before the page finishes loading) this guarantees the user is
  // never left staring at the splash screen.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 8000);
    return () => clearTimeout(t);
  }, []);

  const uri = url?.startsWith("https://hkbus.app") ? url : "https://hkbus.app/";

  return (
    <>
      {/* White status bar icons on every platform and theme. */}
      <StatusBar style="light" />
      <View
        style={[
          styles.container,
          {
            backgroundColor:
              webAppActualColorMode === "light" ? "#FEDB00" : "#000",
          },
        ]}
      >
          {/*
            Android: under enforced edge-to-edge the status bar is transparent,
            so it would show whatever the web page draws underneath (yellow
            header in light mode -> white icons on yellow). Reserve the top
            inset with a solid black strip so the status bar is always
            white-on-black regardless of theme.
          */}
          {Platform.OS === "android" && (
            <View style={{ height: insets.top, backgroundColor: "#000" }} />
          )}
          <WebView
            ref={webViewRef}
            style={styles.webview}
            source={{ uri }}
            cacheEnabled
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
            limitsNavigationsToAppBoundDomains={true}
            renderError={(_domain, _code, desc) => (
              <View
                style={[
                  styles.errorContainer,
                  {
                    backgroundColor:
                      webAppActualColorMode === "light" ? "#FEDB00" : "#000",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.errorTitle,
                    { color: webAppActualColorMode === "light" ? "#000" : "#fff" },
                  ]}
                >
                  未能連線 / Offline
                </Text>
                <Text
                  style={[
                    styles.errorText,
                    { color: webAppActualColorMode === "light" ? "#000" : "#ccc" },
                  ]}
                >
                  無法連接伺服器，請檢查網絡連線。{"\n"}
                  Can't reach the server. Please check your connection.
                </Text>
                <TouchableOpacity
                  style={[
                    styles.retryButton,
                    {
                      backgroundColor:
                        webAppActualColorMode === "light" ? "#000" : "#FEDB00",
                    },
                  ]}
                  onPress={() => webViewRef.current?.reload()}
                >
                  <Text
                    style={[
                      styles.retryButtonText,
                      {
                        color: webAppActualColorMode === "light" ? "#FEDB00" : "#000",
                      },
                    ]}
                  >
                    重試 / Retry
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
            overScrollMode="content"
            onNavigationStateChange={handleWebViewNavigationStateChange}
            onLoadEnd={() => {
              SplashScreen.hide()
              applyAndroidSafeAreaInsets()
              webViewRef?.current?.postMessage(
                JSON.stringify({
                  type: "geoPermission",
                  value: geolocationStatus,
                })
              );
              console.log("post geoPermission: "+JSON.stringify(geolocationStatus))
              postAlarmToWebView(webViewRef)
            }}
            startInLoadingState
          />
      </View>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
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
  loadingView: {
    backgroundColor: "black",
    width: "100%",
    height: "100%",
  },
  errorContainer: {
    flex: 1,
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 12,
    textAlign: "center",
  },
  errorText: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 24,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
