import Card from "../ui/Card";
import Button from "../ui/Button";
import Badge from "../ui/Badge";

const STATUS_LABELS = {
  idle: { label: "Non synchronisé", variant: "neutral" },
  partial: { label: "Synchronisation partielle", variant: "changes" },
  done: { label: "Synchronisé", variant: "approved" },
};

function formatDateTime(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function StudentRow({ student }) {
  const hasPoints =
    student.pointsApplied !== null && student.pointsApplied !== undefined;
  const hasTarget =
    student.markTarget !== null && student.markTarget !== undefined;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-text break-all">{student.email}</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge size="sm" variant={student.registered ? "approved" : "neutral"}>
            {student.registered ? "Inscrit" : "Non inscrit"}
          </Badge>
          <Badge size="sm" variant={student.present ? "approved" : "neutral"}>
            {student.present ? "Présent" : "Présence : en attente"}
          </Badge>
          <Badge size="sm" variant={hasPoints ? "approved" : "neutral"}>
            {hasPoints
              ? `${student.pointsApplied > 0 ? "+" : ""}${student.pointsApplied} pts`
              : "Points : en attente"}
          </Badge>
        </div>
      </div>
      {hasTarget && (
        <p className="mt-1 text-xs text-text-muted font-mono">
          Note my : {student.markBefore ?? "?"} → {student.markTarget}
        </p>
      )}
      {student.error && (
        <p className="mt-1.5 text-xs text-danger">{student.error}</p>
      )}
    </li>
  );
}

export default function MySyncCard({ project, onSync, isSyncing = false }) {
  if (!project || project.status !== "completed" || !project.defenseDate) {
    return null;
  }

  const sync = project.mySync || {};
  const status = sync.status || "idle";
  const meta = STATUS_LABELS[status] || STATUS_LABELS.idle;
  const students = sync.students || [];
  const lastAttempt = formatDateTime(sync.lastAttemptAt);
  const defenseDate = formatDateTime(project.defenseDate);

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-text-dim">
          Synchronisation my
        </h3>
        <Badge variant={meta.variant} dot>
          {meta.label}
        </Badge>
      </div>

      <dl className="space-y-1 text-sm">
        {defenseDate && (
          <div className="flex gap-2">
            <dt className="text-text-muted">Soutenance :</dt>
            <dd className="text-text">{defenseDate}</dd>
          </div>
        )}
        {sync.activityId && (
          <div className="flex gap-2">
            <dt className="text-text-muted">Activité my :</dt>
            <dd className="text-text font-mono">n° {sync.activityId}</dd>
          </div>
        )}
        {sync.eventId && (
          <div className="flex gap-2">
            <dt className="text-text-muted">Session :</dt>
            <dd className="text-text font-mono">n° {sync.eventId}</dd>
          </div>
        )}
        {lastAttempt && (
          <div className="flex gap-2">
            <dt className="text-text-muted">Dernière tentative :</dt>
            <dd className="text-text">{lastAttempt}</dd>
          </div>
        )}
      </dl>

      {sync.lastError && status !== "done" && (
        <div className="mt-4 rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {sync.lastError}
        </div>
      )}

      {students.length > 0 && (
        <ul className="mt-4 pt-4 border-t border-border divide-y divide-border">
          {students.map((student) => (
            <StudentRow key={student.email} student={student} />
          ))}
        </ul>
      )}

      {status !== "done" && (
        <Button
          variant="primary"
          onClick={onSync}
          loading={isSyncing}
          disabled={isSyncing}
          className="w-full mt-4"
        >
          {status === "idle" ? "Envoyer sur my" : "Relancer"}
        </Button>
      )}
    </Card>
  );
}
