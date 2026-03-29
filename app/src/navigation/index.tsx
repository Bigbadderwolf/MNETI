/**
 * MNETI Mobile — Navigation
 * app/src/navigation/index.tsx
 *
 * Navigation structure:
 *   Root Stack
 *     ├── Auth Stack (wallet not connected)
 *     │   ├── WelcomeScreen
 *     │   └── ConnectWalletScreen
 *     └── Main Tab Navigator (wallet connected)
 *         ├── Home (HomeScreen)
 *         ├── Vault (VaultScreen)
 *         ├── Chama (ChamaScreen)
 *         ├── Payments (PaymentsScreen)
 *         ├── Remittance (RemittanceScreen)
 *         └── More Stack
 *             ├── CreditScoreScreen
 *             ├── KYCScreen
 *             └── SettingsScreen
 */

import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";

import { useMnetiStore, selectIsConnected } from "../store";
import HomeScreen       from "../screens/HomeScreen";
import VaultScreen      from "../screens/VaultScreen";
import ChamaScreen      from "../screens/ChamaScreen";
import PaymentsScreen   from "../screens/PaymentsScreen";
import RemittanceScreen from "../screens/RemittanceScreen";
import CreditScoreScreen from "../screens/CreditScoreScreen";
import KYCScreen        from "../screens/KYCScreen";
import SettingsScreen   from "../screens/SettingsScreen";

// ─── Stack / Tab Param Lists ──────────────────────────────────────────────────

export type RootStackParamList = {
  Auth:   undefined;
  Main:   undefined;
};

export type AuthStackParamList = {
  Welcome:       undefined;
  ConnectWallet: undefined;
};

export type MainTabParamList = {
  Home:       undefined;
  Vault:      undefined;
  Chama:      undefined;
  Payments:   undefined;
  Remittance: undefined;
  More:       undefined;
};

export type MoreStackParamList = {
  MoreHome:    undefined;
  CreditScore: undefined;
  KYC:         undefined;
  Settings:    undefined;
};

// ─── Navigators ───────────────────────────────────────────────────────────────

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainTab   = createBottomTabNavigator<MainTabParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

// ─── Placeholder Screens (Welcome + ConnectWallet) ────────────────────────────

function WelcomeScreen(): React.JSX.Element {
  const { setWallet } = useMnetiStore();
  return (
    <View style={styles.center}>
      <Text style={styles.logo}>🌍 MNETI</Text>
      <Text style={styles.tagline}>Africa's Sovereign Financial OS</Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => setWallet({ publicKey: "demo_wallet", connected: true, kycTier: 1 })}
      >
        <Text style={styles.btnText}>Connect Wallet</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── More Stack ───────────────────────────────────────────────────────────────

function MoreHomeScreen(): React.JSX.Element {
  return (
    <View style={styles.center}>
      <Text>More Options</Text>
    </View>
  );
}

function MoreNavigator(): React.JSX.Element {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false }}>
      <MoreStack.Screen name="MoreHome"    component={MoreHomeScreen} />
      <MoreStack.Screen name="CreditScore" component={CreditScoreScreen} />
      <MoreStack.Screen name="KYC"         component={KYCScreen} />
      <MoreStack.Screen name="Settings"    component={SettingsScreen} />
    </MoreStack.Navigator>
  );
}

// ─── Tab Icon Component ───────────────────────────────────────────────────────

function TabIcon({ label, focused }: { label: string; focused: boolean }): React.JSX.Element {
  const icons: Record<string, string> = {
    Home: "🏠", Vault: "🏦", Chama: "👥",
    Payments: "💳", Remittance: "✈️", More: "⋯",
  };
  return (
    <View style={styles.tabIcon}>
      <Text style={{ fontSize: 20 }}>{icons[label] ?? "•"}</Text>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

// ─── Main Tab Navigator ───────────────────────────────────────────────────────

function MainNavigator(): React.JSX.Element {
  return (
    <MainTab.Navigator
      screenOptions={({ route }) => ({
        headerShown:  false,
        tabBarStyle:  styles.tabBar,
        tabBarButton: (props) => (
          <TouchableOpacity {...props} activeOpacity={0.7} />
        ),
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} />
        ),
        tabBarLabel: () => null,
      })}
    >
      <MainTab.Screen name="Home"       component={HomeScreen} />
      <MainTab.Screen name="Vault"      component={VaultScreen} />
      <MainTab.Screen name="Chama"      component={ChamaScreen} />
      <MainTab.Screen name="Payments"   component={PaymentsScreen} />
      <MainTab.Screen name="Remittance" component={RemittanceScreen} />
      <MainTab.Screen name="More"       component={MoreNavigator} />
    </MainTab.Navigator>
  );
}

// ─── Root Navigator ───────────────────────────────────────────────────────────

export default function AppNavigation(): React.JSX.Element {
  const isConnected = useMnetiStore(selectIsConnected);

  return (
    <NavigationContainer>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {isConnected ? (
          <RootStack.Screen name="Main" component={MainNavigator} />
        ) : (
          <RootStack.Screen name="Auth">
            {() => (
              <AuthStack.Navigator screenOptions={{ headerShown: false }}>
                <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
              </AuthStack.Navigator>
            )}
          </RootStack.Screen>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const MNETI_GREEN  = "#00875A";
const MNETI_DARK   = "#0A0A0A";
const MNETI_GRAY   = "#9CA3AF";

const styles = StyleSheet.create({
  center: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: MNETI_DARK, padding: 24,
  },
  logo: { fontSize: 48, marginBottom: 8 },
  tagline: { color: MNETI_GRAY, fontSize: 16, marginBottom: 32 },
  btn: {
    backgroundColor: MNETI_GREEN, paddingHorizontal: 32,
    paddingVertical: 14, borderRadius: 12,
  },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  tabBar: {
    backgroundColor: "#111", borderTopColor: "#222",
    height: 70, paddingBottom: 8,
  },
  tabIcon: { alignItems: "center", justifyContent: "center", paddingTop: 4 },
  tabLabel: { fontSize: 10, color: MNETI_GRAY, marginTop: 2 },
  tabLabelActive: { color: MNETI_GREEN },
});
