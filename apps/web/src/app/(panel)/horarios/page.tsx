"use client";

import { Alert, FullScreenLoader } from "@/components/ui";
import { useAuth } from "@/lib/auth/auth-context";
import { todayIn } from "@/lib/format";
import { useSchedule } from "@/lib/schedule/use-schedule";
import { TimeOffs } from "./time-offs";
import { WeekEditor } from "./week-editor";

export default function SchedulePage() {
  const { user } = useAuth();
  const { week, timeOffs, loading, error, saveWeek, createTimeOff, removeTimeOff } = useSchedule();
  const canEdit = user?.role === "OWNER";

  if (loading) return <FullScreenLoader />;
  if (error || !week) return <Alert>{error ?? "No se pudo cargar el horario"}</Alert>;

  return (
    <div className="max-w-5xl space-y-10">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Horarios</h1>
        <p className="mt-1 text-sm text-stone-500">
          Días y franjas en que se pueden reservar turnos. Usá varias franjas para el descanso (ej. 9 a 13 y 16 a 20).
        </p>
        <div className="mt-6">
          <WeekEditor initial={week.days} canEdit={canEdit} onSave={saveWeek} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Bloqueos</h2>
        <p className="mt-1 text-sm text-stone-500">
          Feriados, vacaciones o cualquier momento en que no se atiende. Esos horarios no se ofrecen en WhatsApp.
        </p>
        <div className="mt-5">
          <TimeOffs
            timeOffs={timeOffs}
            today={todayIn(week.timezone)}
            canEdit={canEdit}
            onCreate={createTimeOff}
            onRemove={removeTimeOff}
          />
        </div>
      </section>
    </div>
  );
}
