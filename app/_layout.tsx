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
        name="notebooks/index"
        options={{
          headerTitle: "Notebooks",
        }}
      />
      <Stack.Screen
        name="notebooks/[notebookId]"
        options={{
          headerTitle: "Notebook",
          headerBackTitle: 'Back',
        }}
      />
      <Stack.Screen
        name="notes"
        options={{
          headerTitle: "Studio",
          headerBackVisible: false,
        }}
      />
    </Stack>
  )
}
