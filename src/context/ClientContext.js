'use client';

import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';

const ClientContext = createContext();

export const ClientProvider = ({ children, initialClientDetails }) => {
    const [clientDetails, setClientDetails] = useState(initialClientDetails || null);
    const [notifications, setNotifications] = useState([]);

    // 1. Memoize the client so it doesn't recreate on every render
    const supabase = useMemo(() => createClient(), []);

    // Derived state: calculate unread count on the fly
    const unreadCount = useMemo(() =>
        notifications.filter(n => !n.has_read).length,
        [notifications]);

    const fetchNotifications = useCallback(async () => {
        if (!clientDetails?.email) return;

        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('client_email', clientDetails.email)
            .order('created_at', { ascending: false })
            .limit(50); // 2. Added a limit to prevent massive data loads

        if (!error) setNotifications(data || []);
    }, [clientDetails?.email, supabase]);

    // Initial load
    useEffect(() => {
        fetchNotifications();
    }, [fetchNotifications]);

    // Realtime Listener
    useEffect(() => {
        if (!clientDetails?.email) return;

        const channel = supabase
            .channel(`notifs-${clientDetails.email}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'notifications',
                filter: `client_email=eq.${clientDetails.email}`
            }, (payload) => {
                if (payload.eventType === 'INSERT') {
                    setNotifications(prev => [payload.new, ...prev]);
                } else if (payload.eventType === 'UPDATE') {
                    setNotifications(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
                } else if (payload.eventType === 'DELETE') {
                    setNotifications(prev => prev.filter(n => n.id !== payload.old.id));
                }
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [clientDetails?.email, supabase]);

    const markAsRead = async (id) => {
        // Optimistic update
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, has_read: true } : n));

        const { error } = await supabase
            .from('notifications')
            .update({ has_read: true })
            .eq('id', id);

        console.log("marked as read")

        if (error) fetchNotifications(); // Revert on error
    };

    const deleteNotification = async (id) => {
        // Optimistic update
        setNotifications(prev => prev.filter(n => n.id !== id));

        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', id);

        if (error) fetchNotifications(); // Revert on error
    };

    return (
        <ClientContext.Provider value={{
            clientDetails,
            setClientDetails,
            notifications,
            unreadCount,
            markAsRead,
            deleteNotification
        }}>
            {children}
        </ClientContext.Provider>
    );
};

export const useClient = () => {
    const context = useContext(ClientContext);
    if (!context) throw new Error("useClient must be used within a ClientProvider");
    return context;
};