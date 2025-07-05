import type { ConfigContext, ExpoConfig } from 'expo/config';
import withAndroidLocalizedName from './vendors/expo-android-localized-app-name';

module.exports = ({ config }: ConfigContext): ExpoConfig => {
  return {
    ...config,
    name: '巴士到站預報 - hkbus.app',
    slug: 'hkbus', // Replace with your app's slug
    version: '2.9.8', // Your app's version
    orientation: 'portrait',
    icon: './assets/icon.png',
    updates: {
      fallbackToCacheTimeout: 0,
      url: 'https://u.expo.dev/d05aadae-7952-423d-bc30-31504dfbf8d2',
      requestHeaders: {
        'expo-channel-name': 'production'
      },
      enabled: false
    },
    plugins: [
      [
        'expo-tracking-transparency',
        {
          userTrackingPermission: 'This identifier will be used to count the number of active users.'
        }
      ],
      [
        'expo-location',
        {
          locationAlwaysAndWhenInUsePermission: 'Geolocation permission will be used to alert your arrival for the stop',
          locationWhenInUsePermission: 'Your location will be used to determine the nearby bus stops',
          locationAlwaysPermission: 'Geolocation permission will be used to alert your arrival for the stop',
          isAndroidBackgroundLocationEnabled: true
        }
      ],
      [
        'expo-notifications',
        {
          icon: './assets/logo96.png',
          iosDisplayInForegroud: true
        }
      ],
      [
        'expo-build-properties',
        {
          android: {
            targetSdkVersion: 34,
            minSdkVersion: 24,
          }
        }
      ],
      //@ts-expect-error
      withAndroidLocalizedName,
      [
        'expo-splash-screen',
        {
          image: './assets/icon.png',
          backgroundColor: '#FDB813',
          imageWidth: 150,
          dark: {
            image: './assets/icon_dark.png',
            backgroundColor: '#000000',
          },
        }
      ]
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: 'app.hkbus',
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
        NSLocationAlwaysAndWhenInUseUsageDescription: 'Your location will be used to determine the nearby bus stops',
        NSLocationWhenInUseUsageDescription: 'Your location will be used to determine the nearby bus stops',
        NSUserTrackingUsageDescription: 'This identifier will be used to count the number of active users.',
        UIBackgroundModes: [
          'location',
          'remote-notification'
        ]
      },
      appStoreUrl: 'https://apps.apple.com/hk/app/%E5%B7%B4%E5%A3%AB%E5%88%B0%E7%AB%99%E9%A0%90%E5%A0%B1-hkbus-app/id1612184906',
      associatedDomains: [
        'applinks:hkbus.app'
      ],
      buildNumber: '18'
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#000000'
      },
      package: 'app.hkbus',
      versionCode: 33,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: [
            {
              scheme: 'https',
              host: 'hkbus.app',
              pathPrefix: '/'
            }
          ],
          category: [
            'BROWSABLE',
            'DEFAULT'
          ]
        }
      ],
    },
    web: {
      favicon: './assets/favicon.png'
    },
    extra: {
      eas: {
        projectId: 'd05aadae-7952-423d-bc30-31504dfbf8d2'
      }
    },
    runtimeVersion: {
      policy: 'appVersion'
    },
    locales: {
      en: './locales/en.json',
      'zh-Hant': './locales/zh-Hant.json'
    },
    owner: "hkbus-app",
    userInterfaceStyle: "automatic",
    newArchEnabled: true
  };
};