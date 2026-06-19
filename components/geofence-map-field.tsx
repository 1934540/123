"use client"

import { useEffect, useMemo, useState } from "react"
import { Circle, CircleMarker, MapContainer, TileLayer, useMap, useMapEvents } from "react-leaflet"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const ASTANA_CENTER: [number, number] = [51.0909, 71.4187]

type GeofenceMapFieldProps = {
  latitude: number | null | undefined
  longitude: number | null | undefined
  radius: number | null | undefined
  enabled?: boolean
}

export function GeofenceMapField({
  latitude,
  longitude,
  radius,
  enabled = true,
}: GeofenceMapFieldProps) {
  const initialPosition = useMemo<[number, number]>(
    () => [latitude ?? ASTANA_CENTER[0], longitude ?? ASTANA_CENTER[1]],
    [latitude, longitude],
  )
  const [position, setPosition] = useState<[number, number]>(initialPosition)
  const [radiusMeters, setRadiusMeters] = useState(Math.max(20, Math.round(radius ?? 150)))

  return (
    <div className="space-y-3">
      <input type="hidden" name="latitude" value={position[0].toFixed(6)} />
      <input type="hidden" name="longitude" value={position[1].toFixed(6)} />
      <input type="hidden" name="radius" value={radiusMeters} />

      <div className="overflow-hidden rounded-lg border border-border">
        <MapContainer
          center={position}
          zoom={16}
          scrollWheelZoom
          className="h-[300px] w-full bg-muted"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapClickHandler onPick={setPosition} />
          <MapRecenter position={position} />
          <Circle
            center={position}
            radius={radiusMeters}
            pathOptions={{ color: "#2dd4bf", fillColor: "#2dd4bf", fillOpacity: 0.16 }}
          />
          <CircleMarker
            center={position}
            radius={7}
            pathOptions={{ color: "#0f766e", fillColor: "#2dd4bf", fillOpacity: 1, weight: 3 }}
          />
        </MapContainer>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <ReadOnlyValue label="Latitude" value={position[0].toFixed(6)} />
        <ReadOnlyValue label="Longitude" value={position[1].toFixed(6)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="geofence-radius">Радиус, м</Label>
        <Input
          id="geofence-radius"
          type="number"
          min={20}
          step={10}
          value={radiusMeters}
          onChange={(event) => setRadiusMeters(Math.max(20, Number(event.target.value) || 20))}
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="enabled"
          defaultChecked={enabled}
          className="size-4 accent-primary"
        />
        Геозонаны қосу
      </label>
    </div>
  )
}

function MapClickHandler({ onPick }: { onPick: (position: [number, number]) => void }) {
  useMapEvents({
    click(event) {
      onPick([event.latlng.lat, event.latlng.lng])
    },
  })
  return null
}

function MapRecenter({ position }: { position: [number, number] }) {
  const map = useMap()
  useEffect(() => {
    map.setView(position, map.getZoom(), { animate: true })
  }, [map, position])
  return null
}

function ReadOnlyValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex h-8 items-center rounded-lg border border-input bg-input/30 px-2.5 font-mono text-sm">
        {value}
      </div>
    </div>
  )
}
