import { isArkhamHorrorMode } from "@/utils/arkham-horror-mode";

interface Props {
  children: string;
}

export function PageTitle({ children }: Props) {
  return (
    <title>
      {isArkhamHorrorMode()
        ? "Arkham Horror"
        : `${children} · ${import.meta.env.VITE_PAGE_NAME}`}
    </title>
  );
}
