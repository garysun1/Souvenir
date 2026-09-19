export function AvatarStack({ names }: { names: string[] }) {
  const visible = names.slice(0, 3);
  const remaining = Math.max(0, names.length - visible.length);
  return (
    <div className="flex items-center" aria-label={`${names.length} people`}>
      {visible.map((name, index) => (
        <span
          key={name}
          className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-white bg-brand text-xs font-semibold text-white first:ml-0"
          style={{ zIndex: visible.length - index }}
          title={name}
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      ))}
      {remaining > 0 && (
        <span className="-ml-2 flex size-8 items-center justify-center rounded-full border-2 border-white bg-surface-muted text-xs font-semibold text-text-secondary">
          +{remaining}
        </span>
      )}
    </div>
  );
}
