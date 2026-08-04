"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { listMyNotificationsAction, markNotificationReadAction, type NotificationListItem } from "./notifications/actions";

function entityHref(notification: Pick<NotificationListItem, "entityType" | "entityId">): string | null {
  if (!notification.entityId) return null;
  if (notification.entityType === "Task") return `/tasks/${notification.entityId}`;
  if (notification.entityType === "Visit") return `/visits/${notification.entityId}`;
  return null;
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  const diffMinutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.round(diffHours / 24);
  return `há ${diffDays}d`;
}

export function NotificationBell({ initialUnreadCount }: { initialUnreadCount: number }) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [notifications, setNotifications] = useState<NotificationListItem[] | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next && notifications === null) {
      setStatus("loading");
      startTransition(async () => {
        try {
          const list = await listMyNotificationsAction();
          setNotifications(list);
          setStatus("idle");
        } catch {
          setStatus("error");
        }
      });
    }
  }

  function handleMarkRead(id: string) {
    setNotifications((prev) => prev?.map((n) => (n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n)) ?? prev);
    setUnreadCount((prev) => Math.max(0, prev - 1));
    startTransition(() => {
      markNotificationReadAction(id).catch(() => {
        // Falha silenciosa: o pior caso é o contador ficar um pouco
        // otimista até o próximo carregamento — não vale bloquear a UI.
      });
    });
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="notifications-panel"
        aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lida(s)` : "Notificações"}
        onClick={toggleOpen}
        className="relative flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-medium text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notifications-panel"
          role="region"
          aria-label="Notificações"
          className="fixed inset-x-4 top-16 z-30 rounded-lg border border-slate-200 bg-white text-sm shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-80"
        >
          <div className="border-b border-slate-100 px-4 py-2 font-semibold text-slate-700">Notificações</div>

          {status === "loading" && <p className="px-4 py-6 text-center text-slate-500">Carregando…</p>}

          {status === "error" && (
            <div className="px-4 py-6 text-center">
              <p className="text-red-600">Não foi possível carregar as notificações.</p>
              <button
                type="button"
                onClick={() => {
                  setNotifications(null);
                  setStatus("loading");
                  startTransition(async () => {
                    try {
                      const list = await listMyNotificationsAction();
                      setNotifications(list);
                      setStatus("idle");
                    } catch {
                      setStatus("error");
                    }
                  });
                }}
                className="mt-2 text-brand-dark underline hover:no-underline"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {status === "idle" && notifications && notifications.length === 0 && (
            <p className="px-4 py-6 text-center text-slate-500">Nenhuma notificação.</p>
          )}

          {status === "idle" && notifications && notifications.length > 0 && (
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {notifications.map((n) => {
                const href = entityHref(n);
                const isUnread = !n.readAt;
                const content = (
                  <div className="flex items-start gap-2 px-4 py-3">
                    {isUnread && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                    <div className={`min-w-0 flex-1 ${isUnread ? "" : "pl-4"}`}>
                      <p className={`truncate ${isUnread ? "font-medium text-slate-800" : "text-slate-600"}`}>{n.title}</p>
                      {n.body && <p className="mt-0.5 truncate text-xs text-slate-500">{n.body}</p>}
                      <p className="mt-0.5 text-xs text-slate-400">{formatRelative(n.createdAt)}</p>
                    </div>
                  </div>
                );

                return (
                  <li key={n.id}>
                    <div className="flex items-center justify-between hover:bg-slate-50">
                      {href ? (
                        <Link href={href} onClick={() => { handleMarkRead(n.id); setOpen(false); }} className="flex-1">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex-1">{content}</div>
                      )}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={() => handleMarkRead(n.id)}
                          disabled={isPending}
                          className="mr-3 shrink-0 whitespace-nowrap text-xs text-brand-dark underline hover:no-underline"
                        >
                          Marcar como lida
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
