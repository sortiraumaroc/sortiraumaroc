import { MEDIA_JOB_STEPS, mediaJobStepIndex } from "./mediaFactoryStatus";

export function MediaJobStepper(props: { status: string | null | undefined }) {
  const active = mediaJobStepIndex(props.status);

  return (
    <div className="w-full overflow-x-auto">
      <div className="min-w-[920px] flex items-center gap-2">
        {MEDIA_JOB_STEPS.map((step, idx) => {
          const done = idx < active;
          const isActive = idx === active;
          const dotCls = done
            ? "bg-primary border-primary"
            : isActive
              ? "bg-white border-primary"
              : "bg-white border-slate-300";
          const labelCls = done
            ? "text-slate-900"
            : isActive
              ? "text-primary"
              : "text-slate-500";
          const lineCls = done ? "bg-primary" : "bg-slate-200";

          return (
            <div key={step.key} className="flex items-center gap-2">
              <div className="flex items-center gap-2">
                <div className={`h-3 w-3 rounded-full border-2 ${dotCls}`} />
                <div
                  className={`text-[11px] font-semibold whitespace-nowrap ${labelCls}`}
                >
                  {step.label}
                </div>
              </div>
              {idx < MEDIA_JOB_STEPS.length - 1 ? (
                <div className={`h-px w-8 ${lineCls}`} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
