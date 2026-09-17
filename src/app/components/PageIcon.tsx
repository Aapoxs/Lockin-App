import type { Page } from "../workspace/workspaceTypes";

type PageIconProps = {
  page: Page;
};

export function PageIcon({ page }: PageIconProps) {
  return (
    <svg
      className="nav-page-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {page === "main" ? (
        <>
          <path d="m4 10 8-6 8 6" />
          <path d="M6 9.5V20h12V9.5" />
          <path d="M10 20v-5h4v5" />
        </>
      ) : page === "calendar" ? (
        <>
          <path d="M5 8h14" />
          <path d="M8 4v3" />
          <path d="M16 4v3" />
          <path d="M6 5.5h12a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6.5a1 1 0 0 1 1-1Z" />
        </>
      ) : page === "pomodoro" ? (
        <>
          <circle cx="12" cy="13" r="7" />
          <path d="M12 10v3l2 1.5" />
          <path d="M9 4h6" />
        </>
      ) : page === "kanban" ? (
        <>
          <path d="M5 6h14" />
          <path d="M5 12h14" />
          <path d="M5 18h14" />
          <path d="M9 6v12" />
          <path d="M15 6v12" />
        </>
      ) : (
        <path d="m5 12 4 4L19 6" />
      )}
    </svg>
  );
}
