import { Stack } from "expo-router";
import { Text } from "react-native";

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="index"
        options={{
          headerTitle: () => <Text style={{ fontSize: 18, fontWeight: "bold" }}>Aero Agent</Text>,
        }}
      />
      <Stack.Screen
        name="login"
        options={{
          headerTitle: () => <Text style={{ fontSize: 18, fontWeight: "bold" }}>Login</Text>,
        }}
      />
      <Stack.Screen
        name="notebooks/index"
        options={{
          headerTitle: () => <Text style={{ fontSize: 18, fontWeight: "bold" }}>Notebooks</Text>,
        }}
      />
      <Stack.Screen
        name="notebooks/[notebookId]"
        options={{ headerBackTitle: 'Notebooks' }}
      />
    </Stack>
  )
}
