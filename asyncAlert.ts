import { Alert } from "react-native"

export const AsyncAlert = async (info: string, message: string = "") => new Promise((resolve) => {
  Alert.alert(
    info,
    message,
    [
      {
        text: 'ok',
        onPress: () => {
          resolve('YES');
        },
      },
    ],
    { cancelable: false },
  );
});