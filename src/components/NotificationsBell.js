'use client';

import { useClient } from "@/context/ClientContext";
import { Bell, Check, MailOpen, Trash2, ExternalLink, Inbox, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";
import { cn } from "@/lib/utils";

export default function NotificationsBell() {
    const { notifications, unreadCount, markAsRead, deleteNotification } = useClient();
    // console.log(notifications)

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full hover:bg-blue-50 group transition-all duration-300"
                >
                    <Bell className=" size-6 text-slate-500 group-hover:text-blue-600 transition-colors" />
                    {unreadCount > 0 && (
                        <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-600 border-2 border-white"></span>
                        </span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent
                align="end"
                sideOffset={12}
                className="w-[400px] p-0 border-2 border-slate-200/60 shadow-2xl shadow-blue-900/20 rounded-2xl overflow-hidden bg-white"
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                    <div className="space-y-0.5">
                        <h4 className="font-bold text-slate-950 tracking-tight">Notifications</h4>
                        <p className="text-[12px] text-slate-500">
                            You have {unreadCount} unread messages
                        </p>
                    </div>
                    {/* <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-blue-600">
                        <Settings2 className="w-4 h-4" />
                    </Button> */}
                </div>

                <ScrollArea className=" max-h-[450px] w-full">
                    {notifications?.length > 0 ? (
                        <div className="flex flex-col">
                            {notifications.map((notification) => {
                                let actionData = null;
                                if (notification.notification_action) {
                                    try {
                                        actionData = typeof notification.notification_action === 'string'
                                            ? JSON.parse(notification.notification_action)
                                            : notification.notification_action;
                                    } catch (e) { /* silent fail */ }
                                }

                                return (
                                    <div
                                        key={notification.id}
                                        className={cn(
                                            "group relative flex gap-4 p-5 border-b border-slate-50 transition-all hover:bg-slate-50/80",
                                            !notification.has_read && "bg-blue-50/30"
                                        )}
                                    >
                                        {/* Unread Indicator Dot */}
                                        {!notification.has_read && (
                                            <div className="absolute left-3 top-[26px] -translate-y-1/2 w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.6)]" />
                                        )}

                                        <div className="flex-1 space-y-3 pl-2">
                                            <div className="space-y-1">
                                                <p className={cn(
                                                    "text-[13px] leading-relaxed",
                                                    !notification.has_read ? "font-medium text-slate-800" : "text-slate-600"
                                                )}>
                                                    {notification.notification_msg}
                                                </p>

                                                {actionData?.button?.redirect && (
                                                    <div className="pt-2">
                                                        <Link href={actionData.button.redirect}>
                                                            <Button size="sm" className="h-8 px-4 text-[12px] font-medium bg-blue-50 text-blue-600 hover:bg-blue-100/80 hover:text-blue-700 border border-blue-100 shadow-none transition-all rounded-md">
                                                                View details
                                                                <ExternalLink className="ml-2 w-3.5 h-3.5" />
                                                            </Button>
                                                        </Link>
                                                    </div>
                                                )}

                                                {actionData?.url && (
                                                    <div className="pt-1">
                                                        <Link
                                                            href={actionData.url}
                                                            className="inline-flex items-center gap-1 text-[12px] font-bold text-blue-600 hover:underline decoration-2 underline-offset-4"
                                                        >
                                                            {actionData.label || 'View'}
                                                            <ExternalLink className="w-3 h-3" />
                                                        </Link>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                                                    {formatDistanceToNow(new Date(notification.created_at), { addSuffix: true })}
                                                </span>

                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                                    {!notification.has_read && (
                                                        <button
                                                            onClick={() => markAsRead(notification.id)}
                                                            className="p-1.5 cursor-pointer text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-all"
                                                            title="Mark as read"
                                                        >
                                                            <MailOpen className="w-3.5 h-3.5" strokeWidth={3} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => deleteNotification(notification.id)}
                                                        className="p-1.5 cursor-pointer text-slate-400 hover:text-rose-600 hover:bg-slate-100 rounded-md transition-all"
                                                        title="Delete"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center max-h-[400px] p-8 text-center">
                            <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4">
                                <Inbox className="w-8 h-8 text-slate-300" strokeWidth={1} />
                            </div>
                            <h5 className="text-sm font-bold text-slate-900">All caught up!</h5>
                            <p className="text-xs text-slate-500 mt-1 max-w-[180px]">
                                Your inbox is empty. We'll notify you when something happens.
                            </p>
                        </div>
                    )}
                </ScrollArea>

            </PopoverContent>
        </Popover>
    );
}