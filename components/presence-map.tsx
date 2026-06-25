"use client"

import { Circle, CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet"

type PresenceMapEmployee = {
  id: string
  name: string
  latitude: number
  longitude: number
  isFresh: boolean
  isInside: boolean
  distanceMeters: number
  recordedAt: string
  ageMinutes: number
}

type PresenceMapProps = {
  hub: {
    name: string
    latitude: number | null
    longitude: number | null
    radius: number
  }
  employees: PresenceMapEmployee[]
}

const FALLBACK_CENTER: [number, number] = [51.0909, 71.4187]

function formatPointAge(minutes: number): string {
  if (minutes < 1) return "только что"
  if (minutes < 60) return `${minutes} мин назад`

  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  return restMinutes > 0 ? `${hours} ч ${restMinutes} мин назад` : `${hours} ч назад`
}

export function PresenceMap({ hub, employees }: PresenceMapProps) {
  const center: [number, number] =
    hub.latitude != null && hub.longitude != null ? [hub.latitude, hub.longitude] : FALLBACK_CENTER

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <MapContainer center={center} zoom={16} scrollWheelZoom className="h-[420px] w-full bg-muted">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Circle
          center={center}
          radius={hub.radius}
          pathOptions={{ color: "#0ea5e9", fillColor: "#0ea5e9", fillOpacity: 0.12 }}
        />
        <CircleMarker
          center={center}
          radius={8}
          pathOptions={{ color: "#0369a1", fillColor: "#0ea5e9", fillOpacity: 1, weight: 3 }}
        >
          <Popup>
            <strong>{hub.name}</strong>
            <br />
            Радиус: {hub.radius} м
          </Popup>
        </CircleMarker>

        {employees.map((employee) => {
          const color = !employee.isFresh ? "#64748b" : employee.isInside ? "#16a34a" : "#dc2626"
          const status = !employee.isFresh ? "Нет свежего GPS" : employee.isInside ? "На территории" : "Вне радиуса"

          return (
            <CircleMarker
              key={employee.id}
              center={[employee.latitude, employee.longitude]}
              radius={9}
              pathOptions={{ color, fillColor: color, fillOpacity: employee.isFresh ? 0.9 : 0.55, weight: 3 }}
            >
              <Popup>
                <strong>{employee.name}</strong>
                <br />
                {status}
                <br />
                Дистанция: {employee.distanceMeters} м
                <br />
                Последняя точка: {formatPointAge(employee.ageMinutes)}
                <br />
                Время точки: {new Date(employee.recordedAt).toLocaleString("ru-RU")}
              </Popup>
            </CircleMarker>
          )
        })}
      </MapContainer>
    </div>
  )
}
