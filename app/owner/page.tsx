import type React from "react"
import { Building2, Plus, Power, UserPlus } from "lucide-react"
import { createHubAction, createHubAdminAction, toggleHubAction } from "@/app/actions/owner"
import { requireRole } from "@/app/actions/auth"
import { DashboardShell } from "@/components/dashboard-shell"
import { EmptyState } from "@/components/empty-state"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getAdminClient } from "@/lib/supabase/admin"
import type { Hub } from "@/lib/types"

type HubAdmin = {
  id: string
  username: string
  display_name: string | null
  hub_id: string | null
}

export default async function OwnerPage() {
  const session = await requireRole("super_admin")
  const supabase = getAdminClient()

  const [{ data: hubs }, { data: admins }] = await Promise.all([
    supabase.from("hubs").select("*").order("created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, username, display_name, hub_id")
      .eq("role", "hub_admin")
      .order("username"),
  ])

  const hubList = (hubs ?? []) as Hub[]
  const adminList = (admins ?? []) as HubAdmin[]

  return (
    <DashboardShell session={session} title="Бас әкімші панелі">
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Хабтар" value={hubList.length} />
            <StatCard label="Белсенді" value={hubList.filter((hub) => hub.is_active).length} />
            <StatCard label="Директорлар" value={adminList.length} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Хабтар</CardTitle>
              <CardDescription>Геозона және белсенділік күйі.</CardDescription>
            </CardHeader>
            <CardContent>
              {hubList.length === 0 ? (
                <EmptyState>Әзірге хаб жоқ.</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Атауы</TableHead>
                      <TableHead>Қала</TableHead>
                      <TableHead>Радиус</TableHead>
                      <TableHead>Күй</TableHead>
                      <TableHead className="text-right">Әрекет</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hubList.map((hub) => (
                      <TableRow key={hub.id}>
                        <TableCell className="font-medium">{hub.name}</TableCell>
                        <TableCell>{hub.city ?? "—"}</TableCell>
                        <TableCell>{hub.geofence_radius} м</TableCell>
                        <TableCell>
                          <Badge variant={hub.is_active ? "default" : "secondary"}>
                            {hub.is_active ? "Белсенді" : "Өшірілген"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <form action={formAction(toggleHubAction)}>
                            <input type="hidden" name="hubId" value={hub.id} />
                            <input type="hidden" name="isActive" value={String(hub.is_active)} />
                            <Button size="sm" variant="outline" type="submit">
                              <Power className="h-4 w-4" />
                              {hub.is_active ? "Өшіру" : "Қосу"}
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Жаңа хаб
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={formAction(createHubAction)} className="space-y-3">
                <Field label="Атауы" name="name" placeholder="AstanaHub Office" required />
                <Field label="Қала" name="city" placeholder="Астана" />                <Button type="submit" className="w-full">
                  <Building2 className="h-4 w-4" />
                  Құру
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Хаб директоры
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form action={formAction(createHubAdminAction)} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="hubId">Хаб</Label>
                  <select
                    id="hubId"
                    name="hubId"
                    required
                    className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <option value="">Таңдау</option>
                    {hubList.map((hub) => (
                      <option key={hub.id} value={hub.id}>
                        {hub.name}
                      </option>
                    ))}
                  </select>
                </div>
                <Field label="Аты" name="displayName" placeholder="Директор" />
                <Field label="Логин" name="username" placeholder="astana_admin" required />
                <Field label="Құпиясөз" name="password" type="password" required />
                <Button type="submit" className="w-full">
                  <UserPlus className="h-4 w-4" />
                  Қосу
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
      </div>
    </DashboardShell>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function formAction(action: (formData: FormData) => Promise<unknown>) {
  return action as (formData: FormData) => Promise<void>
}

function Field(props: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const { label, name, ...inputProps } = props
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...inputProps} />
    </div>
  )
}
