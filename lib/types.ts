export type Role = "employee" | "hub_admin" | "super_admin"

export type SessionData = {
  userId: string
  role: Role
  name: string
  hubId: string | null
  employeeId: string | null
}

export type Hub = {
  id: string
  uid: string
  slug: string
  name: string
  city: string | null
  latitude: number | null
  longitude: number | null
  geofence_radius: number
  geofence_enabled: boolean
  is_active: boolean
  created_at: string
}

export type Shift = {
  id: string
  hub_id: string
  name: string
  start_time: string
  end_time: string
  created_at: string
}

export type Employee = {
  id: string
  hub_id: string | null
  shift_id: string | null
  device_id: string | null
  uid: string
  public_id: string
  name: string
  role: string
  organization: string | null
  department: string | null
  username: string | null
  avatar: string | null
  is_vip: boolean
  is_active: boolean
  created_at: string
}

export type AttendanceLog = {
  id: string
  employee_id: string
  hub_id: string | null
  date: string
  check_in_time: string | null
  check_out_time: string | null
  work_duration: string | null
  status: string | null
  location_in_lat: number | null
  location_in_lng: number | null
  location_out_lat: number | null
  location_out_lng: number | null
  device_id_used: string | null
  is_excused: boolean
  created_at: string
}

export type DirectorAttendanceLog = {
  id: string
  user_id: string
  hub_id: string | null
  date: string
  check_in_time: string | null
  check_out_time: string | null
  work_duration: string | null
  status: string | null
  location_in_lat: number | null
  location_in_lng: number | null
  location_out_lat: number | null
  location_out_lng: number | null
  created_at: string
}

export type Break = {
  id: string
  attendance_log_id: string
  start_time: string
  end_time: string | null
  created_at: string
}

export type GeofenceEvent = {
  id: string
  employee_id: string
  hub_id: string
  event_type: string
  latitude: number
  longitude: number
  accuracy: number | null
  distance_meters: number
  radius_meters: number
  created_at: string
}

export type EmployeeLocationPoint = {
  id: string
  employee_id: string
  hub_id: string
  latitude: number
  longitude: number
  accuracy: number | null
  distance_meters: number
  radius_meters: number
  is_inside_geofence: boolean
  recorded_at: string
}
