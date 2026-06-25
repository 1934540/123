import * as Location from "expo-location"
import * as SecureStore from "expo-secure-store"
import * as TaskManager from "expo-task-manager"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Platform, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from "react-native"

const LOCATION_TASK = "astanahub-shift-location"
const TOKEN_KEY = "astanahub_mobile_token"
const EMPLOYEE_KEY = "astanahub_mobile_employee"
const API_URL_KEY = "astanahub_mobile_api_url"
const DEVICE_ID_KEY = "astanahub_mobile_device_id"
const OFFLINE_QUEUE_KEY = "astanahub_mobile_offline_queue"
const GPS_SAMPLE_INTERVAL_MS = 30 * 60 * 1000
const MAX_QUEUE_ITEMS = 100

const defaultApiUrl = process.env.EXPO_PUBLIC_API_URL || "http://100.0.1.95:3000"

type Employee = {
  id: string
  name: string
  username: string
}

type LoginResponse = {
  token: string
  employee: Employee
}

type AttendancePayload = {
  mode: "check_in" | "check_out"
  lat: number
  lng: number
  deviceId: string
  recordedAt: string
}

type LocationPayload = {
  lat: number
  lng: number
  accuracy: number | null
  deviceId: string
  recordedAt: string
}

type WorkLocationRequestPayload = {
  reason: string
  lat: number
  lng: number
  deviceId: string
  recordedAt: string
}

type OfflineQueueItem =
  | { id: string; type: "attendance"; payload: AttendancePayload; createdAt: string }
  | { id: string; type: "location"; payload: LocationPayload; createdAt: string }

type MobileApiPath = "/api/mobile/attendance" | "/api/mobile/location" | "/api/mobile/work-location-request"

class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

function createDeviceId(): string {
  const randomPart = Math.random().toString(36).slice(2)
  return `android-${Date.now().toString(36)}-${randomPart}`
}

function createQueueId(): string {
  const randomPart = Math.random().toString(36).slice(2)
  return `queued-${Date.now().toString(36)}-${randomPart}`
}

async function getDeviceId(): Promise<string> {
  const savedDeviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY)
  if (savedDeviceId) return savedDeviceId

  const deviceId = createDeviceId()
  await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId)
  return deviceId
}

