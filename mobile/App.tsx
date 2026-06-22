import * as Location from "expo-location"
import * as SecureStore from "expo-secure-store"
import * as TaskManager from "expo-task-manager"
import { useEffect, useMemo, useState } from "react"
import { ActivityIndicator, Alert, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native"

const LOCATION_TASK = "astanahub-shift-location"
const TOKEN_KEY = "astanahub_mobile_token"
const API_URL_KEY = "astanahub_mobile_api_url"

const defaultApiUrl = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3000"

type Employee = {
  id: string
  name: string
  username: string
}

type LoginResponse = {
  token: string
  employee: Employee
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return
  const locations = (data as { locations?: Location.LocationObject[] })?.locations ?? []
  const latest = locations[0]
  if (!latest) return

  const [token, apiUrl] = await Promise.all([SecureStore.getItemAsync(TOKEN_KEY), SecureStore.getItemAsync(API_URL_KEY)])
  if (!token || !apiUrl) return

  await fetch(`${apiUrl}/api/mobile/location`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      lat: latest.coords.latitude,
      lng: latest.coords.longitude,
      accuracy: latest.coords.accuracy,
    }),
  }).catch(() => undefined)
})

export default function App() {
  const [apiUrl, setApiUrl] = useState(defaultApiUrl)
  const [token, setToken] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [message, setMessage] = useState("Войдите под аккаунтом сотрудника")
  const [loading, setLoading] = useState(false)
  const [tracking, setTracking] = useState(false)

  const canWork = useMemo(() => Boolean(token && employee), [token, employee])

  useEffect(() => {
    void restoreSession()
  }, [])

  async function restoreSession() {
    const savedToken = await SecureStore.getItemAsync(TOKEN_KEY)
    const savedApiUrl = await SecureStore.getItemAsync(API_URL_KEY)
    if (savedApiUrl) setApiUrl(savedApiUrl)
    if (savedToken) {
      setToken(savedToken)
      setMessage("Сессия восстановлена")
    }
    setTracking(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))
  }

  async function login() {
    setLoading(true)
    try {
      const res = await fetch(`${apiUrl}/api/mobile/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const payload = (await res.json()) as LoginResponse & { error?: string }
      if (!res.ok) throw new Error(payload.error ?? "Ошибка входа")

      await SecureStore.setItemAsync(TOKEN_KEY, payload.token)
      await SecureStore.setItemAsync(API_URL_KEY, apiUrl)
      setToken(payload.token)
      setEmployee(payload.employee)
      setPassword("")
      setMessage(`Здравствуйте, ${payload.employee.name}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка входа")
    } finally {
      setLoading(false)
    }
  }

  async function mark(mode: "check_in" | "check_out") {
    if (!token) return
    setLoading(true)
    try {
      const position = await currentPosition()
      const res = await fetch(`${apiUrl}/api/mobile/attendance`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          deviceId: "mobile-app",
        }),
      })
      const payload = (await res.json()) as { message?: string; error?: string }
      if (!res.ok) throw new Error(payload.error ?? "Ошибка отметки")

      if (mode === "check_in") await startTracking()
      if (mode === "check_out") await stopTracking()
      setMessage(payload.message ?? "Готово")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка отметки")
    } finally {
      setLoading(false)
    }
  }

  async function currentPosition(): Promise<Location.LocationObject> {
    const permission = await Location.requestForegroundPermissionsAsync()
    if (!permission.granted) throw new Error("Разрешите доступ к GPS")
    return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
  }

  async function startTracking() {
    const foreground = await Location.requestForegroundPermissionsAsync()
    if (!foreground.granted) throw new Error("Разрешите доступ к GPS")

    const background = await Location.requestBackgroundPermissionsAsync()
    if (!background.granted) {
      Alert.alert("Фоновый GPS", "Разрешите постоянный доступ к геолокации, чтобы мониторинг работал во время смены.")
    }

    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
    if (!started) {
      await Location.startLocationUpdatesAsync(LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 180000,
        distanceInterval: 100,
        pausesUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "AstanaHub Employee",
          notificationBody: "GPS-мониторинг активен во время смены",
        },
      })
    }
    setTracking(true)
  }

  async function stopTracking() {
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK)
    setTracking(false)
  }

  async function logout() {
    await stopTracking()
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    setToken(null)
    setEmployee(null)
    setMessage("Вы вышли")
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.panel}>
        <Text style={styles.title}>AstanaHub Employee</Text>
        <Text style={styles.status}>{message}</Text>

        {!canWork ? (
          <View style={styles.form}>
            <TextInput value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" style={styles.input} />
            <TextInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              placeholder="Логин"
              style={styles.input}
            />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Пароль"
              secureTextEntry
              style={styles.input}
            />
            <ActionButton label="Войти" onPress={login} disabled={loading} primary />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={styles.name}>{employee?.name ?? "Сотрудник"}</Text>
            <Text style={styles.tracking}>{tracking ? "GPS-мониторинг активен" : "GPS-мониторинг выключен"}</Text>
            <View style={styles.row}>
              <ActionButton label="Пришел" onPress={() => mark("check_in")} disabled={loading} primary />
              <ActionButton label="Ушел" onPress={() => mark("check_out")} disabled={loading} />
            </View>
            <ActionButton label="Выйти" onPress={logout} disabled={loading} />
          </View>
        )}

        {loading && <ActivityIndicator style={styles.loader} />}
      </View>
    </SafeAreaView>
  )
}

function ActionButton({
  label,
  onPress,
  disabled,
  primary,
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, primary ? styles.primaryButton : styles.secondaryButton, disabled && styles.disabled]}
    >
      <Text style={[styles.buttonText, primary ? styles.primaryButtonText : styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#eef2f6",
    justifyContent: "center",
    padding: 20,
  },
  panel: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    padding: 20,
    gap: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: "#101828",
  },
  status: {
    color: "#475467",
    lineHeight: 20,
  },
  form: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: "#101828",
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButton: {
    backgroundColor: "#175cd3",
  },
  secondaryButton: {
    backgroundColor: "#eef4ff",
    borderWidth: 1,
    borderColor: "#b2ccff",
  },
  disabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "700",
  },
  primaryButtonText: {
    color: "#ffffff",
  },
  secondaryButtonText: {
    color: "#175cd3",
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#101828",
  },
  tracking: {
    color: "#027a48",
  },
  loader: {
    marginTop: 4,
  },
})
