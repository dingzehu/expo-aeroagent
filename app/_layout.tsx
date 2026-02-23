import { Stack } from "expo-router";

export default function RootLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#fff' },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 18, fontWeight: 'bold' },
        headerTitleAlign: 'center',
        contentStyle: { backgroundColor: '#fff' },
        animation: 'slide_from_right',
        headerBackVisible: true,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          headerTitle: "Aero Agent",
          headerLeft: () => null,
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          headerTitle: "Login",
        }}
      />
      <Stack.Screen
        name="notes"
        options={{
          headerTitle: "Studio",
          headerBackVisible: false,
        }}
      />
      <Stack.Screen
        name="thoughts"
        options={{
          headerTitle: "Thoughts",
        }}
      />
    </Stack>
  )
}
