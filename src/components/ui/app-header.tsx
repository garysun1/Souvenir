import type { ReactNode } from "react";

export function AppHeader({
  title,
  left,
  right,
}: {
  title?: string;
  left?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-10 grid min-h-16 grid-cols-[1fr_auto_1fr] items-center border-b border-divider bg-white/95 px-[18px] backdrop-blur lg:grid-cols-[auto_1fr_auto] lg:px-8">
      <div className="justify-self-start">{left}</div>
      <div className="font-serif text-[25px] font-extrabold leading-8 text-brand lg:text-left lg:text-[28px]">
        {title ? title : <span className="lg:hidden">souvenir</span>}
      </div>
      <div className="justify-self-end">{right}</div>
    </header>
  );
}