async function readQueue(): Promise<OfflineQueueItem[]> {
  const raw = await SecureStore.getItemAsync(OFFLINE_QUEUE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as OfflineQueueItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function writeQueue(items: OfflineQueueItem[]): Promise<void> {
  const trimmed = items.slice(-MAX_QUEUE_ITEMS)
  if (trimmed.length === 0) {
    await SecureStore.deleteItemAsync(OFFLINE_QUEUE_KEY)
    return
  }

  await SecureStore.setItemAsync(OFFLINE_QUEUE_KEY, JSON.stringify(trimmed))
}

async function enqueueOffline(item: Omit<OfflineQueueItem, "id" | "createdAt">): Promise<number> {
  const queue = await readQueue()
  const nextQueue = [
    ...queue,
    {
      ...item,
      id: createQueueId(),
      createdAt: new Date().toISOString(),
    } as OfflineQueueItem,
  ]
  await writeQueue(nextQueue)
  return Math.min(nextQueue.length, MAX_QUEUE_ITEMS)
}

async function postJson<TPayload>(
  apiUrl: string,
  path: MobileApiPath,
  token: string,
  payload: TPayload,
): Promise<{ message?: string }> {
  const res = await fetch(`${apiUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
  const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string }
  if (!res.ok) throw new ApiError(body.error ?? "Ошибка синхронизации", res.status)
  return body
}

async function flushOfflineQueue(token: string, apiUrl: string): Promise<{ sent: number; remaining: number }> {
  const queue = await readQueue()
  if (queue.length === 0) return { sent: 0, remaining: 0 }

  const remaining: OfflineQueueItem[] = []
  let sent = 0

  for (let index = 0; index < queue.length; index++) {
    const item = queue[index]
    try {
      if (item.type === "attendance") {
        await postJson(apiUrl, "/api/mobile/attendance", token, item.payload)
      } else {
        await postJson(apiUrl, "/api/mobile/location", token, item.payload)
      }
      sent++
    } catch (error) {
      if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
        sent++
        continue
      }
      remaining.push(item, ...queue.slice(index + 1))
      break
    }
  }

  await writeQueue(remaining)
  return { sent, remaining: remaining.length }
}

TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
  if (error) return
  const locations = (data as { locations?: Location.LocationObject[] })?.locations ?? []
  const latest = locations[0]
  if (!latest) return

  const [token, apiUrl, deviceId] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(API_URL_KEY),
    getDeviceId(),
  ])
  if (!token || !apiUrl) return

  const payload: LocationPayload = {
    lat: latest.coords.latitude,
    lng: latest.coords.longitude,
    accuracy: latest.coords.accuracy,
    deviceId,
    recordedAt: new Date(latest.timestamp).toISOString(),
  }

  try {
    await postJson(apiUrl, "/api/mobile/location", token, payload)
    await flushOfflineQueue(token, apiUrl)
  } catch (postError) {
    if (!(postError instanceof ApiError)) {
      await enqueueOffline({ type: "location", payload })
    }
  }
})

export default function App() {
  const apiUrl = defaultApiUrl
  const [token, setToken] = useState<string | null>(null)
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [workReason, setWorkReason] = useState("")
  const [message, setMessage] = useState("Войдите под аккаунтом сотрудника")
  const [loading, setLoading] = useState(false)
  const [tracking, setTracking] = useState(false)
  const foregroundSubscription = useRef<Location.LocationSubscription | null>(null)
  const foregroundInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  const canWork = useMemo(() => Boolean(token && employee), [token, employee])

  useEffect(() => {
    void restoreSession()
  }, [])

  async function restoreSession() {
    await getDeviceId()
    const [savedToken, savedEmployee] = await Promise.all([
      SecureStore.getItemAsync(TOKEN_KEY),
      SecureStore.getItemAsync(EMPLOYEE_KEY),
    ])
    await SecureStore.setItemAsync(API_URL_KEY, defaultApiUrl)

    if (savedToken && savedEmployee) {
      setToken(savedToken)
      setEmployee(JSON.parse(savedEmployee) as Employee)
      const sync = await flushOfflineQueue(savedToken, defaultApiUrl)
      setMessage(sync.sent > 0 ? `Сессия восстановлена. Отправлено из очереди: ${sync.sent}` : "Сессия восстановлена")
    } else if (savedToken) {
      await SecureStore.deleteItemAsync(TOKEN_KEY)
    }

    setTracking(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false))
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
      await SecureStore.setItemAsync(EMPLOYEE_KEY, JSON.stringify(payload.employee))
      await SecureStore.setItemAsync(API_URL_KEY, apiUrl)
      setToken(payload.token)
      setEmployee(payload.employee)
      setPassword("")

      const sync = await flushOfflineQueue(payload.token, apiUrl)
      setMessage(sync.sent > 0 ? `Здравствуйте, ${payload.employee.name}. Отправлено из очереди: ${sync.sent}` : `Здравствуйте, ${payload.employee.name}`)
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
      const deviceId = await getDeviceId()
      const position = await currentPosition()
      const payload: AttendancePayload = {
        mode,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        deviceId,
        recordedAt: new Date(position.timestamp).toISOString(),
      }

      try {
        const result = await postJson(apiUrl, "/api/mobile/attendance", token, payload)
        await flushOfflineQueue(token, apiUrl)
        if (mode === "check_in") await startTracking()
        if (mode === "check_out") await stopTracking()
        setMessage(result.message ?? "Готово")
      } catch (postError) {
        if (postError instanceof ApiError) throw postError
        const queueSize = await enqueueOffline({ type: "attendance", payload })
        if (mode === "check_in") await startTracking()
        if (mode === "check_out") await stopTracking()
        setMessage(`Нет сети. Отметка сохранена и отправится позже. В очереди: ${queueSize}`)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка отметки")
    } finally {
      setLoading(false)
    }
  }

  async function requestWorkOutsideZone() {
    if (!token) return
    const reason = workReason.trim()
    if (reason.length < 5) {
      setMessage("Укажите причину: куда и зачем вы выехали по работе")
      return
    }

    setLoading(true)
    try {
      const deviceId = await getDeviceId()
      const position = await currentPosition()
      const payload: WorkLocationRequestPayload = {
        reason,
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        deviceId,
        recordedAt: new Date(position.timestamp).toISOString(),
      }
      const result = await postJson(apiUrl, "/api/mobile/work-location-request", token, payload)
      setWorkReason("")
      setMessage(result.message ?? "Заявка отправлена директору")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Заявка не отправлена")
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

    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
    await sendLocation(current).catch(() => undefined)

    await startForegroundTracking()
    if (Platform.OS !== "ios") {
      await startBackgroundTracking()
    }
    setTracking(true)
  }

  async function startForegroundTracking() {
    foregroundSubscription.current?.remove()
    foregroundSubscription.current = null
    if (foregroundInterval.current) clearInterval(foregroundInterval.current)

    foregroundInterval.current = setInterval(() => {
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then(sendLocation)
        .catch((error) => {
          setMessage(error instanceof Error ? error.message : "GPS-точка не сохранена")
        })
    }, GPS_SAMPLE_INTERVAL_MS)
  }

  async function startBackgroundTracking() {
    const background = await Location.requestBackgroundPermissionsAsync()
    if (!background.granted) throw new Error("Разрешите фоновый доступ к GPS")

    const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
    if (alreadyStarted) return

    await Location.startLocationUpdatesAsync(LOCATION_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: GPS_SAMPLE_INTERVAL_MS,
      distanceInterval: 50,
      deferredUpdatesInterval: GPS_SAMPLE_INTERVAL_MS,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "AstanaHub Employee",
        notificationBody: "GPS-мониторинг смены активен",
        notificationColor: "#175cd3",
      },
    })
  }

  async function sendLocation(position: Location.LocationObject) {
    if (!token) return
    const deviceId = await getDeviceId()
    const payload: LocationPayload = {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
      accuracy: position.coords.accuracy,
      deviceId,
      recordedAt: new Date(position.timestamp).toISOString(),
    }

    try {
      await postJson(apiUrl, "/api/mobile/location", token, payload)
      await flushOfflineQueue(token, apiUrl)
    } catch (error) {
      if (error instanceof ApiError) throw error
      const queueSize = await enqueueOffline({ type: "location", payload })
      throw new Error(`Нет сети. GPS-точка сохранена в очередь (${queueSize})`)
    }
  }

  async function stopTracking() {
    foregroundSubscription.current?.remove()
    foregroundSubscription.current = null
    if (foregroundInterval.current) clearInterval(foregroundInterval.current)
    foregroundInterval.current = null
    const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK).catch(() => false)
    if (started) await Location.stopLocationUpdatesAsync(LOCATION_TASK)
    setTracking(false)
  }

  async function logout() {
    await stopTracking()
    await SecureStore.deleteItemAsync(TOKEN_KEY)
    await SecureStore.deleteItemAsync(EMPLOYEE_KEY)
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
            <TextInput
              value={workReason}
              onChangeText={setWorkReason}
              placeholder="Причина работы вне зоны"
              multiline
              style={[styles.input, styles.reasonInput]}
            />
            <ActionButton label="Вне зоны по работе" onPress={requestWorkOutsideZone} disabled={loading} />
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
  reasonInput: {
    minHeight: 76,
    textAlignVertical: "top",
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
