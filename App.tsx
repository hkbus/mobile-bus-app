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
  ImageBackground,
  Share,
  ScrollView,
  RefreshControl,
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

  const [geolocationStatus, setGeolocationStatus] = useState<"granted" | "closed" | null>(null)

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = React.useCallback(() => {
    webViewRef.current?.reload()
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
    }, 2000);
  }, []);

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

  useEffect(() => {
    let headingSubscription = {remove: () => {}}
    let positionSubscription = {remove: () => {}}
    if ( locationPermission?.status === LocationPermissionStatus.GRANTED && geolocationStatus === 'granted' ) {
      watchHeadingAsync(({accuracy, trueHeading}) => {
        webViewRef?.current?.postMessage(JSON.stringify({accuracy, degree: 360 - trueHeading, type: "compass"}))
      }).then(s => headingSubscription = s)
      watchPositionAsync({accuracy: Accuracy.BestForNavigation, }, ({coords: { latitude, longitude }}) => {
        webViewRef?.current?.postMessage(JSON.stringify({lat: latitude, lng: longitude, type: "location"}))
      }).then(s => positionSubscription = s)
    }
    return () => {
      headingSubscription.remove()
      positionSubscription.remove()
    }
  }, [locationPermission?.status, geolocationStatus])

  const handleOnMessage = useCallback((e: any) => {
    try {
      const {nativeEvent: { data }} = e
      const message = JSON.parse(data) as any
      if ( message.type === "start-geolocation" ) {
        if ( locationPermission?.granted ) {
          setGeolocationStatus("granted")
        } else {
          requestForegroundPermissionsAsync()
            .then(({status}) => {
              setGeolocationStatus(status === 'granted' ? "granted" : "closed")
            })
          }
      } else if ( message.type === 'stop-geolocation' ) {
        setGeolocationStatus("closed")
      } else if ( message.type === 'share' ) {
        Share.share({
          title: message?.value?.title ?? "",
          message: [message?.value?.text, message?.value?.url].filter(Boolean).join(' '),
          url: message?.value?.url,
        }, {
          dialogTitle: message?.value?.title,
          subject: message?.value?.title,
        })
      }
    } catch ( err ) {
      console.log("UNKNOWN message:", e)
    }
  }, [])

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

  useEffect(() => {
    webViewRef?.current?.postMessage(JSON.stringify({
      type: 'geoPermission',
      value: geolocationStatus,
    }))
  }, [geolocationStatus])
  
  const runFirst = useMemo(
    () => `
    window.RnOs = "${Platform.OS}";
    window.iOSRNWebView = ${Platform.OS === "ios"};
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
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }>
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
        />
        </ScrollView>
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
