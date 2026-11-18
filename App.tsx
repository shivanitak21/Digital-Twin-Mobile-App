import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastHost } from './src/components/ToastHost';
import { StudioScreen } from './src/screens/StudioScreen';
import { ThemeProvider, useTheme } from './src/theme';

export type RootStackParamList = {
  Studio: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

function ThemedShell() {
  const colors = useTheme();
  const navigationTheme = colors.mode === 'dark' ? DarkTheme : DefaultTheme;
  const theme = {
    ...navigationTheme,
    colors: {
      ...navigationTheme.colors,
      background: colors.bg,
      card: colors.card,
      text: colors.ink,
      border: colors.line,
      primary: colors.blue,
      notification: colors.red,
    },
  };
  return (
    <View style={[styles.shell, { backgroundColor: colors.bg }]}>
      <StatusBar style={colors.statusBar} />
      <NavigationContainer theme={theme}>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Studio" component={StudioScreen} />
        </Stack.Navigator>
      </NavigationContainer>
      <ToastHost />
    </View>
  );
}

export default function App() {
  const scheme = useColorScheme();
  return (
    <GestureHandlerRootView style={[styles.root, { backgroundColor: scheme === 'dark' ? '#000000' : '#F2F2F7' }]}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedShell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  shell: { flex: 1 },
});
