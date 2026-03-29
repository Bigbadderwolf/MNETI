/**
 * MNETI Mobile — Root App Component
 * app/src/App.tsx
 */

import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import NetInfo from "@react-native-community/netinfo";
import AppNavigation from "./navigation";
import { useMnetiStore } from "./store";

export default function App(): React.JSX.Element {
  const { setOnline } = useMnetiStore();

  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected ?? false);
    });
    return () => unsub();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar barStyle="light-content" backgroundColor="#0A0A0A" />
      <AppNavigation />
    </GestureHandlerRootView>
  );
}
